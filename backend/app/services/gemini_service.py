# backend/app/services/gemini_service.py
# Google Gemini AI integration for floor plan generation
# Handles image generation, JSON extraction, and validation feedback
#
# UPDATED: Integrated tile-based layout engine for mathematically correct dimensions

from typing import List, Optional, Dict, Any
import json
import base64
import os
import logging

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

GOOGLE_GEMINI_API_KEY = os.getenv("GOOGLE_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")

# Model names
NANO_BANANA_MODEL = "gemini-2.5-flash-image"           # Fast, for JSON extraction
NANO_BANANA_PRO_MODEL = "gemini-3-pro-image-preview"   # Pro, for image generation

# Generation settings
MAX_GENERATION_ATTEMPTS = 5  # More attempts for correction feedback loop
DEFAULT_IMAGE_SIZE = "4K"

# NEW: Enable tile-based layout (set to False to use old behavior)
USE_TILE_LAYOUT = True


# =============================================================================
# CLIENT INITIALIZATION
# =============================================================================

def get_gemini_client():
    """
    Get initialized Gemini client.
    
    Raises ValueError if API key not configured.
    """
    if not GOOGLE_GEMINI_API_KEY:
        raise ValueError("Google Gemini API key not configured. Set GOOGLE_GEMINI_API_KEY environment variable.")
    
    try:
        from google import genai
        return genai.Client(api_key=GOOGLE_GEMINI_API_KEY)
    except ImportError:
        raise ImportError("google-genai package not installed. Run: pip install google-genai")


# =============================================================================
# TILE LAYOUT INTEGRATION (NEW)
# =============================================================================

def get_tile_layout(
    building_width: float,
    building_depth: float,
    requirements: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Generate tile-based layout with mathematically correct coordinates.
    
    Returns None if tile layout engine is not available or disabled.
    """
    if not USE_TILE_LAYOUT:
        return None
    
    try:
        from .tile_layout_engine import generate_tile_layout, layout_to_floor_plan_json
        
        layout = generate_tile_layout(building_width, building_depth, requirements)
        
        verification = layout.verify()
        if not verification['valid']:
            logger.warning(f"Tile layout has gaps: {verification['gaps']} tiles unassigned")
            return None
        
        floor_plan_json = layout_to_floor_plan_json(layout, requirements)
        floor_plan_json['_tile_layout'] = layout  # Store for prompt generation
        
        logger.info(f"Tile layout generated: {len(layout.rooms)} rooms, 100% coverage")
        return floor_plan_json
        
    except ImportError:
        logger.warning("Tile layout engine not available, using traditional generation")
        return None
    except Exception as e:
        logger.error(f"Tile layout generation failed: {e}")
        return None


def build_tile_layout_prompt(
    tile_layout: Dict[str, Any],
    requirements: Dict[str, Any],
    building_width: float,
    building_depth: float,
    setbacks: Dict[str, float]
) -> str:
    """
    Build generation prompt using pre-calculated tile layout coordinates.
    
    This tells Gemini to RENDER the layout, not calculate positions.
    """
    try:
        from .tile_layout_engine import format_layout_for_gemini
        
        layout = tile_layout.get('_tile_layout')
        if layout:
            layout_section = format_layout_for_gemini(layout)
        else:
            # Fallback: format from rooms list
            rooms = tile_layout.get('rooms', [])
            layout_section = "PRE-CALCULATED ROOM COORDINATES:\n"
            for room in rooms:
                layout_section += f"• {room['name']}: x={room['x']:.1f}, y={room['y']:.1f}, w={room['width']:.1f}m, d={room['depth']:.1f}m\n"
    except ImportError:
        layout_section = ""
    
    bedrooms = requirements.get('bedrooms', 4)
    bathrooms = requirements.get('bathrooms', 2)
    living_areas = requirements.get('living_areas', 1)
    has_study = requirements.get('home_office', False)
    
    prompt = f"""Expert Australian architect. RENDER this floor plan using the PRE-CALCULATED coordinates below.

⚠️ CRITICAL: The room positions have been MATHEMATICALLY CALCULATED. 
DO NOT recalculate or adjust dimensions. Just DRAW the rooms at the exact positions specified.

=== BUILDING ENVELOPE ===
Width: {building_width:.1f}m (EXACT - use full width)
Depth: {building_depth:.1f}m (EXACT)
Setbacks applied: Front={setbacks.get('front', 6.0)}m, Rear={setbacks.get('rear', 1.5)}m, Sides={setbacks.get('side', 0.9)}m

=== REQUIREMENTS ===
• Bedrooms: {bedrooms} (Master + {bedrooms-1} minor)
• Bathrooms: {bathrooms}
• Living areas: {living_areas}
• Study: {'YES' if has_study else 'NO'}

{layout_section}

=== RENDERING INSTRUCTIONS ===
1. Draw each room at the EXACT x,y position specified above
2. Room dimensions are PRE-CALCULATED to sum to {building_width:.1f}m width at every row
3. DO NOT add gaps between rooms
4. DO NOT make rooms smaller than specified

=== IMAGE REQUIREMENTS ===
• 4K resolution
• WHITE background
• BLACK walls (external thicker than internal)
• Room labels INSIDE rooms only: "ROOM NAME\\nW×D"
• NO external dimension labels (no "16.2m" outside)
• NO title text
• PORTRAIT orientation (taller than wide)

=== CRITICAL CHECKLIST ===
□ Each room at EXACT coordinates from list above
□ {bedrooms} bedrooms total (Master + Bed 2 + Bed 3{' + Bed 4' if bedrooms >= 4 else ''})
□ DINING adjacent to KITCHEN (they share a wall)
□ Building fills FULL {building_width:.1f}m width
□ Garage at FRONT/BOTTOM
□ Master at REAR/TOP
□ Alfresco OUTSIDE building envelope"""

    return prompt


# =============================================================================
# IMAGE ANALYSIS
# =============================================================================

def analyze_generated_image(
    image_bytes: bytes, 
    requirements: Dict[str, Any],
    building_width: float,
    building_depth: float
) -> Dict[str, Any]:
    """
    Use Gemini to analyze a generated floor plan image.
    
    Validates that the generated image matches requirements by:
    - Counting bedrooms and bathrooms
    - Checking room adjacencies
    - Verifying layout orientation
    - Checking building fills the envelope
    
    Args:
        image_bytes: PNG/JPG image data
        requirements: User requirements dict
        building_width: Expected building width
        building_depth: Expected building depth
    
    Returns:
        Analysis result dict with counts and issues found
    """
    try:
        from google.genai import types
        from PIL import Image
        from io import BytesIO
        
        client = get_gemini_client()
        img = Image.open(BytesIO(image_bytes))
        
        bedrooms = requirements.get('bedrooms', 4)
        bathrooms = requirements.get('bathrooms', 2)
        living_areas = requirements.get('living_areas', 1)
        has_study_req = requirements.get('home_office', False) or requirements.get('has_study', False)
        has_powder_req = (bathrooms % 1) != 0
        
        analysis_prompt = f"""Analyze this floor plan image CAREFULLY and count rooms.

=== COUNT THESE ROOMS PRECISELY ===
1. COUNT BEDROOMS: Look for rooms labeled "MASTER", "MASTER SUITE", "BED 2", "BED 3", "BED 4", "BEDROOM"
   - Master/Master Suite counts as 1 bedroom
   - Each "BED X" counts as 1 bedroom
   - Expected: {bedrooms} bedrooms total

2. COUNT BATHROOMS: Look for "BATH", "BATHROOM", "ENSUITE", "POWDER"

3. CHECK FOR STUDY: Look for "STUDY", "OFFICE", "HOME OFFICE"

4. CHECK FOR LOUNGE: Look for "LOUNGE" (separate from "FAMILY")

=== VERIFY LAYOUT ===
5. Is DINING directly adjacent/connected to KITCHEN? (should share wall or be open plan)
6. Is GARAGE at the BOTTOM/FRONT of the image?
7. Is ALFRESCO at TOP and OUTSIDE the main building envelope?
8. Is MASTER SUITE at the TOP/REAR of the plan?
9. Is there a WIP or PANTRY? (should be only ONE, near kitchen)
10. Are there any duplicate rooms? (like two WIPs)

=== MEASURE BUILDING DIMENSIONS ===
11. Estimate the TOTAL building width (left wall to right wall, excluding alfresco)
12. Estimate the TOTAL building depth (front to rear, excluding alfresco)
13. Expected building: {building_width:.1f}m wide × {building_depth:.1f}m deep
14. Does the building FILL the expected envelope or is it much narrower?

=== EXPECTED VALUES ===
- Bedrooms: {bedrooms}
- Bathrooms: {bathrooms}
- Study required: {has_study_req}
- Lounge required: {living_areas >= 2}
- Powder room required: {has_powder_req}
- Building width should be: ~{building_width:.1f}m (±1m tolerance)
- Building depth should be: ~{building_depth:.1f}m (±1m tolerance)

=== ISSUES TO FLAG ===
- Wrong bedroom count (very important!)
- Dining NOT adjacent to Kitchen
- Duplicate rooms (two WIPs, two Powders, etc.)
- Missing required rooms
- Building much NARROWER than expected (wasting side setback space)

Return ONLY this JSON:
{{
    "bedroom_count": <exact number of bedrooms you counted>,
    "bedroom_list": ["list each bedroom label you found"],
    "bathroom_count": <number>,
    "has_study": <true/false>,
    "has_lounge": <true/false>,
    "has_powder": <true/false>,
    "has_wip": <true/false>,
    "wip_count": <number of WIP/pantry rooms>,
    "dining_adjacent_kitchen": <true/false>,
    "garage_at_front": <true/false>,
    "alfresco_outside": <true/false>,
    "master_at_rear": <true/false>,
    "has_external_dimensions": <true/false if you see dimension labels outside the plan>,
    "estimated_building_width": <your estimate in meters>,
    "estimated_building_depth": <your estimate in meters>,
    "fills_envelope": <true if building uses most of the {building_width:.1f}m width, false if much narrower>,
    "issues": ["list ALL problems found"]
}}"""

        response = client.models.generate_content(
            model=NANO_BANANA_MODEL,
            contents=[img, analysis_prompt],
            config=types.GenerateContentConfig(temperature=0.1)
        )
        
        # Parse response
        text = response.text.strip()
        text = _extract_json_from_response(text)
        
        result = json.loads(text)
        
        # Add auto-detected issues based on requirements
        issues = result.get('issues', [])
        
        # Check bedroom count
        actual_beds = result.get('bedroom_count', 0)
        if actual_beds != bedrooms:
            issues.append(f"BEDROOM COUNT WRONG: Found {actual_beds}, expected {bedrooms}")
        
        # Check WIP count (should be 0 or 1)
        wip_count = result.get('wip_count', 0)
        if wip_count > 1:
            issues.append(f"DUPLICATE WIP: Found {wip_count} pantries, should be only 1")
        
        # Check study if required
        if has_study_req and not result.get('has_study', False):
            issues.append("MISSING STUDY: Study/Home Office required but not found")
        
        # Check lounge if required
        if living_areas >= 2 and not result.get('has_lounge', False):
            issues.append("MISSING LOUNGE: 2 living areas required (LOUNGE + FAMILY)")
        
        # Check kitchen-dining
        if not result.get('dining_adjacent_kitchen', True):
            issues.append("KITCHEN-DINING SEPARATED: Must be adjacent for open plan")
        
        # Check building width utilization (should be within 2m of expected)
        estimated_width = result.get('estimated_building_width', 0)
        if estimated_width and estimated_width < building_width - 2.0:
            issues.append(
                f"BUILDING TOO NARROW: Estimated {estimated_width:.1f}m but should be {building_width:.1f}m. "
                f"Use FULL width!"
            )
        
        result['issues'] = issues
        result['expected_width'] = building_width
        result['expected_depth'] = building_depth
        
        logger.info(
            f"Image analysis: {result.get('bedroom_count')} beds "
            f"({result.get('bedroom_list', [])}), "
            f"est. width: {estimated_width}m (expected {building_width:.1f}m), "
            f"dining-kitchen adjacent: {result.get('dining_adjacent_kitchen')}, "
            f"issues: {len(issues)}"
        )
        return result
        
    except Exception as e:
        logger.warning(f"Image analysis failed: {e}")
        import traceback
        traceback.print_exc()
        return {
            "bedroom_count": 0,
            "issues": [f"Could not analyze image: {str(e)}"]
        }


# =============================================================================
# JSON EXTRACTION
# =============================================================================

def extract_floor_plan_json(
    requirements: Dict[str, Any],
    building_width: float,
    building_depth: float,
    sample_json: str = None
) -> Dict[str, Any]:
    """
    Generate JSON floor plan data from requirements.
    
    Args:
        requirements: User requirements
        building_width: Building envelope width
        building_depth: Building envelope depth
        sample_json: Optional sample JSON for format reference
    
    Returns:
        Floor plan JSON with rooms, coordinates, dimensions
    """
    from google.genai import types
    
    client = get_gemini_client()
    
    bedrooms = requirements.get('bedrooms', 4)
    bathrooms = requirements.get('bathrooms', 2)
    garage_spaces = requirements.get('garage_spaces', 2)
    has_study = requirements.get('home_office', False) or requirements.get('has_study', False)
    living_areas = requirements.get('living_areas', 1)
    
    prompt = f"""Generate JSON for a {bedrooms}-bedroom floor plan.

Building: {building_width:.1f}m wide × {building_depth:.1f}m deep
Requirements: {bedrooms} beds, {bathrooms} baths, {garage_spaces}-car garage
Study: {'Yes' if has_study else 'No'}
Living areas: {living_areas}

COORDINATE SYSTEM:
- x=0 is LEFT edge
- y=0 is FRONT (street/garage side)
- Garage at low y values (front)
- Master at high y values (rear)

REQUIRED ROOMS:
- garage, entry, master_suite, ensuite, wir
- bed_2, bed_3{', bed_4' if bedrooms >= 4 else ''}
- bathroom, kitchen, dining, family
- laundry, hallway, powder
{f'- lounge' if living_areas >= 2 else ''}
{f'- study' if has_study else ''}
- alfresco (outside building, y > {building_depth:.1f})

Generate this EXACT structure:
{{
    "design_name": "{bedrooms} Bedroom Modern Home",
    "description": "...",
    "rooms": [
        {{
            "id": "garage_01",
            "type": "garage",
            "name": "Double Garage",
            "x": <number>,
            "y": <number>,
            "width": <number>,
            "depth": <number>,
            "area": <number>,
            "floor": 0
        }},
        // ... all other rooms
    ],
    "summary": {{
        "total_area": <number>,
        "living_area": <number>,
        "bedroom_count": {bedrooms},
        "bathroom_count": {bathrooms},
        "garage_spaces": {garage_spaces}
    }}
}}

RULES:
- NO overlapping rooms
- All rooms (except alfresco) within {building_width:.1f}m × {building_depth:.1f}m
- Dining MUST be adjacent to Kitchen
- area = width × depth

Return ONLY valid JSON, no other text."""

    try:
        response = client.models.generate_content(
            model=NANO_BANANA_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.2)
        )
        
        text = response.text.strip()
        text = _extract_json_from_response(text)
        
        floor_plan = json.loads(text)
        
        # Validate and sanitize
        floor_plan = _sanitize_floor_plan_json(floor_plan, bedrooms, bathrooms)
        
        return floor_plan
        
    except Exception as e:
        logger.error(f"JSON extraction failed: {e}")
        return _create_fallback_json(bedrooms, bathrooms, garage_spaces)


def _extract_json_from_response(text: str) -> str:
    """Extract JSON from a response that may contain markdown."""
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    return text.strip()


def _sanitize_floor_plan_json(
    floor_plan: Dict[str, Any], 
    expected_beds: int,
    expected_baths: int
) -> Dict[str, Any]:
    """Clean up and validate floor plan JSON."""
    if 'rooms' not in floor_plan:
        floor_plan['rooms'] = []
    
    for room in floor_plan.get('rooms', []):
        # Calculate area if missing
        if 'area' not in room and 'width' in room and 'depth' in room:
            room['area'] = round(room['width'] * room['depth'], 1)
        
        # Default floor to 0
        if 'floor' not in room:
            room['floor'] = 0
        
        # Add empty lists for doors/windows/features
        for field in ['doors', 'windows', 'features']:
            if field not in room:
                room[field] = []
    
    # Validate bedroom count
    bedroom_types = ['bedroom', 'master_bedroom', 'master_suite', 'master', 'bed_2', 'bed_3', 'bed_4']
    bed_count = sum(1 for r in floor_plan.get('rooms', []) 
                   if any(bt in r.get('type', '').lower().replace(' ', '_') for bt in bedroom_types))
    
    if bed_count != expected_beds:
        logger.warning(f"JSON bedroom count mismatch: got {bed_count}, expected {expected_beds}")
        floor_plan['_bedroom_count_warning'] = f"Generated {bed_count}, expected {expected_beds}"
    
    return floor_plan


def _create_fallback_json(bedrooms: int, bathrooms: int, garage_spaces: int) -> Dict[str, Any]:
    """Create minimal fallback JSON when extraction fails."""
    return {
        'design_name': f'{bedrooms} Bedroom Home',
        'rooms': [],
        'summary': {
            'bedroom_count': bedrooms,
            'bathroom_count': bathrooms,
            'garage_spaces': garage_spaces
        },
        '_error': 'JSON extraction failed'
    }


# =============================================================================
# IMAGE GENERATION
# =============================================================================

def generate_floor_plan_image(
    prompt: str,
    sample_images: List = None,
    aspect_ratio: str = "3:4",
    temperature: float = 0.3
) -> Optional[bytes]:
    """
    Generate a floor plan image using Gemini.
    
    Args:
        prompt: Detailed generation prompt
        sample_images: Optional list of (label, PIL.Image) tuples for reference
        aspect_ratio: Image aspect ratio ("3:4", "4:3", "1:1")
        temperature: Generation temperature (lower = more consistent)
    
    Returns:
        Image bytes (PNG), or None if generation failed
    """
    from google.genai import types
    
    client = get_gemini_client()
    
    # Build content with sample images
    content_parts = []
    
    if sample_images:
        content_parts.append("=== REFERENCE FLOOR PLANS (follow style and layout patterns) ===\n")
        for label, img in sample_images[:8]:
            content_parts.append(f"{label}:")
            content_parts.append(img)
        content_parts.append("\n")
    
    content_parts.append(prompt)
    
    try:
        response = client.models.generate_content(
            model=NANO_BANANA_PRO_MODEL,
            contents=content_parts,
            config=types.GenerateContentConfig(
                temperature=temperature,
                response_modalities=["IMAGE", "TEXT"],
                image_config=types.ImageConfig(
                    image_size=DEFAULT_IMAGE_SIZE,
                    aspect_ratio=aspect_ratio,
                ),
            )
        )
        
        # Extract image from response
        for part in response.candidates[0].content.parts:
            if hasattr(part, 'inline_data') and part.inline_data:
                logger.info("Successfully generated floor plan image")
                return part.inline_data.data
        
        logger.warning("No image in Gemini response")
        return None
        
    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def retry_image_generation(
    requirements: Dict[str, Any],
    sample_images: List,
    building_width: float,
    building_depth: float,
    room_sizes: Dict[str, Dict[str, float]],
    aspect_ratio: str
) -> Optional[bytes]:
    """Retry image generation with simplified prompt."""
    
    bedrooms = requirements.get('bedrooms', 4)
    bathrooms = requirements.get('bathrooms', 2)
    living_areas = requirements.get('living_areas', 1)
    has_study = requirements.get('home_office', False)
    has_powder = (bathrooms % 1) != 0
    
    prompt = f"""Generate Australian floor plan.

BUILDING: **{building_width:.1f}m wide** × {building_depth:.1f}m deep
Use FULL {building_width:.1f}m width!

ROOMS:
• {bedrooms} BEDROOMS: MASTER (rear) + BED 2 + BED 3{' + BED 4' if bedrooms >= 4 else ''}
• GARAGE at front
• KITCHEN + DINING (adjacent!) + FAMILY
{f"• LOUNGE (2nd living area)" if living_areas >= 2 else ""}
{f"• STUDY" if has_study else ""}
• ENSUITE + BATH + LAUNDRY
• ENTRY (1.2m - 3.0m wide)
• HALLWAY (1.2m - 3.0m wide)
{f"• POWDER (ONE only - guest WC near Entry/Living)" if has_powder else ""}
• ALFRESCO - OUTSIDE at rear

LAYOUT:
• PORTRAIT orientation (taller than wide)
• Building is **{building_width:.1f}m wide** (use FULL width!)
• Garage at BOTTOM (front/street)
• Master + Alfresco at TOP (rear/private)
• DINING must touch KITCHEN
• Only ONE pantry/butler if included (near Kitchen)

IMAGE:
• 4K resolution, white background, black walls
• Room labels + dimensions INSIDE rooms only
• NO external dimension labels
• Count: {bedrooms} BEDROOMS total"""

    return generate_floor_plan_image(
        prompt,
        sample_images[:3] if sample_images else None,
        aspect_ratio,
        temperature=0.2
    )


# =============================================================================
# PROMPT BUILDING
# =============================================================================

def build_generation_prompt(
    requirements: Dict[str, Any],
    building_width: float,
    building_depth: float,
    setbacks: Dict[str, float],
    room_sizes: Dict[str, Dict[str, float]],
    attempt: int = 1,
    tile_layout: Dict[str, Any] = None  # NEW: Optional tile layout
) -> str:
    """
    Build the main floor plan generation prompt.
    
    Args:
        requirements: User requirements
        building_width: Building envelope width
        building_depth: Building envelope depth  
        setbacks: Setback values applied
        room_sizes: Calculated room sizes
        attempt: Generation attempt number (for retry emphasis)
        tile_layout: Optional pre-calculated tile layout (NEW)
    
    Returns:
        Complete prompt string for Gemini
    """
    # NEW: If tile layout provided, use the tile-based prompt
    if tile_layout and USE_TILE_LAYOUT:
        return build_tile_layout_prompt(
            tile_layout, requirements, building_width, building_depth, setbacks
        )
    
    # Original prompt generation (fallback)
    land_width = requirements.get('land_width', 14)
    land_depth = requirements.get('land_depth', 25)
    bedrooms = requirements.get('bedrooms', 4)
    bathrooms = requirements.get('bathrooms', 2)
    garage_spaces = requirements.get('garage_spaces', 2)
    has_alfresco = requirements.get('outdoor_entertainment', True)
    has_study = requirements.get('home_office', False) or requirements.get('has_study', False)
    living_areas = requirements.get('living_areas', 1)
    council = requirements.get('council', '')
    
    # Powder room only when bathrooms is fractional (2.5, 3.5, etc.)
    has_powder = (bathrooms % 1) != 0  # True if has decimal part
    
    meta = room_sizes.get('_meta', {})
    has_wip = meta.get('has_wip', False)
    
    # Zone calculations
    garage = room_sizes['garage']
    master = room_sizes['master']
    family = room_sizes['family']
    
    front_zone_depth = garage['depth']
    rear_zone_depth = max(master['depth'], family['depth'])
    middle_zone_depth = building_depth - front_zone_depth - rear_zone_depth - 0.2
    
    # Bedroom emphasis for retries
    bedroom_emphasis = ""
    if attempt > 1:
        bedroom_emphasis = f"""
⚠️ CRITICAL - PREVIOUS ATTEMPT FAILED BEDROOM COUNT ⚠️
You MUST include EXACTLY {bedrooms} bedrooms:
1. MASTER SUITE
2. BED 2
3. BED 3
{f'4. BED 4 - DO NOT FORGET!' if bedrooms >= 4 else ''}
Count your bedrooms before generating!
"""

    prompt = f"""Expert Australian architect. Generate floor plan with EXACT dimensions.

{bedroom_emphasis}

=== BUILDING ENVELOPE (MUST USE FULL WIDTH) ===
Land: {land_width}m × {land_depth}m
Setbacks: Front={setbacks.get('front', 6.0)}m, Rear={setbacks.get('rear', 1.5)}m, Sides={setbacks.get('side', 0.9)}m each
{f"Council: {council}" if council else ""}

⚠️ BUILDING MUST BE EXACTLY: **{building_width:.1f}m WIDE × {building_depth:.1f}m DEEP**
- The building MUST fill the full {building_width:.1f}m width (side setbacks are only {setbacks.get('side', 0.9)}m each)
- DO NOT make the building narrower than {building_width:.1f}m
- Total area: {building_width * building_depth:.0f}m²

=== REQUIREMENTS ===
• Bedrooms: **{bedrooms}** (Master + {bedrooms-1} minor)
• Bathrooms: {bathrooms}
• Living: **{living_areas}** {'(LOUNGE + FAMILY)' if living_areas >= 2 else '(Family only)'}
• Garage: {garage_spaces}-car
• Study: **{'YES' if has_study else 'NO'}**
• WIP: **{'YES' if has_wip else 'NO'}**
• Alfresco: {'YES - OUTSIDE building' if has_alfresco else 'NO'}
• Open Plan: Kitchen → Dining → Family

=== ROOM SIZES (NCC Compliant) ===
• MASTER: {room_sizes['master']['width']:.1f}m × {room_sizes['master']['depth']:.1f}m
• Bedrooms: {room_sizes['bedroom']['width']:.1f}m × {room_sizes['bedroom']['depth']:.1f}m
• GARAGE: {garage['width']:.1f}m × {garage['depth']:.1f}m
• KITCHEN: {room_sizes['kitchen']['width']:.1f}m × {room_sizes['kitchen']['depth']:.1f}m
• FAMILY: {family['width']:.1f}m × {family['depth']:.1f}m
• DINING: {room_sizes['dining']['width']:.1f}m × {room_sizes['dining']['depth']:.1f}m (ADJACENT TO KITCHEN)
{f"• LOUNGE: {room_sizes['lounge']['width']:.1f}m × {room_sizes['lounge']['depth']:.1f}m" if living_areas >= 2 and 'lounge' in room_sizes else ""}
{f"• STUDY: {room_sizes['study']['width']:.1f}m × {room_sizes['study']['depth']:.1f}m" if has_study and 'study' in room_sizes else ""}
• ENTRY: 1.2m - 3.0m wide (circulation space)
• HALLWAY: 1.2m - 3.0m wide (circulation space)
{f"• POWDER: 1.2m × 1.5m (guest WC near Entry/Living)" if has_powder else ""}
{f"• WIP/PANTRY: {room_sizes['wip']['width']:.1f}m × {room_sizes['wip']['depth']:.1f}m (ONE only, near Kitchen)" if has_wip and 'wip' in room_sizes else ""}

=== LAYOUT (PORTRAIT) ===
BOTTOM = Front (Garage, Entry)
TOP = Rear (Master, Alfresco outside)

FRONT ({front_zone_depth:.1f}m): {'LOUNGE' if living_areas >= 2 else 'BED 4' if bedrooms >= 4 else 'STUDY' if has_study else 'STORE'} | ENTRY | GARAGE
MIDDLE ({middle_zone_depth:.1f}m): Bedrooms | HALLWAY | Kitchen Zone
REAR ({rear_zone_depth:.1f}m): Master+Ensuite+WIR | FAMILY+DINING
OUTSIDE: ALFRESCO

=== CRITICAL CHECKLIST ===
□ **{bedrooms} BEDROOMS** (Master + Bed 2 + Bed 3{' + Bed 4' if bedrooms >= 4 else ''})
□ DINING adjacent to KITCHEN
□ Kitchen → Dining → Family → Alfresco flow
□ ⚠️ Building MUST be **{building_width:.1f}m wide** (use FULL width, side setbacks are only {setbacks.get('side', 0.9)}m)
□ Building depth = {building_depth:.1f}m
□ PORTRAIT orientation
□ NO external dimension labels
{f"□ Exactly ONE POWDER room near Entry or Living area" if has_powder else "□ NO powder room required"}
□ {'Only ONE WIP/PANTRY near Kitchen' if has_wip else 'No pantry required'}
□ ENTRY and HALLWAY width: 1.2m - 3.0m (not less, not more)

=== IMAGE REQUIREMENTS ===
• 4K resolution, WHITE background, BLACK walls
• Room labels + dimensions INSIDE rooms only
• Label: "HALLWAY {room_sizes['hallway']['width']:.1f}m wide"
• ⚠️ DO NOT add dimension labels outside the floor plan (no "16.2m" or "22.5m" text)
• ⚠️ DO NOT add title text
• ⚠️ DO NOT add zone labels
• Only show room names and sizes INSIDE each room"""

    return prompt


# =============================================================================
# CORRECTION GENERATION (Feedback Loop)
# =============================================================================

def generate_corrected_floor_plan(
    original_image_bytes: bytes,
    image_analysis: Dict[str, Any],
    requirements: Dict[str, Any],
    building_width: float,
    building_depth: float,
    room_sizes: Dict[str, Dict[str, float]],
    sample_images: List,
    aspect_ratio: str
) -> Optional[bytes]:
    """
    Generate a corrected floor plan by feeding errors back to Gemini.
    """
    from google.genai import types
    from PIL import Image
    from io import BytesIO
    
    client = get_gemini_client()
    
    bedrooms = requirements.get('bedrooms', 4)
    bathrooms = requirements.get('bathrooms', 2)
    living_areas = requirements.get('living_areas', 1)
    has_study = requirements.get('home_office', False) or requirements.get('has_study', False)
    has_powder = (bathrooms % 1) != 0
    
    # Build list of specific issues to fix
    issues_to_fix = []
    
    # Check bedroom count from image analysis
    actual_beds = image_analysis.get('bedroom_count', 0)
    if actual_beds != bedrooms:
        issues_to_fix.append(f"WRONG BEDROOM COUNT: Image shows {actual_beds} bedrooms, MUST have {bedrooms}")
        if actual_beds < bedrooms:
            missing = bedrooms - actual_beds
            issues_to_fix.append(f"ADD {missing} MORE BEDROOM(S): Need Bed 2, Bed 3{', Bed 4' if bedrooms >= 4 else ''}")
    
    # Check kitchen-dining adjacency
    if not image_analysis.get('dining_adjacent_kitchen', True):
        issues_to_fix.append("KITCHEN-DINING NOT ADJACENT: Dining room MUST share a wall with Kitchen")
    
    # Check garage position
    if not image_analysis.get('garage_at_front', True):
        issues_to_fix.append("GARAGE WRONG POSITION: Garage must be at FRONT/BOTTOM of plan")
    
    # Check master position
    if not image_analysis.get('master_at_rear', True):
        issues_to_fix.append("MASTER WRONG POSITION: Master suite must be at REAR/TOP of plan")
    
    # Check alfresco outside
    if not image_analysis.get('alfresco_outside', True):
        issues_to_fix.append("ALFRESCO INSIDE BUILDING: Alfresco must be OUTSIDE the building envelope")
    
    # Check study if required
    if has_study and not image_analysis.get('has_study', False):
        issues_to_fix.append("MISSING STUDY: A Study/Home Office room is required")
    
    # Check lounge if 2 living areas
    if living_areas >= 2 and not image_analysis.get('has_lounge', False):
        issues_to_fix.append("MISSING LOUNGE: Need both LOUNGE and FAMILY (2 living areas required)")
    
    # Check for duplicate WIP/pantry
    wip_count = image_analysis.get('wip_count', 0)
    if wip_count > 1:
        issues_to_fix.append(f"DUPLICATE WIP: Found {wip_count} pantries, should be only 1")
    
    # Check for external dimension labels
    if image_analysis.get('has_external_dimensions', False):
        issues_to_fix.append("EXTERNAL DIMENSIONS: Remove dimension labels from outside the floor plan")
    
    # Check building width
    if not image_analysis.get('fills_envelope', True):
        estimated_width = image_analysis.get('estimated_building_width', 0)
        issues_to_fix.append(
            f"BUILDING TOO NARROW: Currently ~{estimated_width:.1f}m but MUST be {building_width:.1f}m wide. "
            f"Use the FULL width!"
        )
    
    if not issues_to_fix:
        logger.info("No issues to fix in image analysis")
        return None
    
    # Build correction prompt
    issues_text = "\n".join([f"❌ {issue}" for issue in issues_to_fix])
    
    correction_prompt = f"""CORRECT this floor plan. The previous attempt has these errors:

{issues_text}

=== REQUIRED CORRECTIONS ===
1. Fix ALL issues listed above
2. Keep the same general layout style
3. Building MUST be {building_width:.1f}m wide × {building_depth:.1f}m deep
4. {bedrooms} bedrooms total (Master + {bedrooms-1} minor)

=== CORRECTED PLAN REQUIREMENTS ===
• EXACT building size: {building_width:.1f}m × {building_depth:.1f}m
• {bedrooms} BEDROOMS: Master (rear) + Bed 2 + Bed 3{' + Bed 4' if bedrooms >= 4 else ''}
• Kitchen → Dining (ADJACENT!) → Family → Alfresco flow
• Garage at FRONT, Master at REAR
• Room labels INSIDE only, NO external dimensions

Generate the CORRECTED floor plan image."""

    # Build content with original image and samples
    content_parts = []
    
    # Show original image with issues
    content_parts.append("=== ORIGINAL IMAGE WITH ISSUES ===")
    original_img = Image.open(BytesIO(original_image_bytes))
    content_parts.append(original_img)
    content_parts.append(f"\nIssues found:\n{issues_text}\n")
    
    # Add sample references
    if sample_images:
        content_parts.append("\n=== REFERENCE SAMPLES (correct style) ===\n")
        for label, img in sample_images[:3]:
            content_parts.append(f"{label}:")
            content_parts.append(img)
    
    content_parts.append("\n" + correction_prompt)
    
    try:
        response = client.models.generate_content(
            model=NANO_BANANA_PRO_MODEL,
            contents=content_parts,
            config=types.GenerateContentConfig(
                temperature=0.2,  # Lower temperature for more consistent corrections
                response_modalities=["IMAGE", "TEXT"],
                image_config=types.ImageConfig(
                    image_size=DEFAULT_IMAGE_SIZE,
                    aspect_ratio=aspect_ratio,
                ),
            )
        )
        
        # Extract image
        for part in response.candidates[0].content.parts:
            if hasattr(part, 'inline_data') and part.inline_data:
                logger.info("Successfully generated corrected floor plan")
                return part.inline_data.data
        
        logger.warning("No corrected image in response")
        return None
        
    except Exception as e:
        logger.error(f"Correction generation failed: {e}")
        return None


# =============================================================================
# MAIN GENERATION WITH VALIDATION (UPDATED)
# =============================================================================

def generate_with_validation(
    samples: List[Dict[str, Any]],
    requirements: Dict[str, Any],
    room_sizes: Dict[str, Dict[str, float]],
    building_width: float,
    building_depth: float,
    setbacks: Dict[str, float],
    validation_func,
    max_attempts: int = MAX_GENERATION_ATTEMPTS,
    temperature: float = 0.3
) -> Dict[str, Any]:
    """
    Generate floor plan with validation feedback loop.
    
    UPDATED: Now uses tile-based layout for mathematically correct dimensions.
    UPDATED: Now accepts temperature parameter for variant generation.
    
    Flow:
    1. Generate tile layout with exact coordinates (NEW)
    2. Build prompt using tile coordinates
    3. Generate image with Gemini
    4. Analyze generated image
    5. If issues, attempt corrections
    6. Return best result
    
    Args:
        samples: Sample floor plans for reference
        requirements: User requirements
        room_sizes: Calculated room sizes
        building_width: Building envelope width
        building_depth: Building envelope depth
        setbacks: Setback values
        validation_func: Function to validate generated plan
        max_attempts: Maximum generation attempts
        temperature: Generation temperature for AI model (default 0.3)
    
    Returns:
        Dict with floor_plan_json, image_bytes, validation, etc.
    """
    from .geometry import get_aspect_ratio
    from .sample_selection import select_best_sample
    
    bedrooms = requirements.get('bedrooms', 4)
    
    # NEW: Generate tile-based layout first
    tile_layout = get_tile_layout(building_width, building_depth, requirements)
    if tile_layout:
        logger.info("Using tile-based layout for mathematically correct dimensions")
    else:
        logger.info("Using traditional prompt-based generation")
    
    # Get aspect ratio
    aspect_ratio = get_aspect_ratio(building_width, building_depth)
    
    # Select best sample and prepare images
    best_sample = select_best_sample(samples, requirements)
    sample_images = _prepare_sample_images(samples, best_sample)
    
    best_result = None
    best_score = -1000
    previous_image = None
    previous_analysis = None
    
    for attempt in range(1, max_attempts + 1):
        logger.info(f"Generation attempt {attempt}/{max_attempts}")
        
        try:
            image_bytes = None
            
            if attempt == 1:
                # First attempt - generate from scratch
                prompt = build_generation_prompt(
                    requirements, building_width, building_depth,
                    setbacks, room_sizes, attempt,
                    tile_layout=tile_layout  # NEW: Pass tile layout
                )
                
                # Use temperature parameter passed to function
                image_bytes = generate_floor_plan_image(
                    prompt, sample_images, aspect_ratio, temperature
                )
                
                # Retry with simplified prompt if no image
                if not image_bytes:
                    logger.warning("No image generated, retrying with simplified prompt...")
                    image_bytes = retry_image_generation(
                        requirements, sample_images,
                        building_width, building_depth,
                        room_sizes, aspect_ratio
                    )
            else:
                # Subsequent attempts - try correction first
                if previous_image and previous_analysis:
                    logger.info("Attempting correction based on previous analysis...")
                    image_bytes = generate_corrected_floor_plan(
                        previous_image,
                        previous_analysis,
                        requirements,
                        building_width,
                        building_depth,
                        room_sizes,
                        sample_images,
                        aspect_ratio
                    )
                
                # If correction failed, regenerate from scratch with emphasis
                if not image_bytes:
                    logger.info("Correction failed, regenerating from scratch...")
                    prompt = build_generation_prompt(
                        requirements, building_width, building_depth,
                        setbacks, room_sizes, attempt,
                        tile_layout=tile_layout
                    )
                    image_bytes = generate_floor_plan_image(
                        prompt, sample_images, aspect_ratio, 0.2
                    )
            
            if not image_bytes:
                logger.error(f"No image generated on attempt {attempt}")
                continue
            
            # Analyze the generated image
            image_analysis = analyze_generated_image(
                image_bytes, requirements, building_width, building_depth
            )
            
            # Store for potential correction in next attempt
            previous_image = image_bytes
            previous_analysis = image_analysis
            
            # Log analysis results
            logger.info(
                f"Image analysis: {image_analysis.get('bedroom_count')} beds, "
                f"dining-kitchen adjacent: {image_analysis.get('dining_adjacent_kitchen')}, "
                f"issues: {len(image_analysis.get('issues', []))}"
            )
            
            # NEW: Use tile layout JSON if available, otherwise extract
            if tile_layout:
                json_data = tile_layout.copy()
                # Remove internal _tile_layout object before storing
                json_data.pop('_tile_layout', None)
            else:
                json_data = extract_floor_plan_json(
                    requirements, building_width, building_depth
                )
            
            json_data['_image_analysis'] = image_analysis
            
            # Run validation
            validation = validation_func(
                json_data, requirements,
                building_width, building_depth
            )
            
            # Calculate score based on image analysis (more reliable than JSON)
            score = 100
            
            # Major deductions based on image analysis
            actual_beds = image_analysis.get('bedroom_count', 0)
            expected_beds = requirements.get('bedrooms', 4)
            if actual_beds != expected_beds:
                score -= 50  # Big penalty for wrong bedroom count
                logger.warning(f"Bedroom mismatch: got {actual_beds}, expected {expected_beds}")
            
            if not image_analysis.get('dining_adjacent_kitchen', True):
                score -= 30  # Big penalty for broken open plan
                logger.warning("Kitchen-Dining not adjacent")
            
            if not image_analysis.get('fills_envelope', True):
                score -= 25  # Penalty for not using full building width
                estimated_width = image_analysis.get('estimated_building_width', 0)
                logger.warning(f"Building too narrow: ~{estimated_width}m vs expected {building_width:.1f}m")
            
            if not image_analysis.get('garage_at_front', True):
                score -= 20
            
            if not image_analysis.get('master_at_rear', True):
                score -= 15
            
            # Deduct for validation errors/warnings
            score -= len(validation.get('errors', [])) * 10
            score -= len(validation.get('warnings', [])) * 2
            
            # Deduct for issues found in analysis
            score -= len(image_analysis.get('issues', [])) * 5
            
            # NEW: Bonus for using tile layout (guaranteed correct dimensions)
            if tile_layout:
                score += 10
            
            logger.info(f"Attempt {attempt} score: {score}")
            
            result = {
                'floor_plan_json': json_data,
                'image_bytes': image_bytes,
                'validation': validation,
                'image_analysis': image_analysis,
                'building_width': building_width,
                'building_depth': building_depth,
                'attempt': attempt,
                'score': score,
                'used_tile_layout': tile_layout is not None
            }
            
            if score > best_score:
                best_score = score
                best_result = result
            
            # Check if good enough (score >= 80 means no major issues)
            if score >= 80:
                logger.info(f"Good result on attempt {attempt} (score: {score})")
                return result
            
            # If bedroom count is correct, kitchen-dining adjacent, and fills envelope, accept it
            if (actual_beds == expected_beds and 
                image_analysis.get('dining_adjacent_kitchen', False) and
                image_analysis.get('fills_envelope', True)):
                logger.info(f"Acceptable result on attempt {attempt}")
                return result
            
            # Log what needs fixing
            if actual_beds != expected_beds:
                logger.warning(f"Need to fix: bedroom count ({actual_beds} vs {expected_beds})")
            if not image_analysis.get('dining_adjacent_kitchen', True):
                logger.warning("Need to fix: kitchen-dining adjacency")
            if not image_analysis.get('fills_envelope', True):
                logger.warning(f"Need to fix: building width (use full {building_width:.1f}m)")
            
        except Exception as e:
            logger.error(f"Attempt {attempt} failed: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    # Return best result
    if best_result:
        logger.warning(f"Using best result (score: {best_score}) after {max_attempts} attempts")
        return best_result
    
    raise RuntimeError(f"Could not generate floor plan after {max_attempts} attempts")


def _prepare_sample_images(
    samples: List[Dict[str, Any]], 
    best_sample: Dict[str, Any] = None
) -> List:
    """Prepare sample images for Gemini input."""
    from PIL import Image
    from io import BytesIO
    
    sample_images = []
    
    # Add best sample first
    if best_sample and best_sample.get('image_base64'):
        try:
            img_bytes = base64.b64decode(best_sample['image_base64'])
            img = Image.open(BytesIO(img_bytes))
            sample_images.append((f"PRIMARY: {best_sample.get('filename')}", img))
        except Exception as e:
            logger.warning(f"Could not load best sample image: {e}")
    
    # Add other samples
    for sample in samples[:8]:
        if sample == best_sample or len(sample_images) >= 8:
            continue
        if sample.get('image_base64'):
            try:
                img_bytes = base64.b64decode(sample['image_base64'])
                img = Image.open(BytesIO(img_bytes))
                sample_images.append((f"Sample: {sample.get('filename')}", img))
            except:
                pass
    
    return sample_images
