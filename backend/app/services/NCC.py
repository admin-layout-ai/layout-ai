# backend/app/services/NCC.py
# National Construction Code (NCC) validation for Australian residential buildings
# Based on NCC 2022 Volume Two (Class 1 and 10 buildings)
# 
# Reference: https://ncc.abcb.gov.au/

from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# ENUMS AND CONSTANTS
# =============================================================================

class BuildingClass(Enum):
    CLASS_1A = "1a"  # Single dwelling
    CLASS_1B = "1b"  # Boarding house, guest house (max 12 persons)
    CLASS_10A = "10a"  # Non-habitable building (garage, carport)
    CLASS_10B = "10b"  # Structure (fence, mast, retaining wall)


class ClimateZone(Enum):
    """Australian climate zones for energy efficiency."""
    ZONE_1 = 1  # High humidity summer, warm winter (Darwin)
    ZONE_2 = 2  # Warm humid summer, mild winter (Brisbane)
    ZONE_3 = 3  # Hot dry summer, warm winter (Alice Springs)
    ZONE_4 = 4  # Hot dry summer, cool winter (Kalgoorlie)
    ZONE_5 = 5  # Warm temperate (Sydney, Perth)
    ZONE_6 = 6  # Mild temperate (Melbourne)
    ZONE_7 = 7  # Cool temperate (Hobart)
    ZONE_8 = 8  # Alpine (Thredbo)


class BALRating(Enum):
    """Bushfire Attack Level ratings."""
    BAL_LOW = "BAL-LOW"
    BAL_12_5 = "BAL-12.5"
    BAL_19 = "BAL-19"
    BAL_29 = "BAL-29"
    BAL_40 = "BAL-40"
    BAL_FZ = "BAL-FZ"  # Flame Zone


# =============================================================================
# NCC MINIMUM ROOM SIZES
# =============================================================================

@dataclass
class MinimumRoomSize:
    """NCC minimum room dimensions."""
    min_area: float      # m²
    min_width: float     # m (narrowest dimension)
    min_height: float    # m (ceiling height)
    
    def validate(self, width: float, depth: float, height: float = 2.4) -> List[str]:
        """Validate room dimensions against NCC requirements."""
        issues = []
        area = width * depth
        min_dimension = min(width, depth)
        
        if area < self.min_area:
            issues.append(f"Area {area:.1f}m² below NCC minimum {self.min_area}m²")
        
        if min_dimension < self.min_width:
            issues.append(f"Width {min_dimension:.1f}m below NCC minimum {self.min_width}m")
        
        if height < self.min_height:
            issues.append(f"Height {height:.1f}m below NCC minimum {self.min_height}m")
        
        return issues


# NCC 2022 Minimum Room Requirements
# Part 3.8.2 - Room sizes
NCC_ROOM_SIZES: Dict[str, MinimumRoomSize] = {
    # Habitable rooms (Part 3.8.2.2)
    'bedroom': MinimumRoomSize(
        min_area=6.5,      # m² - NCC minimum for bedroom
        min_width=2.1,     # m - minimum dimension
        min_height=2.4     # m - standard ceiling
    ),
    'master_bedroom': MinimumRoomSize(
        min_area=9.0,      # m² - recommended for master
        min_width=2.7,     # m
        min_height=2.4
    ),
    'living': MinimumRoomSize(
        min_area=10.0,     # m²
        min_width=3.0,     # m
        min_height=2.4
    ),
    'family': MinimumRoomSize(
        min_area=10.0,
        min_width=3.0,
        min_height=2.4
    ),
    'lounge': MinimumRoomSize(
        min_area=10.0,
        min_width=3.0,
        min_height=2.4
    ),
    'dining': MinimumRoomSize(
        min_area=8.0,
        min_width=2.4,
        min_height=2.4
    ),
    'kitchen': MinimumRoomSize(
        min_area=5.5,      # m² - NCC minimum
        min_width=1.8,     # m
        min_height=2.4
    ),
    'study': MinimumRoomSize(
        min_area=5.5,
        min_width=2.1,
        min_height=2.4
    ),
    
    # Non-habitable rooms (Part 3.8.2.3)
    'bathroom': MinimumRoomSize(
        min_area=2.5,      # m² - practical minimum
        min_width=1.5,     # m
        min_height=2.1     # m - can be lower
    ),
    'ensuite': MinimumRoomSize(
        min_area=3.0,
        min_width=1.5,
        min_height=2.1
    ),
    'powder': MinimumRoomSize(
        min_area=1.2,
        min_width=0.9,
        min_height=2.1
    ),
    'laundry': MinimumRoomSize(
        min_area=2.2,
        min_width=1.2,
        min_height=2.1
    ),
    'wir': MinimumRoomSize(  # Walk-in robe
        min_area=2.0,
        min_width=1.2,
        min_height=2.1
    ),
    'pantry': MinimumRoomSize(
        min_area=1.5,
        min_width=0.9,
        min_height=2.1
    ),
    'garage': MinimumRoomSize(
        min_area=18.0,     # m² - single car minimum
        min_width=3.0,     # m - single car
        min_height=2.1
    ),
    'hallway': MinimumRoomSize(
        min_area=0.0,      # Corridors measured by width
        min_width=1.0,     # m - NCC minimum corridor width
        min_height=2.1
    ),
    'entry': MinimumRoomSize(
        min_area=2.0,
        min_width=1.2,
        min_height=2.4
    ),
    'alfresco': MinimumRoomSize(
        min_area=10.0,     # m² - outdoor living
        min_width=2.4,
        min_height=2.1     # If covered
    ),
}


# =============================================================================
# NCC DOOR AND WINDOW REQUIREMENTS
# =============================================================================

@dataclass
class DoorRequirements:
    """NCC door dimension requirements."""
    min_width: float       # m - clear opening
    min_height: float      # m - clear opening
    
    # Specific requirements
    external_min_width: float = 0.82    # Part 3.8.1.2
    internal_min_width: float = 0.72    # Standard internal
    bathroom_min_width: float = 0.62    # Can be smaller
    corridor_width_at_door: float = 1.0 # Min corridor at door swing


NCC_DOOR_REQUIREMENTS = DoorRequirements(
    min_width=0.82,        # m - external doors
    min_height=2.04,       # m - standard door height
    external_min_width=0.82,
    internal_min_width=0.72,
    bathroom_min_width=0.62
)


@dataclass  
class WindowRequirements:
    """NCC window and natural light requirements."""
    # Part 3.8.4 - Light
    min_window_area_ratio: float = 0.10  # 10% of floor area for habitable rooms
    
    # Part 3.8.5 - Ventilation
    min_ventilation_ratio: float = 0.05   # 5% of floor area openable
    
    # Emergency egress (Part 3.9.2.4)
    egress_min_area: float = 0.35        # m² minimum opening
    egress_min_width: float = 0.45       # m minimum dimension
    egress_min_height: float = 0.60      # m minimum dimension


NCC_WINDOW_REQUIREMENTS = WindowRequirements()


# =============================================================================
# NCC STAIRS AND ACCESS
# =============================================================================

@dataclass
class StairRequirements:
    """NCC stair requirements (Part 3.9.1)."""
    min_width: float = 0.85           # m - between handrails
    max_riser: float = 0.19           # m - maximum rise
    min_going: float = 0.24           # m - minimum going
    max_flight_rise: float = 3.6      # m - max vertical rise per flight
    min_headroom: float = 2.0         # m - vertical clearance
    
    # Riser-going relationship: 2R + G between 550mm and 700mm
    min_2r_plus_g: float = 0.55
    max_2r_plus_g: float = 0.70


NCC_STAIR_REQUIREMENTS = StairRequirements()


# =============================================================================
# NCC GARAGE REQUIREMENTS
# =============================================================================

@dataclass
class GarageRequirements:
    """Garage minimum dimensions."""
    single_min_width: float = 3.0      # m
    single_min_depth: float = 5.4      # m
    double_min_width: float = 5.4      # m (2 x 2.7m per car)
    double_min_depth: float = 5.4      # m
    min_door_height: float = 2.1       # m
    single_door_min_width: float = 2.4 # m
    double_door_min_width: float = 4.8 # m
    
    def get_min_size(self, spaces: int) -> Tuple[float, float]:
        """Get minimum width, depth for given car spaces."""
        if spaces >= 2:
            return (self.double_min_width, self.double_min_depth)
        return (self.single_min_width, self.single_min_depth)
    
    def validate(self, width: float, depth: float, spaces: int = 2) -> List[str]:
        """Validate garage dimensions."""
        issues = []
        min_w, min_d = self.get_min_size(spaces)
        
        if width < min_w:
            issues.append(f"Garage width {width:.1f}m below NCC minimum {min_w}m for {spaces}-car")
        
        if depth < min_d:
            issues.append(f"Garage depth {depth:.1f}m below NCC minimum {min_d}m")
        
        return issues


NCC_GARAGE_REQUIREMENTS = GarageRequirements()


# =============================================================================
# NCC FIRE SEPARATION
# =============================================================================

@dataclass
class FireSeparation:
    """Fire separation requirements between garage and dwelling."""
    wall_frl: str = "60/60/60"         # Fire Resistance Level
    ceiling_frl: str = "60/60/60"
    door_rating: str = "-/60/30"       # Self-closing
    no_opening_to_bedroom: bool = True # No direct opening to bedroom
    
    def validate_garage_location(self, rooms: List[Dict]) -> List[str]:
        """Validate garage doesn't open directly to bedrooms."""
        issues = []
        
        garage = next((r for r in rooms if 'garage' in r.get('type', '').lower()), None)
        if not garage:
            return issues
        
        # Check if garage is adjacent to any bedroom
        for room in rooms:
            room_type = room.get('type', '').lower()
            if 'bedroom' in room_type or 'master' in room_type:
                if self._rooms_adjacent(garage, room):
                    issues.append(f"Garage adjacent to {room.get('name', 'bedroom')} - "
                                "fire separation required, no direct door allowed")
        
        return issues
    
    def _rooms_adjacent(self, room1: Dict, room2: Dict) -> bool:
        """Check if rooms share a wall."""
        x1, y1 = room1.get('x', 0), room1.get('y', 0)
        w1, d1 = room1.get('width', 0), room1.get('depth', 0)
        x2, y2 = room2.get('x', 0), room2.get('y', 0)
        w2, d2 = room2.get('width', 0), room2.get('depth', 0)
        
        tolerance = 0.3
        
        # Check horizontal adjacency
        horiz_overlap = not (x1 + w1 < x2 - tolerance or x2 + w2 < x1 - tolerance)
        vert_touch = abs((y1 + d1) - y2) < tolerance or abs((y2 + d2) - y1) < tolerance
        
        # Check vertical adjacency
        vert_overlap = not (y1 + d1 < y2 - tolerance or y2 + d2 < y1 - tolerance)
        horiz_touch = abs((x1 + w1) - x2) < tolerance or abs((x2 + w2) - x1) < tolerance
        
        return (horiz_overlap and vert_touch) or (vert_overlap and horiz_touch)


NCC_FIRE_SEPARATION = FireSeparation()


# =============================================================================
# NCC LIVABILITY REQUIREMENTS
# =============================================================================

@dataclass
class LiveabilityRequirements:
    """Livability requirements (Silver Level - Part H8)."""
    
    # Dwelling entry
    step_free_entry: bool = True
    door_clear_width: float = 0.82       # m
    level_landing_min: float = 1.2       # m x 1.2m
    
    # Internal doors and corridors
    corridor_min_width: float = 1.0      # m
    internal_door_width: float = 0.82    # m
    
    # Bathroom requirements
    toilet_side_clearance: float = 0.45  # m one side
    shower_size: Tuple[float, float] = (0.9, 0.9)  # m
    
    # Reinforcement for grab rails
    reinforcement_required: bool = True


NCC_LIVABILITY = LiveabilityRequirements()


# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

def validate_room_size(
    room_type: str,
    width: float,
    depth: float,
    height: float = 2.4
) -> Dict[str, Any]:
    """
    Validate a single room against NCC requirements.
    
    Returns validation result with any issues found.
    """
    # Normalize room type
    room_type_lower = room_type.lower().replace(' ', '_').replace('-', '_')
    
    # Map variations to standard types
    type_mapping = {
        'master_suite': 'master_bedroom',
        'master': 'master_bedroom',
        'bed_2': 'bedroom',
        'bed_3': 'bedroom',
        'bed_4': 'bedroom',
        'bed': 'bedroom',
        'wc': 'powder',
        'powder_room': 'powder',
        'walk_in_robe': 'wir',
        'walk_in_wardrobe': 'wir',
        'wip': 'pantry',
        'butlers_pantry': 'pantry',
        'living': 'lounge',
        'theatre': 'lounge',
        'media': 'lounge',
        'office': 'study',
        'home_office': 'study',
    }
    
    normalized_type = type_mapping.get(room_type_lower, room_type_lower)
    
    # Get requirements
    requirements = NCC_ROOM_SIZES.get(normalized_type)
    if not requirements:
        # Unknown room type - apply generic minimum
        requirements = MinimumRoomSize(min_area=4.0, min_width=1.5, min_height=2.1)
    
    issues = requirements.validate(width, depth, height)
    
    return {
        'room_type': room_type,
        'normalized_type': normalized_type,
        'width': width,
        'depth': depth,
        'area': width * depth,
        'compliant': len(issues) == 0,
        'issues': issues,
        'requirements': {
            'min_area': requirements.min_area,
            'min_width': requirements.min_width,
            'min_height': requirements.min_height
        }
    }


def validate_garage(
    width: float,
    depth: float,
    spaces: int = 2
) -> Dict[str, Any]:
    """Validate garage dimensions against NCC requirements."""
    issues = NCC_GARAGE_REQUIREMENTS.validate(width, depth, spaces)
    min_w, min_d = NCC_GARAGE_REQUIREMENTS.get_min_size(spaces)
    
    return {
        'compliant': len(issues) == 0,
        'issues': issues,
        'requirements': {
            'min_width': min_w,
            'min_depth': min_d,
            'spaces': spaces
        }
    }


def validate_circulation(
    hallway_width: float,
    has_accessible_entry: bool = True
) -> Dict[str, Any]:
    """Validate circulation requirements."""
    issues = []
    
    if hallway_width < 1.0:
        issues.append(f"Hallway width {hallway_width:.2f}m below NCC minimum 1.0m")
    
    if hallway_width < 1.2 and has_accessible_entry:
        issues.append(f"Hallway width {hallway_width:.2f}m below livability standard 1.2m")
    
    return {
        'compliant': len(issues) == 0,
        'issues': issues,
        'livability_compliant': hallway_width >= 1.2
    }


def validate_floor_plan_ncc(
    floor_plan_json: Dict[str, Any],
    storeys: int = 1,
    ceiling_height: float = 2.4,
    garage_spaces: int = 2
) -> Dict[str, Any]:
    """
    Comprehensive NCC validation for a floor plan.
    
    Validates:
    - Room sizes
    - Garage dimensions
    - Circulation widths
    - Fire separation
    - Basic livability
    
    Returns detailed compliance report.
    """
    rooms = floor_plan_json.get('rooms', [])
    
    if not rooms:
        return {
            'compliant': False,
            'errors': ['No rooms in floor plan'],
            'warnings': [],
            'room_compliance': {}
        }
    
    errors = []
    warnings = []
    room_compliance = {}
    
    # 1. Validate each room
    for room in rooms:
        room_name = room.get('name', room.get('type', 'Unknown'))
        room_type = room.get('type', room.get('name', 'unknown'))
        width = room.get('width', 0)
        depth = room.get('depth', 0)
        
        validation = validate_room_size(room_type, width, depth, ceiling_height)
        room_compliance[room_name] = validation
        
        if not validation['compliant']:
            for issue in validation['issues']:
                # Size issues for non-critical rooms are warnings
                if any(x in room_type.lower() for x in ['bedroom', 'kitchen', 'living', 'family']):
                    errors.append(f"{room_name}: {issue}")
                else:
                    warnings.append(f"{room_name}: {issue}")
    
    # 2. Validate garage specifically
    garage = next((r for r in rooms if 'garage' in r.get('type', '').lower()), None)
    if garage:
        garage_validation = validate_garage(
            garage.get('width', 0),
            garage.get('depth', 0),
            garage_spaces
        )
        room_compliance['garage_specific'] = garage_validation
        
        if not garage_validation['compliant']:
            errors.extend(garage_validation['issues'])
    else:
        warnings.append("No garage found in floor plan")
    
    # 3. Validate hallway/circulation
    hallway = next((r for r in rooms if 'hallway' in r.get('type', '').lower() 
                    or 'hall' in r.get('name', '').lower()), None)
    if hallway:
        hallway_width = min(hallway.get('width', 1.2), hallway.get('depth', 1.2))
        if 'wide' in str(hallway.get('name', '')).lower():
            # Extract width from name like "HALLWAY 1.2m wide"
            import re
            match = re.search(r'(\d+\.?\d*)\s*m', str(hallway.get('name', '')))
            if match:
                hallway_width = float(match.group(1))
        
        circ_validation = validate_circulation(hallway_width)
        room_compliance['circulation'] = circ_validation
        
        if not circ_validation['compliant']:
            errors.extend(circ_validation['issues'])
    
    # 4. Validate fire separation (garage to bedrooms)
    fire_issues = NCC_FIRE_SEPARATION.validate_garage_location(rooms)
    for issue in fire_issues:
        warnings.append(f"Fire separation: {issue}")
    
    # 5. Count and validate required rooms
    bedroom_count = sum(1 for r in rooms if any(x in r.get('type', '').lower() 
                        for x in ['bedroom', 'master', 'bed_']))
    bathroom_count = sum(1 for r in rooms if any(x in r.get('type', '').lower() 
                         for x in ['bathroom', 'ensuite']))
    
    # Minimum 1 bathroom required
    if bathroom_count < 1:
        errors.append("At least one bathroom required (NCC Part 3.8.3)")
    
    # 6. Validate kitchen presence
    kitchen = next((r for r in rooms if 'kitchen' in r.get('type', '').lower()), None)
    if not kitchen:
        errors.append("Kitchen required for Class 1a dwelling")
    
    # 7. Validate laundry
    laundry = next((r for r in rooms if 'laundry' in r.get('type', '').lower()), None)
    if not laundry:
        warnings.append("Laundry space recommended")
    
    # 8. Multi-storey specific checks
    if storeys > 1:
        warnings.append(f"Multi-storey ({storeys}): Verify stair compliance with Part 3.9.1")
        warnings.append("Smoke alarm interconnection required for multi-storey")
    
    return {
        'compliant': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
        'room_compliance': room_compliance,
        'summary': {
            'total_rooms': len(rooms),
            'bedrooms': bedroom_count,
            'bathrooms': bathroom_count,
            'compliant_rooms': sum(1 for v in room_compliance.values() 
                                   if isinstance(v, dict) and v.get('compliant', False)),
            'storeys': storeys
        }
    }


def get_minimum_room_sizes() -> Dict[str, Dict[str, float]]:
    """Get all NCC minimum room sizes for reference."""
    return {
        room_type: {
            'min_area': req.min_area,
            'min_width': req.min_width,
            'min_height': req.min_height
        }
        for room_type, req in NCC_ROOM_SIZES.items()
    }


def get_ncc_requirements_summary() -> Dict[str, Any]:
    """Get summary of NCC requirements for API responses."""
    return {
        'room_sizes': get_minimum_room_sizes(),
        'garage': {
            'single': {
                'min_width': NCC_GARAGE_REQUIREMENTS.single_min_width,
                'min_depth': NCC_GARAGE_REQUIREMENTS.single_min_depth
            },
            'double': {
                'min_width': NCC_GARAGE_REQUIREMENTS.double_min_width,
                'min_depth': NCC_GARAGE_REQUIREMENTS.double_min_depth
            }
        },
        'doors': {
            'external_min_width': NCC_DOOR_REQUIREMENTS.external_min_width,
            'internal_min_width': NCC_DOOR_REQUIREMENTS.internal_min_width,
            'min_height': NCC_DOOR_REQUIREMENTS.min_height
        },
        'windows': {
            'min_window_area_ratio': NCC_WINDOW_REQUIREMENTS.min_window_area_ratio,
            'min_ventilation_ratio': NCC_WINDOW_REQUIREMENTS.min_ventilation_ratio
        },
        'stairs': {
            'min_width': NCC_STAIR_REQUIREMENTS.min_width,
            'max_riser': NCC_STAIR_REQUIREMENTS.max_riser,
            'min_going': NCC_STAIR_REQUIREMENTS.min_going
        },
        'circulation': {
            'min_hallway_width': 1.0,
            'livability_hallway_width': 1.2
        },
        'ceiling_heights': {
            'habitable_rooms': 2.4,
            'non_habitable_rooms': 2.1
        }
    }


# =============================================================================
# ENERGY EFFICIENCY (Part 13 / NatHERS)
# =============================================================================

def get_climate_zone(postcode: str) -> Optional[ClimateZone]:
    """
    Get climate zone from postcode.
    Simplified mapping - in production, use full NCC climate zone database.
    """
    # NSW postcode ranges (simplified)
    try:
        pc = int(postcode)
        
        # Sydney metro (Zone 5 - Warm Temperate)
        if 2000 <= pc <= 2234 or 2555 <= pc <= 2574 or 2740 <= pc <= 2786:
            return ClimateZone.ZONE_5
        
        # NSW coast (Zone 5)
        if 2250 <= pc <= 2489 or 2500 <= pc <= 2551:
            return ClimateZone.ZONE_5
        
        # NSW inland (Zone 4 - Hot Dry Summer, Cool Winter)
        if 2580 <= pc <= 2739 or 2787 <= pc <= 2899:
            return ClimateZone.ZONE_4
        
        # Alpine areas (Zone 7/8)
        if 2624 <= pc <= 2633:
            return ClimateZone.ZONE_7
        
        # Default for NSW
        return ClimateZone.ZONE_5
        
    except ValueError:
        return None


def get_energy_requirements(climate_zone: ClimateZone) -> Dict[str, Any]:
    """Get energy efficiency requirements for climate zone."""
    
    # NatHERS star ratings and thermal requirements
    requirements = {
        ClimateZone.ZONE_1: {
            'min_stars': 6.0,
            'cooling_priority': 'high',
            'heating_priority': 'low',
            'insulation_ceiling': 'R4.0',
            'insulation_wall': 'R2.0',
            'glazing_u_value': 6.0
        },
        ClimateZone.ZONE_5: {
            'min_stars': 6.0,
            'cooling_priority': 'medium',
            'heating_priority': 'medium',
            'insulation_ceiling': 'R5.0',
            'insulation_wall': 'R2.5',
            'glazing_u_value': 5.4
        },
        ClimateZone.ZONE_6: {
            'min_stars': 6.0,
            'cooling_priority': 'low',
            'heating_priority': 'high',
            'insulation_ceiling': 'R6.0',
            'insulation_wall': 'R2.5',
            'glazing_u_value': 4.5
        },
        ClimateZone.ZONE_7: {
            'min_stars': 6.0,
            'cooling_priority': 'low',
            'heating_priority': 'high',
            'insulation_ceiling': 'R6.0',
            'insulation_wall': 'R2.7',
            'glazing_u_value': 4.0
        },
    }
    
    return requirements.get(climate_zone, requirements[ClimateZone.ZONE_5])


# =============================================================================
# BUSHFIRE REQUIREMENTS (BAL)
# =============================================================================

def get_bal_requirements(bal_rating: BALRating) -> Dict[str, Any]:
    """Get construction requirements for BAL rating."""
    
    requirements = {
        BALRating.BAL_LOW: {
            'construction': 'Standard construction permitted',
            'ember_protection': False,
            'glazing': 'Standard',
            'external_walls': 'Standard'
        },
        BALRating.BAL_12_5: {
            'construction': 'Enhanced construction required',
            'ember_protection': True,
            'glazing': 'Standard or toughened',
            'external_walls': 'Non-combustible or BAL-rated',
            'decking': 'Non-combustible or hardwood'
        },
        BALRating.BAL_19: {
            'construction': 'Enhanced construction required',
            'ember_protection': True,
            'glazing': 'Toughened glass',
            'external_walls': 'Non-combustible',
            'decking': 'Non-combustible'
        },
        BALRating.BAL_29: {
            'construction': 'High BAL construction',
            'ember_protection': True,
            'glazing': 'Toughened glass 5mm+',
            'external_walls': 'Non-combustible FRL 30/30/30',
            'windows': 'Screened or shuttered'
        },
        BALRating.BAL_40: {
            'construction': 'Very high BAL construction',
            'ember_protection': True,
            'glazing': 'Toughened glass 6mm+ or BAL-40 system',
            'external_walls': 'Non-combustible FRL 60/60/60',
            'windows': 'Screened and shuttered'
        },
        BALRating.BAL_FZ: {
            'construction': 'Flame Zone - specialist design required',
            'ember_protection': True,
            'glazing': 'BAL-FZ system required',
            'external_walls': 'FRL 60/60/60 + BAL-FZ',
            'note': 'Development may not be permitted'
        }
    }
    
    return requirements.get(bal_rating, requirements[BALRating.BAL_LOW])
