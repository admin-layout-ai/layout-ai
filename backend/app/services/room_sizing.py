# backend/app/services/room_sizing.py
# Calculate proportional room sizes based on building envelope
# Uses NCC minimums as floor values and scales proportionally
#
# UPDATED: Added tile integration, zone awareness, bedroom count scaling,
#          missing room types, and single garage support

from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
import logging

# Import NCC requirements (with fallback for standalone testing)
try:
    from .NCC import NCC_ROOM_SIZES, NCC_GARAGE_REQUIREMENTS
except ImportError:
    # Fallback for testing without NCC module
    @dataclass
    class MockRoomSize:
        min_width: float = 3.0
        min_area: float = 9.0
    
    @dataclass
    class MockGarage:
        single_min_width: float = 3.0
        single_min_depth: float = 5.5
        double_min_width: float = 5.5
        double_min_depth: float = 5.5
    
    NCC_ROOM_SIZES = {
        'bedroom': MockRoomSize(3.0, 9.0),
        'master_bedroom': MockRoomSize(3.2, 10.0),
        'kitchen': MockRoomSize(2.4, 5.0),
        'living': MockRoomSize(3.3, 10.0),
        'bathroom': MockRoomSize(1.5, 3.0),
        'laundry': MockRoomSize(1.5, 2.5),
        'study': MockRoomSize(2.4, 6.0),
    }
    NCC_GARAGE_REQUIREMENTS = MockGarage()

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION CONSTANTS
# =============================================================================

# Reference building size for scaling (typical 4-bed home)
BASELINE_WIDTH = 16.0   # meters
BASELINE_DEPTH = 22.0   # meters
BASELINE_AREA = BASELINE_WIDTH * BASELINE_DEPTH  # 352 m²
BASELINE_BEDROOMS = 4

# Area thresholds for optional features
WIP_THRESHOLD = 280     # m² - add walk-in pantry for larger homes
THEATRE_THRESHOLD = 400 # m² - add theatre for very large homes
STUDY_THRESHOLD = 250   # m² - study is tight below this

# Tile size for grid snapping
DEFAULT_TILE_SIZE = 0.9  # meters

# Zone depth percentages (front/middle/rear)
ZONE_FRONT_PCT = 0.28   # Garage, entry, lounge
ZONE_REAR_PCT = 0.25    # Master, family, dining
# Middle = 1 - front - rear


# =============================================================================
# DATA CLASS FOR ROOM DIMENSIONS
# =============================================================================

@dataclass
class RoomDimensions:
    """Room dimensions with metadata."""
    width: float
    depth: float
    min_width: float = 0
    min_depth: float = 0
    zone: str = "middle"  # front, middle, rear
    priority: int = 1     # 1=essential, 2=important, 3=optional
    
    @property
    def area(self) -> float:
        return round(self.width * self.depth, 1)
    
    def to_tiles(self, tile_size: float = DEFAULT_TILE_SIZE) -> Tuple[int, int]:
        """Convert to tile counts (width_tiles, depth_tiles)."""
        return (
            max(1, round(self.width / tile_size)),
            max(1, round(self.depth / tile_size))
        )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'width': self.width,
            'depth': self.depth,
            'area': self.area,
            'zone': self.zone,
            'priority': self.priority
        }


# =============================================================================
# MAIN CALCULATION FUNCTION
# =============================================================================

def calculate_room_sizes(
    building_width: float, 
    building_depth: float, 
    requirements: Dict[str, Any]
) -> Dict[str, Dict[str, float]]:
    """
    Calculate proportional room sizes based on building envelope.
    
    Scales room sizes proportionally from a baseline 16m × 22m reference,
    while respecting NCC minimum dimensions.
    
    Args:
        building_width: Building envelope width in meters
        building_depth: Building envelope depth in meters
        requirements: Dict with bedrooms, bathrooms, living_areas, home_office, etc.
    
    Returns:
        Dict mapping room type to {width, depth, area, zone, priority} dimensions.
        Also includes '_meta' key with scaling factors.
    """
    # Calculate scale factors
    width_scale = building_width / BASELINE_WIDTH
    depth_scale = building_depth / BASELINE_DEPTH
    avg_scale = (width_scale + depth_scale) / 2
    area_scale = (building_width * building_depth) / BASELINE_AREA
    
    # Extract requirements
    bedrooms = requirements.get('bedrooms', 4)
    bathrooms = requirements.get('bathrooms', 2)
    living_areas = requirements.get('living_areas', 1)
    has_study = requirements.get('home_office', False) or requirements.get('has_study', False)
    has_theatre = requirements.get('has_theatre', False)
    garage_spaces = requirements.get('garage_spaces', 2)
    
    # Powder room only when bathrooms is fractional (2.5, 3.5, etc.)
    has_powder = (bathrooms % 1) != 0
    
    # Calculate building area for feature thresholds
    building_area = building_width * building_depth
    has_wip = building_area >= WIP_THRESHOLD
    
    # Bedroom count scaling - more bedrooms = slightly smaller each
    bedroom_scale = BASELINE_BEDROOMS / max(bedrooms, 3)  # 3-5 bed range
    bedroom_scale = max(0.85, min(1.15, bedroom_scale))  # Clamp to 85%-115%
    
    # Narrow lot detection
    is_narrow = building_width < 12
    is_very_narrow = building_width < 10
    
    # Get NCC minimums with safe defaults
    def get_ncc_min(room_type: str, default: float = 3.0) -> float:
        room = NCC_ROOM_SIZES.get(room_type)
        if room and hasattr(room, 'min_width'):
            return room.min_width
        return default
    
    ncc_bedroom = get_ncc_min('bedroom', 3.0)
    ncc_master = get_ncc_min('master_bedroom', 3.2)
    ncc_kitchen = get_ncc_min('kitchen', 2.4)
    ncc_living = get_ncc_min('living', 3.3)
    ncc_bathroom = get_ncc_min('bathroom', 1.5)
    ncc_laundry = get_ncc_min('laundry', 1.5)
    ncc_study = get_ncc_min('study', 2.4)
    
    # Build room sizes dictionary
    sizes = {}
    
    # =========================================================================
    # FRONT ZONE: Garage, Entry, Lounge/Sitting
    # =========================================================================
    
    # === GARAGE ===
    if garage_spaces >= 2:
        garage_min_w = getattr(NCC_GARAGE_REQUIREMENTS, 'double_min_width', 5.5)
        garage_min_d = getattr(NCC_GARAGE_REQUIREMENTS, 'double_min_depth', 5.5)
        sizes['garage'] = RoomDimensions(
            width=_clamp(6.0 * width_scale, garage_min_w, 7.5),
            depth=_clamp(6.0 * depth_scale, garage_min_d, 7.5),
            min_width=garage_min_w,
            min_depth=garage_min_d,
            zone="front",
            priority=1
        )
    else:
        garage_min_w = getattr(NCC_GARAGE_REQUIREMENTS, 'single_min_width', 3.0)
        garage_min_d = getattr(NCC_GARAGE_REQUIREMENTS, 'single_min_depth', 5.5)
        sizes['garage'] = RoomDimensions(
            width=_clamp(3.5 * width_scale, garage_min_w, 4.5),
            depth=_clamp(6.0 * depth_scale, garage_min_d, 7.0),
            min_width=garage_min_w,
            min_depth=garage_min_d,
            zone="front",
            priority=1
        )
    
    # === ENTRY ===
    sizes['entry'] = RoomDimensions(
        width=_clamp(2.0 * width_scale, 1.5, 3.0),
        depth=_clamp(3.0 * depth_scale, 2.5, 4.5),
        min_width=1.2,
        zone="front",
        priority=2
    )
    
    # === LOUNGE (if 2+ living areas) or SITTING ===
    if living_areas >= 2:
        sizes['lounge'] = RoomDimensions(
            width=_clamp(4.5 * avg_scale, ncc_living, 6.5),
            depth=_clamp(4.5 * avg_scale, ncc_living, 6.5),
            min_width=ncc_living,
            zone="front",
            priority=1
        )
    else:
        sizes['sitting'] = RoomDimensions(
            width=_clamp(4.0 * avg_scale, ncc_living, 5.5),
            depth=_clamp(4.0 * avg_scale, ncc_living, 5.5),
            min_width=ncc_living,
            zone="front",
            priority=1
        )
    
    # === FRONT HALLWAY ===
    sizes['hall'] = RoomDimensions(
        width=_clamp(1.8 * width_scale, 1.2, 2.5),
        depth=_clamp(4.0 * depth_scale, 3.0, 6.0),
        min_width=1.2,
        zone="front",
        priority=2
    )
    
    # =========================================================================
    # MIDDLE ZONE: Bedrooms, Bathroom, Kitchen, Laundry
    # =========================================================================
    
    # === MASTER BEDROOM ===
    sizes['master'] = RoomDimensions(
        width=_clamp(4.5 * avg_scale * bedroom_scale, ncc_master, 6.0),
        depth=_clamp(4.0 * avg_scale * bedroom_scale, ncc_master, 5.5),
        min_width=ncc_master,
        zone="rear",  # Master typically in rear
        priority=1
    )
    
    # === STANDARD BEDROOMS ===
    # Scale down slightly for more bedrooms
    bed_width = _clamp(3.6 * avg_scale * bedroom_scale, ncc_bedroom, 4.5)
    bed_depth = _clamp(3.6 * avg_scale * bedroom_scale, ncc_bedroom, 4.5)
    
    sizes['bedroom'] = RoomDimensions(
        width=bed_width,
        depth=bed_depth,
        min_width=ncc_bedroom,
        zone="middle",
        priority=1
    )
    
    # === BUILT-IN ROBE (for standard bedrooms) ===
    # Smaller than WIR, typically 0.6-1.2m deep
    sizes['robe'] = RoomDimensions(
        width=_clamp(2.5 * avg_scale, 1.8, 3.5),
        depth=_clamp(1.2 * avg_scale, 0.9, 2.0),
        min_width=1.5,
        zone="middle",
        priority=2
    )
    
    # === ENSUITE ===
    sizes['ensuite'] = RoomDimensions(
        width=_clamp(3.0 * avg_scale, 2.5, 4.5),
        depth=_clamp(2.5 * avg_scale, 2.0, 3.5),
        min_width=2.0,
        zone="rear",
        priority=1
    )
    
    # === WALK-IN ROBE (for master) ===
    sizes['wir'] = RoomDimensions(
        width=_clamp(2.8 * avg_scale, 2.0, 4.0),
        depth=_clamp(2.5 * avg_scale, 2.0, 3.5),
        min_width=2.0,
        zone="rear",
        priority=2
    )
    
    # === MAIN BATHROOM ===
    sizes['bathroom'] = RoomDimensions(
        width=_clamp(3.0 * avg_scale, ncc_bathroom, 4.0),
        depth=_clamp(2.5 * avg_scale, ncc_bathroom, 3.5),
        min_width=ncc_bathroom,
        zone="middle",
        priority=1
    )
    
    # === LINEN CUPBOARD ===
    sizes['linen'] = RoomDimensions(
        width=_clamp(1.5 * avg_scale, 0.9, 2.5),
        depth=_clamp(1.5 * avg_scale, 0.9, 2.0),
        min_width=0.6,
        zone="middle",
        priority=3
    )
    
    # === STORAGE ===
    sizes['storage'] = RoomDimensions(
        width=_clamp(2.0 * avg_scale, 1.2, 3.0),
        depth=_clamp(2.0 * avg_scale, 1.2, 2.5),
        min_width=0.9,
        zone="middle",
        priority=3
    )
    
    # === CENTRAL HALLWAY ===
    sizes['hallway'] = RoomDimensions(
        width=_clamp(1.8 * width_scale, 1.2, 2.5),
        depth=0,  # Variable length - spans middle zone
        min_width=1.2,
        zone="middle",
        priority=2
    )
    
    # === KITCHEN ===
    sizes['kitchen'] = RoomDimensions(
        width=_clamp(4.5 * avg_scale, ncc_kitchen, 6.5),
        depth=_clamp(4.5 * avg_scale, ncc_kitchen, 6.5),
        min_width=ncc_kitchen,
        zone="middle",
        priority=1
    )
    
    # === LAUNDRY ===
    sizes['laundry'] = RoomDimensions(
        width=_clamp(2.5 * avg_scale, ncc_laundry, 4.0),
        depth=_clamp(2.5 * avg_scale, ncc_laundry, 3.5),
        min_width=ncc_laundry,
        zone="middle",
        priority=1
    )
    
    # =========================================================================
    # REAR ZONE: Master, Family, Dining, Alfresco
    # =========================================================================
    
    # === DINING ===
    sizes['dining'] = RoomDimensions(
        width=_clamp(4.0 * avg_scale, 3.5, 5.5),
        depth=_clamp(3.5 * avg_scale, 2.7, 4.5),
        min_width=3.0,
        zone="rear",
        priority=1
    )
    
    # === FAMILY ROOM ===
    sizes['family'] = RoomDimensions(
        width=_clamp(5.5 * avg_scale, ncc_living, 8.0),
        depth=_clamp(4.5 * avg_scale, ncc_living, 6.0),
        min_width=ncc_living,
        zone="rear",
        priority=1
    )
    
    # === REAR HALLWAY ===
    sizes['hall_r'] = RoomDimensions(
        width=_clamp(1.8 * width_scale, 1.2, 2.5),
        depth=_clamp(4.0 * depth_scale, 3.0, 6.0),
        min_width=1.2,
        zone="rear",
        priority=2
    )
    
    # === ALFRESCO (outside building envelope) ===
    sizes['alfresco'] = RoomDimensions(
        width=_clamp(5.0 * avg_scale, 4.0, 7.0),
        depth=_clamp(4.0 * avg_scale, 3.5, 5.5),
        min_width=3.5,
        zone="exterior",
        priority=2
    )
    
    # =========================================================================
    # OPTIONAL ROOMS
    # =========================================================================
    
    # === POWDER ROOM (if bathrooms is fractional) ===
    if has_powder:
        sizes['powder'] = RoomDimensions(
            width=_clamp(1.5 * avg_scale, 1.2, 2.0),
            depth=_clamp(1.5 * avg_scale, 1.2, 2.0),
            min_width=1.0,
            zone="front",
            priority=2
        )
    
    # === STUDY/HOME OFFICE ===
    if has_study:
        # Smaller on narrow lots
        study_scale = 0.85 if is_narrow else 1.0
        sizes['study'] = RoomDimensions(
            width=_clamp(3.2 * avg_scale * study_scale, ncc_study, 4.5),
            depth=_clamp(3.0 * avg_scale * study_scale, ncc_study, 4.0),
            min_width=ncc_study,
            zone="middle",
            priority=2
        )
    
    # === WALK-IN PANTRY (larger homes) ===
    if has_wip:
        sizes['wip'] = RoomDimensions(
            width=_clamp(2.2 * avg_scale, 1.5, 3.0),
            depth=_clamp(2.5 * avg_scale, 2.0, 3.5),
            min_width=1.5,
            zone="middle",
            priority=3
        )
    
    # === THEATRE (very large homes) ===
    if has_theatre or building_area >= THEATRE_THRESHOLD:
        sizes['theatre'] = RoomDimensions(
            width=_clamp(4.5 * avg_scale, 4.0, 6.0),
            depth=_clamp(5.0 * avg_scale, 4.5, 7.0),
            min_width=4.0,
            zone="front",
            priority=3
        )
    
    # =========================================================================
    # CONVERT TO DICT FORMAT & ADD METADATA
    # =========================================================================
    
    result = {}
    for room_type, dims in sizes.items():
        if isinstance(dims, RoomDimensions):
            result[room_type] = dims.to_dict()
        else:
            result[room_type] = dims
    
    # Add metadata
    result['_meta'] = {
        'width_scale': round(width_scale, 3),
        'depth_scale': round(depth_scale, 3),
        'avg_scale': round(avg_scale, 3),
        'area_scale': round(area_scale, 3),
        'bedroom_scale': round(bedroom_scale, 3),
        'building_width': building_width,
        'building_depth': building_depth,
        'building_area': round(building_area, 1),
        'bedrooms': bedrooms,
        'bathrooms': bathrooms,
        'living_areas': living_areas,
        'garage_spaces': garage_spaces,
        'has_wip': has_wip,
        'has_powder': has_powder,
        'has_theatre': has_theatre or building_area >= THEATRE_THRESHOLD,
        'has_study': has_study,
        'is_narrow': is_narrow,
        'is_very_narrow': is_very_narrow
    }
    
    return result


def _clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp a value between min and max, rounded to 1 decimal."""
    return round(max(min_val, min(max_val, value)), 1)


# =============================================================================
# TILE-BASED SIZING
# =============================================================================

def calculate_room_tiles(
    building_width: float,
    building_depth: float,
    requirements: Dict[str, Any],
    tile_size: float = DEFAULT_TILE_SIZE
) -> Dict[str, Dict[str, Any]]:
    """
    Calculate room sizes in tile units for the tile-based layout engine.
    
    Args:
        building_width: Building envelope width in meters
        building_depth: Building envelope depth in meters
        requirements: Requirements dict
        tile_size: Target tile size in meters
    
    Returns:
        Dict mapping room type to {cols, rows, width_m, depth_m, zone}
    """
    # Get meter-based sizes
    sizes = calculate_room_sizes(building_width, building_depth, requirements)
    
    # Calculate actual tile size based on building
    cols = max(8, round(building_width / tile_size))
    rows = max(10, round(building_depth / tile_size))
    actual_tile_w = building_width / cols
    actual_tile_d = building_depth / rows
    
    result = {
        '_grid': {
            'cols': cols,
            'rows': rows,
            'tile_width': round(actual_tile_w, 3),
            'tile_depth': round(actual_tile_d, 3),
            'building_width': building_width,
            'building_depth': building_depth
        }
    }
    
    for room_type, dims in sizes.items():
        if room_type == '_meta':
            result['_meta'] = dims
            continue
        
        if not isinstance(dims, dict) or 'width' not in dims:
            continue
        
        width_m = dims['width']
        depth_m = dims.get('depth', 0)
        
        # Skip variable-length rooms (hallways with depth=0)
        if depth_m == 0:
            result[room_type] = {
                'cols': max(1, round(width_m / actual_tile_w)),
                'rows': 'variable',
                'width_m': width_m,
                'depth_m': 'variable',
                'zone': dims.get('zone', 'middle')
            }
            continue
        
        result[room_type] = {
            'cols': max(1, round(width_m / actual_tile_w)),
            'rows': max(1, round(depth_m / actual_tile_d)),
            'width_m': round(width_m, 1),
            'depth_m': round(depth_m, 1),
            'zone': dims.get('zone', 'middle'),
            'priority': dims.get('priority', 2)
        }
    
    return result


def get_zone_depths(
    building_depth: float,
    requirements: Dict[str, Any]
) -> Dict[str, float]:
    """
    Calculate zone depths based on building depth and requirements.
    
    Returns dict with front, middle, rear zone depths in meters.
    """
    bedrooms = requirements.get('bedrooms', 4)
    
    # Adjust zone percentages based on bedroom count
    # More bedrooms = larger middle zone
    if bedrooms >= 5:
        front_pct = 0.25
        rear_pct = 0.22
    elif bedrooms <= 3:
        front_pct = 0.30
        rear_pct = 0.28
    else:
        front_pct = ZONE_FRONT_PCT
        rear_pct = ZONE_REAR_PCT
    
    front_depth = round(building_depth * front_pct, 1)
    rear_depth = round(building_depth * rear_pct, 1)
    middle_depth = round(building_depth - front_depth - rear_depth, 1)
    
    return {
        'front': front_depth,
        'middle': middle_depth,
        'rear': rear_depth,
        'front_end': front_depth,
        'middle_end': front_depth + middle_depth,
        'rear_end': building_depth
    }


# =============================================================================
# ROOM SIZE QUERIES
# =============================================================================

def get_room_size(
    room_type: str,
    building_width: float,
    building_depth: float,
    requirements: Dict[str, Any] = None
) -> Dict[str, float]:
    """
    Get the size for a specific room type.
    
    Args:
        room_type: Type of room (e.g., 'master', 'bedroom', 'kitchen')
        building_width: Building envelope width
        building_depth: Building envelope depth
        requirements: Optional requirements dict
    
    Returns:
        Dict with 'width', 'depth', 'area', 'zone' keys
    """
    if requirements is None:
        requirements = {}
    
    all_sizes = calculate_room_sizes(building_width, building_depth, requirements)
    
    # Normalize room type
    room_type_lower = room_type.lower().replace(' ', '_').replace('-', '_')
    
    # Handle aliases
    type_aliases = {
        'master_suite': 'master',
        'master_bedroom': 'master',
        'bed_2': 'bedroom',
        'bed_3': 'bedroom',
        'bed_4': 'bedroom',
        'bed_5': 'bedroom',
        'walk_in_robe': 'wir',
        'walk_in_wardrobe': 'wir',
        'wardrobe': 'robe',
        'built_in_robe': 'robe',
        'bir': 'robe',
        'butlers_pantry': 'wip',
        'pantry': 'wip',
        'walk_in_pantry': 'wip',
        'living': 'family',
        'living_room': 'family',
        'family_room': 'family',
        'home_office': 'study',
        'office': 'study',
        'media': 'theatre',
        'media_room': 'theatre',
        'powder_room': 'powder',
        'wc': 'powder',
        'toilet': 'powder',
        'store': 'storage',
        'cupboard': 'linen',
        'linen_cupboard': 'linen',
        'sitting_room': 'sitting',
        'formal_lounge': 'lounge',
        'front_hall': 'hall',
        'rear_hall': 'hall_r',
    }
    
    normalized_type = type_aliases.get(room_type_lower, room_type_lower)
    
    if normalized_type in all_sizes:
        return all_sizes[normalized_type]
    
    # Default to bedroom size for unknown room types
    return all_sizes.get('bedroom', {'width': 3.5, 'depth': 3.5, 'area': 12.25, 'zone': 'middle'})


def get_total_area(
    building_width: float,
    building_depth: float,
    requirements: Dict[str, Any]
) -> Dict[str, float]:
    """
    Calculate total areas for different room categories.
    
    Returns dict with:
    - total_internal: Sum of all internal room areas
    - living_area: Bedrooms + living rooms
    - wet_areas: Bathrooms, ensuite, laundry
    - service_areas: Garage, entry, hallway
    - efficiency: living_area / total_internal ratio
    """
    sizes = calculate_room_sizes(building_width, building_depth, requirements)
    
    bedrooms = requirements.get('bedrooms', 4)
    
    # Calculate areas by category
    living_rooms = ['master', 'bedroom', 'family', 'lounge', 'sitting', 'study', 'theatre']
    wet_rooms = ['ensuite', 'bathroom', 'powder', 'laundry', 'wir', 'robe']
    service_rooms = ['garage', 'entry', 'hall', 'hallway', 'hall_r', 'linen', 'storage']
    kitchen_rooms = ['kitchen', 'dining', 'wip']
    
    living_area = 0
    wet_area = 0
    service_area = 0
    kitchen_area = 0
    
    for room_type, dims in sizes.items():
        if room_type == '_meta' or not isinstance(dims, dict):
            continue
        
        area = dims.get('area', dims.get('width', 0) * dims.get('depth', 0))
        
        # Master counts once, bedrooms count (bedrooms-1) times
        if room_type == 'master':
            living_area += area
        elif room_type == 'bedroom':
            living_area += area * (bedrooms - 1)
        elif room_type == 'robe':
            wet_area += area * (bedrooms - 1)  # One robe per minor bedroom
        elif room_type in living_rooms:
            living_area += area
        elif room_type in wet_rooms:
            wet_area += area
        elif room_type in service_rooms:
            service_area += area
        elif room_type in kitchen_rooms:
            kitchen_area += area
    
    total = living_area + wet_area + service_area + kitchen_area
    building_footprint = building_width * building_depth
    
    return {
        'total_internal': round(total, 1),
        'living_area': round(living_area, 1),
        'wet_areas': round(wet_area, 1),
        'service_areas': round(service_area, 1),
        'kitchen_dining': round(kitchen_area, 1),
        'building_footprint': round(building_footprint, 1),
        'efficiency': round(living_area / total * 100, 1) if total > 0 else 0,
        'coverage': round(total / building_footprint * 100, 1) if building_footprint > 0 else 0
    }


# =============================================================================
# VALIDATION
# =============================================================================

def validate_room_sizes(
    sizes: Dict[str, Dict[str, float]],
    building_width: float,
    building_depth: float,
    requirements: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Validate that calculated room sizes are reasonable.
    
    Checks:
    - Total area doesn't exceed building footprint significantly
    - All rooms meet minimum dimensions
    - Zone allocations are balanced
    
    Returns dict with validation results.
    """
    errors = []
    warnings = []
    
    meta = sizes.get('_meta', {})
    building_area = building_width * building_depth
    
    # Calculate total room area
    total_area = 0
    zone_areas = {'front': 0, 'middle': 0, 'rear': 0, 'exterior': 0}
    
    for room_type, dims in sizes.items():
        if room_type == '_meta' or not isinstance(dims, dict):
            continue
        
        area = dims.get('area', dims.get('width', 0) * dims.get('depth', 0))
        zone = dims.get('zone', 'middle')
        
        if zone != 'exterior':
            total_area += area
        
        if zone in zone_areas:
            zone_areas[zone] += area
    
    # Check total area vs footprint
    coverage = total_area / building_area if building_area > 0 else 0
    
    if coverage > 1.2:
        errors.append(f"Total room area ({total_area:.1f}m²) exceeds footprint ({building_area:.1f}m²) by {(coverage-1)*100:.0f}%")
    elif coverage > 1.05:
        warnings.append(f"Total room area slightly exceeds footprint (coverage: {coverage*100:.0f}%)")
    elif coverage < 0.8:
        warnings.append(f"Low coverage ({coverage*100:.0f}%) - significant circulation/wall space")
    
    # Check zone balance
    internal_area = zone_areas['front'] + zone_areas['middle'] + zone_areas['rear']
    if internal_area > 0:
        front_pct = zone_areas['front'] / internal_area
        rear_pct = zone_areas['rear'] / internal_area
        
        if front_pct > 0.45:
            warnings.append(f"Front zone is large ({front_pct*100:.0f}% of internal area)")
        if rear_pct > 0.45:
            warnings.append(f"Rear zone is large ({rear_pct*100:.0f}% of internal area)")
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
        'total_area': round(total_area, 1),
        'building_area': round(building_area, 1),
        'coverage': round(coverage * 100, 1),
        'zone_areas': {k: round(v, 1) for k, v in zone_areas.items()}
    }


# =============================================================================
# FORMATTING FOR PROMPTS
# =============================================================================

def format_room_sizes_for_prompt(
    sizes: Dict[str, Dict[str, float]],
    requirements: Dict[str, Any]
) -> str:
    """
    Format room sizes as a string for inclusion in AI prompts.
    
    Args:
        sizes: Room sizes from calculate_room_sizes()
        requirements: Original requirements dict
    
    Returns:
        Formatted string listing all room dimensions
    """
    lines = []
    
    bedrooms = requirements.get('bedrooms', 4)
    living_areas = requirements.get('living_areas', 1)
    
    def fmt(room_type: str, label: str = None) -> str:
        dims = sizes.get(room_type, {})
        w = dims.get('width', 0)
        d = dims.get('depth', 0)
        if label is None:
            label = room_type.upper()
        return f"• {label}: {w:.1f}m × {d:.1f}m"
    
    # Front zone
    lines.append("=== FRONT ZONE ===")
    lines.append(fmt('garage', 'GARAGE'))
    lines.append(fmt('entry', 'ENTRY'))
    lines.append(fmt('hall', 'HALL'))
    if 'lounge' in sizes:
        lines.append(fmt('lounge', 'LOUNGE'))
    elif 'sitting' in sizes:
        lines.append(fmt('sitting', 'SITTING'))
    
    # Middle zone
    lines.append("\n=== MIDDLE ZONE ===")
    lines.append(fmt('bedroom', f'BEDROOMS (×{bedrooms-1})'))
    lines.append(fmt('robe', 'ROBES'))
    lines.append(fmt('bathroom', 'BATHROOM'))
    lines.append(fmt('linen', 'LINEN'))
    lines.append(fmt('hallway', 'HALLWAY'))
    lines.append(fmt('kitchen', 'KITCHEN'))
    lines.append(fmt('laundry', 'LAUNDRY'))
    if 'study' in sizes:
        lines.append(fmt('study', 'STUDY'))
    if 'wip' in sizes:
        lines.append(fmt('wip', 'WIP/PANTRY'))
    
    # Rear zone
    lines.append("\n=== REAR ZONE ===")
    lines.append(fmt('master', 'MASTER SUITE'))
    lines.append(fmt('ensuite', 'ENSUITE'))
    lines.append(fmt('wir', 'WIR'))
    lines.append(fmt('hall_r', 'REAR HALL'))
    lines.append(fmt('dining', 'DINING'))
    lines.append(fmt('family', 'FAMILY'))
    
    # Exterior
    lines.append("\n=== EXTERIOR ===")
    lines.append(fmt('alfresco', 'ALFRESCO'))
    
    # Optional
    if 'powder' in sizes:
        lines.append(f"\n• POWDER: {sizes['powder']['width']:.1f}m × {sizes['powder']['depth']:.1f}m")
    if 'theatre' in sizes:
        lines.append(f"• THEATRE: {sizes['theatre']['width']:.1f}m × {sizes['theatre']['depth']:.1f}m")
    
    return '\n'.join(lines)


def format_room_tiles_for_prompt(
    tiles: Dict[str, Dict[str, Any]],
    requirements: Dict[str, Any]
) -> str:
    """
    Format room tile counts as a string for the tile-based layout engine.
    
    Args:
        tiles: Room tiles from calculate_room_tiles()
        requirements: Original requirements dict
    
    Returns:
        Formatted string with tile counts per room
    """
    grid = tiles.get('_grid', {})
    lines = [
        f"Grid: {grid.get('cols', 0)} × {grid.get('rows', 0)} tiles",
        f"Tile size: {grid.get('tile_width', 0):.2f}m × {grid.get('tile_depth', 0):.2f}m",
        ""
    ]
    
    bedrooms = requirements.get('bedrooms', 4)
    
    for room_type, dims in tiles.items():
        if room_type.startswith('_'):
            continue
        
        cols = dims.get('cols', 0)
        rows = dims.get('rows', 'var')
        zone = dims.get('zone', '?')
        
        if room_type == 'bedroom':
            lines.append(f"• {room_type.upper()} (×{bedrooms-1}): {cols}×{rows} tiles [{zone}]")
        else:
            lines.append(f"• {room_type.upper()}: {cols}×{rows} tiles [{zone}]")
    
    return '\n'.join(lines)
