# backend/app/services/gemini_floor_plan_service.py
"""
Gemini Floor Plan Generation Service
=====================================

Uses Google Gemini for image generation and JSON extraction.
Includes Imagen 3 as fallback for high-quality image generation.

Models Used:
- gemini-2.0-flash-exp: Text + Image generation (free tier)
- gemini-2.5-flash-image: Fast image generation (Nano Banana)
- imagen-3.0-generate-002: High quality image generation (paid)

Architecture:
1. Load sample floor plan images + JSONs as context
2. Generate floor plan IMAGE with Gemini (or Imagen 3 fallback)
3. Extract structured JSON with Gemini Vision
4. Validate against requirements (NCC compliance)
5. If validation fails, provide feedback and retry (max 5 times)
6. Return validated JSON for CAD rendering
"""

import os
import json
import base64
import logging
import time
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from io import BytesIO

# Lazy imports
genai = None
types = None
Image = None
CLIENT = None

def _ensure_imports():
    """Lazy load optional dependencies."""
    global genai, types, Image, CLIENT
    
    if genai is None:
        try:
            from google import genai as _genai
            from google.genai import types as _types
            genai = _genai
            types = _types
        except ImportError:
            raise ImportError(
                "Google Genai package not installed. "
                "Run: pip install google-genai"
            )
    
    if Image is None:
        try:
            from PIL import Image as _Image
            Image = _Image
        except ImportError:
            raise ImportError(
                "Pillow package not installed. "
                "Run: pip install pillow"
            )
    
    # Initialize client if not done
    if CLIENT is None:
        api_key = os.getenv("GOOGLE_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")
        if api_key:
            CLIENT = genai.Client(api_key=api_key)
            logger.info("Initialized Google GenAI client")

logger = logging.getLogger(__name__)

# Environment config
GOOGLE_GEMINI_API_KEY = os.getenv("GOOGLE_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")

# Model names
GEMINI_IMAGE_MODEL = "gemini-2.0-flash-exp"  # Supports image output
GEMINI_VISION_MODEL = "gemini-2.0-flash-exp"  # For JSON extraction
IMAGEN_MODEL = "imagen-3.0-generate-002"  # High quality image generation


@dataclass
class GenerationResult:
    """Result of floor plan generation."""
    success: bool
    floor_plan_json: Optional[Dict[str, Any]]
    generated_image: Optional[bytes]
    generated_image_base64: Optional[str]
    validation_passed: bool
    validation_feedback: Optional[str]
    iterations_used: int
    model_used: Optional[str] = None
    error_message: Optional[str] = None


class GeminiFloorPlanService:
    """
    Service for generating floor plans using Google Gemini and Imagen 3.
    """
    
    def __init__(self):
        self.sample_images: List[bytes] = []
        self.sample_jsons: List[Dict[str, Any]] = []
        self.max_iterations = 5
        self.model_name = GEMINI_IMAGE_MODEL
        self._initialized = False
    
    def _ensure_initialized(self):
        """Lazy initialization."""
        if self._initialized:
            return
        _ensure_imports()
        self._initialized = True
        
    def load_samples_from_blob(self, blob_service, container_name: str = "training-data"):
        """Load sample images and JSONs from Azure Blob Storage."""
        if not blob_service:
            logger.warning("No blob service available")
            return
        
        try:
            container_client = blob_service.get_container_client(container_name)
            
            blobs = list(container_client.list_blobs(name_starts_with="floor-plan/"))
            
            image_blobs = [b.name for b in blobs if b.name.lower().endswith(('.png', '.jpg', '.jpeg'))]
            json_blobs = [b.name for b in blobs if b.name.lower().endswith('.json')]
            
            image_blobs.sort()
            json_blobs.sort()
            
            # Load images (limit to 10 for context window)
            for blob_name in image_blobs[:10]:
                try:
                    blob_client = container_client.get_blob_client(blob_name)
                    data = blob_client.download_blob().readall()
                    self.sample_images.append(data)
                    logger.info(f"Loaded sample image: {blob_name}")
                except Exception as e:
                    logger.warning(f"Could not load image {blob_name}: {e}")
            
            # Load JSONs
            for blob_name in json_blobs:
                try:
                    blob_client = container_client.get_blob_client(blob_name)
                    data = blob_client.download_blob().readall()
                    sample = json.loads(data.decode('utf-8'))
                    self.sample_jsons.append(sample)
                    logger.info(f"Loaded sample JSON: {blob_name}")
                except Exception as e:
                    logger.warning(f"Could not load JSON {blob_name}: {e}")
            
            logger.info(f"Loaded {len(self.sample_images)} images and {len(self.sample_jsons)} JSONs")
            
        except Exception as e:
            logger.error(f"Failed to load samples from blob: {e}")
    
    def _build_image_generation_prompt(self, requirements: Dict[str, Any], feedback: str = None) -> str:
        """Build the prompt for floor plan image generation."""
        
        land_width = requirements.get("land_width", 14)
        land_depth = requirements.get("land_depth", 25)
        bedrooms = requirements.get("bedrooms", 4)
        bathrooms = requirements.get("bathrooms", 2)
        garage_spaces = requirements.get("garage_spaces", 2)
        has_theatre = requirements.get("has_theatre", False)
        has_study = requirements.get("has_study", False)
        has_alfresco = requirements.get("outdoor_entertainment", True)
        style = requirements.get("style", "Modern Australian")
        
        building_width = land_width - 1.8
        building_depth = land_depth - 7.5
        
        prompt = f"""Generate a professional architectural floor plan drawing for an Australian residential home.

SPECIFICATIONS:
- Building Size: {building_width:.1f}m wide × {building_depth:.1f}m deep
- Style: {style}
- {bedrooms} Bedrooms (including 1 Master Suite with Ensuite and Walk-in Robe)
- {bathrooms} Bathrooms
- {garage_spaces}-car Garage at front
- Kitchen with Pantry
- Open plan Family/Meals/Dining area
- Laundry
{"- Theatre/Media Room" if has_theatre else ""}
{"- Study/Home Office" if has_study else ""}
{"- Alfresco (outdoor living area)" if has_alfresco else ""}

LAYOUT REQUIREMENTS:
1. Garage at FRONT of house
2. Master Suite at REAR for privacy
3. Minor bedrooms clustered together with shared bathroom
4. Kitchen central, open to family area
5. All rooms properly connected with doors

DRAWING STYLE:
- Clean black lines on white background
- Room labels clearly visible inside each room
- Show door swings and openings
- Professional architectural quality
- 2D top-down view

Generate ONE complete floor plan image."""

        if feedback:
            prompt += f"""

CORRECTIONS NEEDED:
{feedback}

Please fix these issues in this generation."""

        return prompt
    
    def _build_extraction_prompt(self, requirements: Dict[str, Any]) -> str:
        """Build the prompt for Gemini Vision JSON extraction."""
        
        land_width = requirements.get("land_width", 14)
        land_depth = requirements.get("land_depth", 25)
        building_width = land_width - 1.8
        building_depth = land_depth - 7.5
        
        prompt = f"""Analyze this floor plan image and extract ALL rooms as structured JSON.

BUILDING ENVELOPE:
- Width: {building_width:.1f}m, Depth: {building_depth:.1f}m
- Origin (0,0) = Front-left corner
- X increases RIGHT, Y increases toward REAR

EXTRACT EACH ROOM WITH THIS FORMAT:
{{
  "id": "room_type_01",
  "type": "garage|porch|entry|master_bedroom|ensuite|wir|bedroom|bathroom|kitchen|pantry|family|dining|lounge|theatre|study|laundry|alfresco|powder|linen|hallway",
  "name": "Display Name",
  "x": 0.0,
  "y": 0.0,
  "width": 5.0,
  "depth": 4.0,
  "area": 20.0,
  "floor": 0,
  "doors": [{{"wall": "left|right|front|rear", "position": 1.0, "width": 820}}],
  "windows": [{{"wall": "left|right|front|rear", "position": 1.0, "width": 1.2, "height": 1.5}}],
  "features": []
}}

OUTPUT COMPLETE JSON:
{{
  "design_name": "Floor Plan",
  "rooms": [...all rooms...],
  "summary": {{
    "total_area": 0,
    "living_area": 0,
    "bedroom_count": 0,
    "bathroom_count": 0,
    "garage_spaces": 0
  }}
}}

Return ONLY valid JSON, no explanation."""

        return prompt
    
    def generate_floor_plan_image(self, requirements: Dict[str, Any], feedback: str = None) -> Tuple[Optional[bytes], Optional[str]]:
        """
        Generate a floor plan image using Gemini with image output.
        Falls back to Imagen 3 if Gemini image generation fails.
        
        Returns: (image_bytes, base64_string) or (None, None)
        """
        self._ensure_initialized()
        
        if not CLIENT:
            raise ValueError("Google API key not configured")
        
        prompt = self._build_image_generation_prompt(requirements, feedback)
        
        # Try Method 1: Gemini with image modality
        image_bytes = self._generate_with_gemini_image_modality(prompt)
        if image_bytes:
            self.model_name = GEMINI_IMAGE_MODEL
            return image_bytes, base64.b64encode(image_bytes).decode('utf-8')
        
        # Try Method 2: Imagen 3 (paid, high quality)
        image_bytes = self._generate_with_imagen3(prompt)
        if image_bytes:
            self.model_name = IMAGEN_MODEL
            return image_bytes, base64.b64encode(image_bytes).decode('utf-8')
        
        logger.warning("All image generation methods failed")
        return None, None
    
    def _generate_with_gemini_image_modality(self, prompt: str) -> Optional[bytes]:
        """Generate image using Gemini with response_modalities=['Image']."""
        try:
            logger.info(f"Generating image with {GEMINI_IMAGE_MODEL}...")
            
            # Build content with sample images for context
            contents = []
            
            if self.sample_images:
                contents.append("Study these professional floor plan examples for style reference:")
                for img_bytes in self.sample_images[:3]:
                    try:
                        img = Image.open(BytesIO(img_bytes))
                        contents.append(img)
                    except:
                        pass
            
            contents.append(prompt)
            
            response = CLIENT.models.generate_content(
                model=GEMINI_IMAGE_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_modalities=['TEXT', 'IMAGE'],
                    temperature=0.7,
                )
            )
            
            # Extract image from response
            if response.candidates and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        image_data = part.inline_data.data
                        if isinstance(image_data, str):
                            image_bytes = base64.b64decode(image_data)
                        else:
                            image_bytes = bytes(image_data) if not isinstance(image_data, bytes) else image_data
                        
                        logger.info("Successfully generated image with Gemini")
                        return image_bytes
            
            logger.warning("Gemini returned no image in response")
            return None
            
        except Exception as e:
            logger.warning(f"Gemini image generation failed: {e}")
            return None
    
    def _generate_with_imagen3(self, prompt: str) -> Optional[bytes]:
        """Generate image using Imagen 3 model."""
        try:
            logger.info(f"Generating image with {IMAGEN_MODEL}...")
            
            response = CLIENT.models.generate_image(
                model=IMAGEN_MODEL,
                prompt=prompt,
                config=types.GenerateImageConfig(
                    number_of_images=1,
                    output_mime_type='image/png',
                    aspect_ratio='4:3',
                )
            )
            
            if response.generated_images and len(response.generated_images) > 0:
                # Get image data
                generated_image = response.generated_images[0]
                
                # Save to bytes
                img_buffer = BytesIO()
                generated_image.image.save(img_buffer, format='PNG')
                image_bytes = img_buffer.getvalue()
                
                logger.info("Successfully generated image with Imagen 3")
                return image_bytes
            
            logger.warning("Imagen 3 returned no images")
            return None
            
        except Exception as e:
            logger.warning(f"Imagen 3 generation failed: {e}")
            return None
    
    def extract_json_from_image(self, image_bytes: bytes, requirements: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract structured JSON from a floor plan image using Gemini Vision."""
        self._ensure_initialized()
        
        if not CLIENT:
            raise ValueError("Google API key not configured")
        
        try:
            img = Image.open(BytesIO(image_bytes))
            prompt = self._build_extraction_prompt(requirements)
            
            logger.info("Extracting JSON from floor plan image...")
            
            response = CLIENT.models.generate_content(
                model=GEMINI_VISION_MODEL,
                contents=[prompt, img],
                config=types.GenerateContentConfig(
                    temperature=0.2,
                )
            )
            
            response_text = response.text.strip()
            
            # Clean markdown
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()
            
            floor_plan = json.loads(response_text)
            floor_plan = self._sanitize_floor_plan(floor_plan)
            
            logger.info(f"Extracted {len(floor_plan.get('rooms', []))} rooms from image")
            return floor_plan
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON: {e}")
            return None
        except Exception as e:
            logger.error(f"JSON extraction failed: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _sanitize_floor_plan(self, floor_plan: Dict[str, Any]) -> Dict[str, Any]:
        """Sanitize and validate floor plan data."""
        rooms = floor_plan.get("rooms", [])
        
        for room in rooms:
            width = room.get("width", 0)
            depth = room.get("depth", 0)
            
            if "area" not in room:
                room["area"] = round(width * depth, 1)
            if "floor" not in room:
                room["floor"] = 0
            
            # Sanitize doors/windows
            for field in ["doors", "windows", "features"]:
                if field not in room:
                    room[field] = []
                elif isinstance(room[field], str):
                    room[field] = []
                elif isinstance(room[field], list):
                    room[field] = [x for x in room[field] if isinstance(x, dict)]
        
        # Ensure summary
        if "summary" not in floor_plan:
            total_area = sum(r.get("area", 0) for r in rooms)
            bedroom_count = sum(1 for r in rooms if r.get("type") in ["bedroom", "master_bedroom"])
            bathroom_count = sum(1 for r in rooms if r.get("type") in ["bathroom", "ensuite", "powder"])
            living_area = sum(r.get("area", 0) for r in rooms if r.get("type") in ["family", "lounge", "dining", "kitchen"])
            
            floor_plan["summary"] = {
                "total_area": round(total_area, 1),
                "living_area": round(living_area, 1),
                "bedroom_count": bedroom_count,
                "bathroom_count": bathroom_count,
                "garage_spaces": 2
            }
        
        return floor_plan
    
    def generate_with_validation_loop(
        self, 
        requirements: Dict[str, Any],
        validator
    ) -> GenerationResult:
        """Generate floor plan with self-correcting validation loop."""
        
        best_result = None
        best_score = 0
        feedback = None
        generated_image = None
        generated_image_b64 = None
        
        for iteration in range(self.max_iterations):
            logger.info(f"Generation iteration {iteration + 1}/{self.max_iterations}")
            
            # Try image generation first
            image_bytes, image_b64 = self.generate_floor_plan_image(requirements, feedback)
            
            if image_bytes:
                generated_image = image_bytes
                generated_image_b64 = image_b64
                
                # Extract JSON from image
                floor_plan = self.extract_json_from_image(image_bytes, requirements)
                
                if not floor_plan:
                    logger.warning(f"Iteration {iteration + 1}: JSON extraction failed")
                    feedback = "Could not extract room data. Generate clearer floor plan with distinct room labels."
                    continue
            else:
                # Fallback to direct JSON generation
                logger.warning(f"Iteration {iteration + 1}: Image generation failed, using direct JSON")
                floor_plan = self._generate_json_directly(requirements, feedback)
                
                if not floor_plan:
                    feedback = "Failed to generate floor plan. Create complete layout with all required rooms."
                    continue
            
            # Validate
            validation_result = validator.validate(floor_plan, requirements)
            
            logger.info(f"Iteration {iteration + 1}: score={validation_result.score:.1f}, passed={validation_result.passed}")
            
            # Track best result
            if validation_result.score > best_score:
                best_score = validation_result.score
                best_result = GenerationResult(
                    success=True,
                    floor_plan_json=floor_plan,
                    generated_image=generated_image,
                    generated_image_base64=generated_image_b64,
                    validation_passed=validation_result.passed,
                    validation_feedback=validation_result.feedback,
                    iterations_used=iteration + 1,
                    model_used=self.model_name
                )
            
            if validation_result.passed:
                logger.info(f"Validation passed on iteration {iteration + 1}")
                return GenerationResult(
                    success=True,
                    floor_plan_json=floor_plan,
                    generated_image=generated_image,
                    generated_image_base64=generated_image_b64,
                    validation_passed=True,
                    validation_feedback=None,
                    iterations_used=iteration + 1,
                    model_used=self.model_name
                )
            
            feedback = validation_result.feedback
        
        if best_result:
            logger.warning(f"Max iterations reached. Best score: {best_score:.1f}")
            return best_result
        
        return GenerationResult(
            success=False,
            floor_plan_json=None,
            generated_image=None,
            generated_image_base64=None,
            validation_passed=False,
            validation_feedback="Failed to generate valid floor plan",
            iterations_used=self.max_iterations,
            model_used=self.model_name,
            error_message="Generation failed after max iterations"
        )
    
    def _generate_json_directly(self, requirements: Dict[str, Any], feedback: str = None) -> Optional[Dict[str, Any]]:
        """Fallback: Generate JSON directly without image generation."""
        self._ensure_initialized()
        
        if not CLIENT:
            return None
        
        try:
            content_parts = []
            
            # Add sample images
            if self.sample_images:
                content_parts.append("Study these professional Australian floor plan examples:")
                for img_bytes in self.sample_images[:3]:
                    try:
                        img = Image.open(BytesIO(img_bytes))
                        content_parts.append(img)
                    except:
                        pass
            
            # Add sample JSONs
            if self.sample_jsons:
                content_parts.append("\n\nHere are JSON representations of similar floor plans:")
                for sample in self.sample_jsons[:2]:
                    content_parts.append(json.dumps(sample, indent=2))
            
            prompt = self._build_direct_generation_prompt(requirements, feedback)
            content_parts.append(prompt)
            
            logger.info("Generating floor plan JSON directly...")
            
            response = CLIENT.models.generate_content(
                model=GEMINI_VISION_MODEL,
                contents=content_parts,
                config=types.GenerateContentConfig(
                    temperature=0.5,
                )
            )
            
            response_text = response.text.strip()
            
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            
            floor_plan = json.loads(response_text.strip())
            return self._sanitize_floor_plan(floor_plan)
            
        except Exception as e:
            logger.error(f"Direct JSON generation failed: {e}")
            return None
    
    def _build_direct_generation_prompt(self, requirements: Dict[str, Any], feedback: str = None) -> str:
        """Build prompt for direct JSON generation."""
        
        land_width = requirements.get("land_width", 14)
        land_depth = requirements.get("land_depth", 25)
        building_width = land_width - 1.8
        building_depth = land_depth - 7.5
        bedrooms = requirements.get("bedrooms", 4)
        bathrooms = requirements.get("bathrooms", 2)
        garage_spaces = requirements.get("garage_spaces", 2)
        has_theatre = requirements.get("has_theatre", False)
        has_study = requirements.get("has_study", False)
        has_alfresco = requirements.get("outdoor_entertainment", True)
        
        prompt = f"""Generate a floor plan as JSON based on the samples.

REQUIREMENTS:
- Envelope: {building_width:.1f}m × {building_depth:.1f}m
- Bedrooms: {bedrooms} (1 Master with Ensuite + WIR)
- Bathrooms: {bathrooms}
- Garage: {garage_spaces}-car at front
{"- Theatre Room" if has_theatre else ""}
{"- Study" if has_study else ""}
{"- Alfresco" if has_alfresco else ""}

RULES:
1. Master + Ensuite + WIR must be ADJACENT
2. Kitchen adjacent to family
3. Garage at front (Y=0)
4. NO overlapping rooms
5. All rooms within envelope

Return ONLY JSON:
{{
  "design_name": "...",
  "rooms": [...],
  "summary": {{...}}
}}"""

        if feedback:
            prompt += f"\n\nCORRECTIONS:\n{feedback}"
        
        return prompt


def create_gemini_service() -> GeminiFloorPlanService:
    """Create and return a GeminiFloorPlanService instance."""
    return GeminiFloorPlanService()
