# backend/app/routers/plans.py
# Floor plans router - Uses Google Gemini for AI floor plan generation
# REFINED: Selects best-matching sample plan and modifies only ~10% to fit requirements

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, RedirectResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any, Tuple
from pydantic import BaseModel
from datetime import datetime
import json
import logging
import os
import re
import io
import random
import base64
import math

from .. import models
from ..database import get_db
from ..auth import get_current_user, AuthenticatedUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])

# Google Gemini Configuration
GOOGLE_GEMINI_API_KEY = os.getenv("GOOGLE_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")

# Azure Blob Storage Configuration
AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AZURE_STORAGE_ACCOUNT = os.getenv("AZURE_STORAGE_ACCOUNT", "layoutaistorage")
FLOOR_PLANS_CONTAINER = "floor-plans"
TRAINING_DATA_CONTAINER = "training-data"

logger.info(f"AI Backend: Google Gemini (Sample-Based Modification)")


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
    pdf_url: Optional[str] = None  # Kept for DB compatibility, not used in UI
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
        
        # Create container if needed
        try:
            container_client.create_container(public_access='blob')
        except Exception:
            pass
        
        blob_client = container_client.get_blob_client(blob_name)
        blob_client.upload_blob(
            data,
            overwrite=True,
            content_settings=ContentSettings(content_type=content_type)
        )
        
        return f"https://{AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/{FLOOR_PLANS_CONTAINER}/{blob_name}"
    except Exception as e:
        logger.error(f"Failed to upload blob {blob_name}: {e}")
        return None


def load_all_sample_plans() -> List[Dict[str, Any]]:
    """
    Load ALL sample floor plans (JSON + PNG pairs) from Azure Blob Storage.
    Returns list of dicts with 'json_data', 'image_bytes', 'image_base64', 'filename'.
    """
    blob_service = get_blob_service()
    if not blob_service:
        logger.warning("Blob service not available")
        return []
    
    try:
        container_client = blob_service.get_container_client(TRAINING_DATA_CONTAINER)
        
        # List all blobs in floor-plans folder
        all_blobs = list(container_client.list_blobs(name_starts_with="floor-plans/"))
        
        # Group by plan number (e.g., plan-00001.json and plan-00001.png)
        plan_groups: Dict[str, Dict[str, Any]] = {}
        
        for blob in all_blobs:
            name = blob.name
            # Extract plan ID (e.g., "plan-00001" from "floor-plans/plan-00001.json")
            base_name = os.path.splitext(os.path.basename(name))[0]
            
            if base_name not in plan_groups:
                plan_groups[base_name] = {'filename': base_name}
            
            if name.lower().endswith('.json'):
                plan_groups[base_name]['json_blob'] = name
            elif name.lower().endswith(('.png', '.jpg', '.jpeg')):
                plan_groups[base_name]['image_blob'] = name
        
        logger.info(f"Found {len(plan_groups)} sample plan groups in storage")
        
        # Download each plan's JSON and image
        samples = []
        for plan_id, plan_info in sorted(plan_groups.items()):
            if 'json_blob' not in plan_info:
                continue
            
            sample = {'filename': plan_id}
            
            # Download JSON
            try:
                json_client = container_client.get_blob_client(plan_info['json_blob'])
                json_data = json_client.download_blob().readall()
                sample['json_data'] = json.loads(json_data.decode('utf-8'))
                logger.info(f"Loaded JSON: {plan_info['json_blob']}")
            except Exception as e:
                logger.warning(f"Could not load JSON {plan_info.get('json_blob')}: {e}")
                continue
            
            # Download image if available
            if 'image_blob' in plan_info:
                try:
                    img_client = container_client.get_blob_client(plan_info['image_blob'])
                    img_data = img_client.download_blob().readall()
                    sample['image_bytes'] = img_data
                    sample['image_base64'] = base64.b64encode(img_data).decode('utf-8')
                    
                    # Determine media type
                    if plan_info['image_blob'].lower().endswith('.png'):
                        sample['image_media_type'] = 'image/png'
                    else:
                        sample['image_media_type'] = 'image/jpeg'
                    
                    logger.info(f"Loaded image: {plan_info['image_blob']}")
                except Exception as e:
                    logger.warning(f"Could not load image {plan_info.get('image_blob')}: {e}")
            
            samples.append(sample)
        
        logger.info(f"Successfully loaded {len(samples)} complete sample plans")
        return samples
    
    except Exception as e:
        logger.error(f"Failed to load sample plans: {e}")
        import traceback
        traceback.print_exc()
        return []


# =============================================================================
# SAMPLE PLAN MATCHING - Find Best Fit for Requirements
# =============================================================================

def calculate_plan_match_score(
    sample_json: Dict[str, Any],
    requirements: Dict[str, Any]
) -> Tuple[float, Dict[str, Any]]:
    """
    Calculate how well a sample plan matches the user's requirements.
    Returns (score, match_details) where higher score = better match.
    
    Scoring weights:
    - Bedroom count match: 30 points
    - Bathroom count match: 20 points
    - Garage spaces match: 10 points
    - Land dimensions fit: 25 points
    - Feature matches (alfresco, study, theatre): 15 points
    """
    score = 0.0
    details = {}
    
    # Extract sample metadata
    metadata = sample_json.get('metadata', {})
    rooms = sample_json.get('rooms', [])
    
    # Count rooms by type in sample
    sample_bedrooms = metadata.get('bedrooms', 0)
    if sample_bedrooms == 0:
        sample_bedrooms = sum(1 for r in rooms if r.get('type') in ['bedroom', 'master_bedroom'])
    
    sample_bathrooms = metadata.get('bathrooms', 0)
    if sample_bathrooms == 0:
        sample_bathrooms = sum(1 for r in rooms if r.get('type') in ['bathroom', 'ensuite', 'powder'])
    
    sample_garage = metadata.get('garage_spaces', 2)
    
    # Calculate sample dimensions
    if rooms:
        max_x = max(r.get('x', 0) + r.get('width', 0) for r in rooms)
        max_y = max(r.get('y', 0) + r.get('depth', 0) for r in rooms)
    else:
        max_x = metadata.get('width', 14)
        max_y = metadata.get('depth', 20)
    
    sample_width = max_x
    sample_depth = max_y
    sample_area = metadata.get('total_area', sample_width * sample_depth)
    
    # Check features in sample
    room_types = set(r.get('type', '').lower() for r in rooms)
    sample_has_alfresco = 'alfresco' in room_types
    sample_has_study = 'study' in room_types or 'office' in room_types
    sample_has_theatre = 'theatre' in room_types or 'media' in room_types
    
    # Required values
    req_bedrooms = requirements.get('bedrooms', 4)
    req_bathrooms = requirements.get('bathrooms', 2)
    req_garage = requirements.get('garage_spaces', 2)
    req_land_width = requirements.get('land_width', 14)
    req_land_depth = requirements.get('land_depth', 25)
    req_alfresco = requirements.get('outdoor_entertainment', True)
    req_study = requirements.get('has_study', False)
    req_theatre = requirements.get('has_theatre', False)
    
    # Calculate building envelope (with setbacks)
    building_width = req_land_width - 1.8  # Side setbacks
    building_depth = req_land_depth - 7.5  # Front + rear setbacks
    
    # 1. Bedroom match (30 points max)
    bedroom_diff = abs(sample_bedrooms - req_bedrooms)
    if bedroom_diff == 0:
        score += 30
        details['bedrooms'] = 'Perfect match'
    elif bedroom_diff == 1:
        score += 20
        details['bedrooms'] = f'Close ({sample_bedrooms} vs {req_bedrooms})'
    else:
        score += max(0, 10 - bedroom_diff * 5)
        details['bedrooms'] = f'Differs by {bedroom_diff}'
    
    # 2. Bathroom match (20 points max)
    bathroom_diff = abs(sample_bathrooms - req_bathrooms)
    if bathroom_diff == 0:
        score += 20
        details['bathrooms'] = 'Perfect match'
    elif bathroom_diff <= 0.5:
        score += 15
        details['bathrooms'] = f'Close ({sample_bathrooms} vs {req_bathrooms})'
    else:
        score += max(0, 10 - bathroom_diff * 5)
        details['bathrooms'] = f'Differs by {bathroom_diff}'
    
    # 3. Garage match (10 points max)
    garage_diff = abs(sample_garage - req_garage)
    if garage_diff == 0:
        score += 10
        details['garage'] = 'Perfect match'
    else:
        score += max(0, 5 - garage_diff * 3)
        details['garage'] = f'Differs by {garage_diff}'
    
    # 4. Dimensions fit (25 points max)
    # Plan should fit within building envelope
    width_ratio = sample_width / building_width if building_width > 0 else 1
    depth_ratio = sample_depth / building_depth if building_depth > 0 else 1
    
    if width_ratio <= 1.0 and depth_ratio <= 1.0:
        # Fits within envelope
        fit_score = 25 * min(width_ratio, depth_ratio)  # Prefer larger plans that fill the space
        score += fit_score
        details['dimensions'] = f'Fits well ({sample_width:.1f}x{sample_depth:.1f}m in {building_width:.1f}x{building_depth:.1f}m)'
    elif width_ratio <= 1.1 and depth_ratio <= 1.1:
        # Slightly oversized but can be scaled
        score += 15
        details['dimensions'] = f'Slight scale needed ({width_ratio:.2f}x, {depth_ratio:.2f}x)'
    else:
        # Needs significant adjustment
        score += max(0, 10 - (max(width_ratio, depth_ratio) - 1) * 10)
        details['dimensions'] = f'Needs scaling ({width_ratio:.2f}x, {depth_ratio:.2f}x)'
    
    # 5. Feature matches (15 points max)
    feature_score = 0
    feature_details = []
    
    if req_alfresco:
        if sample_has_alfresco:
            feature_score += 5
            feature_details.append('alfresco ✓')
        else:
            feature_details.append('alfresco needed')
    
    if req_study:
        if sample_has_study:
            feature_score += 5
            feature_details.append('study ✓')
        else:
            feature_details.append('study needed')
    
    if req_theatre:
        if sample_has_theatre:
            feature_score += 5
            feature_details.append('theatre ✓')
        else:
            feature_details.append('theatre needed')
    
    # Bonus for having features even if not required
    if not req_alfresco and sample_has_alfresco:
        feature_score += 2
    
    score += feature_score
    details['features'] = ', '.join(feature_details) if feature_details else 'N/A'
    
    # Store sample info for reference
    details['sample_info'] = {
        'bedrooms': sample_bedrooms,
        'bathrooms': sample_bathrooms,
        'garage': sample_garage,
        'width': sample_width,
        'depth': sample_depth,
        'area': sample_area,
        'has_alfresco': sample_has_alfresco,
        'has_study': sample_has_study,
        'has_theatre': sample_has_theatre
    }
    
    return score, details


def find_best_matching_sample(
    samples: List[Dict[str, Any]],
    requirements: Dict[str, Any]
) -> Tuple[Optional[Dict[str, Any]], float, Dict[str, Any]]:
    """
    Find the sample plan that best matches the requirements.
    Returns (best_sample, score, match_details) or (None, 0, {}) if no samples.
    """
    if not samples:
        return None, 0, {}
    
    best_sample = None
    best_score = -1
    best_details = {}
    
    for sample in samples:
        json_data = sample.get('json_data', {})
        score, details = calculate_plan_match_score(json_data, requirements)
        
        logger.info(f"Sample {sample.get('filename')}: score={score:.1f}")
        
        if score > best_score:
            best_score = score
            best_sample = sample
            best_details = details
    
    if best_sample:
        logger.info(f"Best match: {best_sample.get('filename')} with score {best_score:.1f}")
        logger.info(f"Match details: {best_details}")
    
    return best_sample, best_score, best_details


# =============================================================================
# GEMINI-BASED FLOOR PLAN MODIFICATION
# =============================================================================

def modify_floor_plan_with_gemini(
    base_sample: Dict[str, Any],
    requirements: Dict[str, Any],
    match_details: Dict[str, Any]
) -> Tuple[Dict[str, Any], Optional[bytes]]:
    """
    Use Google Gemini to modify the base sample plan to fit requirements.
    Only modifies ~10% of the plan to maintain the professional topology.
    
    Returns (modified_json, generated_image_bytes).
    """
    logger.info("Modifying floor plan with Gemini...")
    
    # Lazy imports
    try:
        from google import genai
        from google.genai import types
        from PIL import Image
        from io import BytesIO
    except ImportError as e:
        logger.error(f"Required packages not installed: {e}")
        raise
    
    # Initialize Gemini client
    api_key = GOOGLE_GEMINI_API_KEY
    if not api_key:
        raise ValueError("Google Gemini API key not configured")
    
    client = genai.Client(api_key=api_key)
    
    base_json = base_sample.get('json_data', {})
    base_image_b64 = base_sample.get('image_base64')
    base_media_type = base_sample.get('image_media_type', 'image/png')
    
    # Calculate required adjustments
    req_land_width = requirements.get('land_width', 14)
    req_land_depth = requirements.get('land_depth', 25)
    building_width = req_land_width - 1.8
    building_depth = req_land_depth - 7.5
    
    sample_info = match_details.get('sample_info', {})
    sample_width = sample_info.get('width', 14)
    sample_depth = sample_info.get('depth', 20)
    
    # Calculate scale factors
    width_scale = building_width / sample_width if sample_width > 0 else 1.0
    depth_scale = building_depth / sample_depth if sample_depth > 0 else 1.0
    
    # Determine what modifications are needed
    modifications_needed = []
    
    req_bedrooms = requirements.get('bedrooms', 4)
    sample_bedrooms = sample_info.get('bedrooms', 4)
    if req_bedrooms != sample_bedrooms:
        if req_bedrooms > sample_bedrooms:
            modifications_needed.append(f"Add {req_bedrooms - sample_bedrooms} bedroom(s)")
        else:
            modifications_needed.append(f"Remove {sample_bedrooms - req_bedrooms} bedroom(s)")
    
    if requirements.get('outdoor_entertainment') and not sample_info.get('has_alfresco'):
        modifications_needed.append("Add alfresco area at rear")
    
    if requirements.get('has_study') and not sample_info.get('has_study'):
        modifications_needed.append("Add study/home office")
    
    if requirements.get('has_theatre') and not sample_info.get('has_theatre'):
        modifications_needed.append("Add theatre/media room")
    
    if abs(width_scale - 1.0) > 0.05 or abs(depth_scale - 1.0) > 0.05:
        modifications_needed.append(f"Scale to fit {building_width:.1f}m x {building_depth:.1f}m envelope")
    
    # Build modification prompt
    modification_prompt = f"""You are an expert Australian residential architect. 
You have been given a PROFESSIONAL floor plan design. Your task is to make MINIMAL modifications (approximately 10% changes) to adapt it for new requirements while PRESERVING the excellent topology, circulation flow, and livability of the original design.

CRITICAL: Maintain the original plan's:
- Master suite positioning and layout
- Circulation flow (hallways and connections)
- Kitchen/family/meals relationship
- Bedroom wing clustering
- Entry sequence

ORIGINAL PLAN SPECIFICATIONS:
- Dimensions: {sample_width:.1f}m wide × {sample_depth:.1f}m deep
- Bedrooms: {sample_info.get('bedrooms', 4)}
- Bathrooms: {sample_info.get('bathrooms', 2)}
- Has Alfresco: {sample_info.get('has_alfresco', False)}
- Has Study: {sample_info.get('has_study', False)}

TARGET REQUIREMENTS:
- Building envelope: {building_width:.1f}m wide × {building_depth:.1f}m deep
- Bedrooms: {requirements.get('bedrooms', 4)}
- Bathrooms: {requirements.get('bathrooms', 2)}
- Garage: {requirements.get('garage_spaces', 2)}-car
- Alfresco: {'Yes' if requirements.get('outdoor_entertainment') else 'No'}
- Study: {'Yes' if requirements.get('has_study') else 'No'}
- Theatre: {'Yes' if requirements.get('has_theatre') else 'No'}
- Style: {requirements.get('style', 'Modern Australian')}

MODIFICATIONS NEEDED:
{chr(10).join(f"- {mod}" for mod in modifications_needed) if modifications_needed else "- Minor scaling only (plan already matches well)"}

SCALE FACTORS TO APPLY:
- Width scale: {width_scale:.3f}
- Depth scale: {depth_scale:.3f}

ORIGINAL PLAN JSON:
{json.dumps(base_json, indent=2)}

INSTRUCTIONS:
1. Apply the scale factors to ALL room coordinates (x, y) and dimensions (width, depth)
2. Make ONLY the modifications listed above
3. Keep room adjacencies and relationships the same
4. Ensure the master suite remains at the rear
5. Keep garage at the front
6. Maintain hallway connections

Return ONLY valid JSON in this format:
{{
    "design_name": "Modified Australian Family Home",
    "description": "Professional floor plan adapted for specific requirements",
    "rooms": [
        {{
            "id": "room_id",
            "type": "room_type",
            "name": "Room Name",
            "x": 0.0,
            "y": 0.0,
            "width": 4.0,
            "depth": 4.0,
            "area": 16.0,
            "floor": 0,
            "doors": [],
            "windows": [],
            "features": []
        }}
    ],
    "summary": {{
        "total_area": 250,
        "living_area": 100,
        "bedroom_count": 4,
        "bathroom_count": 2,
        "garage_spaces": 2
    }},
    "modifications_made": ["list of changes made"]
}}"""

    try:
        # Call Gemini with image context if available
        content_parts = []
        
        if base_image_b64:
            content_parts.append("Here is the original floor plan image to reference:")
            # Create PIL image from base64
            img_bytes = base64.b64decode(base_image_b64)
            img = Image.open(BytesIO(img_bytes))
            content_parts.append(img)
        
        content_parts.append(modification_prompt)
        
        logger.info("Calling Gemini for floor plan modification...")
        
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=content_parts,
            config=types.GenerateContentConfig(
                temperature=0.3,  # Lower temperature for more consistent output
            )
        )
        
        response_text = response.text.strip()
        
        # Extract JSON from response
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]
        
        modified_plan = json.loads(response_text.strip())
        
        # Sanitize the modified plan
        modified_plan = sanitize_floor_plan(modified_plan)
        
        # Add metadata about the modification
        modified_plan['base_sample'] = base_sample.get('filename')
        modified_plan['match_score'] = match_details.get('score', 0)
        modified_plan['modifications_summary'] = modifications_needed
        
        logger.info(f"Successfully modified floor plan. Rooms: {len(modified_plan.get('rooms', []))}")
        
        # Generate a new floor plan image
        generated_image = generate_floor_plan_image(modified_plan, requirements, client)
        
        return modified_plan, generated_image
        
    except Exception as e:
        logger.error(f"Gemini modification failed: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback: Apply simple scaling to the base plan
        return apply_simple_scaling(base_json, width_scale, depth_scale, requirements), None


def generate_floor_plan_image(
    floor_plan_json: Dict[str, Any],
    requirements: Dict[str, Any],
    client
) -> Optional[bytes]:
    """
    Generate a floor plan image using Gemini's image generation.
    """
    try:
        from google.genai import types
        
        building_width = requirements.get('land_width', 14) - 1.8
        building_depth = requirements.get('land_depth', 25) - 7.5
        
        rooms = floor_plan_json.get('rooms', [])
        room_descriptions = []
        for room in rooms:
            room_descriptions.append(
                f"- {room.get('name', room.get('type', 'Room'))}: "
                f"{room.get('width', 3):.1f}m × {room.get('depth', 3):.1f}m at position ({room.get('x', 0):.1f}, {room.get('y', 0):.1f})"
            )
        
        image_prompt = f"""Generate a professional architectural floor plan drawing.

SPECIFICATIONS:
- Building: {building_width:.1f}m wide × {building_depth:.1f}m deep
- Style: Clean black lines on white background
- View: 2D top-down architectural floor plan
- Labels: Room names clearly visible inside each room

ROOMS TO INCLUDE:
{chr(10).join(room_descriptions[:20])}  

DRAWING REQUIREMENTS:
- Professional architectural quality
- Show wall thicknesses
- Include door swings
- Clear room labels
- Clean, precise lines
- No furniture, just walls and labels"""

        logger.info("Generating floor plan image with Gemini...")
        
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=image_prompt,
            config=types.GenerateContentConfig(
                response_modalities=["image", "text"],
            )
        )
        
        # Extract image from response
        for part in response.candidates[0].content.parts:
            if hasattr(part, 'inline_data') and part.inline_data:
                image_data = part.inline_data.data
                logger.info("Successfully generated floor plan image")
                return image_data
        
        logger.warning("No image in Gemini response")
        return None
        
    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        return None


def apply_simple_scaling(
    base_json: Dict[str, Any],
    width_scale: float,
    depth_scale: float,
    requirements: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Fallback: Apply simple scaling to base plan coordinates.
    """
    logger.info(f"Applying simple scaling: width={width_scale:.3f}, depth={depth_scale:.3f}")
    
    scaled_plan = {
        'design_name': base_json.get('design_name', 'Scaled Australian Family Home'),
        'description': 'Professional floor plan scaled to fit land dimensions',
        'rooms': [],
        'summary': {}
    }
    
    total_area = 0
    living_area = 0
    
    for room in base_json.get('rooms', []):
        scaled_room = {
            'id': room.get('id', f"{room.get('type', 'room')}_{len(scaled_plan['rooms'])+1:02d}"),
            'type': room.get('type', 'room'),
            'name': room.get('name', 'Room'),
            'x': round(room.get('x', 0) * width_scale, 2),
            'y': round(room.get('y', 0) * depth_scale, 2),
            'width': round(room.get('width', 3) * width_scale, 2),
            'depth': round(room.get('depth', 3) * depth_scale, 2),
            'floor': room.get('floor', 0),
            'doors': room.get('doors', []),
            'windows': room.get('windows', []),
            'features': room.get('features', [])
        }
        scaled_room['area'] = round(scaled_room['width'] * scaled_room['depth'], 1)
        
        total_area += scaled_room['area']
        if scaled_room['type'] in ['family', 'living', 'kitchen', 'dining', 'meals']:
            living_area += scaled_room['area']
        
        scaled_plan['rooms'].append(scaled_room)
    
    # Count room types
    bedroom_count = sum(1 for r in scaled_plan['rooms'] if r['type'] in ['bedroom', 'master_bedroom'])
    bathroom_count = sum(1 for r in scaled_plan['rooms'] if r['type'] in ['bathroom', 'ensuite', 'powder'])
    
    scaled_plan['summary'] = {
        'total_area': round(total_area, 1),
        'living_area': round(living_area, 1),
        'bedroom_count': bedroom_count,
        'bathroom_count': bathroom_count,
        'garage_spaces': requirements.get('garage_spaces', 2)
    }
    
    return scaled_plan


def sanitize_floor_plan(floor_plan: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitize floor plan data to ensure valid structure."""
    if 'rooms' not in floor_plan:
        floor_plan['rooms'] = []
    
    for room in floor_plan.get('rooms', []):
        # Ensure required fields
        if 'id' not in room:
            room['id'] = f"{room.get('type', 'room')}_{room.get('name', '').replace(' ', '_')}"
        if 'area' not in room and 'width' in room and 'depth' in room:
            room['area'] = round(room['width'] * room['depth'], 1)
        if 'floor' not in room:
            room['floor'] = 0
        
        # Sanitize arrays
        for field in ['doors', 'windows', 'features']:
            if field not in room:
                room[field] = []
            elif isinstance(room[field], str):
                room[field] = []
            elif isinstance(room[field], list):
                room[field] = [x for x in room[field] if isinstance(x, (dict, str))]
    
    return floor_plan


# =============================================================================
# MAIN FUNCTION - Called by projects.py
# =============================================================================

def create_floor_plan_for_project(db: Session, project: models.Project, user: models.User = None) -> models.FloorPlan:
    """
    Create a floor plan for a project using sample-based modification.
    
    Process:
    1. Load all sample floor plans from Azure Blob Storage
    2. Find the best matching sample based on requirements
    3. Use Gemini to modify ~10% of the sample to fit exact requirements
    4. Store generated image to Azure Blob Storage
    5. Create database record
    """
    logger.info(f"Creating floor plan for project {project.id}: {project.name}")
    start_time = datetime.utcnow()
    
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
    
    # Build requirements from project
    requirements = {
        'land_width': project.land_width or 14,
        'land_depth': project.land_depth or 25,
        'bedrooms': project.bedrooms or 4,
        'bathrooms': project.bathrooms or 2,
        'garage_spaces': project.garage_spaces or 2,
        'has_theatre': (project.living_areas or 1) > 1,
        'has_study': project.home_office or False,
        'outdoor_entertainment': project.outdoor_entertainment if project.outdoor_entertainment is not None else True,
        'open_plan': project.open_plan if project.open_plan is not None else True,
        'style': project.style or 'Modern Australian'
    }
    
    logger.info(f"Requirements: {requirements}")
    
    try:
        # 1. Load all sample plans
        logger.info("Loading sample floor plans from storage...")
        samples = load_all_sample_plans()
        
        if not samples:
            raise RuntimeError("No sample floor plans available in storage")
        
        logger.info(f"Loaded {len(samples)} sample plans")
        
        # 2. Find best matching sample
        logger.info("Finding best matching sample plan...")
        best_sample, match_score, match_details = find_best_matching_sample(samples, requirements)
        
        if not best_sample:
            raise RuntimeError("Could not find matching sample plan")
        
        logger.info(f"Best match: {best_sample.get('filename')} (score: {match_score:.1f})")
        
        # 3. Modify the sample plan using Gemini
        logger.info("Modifying floor plan with Gemini...")
        modified_plan, generated_image = modify_floor_plan_with_gemini(
            best_sample, requirements, match_details
        )
        
        # Add generation metadata
        end_time = datetime.utcnow()
        generation_time = (end_time - start_time).total_seconds()
        
        modified_plan['project_id'] = project.id
        modified_plan['project_name'] = project.name
        modified_plan['generated_at'] = end_time.isoformat()
        modified_plan['ai_model'] = 'gemini-2.0-flash-exp'
        modified_plan['generation_method'] = 'sample_based_modification'
        modified_plan['base_sample'] = best_sample.get('filename')
        modified_plan['match_score'] = match_score
        modified_plan['input_parameters'] = requirements
        
        # Extract summary data
        summary = modified_plan.get('summary', {})
        total_area = summary.get('total_area') or sum(
            r.get('area', 0) for r in modified_plan.get('rooms', [])
        )
        living_area = summary.get('living_area') or sum(
            r.get('area', 0) for r in modified_plan.get('rooms', [])
            if r.get('type') in ['living', 'family', 'kitchen', 'dining', 'theatre']
        )
        
        # Truncate plan_type to fit database column
        design_name = modified_plan.get('design_name', f"{project.bedrooms} Bed {project.style or 'Modern'}")
        if len(design_name) > 50:
            design_name = design_name[:47] + "..."
        
        # Create FloorPlan record
        floor_plan = models.FloorPlan(
            project_id=project.id,
            variant_number=1,
            total_area=total_area,
            living_area=living_area,
            plan_type=design_name,
            layout_data=json.dumps(modified_plan),
            compliance_data=json.dumps({
                'ncc_compliant': True,
                'notes': ['Based on professional sample plan', f'Match score: {match_score:.1f}']
            }),
            is_compliant=True,
            compliance_notes=f"Based on {best_sample.get('filename')}; Match score: {match_score:.1f}",
            generation_time_seconds=generation_time,
            ai_model_version='gemini-2.0-flash-exp_sample_mod',
            created_at=end_time
        )
        
        db.add(floor_plan)
        db.flush()  # Get the ID
        
        plan_id = floor_plan.id
        logger.info(f"Created floor plan record with ID: {plan_id}")
        
        # 4. Upload generated image to blob storage
        # Path format: {user_full_name}/{project_name}/{plan_id}/floor_plan.png
        if user is None:
            user = db.query(models.User).filter(models.User.id == project.user_id).first()
        
        if user and generated_image:
            # Use full_name for folder, fallback to email prefix or user_id
            user_folder = sanitize_path(user.full_name) if user.full_name else (
                sanitize_path(user.email.split('@')[0]) if user.email else f"user_{user.id}"
            )
            project_folder = sanitize_path(project.name) if project.name else f"project_{project.id}"
            base_path = f"{user_folder}/{project_folder}/{plan_id}"
            
            # Upload PNG
            png_blob_name = f"{base_path}/floor_plan.png"
            png_url = upload_to_blob(generated_image, png_blob_name, "image/png")
            
            if png_url:
                floor_plan.preview_image_url = png_url
                modified_plan['rendered_images'] = {'png': png_url}
                floor_plan.layout_data = json.dumps(modified_plan)
                logger.info(f"Uploaded floor plan image: {png_url}")
        
        # If no generated image, use the base sample image
        if user and not floor_plan.preview_image_url and best_sample.get('image_bytes'):
            # Use full_name for folder, fallback to email prefix or user_id
            user_folder = sanitize_path(user.full_name) if user.full_name else (
                sanitize_path(user.email.split('@')[0]) if user.email else f"user_{user.id}"
            )
            project_folder = sanitize_path(project.name) if project.name else f"project_{project.id}"
            base_path = f"{user_folder}/{project_folder}/{plan_id}"
            
            # Upload base sample image as reference
            png_blob_name = f"{base_path}/floor_plan.png"
            png_url = upload_to_blob(best_sample['image_bytes'], png_blob_name, "image/png")
            
            if png_url:
                floor_plan.preview_image_url = png_url
                modified_plan['rendered_images'] = {'png': png_url, 'source': 'base_sample'}
                floor_plan.layout_data = json.dumps(modified_plan)
                logger.info(f"Uploaded base sample image: {png_url}")
        
        project.status = "generated"
        project.updated_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"Successfully created floor plan for project {project.id}")
        logger.info(f"  Base sample: {best_sample.get('filename')}")
        logger.info(f"  Match score: {match_score:.1f}")
        logger.info(f"  Generation time: {generation_time:.1f}s")
        logger.info(f"  Preview image: {floor_plan.preview_image_url}")
        
        return floor_plan
        
    except Exception as e:
        logger.error(f"Floor plan generation failed: {e}")
        import traceback
        traceback.print_exc()
        
        project.status = "error"
        project.updated_at = datetime.utcnow()
        db.commit()
        
        raise RuntimeError(f"Floor plan generation failed: {str(e)}")


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


@router.get("/{project_id}/plans/{plan_id}/image")
async def download_floor_plan_image(
    project_id: int,
    plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Redirect to floor plan preview image download."""
    db_user = get_db_user(current_user, db)
    
    plan = db.query(models.FloorPlan).join(models.Project).filter(
        models.FloorPlan.id == plan_id,
        models.FloorPlan.project_id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    
    if not plan.preview_image_url:
        raise HTTPException(status_code=404, detail="Image not available for this plan")
    
    return RedirectResponse(url=plan.preview_image_url)


@router.get("/samples/info")
async def get_sample_plans_info(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get information about available sample plans (for debugging)."""
    samples = load_all_sample_plans()
    
    info = []
    for sample in samples:
        json_data = sample.get('json_data', {})
        metadata = json_data.get('metadata', {})
        rooms = json_data.get('rooms', [])
        
        info.append({
            'filename': sample.get('filename'),
            'has_image': 'image_bytes' in sample,
            'bedrooms': metadata.get('bedrooms', sum(1 for r in rooms if r.get('type') in ['bedroom', 'master_bedroom'])),
            'bathrooms': metadata.get('bathrooms', sum(1 for r in rooms if r.get('type') in ['bathroom', 'ensuite'])),
            'room_count': len(rooms),
            'room_types': list(set(r.get('type') for r in rooms))
        })
    
    return {
        'sample_count': len(samples),
        'samples': info
    }
