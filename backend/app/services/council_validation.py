# backend/app/services/council_validation.py
# Council-specific validation rules for Australian residential development
# Includes setbacks, site coverage, landscaping requirements per council

from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# ENUMS AND DATA CLASSES
# =============================================================================

class LotType(Enum):
    STANDARD = "standard"
    CORNER = "corner"
    BATTLE_AXE = "battle_axe"
    NARROW = "narrow"  # < 12m width
    SMALL = "small"    # < 300m² area


class ZoneType(Enum):
    R1_GENERAL = "R1"           # General Residential
    R2_LOW_DENSITY = "R2"       # Low Density Residential
    R3_MEDIUM_DENSITY = "R3"    # Medium Density Residential
    R4_HIGH_DENSITY = "R4"      # High Density Residential
    RU5_VILLAGE = "RU5"         # Village


@dataclass
class Setbacks:
    """Setback requirements in meters."""
    front: float
    rear: float
    side_primary: float
    side_secondary: float
    corner_secondary: float = 3.0
    garage_setback: float = 5.5  # Minimum from front boundary
    
    def get_side_setback(self, lot_type: LotType = LotType.STANDARD) -> float:
        """Get appropriate side setback based on lot type."""
        if lot_type == LotType.CORNER:
            return self.corner_secondary
        return self.side_primary


@dataclass
class SiteCoverage:
    """Site coverage limits as percentages."""
    max_site_coverage: float      # % of lot that can be built on
    max_floor_space_ratio: float  # FSR - total floor area / lot area
    min_landscaped_area: float    # % that must be landscaped
    min_deep_soil: float          # % for deep soil planting
    
    def validate(self, lot_area: float, building_footprint: float, 
                 total_floor_area: float, landscaped_area: float) -> List[str]:
        """Validate site coverage requirements. Returns list of issues."""
        issues = []
        
        site_coverage = (building_footprint / lot_area) * 100
        if site_coverage > self.max_site_coverage:
            issues.append(f"Site coverage {site_coverage:.1f}% exceeds maximum {self.max_site_coverage}%")
        
        fsr = total_floor_area / lot_area
        if fsr > self.max_floor_space_ratio:
            issues.append(f"FSR {fsr:.2f} exceeds maximum {self.max_floor_space_ratio}")
        
        landscape_pct = (landscaped_area / lot_area) * 100
        if landscape_pct < self.min_landscaped_area:
            issues.append(f"Landscaped area {landscape_pct:.1f}% below minimum {self.min_landscaped_area}%")
        
        return issues


@dataclass
class HeightLimits:
    """Building height limits."""
    max_wall_height: float    # meters
    max_overall_height: float # meters (to ridge)
    max_storeys: int
    
    def validate(self, wall_height: float, overall_height: float, storeys: int) -> List[str]:
        """Validate height requirements."""
        issues = []
        
        if wall_height > self.max_wall_height:
            issues.append(f"Wall height {wall_height}m exceeds maximum {self.max_wall_height}m")
        
        if overall_height > self.max_overall_height:
            issues.append(f"Overall height {overall_height}m exceeds maximum {self.max_overall_height}m")
        
        if storeys > self.max_storeys:
            issues.append(f"{storeys} storeys exceeds maximum {self.max_storeys}")
        
        return issues


@dataclass
class ParkingRequirements:
    """Parking space requirements."""
    min_spaces_per_dwelling: int
    min_garage_width: float      # meters for single
    min_garage_depth: float
    min_double_garage_width: float
    visitor_spaces: float        # per dwelling (can be 0)
    
    def get_min_garage_size(self, spaces: int) -> Tuple[float, float]:
        """Get minimum garage dimensions for given spaces."""
        if spaces >= 2:
            return (self.min_double_garage_width, self.min_garage_depth)
        return (self.min_garage_width, self.min_garage_depth)
    
    def validate(self, garage_spaces: int, garage_width: float, 
                 garage_depth: float) -> List[str]:
        """Validate parking requirements."""
        issues = []
        
        if garage_spaces < self.min_spaces_per_dwelling:
            issues.append(f"{garage_spaces} parking spaces below minimum {self.min_spaces_per_dwelling}")
        
        min_w, min_d = self.get_min_garage_size(garage_spaces)
        
        if garage_width < min_w - 0.1:  # 0.1m tolerance
            issues.append(f"Garage width {garage_width}m below minimum {min_w}m for {garage_spaces}-car")
        
        if garage_depth < min_d - 0.1:
            issues.append(f"Garage depth {garage_depth}m below minimum {min_d}m")
        
        return issues


@dataclass
class CouncilRequirements:
    """Complete council requirements package."""
    council_name: str
    setbacks: Setbacks
    site_coverage: SiteCoverage
    height_limits: HeightLimits
    parking: ParkingRequirements
    
    # Additional requirements
    min_lot_width: float = 12.0          # meters
    min_lot_area: float = 450.0          # m²
    min_private_open_space: float = 24.0 # m²
    min_solar_access: float = 3.0        # hours on 21 June
    max_excavation_depth: float = 1.0    # meters without additional approval
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses."""
        return {
            'council_name': self.council_name,
            'setbacks': {
                'front': self.setbacks.front,
                'rear': self.setbacks.rear,
                'side_primary': self.setbacks.side_primary,
                'side_secondary': self.setbacks.side_secondary,
                'corner_secondary': self.setbacks.corner_secondary,
                'garage_setback': self.setbacks.garage_setback
            },
            'site_coverage': {
                'max_site_coverage': self.site_coverage.max_site_coverage,
                'max_fsr': self.site_coverage.max_floor_space_ratio,
                'min_landscaped_area': self.site_coverage.min_landscaped_area
            },
            'height_limits': {
                'max_wall_height': self.height_limits.max_wall_height,
                'max_overall_height': self.height_limits.max_overall_height,
                'max_storeys': self.height_limits.max_storeys
            },
            'parking': {
                'min_spaces': self.parking.min_spaces_per_dwelling,
                'min_garage_width': self.parking.min_garage_width,
                'min_double_garage_width': self.parking.min_double_garage_width,
                'min_garage_depth': self.parking.min_garage_depth
            },
            'other': {
                'min_lot_width': self.min_lot_width,
                'min_lot_area': self.min_lot_area,
                'min_private_open_space': self.min_private_open_space
            }
        }


# =============================================================================
# COUNCIL CONFIGURATIONS
# =============================================================================

COUNCIL_REQUIREMENTS: Dict[str, CouncilRequirements] = {
    'The Hills Shire Council': CouncilRequirements(
        council_name='The Hills Shire Council',
        setbacks=Setbacks(
            front=6.0,
            rear=1.5,  # Can be 0.9m for single storey
            side_primary=0.9,
            side_secondary=0.9,
            corner_secondary=3.0,
            garage_setback=5.5
        ),
        site_coverage=SiteCoverage(
            max_site_coverage=60.0,
            max_floor_space_ratio=0.5,
            min_landscaped_area=30.0,
            min_deep_soil=15.0
        ),
        height_limits=HeightLimits(
            max_wall_height=7.2,
            max_overall_height=9.5,
            max_storeys=2
        ),
        parking=ParkingRequirements(
            min_spaces_per_dwelling=2,
            min_garage_width=3.0,
            min_garage_depth=5.4,
            min_double_garage_width=5.4,
            visitor_spaces=0
        ),
        min_lot_width=12.0,
        min_lot_area=450.0,
        min_private_open_space=24.0
    ),
    
    'Blacktown City Council': CouncilRequirements(
        council_name='Blacktown City Council',
        setbacks=Setbacks(
            front=6.5,
            rear=3.0,
            side_primary=0.9,
            side_secondary=0.9,
            corner_secondary=3.0,
            garage_setback=5.5
        ),
        site_coverage=SiteCoverage(
            max_site_coverage=55.0,
            max_floor_space_ratio=0.5,
            min_landscaped_area=35.0,
            min_deep_soil=15.0
        ),
        height_limits=HeightLimits(
            max_wall_height=7.0,
            max_overall_height=9.0,
            max_storeys=2
        ),
        parking=ParkingRequirements(
            min_spaces_per_dwelling=2,
            min_garage_width=3.0,
            min_garage_depth=5.5,
            min_double_garage_width=5.5,
            visitor_spaces=0
        ),
        min_lot_width=12.5,
        min_lot_area=450.0,
        min_private_open_space=24.0
    ),
    
    'Liverpool City Council': CouncilRequirements(
        council_name='Liverpool City Council',
        setbacks=Setbacks(
            front=6.0,
            rear=3.0,
            side_primary=0.9,
            side_secondary=0.9,
            corner_secondary=3.0,
            garage_setback=5.5
        ),
        site_coverage=SiteCoverage(
            max_site_coverage=55.0,
            max_floor_space_ratio=0.5,
            min_landscaped_area=30.0,
            min_deep_soil=15.0
        ),
        height_limits=HeightLimits(
            max_wall_height=7.2,
            max_overall_height=9.0,
            max_storeys=2
        ),
        parking=ParkingRequirements(
            min_spaces_per_dwelling=2,
            min_garage_width=3.0,
            min_garage_depth=5.4,
            min_double_garage_width=5.5,
            visitor_spaces=0
        ),
        min_lot_width=12.0,
        min_lot_area=450.0,
        min_private_open_space=24.0
    ),
    
    'Camden Council': CouncilRequirements(
        council_name='Camden Council',
        setbacks=Setbacks(
            front=5.5,
            rear=3.0,
            side_primary=0.9,
            side_secondary=0.9,
            corner_secondary=2.5,
            garage_setback=5.5
        ),
        site_coverage=SiteCoverage(
            max_site_coverage=60.0,
            max_floor_space_ratio=0.55,
            min_landscaped_area=30.0,
            min_deep_soil=15.0
        ),
        height_limits=HeightLimits(
            max_wall_height=7.0,
            max_overall_height=9.0,
            max_storeys=2
        ),
        parking=ParkingRequirements(
            min_spaces_per_dwelling=2,
            min_garage_width=3.0,
            min_garage_depth=5.4,
            min_double_garage_width=5.4,
            visitor_spaces=0
        ),
        min_lot_width=10.0,  # Smaller lots allowed in some areas
        min_lot_area=375.0,
        min_private_open_space=20.0
    ),
    
    'Penrith City Council': CouncilRequirements(
        council_name='Penrith City Council',
        setbacks=Setbacks(
            front=6.0,
            rear=3.0,
            side_primary=0.9,
            side_secondary=0.9,
            corner_secondary=3.0,
            garage_setback=5.5
        ),
        site_coverage=SiteCoverage(
            max_site_coverage=55.0,
            max_floor_space_ratio=0.5,
            min_landscaped_area=30.0,
            min_deep_soil=15.0
        ),
        height_limits=HeightLimits(
            max_wall_height=7.2,
            max_overall_height=9.0,
            max_storeys=2
        ),
        parking=ParkingRequirements(
            min_spaces_per_dwelling=2,
            min_garage_width=3.0,
            min_garage_depth=5.4,
            min_double_garage_width=5.5,
            visitor_spaces=0
        ),
        min_lot_width=12.0,
        min_lot_area=450.0,
        min_private_open_space=24.0
    ),
    
    'Campbelltown City Council': CouncilRequirements(
        council_name='Campbelltown City Council',
        setbacks=Setbacks(
            front=6.0,
            rear=3.0,
            side_primary=0.9,
            side_secondary=0.9,
            corner_secondary=3.0,
            garage_setback=5.5
        ),
        site_coverage=SiteCoverage(
            max_site_coverage=55.0,
            max_floor_space_ratio=0.5,
            min_landscaped_area=30.0,
            min_deep_soil=15.0
        ),
        height_limits=HeightLimits(
            max_wall_height=7.0,
            max_overall_height=9.0,
            max_storeys=2
        ),
        parking=ParkingRequirements(
            min_spaces_per_dwelling=2,
            min_garage_width=3.0,
            min_garage_depth=5.4,
            min_double_garage_width=5.4,
            visitor_spaces=0
        ),
        min_lot_width=12.0,
        min_lot_area=450.0,
        min_private_open_space=24.0
    ),
    
    'Wollongong City Council': CouncilRequirements(
        council_name='Wollongong City Council',
        setbacks=Setbacks(
            front=6.0,
            rear=3.0,
            side_primary=0.9,
            side_secondary=0.9,
            corner_secondary=3.0,
            garage_setback=5.5
        ),
        site_coverage=SiteCoverage(
            max_site_coverage=50.0,
            max_floor_space_ratio=0.5,
            min_landscaped_area=35.0,
            min_deep_soil=20.0
        ),
        height_limits=HeightLimits(
            max_wall_height=7.0,
            max_overall_height=9.0,
            max_storeys=2
        ),
        parking=ParkingRequirements(
            min_spaces_per_dwelling=2,
            min_garage_width=3.0,
            min_garage_depth=5.4,
            min_double_garage_width=5.5,
            visitor_spaces=0
        ),
        min_lot_width=15.0,
        min_lot_area=500.0,
        min_private_open_space=30.0
    ),
}

# Default requirements for unknown councils
DEFAULT_REQUIREMENTS = CouncilRequirements(
    council_name='Default (NSW Standard)',
    setbacks=Setbacks(
        front=6.0,
        rear=3.0,
        side_primary=0.9,
        side_secondary=0.9,
        corner_secondary=3.0,
        garage_setback=5.5
    ),
    site_coverage=SiteCoverage(
        max_site_coverage=55.0,
        max_floor_space_ratio=0.5,
        min_landscaped_area=30.0,
        min_deep_soil=15.0
    ),
    height_limits=HeightLimits(
        max_wall_height=7.2,
        max_overall_height=9.0,
        max_storeys=2
    ),
    parking=ParkingRequirements(
        min_spaces_per_dwelling=2,
        min_garage_width=3.0,
        min_garage_depth=5.4,
        min_double_garage_width=5.4,
        visitor_spaces=0
    ),
    min_lot_width=12.0,
    min_lot_area=450.0,
    min_private_open_space=24.0
)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_council_requirements(council_name: Optional[str]) -> CouncilRequirements:
    """Get requirements for a specific council or default."""
    if council_name and council_name in COUNCIL_REQUIREMENTS:
        return COUNCIL_REQUIREMENTS[council_name]
    
    logger.info(f"Council '{council_name}' not found, using defaults")
    return DEFAULT_REQUIREMENTS


def get_setbacks(council_name: Optional[str] = None, 
                 lot_type: LotType = LotType.STANDARD) -> Dict[str, float]:
    """Get setback values for a council and lot type."""
    requirements = get_council_requirements(council_name)
    setbacks = requirements.setbacks
    
    return {
        'front': setbacks.front,
        'rear': setbacks.rear,
        'side': setbacks.get_side_setback(lot_type),
        'side_primary': setbacks.side_primary,
        'side_secondary': setbacks.side_secondary,
        'corner_secondary': setbacks.corner_secondary,
        'garage_setback': setbacks.garage_setback
    }


def calculate_building_envelope(
    land_width: float,
    land_depth: float,
    council_name: Optional[str] = None,
    lot_type: LotType = LotType.STANDARD
) -> Tuple[float, float, Dict[str, float]]:
    """
    Calculate maximum building envelope from land dimensions.
    
    Returns: (building_width, building_depth, setbacks_dict)
    """
    setbacks = get_setbacks(council_name, lot_type)
    
    side_setback = setbacks['side']
    if lot_type == LotType.CORNER:
        # Corner lot: one side has larger setback
        building_width = land_width - setbacks['side_primary'] - setbacks['corner_secondary']
    else:
        building_width = land_width - (side_setback * 2)
    
    building_depth = land_depth - setbacks['front'] - setbacks['rear']
    
    return building_width, building_depth, setbacks


def determine_lot_type(land_width: float, land_area: float, 
                       is_corner: bool = False) -> LotType:
    """Determine lot type based on dimensions."""
    if is_corner:
        return LotType.CORNER
    if land_width < 12.0:
        return LotType.NARROW
    if land_area < 300.0:
        return LotType.SMALL
    return LotType.STANDARD


# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

def validate_lot_requirements(
    land_width: float,
    land_depth: float,
    land_area: float,
    council_name: Optional[str] = None
) -> Dict[str, Any]:
    """Validate that lot meets minimum council requirements."""
    requirements = get_council_requirements(council_name)
    
    errors = []
    warnings = []
    
    # Check minimum lot width
    if land_width < requirements.min_lot_width:
        errors.append(f"Lot width {land_width}m below minimum {requirements.min_lot_width}m")
    
    # Check minimum lot area
    if land_area < requirements.min_lot_area:
        errors.append(f"Lot area {land_area}m² below minimum {requirements.min_lot_area}m²")
    
    # Calculate buildable area
    building_width, building_depth, _ = calculate_building_envelope(
        land_width, land_depth, council_name
    )
    
    if building_width < 8.0:
        warnings.append(f"Building width {building_width:.1f}m may be too narrow for standard dwelling")
    
    if building_depth < 15.0:
        warnings.append(f"Building depth {building_depth:.1f}m may limit layout options")
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
        'building_envelope': {
            'width': building_width,
            'depth': building_depth,
            'area': building_width * building_depth
        },
        'requirements': requirements.to_dict()
    }


def validate_floor_plan_council(
    floor_plan_json: Dict[str, Any],
    land_width: float,
    land_depth: float,
    land_area: float,
    council_name: Optional[str] = None,
    lot_type: LotType = LotType.STANDARD
) -> Dict[str, Any]:
    """
    Validate a floor plan against council requirements.
    
    Returns validation result with errors, warnings, and compliance status.
    """
    requirements = get_council_requirements(council_name)
    errors = []
    warnings = []
    
    rooms = floor_plan_json.get('rooms', [])
    if not rooms:
        return {
            'valid': False,
            'errors': ['No rooms in floor plan'],
            'warnings': [],
            'council': requirements.council_name
        }
    
    # 1. Calculate building envelope
    building_width, building_depth, setbacks = calculate_building_envelope(
        land_width, land_depth, council_name, lot_type
    )
    
    # 2. Calculate building footprint from rooms
    # Exclude alfresco as it's outside the building
    internal_rooms = [r for r in rooms if 'alfresco' not in r.get('type', '').lower() 
                      and 'alfresco' not in r.get('name', '').lower()]
    
    if internal_rooms:
        max_x = max(r.get('x', 0) + r.get('width', 0) for r in internal_rooms)
        max_y = max(r.get('y', 0) + r.get('depth', 0) for r in internal_rooms)
        building_footprint = max_x * max_y
    else:
        max_x, max_y = 0, 0
        building_footprint = 0
    
    # 3. Validate building fits within envelope
    if max_x > building_width + 0.3:  # 0.3m tolerance
        errors.append(f"Building width {max_x:.1f}m exceeds allowable {building_width:.1f}m")
    
    if max_y > building_depth + 0.3:
        errors.append(f"Building depth {max_y:.1f}m exceeds allowable {building_depth:.1f}m")
    
    # 4. Validate site coverage
    site_coverage_pct = (building_footprint / land_area) * 100
    if site_coverage_pct > requirements.site_coverage.max_site_coverage:
        errors.append(f"Site coverage {site_coverage_pct:.1f}% exceeds maximum "
                     f"{requirements.site_coverage.max_site_coverage}%")
    
    # 5. Validate garage requirements
    garage = next((r for r in rooms if 'garage' in r.get('type', '').lower()), None)
    if garage:
        garage_width = garage.get('width', 0)
        garage_depth = garage.get('depth', 0)
        
        # Estimate garage spaces from width
        if garage_width >= requirements.parking.min_double_garage_width:
            garage_spaces = 2
        else:
            garage_spaces = 1
        
        parking_issues = requirements.parking.validate(
            garage_spaces, garage_width, garage_depth
        )
        errors.extend(parking_issues)
        
        # Check garage setback (y position should allow for front setback)
        garage_y = garage.get('y', 0)
        if garage_y < 0:  # Garage at front
            warnings.append("Verify garage meets front setback requirements")
    else:
        errors.append("No garage found in floor plan")
    
    # 6. Validate private open space (alfresco)
    alfresco = next((r for r in rooms if 'alfresco' in r.get('type', '').lower() 
                     or 'alfresco' in r.get('name', '').lower()), None)
    if alfresco:
        alfresco_area = alfresco.get('width', 0) * alfresco.get('depth', 0)
        if alfresco_area < requirements.min_private_open_space:
            warnings.append(f"Alfresco area {alfresco_area:.1f}m² below recommended "
                          f"{requirements.min_private_open_space}m²")
    else:
        warnings.append(f"No alfresco/outdoor area - minimum {requirements.min_private_open_space}m² recommended")
    
    # 7. Calculate total floor area and FSR
    total_floor_area = sum(r.get('width', 0) * r.get('depth', 0) for r in internal_rooms)
    fsr = total_floor_area / land_area
    
    if fsr > requirements.site_coverage.max_floor_space_ratio:
        errors.append(f"FSR {fsr:.2f} exceeds maximum {requirements.site_coverage.max_floor_space_ratio}")
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
        'council': requirements.council_name,
        'metrics': {
            'building_width': max_x,
            'building_depth': max_y,
            'building_footprint': building_footprint,
            'site_coverage_pct': site_coverage_pct,
            'total_floor_area': total_floor_area,
            'fsr': fsr,
            'envelope_width': building_width,
            'envelope_depth': building_depth
        },
        'setbacks_applied': setbacks
    }


def get_all_councils() -> List[str]:
    """Get list of all configured councils."""
    return list(COUNCIL_REQUIREMENTS.keys())


def get_council_info(council_name: Optional[str] = None) -> Dict[str, Any]:
    """Get detailed info for a council or all councils."""
    if council_name:
        requirements = get_council_requirements(council_name)
        return requirements.to_dict()
    
    return {
        council: req.to_dict() 
        for council, req in COUNCIL_REQUIREMENTS.items()
    }
