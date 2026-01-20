# backend/app/services/floor_plan_optimizer.py
# Service for AI-powered floor plan modifications and error fixes
# Handles parsing errors, generating fix instructions, and calling Gemini for corrections
#
# FIXED VERSION - Improved error handling, better prompts, more robust image generation

from typing import Dict, Any, Optional, Tuple
import logging
import re
import json
import requests
from datetime import datetime
from io import BytesIO

logger = logging.getLogger(__name__)


# =============================================================================
# ERROR PARSING AND INSTRUCTION GENERATION
# =============================================================================

def parse_error_to_instruction(error_text: str) -> str:
    """
    Parse an error/warning message and generate a fix instruction for Gemini.
    
    Args:
        error_text: The error message (e.g., "Council: Site coverage 66.0% exceeds maximum 60.0%")
    
    Returns:
        A clear instruction for Gemini to fix the issue
    """
    error_lower = error_text.lower()
    
    # Site coverage errors
    if 'site coverage' in error_lower and 'exceeds' in error_lower:
        percentages = re.findall(r'(\d+\.?\d*)%', error_text)
        if len(percentages) >= 2:
            current = percentages[0]
            maximum = percentages[1]
            return (
                f"REDUCE the building footprint. Current site coverage is {current}% but must be under {maximum}%. "
                f"Make the building SMALLER by reducing room sizes proportionally. "
                f"Keep the same room layout but make each room slightly smaller to reduce total building area."
            )
    
    # Parking/garage space errors
    if 'parking space' in error_lower and 'below minimum' in error_lower:
        numbers = re.findall(r'(\d+)', error_text)
        if len(numbers) >= 2:
            current = numbers[0]
            required = numbers[1]
            return (
                f"EXPAND the garage. Currently showing {current} parking space(s) but {required} are required. "
                f"Widen the garage to fit {required} cars side by side. A double garage needs minimum 5.4m width."
            )
    
    # Garage width errors
    if 'garage width' in error_lower and ('below' in error_lower or 'minimum' in error_lower):
        dimensions = re.findall(r'(\d+\.?\d*)m', error_text)
        if len(dimensions) >= 2:
            current = dimensions[0]
            required = dimensions[1]
            return (
                f"WIDEN the garage. Current width is {current}m but NCC minimum is {required}m. "
                f"Increase garage width to at least {required}m. For a 2-car garage, use minimum 5.5m width. "
                f"You may need to reduce width of adjacent rooms to accommodate this."
            )
    
    # Room width/dimension errors
    if ('width' in error_lower or 'dimension' in error_lower) and 'below' in error_lower:
        room_match = re.search(r'\[?(\w+)\]?\s*[-:]\s*width', error_text, re.IGNORECASE)
        room_name = room_match.group(1) if room_match else "the room"
        dimensions = re.findall(r'(\d+\.?\d*)m', error_text)
        if len(dimensions) >= 2:
            current = dimensions[0]
            required = dimensions[1]
            return (
                f"WIDEN {room_name.upper()}. Current width is {current}m but minimum required is {required}m. "
                f"Adjust the layout to make {room_name.upper()} at least {required}m wide. "
                f"You may need to borrow space from adjacent rooms."
            )
    
    # Room area errors
    if 'area' in error_lower and ('below' in error_lower or 'under' in error_lower):
        room_match = re.search(r'\[?(\w+)\]?\s*[-:]\s*area', error_text, re.IGNORECASE)
        room_name = room_match.group(1) if room_match else "the room"
        areas = re.findall(r'(\d+\.?\d*)\s*(?:m²|sqm|m2)', error_text, re.IGNORECASE)
        if len(areas) >= 2:
            current = areas[0]
            required = areas[1]
            return (
                f"ENLARGE {room_name.upper()}. Current area is {current}m² but minimum required is {required}m². "
                f"Increase the room dimensions to achieve at least {required}m². "
                f"Make it wider and/or deeper."
            )
    
    # Connectivity/adjacency errors
    if 'should be adjacent' in error_lower or 'not adjacent' in error_lower:
        rooms = re.findall(r'(\w+)', error_text.replace('[', '').replace(']', ''))
        if len(rooms) >= 2:
            room1 = rooms[0].upper()
            # Find the last meaningful room name
            skip_words = ['to', 'be', 'adjacent', 'should', 'not', 'is', 'are', 'the']
            room2 = None
            for r in reversed(rooms):
                if r.lower() not in skip_words:
                    room2 = r.upper()
                    break
            if room2 and room1 != room2:
                return (
                    f"MOVE {room1} to be adjacent to {room2}. These rooms must share a wall. "
                    f"Rearrange the layout so {room1} and {room2} are directly next to each other."
                )
    
    # Missing room errors
    if 'missing' in error_lower:
        room_match = re.search(r'missing\s+(\w+)', error_text, re.IGNORECASE)
        room_name = room_match.group(1) if room_match else "required room"
        return (
            f"ADD the missing {room_name.upper()} room. The floor plan must include a {room_name.upper()}. "
            f"Find appropriate space and add this room to the layout."
        )
    
    # Bedroom count errors
    if 'bedroom' in error_lower and ('count' in error_lower or 'need' in error_lower or 'require' in error_lower):
        numbers = re.findall(r'(\d+)', error_text)
        if numbers:
            required = numbers[-1]
            return (
                f"Ensure there are exactly {required} BEDROOMS in the floor plan. "
                f"Add or rearrange bedrooms as needed to have: Master Suite + {int(required)-1} additional bedrooms (Bed 2, Bed 3, etc.)."
            )
    
    # Setback errors
    if 'setback' in error_lower:
        if 'front' in error_lower:
            return "Adjust the building position to meet FRONT setback requirements. Move the building further from the front boundary."
        elif 'rear' in error_lower:
            return "Adjust the building position to meet REAR setback requirements. Move the building further from the rear boundary."
        elif 'side' in error_lower:
            return "Adjust the building width to meet SIDE setback requirements. Reduce the building width or reposition rooms."
    
    # Open plan flow errors
    if 'open plan' in error_lower or ('kitchen' in error_lower and 'dining' in error_lower and 'family' in error_lower):
        return (
            "Ensure proper OPEN PLAN FLOW: Kitchen → Dining → Family must be adjacent and connected. "
            "Rearrange these rooms so they share walls and create a flowing living space."
        )
    
    # No alfresco/outdoor area
    if 'alfresco' in error_lower or 'outdoor' in error_lower:
        return (
            "ADD an ALFRESCO area at the rear of the house, adjacent to the Family room. "
            "The alfresco should be OUTSIDE the main building envelope, extending from the rear wall. "
            "Minimum size should be 24m² (e.g., 6m x 4m)."
        )
    
    # Generic fallback - use the error text directly
    return (
        f"FIX this issue: {error_text}. "
        f"Adjust the floor plan layout to resolve this problem while maintaining the overall design quality and room connectivity."
    )


def build_fix_prompt(
    error_text: str,
    fix_instruction: str,
    requirements: Dict[str, Any],
    building_width: float,
    building_depth: float
) -> str:
    """
    Build a complete correction prompt for Gemini.
    
    Args:
        error_text: The original error message
        fix_instruction: The parsed fix instruction
        requirements: Project requirements dict
        building_width: Building envelope width
        building_depth: Building envelope depth
    
    Returns:
        Complete prompt string for Gemini
    """
    bedrooms = requirements.get('bedrooms', 4)
    bathrooms = requirements.get('bathrooms', 2)
    living_areas = requirements.get('living_areas', 1)
    has_study = requirements.get('home_office', False) or requirements.get('has_study', False)
    garage_spaces = requirements.get('garage_spaces', 2)
    
    prompt = f"""You are an expert Australian residential architect. Your task is to CORRECT this floor plan image to fix a specific compliance error.

=== CRITICAL ERROR TO FIX ===
❌ ERROR: {error_text}

=== FIX INSTRUCTION ===
{fix_instruction}

=== BUILDING REQUIREMENTS (maintain these) ===
• Building envelope: {building_width:.1f}m wide × {building_depth:.1f}m deep
• Bedrooms: {bedrooms} total (1 Master Suite + {bedrooms-1} minor bedrooms labeled BED 2, BED 3, etc.)
• Bathrooms: {int(bathrooms)} (Ensuite + Main Bathroom{' + Powder room' if bathrooms % 1 != 0 else ''})
• Living areas: {living_areas} (Family room{' + Lounge' if living_areas >= 2 else ''})
• Garage: {garage_spaces}-car ({5.5 if garage_spaces >= 2 else 3.0}m minimum width)
• Study/Home Office: {'YES - required' if has_study else 'NO'}

=== LAYOUT RULES (maintain these) ===
1. Garage at FRONT/BOTTOM of plan (street side)
2. Master Suite at REAR/TOP of plan (private zone)
3. Kitchen + Dining + Family in OPEN PLAN configuration (adjacent, flowing)
4. Entry/Hallway connects garage to living areas
5. Minor bedrooms grouped together with shared bathroom access

=== CORRECTION INSTRUCTIONS ===
1. FIX ONLY the specific error mentioned above
2. MAINTAIN the same general layout style and room arrangement
3. PRESERVE room labels exactly: MASTER SUITE, BED 2, BED 3, KITCHEN, DINING, FAMILY, etc.
4. Keep dimensions labeled inside each room (e.g., "5.3m x 3.6m")
5. Ensure all rooms still fit within the {building_width:.1f}m × {building_depth:.1f}m envelope

=== IMAGE REQUIREMENTS (very important) ===
• 4K resolution, HIGH QUALITY
• WHITE background
• BLACK walls - external walls THICKER than internal walls
• Room labels INSIDE each room with dimensions
• NO dimension labels on the OUTSIDE of the building
• NO title or heading text
• PORTRAIT orientation (taller than wide)
• Clear, professional architectural drawing style

Generate the CORRECTED floor plan image with ONLY the specific error fixed."""

    return prompt


# =============================================================================
# MAIN FIX FUNCTION
# =============================================================================

def fix_floor_plan_error(
    image_url: str,
    error_text: str,
    error_type: str,
    requirements: Dict[str, Any],
    building_width: float,
    building_depth: float,
    layout_data: Dict[str, Any]
) -> Tuple[Optional[bytes], str, Dict[str, Any]]:
    """
    Fix a specific error in a floor plan using AI.
    
    This is a SYNCHRONOUS function - do not wrap with asyncio.run()
    
    Args:
        image_url: URL of the current floor plan image
        error_text: The error message to fix
        error_type: "error" or "warning"
        requirements: Project requirements dict
        building_width: Building envelope width
        building_depth: Building envelope depth
        layout_data: Current layout data dict
    
    Returns:
        Tuple of (new_image_bytes, fix_instruction, updated_layout_data)
        Raises exception if fix fails
    """
    from .gemini_service import get_gemini_client, NANO_BANANA_PRO_MODEL
    from google.genai import types
    from PIL import Image
    
    logger.info(f"=== Starting floor plan fix ===")
    logger.info(f"Error to fix: {error_text}")
    logger.info(f"Error type: {error_type}")
    logger.info(f"Image URL: {image_url}")
    
    # Step 1: Download the current floor plan image
    logger.info(f"Step 1: Downloading current image...")
    try:
        response = requests.get(image_url, timeout=60)
        if response.status_code != 200:
            raise Exception(f"Failed to download image: HTTP {response.status_code}")
        original_image_bytes = response.content
        original_image = Image.open(BytesIO(original_image_bytes))
        logger.info(f"Downloaded image: {len(original_image_bytes)} bytes, size: {original_image.size}")
    except requests.exceptions.Timeout:
        logger.error("Timeout downloading image")
        raise Exception("Timeout downloading the floor plan image")
    except Exception as e:
        logger.error(f"Failed to download image: {e}")
        raise
    
    # Step 2: Parse error and generate fix instruction
    logger.info(f"Step 2: Parsing error and generating fix instruction...")
    fix_instruction = parse_error_to_instruction(error_text)
    logger.info(f"Fix instruction: {fix_instruction}")
    
    # Step 3: Build correction prompt
    logger.info(f"Step 3: Building correction prompt...")
    correction_prompt = build_fix_prompt(
        error_text,
        fix_instruction,
        requirements,
        building_width,
        building_depth
    )
    
    # Step 4: Call Gemini to generate corrected image
    logger.info(f"Step 4: Calling Gemini ({NANO_BANANA_PRO_MODEL}) to generate corrected floor plan...")
    
    client = get_gemini_client()
    
    # Build content parts with the original image and prompt
    content_parts = [
        "Here is the ORIGINAL floor plan that needs correction:",
        original_image,
        correction_prompt
    ]
    
    try:
        response = client.models.generate_content(
            model=NANO_BANANA_PRO_MODEL,
            contents=content_parts,
            config=types.GenerateContentConfig(
                temperature=0.2,  # Low temperature for more consistent output
                response_modalities=["IMAGE", "TEXT"],
                image_config=types.ImageConfig(
                    image_size="4K",
                    aspect_ratio="3:4",  # Portrait orientation
                ),
            )
        )
        
        logger.info(f"Gemini response received")
        
        # Extract generated image from response
        new_image_bytes = None
        response_text = None
        
        if response.candidates and len(response.candidates) > 0:
            candidate = response.candidates[0]
            if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                for part in candidate.content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        new_image_bytes = part.inline_data.data
                        logger.info(f"Found inline image data: {len(new_image_bytes)} bytes")
                    elif hasattr(part, 'text') and part.text:
                        response_text = part.text
                        logger.info(f"Found text response: {response_text[:200]}...")
        
        if not new_image_bytes:
            # Log what we got
            logger.error("Gemini did not return an image")
            if response_text:
                logger.error(f"Gemini text response: {response_text}")
            
            # Check for safety blocks or other issues
            if response.candidates:
                for i, candidate in enumerate(response.candidates):
                    logger.error(f"Candidate {i}: {candidate}")
            
            raise Exception("AI could not generate a corrected image. The model may have refused or encountered an error.")
        
        logger.info(f"Step 4 complete: Generated corrected image ({len(new_image_bytes)} bytes)")
        
    except Exception as e:
        logger.error(f"Gemini generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise
    
    # Step 5: Update layout_data to remove the fixed error
    logger.info(f"Step 5: Updating layout_data to remove fixed error...")
    updated_layout_data = layout_data.copy() if layout_data else {}
    
    if updated_layout_data.get('validation'):
        if error_type == 'error' and updated_layout_data['validation'].get('all_errors'):
            updated_layout_data['validation']['all_errors'] = [
                e for e in updated_layout_data['validation']['all_errors'] 
                if e != error_text
            ]
            if updated_layout_data['validation'].get('summary'):
                updated_layout_data['validation']['summary']['total_errors'] = len(
                    updated_layout_data['validation']['all_errors']
                )
            logger.info(f"Removed error from validation. Remaining errors: {len(updated_layout_data['validation']['all_errors'])}")
            
        elif error_type == 'warning' and updated_layout_data['validation'].get('all_warnings'):
            updated_layout_data['validation']['all_warnings'] = [
                w for w in updated_layout_data['validation']['all_warnings'] 
                if w != error_text
            ]
            if updated_layout_data['validation'].get('summary'):
                updated_layout_data['validation']['summary']['total_warnings'] = len(
                    updated_layout_data['validation']['all_warnings']
                )
            logger.info(f"Removed warning from validation. Remaining warnings: {len(updated_layout_data['validation']['all_warnings'])}")
    
    # Add fix history
    if 'fix_history' not in updated_layout_data:
        updated_layout_data['fix_history'] = []
    updated_layout_data['fix_history'].append({
        'timestamp': datetime.utcnow().isoformat(),
        'error_text': error_text,
        'error_type': error_type,
        'fix_instruction': fix_instruction
    })
    
    logger.info(f"=== Floor plan fix complete ===")
    
    return new_image_bytes, fix_instruction, updated_layout_data


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_error_category(error_text: str) -> str:
    """
    Determine the category of an error for logging/analytics.
    
    Returns one of: 'coverage', 'dimensions', 'connectivity', 'count', 'compliance', 'other'
    """
    error_lower = error_text.lower()
    
    if 'coverage' in error_lower:
        return 'coverage'
    elif any(x in error_lower for x in ['width', 'depth', 'area', 'dimension', 'size']):
        return 'dimensions'
    elif any(x in error_lower for x in ['adjacent', 'connectivity', 'connected', 'flow']):
        return 'connectivity'
    elif any(x in error_lower for x in ['count', 'missing', 'need', 'require']):
        return 'count'
    elif any(x in error_lower for x in ['ncc', 'council', 'setback', 'complian']):
        return 'compliance'
    elif any(x in error_lower for x in ['alfresco', 'outdoor']):
        return 'outdoor'
    else:
        return 'other'


def estimate_fix_difficulty(error_text: str) -> str:
    """
    Estimate how difficult a fix might be.
    
    Returns: 'easy', 'medium', or 'hard'
    """
    error_lower = error_text.lower()
    
    # Easy fixes - minor dimension adjustments
    if any(x in error_lower for x in ['width', 'area']) and 'below' in error_lower:
        return 'easy'
    
    # Medium fixes - room rearrangement
    if any(x in error_lower for x in ['adjacent', 'connectivity', 'missing', 'alfresco']):
        return 'medium'
    
    # Hard fixes - major layout changes
    if any(x in error_lower for x in ['coverage', 'setback', 'bedroom count']):
        return 'hard'
    
    return 'medium'
