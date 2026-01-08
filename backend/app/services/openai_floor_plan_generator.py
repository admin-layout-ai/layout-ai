# backend/app/services/openai_floor_plan_generator.py
"""
Azure OpenAI-powered floor plan generator with integrated CAD rendering.
Generates professional floor plans and renders them as CAD-quality images.

File Storage Path: floor-plans/{User Name}/{Project Name}/{Plan - plan_id}/
"""

import os
import io
import json
import logging
import uuid
import re
from typing import Dict, Any, List, Optional
from datetime import datetime
from openai import AzureOpenAI
from azure.storage.blob import BlobServiceClient, ContentSettings

logger = logging.getLogger(__name__)


def sanitize_path(name: str) -> str:
    """Sanitize a string for use in file/blob paths."""
    if not name:
        return "unknown"
    # Replace spaces with underscores, remove special characters
    sanitized = re.sub(r'[^\w\s-]', '', name)
    sanitized = re.sub(r'[\s]+', '_', sanitized)
    return sanitized[:50]  # Limit length


class OpenAIFloorPlanGenerator:
    """Generate professional floor plans using Azure OpenAI GPT-4 with CAD rendering."""
    
    def __init__(self):
        # Azure OpenAI configuration
        self.endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        self.api_key = os.getenv("AZURE_OPENAI_KEY")
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4.1")
        self.api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
        
        # Azure Blob Storage
        self.blob_connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        self.training_container = "training-data"
        self.output_container = "floor-plans"
        self.storage_account_name = os.getenv("AZURE_STORAGE_ACCOUNT", "layoutaistorage")
        
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
                self._ensure_container_exists(self.output_container)
            except Exception as e:
                logger.warning(f"Could not initialize blob service: {e}")
        
        self._training_data_cache = None
    
    def _ensure_container_exists(self, container_name: str):
        """Ensure blob container exists with public access."""
        try:
            container_client = self.blob_service.get_container_client(container_name)
            if not container_client.exists():
                container_client.create_container(public_access='blob')
                logger.info(f"Created container: {container_name}")
        except Exception as e:
            logger.warning(f"Could not create container {container_name}: {e}")
    
    def load_training_data(self) -> List[Dict[str, Any]]:
        """Load training examples from blob storage."""
        if self._training_data_cache is not None:
            return self._training_data_cache
        
        if not self.blob_service:
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
        """Build the system prompt for floor plan generation."""
        return """You are an expert Australian residential architect AI. Generate buildable floor plans with PRECISE room positioning.

CRITICAL POSITIONING RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ROOMS MUST SHARE WALLS - Adjacent rooms share a common wall edge. NO GAPS between rooms.
2. Use a GRID SYSTEM - Position rooms on a grid where edges align perfectly.
3. Coordinates are in METERS from the front-left corner (0,0).
4. x increases RIGHT, y increases toward BACK of lot.

BUILDING LAYOUT ZONES (front to back):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ZONE 1 (y: 0-7m) - FRONT: Garage, Entry, Study
ZONE 2 (y: 7-15m) - LIVING: Family, Kitchen, Dining, Pantry
ZONE 3 (y: 12-22m) - BEDROOMS: Master Suite, Secondary Bedrooms, Bathroom, Laundry
ZONE 4 (y: 18-25m) - REAR: Alfresco

ROOM SIZE STANDARDS (Australian):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Double Garage: 6.0m × 6.0m
• Entry/Foyer: 2.0m × 2.5m
• Open Plan Living: 6.0m × 5.0m
• Kitchen: 4.0m × 4.0m
• Dining: 4.0m × 3.5m
• Pantry: 2.0m × 2.5m
• Master Bedroom: 4.0m × 4.5m
• Master Ensuite: 3.0m × 2.5m
• Walk-in Robe: 2.5m × 2.5m
• Bedroom 2-4: 3.5m × 3.2m
• Main Bathroom: 3.0m × 2.5m
• Laundry: 2.5m × 2.0m
• Study: 3.0m × 3.0m
• Alfresco: 5.0m × 4.0m

DOOR SPECIFICATIONS:
Include doors with: "doors": [{"to": "room_id", "type": "single/double/sliding/bifold/garage", "wall": "north/south/east/west", "position": 0.3}]

WINDOW SPECIFICATIONS:
Include windows on EXTERNAL walls: "windows": [{"wall": "north/south/east/west", "width": 1500, "position": 0.5}]

OUTPUT JSON STRUCTURE:
{
    "design_name": "Descriptive name",
    "description": "Design philosophy",
    "rooms": [
        {
            "id": "garage_01",
            "type": "garage",
            "name": "Double Garage",
            "x": 0, "y": 0,
            "width": 6.0, "depth": 6.0,
            "area": 36.0,
            "floor": 0,
            "doors": [...],
            "windows": [...],
            "features": [...]
        }
    ],
    "summary": {
        "total_area": number,
        "living_area": number,
        "bedroom_count": number,
        "bathroom_count": number,
        "garage_spaces": number
    }
}"""

    def build_user_prompt(self, project_data: Dict[str, Any]) -> str:
        """Build the user prompt with project requirements."""
        land_width = project_data.get('land_width', 18)
        land_depth = project_data.get('land_depth', 30)
        land_area = project_data.get('land_area', land_width * land_depth)
        bedrooms = project_data.get('bedrooms', 4)
        
        building_width = min(land_width - 1.8, land_width * 0.65)
        building_depth = min(land_depth - 7.5, land_depth * 0.75)
        
        room_requirements = [
            "• 1 × Double Garage (6.0m × 6.0m)",
            "• 1 × Entry/Foyer",
            "• 1 × Open Plan Living/Family",
            "• 1 × Kitchen",
            "• 1 × Dining Area",
        ]
        
        if project_data.get('home_office', True):
            room_requirements.append("• 1 × Study/Home Office")
        
        room_requirements.extend([
            "• 1 × Master Bedroom with Ensuite and Walk-in Robe",
            f"• {bedrooms - 1} × Secondary Bedrooms",
            "• 1 × Main Bathroom",
            "• 1 × Laundry",
        ])
        
        if project_data.get('outdoor_entertainment', True):
            room_requirements.append("• 1 × Alfresco")
        
        if bedrooms >= 4:
            room_requirements.append("• 1 × Walk-in Pantry")
        
        return f"""Design a floor plan for this Australian home:

PROJECT BRIEF:
Land Size: {land_width}m × {land_depth}m ({land_area}m²)
Location: {project_data.get('suburb', 'Sydney')}, {project_data.get('state', 'NSW')}
Style: {project_data.get('style', 'Modern')} single-storey home

BUILDING ENVELOPE:
• Maximum Width: {building_width:.1f}m
• Maximum Depth: {building_depth:.1f}m

REQUIRED ROOMS:
{chr(10).join(room_requirements)}

LAYOUT REQUIREMENTS:
1. Garage at FRONT LEFT (x=0, y=0)
2. Entry connects garage to living
3. Living/Kitchen/Dining as connected open plan
4. Bedroom wing SEPARATE from living
5. Master suite at far end for privacy
6. Alfresco at REAR connecting to living

CRITICAL: Position rooms so they SHARE WALLS (no gaps).

Return ONLY valid JSON."""

    def generate_floor_plan(
        self, 
        project_data: Dict[str, Any],
        project_id: int = None,
        plan_id: int = None,
        user_name: str = None,
        project_name: str = None,
        render_image: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Generate a floor plan and optionally render CAD images.
        
        Args:
            project_data: Project requirements
            project_id: Project ID
            plan_id: Floor plan ID (for file naming)
            user_name: User's name (for folder structure)
            project_name: Project name (for folder structure)
            render_image: Whether to render CAD PDF/PNG
        
        Returns:
            Floor plan dict with layout and rendered_images URLs
        """
        if not self.client:
            logger.error("OpenAI client not initialized")
            return None
        
        try:
            training_examples = self.load_training_data()
            system_prompt = self.build_system_prompt()
            user_prompt = self.build_user_prompt(project_data)
            
            logger.info(f"Calling Azure OpenAI ({self.deployment})...")
            
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.5,
                max_tokens=8000,
                response_format={"type": "json_object"}
            )
            
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
            
            # Validate and fix
            floor_plan = self._validate_and_fix(floor_plan, project_data)
            floor_plan = self._fix_room_gaps(floor_plan)
            
            # Render CAD images with proper path structure
            if render_image:
                try:
                    image_urls = self._render_cad_images(
                        layout_data=floor_plan,
                        project_name=project_name or project_data.get('name', 'Floor Plan'),
                        project_details=project_data,
                        user_name=user_name,
                        project_id=project_id,
                        plan_id=plan_id
                    )
                    floor_plan["rendered_images"] = image_urls
                    logger.info(f"Rendered CAD images: {image_urls}")
                except Exception as e:
                    logger.error(f"Failed to render CAD images: {e}")
                    import traceback
                    traceback.print_exc()
                    floor_plan["rendered_images"] = {}
            
            logger.info(f"Generated floor plan with {len(floor_plan.get('rooms', []))} rooms")
            return floor_plan
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response: {e}")
            return None
        except Exception as e:
            logger.error(f"Error generating floor plan: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _render_cad_images(
        self, 
        layout_data: Dict[str, Any],
        project_name: str,
        project_details: Dict[str, Any],
        user_name: str = None,
        project_id: int = None,
        plan_id: int = None
    ) -> Dict[str, str]:
        """
        Render floor plan as CAD PDF and PNG, upload to blob storage.
        
        Path structure: floor-plans/{User Name}/{Project Name}/{Plan - plan_id}/
        
        Returns:
            Dict with URLs: {"pdf": "...", "png": "...", "thumbnail": "..."}
        """
        from .cad_generator import generate_cad_floor_plan_pdf
        
        urls = {}
        
        if not self.blob_service:
            logger.warning("Blob service not available")
            return urls
        
        # Build folder path: {User Name}/{Project Name}/{Plan - plan_id}/
        user_folder = sanitize_path(user_name) if user_name else "unknown_user"
        project_folder = sanitize_path(project_name) if project_name else f"project_{project_id or 'unknown'}"
        plan_folder = f"Plan_{plan_id}" if plan_id else f"Plan_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        
        base_path = f"{user_folder}/{project_folder}/{plan_folder}"
        
        logger.info(f"Saving floor plan files to: {self.output_container}/{base_path}/")
        
        # Generate PDF
        pdf_bytes = generate_cad_floor_plan_pdf(layout_data, project_name, project_details)
        
        # Upload PDF
        pdf_blob_name = f"{base_path}/floor_plan.pdf"
        pdf_url = self._upload_to_blob(pdf_bytes, pdf_blob_name, "application/pdf")
        if pdf_url:
            urls["pdf"] = pdf_url
            logger.info(f"Uploaded PDF: {pdf_url}")
        
        # Convert PDF to PNG
        try:
            png_bytes = self._pdf_to_png(pdf_bytes)
            if png_bytes:
                # Full size PNG
                png_blob_name = f"{base_path}/floor_plan.png"
                png_url = self._upload_to_blob(png_bytes, png_blob_name, "image/png")
                if png_url:
                    urls["png"] = png_url
                    logger.info(f"Uploaded PNG: {png_url}")
                
                # Thumbnail
                thumb_bytes = self._create_thumbnail(png_bytes, max_size=400)
                if thumb_bytes:
                    thumb_blob_name = f"{base_path}/floor_plan_thumb.png"
                    thumb_url = self._upload_to_blob(thumb_bytes, thumb_blob_name, "image/png")
                    if thumb_url:
                        urls["thumbnail"] = thumb_url
                        logger.info(f"Uploaded thumbnail: {thumb_url}")
        except Exception as e:
            logger.warning(f"Could not convert PDF to PNG: {e}")
        
        return urls
    
    def _upload_to_blob(self, data: bytes, blob_name: str, content_type: str) -> Optional[str]:
        """Upload data to blob storage and return public URL."""
        try:
            container_client = self.blob_service.get_container_client(self.output_container)
            blob_client = container_client.get_blob_client(blob_name)
            
            blob_client.upload_blob(
                data,
                overwrite=True,
                content_settings=ContentSettings(content_type=content_type)
            )
            
            url = f"https://{self.storage_account_name}.blob.core.windows.net/{self.output_container}/{blob_name}"
            return url
            
        except Exception as e:
            logger.error(f"Failed to upload blob {blob_name}: {e}")
            return None
    
    def _pdf_to_png(self, pdf_bytes: bytes, dpi: int = 150) -> Optional[bytes]:
        """Convert PDF to PNG image."""
        # Try PyMuPDF first
        try:
            import fitz
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page = doc[0]
            mat = fitz.Matrix(dpi/72, dpi/72)
            pix = page.get_pixmap(matrix=mat)
            png_bytes = pix.tobytes("png")
            doc.close()
            return png_bytes
        except ImportError:
            logger.warning("PyMuPDF not available")
        except Exception as e:
            logger.warning(f"PyMuPDF conversion failed: {e}")
        
        # Try pdf2image
        try:
            from pdf2image import convert_from_bytes
            images = convert_from_bytes(pdf_bytes, dpi=dpi, first_page=1, last_page=1)
            if images:
                img_buffer = io.BytesIO()
                images[0].save(img_buffer, format='PNG', optimize=True)
                img_buffer.seek(0)
                return img_buffer.getvalue()
        except ImportError:
            logger.warning("pdf2image not available")
        except Exception as e:
            logger.warning(f"pdf2image conversion failed: {e}")
        
        return None
    
    def _create_thumbnail(self, png_bytes: bytes, max_size: int = 400) -> Optional[bytes]:
        """Create thumbnail from PNG."""
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(png_bytes))
            ratio = min(max_size / img.width, max_size / img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img.thumbnail(new_size, Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=True)
            buffer.seek(0)
            return buffer.getvalue()
        except Exception as e:
            logger.warning(f"Thumbnail creation failed: {e}")
            return None
    
    def _validate_and_fix(self, floor_plan: Dict[str, Any], project_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and fix the generated floor plan."""
        rooms = floor_plan.get("rooms", [])
        
        for i, room in enumerate(rooms):
            if "area" not in room and "width" in room and "depth" in room:
                room["area"] = round(room["width"] * room["depth"], 1)
            if "floor" not in room:
                room["floor"] = 0
            if "id" not in room:
                room["id"] = f"{room.get('type', 'room')}_{i:02d}"
            if "x" not in room:
                room["x"] = 0
            if "y" not in room:
                room["y"] = 0
            if "doors" not in room:
                room["doors"] = []
            if "windows" not in room:
                room["windows"] = []
        
        if "summary" not in floor_plan:
            total_area = sum(r.get("area", 0) for r in rooms)
            living_types = ["living", "family", "kitchen", "dining"]
            living_area = sum(r.get("area", 0) for r in rooms 
                           if any(t in r.get("type", "").lower() for t in living_types))
            bedroom_count = sum(1 for r in rooms if "bedroom" in r.get("type", "").lower())
            bathroom_count = sum(1 for r in rooms 
                               if any(t in r.get("type", "").lower() for t in ["bathroom", "ensuite", "powder"]))
            
            floor_plan["summary"] = {
                "total_area": round(total_area, 1),
                "living_area": round(living_area, 1),
                "bedroom_count": bedroom_count,
                "bathroom_count": bathroom_count,
                "garage_spaces": project_data.get("garage_spaces", 2),
            }
        
        floor_plan["rooms"] = rooms
        return floor_plan
    
    def _fix_room_gaps(self, floor_plan: Dict[str, Any]) -> Dict[str, Any]:
        """Fix gaps between rooms by snapping edges."""
        rooms = floor_plan.get("rooms", [])
        if len(rooms) < 2:
            return floor_plan
        
        snap_tolerance = 0.5
        
        x_coords = set()
        y_coords = set()
        for room in rooms:
            x, y = room.get("x", 0), room.get("y", 0)
            w, d = room.get("width", 0), room.get("depth", 0)
            x_coords.update([x, x + w])
            y_coords.update([y, y + d])
        
        x_coords = sorted(x_coords)
        y_coords = sorted(y_coords)
        
        def snap(value, grid):
            for g in grid:
                if abs(value - g) < snap_tolerance:
                    return g
            return value
        
        for room in rooms:
            room["x"] = snap(room.get("x", 0), x_coords)
            room["y"] = snap(room.get("y", 0), y_coords)
            
            right = room["x"] + room.get("width", 0)
            bottom = room["y"] + room.get("depth", 0)
            
            snapped_right = snap(right, x_coords)
            snapped_bottom = snap(bottom, y_coords)
            
            if snapped_right != right:
                room["width"] = round(snapped_right - room["x"], 1)
            if snapped_bottom != bottom:
                room["depth"] = round(snapped_bottom - room["y"], 1)
            
            room["area"] = round(room["width"] * room["depth"], 1)
        
        floor_plan["rooms"] = rooms
        return floor_plan


def create_openai_generator() -> Optional[OpenAIFloorPlanGenerator]:
    """Create and return an OpenAI floor plan generator if configured."""
    generator = OpenAIFloorPlanGenerator()
    return generator if generator.client else None
