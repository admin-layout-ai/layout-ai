# backend/app/routers/plans.py
# Floor plans router - Uses Azure OpenAI with ALL project details from dbo.projects
# ENHANCED: Now renders CAD-quality PDF/PNG and saves to Azure Blob Storage

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, RedirectResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
from openai import AzureOpenAI
import json
import logging
import os
import re
import io

from .. import models
from ..database import get_db
from ..auth import get_current_user, AuthenticatedUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])

# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_KEY = os.getenv("AZURE_OPENAI_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4.1")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")

# Azure Blob Storage Configuration
AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AZURE_STORAGE_ACCOUNT = os.getenv("AZURE_STORAGE_ACCOUNT", "layoutaistorage")
FLOOR_PLANS_CONTAINER = "floor-plans"


def sanitize_path(name: str) -> str:
    """Sanitize a string for use in file/blob paths."""
    if not name:
        return "unknown"
    sanitized = re.sub(r'[^\w\s-]', '', name)
    sanitized = re.sub(r'[\s]+', '_', sanitized)
    return sanitized[:50]


class FloorPlanResponse(BaseModel):
    id: int
    project_id: int
    variant_number: Optional[int] = None
    total_area: Optional[float] = None
    living_area: Optional[float] = None
    plan_type: Optional[str] = None
    layout_data: Optional[str] = None
    compliance_data: Optional[str] = None
    pdf_url: Optional[str] = None
    dxf_url: Optional[str] = None
    preview_image_url: Optional[str] = None
    model_3d_url: Optional[str] = None
    is_compliant: Optional[bool] = None
    compliance_notes: Optional[str] = None
    generation_time_seconds: Optional[float] = None
    ai_model_version: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


def get_db_user(current_user: AuthenticatedUser, db: Session) -> models.User:
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


# =============================================================================
# AZURE BLOB STORAGE HELPERS
# =============================================================================

def get_blob_service():
    """Get Azure Blob Service client."""
    if not AZURE_STORAGE_CONNECTION_STRING:
        return None
    try:
        from azure.storage.blob import BlobServiceClient
        return BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    except Exception as e:
        logger.warning(f"Could not create blob service: {e}")
        return None


def upload_to_blob(data: bytes, blob_name: str, content_type: str) -> Optional[str]:
    """Upload data to blob storage and return public URL."""
    blob_service = get_blob_service()
    if not blob_service:
        return None
    
    try:
        from azure.storage.blob import ContentSettings
        
        container_client = blob_service.get_container_client(FLOOR_PLANS_CONTAINER)
        
        # Ensure container exists
        try:
            if not container_client.exists():
                container_client.create_container(public_access='blob')
        except:
            pass
        
        blob_client = container_client.get_blob_client(blob_name)
        blob_client.upload_blob(
            data,
            overwrite=True,
            content_settings=ContentSettings(content_type=content_type)
        )
        
        url = f"https://{AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/{FLOOR_PLANS_CONTAINER}/{blob_name}"
        return url
    except Exception as e:
        logger.error(f"Failed to upload blob {blob_name}: {e}")
        return None


def pdf_to_png(pdf_bytes: bytes, dpi: int = 150) -> Optional[bytes]:
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


def create_thumbnail(png_bytes: bytes, max_size: int = 400) -> Optional[bytes]:
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


# =============================================================================
# OPENAI FLOOR PLAN GENERATION - Uses ALL dbo.projects fields
# =============================================================================

def get_openai_client() -> AzureOpenAI:
    """Create and return Azure OpenAI client."""
    if not AZURE_OPENAI_ENDPOINT or not AZURE_OPENAI_KEY:
        raise ValueError("Azure OpenAI not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY in App Service Configuration.")
    
    return AzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_KEY,
        api_version=AZURE_OPENAI_API_VERSION
    )


def build_system_prompt() -> str:
    """System prompt for the AI architect."""
    return """You are an expert Australian residential architect AI. Generate detailed, realistic floor plans based on the client's land dimensions, requirements, and preferences stored in their project.

CRITICAL RULES:
1. Floor plan MUST fit within the provided land dimensions
2. Respect setbacks: Front 4.5m, Sides 0.9m each, Rear 3m minimum
3. Building footprint should be 50-60% of usable land area
4. All rooms must have realistic, buildable dimensions
5. Follow Australian Building Code (NCC/BCA) requirements
6. Consider land slope, orientation, and street frontage in design
7. Rooms MUST share walls - NO GAPS between adjacent rooms
8. Use x,y coordinates in METERS from front-left corner (0,0)

AUSTRALIAN ROOM SIZE STANDARDS:
- Master Bedroom: 14-20m² (minimum 10m² by BCA)
- Secondary Bedrooms: 10-14m² (minimum 9m² by BCA)
- Living/Family Room: 20-35m²
- Kitchen: 12-20m²
- Dining: 12-16m²
- Home Theatre/Media: 16-25m²
- Bathroom: 5-8m²
- Ensuite: 6-10m²
- Walk-in Robe: 4-8m²
- Laundry: 4-8m²
- Study/Office: 9-14m²
- Butler's Pantry: 4-8m²
- Single Garage: 18m² (3m x 6m)
- Double Garage: 36m² (6m x 6m)
- Alfresco: 15-30m²

DESIGN PRINCIPLES:
- Garage at front for street access (consider street_frontage direction)
- Entry/foyer connecting garage to living areas
- Open plan living/dining/kitchen if requested
- Wet areas grouped for plumbing efficiency
- Bedrooms in quiet zone, away from living areas
- Master suite with ensuite and walk-in robe
- North-facing living areas for natural light (Australia)
- Consider land slope for split-level if needed
- BAL rating affects materials and design if in bushfire zone

DOOR SPECIFICATIONS (include for each room):
- "doors": [{"to": "room_id", "type": "single/double/sliding/bifold/garage", "wall": "north/south/east/west", "position": 0.5}]

WINDOW SPECIFICATIONS (include for external walls):
- "windows": [{"wall": "north/south/east/west", "width": 1500, "position": 0.5}]

OUTPUT FORMAT - Return ONLY valid JSON:
{
    "design_name": "string",
    "description": "string",
    "rooms": [
        {
            "id": "unique_id",
            "type": "room_type",
            "name": "Display Name",
            "width": number,
            "depth": number,
            "area": number,
            "x": number,
            "y": number,
            "floor": 0 or 1,
            "doors": [...],
            "windows": [...],
            "features": ["list"]
        }
    ],
    "summary": {
        "total_area": number,
        "living_area": number,
        "bedroom_count": number,
        "bathroom_count": number,
        "garage_spaces": number
    },
    "compliance": {
        "ncc_compliant": true,
        "council": "council name",
        "notes": ["notes"]
    }
}

Room types: garage, porch, entry, family, living, theatre, dining, kitchen, pantry, laundry, bedroom, ensuite, bathroom, powder, wir, office, alfresco, store, mudroom, hallway"""


def build_user_prompt(project: models.Project) -> str:
    """
    Build the prompt using ALL fields from dbo.projects table.
    This ensures OpenAI has complete information about user requirements.
    """
    
    # Land dimensions
    land_width = project.land_width or 18
    land_depth = project.land_depth or 30
    land_area = project.land_area or (land_width * land_depth)
    
    # Calculate building envelope (accounting for setbacks)
    side_setbacks = 1.8  # 0.9m each side
    front_setback = 4.5
    rear_setback = 3.0
    max_building_width = land_width - side_setbacks
    max_building_depth = land_depth - front_setback - rear_setback
    max_footprint = max_building_width * max_building_depth
    
    # Building requirements with defaults
    bedrooms = project.bedrooms or 4
    bathrooms = project.bathrooms or 2
    living_areas = project.living_areas or 1
    garage_spaces = project.garage_spaces or 2
    storeys = project.storeys or 1
    
    # Calculate recommended building size based on requirements
    min_area_needed = (
        (bedrooms * 12) +  # Bedrooms ~12m² each
        (bathrooms * 6) +   # Bathrooms ~6m² each
        (garage_spaces * 18) +  # Garage 18m² per car
        45 +  # Kitchen/dining ~45m²
        25 +  # Living ~25m²
        15    # Circulation/halls ~15m²
    )
    
    prompt = f"""Design a floor plan using the following project details from database:

════════════════════════════════════════════════════════════════════════════════
PROJECT: {project.name} (ID: {project.id})
════════════════════════════════════════════════════════════════════════════════

LAND DETAILS (from dbo.projects)
────────────────────────────────────────────────────────────────────────────────
• Land Width:        {land_width}m
• Land Depth:        {land_depth}m
• Land Area:         {land_area}m²
• Land Slope:        {project.land_slope or 'Flat/Not specified'}
• Orientation:       {project.orientation or 'Not specified'} (which direction lot faces)
• Street Frontage:   {project.street_frontage or 'Front'} (where street access is)

BUILDING ENVELOPE (after setbacks)
────────────────────────────────────────────────────────────────────────────────
• Max Building Width:    {max_building_width:.1f}m
• Max Building Depth:    {max_building_depth:.1f}m
• Max Footprint:         {max_footprint:.1f}m²
• Minimum Area Needed:   ~{min_area_needed}m² (estimated for requirements)

BUILDING REQUIREMENTS (from dbo.projects)
────────────────────────────────────────────────────────────────────────────────
• Bedrooms:          {bedrooms}
• Bathrooms:         {bathrooms} (including ensuites)
• Living Areas:      {living_areas}
• Garage Spaces:     {garage_spaces}
• Storeys:           {storeys}

DESIGN PREFERENCES (from dbo.projects)
────────────────────────────────────────────────────────────────────────────────
• Style:                    {project.style or 'Modern'}
• Open Plan Living:         {"YES - Kitchen/Dining/Family combined" if project.open_plan else "NO - Separate formal rooms"}
• Outdoor Entertainment:    {"YES - Include alfresco area" if project.outdoor_entertainment else "NO"}
• Home Office/Study:        {"YES - Dedicated study required" if project.home_office else "NO"}

LOCATION DETAILS (from dbo.projects)
────────────────────────────────────────────────────────────────────────────────
• Street Address:    {project.street_address or 'Not specified'}
• Suburb:            {project.suburb or 'Not specified'}
• State:             {project.state or 'NSW'}
• Postcode:          {project.postcode or 'Not specified'}
• Council:           {project.council or 'Local Council'}
• Lot/DP:            {project.lot_dp or 'Not specified'}
• BAL Rating:        {project.bal_rating or 'None'} (Bushfire Attack Level)

════════════════════════════════════════════════════════════════════════════════
DESIGN INSTRUCTIONS
════════════════════════════════════════════════════════════════════════════════

1. CREATE A FLOOR PLAN THAT:
   - Fits within {max_building_width:.1f}m width × {max_building_depth:.1f}m depth
   - Includes exactly {bedrooms} bedrooms
   - Includes {bathrooms} bathrooms (master ensuite + {int(bathrooms) - 1} other)
   - Has {garage_spaces}-car garage at front for street access
   - {"Is single storey" if storeys == 1 else f"Has {storeys} storeys"}

2. ROOM LAYOUT REQUIREMENTS:
   - Garage positioned for {project.street_frontage or 'front'} street access
   - {"Open plan kitchen/dining/family" if project.open_plan else "Separate kitchen, dining, and living rooms"}
   - {"Include alfresco/outdoor entertaining area connected to living" if project.outdoor_entertainment else "No outdoor area required"}
   - {"Include dedicated study/home office" if project.home_office else "No study required"}
   - Master bedroom with ensuite and walk-in robe
   - Main bathroom accessible to other bedrooms

3. POSITIONING:
   - Use x,y coordinates in meters from front-left corner (0,0)
   - Rooms MUST share walls - adjacent rooms have matching edge coordinates
   - NO gaps between rooms

4. CONSIDER:
   - Land slope: {project.land_slope or 'Flat'} - {"may need split level design" if project.land_slope and project.land_slope.lower() not in ['flat', 'level', 'none'] else "standard slab construction"}
   - Orientation: {project.orientation or 'North'} - position living areas for natural light
   - BAL Rating: {project.bal_rating or 'None'} - {"design must comply with bushfire requirements" if project.bal_rating and project.bal_rating != 'None' else "standard construction"}

5. STYLE: {project.style or 'Modern'}
   - {"Clean lines, large windows, open spaces" if (project.style or '').lower() in ['modern', 'contemporary'] else ""}
   - {"Traditional proportions, separate rooms" if (project.style or '').lower() in ['traditional', 'classic', 'federation'] else ""}
   - {"Relaxed indoor-outdoor flow" if (project.style or '').lower() in ['coastal', 'hamptons'] else ""}

Return ONLY valid JSON with the floor plan. No markdown, no explanation."""

    return prompt


def generate_floor_plan_with_openai(project: models.Project) -> Dict[str, Any]:
    """
    Generate floor plan using Azure OpenAI.
    Uses ALL fields from the dbo.projects table.
    """
    logger.info(f"Generating AI floor plan for project {project.id}: {project.name}")
    logger.info(f"  Land: {project.land_width}m x {project.land_depth}m = {project.land_area}m²")
    logger.info(f"  Requirements: {project.bedrooms} bed, {project.bathrooms} bath, {project.garage_spaces} car")
    logger.info(f"  Preferences: open_plan={project.open_plan}, outdoor={project.outdoor_entertainment}, office={project.home_office}")
    
    # Get OpenAI client
    client = get_openai_client()
    
    # Build prompts with ALL project data
    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(project)
    
    logger.info(f"Calling Azure OpenAI ({AZURE_OPENAI_DEPLOYMENT})...")
    
    # Call OpenAI
    response = client.chat.completions.create(
        model=AZURE_OPENAI_DEPLOYMENT,
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
    floor_plan["project_id"] = project.id
    floor_plan["project_name"] = project.name
    floor_plan["generated_at"] = datetime.utcnow().isoformat()
    floor_plan["ai_model"] = AZURE_OPENAI_DEPLOYMENT
    floor_plan["generation_metadata"] = {
        "prompt_tokens": response.usage.prompt_tokens,
        "completion_tokens": response.usage.completion_tokens,
        "total_tokens": response.usage.total_tokens
    }
    
    # Store the input parameters used
    floor_plan["input_parameters"] = {
        "land_width": project.land_width,
        "land_depth": project.land_depth,
        "land_area": project.land_area,
        "land_slope": project.land_slope,
        "orientation": project.orientation,
        "street_frontage": project.street_frontage,
        "bedrooms": project.bedrooms,
        "bathrooms": project.bathrooms,
        "living_areas": project.living_areas,
        "garage_spaces": project.garage_spaces,
        "storeys": project.storeys,
        "style": project.style,
        "open_plan": project.open_plan,
        "outdoor_entertainment": project.outdoor_entertainment,
        "home_office": project.home_office,
        "suburb": project.suburb,
        "state": project.state,
        "council": project.council,
        "bal_rating": project.bal_rating
    }
    
    # Validate and fix rooms
    for room in floor_plan.get("rooms", []):
        if "area" not in room and "width" in room and "depth" in room:
            room["area"] = round(room["width"] * room["depth"], 1)
        if "floor" not in room:
            room["floor"] = 0
        if "doors" not in room:
            room["doors"] = []
        if "windows" not in room:
            room["windows"] = []
    
    # Fix room gaps by snapping edges
    floor_plan = _fix_room_gaps(floor_plan)
    
    room_count = len(floor_plan.get("rooms", []))
    total_area = sum(r.get("area", 0) for r in floor_plan.get("rooms", []))
    logger.info(f"OpenAI generated {room_count} rooms, total area: {total_area}m²")
    
    return floor_plan


def _fix_room_gaps(floor_plan: Dict[str, Any]) -> Dict[str, Any]:
    """Fix gaps between rooms by snapping edges to grid."""
    rooms = floor_plan.get("rooms", [])
    if len(rooms) < 2:
        return floor_plan
    
    snap_tolerance = 0.5
    
    # Collect all unique coordinates
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


# =============================================================================
# CAD RENDERING AND FILE STORAGE
# =============================================================================

def render_and_save_floor_plan(
    floor_plan_data: Dict[str, Any],
    project: models.Project,
    user: models.User,
    plan_id: int
) -> Dict[str, str]:
    """
    Render floor plan as CAD PDF/PNG and save to blob storage.
    
    Path: floor-plans/{User Name}/{Project Name}/{Plan - plan_id}/
    
    Returns dict with pdf_url, png_url, thumbnail_url
    """
    rendered_images = {}
    
    try:
        from ..services.cad_generator import generate_cad_floor_plan_pdf
    except ImportError as e:
        logger.warning(f"CAD generator not available: {e}")
        return rendered_images
    
    # Build folder path
    user_name = user.display_name or user.email or f"user_{user.id}"
    project_name = project.name or f"project_{project.id}"
    
    user_folder = sanitize_path(user_name)
    project_folder = sanitize_path(project_name)
    plan_folder = f"Plan_{plan_id}"
    
    base_path = f"{user_folder}/{project_folder}/{plan_folder}"
    
    logger.info(f"Rendering floor plan to: {FLOOR_PLANS_CONTAINER}/{base_path}/")
    
    # Project details for title block
    project_details = {
        'street_address': project.street_address,
        'suburb': project.suburb,
        'state': project.state,
        'postcode': project.postcode,
        'council': project.council,
    }
    
    # Generate PDF
    try:
        pdf_bytes = generate_cad_floor_plan_pdf(floor_plan_data, project.name, project_details)
        
        # Upload PDF
        pdf_blob_name = f"{base_path}/floor_plan.pdf"
        pdf_url = upload_to_blob(pdf_bytes, pdf_blob_name, "application/pdf")
        if pdf_url:
            rendered_images["pdf"] = pdf_url
            logger.info(f"Uploaded PDF: {pdf_url}")
        
        # Convert to PNG
        png_bytes = pdf_to_png(pdf_bytes)
        if png_bytes:
            png_blob_name = f"{base_path}/floor_plan.png"
            png_url = upload_to_blob(png_bytes, png_blob_name, "image/png")
            if png_url:
                rendered_images["png"] = png_url
                logger.info(f"Uploaded PNG: {png_url}")
            
            # Create thumbnail
            thumb_bytes = create_thumbnail(png_bytes)
            if thumb_bytes:
                thumb_blob_name = f"{base_path}/floor_plan_thumb.png"
                thumb_url = upload_to_blob(thumb_bytes, thumb_blob_name, "image/png")
                if thumb_url:
                    rendered_images["thumbnail"] = thumb_url
                    logger.info(f"Uploaded thumbnail: {thumb_url}")
    
    except Exception as e:
        logger.error(f"Failed to render floor plan: {e}")
        import traceback
        traceback.print_exc()
    
    return rendered_images


# =============================================================================
# MAIN FUNCTION - Called by projects.py
# =============================================================================

def create_floor_plan_for_project(db: Session, project: models.Project, user: models.User = None) -> models.FloorPlan:
    """
    Create a floor plan for a project using Azure OpenAI.
    Called by projects.py background task.
    Uses ALL fields from dbo.projects table.
    
    NEW: Also renders CAD PDF/PNG and saves to blob storage.
    """
    logger.info(f"Creating AI floor plan for project {project.id}")
    
    # Delete existing floor plans
    try:
        existing = db.query(models.FloorPlan).filter(models.FloorPlan.project_id == project.id).all()
        for plan in existing:
            db.delete(plan)
        db.commit()
        logger.info(f"Deleted {len(existing)} existing floor plans")
    except Exception as e:
        logger.warning(f"Could not delete existing plans: {e}")
        db.rollback()
    
    try:
        # Generate floor plan with OpenAI using ALL project data
        floor_plan_data = generate_floor_plan_with_openai(project)
        ai_model_version = AZURE_OPENAI_DEPLOYMENT
        
    except Exception as e:
        logger.error(f"OpenAI generation failed: {e}")
        import traceback
        traceback.print_exc()
        
        project.status = "error"
        project.updated_at = datetime.utcnow()
        db.commit()
        
        raise RuntimeError(f"Floor plan generation failed: {str(e)}")
    
    # Extract summary data
    summary = floor_plan_data.get("summary", {})
    total_area = summary.get("total_area") or sum(
        r.get("area", 0) for r in floor_plan_data.get("rooms", [])
    )
    living_area = summary.get("living_area") or sum(
        r.get("area", 0) for r in floor_plan_data.get("rooms", [])
        if r.get("type") in ["living", "family", "kitchen", "dining", "theatre"]
    )
    
    compliance = floor_plan_data.get("compliance", {
        "ncc_compliant": True,
        "council": project.council,
        "notes": ["AI-generated design based on project requirements"]
    })
    
    # Truncate plan_type to 50 chars to fit database column
    design_name = floor_plan_data.get("design_name", f"{project.bedrooms} Bed {project.style or 'Modern'}")
    if len(design_name) > 50:
        design_name = design_name[:47] + "..."
    
    # Create FloorPlan record first to get ID
    floor_plan = models.FloorPlan(
        project_id=project.id,
        variant_number=1,
        total_area=total_area,
        living_area=living_area,
        plan_type=design_name,
        layout_data=json.dumps(floor_plan_data),
        compliance_data=json.dumps(compliance),
        is_compliant=compliance.get("ncc_compliant", True),
        compliance_notes="; ".join(compliance.get("notes", [])),
        generation_time_seconds=floor_plan_data.get("generation_metadata", {}).get("total_tokens", 0) / 1000,
        ai_model_version=ai_model_version,
        created_at=datetime.utcnow()
    )
    
    db.add(floor_plan)
    db.flush()  # Get the ID
    
    plan_id = floor_plan.id
    logger.info(f"Created floor plan record with ID: {plan_id}")
    
    # Get user if not provided
    if not user:
        user = db.query(models.User).filter(models.User.id == project.user_id).first()
    
    # Render CAD PDF/PNG and save to blob storage
    if user:
        rendered_images = render_and_save_floor_plan(floor_plan_data, project, user, plan_id)
        
        # Update floor plan with URLs
        floor_plan.pdf_url = rendered_images.get("pdf")
        floor_plan.preview_image_url = rendered_images.get("png")
        
        # Also store in layout_data
        floor_plan_data["rendered_images"] = rendered_images
        floor_plan.layout_data = json.dumps(floor_plan_data)
        
        logger.info(f"Floor plan {plan_id} - PDF: {floor_plan.pdf_url}, Image: {floor_plan.preview_image_url}")
    
    project.status = "generated"
    project.updated_at = datetime.utcnow()
    db.commit()
    
    logger.info(f"Successfully created AI floor plan for project {project.id}")
    
    return floor_plan


# =============================================================================
# API ENDPOINTS
# =============================================================================

@router.get("/{project_id}/plans", response_model=List[FloorPlanResponse])
async def get_plans(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all floor plans for a project."""
    db_user = get_db_user(current_user, db)
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    plans = db.query(models.FloorPlan).filter(
        models.FloorPlan.project_id == project_id
    ).order_by(models.FloorPlan.variant_number).all()
    
    return plans


@router.get("/{project_id}/plans/{plan_id}/pdf")
async def download_floor_plan_pdf(
    project_id: int,
    plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download floor plan as professional CAD-quality PDF."""
    db_user = get_db_user(current_user, db)
    
    # Verify project ownership
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get floor plan
    floor_plan = db.query(models.FloorPlan).filter(
        models.FloorPlan.id == plan_id,
        models.FloorPlan.project_id == project_id
    ).first()
    
    if not floor_plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    
    # If we have a stored PDF URL, redirect to it
    if floor_plan.pdf_url:
        return RedirectResponse(url=floor_plan.pdf_url)
    
    # Otherwise generate on-demand
    try:
        layout_data = json.loads(floor_plan.layout_data) if floor_plan.layout_data else {}
    except:
        raise HTTPException(status_code=500, detail="Invalid floor plan data")
    
    # Project details for title block
    project_details = {
        'street_address': project.street_address,
        'suburb': project.suburb,
        'state': project.state,
        'postcode': project.postcode,
        'council': project.council,
    }
    
    # Generate PDF
    try:
        from ..services.cad_generator import generate_cad_floor_plan_pdf
        pdf_bytes = generate_cad_floor_plan_pdf(layout_data, project.name, project_details)
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate PDF")
    
    # Return PDF file
    filename = f"{sanitize_path(project.name)}_Floor_Plan.pdf"
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.get("/{project_id}/plans/{plan_id}/image")
async def get_floor_plan_image(
    project_id: int,
    plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get rendered PNG image for a floor plan."""
    db_user = get_db_user(current_user, db)
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    floor_plan = db.query(models.FloorPlan).filter(
        models.FloorPlan.id == plan_id,
        models.FloorPlan.project_id == project_id
    ).first()
    
    if not floor_plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    
    # Redirect to stored image
    if floor_plan.preview_image_url:
        return RedirectResponse(url=floor_plan.preview_image_url)
    
    raise HTTPException(status_code=404, detail="No image available")


@router.get("/{plan_id}/preview")
async def get_plan_preview(
    plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get floor plan preview data including rendered image URLs."""
    db_user = get_db_user(current_user, db)
    
    floor_plan = db.query(models.FloorPlan).filter(
        models.FloorPlan.id == plan_id
    ).first()
    
    if not floor_plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    
    project = db.query(models.Project).filter(
        models.Project.id == floor_plan.project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=403, detail="Access denied")
    
    layout_data = None
    rendered_images = {}
    
    if floor_plan.layout_data:
        try:
            layout_data = json.loads(floor_plan.layout_data)
            rendered_images = layout_data.get("rendered_images", {})
        except:
            pass
    
    # Use database URLs if available
    pdf_url = floor_plan.pdf_url or rendered_images.get("pdf")
    preview_url = floor_plan.preview_image_url or rendered_images.get("png")
    
    return {
        "id": floor_plan.id,
        "project_id": floor_plan.project_id,
        "variant_number": floor_plan.variant_number,
        "total_area": floor_plan.total_area,
        "living_area": floor_plan.living_area,
        "plan_type": floor_plan.plan_type,
        "is_compliant": floor_plan.is_compliant,
        "compliance_notes": floor_plan.compliance_notes,
        "layout_data": floor_plan.layout_data,
        "layout": layout_data,
        "pdf_url": pdf_url,
        "preview_image_url": preview_url,
        "thumbnail_url": rendered_images.get("thumbnail"),
        "rendered_images": {
            "pdf": pdf_url,
            "png": preview_url,
            "thumbnail": rendered_images.get("thumbnail")
        },
        "created_at": floor_plan.created_at,
    }
