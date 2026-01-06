# backend/app/services/openai_floor_plan_generator.py
"""
Azure OpenAI-powered floor plan generator.
Uses GPT-4 with RAG (Retrieval Augmented Generation) to generate
intelligent floor plans based on training data and project requirements.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from openai import AzureOpenAI
from azure.storage.blob import BlobServiceClient

logger = logging.getLogger(__name__)


class OpenAIFloorPlanGenerator:
    """Generate floor plans using Azure OpenAI GPT-4."""
    
    def __init__(self):
        # Azure OpenAI configuration
        self.endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        self.api_key = os.getenv("AZURE_OPENAI_KEY")
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4-floorplan")
        self.api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
        
        # Azure Blob Storage for training data
        self.blob_connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        self.training_container = "training-data"
        
        # Initialize OpenAI client
        if self.endpoint and self.api_key:
            self.client = AzureOpenAI(
                azure_endpoint=self.endpoint,
                api_key=self.api_key,
                api_version=self.api_version
            )
        else:
            self.client = None
            logger.warning("Azure OpenAI credentials not configured")
        
        # Initialize blob client
        if self.blob_connection_string:
            self.blob_service = BlobServiceClient.from_connection_string(
                self.blob_connection_string
            )
        
        # Cache for training examples
        self._training_data_cache = None
    
    def load_training_data(self) -> List[Dict[str, Any]]:
        """Load training examples from blob storage for RAG."""
        if self._training_data_cache is not None:
            return self._training_data_cache
        
        try:
            container_client = self.blob_service.get_container_client(self.training_container)
            blob_client = container_client.get_blob_client("processed/training_data.json")
            
            content = blob_client.download_blob().readall()
            self._training_data_cache = json.loads(content)
            
            logger.info(f"Loaded {len(self._training_data_cache)} training examples")
            return self._training_data_cache
            
        except Exception as e:
            logger.warning(f"Could not load training data: {e}")
            return []
    
    def find_similar_examples(
        self,
        project_data: Dict[str, Any],
        max_examples: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Find training examples most similar to the current project.
        Uses simple similarity scoring based on requirements match.
        """
        training_data = self.load_training_data()
        if not training_data:
            return []
        
        def similarity_score(example: Dict[str, Any]) -> float:
            """Calculate similarity score between project and training example."""
            example_input = example.get("input", {})
            score = 0.0
            
            # Bedroom match (most important)
            if example_input.get("bedrooms") == project_data.get("bedrooms"):
                score += 3.0
            elif abs(example_input.get("bedrooms", 0) - project_data.get("bedrooms", 0)) == 1:
                score += 1.5
            
            # Land size similarity
            example_area = (example_input.get("land_width", 0) * 
                          example_input.get("land_depth", 0))
            project_area = (project_data.get("land_width", 0) * 
                          project_data.get("land_depth", 0))
            if example_area > 0 and project_area > 0:
                area_ratio = min(example_area, project_area) / max(example_area, project_area)
                score += area_ratio * 2.0
            
            # Garage match
            if example_input.get("garage_spaces") == project_data.get("garage_spaces"):
                score += 1.0
            
            # Storeys match
            if example_input.get("storeys") == project_data.get("storeys"):
                score += 1.5
            
            # Style match
            if example_input.get("style", "").lower() == project_data.get("style", "").lower():
                score += 0.5
            
            return score
        
        # Sort by similarity and return top matches
        scored_examples = [(ex, similarity_score(ex)) for ex in training_data]
        scored_examples.sort(key=lambda x: x[1], reverse=True)
        
        return [ex[0] for ex in scored_examples[:max_examples]]
    
    def build_system_prompt(self) -> str:
        """Build the system prompt for floor plan generation."""
        return """You are an expert Australian residential architect AI assistant specializing in floor plan design.

Your task is to generate detailed, buildable floor plans that comply with Australian building standards (NCC) and council requirements.

When generating floor plans, you MUST:
1. Follow Australian room size minimums (bedrooms min 9m², living areas min 12m², etc.)
2. Position rooms logically (wet areas grouped, bedrooms away from living, garage accessible)
3. Ensure proper circulation (hallways, entries)
4. Consider natural light and ventilation
5. Include all required rooms based on specifications
6. Provide realistic dimensions that fit within the land constraints

Output format MUST be valid JSON with this structure:
{
    "variant_name": "string - descriptive name",
    "description": "string - brief description of the design",
    "rooms": [
        {
            "type": "string - room type (bedroom, bathroom, living, kitchen, garage, etc.)",
            "name": "string - room name (Master Bedroom, Bedroom 2, etc.)",
            "width": number - width in meters,
            "depth": number - depth in meters,
            "area": number - area in m²,
            "x": number - x position from origin,
            "y": number - y position from origin,
            "floor": number - 0 for ground, 1 for first floor
        }
    ],
    "total_area": number - total building area in m²,
    "living_area": number - living areas total in m²,
    "building_width": number - overall building width,
    "building_depth": number - overall building depth,
    "compliant": boolean - NCC compliance status,
    "compliance_notes": "string - any compliance notes",
    "design_notes": "string - key design decisions explained"
}

Room positioning rules:
- Use x,y coordinates where (0,0) is the front-left corner
- x increases to the right, y increases towards the back
- Leave 0.3-0.5m gaps between rooms for walls
- Garage typically at front
- Living areas should flow together if open_plan is true
- Master bedroom should have ensuite and WIR access"""

    def build_user_prompt(
        self,
        project_data: Dict[str, Any],
        similar_examples: List[Dict[str, Any]]
    ) -> str:
        """Build the user prompt with project requirements and examples."""
        
        # Format similar examples for context
        examples_text = ""
        if similar_examples:
            examples_text = "\n\nHere are some similar floor plan examples for reference:\n"
            for i, ex in enumerate(similar_examples, 1):
                ex_input = ex.get("input", {})
                ex_output = ex.get("output", {})
                examples_text += f"""
Example {i}: {ex_input.get('bedrooms', '?')} bed, {ex_input.get('bathrooms', '?')} bath on {ex_input.get('land_width', '?')}m x {ex_input.get('land_depth', '?')}m
Rooms: {len(ex_output.get('rooms', []))} total, {ex_output.get('total_area', '?')}m² total area
"""
        
        # Build the main prompt
        prompt = f"""Please generate a floor plan for the following project:

PROJECT REQUIREMENTS:
- Land Size: {project_data.get('land_width', 15)}m wide x {project_data.get('land_depth', 30)}m deep
- Land Area: {project_data.get('land_area', 450)}m²
- Bedrooms: {project_data.get('bedrooms', 4)}
- Bathrooms: {project_data.get('bathrooms', 2)} (including ensuites)
- Garage Spaces: {project_data.get('garage_spaces', 2)}
- Storeys: {project_data.get('storeys', 1)}
- Style: {project_data.get('style', 'modern')}
- Open Plan Living: {'Yes' if project_data.get('open_plan', True) else 'No'}
- Outdoor Entertainment Area: {'Yes' if project_data.get('outdoor_entertainment', False) else 'No'}
- Home Office: {'Yes' if project_data.get('home_office', False) else 'No'}
- Location: {project_data.get('suburb', 'Sydney')}, {project_data.get('state', 'NSW')}
- Council: {project_data.get('council', 'Local Council')}
{examples_text}

Generate a practical, buildable floor plan that maximizes the use of space while maintaining good flow and natural light. The building footprint should typically use 50-70% of the land width and 40-60% of the land depth, leaving room for setbacks and outdoor space.

Respond with ONLY the JSON output, no additional text."""

        return prompt
    
    def generate_floor_plan(
        self,
        project_data: Dict[str, Any],
        variant_style: str = "balanced"
    ) -> Optional[Dict[str, Any]]:
        """
        Generate a single floor plan variant using Azure OpenAI.
        
        Args:
            project_data: Project requirements dictionary
            variant_style: "compact", "balanced", or "spacious"
        
        Returns:
            Floor plan layout dictionary or None if generation fails
        """
        if not self.client:
            logger.error("OpenAI client not initialized")
            return None
        
        try:
            # Find similar examples for RAG
            similar_examples = self.find_similar_examples(project_data)
            
            # Modify project data based on variant style
            modified_data = project_data.copy()
            if variant_style == "compact":
                modified_data["_style_note"] = "Focus on efficiency and minimal footprint"
            elif variant_style == "spacious":
                modified_data["_style_note"] = "Maximize room sizes and add luxury features"
            
            # Build prompts
            system_prompt = self.build_system_prompt()
            user_prompt = self.build_user_prompt(modified_data, similar_examples)
            
            # Add variant-specific instruction
            if variant_style == "compact":
                user_prompt += "\n\nDesign a COMPACT variant with efficient use of space and smaller room sizes."
            elif variant_style == "spacious":
                user_prompt += "\n\nDesign a SPACIOUS/LUXURY variant with generous room sizes and premium features."
            else:
                user_prompt += "\n\nDesign a BALANCED variant with comfortable room sizes and good proportions."
            
            # Call Azure OpenAI
            logger.info(f"Calling Azure OpenAI for {variant_style} floor plan...")
            
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=4000,
                response_format={"type": "json_object"}
            )
            
            # Parse response
            content = response.choices[0].message.content
            floor_plan = json.loads(content)
            
            # Add metadata
            floor_plan["variant_style"] = variant_style
            floor_plan["generated_at"] = datetime.utcnow().isoformat()
            floor_plan["model"] = self.deployment
            floor_plan["tokens_used"] = {
                "prompt": response.usage.prompt_tokens,
                "completion": response.usage.completion_tokens,
                "total": response.usage.total_tokens
            }
            
            logger.info(f"Successfully generated {variant_style} floor plan with {len(floor_plan.get('rooms', []))} rooms")
            
            return floor_plan
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response as JSON: {e}")
            return None
        except Exception as e:
            logger.error(f"Error generating floor plan: {e}")
            return None
    
    def generate_floor_plan_variants(
        self,
        project_data: Dict[str, Any],
        num_variants: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Generate multiple floor plan variants.
        
        Returns list of floor plan dictionaries.
        """
        variants = []
        variant_styles = ["compact", "balanced", "spacious"][:num_variants]
        
        for style in variant_styles:
            floor_plan = self.generate_floor_plan(project_data, style)
            if floor_plan:
                variants.append(floor_plan)
        
        return variants


# Factory function for easy instantiation
def create_openai_generator() -> Optional[OpenAIFloorPlanGenerator]:
    """Create and return an OpenAI floor plan generator if configured."""
    generator = OpenAIFloorPlanGenerator()
    if generator.client:
        return generator
    return None
