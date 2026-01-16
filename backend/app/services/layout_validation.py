# backend/app/services/layout_validation.py
# Internal floor plan layout validation
# Validates room connectivity, dimensions, counts, and coordinates
#
# UPDATED: Added tile-grid verification, row-sum validation, gap detection,
#          coverage checks, and integration with improved geometry functions

from typing import Dict, Any, List, Optional, Tuple
import logging

from .geometry import (
    rooms_overlap, 
    rooms_adjacent, 
    room_fits_in_envelope,
    VALIDATION_TOLERANCE,
    # NEW: Import enhanced validation functions
    verify_row_sums,
    calculate_coverage,
    find_all_overlaps,
    find_gaps,
    validate_layout_geometry,
    check_open_plan_flow
)
from .council_validation import (
    calculate_building_envelope,
    validate_floor_plan_council
)
from .NCC import (
    validate_floor_plan_ncc,
    validate_room_size,
    get_climate_zone,
    get_energy_requirements
)

logger = logging.getLogger(__name__)

# =============================================================================
# ROOM TYPE MAPPINGS
# =============================================================================

# Room types that count as bedrooms
BEDROOM_TYPES = [
    'bedroom', 'master_bedroom', 'master_suite', 'master', 
    'bed_2', 'bed_3', 'bed_4', 'bed_5', 'bed'
]

# Room types that count as bathrooms (including powder room)
BATHROOM_TYPES = [
    'bathroom', 'ensuite', 'powder', 'powder_room', 'wc'
]

# Room types that count as LIVING AREAS (for living_areas count)
# NOTE: 'sitting' is NOT a living area - it's a formal sitting room
LIVING_AREA_TYPES = [
    'lounge', 'living', 'living_room', 'family', 'family_room', 'theatre', 'media'
]

# Room types that are formal spaces (NOT counted as living areas)
FORMAL_ROOM_TYPES = [
    'sitting', 'sitting_room', 'formal_lounge'
]

# Room types that are circulation (hallways)
CIRCULATION_TYPES = [
    'hallway', 'hall', 'hall_r', 'entry', 'corridor', 'foyer'
]

# Room types that are storage
STORAGE_TYPES = [
    'robe', 'wir', 'walk_in_robe', 'linen', 'storage', 'store', 'pantry', 'wip'
]

# Required rooms for a standard dwelling
REQUIRED_ROOM_TYPES = ['garage', 'kitchen', 'family', 'laundry']

# Required adjacencies (room_types_1, room_types_2)
REQUIRED_ADJACENCIES = [
    (['master_suite', 'master_bedroom', 'master'], ['ensuite']),
    (['master_suite', 'master_bedroom', 'master'], ['wir', 'walk_in_robe']),
    (['kitchen'], ['dining']),
    (['kitchen'], ['family', 'living']),
    (['family', 'living'], ['alfresco']),
    (['garage'], ['entry', 'laundry', 'hall']),
]

# Open plan flow sequence (should be adjacent in order)
OPEN_PLAN_SEQUENCE = ['kitchen', 'dining', 'family']


# =============================================================================
# ROOM TYPE HELPERS
# =============================================================================

def normalize_room_type(room_type: str) -> str:
    """Normalize room type string for comparison."""
    if not room_type:
        return ''
    return room_type.lower().replace(' ', '_').replace('-', '_')


def is_bedroom(room: Dict) -> bool:
    """Check if a room is a bedroom type."""
    room_type = normalize_room_type(room.get('type', ''))
    room_name = normalize_room_type(room.get('name', ''))
    return any(bt in room_type or bt in room_name for bt in BEDROOM_TYPES)


def is_bathroom(room: Dict) -> bool:
    """Check if a room is a bathroom type."""
    room_type = normalize_room_type(room.get('type', ''))
    room_name = normalize_room_type(room.get('name', ''))
    return any(bt in room_type or bt in room_name for bt in BATHROOM_TYPES)


def is_alfresco(room: Dict) -> bool:
    """Check if a room is an alfresco/outdoor area."""
    room_type = normalize_room_type(room.get('type', ''))
    room_name = normalize_room_type(room.get('name', ''))
    return 'alfresco' in room_type or 'alfresco' in room_name


def is_circulation(room: Dict) -> bool:
    """Check if a room is a circulation area (hallway, entry, etc.)."""
    room_type = normalize_room_type(room.get('type', ''))
    room_name = normalize_room_type(room.get('name', ''))
    return any(ct in room_type or ct in room_name for ct in CIRCULATION_TYPES)


def is_storage(room: Dict) -> bool:
    """Check if a room is storage (robe, pantry, etc.)."""
    room_type = normalize_room_type(room.get('type', ''))
    room_name = normalize_room_type(room.get('name', ''))
    return any(st in room_type or st in room_name for st in STORAGE_TYPES)


def is_living_area(room: Dict) -> bool:
    """
    Check if a room counts as a living area.
    
    NOTE: 'sitting' rooms do NOT count as living areas.
    Living areas are: lounge, living, family, theatre, media
    """
    room_type = normalize_room_type(room.get('type', ''))
    room_name = normalize_room_type(room.get('name', ''))
    return any(lt in room_type or lt in room_name for lt in LIVING_AREA_TYPES)


def get_room_by_types(rooms: List[Dict], type_list: List[str]) -> Optional[Dict]:
    """Find first room matching any of the given types."""
    for room in rooms:
        room_type = normalize_room_type(room.get('type', ''))
        room_name = normalize_room_type(room.get('name', ''))
        for t in type_list:
            if t in room_type or t in room_name:
                return room
    return None


def get_all_rooms_by_types(rooms: List[Dict], type_list: List[str]) -> List[Dict]:
    """Find all rooms matching any of the given types."""
    result = []
    for room in rooms:
        room_type = normalize_room_type(room.get('type', ''))
        room_name = normalize_room_type(room.get('name', ''))
        for t in type_list:
            if t in room_type or t in room_name:
                result.append(room)
                break
    return result


# =============================================================================
# CONNECTIVITY VALIDATION
# =============================================================================

def validate_room_connectivity(rooms: List[Dict]) -> List[str]:
    """
    Validate that required room connections exist.
    
    Checks that rooms that should be adjacent (share a wall) actually are.
    
    Args:
        rooms: List of room dicts with x, y, width, depth, type
    
    Returns:
        List of connectivity issues found
    """
    issues = []
    
    # Build room lookup by normalized type
    room_by_type = {}
    for r in rooms:
        rtype = normalize_room_type(r.get('type', ''))
        room_by_type[rtype] = r
        # Also index by name for flexibility
        rname = normalize_room_type(r.get('name', ''))
        if rname and rname != rtype:
            room_by_type[rname] = r
    
    # Check each required adjacency
    for types1, types2 in REQUIRED_ADJACENCIES:
        room1 = None
        room2 = None
        
        # Find first matching room from types1
        for t in types1:
            if t in room_by_type:
                room1 = room_by_type[t]
                break
        
        # Find first matching room from types2
        for t in types2:
            if t in room_by_type:
                room2 = room_by_type[t]
                break
        
        # Check adjacency if both rooms exist
        if room1 and room2:
            if not rooms_adjacent(room1, room2):
                name1 = room1.get('name', room1.get('type', types1[0]))
                name2 = room2.get('name', room2.get('type', types2[0]))
                issues.append(f"{name1} should be adjacent to {name2}")
    
    return issues


def validate_open_plan_flow(rooms: List[Dict]) -> Dict[str, Any]:
    """
    Validate that open plan rooms form proper flow.
    
    Kitchen → Dining → Family should be adjacent in sequence.
    
    Returns:
        Dict with valid, connected_pairs, missing_connections
    """
    return check_open_plan_flow(rooms, OPEN_PLAN_SEQUENCE)


# =============================================================================
# DIMENSION VALIDATION (NEW)
# =============================================================================

def validate_dimensions_accuracy(
    rooms: List[Dict],
    building_width: float,
    building_depth: float
) -> Dict[str, Any]:
    """
    Validate that room dimensions are mathematically accurate.
    
    Key checks:
    - Room widths sum to building width at every row
    - No gaps in the layout
    - 100% coverage of building envelope
    
    This is the core validation for tile-based layouts.
    
    Args:
        rooms: List of room dicts with x, y, width, depth
        building_width: Expected building width
        building_depth: Building depth
    
    Returns:
        Dict with validity status and details
    """
    result = {
        'valid': True,
        'errors': [],
        'warnings': [],
        'row_sums_valid': False,
        'coverage_percent': 0,
        'gap_count': 0
    }
    
    # 1. Verify row sums (dimensions add up)
    row_check = verify_row_sums(rooms, building_width, building_depth)
    result['row_sums_valid'] = row_check['valid']
    result['row_coverage'] = row_check['coverage_percent']
    
    if not row_check['valid']:
        result['valid'] = False
        # Add first few errors
        for error in row_check['errors'][:3]:
            result['errors'].append(f"Dimension error: {error}")
    
    # 2. Calculate coverage
    coverage = calculate_coverage(rooms, building_width, building_depth)
    result['coverage_percent'] = coverage['coverage_percent']
    
    if coverage['coverage_percent'] < 95:
        result['warnings'].append(
            f"Low coverage: {coverage['coverage_percent']}% "
            f"(missing {coverage['envelope_area'] - coverage['net_covered_area']:.1f}m²)"
        )
    
    # 3. Check for gaps
    gaps = find_gaps(rooms, building_width, building_depth, grid_resolution=0.9)
    result['gap_count'] = len(gaps)
    
    if len(gaps) > 0:
        total_gap_area = sum(g.get('area', 0) for g in gaps)
        if total_gap_area > 1.0:  # More than 1m² of gaps
            result['errors'].append(f"Layout has {len(gaps)} gaps totaling {total_gap_area:.1f}m²")
            result['valid'] = False
        elif total_gap_area > 0.1:  # Small gaps (might be floating point)
            result['warnings'].append(f"Minor gaps detected: {total_gap_area:.2f}m²")
    
    # 4. Check for overlaps
    overlaps = find_all_overlaps(rooms)
    if overlaps:
        result['valid'] = False
        for r1, r2, area in overlaps[:3]:
            result['errors'].append(f"Rooms overlap: {r1} and {r2} ({area}m²)")
    
    return result


def validate_tile_grid(
    floor_plan_json: Dict[str, Any],
    building_width: float,
    building_depth: float
) -> Dict[str, Any]:
    """
    Validate tile-grid specific properties.
    
    Checks if the layout was generated with the tile system and
    validates the grid properties.
    """
    result = {
        'is_tile_layout': False,
        'valid': True,
        'grid_info': None,
        'verification': None
    }
    
    # Check for tile layout markers
    grid_info = floor_plan_json.get('grid_info')
    verification = floor_plan_json.get('verification')
    
    if grid_info:
        result['is_tile_layout'] = True
        result['grid_info'] = grid_info
        
        # Validate grid dimensions
        expected_cols = round(building_width / grid_info.get('tile_width', 0.9))
        expected_rows = round(building_depth / grid_info.get('tile_depth', 0.9))
        
        if grid_info.get('cols') != expected_cols or grid_info.get('rows') != expected_rows:
            result['warnings'] = [
                f"Grid size mismatch: {grid_info.get('cols')}×{grid_info.get('rows')} "
                f"vs expected {expected_cols}×{expected_rows}"
            ]
    
    if verification:
        result['verification'] = verification
        if not verification.get('valid', True):
            result['valid'] = False
            result['errors'] = [f"Tile verification failed: {verification.get('gaps', 0)} gaps"]
    
    return result


# =============================================================================
# MAIN VALIDATION FUNCTION
# =============================================================================

def validate_generated_plan(
    floor_plan_json: Dict[str, Any],
    requirements: Dict[str, Any],
    building_width: float,
    building_depth: float
) -> Dict[str, Any]:
    """
    Validate a generated floor plan against requirements.
    
    Performs comprehensive checks:
    - Room counts match requirements
    - All required rooms present
    - Rooms fit within building envelope
    - No overlapping rooms
    - Required adjacencies satisfied
    - NCC room size compliance
    - Dimension accuracy (row sums)
    - Gap detection
    
    Args:
        floor_plan_json: Generated floor plan with 'rooms' list
        requirements: User requirements dict
        building_width: Building envelope width
        building_depth: Building envelope depth
    
    Returns:
        Dict with:
        - valid: bool - True if no errors
        - errors: List[str] - Critical issues
        - warnings: List[str] - Non-critical issues
        - bedroom_count: int - Actual bedroom count
        - bathroom_count: int - Actual bathroom count
        - dimensions_valid: bool - True if dimensions sum correctly
        - coverage_percent: float - Percentage of envelope covered
    """
    errors = []
    warnings = []
    
    rooms = floor_plan_json.get('rooms', [])
    
    # Check for empty plan
    if not rooms:
        errors.append("No rooms in generated plan")
        return {
            'valid': False, 
            'errors': errors, 
            'warnings': warnings,
            'bedroom_count': 0,
            'bathroom_count': 0,
            'dimensions_valid': False,
            'coverage_percent': 0
        }
    
    # =========================================================================
    # 1. DIMENSION ACCURACY VALIDATION (NEW - Most Important)
    # =========================================================================
    
    dim_check = validate_dimensions_accuracy(rooms, building_width, building_depth)
    errors.extend(dim_check.get('errors', []))
    warnings.extend(dim_check.get('warnings', []))
    
    # =========================================================================
    # 2. TILE GRID VALIDATION (if applicable)
    # =========================================================================
    
    tile_check = validate_tile_grid(floor_plan_json, building_width, building_depth)
    if tile_check.get('errors'):
        errors.extend(tile_check['errors'])
    if tile_check.get('warnings'):
        warnings.extend(tile_check['warnings'])
    
    # =========================================================================
    # 3. COUNT AND VALIDATE BEDROOMS
    # =========================================================================
    
    bedrooms = [r for r in rooms if is_bedroom(r)]
    expected_beds = requirements.get('bedrooms', 4)
    
    if len(bedrooms) != expected_beds:
        errors.append(f"Bedroom count mismatch: got {len(bedrooms)}, expected {expected_beds}")
    
    # =========================================================================
    # 4. COUNT AND VALIDATE BATHROOMS
    # =========================================================================
    
    bathrooms = [r for r in rooms if is_bathroom(r)]
    expected_baths = requirements.get('bathrooms', 2)
    
    # Powder room counts as half
    powder_count = sum(1 for r in rooms if 'powder' in normalize_room_type(r.get('type', '')))
    effective_baths = len(bathrooms) - (powder_count * 0.5)
    
    if effective_baths < expected_baths - 0.5:
        warnings.append(f"Bathroom count low: got {len(bathrooms)} (effective: {effective_baths:.1f}), expected {expected_baths}")
    
    # =========================================================================
    # 5. CHECK ROOMS FIT WITHIN BUILDING ENVELOPE
    # =========================================================================
    
    for room in rooms:
        # Skip alfresco - it's outside the building
        if is_alfresco(room):
            continue
        
        if not room_fits_in_envelope(room, building_width, building_depth):
            room_name = room.get('name', room.get('type', 'Unknown'))
            max_x = room.get('x', 0) + room.get('width', 0)
            max_y = room.get('y', 0) + room.get('depth', 0)
            
            if max_x > building_width + VALIDATION_TOLERANCE:
                warnings.append(f"{room_name} exceeds width: {max_x:.1f}m > {building_width:.1f}m")
            if max_y > building_depth + VALIDATION_TOLERANCE:
                warnings.append(f"{room_name} exceeds depth: {max_y:.1f}m > {building_depth:.1f}m")
    
    # =========================================================================
    # 5. COUNT AND VALIDATE LIVING AREAS
    # =========================================================================
    
    living_areas_list = [r for r in rooms if is_living_area(r)]
    expected_living = requirements.get('living_areas', 1)
    
    if len(living_areas_list) != expected_living:
        if len(living_areas_list) < expected_living:
            errors.append(f"Living area count mismatch: got {len(living_areas_list)}, expected {expected_living}")
        else:
            # More living areas than expected is usually just a warning
            warnings.append(f"Extra living areas: got {len(living_areas_list)}, expected {expected_living}")
    
    # =========================================================================
    # 6. VERIFY REQUIRED ROOMS EXIST
    # =========================================================================
    
    required_types = REQUIRED_ROOM_TYPES.copy()
    
    if requirements.get('home_office') or requirements.get('has_study'):
        required_types.append('study')
    if requirements.get('living_areas', 1) >= 2:
        required_types.append('lounge')
    
    # Build list of existing room types
    existing_types = set()
    for r in rooms:
        existing_types.add(normalize_room_type(r.get('type', '')))
        existing_types.add(normalize_room_type(r.get('name', '')))
    
    for req_type in required_types:
        found = any(req_type in et for et in existing_types)
        if not found:
            # Check for alternative names
            if req_type == 'lounge' and any('sitting' in et for et in existing_types):
                continue
            if req_type == 'family' and any('living' in et for et in existing_types):
                continue
            errors.append(f"Missing required room: {req_type}")
    
    # =========================================================================
    # 7. CHECK ROOM CONNECTIVITY
    # =========================================================================
    
    connectivity_issues = validate_room_connectivity(rooms)
    for issue in connectivity_issues:
        warnings.append(f"Connectivity: {issue}")
    
    # =========================================================================
    # 8. OPEN PLAN FLOW CHECK
    # =========================================================================
    
    open_plan = validate_open_plan_flow(rooms)
    if not open_plan.get('valid', True):
        for missing in open_plan.get('missing_connections', []):
            warnings.append(f"Open plan: {missing[0]} not adjacent to {missing[1]}")
    
    # =========================================================================
    # 9. NCC ROOM SIZE VALIDATION
    # =========================================================================
    
    for room in rooms:
        room_type = room.get('type', room.get('name', 'unknown'))
        width = room.get('width', 0)
        depth = room.get('depth', 0)
        
        ncc_result = validate_room_size(room_type, width, depth)
        if not ncc_result['compliant']:
            room_name = room.get('name', room_type)
            for issue in ncc_result['issues']:
                warnings.append(f"NCC: {room_name} - {issue}")
    
    # =========================================================================
    # 10. CALCULATE AREA BREAKDOWN
    # =========================================================================
    
    living_area = sum(
        r.get('width', 0) * r.get('depth', 0) 
        for r in rooms 
        if is_bedroom(r) or r.get('type') in ['family', 'lounge', 'sitting', 'dining']
    )
    
    total_area = sum(
        r.get('width', 0) * r.get('depth', 0) 
        for r in rooms 
        if not is_alfresco(r)
    )
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
        'bedroom_count': len(bedrooms),
        'bathroom_count': len(bathrooms),
        'living_area_count': len(living_areas_list),
        'dimensions_valid': dim_check.get('row_sums_valid', False),
        'coverage_percent': dim_check.get('coverage_percent', 0),
        'gap_count': dim_check.get('gap_count', 0),
        'is_tile_layout': tile_check.get('is_tile_layout', False),
        'area_breakdown': {
            'living_area': round(living_area, 1),
            'total_internal': round(total_area, 1),
            'building_envelope': round(building_width * building_depth, 1)
        }
    }


# =============================================================================
# FULL VALIDATION (Council + NCC + Layout)
# =============================================================================

def run_full_validation(
    floor_plan_json: Dict[str, Any],
    requirements: Dict[str, Any],
    land_width: float,
    land_depth: float,
    land_area: float,
    council_name: Optional[str] = None,
    postcode: Optional[str] = None
) -> Dict[str, Any]:
    """
    Run comprehensive validation against all requirements.
    
    Combines:
    - Internal layout validation (dimensions, gaps, coverage)
    - Council requirements (setbacks, site coverage)
    - NCC compliance (room sizes, fire separation)
    
    Args:
        floor_plan_json: Generated floor plan
        requirements: User requirements
        land_width: Land parcel width
        land_depth: Land parcel depth
        land_area: Land parcel area
        council_name: Optional council for specific rules
        postcode: Optional postcode for energy requirements
    
    Returns:
        Comprehensive validation result with all errors/warnings
    """
    results = {
        'overall_compliant': True,
        'council_validation': None,
        'ncc_validation': None,
        'layout_validation': None,
        'all_errors': [],
        'all_warnings': []
    }
    
    # 1. Calculate building envelope
    building_width, building_depth, setbacks = calculate_building_envelope(
        land_width, land_depth, council_name
    )
    
    # 2. Internal layout validation (includes dimension accuracy)
    layout_result = validate_generated_plan(
        floor_plan_json, requirements, building_width, building_depth
    )
    results['layout_validation'] = layout_result
    results['all_errors'].extend(layout_result.get('errors', []))
    results['all_warnings'].extend(layout_result.get('warnings', []))
    
    # 3. Council validation
    council_result = validate_floor_plan_council(
        floor_plan_json,
        land_width,
        land_depth,
        land_area,
        council_name
    )
    results['council_validation'] = council_result
    results['all_errors'].extend([f"Council: {e}" for e in council_result.get('errors', [])])
    results['all_warnings'].extend([f"Council: {w}" for w in council_result.get('warnings', [])])
    
    # 4. NCC validation
    ncc_result = validate_floor_plan_ncc(
        floor_plan_json,
        storeys=requirements.get('storeys', 1),
        garage_spaces=requirements.get('garage_spaces', 2)
    )
    results['ncc_validation'] = ncc_result
    results['all_errors'].extend([f"NCC: {e}" for e in ncc_result.get('errors', [])])
    results['all_warnings'].extend([f"NCC: {w}" for w in ncc_result.get('warnings', [])])
    
    # 5. Energy requirements (informational)
    if postcode:
        climate_zone = get_climate_zone(postcode)
        if climate_zone:
            results['energy_requirements'] = get_energy_requirements(climate_zone)
            results['climate_zone'] = climate_zone.value
    
    # Determine overall compliance
    results['overall_compliant'] = (
        layout_result.get('valid', False) and 
        council_result.get('valid', False) and 
        ncc_result.get('compliant', False)
    )
    
    # Build summary
    results['summary'] = {
        'total_errors': len(results['all_errors']),
        'total_warnings': len(results['all_warnings']),
        'layout_valid': layout_result.get('valid', False),
        'dimensions_valid': layout_result.get('dimensions_valid', False),
        'coverage_percent': layout_result.get('coverage_percent', 0),
        'council_compliant': council_result.get('valid', False),
        'ncc_compliant': ncc_result.get('compliant', False),
        'bedroom_count': layout_result.get('bedroom_count', 0),
        'bathroom_count': layout_result.get('bathroom_count', 0),
        'is_tile_layout': layout_result.get('is_tile_layout', False),
        'building_envelope': {
            'width': building_width,
            'depth': building_depth,
            'area': building_width * building_depth
        },
        'setbacks': setbacks
    }
    
    return results


# =============================================================================
# QUICK VALIDATION HELPERS
# =============================================================================

def quick_validate_counts(
    floor_plan_json: Dict[str, Any],
    expected_bedrooms: int,
    expected_bathrooms: int
) -> Dict[str, Any]:
    """
    Quick validation of just bedroom and bathroom counts.
    
    Useful for fast feedback during generation.
    """
    rooms = floor_plan_json.get('rooms', [])
    
    bedrooms = [r for r in rooms if is_bedroom(r)]
    bathrooms = [r for r in rooms if is_bathroom(r)]
    
    return {
        'bedroom_count': len(bedrooms),
        'bathroom_count': len(bathrooms),
        'bedrooms_ok': len(bedrooms) == expected_bedrooms,
        'bathrooms_ok': len(bathrooms) >= expected_bathrooms
    }


def quick_validate_dimensions(
    floor_plan_json: Dict[str, Any],
    building_width: float,
    building_depth: float
) -> Dict[str, Any]:
    """
    Quick validation of dimension accuracy.
    
    Returns whether dimensions are mathematically correct.
    """
    rooms = floor_plan_json.get('rooms', [])
    
    # Check tile layout verification if present
    verification = floor_plan_json.get('verification', {})
    if verification:
        return {
            'valid': verification.get('valid', False),
            'coverage': verification.get('coverage', 0),
            'gaps': verification.get('gaps', 0),
            'source': 'tile_verification'
        }
    
    # Fall back to row sum check
    row_check = verify_row_sums(rooms, building_width, building_depth)
    return {
        'valid': row_check['valid'],
        'coverage': row_check['coverage_percent'],
        'gaps': 0 if row_check['valid'] else len(row_check.get('errors', [])),
        'source': 'row_sum_check'
    }


def get_validation_score(validation_result: Dict[str, Any]) -> int:
    """
    Calculate a numeric score from validation results.
    
    Higher score = better (fewer issues).
    
    Scoring:
    - Start with 100
    - -30 points per error
    - -5 points per warning
    - +10 bonus for full compliance
    - +10 bonus for valid dimensions
    - +5 bonus for 100% coverage
    
    Args:
        validation_result: Result from validate_generated_plan or run_full_validation
    
    Returns:
        Score from 0-100
    """
    score = 100
    
    # Deduct for errors (30 points each)
    errors = validation_result.get('all_errors', validation_result.get('errors', []))
    score -= len(errors) * 30
    
    # Deduct for warnings (5 points each)
    warnings = validation_result.get('all_warnings', validation_result.get('warnings', []))
    score -= len(warnings) * 5
    
    # Bonus for compliance
    if validation_result.get('overall_compliant') or validation_result.get('valid'):
        score += 10
    
    # Bonus for dimension accuracy (NEW)
    if validation_result.get('dimensions_valid'):
        score += 10
    
    # Bonus for full coverage (NEW)
    coverage = validation_result.get('coverage_percent', 0)
    if coverage >= 99.5:
        score += 5
    
    return max(0, min(100, score))


def format_validation_summary(validation_result: Dict[str, Any]) -> str:
    """
    Format validation results as a readable summary.
    
    Args:
        validation_result: Result from validate_generated_plan or run_full_validation
    
    Returns:
        Formatted string summary
    """
    lines = [
        "=" * 50,
        "FLOOR PLAN VALIDATION SUMMARY",
        "=" * 50
    ]
    
    # Overall status
    is_valid = validation_result.get('valid', validation_result.get('overall_compliant', False))
    score = get_validation_score(validation_result)
    lines.append(f"Status: {'✓ VALID' if is_valid else '✗ INVALID'}")
    lines.append(f"Score: {score}/100")
    lines.append("")
    
    # Dimension accuracy (NEW)
    if 'dimensions_valid' in validation_result:
        dim_status = '✓' if validation_result['dimensions_valid'] else '✗'
        lines.append(f"Dimensions: {dim_status} {'Valid' if validation_result['dimensions_valid'] else 'Invalid'}")
        lines.append(f"Coverage: {validation_result.get('coverage_percent', 0):.1f}%")
        lines.append(f"Gaps: {validation_result.get('gap_count', 0)}")
        lines.append("")
    
    # Room counts
    lines.append(f"Bedrooms: {validation_result.get('bedroom_count', '?')}")
    lines.append(f"Bathrooms: {validation_result.get('bathroom_count', '?')}")
    lines.append("")
    
    # Errors
    errors = validation_result.get('all_errors', validation_result.get('errors', []))
    if errors:
        lines.append("ERRORS:")
        for error in errors[:5]:
            lines.append(f"  ✗ {error}")
        if len(errors) > 5:
            lines.append(f"  ... and {len(errors) - 5} more")
        lines.append("")
    
    # Warnings
    warnings = validation_result.get('all_warnings', validation_result.get('warnings', []))
    if warnings:
        lines.append("WARNINGS:")
        for warning in warnings[:5]:
            lines.append(f"  ⚠ {warning}")
        if len(warnings) > 5:
            lines.append(f"  ... and {len(warnings) - 5} more")
    
    return "\n".join(lines)
