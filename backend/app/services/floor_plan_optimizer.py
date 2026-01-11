"""
Floor Plan Optimizer V2 - Constraint-Based Layout Generation
============================================================

This version uses a smarter initial placement strategy based on 
professional Australian floor plan patterns:

PATTERN: Bedroom wing on LEFT, Living zone on RIGHT
- Front-left: Theatre/Bed4, Entry
- Left side: Bedroom wing (Bed2, Bed3, Bath) running front-to-rear
- Rear-left: Master Suite (Master + Ensuite + WIR)
- Front-right: Garage
- Middle-right: Kitchen + Pantry
- Rear-right: Family/Meals opening to Alfresco

This creates the characteristic L-shaped or rectangular Australian home layout.
"""

import random
import math
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass, field
from enum import Enum
import copy
import json


class RoomType(Enum):
    GARAGE = "garage"
    PORCH = "porch"
    ENTRY = "entry"
    HALLWAY = "hallway"
    FAMILY = "family"
    KITCHEN = "kitchen"
    PANTRY = "pantry"
    DINING = "dining"
    LOUNGE = "lounge"
    STUDY = "study"
    LAUNDRY = "laundry"
    MASTER_BEDROOM = "master_bedroom"
    ENSUITE = "ensuite"
    WIR = "wir"
    BEDROOM = "bedroom"
    BATHROOM = "bathroom"
    POWDER = "powder"
    ALFRESCO = "alfresco"
    THEATRE = "theatre"
    ACTIVITIES = "activities"
    LINEN = "linen"


@dataclass
class PlacedRoom:
    """A room that has been placed in the layout"""
    id: str
    room_type: str
    name: str
    x: float
    y: float
    width: float
    depth: float
    
    @property
    def area(self) -> float:
        return round(self.width * self.depth, 1)
    
    @property
    def x2(self) -> float:
        return self.x + self.width
    
    @property
    def y2(self) -> float:
        return self.y + self.depth
    
    @property
    def center(self) -> Tuple[float, float]:
        return (self.x + self.width / 2, self.y + self.depth / 2)
    
    def overlaps(self, other: 'PlacedRoom', tolerance: float = 0.05) -> bool:
        """Check if this room overlaps with another"""
        return not (self.x2 <= other.x + tolerance or 
                   other.x2 <= self.x + tolerance or 
                   self.y2 <= other.y + tolerance or 
                   other.y2 <= self.y + tolerance)
    
    def shares_wall(self, other: 'PlacedRoom', tolerance: float = 0.15) -> bool:
        """Check if this room shares a wall with another (proper adjacency)"""
        # Vertical wall shared (rooms side by side)
        if abs(self.x2 - other.x) < tolerance or abs(other.x2 - self.x) < tolerance:
            # Check vertical overlap (they must overlap in Y)
            y_overlap = min(self.y2, other.y2) - max(self.y, other.y)
            if y_overlap > 0.5:  # At least 0.5m of shared wall
                return True
        
        # Horizontal wall shared (rooms above/below)
        if abs(self.y2 - other.y) < tolerance or abs(other.y2 - self.y) < tolerance:
            # Check horizontal overlap (they must overlap in X)
            x_overlap = min(self.x2, other.x2) - max(self.x, other.x)
            if x_overlap > 0.5:  # At least 0.5m of shared wall
                return True
        
        return False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.room_type,
            "name": self.name,
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "width": round(self.width, 2),
            "depth": round(self.depth, 2),
            "area": self.area,
            "floor": 0,
            "doors": [],
            "windows": [],
            "features": []
        }


class FloorPlanGenerator:
    """
    Generates floor plans using a template-based approach with optimization.
    
    The strategy:
    1. Use a proven layout template (bedroom wing left, living right)
    2. Scale rooms to fit the building envelope
    3. Fine-tune with optimization to maximize adjacency scores
    """
    
    def __init__(self, building_width: float, building_depth: float):
        self.W = building_width  # Total width
        self.D = building_depth  # Total depth
        self.rooms: List[PlacedRoom] = []
        
    def generate(self,
                 bedrooms: int = 4,
                 bathrooms: int = 2,
                 garage_spaces: int = 2,
                 has_theatre: bool = False,
                 has_study: bool = False,
                 has_alfresco: bool = True,
                 open_plan: bool = True) -> Dict[str, Any]:
        """
        Generate a complete floor plan.
        """
        self.rooms = []
        
        # Calculate key dimensions
        # Left zone (bedroom wing): ~40% of width
        # Right zone (living/garage): ~60% of width
        left_zone_width = self.W * 0.38
        right_zone_width = self.W - left_zone_width
        
        # Garage dimensions
        garage_width = min(6.5, right_zone_width - 0.5)
        garage_depth = 6.0
        
        # === FRONT ZONE (y = 0 to ~6m) ===
        
        # Garage - front right
        self.rooms.append(PlacedRoom(
            id="garage_01",
            room_type="garage",
            name=f"{garage_spaces}-Car Garage",
            x=self.W - garage_width,
            y=0,
            width=garage_width,
            depth=garage_depth
        ))
        
        # Porch - front left
        porch_width = min(3.5, left_zone_width * 0.6)
        porch_depth = 1.8
        self.rooms.append(PlacedRoom(
            id="porch_01",
            room_type="porch",
            name="Porch",
            x=0,
            y=0,
            width=porch_width,
            depth=porch_depth
        ))
        
        # Entry - behind porch
        entry_width = porch_width
        entry_depth = 3.0
        self.rooms.append(PlacedRoom(
            id="entry_01",
            room_type="entry",
            name="Entry",
            x=0,
            y=porch_depth,
            width=entry_width,
            depth=entry_depth
        ))
        
        # Theatre or Bed4 - front left (next to entry)
        front_room_x = entry_width
        front_room_width = left_zone_width - entry_width + 1.5
        front_room_depth = 4.0
        
        if has_theatre:
            self.rooms.append(PlacedRoom(
                id="theatre_01",
                room_type="theatre",
                name="Theatre",
                x=front_room_x,
                y=0,
                width=front_room_width,
                depth=front_room_depth
            ))
            bed4_in_front = False
        else:
            self.rooms.append(PlacedRoom(
                id="bed4_01",
                room_type="bedroom",
                name="Bed 4",
                x=front_room_x,
                y=0,
                width=front_room_width,
                depth=front_room_depth
            ))
            bed4_in_front = True
        
        # Laundry - between entry zone and garage
        laundry_x = left_zone_width + 0.5
        laundry_width = 2.5
        laundry_depth = 2.5
        self.rooms.append(PlacedRoom(
            id="laundry_01",
            room_type="laundry",
            name="Laundry",
            x=laundry_x,
            y=garage_depth - laundry_depth,
            width=laundry_width,
            depth=laundry_depth
        ))
        
        # === BEDROOM WING - LEFT SIDE (y = 4 to rear-6m) ===
        bedroom_wing_y = front_room_depth + 0.5
        bedroom_wing_width = left_zone_width
        
        # Calculate how many bedrooms go in the wing
        wing_bedrooms = bedrooms - 1  # Master is separate
        if bed4_in_front:
            wing_bedrooms -= 1
        
        # Bed 2
        bed_width = 3.5
        bed_depth = 3.8
        self.rooms.append(PlacedRoom(
            id="bed2_01",
            room_type="bedroom",
            name="Bed 2",
            x=0,
            y=bedroom_wing_y,
            width=bed_width,
            depth=bed_depth
        ))
        
        # Bed 3
        bed3_y = bedroom_wing_y + bed_depth + 0.3
        self.rooms.append(PlacedRoom(
            id="bed3_01",
            room_type="bedroom",
            name="Bed 3",
            x=0,
            y=bed3_y,
            width=bed_width,
            depth=bed_depth
        ))
        
        # Bathroom - adjacent to bedrooms
        bath_width = 2.8
        bath_depth = 3.2
        self.rooms.append(PlacedRoom(
            id="bath_01",
            room_type="bathroom",
            name="Bathroom",
            x=bed_width,
            y=bedroom_wing_y,
            width=bath_width,
            depth=bath_depth
        ))
        
        # Bed 4 (if not in front)
        if not bed4_in_front and bedrooms >= 4:
            self.rooms.append(PlacedRoom(
                id="bed4_01",
                room_type="bedroom",
                name="Bed 4",
                x=bed_width,
                y=bedroom_wing_y + bath_depth + 0.3,
                width=bath_width + 0.5,
                depth=bed_depth
            ))
        
        # === MASTER SUITE - REAR LEFT ===
        master_suite_y = self.D - 10.0  # Leave room for master suite block
        
        # Master bedroom
        master_width = 4.5
        master_depth = 4.5
        self.rooms.append(PlacedRoom(
            id="master_01",
            room_type="master_bedroom",
            name="Master Suite",
            x=0,
            y=self.D - master_depth,
            width=master_width,
            depth=master_depth
        ))
        
        # WIR - above master
        wir_width = 3.0
        wir_depth = 2.5
        self.rooms.append(PlacedRoom(
            id="wir_01",
            room_type="wir",
            name="WIR",
            x=0,
            y=self.D - master_depth - wir_depth,
            width=wir_width,
            depth=wir_depth
        ))
        
        # Ensuite - next to WIR
        ensuite_width = 2.8
        ensuite_depth = 3.5
        self.rooms.append(PlacedRoom(
            id="ensuite_01",
            room_type="ensuite",
            name="Ensuite",
            x=wir_width,
            y=self.D - master_depth - ensuite_depth,
            width=ensuite_width,
            depth=ensuite_depth
        ))
        
        # === LIVING ZONE - RIGHT SIDE ===
        living_zone_x = left_zone_width + 1.0
        living_zone_width = self.W - living_zone_x
        
        # Family/Meals - rear right (large open space)
        # Define family position first so kitchen can be placed relative to it
        family_y = garage_depth + 5.5  # Start family area after garage zone + kitchen
        family_width = living_zone_width - 0.5
        family_depth = self.D - family_y - 5.0  # Leave room for alfresco
        
        if open_plan:
            self.rooms.append(PlacedRoom(
                id="family_01",
                room_type="family",
                name="Family/Meals",
                x=living_zone_x,
                y=family_y,
                width=family_width,
                depth=family_depth
            ))
        else:
            # Separate dining and family
            self.rooms.append(PlacedRoom(
                id="dining_01",
                room_type="dining",
                name="Dining",
                x=living_zone_x,
                y=family_y,
                width=family_width * 0.45,
                depth=family_depth
            ))
            self.rooms.append(PlacedRoom(
                id="family_01",
                room_type="family",
                name="Family",
                x=living_zone_x + family_width * 0.5,
                y=family_y,
                width=family_width * 0.5,
                depth=family_depth
            ))
        
        # Kitchen - directly adjacent to family (sharing wall)
        kitchen_width = 4.0
        kitchen_depth = 4.5
        kitchen_y = family_y - kitchen_depth  # Place kitchen directly above family
        self.rooms.append(PlacedRoom(
            id="kitchen_01",
            room_type="kitchen",
            name="Kitchen",
            x=living_zone_x + 1.5,
            y=kitchen_y,
            width=kitchen_width,
            depth=kitchen_depth
        ))
        
        # Pantry - adjacent to kitchen
        pantry_width = 2.0
        pantry_depth = 2.5
        self.rooms.append(PlacedRoom(
            id="pantry_01",
            room_type="pantry",
            name="Pantry",
            x=living_zone_x + 1.5 + kitchen_width,
            y=kitchen_y,
            width=pantry_width,
            depth=pantry_depth
        ))
        
        # Alfresco - rear (MUST connect to family)
        if has_alfresco:
            alfresco_width = family_width
            alfresco_depth = 4.5
            alfresco_y = family_y + family_depth  # Place directly below family
            self.rooms.append(PlacedRoom(
                id="alfresco_01",
                room_type="alfresco",
                name="Alfresco",
                x=living_zone_x,
                y=alfresco_y,
                width=alfresco_width,
                depth=alfresco_depth
            ))
        
        # Powder room
        if bathrooms >= 2:
            self.rooms.append(PlacedRoom(
                id="powder_01",
                room_type="powder",
                name="Powder",
                x=living_zone_x,
                y=kitchen_y + 2.0,
                width=1.5,
                depth= 2.0
            ))
        
        # Study
        if has_study:
            self.rooms.append(PlacedRoom(
                id="study_01",
                room_type="study",
                name="Study",
                x=living_zone_x,
                y=garage_depth,
                width=3.0,
                depth=3.0
            ))
        
        # Linen
        self.rooms.append(PlacedRoom(
            id="linen_01",
            room_type="linen",
            name="Linen",
            x=bed_width + bath_width + 0.2,
            y=bedroom_wing_y + bath_depth,
            width=1.5,
            depth=1.5
        ))
        
        # === OPTIMIZATION PASS ===
        self._optimize_layout()
        
        # === FIX OVERLAPS ===
        self._fix_overlaps()
        
        return self._to_json()
    
    def _optimize_layout(self, iterations: int = 2000):
        """Fine-tune room positions using simulated annealing"""
        current_score = self._calculate_score()
        temperature = 50.0
        cooling_rate = 0.995
        
        for i in range(iterations):
            # Try a small adjustment
            room = random.choice(self.rooms)
            old_x, old_y = room.x, room.y
            
            # Small random move
            room.x = max(0, min(room.x + random.uniform(-0.3, 0.3), self.W - room.width))
            room.y = max(0, min(room.y + random.uniform(-0.3, 0.3), self.D - room.depth))
            
            new_score = self._calculate_score()
            
            # Accept or reject
            delta = new_score - current_score
            if delta > 0 or random.random() < math.exp(delta / temperature):
                current_score = new_score
            else:
                room.x, room.y = old_x, old_y
            
            temperature *= cooling_rate
    
    def _fix_overlaps(self):
        """Push apart any overlapping rooms"""
        for _ in range(100):  # Max iterations
            fixed_any = False
            for i, r1 in enumerate(self.rooms):
                for r2 in self.rooms[i+1:]:
                    if r1.overlaps(r2):
                        # Push apart
                        cx1, cy1 = r1.center
                        cx2, cy2 = r2.center
                        dx = cx2 - cx1
                        dy = cy2 - cy1
                        dist = math.sqrt(dx*dx + dy*dy) or 0.1
                        
                        # Normalize and push
                        push = 0.2
                        r1.x = max(0, min(r1.x - push * dx/dist, self.W - r1.width))
                        r1.y = max(0, min(r1.y - push * dy/dist, self.D - r1.depth))
                        r2.x = max(0, min(r2.x + push * dx/dist, self.W - r2.width))
                        r2.y = max(0, min(r2.y + push * dy/dist, self.D - r2.depth))
                        fixed_any = True
            
            if not fixed_any:
                break
    
    def _calculate_score(self) -> float:
        """Score the current layout"""
        score = 500.0
        
        room_dict = {r.id: r for r in self.rooms}
        
        # Heavy penalty for overlaps
        for i, r1 in enumerate(self.rooms):
            for r2 in self.rooms[i+1:]:
                if r1.overlaps(r2):
                    score -= 200
        
        # Penalty for out of bounds
        for r in self.rooms:
            if r.x < 0 or r.y < 0 or r.x2 > self.W or r.y2 > self.D:
                score -= 100
        
        # Required adjacencies
        adjacency_rules = [
            ("ensuite_01", "master_01", 100),
            ("wir_01", "master_01", 80),
            ("pantry_01", "kitchen_01", 80),
            ("kitchen_01", "family_01", 60),
            ("family_01", "alfresco_01", 60),
            ("entry_01", "porch_01", 50),
        ]
        
        for room1_id, room2_id, points in adjacency_rules:
            if room1_id in room_dict and room2_id in room_dict:
                if room_dict[room1_id].shares_wall(room_dict[room2_id]):
                    score += points
                else:
                    score -= points * 0.5
        
        # Bonus for bedroom clustering
        bed_rooms = [r for r in self.rooms if r.room_type == "bedroom"]
        for i, b1 in enumerate(bed_rooms):
            for b2 in bed_rooms[i+1:]:
                if b1.shares_wall(b2):
                    score += 20
        
        # Bonus for master suite being at rear
        if "master_01" in room_dict:
            master = room_dict["master_01"]
            if master.y > self.D * 0.6:  # In rear 40%
                score += 50
        
        # Bonus for garage at front
        if "garage_01" in room_dict:
            garage = room_dict["garage_01"]
            if garage.y < self.D * 0.3:  # In front 30%
                score += 50
        
        return score
    
    def _to_json(self) -> Dict[str, Any]:
        """Convert to JSON format"""
        rooms_json = [r.to_dict() for r in self.rooms]
        
        total_area = sum(r.area for r in self.rooms)
        bedroom_count = sum(1 for r in self.rooms if r.room_type in ['bedroom', 'master_bedroom'])
        bathroom_count = sum(1 for r in self.rooms if r.room_type in ['bathroom', 'ensuite', 'powder'])
        living_area = sum(r.area for r in self.rooms 
                        if r.room_type in ['family', 'lounge', 'dining', 'kitchen'])
        
        return {
            "design_name": "Modern Australian Home",
            "description": "AI-optimized floor plan with bedroom wing layout and open-plan living",
            "rooms": rooms_json,
            "summary": {
                "total_area": round(total_area, 1),
                "living_area": round(living_area, 1),
                "bedroom_count": bedroom_count,
                "bathroom_count": bathroom_count,
                "garage_spaces": 2
            }
        }


def generate_optimized_floor_plan(
    building_width: float,
    building_depth: float,
    bedrooms: int = 4,
    bathrooms: int = 2,
    garage_spaces: int = 2,
    has_theatre: bool = False,
    has_study: bool = False,
    has_alfresco: bool = True,
    open_plan: bool = True
) -> Dict[str, Any]:
    """
    Main entry point for generating an optimized floor plan.
    """
    generator = FloorPlanGenerator(building_width, building_depth)
    return generator.generate(
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        garage_spaces=garage_spaces,
        has_theatre=has_theatre,
        has_study=has_study,
        has_alfresco=has_alfresco,
        open_plan=open_plan
    )


if __name__ == "__main__":
    result = generate_optimized_floor_plan(
        building_width=14.0,
        building_depth=24.0,
        bedrooms=4,
        bathrooms=2,
        has_theatre=True,
        has_alfresco=True
    )
    
    print(json.dumps(result, indent=2))
    
    # Print adjacency check
    rooms = {r["id"]: r for r in result["rooms"]}
    print("\n=== Adjacency Check ===")
    checks = [
        ("master_01", "ensuite_01"),
        ("master_01", "wir_01"),
        ("kitchen_01", "pantry_01"),
        ("kitchen_01", "family_01"),
        ("family_01", "alfresco_01"),
    ]
    for r1_id, r2_id in checks:
        if r1_id in rooms and r2_id in rooms:
            r1, r2 = rooms[r1_id], rooms[r2_id]
            # Simple adjacency check
            adjacent = (
                abs(r1["x"] + r1["width"] - r2["x"]) < 0.2 or
                abs(r2["x"] + r2["width"] - r1["x"]) < 0.2 or
                abs(r1["y"] + r1["depth"] - r2["y"]) < 0.2 or
                abs(r2["y"] + r2["depth"] - r1["y"]) < 0.2
            )
            print(f"{r1_id} <-> {r2_id}: {'✓ Adjacent' if adjacent else '✗ NOT adjacent'}")
