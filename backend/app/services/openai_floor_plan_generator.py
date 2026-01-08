# backend/app/services/openai_floor_plan_generator.py
"""
Azure OpenAI-powered floor plan generator.
Generates a single, professional floor plan based on project requirements.
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
    """Generate professional floor plans using Azure OpenAI GPT-4."""
    
    def __init__(self):
        # Azure OpenAI configuration
        self.endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        self.api_key = os.getenv("AZURE_OPENAI_KEY")
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4.1")
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
            logger.info(f"OpenAI client initialized with deployment: {self.deployment}")
        else:
            self.client = None
            logger.warning("Azure OpenAI credentials not configured")
        
        # Initialize blob client
        self.blob_service = None
        if self.blob_connection_string:
            try:
                self.blob_service = BlobServiceClient.from_connection_string(
                    self.blob_connection_string
                )
            except Exception as e:
                logger.warning(f"Could not initialize blob service: {e}")
        
        # Cache for training examples
        self._training_data_cache = None
    
    def load_training_data(self) -> List[Dict[str, Any]]:
        """Load training examples from blob storage for context."""
        if self._training_data_cache is not None:
            return self._training_data_cache
        
        if not self.blob_service:
            logger.warning("Blob service not available, using empty training data")
            return []
        
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
    
    def build_system_prompt(self) -> str:
        """Build the system prompt for professional floor plan generation."""
        return """You are an expert Australian residential architect AI specializing in creating detailed, buildable floor plans.

Your task is to generate ONE comprehensive floor plan that:
1. Follows Australian Building Code (NCC) requirements
2. Maximizes functionality and flow
3. Positions rooms logically based on Australian home design principles
4. Includes all necessary rooms with realistic dimensions

CRITICAL DESIGN PRINCIPLES:
- Garage should be at the front, accessible from the street
- Entry/foyer should connect garage to living areas
- Living areas (family, dining, kitchen) should flow together as open plan
- Kitchen should have butler's pantry access if space allows
- Bedrooms should be grouped together, away from living areas
- Master suite should have ensuite and walk-in robe
- Wet areas (bathrooms, laundry) should be grouped for plumbing efficiency
- Outdoor areas (alfresco, patio) should connect to living/dining
- Consider traffic flow and minimize hallway space

ROOM SIZE GUIDELINES (Australian standards):
- Master Bedroom: 16-25m² (plus ensuite 6-10m², WIR 4-8m²)
- Secondary Bedrooms: 10-14m²
- Living/Family: 20-35m²
- Kitchen: 12-20m²
- Dining: 12-18m²
- Home Theatre: 15-25m²
- Double Garage: 36-42m²
- Laundry: 4-8m²
- Bathrooms: 5-9m²
- Study/Office: 9-15m²
- Butler's Pantry: 4-8m²
- Alfresco: 15-30m²

OUTPUT FORMAT - You MUST return valid JSON with this exact structure:
{
    "design_name": "string - descriptive name for this design",
    "description": "string - brief description of design philosophy",
    "land_utilization": {
        "building_width": number,
        "building_depth": number,
        "building_footprint": number,
        "land_coverage_percent": number
    },
    "rooms": [
        {
            "id": "string - unique room ID like 'garage_01'",
            "type": "string - room type",
            "name": "string - display name",
            "width": number (meters),
            "depth": number (meters),
            "area": number (m²),
            "x": number (meters from left edge),
            "y": number (meters from front edge),
            "floor": number (0=ground, 1=first),
            "connections": ["array of room IDs this room connects to"],
            "features": ["array of features like 'island bench', 'fireplace', etc."],
            "windows": [{"wall": "north/south/east/west", "width": number}],
            "doors": [{"to": "room_id or 'exterior'", "type": "standard/sliding/double"}]
        }
    ],
    "circulation": {
        "hallways": [
            {"from": "room_id", "to": "room_id", "width": number}
        ],
        "stairs": [] // for two-storey only
    },
    "summary": {
        "total_area": number,
        "living_area": number,
        "bedroom_count": number,
        "bathroom_count": number,
        "garage_spaces": number,
        "outdoor_area": number
    },
    "compliance": {
        "ncc_compliant": true,
        "notes": ["array of compliance notes"]
    }
}

Position rooms using x,y coordinates where (0,0) is front-left corner of building envelope.
- x increases to the right
- y increases towards the back of the lot
- Leave appropriate gaps for walls (typically 0.1m internal, 0.2m external)"""

    def build_user_prompt(self, project_data: Dict[str, Any], training_examples: List[Dict]) -> str:
        """Build the user prompt with project requirements and reference examples."""
        
        # Format reference example if available
        reference_text = ""
        if training_examples:
            best_example = training_examples[0]  # Use most relevant
            ex_output = best_example.get("output", {})
            room_summary = []
            for room in ex_output.get("rooms", [])[:10]:  # First 10 rooms
                room_summary.append(f"  - {room.get('name')}: {room.get('width')}m x {room.get('depth')}m")
            
            reference_text = f"""

REFERENCE DESIGN (use as inspiration for layout approach):
A similar {best_example.get('input', {}).get('bedrooms', '?')} bedroom design included:
{chr(10).join(room_summary)}
Total area: {ex_output.get('total_area', '?')}m²
"""
        
        prompt = f"""Generate a detailed floor plan for this project:

PROJECT REQUIREMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Land Size: {project_data.get('land_width', 18)}m (width) × {project_data.get('land_depth', 30)}m (depth)
Land Area: {project_data.get('land_area', 540)}m²
Location: {project_data.get('suburb', 'Sydney')}, {project_data.get('state', 'NSW')}
Council: {project_data.get('council', 'Local Council')}

REQUIRED SPACES:
• Bedrooms: {project_data.get('bedrooms', 4)}
• Bathrooms: {project_data.get('bathrooms', 2.5)} (including ensuites)
• Garage: {project_data.get('garage_spaces', 2)} car spaces
• Storeys: {project_data.get('storeys', 1)}
• Style: {project_data.get('style', 'modern')}

DESIGN PREFERENCES:
• Open Plan Living: {'Yes - combine family/dining/kitchen' if project_data.get('open_plan', True) else 'No - separate rooms'}
• Outdoor Entertainment: {'Yes - include alfresco area' if project_data.get('outdoor_entertainment', True) else 'No'}
• Home Office/Study: {'Yes - dedicated study room' if project_data.get('home_office', True) else 'No'}
{reference_text}
DESIGN CONSTRAINTS:
• Building should use approximately 60-70% of land width
• Front setback: minimum 4.5m (for garage and entry)
• Side setbacks: minimum 0.9m each side
• Rear setback: minimum 3m
• Maximum building footprint: ~{int(project_data.get('land_area', 540) * 0.5)}m² per floor

Generate ONE comprehensive floor plan optimized for Australian family living.
Ensure all rooms connect logically and the design maximizes natural light and flow.

Return ONLY the JSON output, no additional text or markdown."""

        return prompt
    
    def generate_floor_plan(self, project_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Generate a single professional floor plan using Azure OpenAI.
        
        Args:
            project_data: Project requirements dictionary
        
        Returns:
            Floor plan layout dictionary or None if generation fails
        """
        if not self.client:
            logger.error("OpenAI client not initialized")
            return None
        
        try:
            # Load training examples for context
            training_examples = self.load_training_data()
            
            # Find most relevant example
            relevant_examples = self._find_similar_examples(project_data, training_examples)
            
            # Build prompts
            system_prompt = self.build_system_prompt()
            user_prompt = self.build_user_prompt(project_data, relevant_examples)
            
            logger.info(f"Calling Azure OpenAI ({self.deployment}) for floor plan generation...")
            
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=8000,
                response_format={"type": "json_object"}
            )
            
            # Parse response
            content = response.choices[0].message.content
            floor_plan = json.loads(content)
            
            # Add metadata
            floor_plan["generated_at"] = datetime.utcnow().isoformat()
            floor_plan["ai_model"] = self.deployment
            floor_plan["generation_metadata"] = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }
            
            # Validate and fix the floor plan
            floor_plan = self._validate_and_fix(floor_plan, project_data)
            
            logger.info(f"Successfully generated floor plan with {len(floor_plan.get('rooms', []))} rooms")
            
            return floor_plan
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response as JSON: {e}")
            return None
        except Exception as e:
            logger.error(f"Error generating floor plan: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _find_similar_examples(
        self,
        project_data: Dict[str, Any],
        training_data: List[Dict]
    ) -> List[Dict[str, Any]]:
        """Find training examples most similar to the current project."""
        if not training_data:
            return []
        
        def similarity_score(example: Dict) -> float:
            ex_input = example.get("input", {})
            score = 0.0
            
            # Bedroom match (most important)
            bed_diff = abs(ex_input.get("bedrooms", 0) - project_data.get("bedrooms", 4))
            score += max(0, 5 - bed_diff * 2)
            
            # Storey match
            if ex_input.get("storeys") == project_data.get("storeys"):
                score += 3
            
            # Land size similarity
            ex_area = ex_input.get("land_area", 0)
            proj_area = project_data.get("land_area", 450)
            if ex_area > 0 and proj_area > 0:
                ratio = min(ex_area, proj_area) / max(ex_area, proj_area)
                score += ratio * 2
            
            return score
        
        sorted_examples = sorted(training_data, key=similarity_score, reverse=True)
        return sorted_examples[:2]
    
    def _validate_and_fix(
        self,
        floor_plan: Dict[str, Any],
        project_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Validate the generated floor plan and fix common issues."""
        
        rooms = floor_plan.get("rooms", [])
        
        # Ensure all rooms have required fields
        for room in rooms:
            if "area" not in room and "width" in room and "depth" in room:
                room["area"] = round(room["width"] * room["depth"], 1)
            if "floor" not in room:
                room["floor"] = 0
            if "id" not in room:
                room["id"] = f"{room.get('type', 'room')}_{rooms.index(room):02d}"
        
        # Calculate summary if missing
        if "summary" not in floor_plan:
            total_area = sum(r.get("area", 0) for r in rooms)
            living_types = ["living", "family", "kitchen", "dining", "kitchen_dining", "open_plan"]
            living_area = sum(r.get("area", 0) for r in rooms if r.get("type") in living_types)
            bedroom_count = sum(1 for r in rooms if r.get("type") == "bedroom")
            bathroom_types = ["bathroom", "ensuite", "powder"]
            bathroom_count = sum(1 for r in rooms if r.get("type") in bathroom_types)
            
            floor_plan["summary"] = {
                "total_area": round(total_area, 1),
                "living_area": round(living_area, 1),
                "bedroom_count": bedroom_count,
                "bathroom_count": bathroom_count,
                "garage_spaces": project_data.get("garage_spaces", 2),
                "outdoor_area": sum(r.get("area", 0) for r in rooms if r.get("type") in ["alfresco", "patio", "balcony"])
            }
        
        return floor_plan


def create_openai_generator() -> Optional[OpenAIFloorPlanGenerator]:
    """Create and return an OpenAI floor plan generator if configured."""
    generator = OpenAIFloorPlanGenerator()
    if generator.client:
        return generator
    return None
