# backend/app/services/sample_selection.py
# Smart sample plan selection algorithm
# Scores and ranks sample floor plans based on requirement matching

from typing import List, Optional, Dict, Any, Tuple
import logging

from .council_validation import calculate_building_envelope

logger = logging.getLogger(__name__)

# =============================================================================
# SCORING WEIGHTS
# =============================================================================

# How important each factor is (higher = more important)
WEIGHTS = {
    'bedroom_match': 100,      # Exact bedroom count is critical
    'bathroom_match': 50,      # Bathroom count is important
    'area_per_10m2': 1,        # Area similarity (1 point per 10m² difference)
    'study_missing': 30,       # Penalty if study required but not in sample
    'lounge_missing': 40,      # Penalty if 2 living areas but no lounge
    'aspect_ratio': 20,        # Aspect ratio similarity
    'has_image_bonus': -10,    # Bonus for having reference image (negative = good)
}


# =============================================================================
# SAMPLE ANALYSIS
# =============================================================================

def analyze_sample(sample: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze a sample floor plan and extract key metrics.
    
    Args:
        sample: Sample dict with 'json_data', 'image_bytes', etc.
    
    Returns:
        Dict with bedroom_count, bathroom_count, area, dimensions, etc.
    """
    json_data = sample.get('json_data', {})
    metadata = json_data.get('metadata', {})
    rooms = json_data.get('rooms', [])
    
    # Count bedrooms
    bedroom_types = ['bedroom', 'master_bedroom', 'master_suite', 'master', 'bed']
    bedroom_count = metadata.get('bedrooms')
    if bedroom_count is None:
        bedroom_count = sum(1 for r in rooms 
                          if any(bt in r.get('type', '').lower() for bt in bedroom_types))
    
    # Count bathrooms
    bathroom_types = ['bathroom', 'ensuite', 'bath']
    bathroom_count = metadata.get('bathrooms')
    if bathroom_count is None:
        bathroom_count = sum(1 for r in rooms 
                           if any(bt in r.get('type', '').lower() for bt in bathroom_types))
    
    # Check for optional rooms
    has_study = any('study' in r.get('type', '').lower() or 
                   'office' in r.get('type', '').lower() for r in rooms)
    has_lounge = any('lounge' in r.get('type', '').lower() for r in rooms)
    has_theatre = any('theatre' in r.get('type', '').lower() or 
                     'media' in r.get('type', '').lower() for r in rooms)
    has_wip = any('pantry' in r.get('type', '').lower() or 
                 'wip' in r.get('type', '').lower() for r in rooms)
    
    # Calculate dimensions
    if rooms:
        width = max(r.get('x', 0) + r.get('width', 0) for r in rooms)
        depth = max(r.get('y', 0) + r.get('depth', 0) for r in rooms)
        area = width * depth
    else:
        width, depth, area = 0, 0, 0
    
    return {
        'filename': sample.get('filename'),
        'bedroom_count': bedroom_count,
        'bathroom_count': bathroom_count,
        'has_study': has_study,
        'has_lounge': has_lounge,
        'has_theatre': has_theatre,
        'has_wip': has_wip,
        'has_image': 'image_bytes' in sample or 'image_base64' in sample,
        'width': width,
        'depth': depth,
        'area': area,
        'aspect_ratio': depth / width if width > 0 else 1,
        'room_count': len(rooms)
    }


# =============================================================================
# SCORING FUNCTIONS
# =============================================================================

def score_sample(
    sample_analysis: Dict[str, Any],
    requirements: Dict[str, Any],
    target_area: float,
    target_aspect_ratio: float
) -> float:
    """
    Calculate a match score for a sample against requirements.
    
    Lower score = better match.
    
    Args:
        sample_analysis: Output from analyze_sample()
        requirements: User requirements dict
        target_area: Target building area in m²
        target_aspect_ratio: Target depth/width ratio
    
    Returns:
        Score (lower is better)
    """
    score = 0.0
    
    target_beds = requirements.get('bedrooms', 4)
    target_baths = requirements.get('bathrooms', 2)
    has_study = requirements.get('home_office', False) or requirements.get('has_study', False)
    living_areas = requirements.get('living_areas', 1)
    
    # Bedroom match (most important)
    bed_diff = abs(sample_analysis['bedroom_count'] - target_beds)
    score += bed_diff * WEIGHTS['bedroom_match']
    
    # Bathroom match
    bath_diff = abs(sample_analysis['bathroom_count'] - target_baths)
    score += bath_diff * WEIGHTS['bathroom_match']
    
    # Area similarity
    area_diff = abs(sample_analysis['area'] - target_area)
    score += (area_diff / 10) * WEIGHTS['area_per_10m2']
    
    # Study requirement
    if has_study and not sample_analysis['has_study']:
        score += WEIGHTS['study_missing']
    
    # Living areas (lounge requirement)
    if living_areas >= 2 and not sample_analysis['has_lounge']:
        score += WEIGHTS['lounge_missing']
    
    # Aspect ratio similarity
    ratio_diff = abs(sample_analysis['aspect_ratio'] - target_aspect_ratio)
    score += ratio_diff * WEIGHTS['aspect_ratio']
    
    # Bonus for having image (negative weight = reduces score = better)
    if sample_analysis['has_image']:
        score += WEIGHTS['has_image_bonus']
    
    return score


# =============================================================================
# MAIN SELECTION FUNCTION
# =============================================================================

def select_best_sample(
    samples: List[Dict[str, Any]], 
    requirements: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Select the best matching sample floor plan based on requirements.
    
    Scores all samples and returns the one with lowest score (best match).
    
    Args:
        samples: List of sample dicts from load_all_sample_plans()
        requirements: User requirements dict with bedrooms, bathrooms, etc.
    
    Returns:
        Best matching sample dict, or None if no samples available
    """
    if not samples:
        logger.warning("No samples provided for selection")
        return None
    
    # Calculate target building dimensions
    land_width = requirements.get('land_width', 14)
    land_depth = requirements.get('land_depth', 25)
    council = requirements.get('council')
    
    building_width, building_depth, _ = calculate_building_envelope(
        land_width, land_depth, council
    )
    target_area = building_width * building_depth
    target_aspect_ratio = building_depth / building_width if building_width > 0 else 1
    
    # Score all samples
    scored_samples = []
    
    for sample in samples:
        analysis = analyze_sample(sample)
        
        # Skip samples with no rooms
        if analysis['room_count'] == 0:
            continue
        
        score = score_sample(analysis, requirements, target_area, target_aspect_ratio)
        
        scored_samples.append({
            'sample': sample,
            'analysis': analysis,
            'score': score
        })
    
    if not scored_samples:
        logger.warning("No valid samples to select from")
        return None
    
    # Sort by score (lowest first)
    scored_samples.sort(key=lambda x: x['score'])
    
    best = scored_samples[0]
    logger.info(
        f"Selected best sample: {best['analysis']['filename']} "
        f"(score={best['score']:.1f}, "
        f"{best['analysis']['bedroom_count']}bed/{best['analysis']['bathroom_count']}bath, "
        f"{best['analysis']['area']:.0f}m², "
        f"study={best['analysis']['has_study']}, "
        f"lounge={best['analysis']['has_lounge']})"
    )
    
    # Log top 3 for debugging
    for i, s in enumerate(scored_samples[:3]):
        logger.debug(
            f"  #{i+1}: {s['analysis']['filename']} - "
            f"score={s['score']:.1f}, "
            f"{s['analysis']['bedroom_count']}bed"
        )
    
    return best['sample']


def select_top_samples(
    samples: List[Dict[str, Any]], 
    requirements: Dict[str, Any],
    count: int = 3
) -> List[Dict[str, Any]]:
    """
    Select the top N matching samples.
    
    Useful for providing multiple reference images to AI generation.
    
    Args:
        samples: List of sample dicts
        requirements: User requirements
        count: Number of samples to return
    
    Returns:
        List of top matching samples (up to count)
    """
    if not samples:
        return []
    
    # Calculate targets
    land_width = requirements.get('land_width', 14)
    land_depth = requirements.get('land_depth', 25)
    council = requirements.get('council')
    
    building_width, building_depth, _ = calculate_building_envelope(
        land_width, land_depth, council
    )
    target_area = building_width * building_depth
    target_aspect_ratio = building_depth / building_width if building_width > 0 else 1
    
    # Score and sort
    scored = []
    for sample in samples:
        analysis = analyze_sample(sample)
        if analysis['room_count'] == 0:
            continue
        score = score_sample(analysis, requirements, target_area, target_aspect_ratio)
        scored.append({'sample': sample, 'score': score})
    
    scored.sort(key=lambda x: x['score'])
    
    return [s['sample'] for s in scored[:count]]


# =============================================================================
# FILTERING FUNCTIONS
# =============================================================================

def filter_samples_by_bedrooms(
    samples: List[Dict[str, Any]], 
    min_beds: int = None,
    max_beds: int = None,
    exact_beds: int = None
) -> List[Dict[str, Any]]:
    """
    Filter samples by bedroom count.
    
    Args:
        samples: List of samples
        min_beds: Minimum bedroom count (inclusive)
        max_beds: Maximum bedroom count (inclusive)
        exact_beds: Exact bedroom count (overrides min/max)
    
    Returns:
        Filtered list of samples
    """
    result = []
    
    for sample in samples:
        analysis = analyze_sample(sample)
        beds = analysis['bedroom_count']
        
        if exact_beds is not None:
            if beds == exact_beds:
                result.append(sample)
        else:
            if min_beds is not None and beds < min_beds:
                continue
            if max_beds is not None and beds > max_beds:
                continue
            result.append(sample)
    
    return result


def filter_samples_with_images(samples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return only samples that have reference images."""
    return [s for s in samples if 'image_bytes' in s or 'image_base64' in s]


def get_sample_summary(samples: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Get a summary of available samples.
    
    Returns:
        Dict with counts by bedroom, total samples, etc.
    """
    if not samples:
        return {'total': 0, 'by_bedroom': {}, 'with_images': 0}
    
    by_bedroom = {}
    with_images = 0
    
    for sample in samples:
        analysis = analyze_sample(sample)
        beds = analysis['bedroom_count']
        
        if beds not in by_bedroom:
            by_bedroom[beds] = 0
        by_bedroom[beds] += 1
        
        if analysis['has_image']:
            with_images += 1
    
    return {
        'total': len(samples),
        'by_bedroom': dict(sorted(by_bedroom.items())),
        'with_images': with_images,
        'without_images': len(samples) - with_images
    }
