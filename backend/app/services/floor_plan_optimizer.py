# backend/app/services/floor_plan_optimizer.py
# Service for AI-powered floor plan modifications and error fixes
# Handles parsing errors, generating fix instructions, and calling Gemini for corrections

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
                f"Make the building smaller or reduce room sizes proportionally to achieve {maximum}% or less site coverage."
            )
    
    # Parking/garage space errors
    if 'parking space' in error_lower and 'below minimum' in error_lower:
        numbers = re.findall(r'(\d+)', error_text)
        if len(numbers) >= 2:
            current = numbers[0]
            required = numbers[1]
            return (
                f"ADD more parking spaces. Currently showing {current} parking space(s) but {required} are required. "
                f"Expand the garage to accommodate {required} cars."
            )
    
    # Garage width errors
    if 'garage width' in error_lower and 'below' in error_lower:
        dimensions = re.findall(r'(\d+\.?\d*)m', error_text)
        if len(dimensions) >= 2:
            current = dimensions[0]
            required = dimensions[1]
            return (
                f"WIDEN the garage. Current width is {current}m but NCC minimum is {required}m. "
                f"Increase garage width to at least {required}m while maintaining other room proportions."
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
                f"Adjust the layout to make {room_name.upper()} at least {required}m wide."
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
                f"Increase the room dimensions to achieve at least {required}m²."
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
                f"Add or rearrange bedrooms as needed to have: Master Suite + {int(required)-1} additional bedrooms."
            )
    
    # Setback errors
    if 'setback' in error_lower:
        dimensions = re.findall(r'(\d+\.?\d*)m', error_text)
        if 'front' in error_lower:
            return f"Adjust the building position to meet FRONT setback requirements. Move the building further from the front boundary."
        elif 'rear' in error_lower:
            return f"Adjust the building position to meet REAR setback requirements. Move the building further from the rear boundary."
        elif 'side' in error_lower:
            return f"Adjust the building width to meet SIDE setback requirements. Reduce the building width or reposition rooms."
    
    # Open plan flow errors
    if 'open plan' in error_lower or ('kitchen' in error_lower and 'dining' in error_lower and 'family' in error_lower):
        return (
            "Ensure proper OPEN PLAN FLOW: Kitchen → Dining → Family must be adjacent and connected. "
            "Rearrange these rooms so they share walls and create a flowing living space."
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
    
    prompt = f"""You are an expert Australian architect. CORRECT this floor plan image.

=== SPECIFIC ERROR TO FIX ===
❌ {error_text}

=== FIX INSTRUCTION ===
{fix_instruction}

=== BUILDING REQUIREMENTS (maintain these) ===
• Building envelope: {building_width:.1f}m wide × {building_depth:.1f}m deep
• Bedrooms: {bedrooms} (Master + {bedrooms-1} minor)
• Bathrooms: {bathrooms}
• Living areas: {living_areas}
• Garage: {garage_spaces}-car
• Study: {'YES' if has_study else 'NO'}
• Open plan: Kitchen → Dining → Family flow
• Garage at FRONT, Master at REAR

=== CORRECTION RULES ===
1. FIX the specific error mentioned above
2. Keep the same general layout style and room arrangement
3. Maintain all other room dimensions that aren't part of the fix
4. Ensure the corrected plan is still NCC compliant
5. Keep room labels INSIDE rooms only
6. Maintain proper room connectivity

=== IMAGE REQUIREMENTS ===
• 4K resolution
• WHITE background
• BLACK walls (external thicker than internal)
• Room labels with dimensions INSIDE rooms
• PORTRAIT orientation
• NO external dimension labels
• NO title text

Generate the CORRECTED floor plan image with the error fixed."""

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
        Returns (None, instruction, layout_data) if fix fails
    """
    from .gemini_service import get_gemini_client, NANO_BANANA_PRO_MODEL
    from google.genai import types
    from PIL import Image
    
    # Step 1: Download the current floor plan image
    logger.info(f"Downloading current image from: {image_url}")
    try:
        response = requests.get(image_url, timeout=30)
        if response.status_code != 200:
            raise Exception(f"Failed to download image: HTTP {response.status_code}")
        original_image_bytes = response.content
        original_image = Image.open(BytesIO(original_image_bytes))
    except Exception as e:
        logger.error(f"Failed to download image: {e}")
        raise
    
    # Step 2: Parse error and generate fix instruction
    fix_instruction = parse_error_to_instruction(error_text)
    logger.info(f"Fix instruction: {fix_instruction}")
    
    # Step 3: Build correction prompt
    correction_prompt = build_fix_prompt(
        error_text,
        fix_instruction,
        requirements,
        building_width,
        building_depth
    )
    
    # Step 4: Call Gemini to generate corrected image
    logger.info("Calling Gemini to generate corrected floor plan...")
    
    client = get_gemini_client()
    
    content_parts = [
        "=== ORIGINAL FLOOR PLAN (has error) ===",
        original_image,
        "\n" + correction_prompt
    ]
    
    try:
        response = client.models.generate_content(
            model=NANO_BANANA_PRO_MODEL,
            contents=content_parts,
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_modalities=["IMAGE", "TEXT"],
                image_config=types.ImageConfig(
                    image_size="4K",
                    aspect_ratio="4:3",
                ),
            )
        )
        
        # Extract generated image
        new_image_bytes = None
        for part in response.candidates[0].content.parts:
            if hasattr(part, 'inline_data') and part.inline_data:
                new_image_bytes = part.inline_data.data
                break
        
        if not new_image_bytes:
            logger.error("Gemini did not return an image")
            raise Exception("AI could not generate a corrected image")
        
        logger.info(f"Generated corrected image: {len(new_image_bytes)} bytes")
        
    except Exception as e:
        logger.error(f"Gemini generation failed: {e}")
        raise
    
    # Step 5: Update layout_data to remove the fixed error
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
        elif error_type == 'warning' and updated_layout_data['validation'].get('all_warnings'):
            updated_layout_data['validation']['all_warnings'] = [
                w for w in updated_layout_data['validation']['all_warnings'] 
                if w != error_text
            ]
            if updated_layout_data['validation'].get('summary'):
                updated_layout_data['validation']['summary']['total_warnings'] = len(
                    updated_layout_data['validation']['all_warnings']
                )
    
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
    if any(x in error_lower for x in ['adjacent', 'connectivity', 'missing']):
        return 'medium'
    
    # Hard fixes - major layout changes
    if any(x in error_lower for x in ['coverage', 'setback', 'bedroom count']):
        return 'hard'
    
    return 'medium'
