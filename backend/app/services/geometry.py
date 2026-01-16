# backend/app/services/geometry.py
# Geometric calculations for floor plan layout
# Room overlap detection, adjacency checks, and dimensional utilities
#
# UPDATED: Added tile-grid integration, row-sum verification, gap detection

from typing import Dict, Tuple, List, Optional
import logging

logger = logging.getLogger(__name__)

# =============================================================================
# WALL THICKNESS CONSTANTS (meters)
# =============================================================================

WALL_INTERNAL = 0.1    # 100mm internal walls
WALL_EXTERNAL = 0.2    # 200mm external walls
WALL_CALC = 0.2        # Use for dimension calculations (accounts for both sides)

# Validation tolerance
VALIDATION_TOLERANCE = 0.5  # meters tolerance for dimension checks

# Tile-based layout constants
DEFAULT_TILE_SIZE = 0.9  # meters - matches tile_layout_engine.py


# =============================================================================
# ASPECT RATIO CALCULATION
# =============================================================================

def get_aspect_ratio(building_width: float, building_depth: float) -> str:
    """
    Determine optimal aspect ratio for floor plan image generation.
    
    Args:
        building_width: Width of building envelope in meters
        building_depth: Depth of building envelope in meters
    
    Returns:
        Aspect ratio string: "3:4" (portrait), "4:3" (landscape), or "1:1" (square)
    """
    if building_width <= 0:
        return "1:1"
    
    ratio = building_depth / building_width
    
    if ratio > 1.2:
        return "3:4"  # Portrait (taller than wide)
    elif ratio < 0.8:
        return "4:3"  # Landscape (wider than tall)
    else:
        return "1:1"  # Square-ish


def get_orientation(building_width: float, building_depth: float) -> str:
    """
    Determine building orientation.
    
    Returns: "portrait", "landscape", or "square"
    """
    if building_width <= 0:
        return "square"
    
    ratio = building_depth / building_width
    
    if ratio > 1.2:
        return "portrait"
    elif ratio < 0.8:
        return "landscape"
    else:
        return "square"


# =============================================================================
# ROOM OVERLAP DETECTION
# =============================================================================

def rooms_overlap(room1: Dict, room2: Dict, tolerance: float = 0.01) -> bool:
    """
    Check if two rooms overlap (share interior space).
    
    Args:
        room1: Dict with x, y, width, depth
        room2: Dict with x, y, width, depth
        tolerance: Small tolerance to handle floating point issues
    
    Returns:
        True if rooms overlap, False otherwise
    """
    x1, y1 = room1.get('x', 0), room1.get('y', 0)
    w1, d1 = room1.get('width', 0), room1.get('depth', 0)
    x2, y2 = room2.get('x', 0), room2.get('y', 0)
    w2, d2 = room2.get('width', 0), room2.get('depth', 0)
    
    # No overlap if one is completely to the left/right of the other
    if x1 + w1 <= x2 + tolerance or x2 + w2 <= x1 + tolerance:
        return False
    
    # No overlap if one is completely above/below the other
    if y1 + d1 <= y2 + tolerance or y2 + d2 <= y1 + tolerance:
        return False
    
    return True


def get_overlap_area(room1: Dict, room2: Dict) -> float:
    """
    Calculate the overlapping area between two rooms.
    
    Returns 0 if rooms don't overlap.
    """
    x1, y1 = room1.get('x', 0), room1.get('y', 0)
    w1, d1 = room1.get('width', 0), room1.get('depth', 0)
    x2, y2 = room2.get('x', 0), room2.get('y', 0)
    w2, d2 = room2.get('width', 0), room2.get('depth', 0)
    
    # Calculate overlap in each dimension
    overlap_x = max(0, min(x1 + w1, x2 + w2) - max(x1, x2))
    overlap_y = max(0, min(y1 + d1, y2 + d2) - max(y1, y2))
    
    return overlap_x * overlap_y


def find_all_overlaps(rooms: List[Dict], tolerance: float = 0.15) -> List[Tuple[str, str, float]]:
    """
    Find all overlapping room pairs in a layout.
    
    Args:
        rooms: List of room dicts with id/name, x, y, width, depth
        tolerance: Minimum overlap area to report (default 0.15m² = 15cm²)
                   This filters out floating-point precision artifacts at tile boundaries.
    
    Returns:
        List of (room1_name, room2_name, overlap_area) tuples
    """
    overlaps = []
    
    for i, room1 in enumerate(rooms):
        for room2 in rooms[i+1:]:
            area = get_overlap_area(room1, room2)
            if area > tolerance:  # Only report significant overlaps
                name1 = room1.get('name', room1.get('id', f'room_{i}'))
                name2 = room2.get('name', room2.get('id', 'unknown'))
                overlaps.append((name1, name2, round(area, 2)))
    
    return overlaps


# =============================================================================
# ROOM ADJACENCY DETECTION
# =============================================================================

def rooms_adjacent(room1: Dict, room2: Dict, tolerance: float = 0.3) -> bool:
    """
    Check if two rooms share a wall (are adjacent).
    
    Rooms are adjacent if they touch along an edge but don't overlap.
    
    Args:
        room1: Dict with x, y, width, depth
        room2: Dict with x, y, width, depth
        tolerance: Distance tolerance for "touching" (default 0.3m)
    
    Returns:
        True if rooms share a wall, False otherwise
    """
    x1, y1 = room1.get('x', 0), room1.get('y', 0)
    w1, d1 = room1.get('width', 0), room1.get('depth', 0)
    x2, y2 = room2.get('x', 0), room2.get('y', 0)
    w2, d2 = room2.get('width', 0), room2.get('depth', 0)
    
    # Check if rooms share a horizontal edge (one above the other)
    horizontal_overlap = not (x1 + w1 < x2 - tolerance or x2 + w2 < x1 - tolerance)
    vertical_touch = abs((y1 + d1) - y2) < tolerance or abs((y2 + d2) - y1) < tolerance
    
    # Check if rooms share a vertical edge (side by side)
    vertical_overlap = not (y1 + d1 < y2 - tolerance or y2 + d2 < y1 - tolerance)
    horizontal_touch = abs((x1 + w1) - x2) < tolerance or abs((x2 + w2) - x1) < tolerance
    
    return (horizontal_overlap and vertical_touch) or (vertical_overlap and horizontal_touch)


def get_shared_wall_length(room1: Dict, room2: Dict, tolerance: float = 0.3) -> float:
    """
    Calculate the length of shared wall between two adjacent rooms.
    
    Returns 0 if rooms are not adjacent.
    """
    if not rooms_adjacent(room1, room2, tolerance):
        return 0
    
    x1, y1 = room1.get('x', 0), room1.get('y', 0)
    w1, d1 = room1.get('width', 0), room1.get('depth', 0)
    x2, y2 = room2.get('x', 0), room2.get('y', 0)
    w2, d2 = room2.get('width', 0), room2.get('depth', 0)
    
    # Check horizontal adjacency (shared vertical wall)
    if abs((x1 + w1) - x2) < tolerance or abs((x2 + w2) - x1) < tolerance:
        # Shared wall is vertical - calculate overlap in y direction
        overlap_start = max(y1, y2)
        overlap_end = min(y1 + d1, y2 + d2)
        return max(0, overlap_end - overlap_start)
    
    # Check vertical adjacency (shared horizontal wall)
    if abs((y1 + d1) - y2) < tolerance or abs((y2 + d2) - y1) < tolerance:
        # Shared wall is horizontal - calculate overlap in x direction
        overlap_start = max(x1, x2)
        overlap_end = min(x1 + w1, x2 + w2)
        return max(0, overlap_end - overlap_start)
    
    return 0


def check_open_plan_flow(
    rooms: List[Dict],
    required_sequence: List[str] = None
) -> Dict[str, any]:
    """
    Check if rooms form a proper open-plan flow.
    
    Default sequence: Kitchen -> Dining -> Family -> Alfresco
    
    Args:
        rooms: List of room dicts
        required_sequence: List of room types that should be adjacent in order
    
    Returns:
        Dict with 'valid', 'connected_pairs', 'missing_connections'
    """
    if required_sequence is None:
        required_sequence = ['kitchen', 'dining', 'family', 'alfresco']
    
    # Build room lookup by type
    room_by_type = {}
    for room in rooms:
        room_type = room.get('type', room.get('name', '')).lower().replace(' ', '_')
        room_by_type[room_type] = room
    
    connected = []
    missing = []
    
    for i in range(len(required_sequence) - 1):
        type1 = required_sequence[i]
        type2 = required_sequence[i + 1]
        
        room1 = room_by_type.get(type1)
        room2 = room_by_type.get(type2)
        
        if room1 and room2:
            if rooms_adjacent(room1, room2):
                connected.append((type1, type2))
            else:
                missing.append((type1, type2))
        elif not room1:
            missing.append((type1, f"missing_{type1}"))
        elif not room2:
            missing.append((type2, f"missing_{type2}"))
    
    return {
        'valid': len(missing) == 0,
        'connected_pairs': connected,
        'missing_connections': missing,
        'sequence_checked': required_sequence
    }


# =============================================================================
# ROOM DIMENSION UTILITIES
# =============================================================================

def get_room_bounds(room: Dict) -> Tuple[float, float, float, float]:
    """
    Get the bounding box of a room.
    
    Returns: (min_x, min_y, max_x, max_y)
    """
    x = room.get('x', 0)
    y = room.get('y', 0)
    w = room.get('width', 0)
    d = room.get('depth', 0)
    return (x, y, x + w, y + d)


def get_room_center(room: Dict) -> Tuple[float, float]:
    """
    Get the center point of a room.
    
    Returns: (center_x, center_y)
    """
    x = room.get('x', 0)
    y = room.get('y', 0)
    w = room.get('width', 0)
    d = room.get('depth', 0)
    return (x + w / 2, y + d / 2)


def get_room_area(room: Dict) -> float:
    """Calculate the area of a room in square meters."""
    return room.get('width', 0) * room.get('depth', 0)


def room_fits_in_envelope(
    room: Dict, 
    envelope_width: float, 
    envelope_depth: float,
    tolerance: float = VALIDATION_TOLERANCE
) -> bool:
    """
    Check if a room fits within the building envelope.
    
    Args:
        room: Dict with x, y, width, depth
        envelope_width: Building envelope width
        envelope_depth: Building envelope depth
        tolerance: Allowed overhang tolerance
    
    Returns:
        True if room fits, False if it exceeds envelope
    """
    max_x = room.get('x', 0) + room.get('width', 0)
    max_y = room.get('y', 0) + room.get('depth', 0)
    
    return max_x <= envelope_width + tolerance and max_y <= envelope_depth + tolerance


# =============================================================================
# BUILDING DIMENSION UTILITIES
# =============================================================================

def calculate_building_dimensions(rooms: list) -> Tuple[float, float, float]:
    """
    Calculate actual building dimensions from room layout.
    
    Args:
        rooms: List of room dicts with x, y, width, depth
    
    Returns:
        (width, depth, area) of the building footprint
    """
    if not rooms:
        return (0, 0, 0)
    
    max_x = max(r.get('x', 0) + r.get('width', 0) for r in rooms)
    max_y = max(r.get('y', 0) + r.get('depth', 0) for r in rooms)
    
    return (max_x, max_y, max_x * max_y)


def calculate_zone_depths(
    building_depth: float,
    garage_depth: float,
    rear_zone_depth: float,
    wall_allowance: float = WALL_CALC
) -> Dict[str, float]:
    """
    Calculate zone depths for floor plan layout.
    
    Standard layout has three zones:
    - Front zone: Garage, Entry, Lounge
    - Middle zone: Bedrooms, Kitchen, Hallway
    - Rear zone: Master, Family, Alfresco
    
    Args:
        building_depth: Total building depth
        garage_depth: Depth of garage (defines front zone)
        rear_zone_depth: Depth of rear zone (master/family)
        wall_allowance: Wall thickness allowance
    
    Returns:
        Dict with front, middle, rear zone depths
    """
    front_zone = garage_depth
    rear_zone = rear_zone_depth
    middle_zone = building_depth - front_zone - rear_zone - wall_allowance
    
    return {
        'front': front_zone,
        'middle': max(0, middle_zone),
        'rear': rear_zone,
        'front_end': front_zone,
        'middle_end': front_zone + middle_zone,
        'rear_end': building_depth
    }


# =============================================================================
# NEW: ROW-SUM VERIFICATION (Dimension Accuracy)
# =============================================================================

def verify_row_sums(
    rooms: List[Dict],
    building_width: float,
    building_depth: float,
    sample_interval: float = 0.5,
    tolerance: float = 0.2
) -> Dict[str, any]:
    """
    Verify that room widths sum to building width at every row.
    
    This is the KEY validation for mathematically correct layouts.
    
    Args:
        rooms: List of room dicts with x, y, width, depth
        building_width: Expected building width
        building_depth: Building depth (for sampling range)
        sample_interval: How often to sample (meters)
        tolerance: Allowed error in sum (meters) - default 0.2m for floating point
    
    Returns:
        Dict with 'valid', 'errors', 'coverage_percent', 'row_details'
    """
    errors = []
    row_details = []
    total_samples = 0
    valid_samples = 0
    
    # Sample at regular intervals along the depth
    y = 0
    while y < building_depth:
        # Find all rooms that span this y position
        spanning_rooms = [
            r for r in rooms 
            if r.get('y', 0) <= y < r.get('y', 0) + r.get('depth', 0)
        ]
        
        # Sort by x position
        spanning_rooms.sort(key=lambda r: r.get('x', 0))
        
        # Calculate total width
        total_width = sum(r.get('width', 0) for r in spanning_rooms)
        
        # Check for gaps
        gaps = []
        prev_x2 = 0
        for room in spanning_rooms:
            room_x = room.get('x', 0)
            if room_x > prev_x2 + tolerance:
                gaps.append({
                    'start': prev_x2,
                    'end': room_x,
                    'size': room_x - prev_x2
                })
            prev_x2 = room_x + room.get('width', 0)
        
        # Check if we reach building width
        if prev_x2 < building_width - tolerance:
            gaps.append({
                'start': prev_x2,
                'end': building_width,
                'size': building_width - prev_x2
            })
        
        # Record result
        is_valid = abs(total_width - building_width) < tolerance and len(gaps) == 0
        
        row_details.append({
            'y': round(y, 2),
            'rooms': [r.get('name', r.get('type', '?')) for r in spanning_rooms],
            'total_width': round(total_width, 2),
            'expected_width': building_width,
            'valid': is_valid,
            'gaps': gaps
        })
        
        if not is_valid:
            room_names = " + ".join([
                f"{r.get('name', '?')}({r.get('width', 0):.1f})" 
                for r in spanning_rooms
            ])
            errors.append(
                f"Row y={y:.1f}m: {room_names} = {total_width:.1f}m "
                f"(expected {building_width:.1f}m, diff={total_width - building_width:.2f}m)"
            )
        
        total_samples += 1
        if is_valid:
            valid_samples += 1
        
        y += sample_interval
    
    coverage = (valid_samples / total_samples * 100) if total_samples > 0 else 0
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'coverage_percent': round(coverage, 1),
        'samples_checked': total_samples,
        'valid_samples': valid_samples,
        'row_details': row_details
    }


def calculate_coverage(
    rooms: List[Dict],
    building_width: float,
    building_depth: float
) -> Dict[str, any]:
    """
    Calculate what percentage of the building envelope is covered by rooms.
    
    Args:
        rooms: List of room dicts
        building_width: Building envelope width
        building_depth: Building envelope depth
    
    Returns:
        Dict with coverage stats
    """
    envelope_area = building_width * building_depth
    
    # Sum room areas (simple method - may double-count overlaps)
    total_room_area = sum(get_room_area(r) for r in rooms)
    
    # Check for overlaps
    overlaps = find_all_overlaps(rooms)
    overlap_area = sum(area for _, _, area in overlaps)
    
    # Adjusted area
    adjusted_area = total_room_area - overlap_area
    
    coverage_percent = (adjusted_area / envelope_area * 100) if envelope_area > 0 else 0
    
    return {
        'envelope_area': round(envelope_area, 1),
        'total_room_area': round(total_room_area, 1),
        'overlap_area': round(overlap_area, 1),
        'net_covered_area': round(adjusted_area, 1),
        'coverage_percent': round(coverage_percent, 1),
        'has_overlaps': len(overlaps) > 0,
        'overlap_details': overlaps
    }


# =============================================================================
# NEW: GAP DETECTION
# =============================================================================

def find_gaps(
    rooms: List[Dict],
    building_width: float,
    building_depth: float,
    grid_resolution: float = 0.5
) -> List[Dict]:
    """
    Find gaps (uncovered areas) in the floor plan.
    
    Uses a grid-based approach to find areas not covered by any room.
    
    Args:
        rooms: List of room dicts
        building_width: Building envelope width
        building_depth: Building envelope depth
        grid_resolution: Size of grid cells for detection
    
    Returns:
        List of gap regions with approximate locations
    """
    gaps = []
    
    # Sample the building area
    y = 0
    while y < building_depth:
        x = 0
        gap_start = None
        
        while x < building_width:
            # Check if this point is inside any room
            point_covered = False
            for room in rooms:
                rx, ry = room.get('x', 0), room.get('y', 0)
                rw, rd = room.get('width', 0), room.get('depth', 0)
                
                if rx <= x < rx + rw and ry <= y < ry + rd:
                    point_covered = True
                    break
            
            if not point_covered:
                if gap_start is None:
                    gap_start = x
            else:
                if gap_start is not None:
                    # End of gap
                    gaps.append({
                        'x': gap_start,
                        'y': y,
                        'width': x - gap_start,
                        'depth': grid_resolution,
                        'area': (x - gap_start) * grid_resolution
                    })
                    gap_start = None
            
            x += grid_resolution
        
        # Check for gap at end of row
        if gap_start is not None:
            gaps.append({
                'x': gap_start,
                'y': y,
                'width': building_width - gap_start,
                'depth': grid_resolution,
                'area': (building_width - gap_start) * grid_resolution
            })
        
        y += grid_resolution
    
    # Merge adjacent gaps (optional - for cleaner output)
    # For now, just return raw gaps
    
    return gaps


def get_gap_summary(
    rooms: List[Dict],
    building_width: float,
    building_depth: float
) -> Dict[str, any]:
    """
    Get a summary of gaps in the floor plan.
    """
    gaps = find_gaps(rooms, building_width, building_depth)
    
    total_gap_area = sum(g.get('area', 0) for g in gaps)
    envelope_area = building_width * building_depth
    
    return {
        'has_gaps': len(gaps) > 0,
        'gap_count': len(gaps),
        'total_gap_area': round(total_gap_area, 2),
        'gap_percent': round(total_gap_area / envelope_area * 100, 1) if envelope_area > 0 else 0,
        'gaps': gaps[:20]  # First 20 gaps
    }


# =============================================================================
# NEW: TILE/GRID UTILITIES
# =============================================================================

def snap_to_grid(
    value: float,
    grid_size: float = DEFAULT_TILE_SIZE,
    mode: str = 'nearest'
) -> float:
    """
    Snap a value to the nearest grid line.
    
    Args:
        value: Value to snap
        grid_size: Grid cell size
        mode: 'nearest', 'floor', or 'ceil'
    
    Returns:
        Snapped value
    """
    if mode == 'floor':
        return (value // grid_size) * grid_size
    elif mode == 'ceil':
        return ((value + grid_size - 0.001) // grid_size) * grid_size
    else:  # nearest
        return round(value / grid_size) * grid_size


def snap_room_to_grid(
    room: Dict,
    grid_size: float = DEFAULT_TILE_SIZE
) -> Dict:
    """
    Snap room coordinates and dimensions to grid.
    
    Args:
        room: Room dict with x, y, width, depth
        grid_size: Grid cell size
    
    Returns:
        New room dict with snapped values
    """
    return {
        **room,
        'x': snap_to_grid(room.get('x', 0), grid_size, 'floor'),
        'y': snap_to_grid(room.get('y', 0), grid_size, 'floor'),
        'width': snap_to_grid(room.get('width', 0), grid_size, 'ceil'),
        'depth': snap_to_grid(room.get('depth', 0), grid_size, 'ceil'),
    }


def calculate_grid_dimensions(
    building_width: float,
    building_depth: float,
    target_tile_size: float = DEFAULT_TILE_SIZE
) -> Dict[str, any]:
    """
    Calculate optimal grid dimensions for a building.
    
    Args:
        building_width: Building envelope width
        building_depth: Building envelope depth
        target_tile_size: Desired tile size
    
    Returns:
        Dict with cols, rows, actual tile sizes
    """
    cols = round(building_width / target_tile_size)
    rows = round(building_depth / target_tile_size)
    
    # Ensure at least 1 column/row
    cols = max(1, cols)
    rows = max(1, rows)
    
    actual_tile_w = building_width / cols
    actual_tile_d = building_depth / rows
    
    return {
        'cols': cols,
        'rows': rows,
        'tile_width': round(actual_tile_w, 4),
        'tile_depth': round(actual_tile_d, 4),
        'total_tiles': cols * rows,
        'exact_fit': abs(cols * actual_tile_w - building_width) < 0.001
    }


# =============================================================================
# NEW: COMPREHENSIVE LAYOUT VALIDATION
# =============================================================================

def validate_layout_geometry(
    rooms: List[Dict],
    building_width: float,
    building_depth: float,
    requirements: Dict = None
) -> Dict[str, any]:
    """
    Comprehensive geometric validation of a floor plan layout.
    
    Checks:
    - Room overlaps
    - Row sums (dimensions add up)
    - Gap coverage
    - Envelope fit
    - Required adjacencies
    
    Args:
        rooms: List of room dicts
        building_width: Building envelope width
        building_depth: Building envelope depth
        requirements: Optional requirements dict for adjacency checks
    
    Returns:
        Dict with validation results and score
    """
    results = {
        'valid': True,
        'score': 100,
        'errors': [],
        'warnings': [],
        'details': {}
    }
    
    # 1. Check for overlaps
    overlaps = find_all_overlaps(rooms)
    if overlaps:
        results['valid'] = False
        results['score'] -= 30
        for r1, r2, area in overlaps:
            results['errors'].append(f"Rooms overlap: {r1} and {r2} ({area}m²)")
    results['details']['overlaps'] = overlaps
    
    # 2. Check row sums (most important for dimension accuracy)
    row_check = verify_row_sums(rooms, building_width, building_depth)
    if not row_check['valid']:
        results['valid'] = False
        results['score'] -= 40
        results['errors'].extend(row_check['errors'][:5])  # First 5 errors
    results['details']['row_sums'] = row_check
    
    # 3. Check coverage
    coverage = calculate_coverage(rooms, building_width, building_depth)
    if coverage['coverage_percent'] < 95:
        results['warnings'].append(
            f"Low coverage: {coverage['coverage_percent']}% "
            f"(missing {coverage['envelope_area'] - coverage['net_covered_area']:.1f}m²)"
        )
        results['score'] -= 10
    results['details']['coverage'] = coverage
    
    # 4. Check gaps
    gap_summary = get_gap_summary(rooms, building_width, building_depth)
    if gap_summary['has_gaps']:
        results['warnings'].append(
            f"Found {gap_summary['gap_count']} gaps "
            f"({gap_summary['total_gap_area']:.1f}m² total)"
        )
        results['score'] -= 5
    results['details']['gaps'] = gap_summary
    
    # 5. Check envelope fit
    for room in rooms:
        room_type = room.get('type', room.get('name', '')).lower()
        # Skip alfresco - it's supposed to be outside
        if 'alfresco' in room_type:
            continue
        
        if not room_fits_in_envelope(room, building_width, building_depth):
            results['errors'].append(
                f"Room exceeds envelope: {room.get('name', 'unknown')}"
            )
            results['score'] -= 10
    
    # 6. Check open plan flow (if requirements provided)
    if requirements:
        flow_check = check_open_plan_flow(rooms)
        if not flow_check['valid']:
            for pair in flow_check['missing_connections']:
                results['warnings'].append(
                    f"Missing connection: {pair[0]} -> {pair[1]}"
                )
                results['score'] -= 5
        results['details']['open_plan_flow'] = flow_check
    
    # Ensure score doesn't go below 0
    results['score'] = max(0, results['score'])
    
    # Summary
    results['summary'] = {
        'total_rooms': len(rooms),
        'total_area': round(sum(get_room_area(r) for r in rooms), 1),
        'envelope_area': round(building_width * building_depth, 1),
        'coverage_percent': coverage['coverage_percent'],
        'has_overlaps': len(overlaps) > 0,
        'dimensions_valid': row_check['valid']
    }
    
    return results


# =============================================================================
# UTILITY: FORMAT VALIDATION REPORT
# =============================================================================

def format_validation_report(validation: Dict) -> str:
    """
    Format validation results as a readable report.
    
    Args:
        validation: Result from validate_layout_geometry()
    
    Returns:
        Formatted string report
    """
    lines = [
        "=" * 60,
        "FLOOR PLAN GEOMETRY VALIDATION REPORT",
        "=" * 60,
        f"Overall: {'✓ VALID' if validation['valid'] else '✗ INVALID'}",
        f"Score: {validation['score']}/100",
        ""
    ]
    
    if validation['errors']:
        lines.append("ERRORS:")
        for error in validation['errors']:
            lines.append(f"  ✗ {error}")
        lines.append("")
    
    if validation['warnings']:
        lines.append("WARNINGS:")
        for warning in validation['warnings']:
            lines.append(f"  ⚠ {warning}")
        lines.append("")
    
    summary = validation.get('summary', {})
    lines.extend([
        "SUMMARY:",
        f"  Rooms: {summary.get('total_rooms', 0)}",
        f"  Total area: {summary.get('total_area', 0)}m²",
        f"  Envelope: {summary.get('envelope_area', 0)}m²",
        f"  Coverage: {summary.get('coverage_percent', 0)}%",
        f"  Dimensions valid: {summary.get('dimensions_valid', False)}",
        ""
    ])
    
    return "\n".join(lines)
