# backend/app/services/floor_plan_validator.py
"""
Floor Plan Validator with NCC Compliance
=========================================

Validates generated floor plans against:
- User requirements (bedrooms, bathrooms, etc.)
- Australian National Construction Code (NCC) requirements
- Door placement validation
- Window placement and natural light requirements
- Circulation and hallway validation

NCC References:
- NCC 2022 Volume Two (Residential)
- Part 3.8.1 - Room sizes
- Part 3.8.2 - Facilities (bathrooms, kitchens)
- Part 3.8.3 - Light and ventilation
- Part 3.9 - Safe movement and access
"""

import logging
import math
from typing import Dict, Any, List, Tuple, Optional, Set
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class ValidationSeverity(Enum):
    """Severity levels for validation issues."""
    CRITICAL = "critical"  # Must fix - NCC non-compliant
    ERROR = "error"        # Should fix - Major issue
    WARNING = "warning"    # Could fix - Minor issue
    INFO = "info"          # Informational


@dataclass
class ValidationIssue:
    """Single validation issue."""
    code: str
    message: str
    severity: ValidationSeverity
    room_id: Optional[str] = None
    ncc_reference: Optional[str] = None


@dataclass
class ValidationResult:
    """Result of floor plan validation."""
    passed: bool
    score: float  # 0-100, higher is better
    hard_failures: List[str] = field(default_factory=list)
    soft_failures: List[str] = field(default_factory=list)
    ncc_issues: List[ValidationIssue] = field(default_factory=list)
    feedback: Optional[str] = None
    
    def __post_init__(self):
        if self.feedback is None and (self.hard_failures or self.soft_failures or self.ncc_issues):
            self.feedback = self._generate_feedback()
    
    def _generate_feedback(self) -> str:
        """Generate human-readable feedback for AI correction."""
        parts = []
        
        # Critical NCC issues first
        critical_ncc = [i for i in self.ncc_issues if i.severity == ValidationSeverity.CRITICAL]
        if critical_ncc:
            parts.append("NCC COMPLIANCE ISSUES (must fix for Australian building code):")
            for issue in critical_ncc[:5]:
                ref = f" [{issue.ncc_reference}]" if issue.ncc_reference else ""
                parts.append(f"  - {issue.message}{ref}")
        
        if self.hard_failures:
            parts.append("\nCRITICAL LAYOUT ISSUES (must fix):")
            for failure in self.hard_failures[:5]:
                parts.append(f"  - {failure}")
        
        # Error level NCC issues
        error_ncc = [i for i in self.ncc_issues if i.severity == ValidationSeverity.ERROR]
        if error_ncc:
            parts.append("\nDESIGN ERRORS:")
            for issue in error_ncc[:5]:
                parts.append(f"  - {issue.message}")
        
        if self.soft_failures:
            parts.append("\nRECOMMENDED IMPROVEMENTS:")
            for failure in self.soft_failures[:5]:
                parts.append(f"  - {failure}")
        
        return "\n".join(parts)


class NCCComplianceChecker:
    """
    Australian National Construction Code (NCC) compliance checker.
    Based on NCC 2022 Volume Two - Residential Buildings.
    """
    
    def __init__(self):
        # NCC Part 3.8.1 - Minimum room sizes (m²)
        self.ncc_min_areas = {
            "master_bedroom": 9.0,    # Main bedroom
            "bedroom": 6.5,           # Other bedrooms (min for single bed)
            "living": 10.0,           # Living room
            "family": 10.0,           # Family room
            "lounge": 10.0,           # Lounge
            "kitchen": 5.0,           # Kitchen work area
            "bathroom": 2.5,          # Bathroom
            "ensuite": 2.5,           # Ensuite
            "laundry": 2.0,           # Laundry
            "toilet": 1.1,            # Separate toilet
            "powder": 1.1,            # Powder room
        }
        
        # NCC Part 3.8.1 - Minimum room dimensions (meters)
        self.ncc_min_dimensions = {
            "bedroom": 2.4,           # Min dimension for bedroom
            "master_bedroom": 3.0,    # Min dimension for main bedroom
            "bathroom": 1.5,          # Min dimension
            "ensuite": 1.5,           # Min dimension
            "kitchen": 1.8,           # Min clear width
            "hallway": 1.0,           # Min corridor width (NCC 3.9.1)
            "entry": 1.2,             # Entry area
        }
        
        # NCC Part 3.8.3 - Natural light requirements
        # Windows must be at least 10% of floor area
        self.natural_light_ratio = 0.10  # 10% of floor area
        
        # NCC Part 3.8.3 - Ventilation requirements
        # Openable windows must be at least 5% of floor area
        self.ventilation_ratio = 0.05  # 5% of floor area
        
        # NCC Part 3.9.1 - Door widths (mm)
        self.min_door_widths = {
            "entry": 870,             # Front door
            "internal": 720,          # Internal doors
            "bathroom": 720,          # Bathroom doors
            "garage": 820,            # Garage entry
            "bedroom": 720,           # Bedroom doors
            "accessible": 850,        # Accessible doorways
        }
        
        # NCC Part 3.9.2 - Minimum ceiling height (mm)
        self.min_ceiling_height = 2400  # 2.4m minimum
        
        # Rooms that require external walls for windows
        self.requires_external_wall = {
            "bedroom", "master_bedroom", "living", "family", 
            "lounge", "dining", "kitchen", "study"
        }
        
        # Rooms that can be internal (no windows required)
        self.can_be_internal = {
            "bathroom", "ensuite", "powder", "toilet", "laundry",
            "pantry", "wir", "linen", "hallway", "garage", "theatre"
        }
    
    def check_compliance(self, floor_plan: Dict[str, Any], building_width: float, building_depth: float) -> List[ValidationIssue]:
        """Run all NCC compliance checks."""
        issues = []
        
        rooms = floor_plan.get("rooms", [])
        
        # Run all checks
        issues.extend(self._check_room_sizes(rooms))
        issues.extend(self._check_room_dimensions(rooms))
        issues.extend(self._check_natural_light(rooms, building_width, building_depth))
        issues.extend(self._check_door_placement(rooms))
        issues.extend(self._check_window_placement(rooms, building_width, building_depth))
        issues.extend(self._check_circulation(rooms, building_width, building_depth))
        issues.extend(self._check_bathroom_requirements(rooms))
        issues.extend(self._check_kitchen_requirements(rooms))
        
        return issues
    
    def _check_room_sizes(self, rooms: List[Dict]) -> List[ValidationIssue]:
        """Check NCC minimum room sizes."""
        issues = []
        
        for room in rooms:
            room_type = room.get("type", "unknown")
            room_name = room.get("name", room_type)
            room_id = room.get("id", "unknown")
            
            width = room.get("width", 0)
            depth = room.get("depth", 0)
            area = room.get("area", width * depth)
            
            min_area = self.ncc_min_areas.get(room_type)
            
            if min_area and area < min_area:
                issues.append(ValidationIssue(
                    code="NCC_ROOM_SIZE",
                    message=f"{room_name} is {area:.1f}m², must be at least {min_area}m² per NCC",
                    severity=ValidationSeverity.CRITICAL,
                    room_id=room_id,
                    ncc_reference="NCC 3.8.1.2"
                ))
        
        return issues
    
    def _check_room_dimensions(self, rooms: List[Dict]) -> List[ValidationIssue]:
        """Check NCC minimum room dimensions."""
        issues = []
        
        for room in rooms:
            room_type = room.get("type", "unknown")
            room_name = room.get("name", room_type)
            room_id = room.get("id", "unknown")
            
            width = room.get("width", 0)
            depth = room.get("depth", 0)
            min_dim = min(width, depth)
            
            min_required = self.ncc_min_dimensions.get(room_type)
            
            if min_required and min_dim < min_required:
                issues.append(ValidationIssue(
                    code="NCC_ROOM_DIMENSION",
                    message=f"{room_name} minimum dimension is {min_dim:.1f}m, must be at least {min_required}m",
                    severity=ValidationSeverity.CRITICAL,
                    room_id=room_id,
                    ncc_reference="NCC 3.8.1.3"
                ))
        
        return issues
    
    def _check_natural_light(self, rooms: List[Dict], building_width: float, building_depth: float) -> List[ValidationIssue]:
        """
        Check natural light requirements.
        NCC 3.8.3: Habitable rooms need windows = 10% of floor area.
        Also validates that rooms requiring windows are on external walls.
        """
        issues = []
        
        for room in rooms:
            room_type = room.get("type", "unknown")
            room_name = room.get("name", room_type)
            room_id = room.get("id", "unknown")
            
            # Check if room requires external wall
            if room_type in self.requires_external_wall:
                x = room.get("x", 0)
                y = room.get("y", 0)
                width = room.get("width", 0)
                depth = room.get("depth", 0)
                area = room.get("area", width * depth)
                
                # Check if room touches an external wall
                touches_left = x <= 0.3
                touches_right = (x + width) >= (building_width - 0.3)
                touches_front = y <= 0.3
                touches_rear = (y + depth) >= (building_depth - 0.3)
                
                has_external_wall = touches_left or touches_right or touches_front or touches_rear
                
                if not has_external_wall:
                    issues.append(ValidationIssue(
                        code="NCC_NO_EXTERNAL_WALL",
                        message=f"{room_name} has no external wall for windows/natural light",
                        severity=ValidationSeverity.CRITICAL,
                        room_id=room_id,
                        ncc_reference="NCC 3.8.3.2"
                    ))
                else:
                    # Calculate required window size
                    required_window_area = area * self.natural_light_ratio
                    
                    # Check if windows are defined
                    windows = room.get("windows", [])
                    if isinstance(windows, list) and len(windows) > 0:
                        total_window_area = sum(
                            w.get("width", 1.2) * w.get("height", 1.5) 
                            for w in windows if isinstance(w, dict)
                        )
                        
                        if total_window_area < required_window_area:
                            issues.append(ValidationIssue(
                                code="NCC_INSUFFICIENT_LIGHT",
                                message=f"{room_name} needs {required_window_area:.1f}m² of windows (10% of floor area)",
                                severity=ValidationSeverity.WARNING,
                                room_id=room_id,
                                ncc_reference="NCC 3.8.3.2"
                            ))
                    else:
                        # Windows not specified - calculate external wall availability
                        external_wall_length = self._calculate_external_wall_length(
                            room, building_width, building_depth
                        )
                        
                        if external_wall_length < 1.5:
                            issues.append(ValidationIssue(
                                code="NCC_LIMITED_WINDOW_WALL",
                                message=f"{room_name} has limited external wall ({external_wall_length:.1f}m) for windows",
                                severity=ValidationSeverity.WARNING,
                                room_id=room_id,
                                ncc_reference="NCC 3.8.3.2"
                            ))
        
        return issues
    
    def _calculate_external_wall_length(self, room: Dict, building_width: float, building_depth: float) -> float:
        """Calculate total external wall length for a room."""
        x = room.get("x", 0)
        y = room.get("y", 0)
        width = room.get("width", 0)
        depth = room.get("depth", 0)
        
        external_length = 0.0
        
        if x <= 0.3:
            external_length += depth
        if (x + width) >= (building_width - 0.3):
            external_length += depth
        if y <= 0.3:
            external_length += width
        if (y + depth) >= (building_depth - 0.3):
            external_length += width
        
        return external_length
    
    def _check_window_placement(self, rooms: List[Dict], building_width: float, building_depth: float) -> List[ValidationIssue]:
        """
        Validate window placement.
        - Windows must be on external walls only
        - Windows should provide adequate natural light
        - Window sizes should be proportional to room size
        """
        issues = []
        
        for room in rooms:
            room_type = room.get("type", "unknown")
            room_name = room.get("name", room_type)
            room_id = room.get("id", "unknown")
            
            x = room.get("x", 0)
            y = room.get("y", 0)
            width = room.get("width", 0)
            depth = room.get("depth", 0)
            
            windows = room.get("windows", [])
            
            if not isinstance(windows, list):
                continue
            
            for i, window in enumerate(windows):
                if not isinstance(window, dict):
                    continue
                
                window_wall = window.get("wall", "").lower()
                window_position = window.get("position", 0)
                window_width = window.get("width", 1.2)
                
                # Determine which walls are external
                external_walls = []
                if x <= 0.3:
                    external_walls.append("left")
                if (x + width) >= (building_width - 0.3):
                    external_walls.append("right")
                if y <= 0.3:
                    external_walls.append("front")
                if (y + depth) >= (building_depth - 0.3):
                    external_walls.append("rear")
                
                # Check if window is on external wall
                if window_wall and window_wall not in external_walls:
                    issues.append(ValidationIssue(
                        code="WINDOW_INTERNAL_WALL",
                        message=f"{room_name} has window on internal {window_wall} wall (must be on external wall)",
                        severity=ValidationSeverity.ERROR,
                        room_id=room_id,
                        ncc_reference="NCC 3.8.3"
                    ))
                
                # Check window fits within wall
                wall_length = width if window_wall in ["front", "rear"] else depth
                if window_position + window_width > wall_length:
                    issues.append(ValidationIssue(
                        code="WINDOW_OUTSIDE_WALL",
                        message=f"{room_name} window extends beyond wall boundary",
                        severity=ValidationSeverity.ERROR,
                        room_id=room_id
                    ))
        
        return issues
    
    def _check_door_placement(self, rooms: List[Dict]) -> List[ValidationIssue]:
        """
        Validate door placement.
        - Doors should not open into walls
        - Doors should connect rooms logically
        - Minimum door widths per NCC
        """
        issues = []
        
        for room in rooms:
            room_type = room.get("type", "unknown")
            room_name = room.get("name", room_type)
            room_id = room.get("id", "unknown")
            
            width = room.get("width", 0)
            depth = room.get("depth", 0)
            
            doors = room.get("doors", [])
            
            # Check if habitable room has a door defined
            habitable_rooms = {"bedroom", "master_bedroom", "bathroom", "ensuite", 
                              "kitchen", "family", "lounge", "study", "theatre"}
            if room_type in habitable_rooms and not doors:
                issues.append(ValidationIssue(
                    code="DOOR_MISSING",
                    message=f"{room_name} has no door access defined",
                    severity=ValidationSeverity.INFO,
                    room_id=room_id
                ))
            
            # Validate each door
            for i, door in enumerate(doors):
                if not isinstance(door, dict):
                    continue
                
                door_width = door.get("width", 820)
                door_wall = door.get("wall", "")
                door_position = door.get("position", 0)
                
                # Check minimum door width
                if room_type == "entry" or "entry" in room_name.lower():
                    min_width = self.min_door_widths["entry"]
                elif room_type in ["bathroom", "ensuite", "powder"]:
                    min_width = self.min_door_widths["bathroom"]
                else:
                    min_width = self.min_door_widths["internal"]
                
                if door_width < min_width:
                    issues.append(ValidationIssue(
                        code="NCC_DOOR_WIDTH",
                        message=f"{room_name} door is {door_width}mm, must be at least {min_width}mm",
                        severity=ValidationSeverity.ERROR,
                        room_id=room_id,
                        ncc_reference="NCC 3.9.1.2"
                    ))
                
                # Check door position is within wall
                wall_length = width if door_wall in ["front", "rear", "north", "south"] else depth
                if wall_length > 0 and door_position + (door_width / 1000) > wall_length:
                    issues.append(ValidationIssue(
                        code="DOOR_OUTSIDE_WALL",
                        message=f"{room_name} door extends beyond wall boundary",
                        severity=ValidationSeverity.ERROR,
                        room_id=room_id
                    ))
                
                # Check door doesn't open into adjacent room's door
                swing = door.get("swing", "in")
                if swing == "in" and min(width, depth) < 1.5:
                    issues.append(ValidationIssue(
                        code="DOOR_SWING_SPACE",
                        message=f"{room_name} may not have enough space for door swing",
                        severity=ValidationSeverity.WARNING,
                        room_id=room_id
                    ))
        
        return issues
    
    def _check_circulation(self, rooms: List[Dict], building_width: float, building_depth: float) -> List[ValidationIssue]:
        """
        Validate circulation and hallway requirements.
        - Hallways must be at least 1m wide (NCC 3.9.1)
        - All rooms must be accessible (connected to entry)
        - Logical traffic flow
        """
        issues = []
        
        # Find hallways and check width
        hallways = [r for r in rooms if r.get("type") == "hallway"]
        
        if not hallways:
            has_entry = any(r.get("type") == "entry" for r in rooms)
            total_rooms = len([r for r in rooms if r.get("type") not in ["porch", "alfresco", "garage"]])
            
            if not has_entry and total_rooms > 5:
                issues.append(ValidationIssue(
                    code="CIRCULATION_MISSING",
                    message="No hallway or entry area for circulation between rooms",
                    severity=ValidationSeverity.WARNING,
                    ncc_reference="NCC 3.9.1"
                ))
        else:
            for hallway in hallways:
                width = hallway.get("width", 0)
                depth = hallway.get("depth", 0)
                min_dim = min(width, depth)
                hallway_name = hallway.get("name", "Hallway")
                
                if min_dim < 1.0:
                    issues.append(ValidationIssue(
                        code="NCC_HALLWAY_WIDTH",
                        message=f"{hallway_name} is {min_dim:.1f}m wide, must be at least 1.0m",
                        severity=ValidationSeverity.CRITICAL,
                        room_id=hallway.get("id"),
                        ncc_reference="NCC 3.9.1.2"
                    ))
                elif min_dim < 1.2:
                    issues.append(ValidationIssue(
                        code="HALLWAY_NARROW",
                        message=f"{hallway_name} is {min_dim:.1f}m wide, recommend at least 1.2m",
                        severity=ValidationSeverity.WARNING,
                        room_id=hallway.get("id")
                    ))
        
        # Check bedroom cluster accessibility
        bedrooms = [r for r in rooms if r.get("type") in ["bedroom", "master_bedroom"]]
        entry_points = [r for r in rooms if r.get("type") in ["entry", "hallway", "porch"]]
        
        if len(bedrooms) > 1 and entry_points:
            # Check that bedrooms are accessible from entry/hallway
            isolated_bedrooms = []
            
            for bedroom in bedrooms:
                is_accessible = False
                
                # Check if adjacent to hallway or entry
                for entry in entry_points:
                    if self._rooms_adjacent(bedroom, entry):
                        is_accessible = True
                        break
                
                # Check if adjacent to another bedroom that's accessible
                if not is_accessible:
                    for other in bedrooms:
                        if other != bedroom and self._rooms_adjacent(bedroom, other):
                            is_accessible = True
                            break
                
                if not is_accessible:
                    isolated_bedrooms.append(bedroom)
            
            for bedroom in isolated_bedrooms[:2]:
                issues.append(ValidationIssue(
                    code="CIRCULATION_DISCONNECTED",
                    message=f"{bedroom.get('name', 'Bedroom')} may not be accessible from main circulation",
                    severity=ValidationSeverity.WARNING,
                    room_id=bedroom.get("id")
                ))
        
        return issues
    
    def _rooms_adjacent(self, r1: Dict, r2: Dict, tolerance: float = 0.3) -> bool:
        """Check if two rooms share a wall."""
        x1, y1 = r1.get("x", 0), r1.get("y", 0)
        w1, d1 = r1.get("width", 0), r1.get("depth", 0)
        
        x2, y2 = r2.get("x", 0), r2.get("y", 0)
        w2, d2 = r2.get("width", 0), r2.get("depth", 0)
        
        if abs(x1 + w1 - x2) < tolerance or abs(x2 + w2 - x1) < tolerance:
            y_overlap = min(y1 + d1, y2 + d2) - max(y1, y2)
            if y_overlap > 0.5:
                return True
        
        if abs(y1 + d1 - y2) < tolerance or abs(y2 + d2 - y1) < tolerance:
            x_overlap = min(x1 + w1, x2 + w2) - max(x1, x2)
            if x_overlap > 0.5:
                return True
        
        return False
    
    def _check_bathroom_requirements(self, rooms: List[Dict]) -> List[ValidationIssue]:
        """Check bathroom-specific NCC requirements."""
        issues = []
        
        bathrooms = [r for r in rooms if r.get("type") in ["bathroom", "ensuite", "powder"]]
        
        for bathroom in bathrooms:
            room_name = bathroom.get("name", "Bathroom")
            room_id = bathroom.get("id")
            width = bathroom.get("width", 0)
            depth = bathroom.get("depth", 0)
            
            min_dim = min(width, depth)
            if min_dim < 1.5:
                issues.append(ValidationIssue(
                    code="NCC_BATHROOM_SPACE",
                    message=f"{room_name} needs at least 1.5m clear dimension for fixtures",
                    severity=ValidationSeverity.ERROR,
                    room_id=room_id,
                    ncc_reference="NCC 3.8.2"
                ))
            
            # Check ensuite adjacency
            if bathroom.get("type") == "ensuite":
                master = next((r for r in rooms if r.get("type") == "master_bedroom"), None)
                if master and not self._rooms_adjacent(bathroom, master):
                    issues.append(ValidationIssue(
                        code="ENSUITE_NOT_ADJACENT",
                        message="Ensuite must be directly adjacent to master bedroom",
                        severity=ValidationSeverity.ERROR,
                        room_id=room_id
                    ))
        
        return issues
    
    def _check_kitchen_requirements(self, rooms: List[Dict]) -> List[ValidationIssue]:
        """Check kitchen-specific NCC requirements."""
        issues = []
        
        kitchens = [r for r in rooms if r.get("type") == "kitchen"]
        
        for kitchen in kitchens:
            room_name = kitchen.get("name", "Kitchen")
            room_id = kitchen.get("id")
            width = kitchen.get("width", 0)
            depth = kitchen.get("depth", 0)
            
            min_dim = min(width, depth)
            if min_dim < 1.8:
                issues.append(ValidationIssue(
                    code="NCC_KITCHEN_SPACE",
                    message=f"{room_name} needs at least 1.8m clear width for work areas",
                    severity=ValidationSeverity.ERROR,
                    room_id=room_id,
                    ncc_reference="NCC 3.8.2"
                ))
            
            # Check pantry adjacency
            pantry = next((r for r in rooms if r.get("type") == "pantry"), None)
            if pantry and not self._rooms_adjacent(kitchen, pantry):
                issues.append(ValidationIssue(
                    code="PANTRY_NOT_ADJACENT",
                    message="Pantry should be directly adjacent to kitchen",
                    severity=ValidationSeverity.WARNING,
                    room_id=room_id
                ))
        
        return issues


class FloorPlanValidator:
    """
    Complete floor plan validator with NCC compliance.
    """
    
    def __init__(self):
        self.ncc_checker = NCCComplianceChecker()
        
        self.required_adjacencies = {
            "ensuite": ["master_bedroom"],
            "wir": ["master_bedroom", "ensuite"],
            "pantry": ["kitchen"],
        }
        
        self.preferred_adjacencies = {
            "kitchen": ["family", "dining", "meals"],
            "family": ["kitchen", "alfresco", "dining"],
            "alfresco": ["family", "dining"],
            "dining": ["kitchen", "family"],
        }
    
    def validate(self, floor_plan: Dict[str, Any], requirements: Dict[str, Any]) -> ValidationResult:
        """Validate floor plan against requirements and NCC compliance."""
        hard_failures = []
        soft_failures = []
        ncc_issues = []
        score = 100.0
        
        rooms = floor_plan.get("rooms", [])
        
        land_width = requirements.get("land_width", 14)
        land_depth = requirements.get("land_depth", 25)
        building_width = land_width - 1.8
        building_depth = land_depth - 7.5
        
        # Run NCC compliance
        ncc_issues = self.ncc_checker.check_compliance(floor_plan, building_width, building_depth)
        
        for issue in ncc_issues:
            if issue.severity == ValidationSeverity.CRITICAL:
                score -= 15
            elif issue.severity == ValidationSeverity.ERROR:
                score -= 8
            elif issue.severity == ValidationSeverity.WARNING:
                score -= 3
        
        # Check bedroom count
        required_bedrooms = requirements.get("bedrooms", 4)
        actual_bedrooms = sum(1 for r in rooms if r.get("type") in ["bedroom", "master_bedroom"])
        
        if actual_bedrooms < required_bedrooms:
            hard_failures.append(f"Missing bedrooms: need {required_bedrooms}, found {actual_bedrooms}")
            score -= 20
        
        # Check bathroom count
        required_bathrooms = requirements.get("bathrooms", 2)
        actual_bathrooms = sum(1 for r in rooms if r.get("type") in ["bathroom", "ensuite", "powder"])
        
        if actual_bathrooms < required_bathrooms:
            hard_failures.append(f"Missing bathrooms: need {required_bathrooms}, found {actual_bathrooms}")
            score -= 15
        
        # Check garage
        required_garage = requirements.get("garage_spaces", 2)
        garage = next((r for r in rooms if r.get("type") == "garage"), None)
        
        if required_garage > 0 and not garage:
            hard_failures.append(f"Missing garage")
            score -= 15
        elif garage and garage.get("y", 0) > building_depth * 0.4:
            soft_failures.append("Garage should be at the front")
            score -= 5
        
        # Check envelope
        for room in rooms:
            x, y = room.get("x", 0), room.get("y", 0)
            w, d = room.get("width", 0), room.get("depth", 0)
            name = room.get("name", room.get("type"))
            
            if x < -0.1 or y < -0.1:
                hard_failures.append(f"{name} outside building boundary")
                score -= 10
            if x + w > building_width + 0.5 or y + d > building_depth + 0.5:
                hard_failures.append(f"{name} extends beyond building envelope")
                score -= 10
        
        # Check overlaps
        for i, r1 in enumerate(rooms):
            for r2 in rooms[i+1:]:
                if self._rooms_overlap(r1, r2):
                    hard_failures.append(f"{r1.get('name')} overlaps with {r2.get('name')}")
                    score -= 10
        
        # Check master suite
        if not any(r.get("type") == "master_bedroom" for r in rooms):
            hard_failures.append("Missing Master Bedroom")
            score -= 15
        if not any(r.get("type") == "ensuite" for r in rooms):
            hard_failures.append("Missing Ensuite")
            score -= 10
        if not any(r.get("type") == "wir" for r in rooms):
            soft_failures.append("Missing Walk-in Robe")
            score -= 5
        
        # Check kitchen and living
        if not any(r.get("type") == "kitchen" for r in rooms):
            hard_failures.append("Missing Kitchen")
            score -= 15
        if not any(r.get("type") in ["family", "lounge"] for r in rooms):
            hard_failures.append("Missing Living area")
            score -= 10
        
        # Optional rooms
        if requirements.get("has_theatre") and not any(r.get("type") == "theatre" for r in rooms):
            soft_failures.append("Missing Theatre room")
            score -= 5
        if requirements.get("has_study") and not any(r.get("type") == "study" for r in rooms):
            soft_failures.append("Missing Study")
            score -= 5
        if requirements.get("outdoor_entertainment") and not any(r.get("type") == "alfresco" for r in rooms):
            soft_failures.append("Missing Alfresco")
            score -= 5
        
        # Check adjacencies
        room_dict = {r.get("type"): r for r in rooms}
        for room_type, required in self.required_adjacencies.items():
            if room_type in room_dict:
                room = room_dict[room_type]
                if not any(adj in room_dict and self._rooms_adjacent(room, room_dict[adj]) for adj in required):
                    soft_failures.append(f"{room.get('name')} must be adjacent to {' or '.join(required)}")
                    score -= 8
        
        score = max(0, min(100, score))
        
        critical_ncc = [i for i in ncc_issues if i.severity == ValidationSeverity.CRITICAL]
        passed = len(hard_failures) == 0 and len(critical_ncc) == 0 and score >= 50
        
        return ValidationResult(
            passed=passed,
            score=score,
            hard_failures=hard_failures,
            soft_failures=soft_failures,
            ncc_issues=ncc_issues
        )
    
    def _rooms_overlap(self, r1: Dict, r2: Dict, tolerance: float = 0.1) -> bool:
        x1, y1, w1, d1 = r1.get("x", 0), r1.get("y", 0), r1.get("width", 0), r1.get("depth", 0)
        x2, y2, w2, d2 = r2.get("x", 0), r2.get("y", 0), r2.get("width", 0), r2.get("depth", 0)
        
        return not (x1 + w1 <= x2 + tolerance or x2 + w2 <= x1 + tolerance or
                   y1 + d1 <= y2 + tolerance or y2 + d2 <= y1 + tolerance)
    
    def _rooms_adjacent(self, r1: Dict, r2: Dict, tolerance: float = 0.3) -> bool:
        x1, y1, w1, d1 = r1.get("x", 0), r1.get("y", 0), r1.get("width", 0), r1.get("depth", 0)
        x2, y2, w2, d2 = r2.get("x", 0), r2.get("y", 0), r2.get("width", 0), r2.get("depth", 0)
        
        if abs(x1 + w1 - x2) < tolerance or abs(x2 + w2 - x1) < tolerance:
            if min(y1 + d1, y2 + d2) - max(y1, y2) > 0.5:
                return True
        if abs(y1 + d1 - y2) < tolerance or abs(y2 + d2 - y1) < tolerance:
            if min(x1 + w1, x2 + w2) - max(x1, x2) > 0.5:
                return True
        return False


def create_validator() -> FloorPlanValidator:
    return FloorPlanValidator()
