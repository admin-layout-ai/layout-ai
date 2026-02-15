#!/usr/bin/env python3
"""
Professional CAD Floor Plan Generator
===================================================
Key fixes:
- Windows prefer front/back walls over side walls
- Fill ALL gaps in external walls (no empty openings)
- HALL depth reduced by 1m, shifted up to connect to HALLWAY
- Step walls added between LOUNGE-HALL-GARAGE
- Garage door opening (80%)
"""

import json
import svgwrite
from typing import Dict, List, Set
from dataclasses import dataclass


# =============================================================================
# CONFIGURATION
# =============================================================================

SCALE = 42
MARGIN = 50

EXT_WALL_PX = 14
INT_WALL_PX = 5

WALL_COLOR = '#1a1a1a'
BG_COLOR = '#ffffff'
TEXT_COLOR = '#000000'

WINDOW_COVERAGE = 0.60


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class Room:
    id: str
    name: str
    room_type: str
    x: float
    y: float
    width: float
    depth: float
    
    @property
    def x1(self): return self.x
    @property
    def y1(self): return self.y
    @property
    def x2(self): return self.x + self.width
    @property
    def y2(self): return self.y + self.depth
    @property
    def area(self): return self.width * self.depth
    @property
    def center(self): return (self.x + self.width/2, self.y + self.depth/2)
    
    @property
    def is_narrow_vertical(self):
        if 'robe' in self.room_type.lower() or self.room_type == 'wir':
            return True
        if self.room_type == 'hallway' and self.width < self.depth * 0.4:
            return True
        return self.width < self.depth * 0.4 and self.width < 2.8


def parse_rooms(data: Dict) -> List[Room]:
    rooms = []
    for i, r in enumerate(data.get('rooms', [])):
        room = Room(
            id=r.get('id', f'room_{i}'),
            name=r.get('name', 'ROOM'),
            room_type=r.get('type', 'room').lower().replace(' ', '_'),
            x=float(r.get('x', 0)),
            y=float(r.get('y', 0)),
            width=float(r.get('width', 3)),
            depth=float(r.get('depth', 3))
        )
        rooms.append(room)
    return rooms


# =============================================================================
# ROOM ADJUSTMENTS
# =============================================================================

def are_adjacent(r1: Room, r2: Room, tol=0.05) -> bool:
    if abs(r1.x2 - r2.x1) < tol or abs(r2.x2 - r1.x1) < tol:
        y_overlap = min(r1.y2, r2.y2) - max(r1.y1, r2.y1)
        if y_overlap > tol:
            return True
    if abs(r1.y2 - r2.y1) < tol or abs(r2.y2 - r1.y1) < tol:
        x_overlap = min(r1.x2, r2.x2) - max(r1.x1, r2.x1)
        if x_overlap > tol:
            return True
    return False


def merge_bedroom_robe(rooms: List[Room]) -> List[Room]:
    beds = {'bedroom', 'bed'}
    robes = {'robe'}
    
    merged = set()
    result = []
    
    for i, r1 in enumerate(rooms):
        if i in merged:
            continue
            
        if r1.room_type in beds:
            for j, r2 in enumerate(rooms):
                if j in merged or j == i:
                    continue
                if r2.room_type in robes and are_adjacent(r1, r2):
                    new_x = min(r1.x1, r2.x1)
                    new_y = min(r1.y1, r2.y1)
                    new_x2 = max(r1.x2, r2.x2)
                    new_y2 = max(r1.y2, r2.y2)
                    
                    merged_room = Room(
                        id=r1.id,
                        name=r1.name,
                        room_type=r1.room_type,
                        x=new_x,
                        y=new_y,
                        width=new_x2 - new_x,
                        depth=new_y2 - new_y
                    )
                    result.append(merged_room)
                    merged.add(i)
                    merged.add(j)
                    break
            else:
                if i not in merged:
                    result.append(r1)
                    merged.add(i)
        elif r1.room_type in robes:
            has_bed = False
            for j, r2 in enumerate(rooms):
                if r2.room_type in beds and are_adjacent(r1, r2):
                    has_bed = True
                    break
            if not has_bed and i not in merged:
                result.append(r1)
                merged.add(i)
        else:
            if i not in merged:
                result.append(r1)
                merged.add(i)
    
    return result


def adjust_hall_garage(rooms: List[Room]) -> tuple:
    """
    HALL depth should be reduced by 1m when adjacent to GARAGE.
    HALL is shifted UP so it still connects to HALLWAY.
    Returns (rooms, step_walls) where step_walls are extra walls to fill the gap.
    """
    HALL_REDUCTION = 1.0
    step_walls = []  # Extra walls to fill the step/gap
    
    hall_idx = None
    garage = None
    lounge = None
    
    for i, r in enumerate(rooms):
        if r.room_type in {'hall', 'entry', 'foyer'}:
            hall_idx = i
        elif r.room_type == 'garage':
            garage = r
        elif r.room_type in {'lounge', 'living'}:
            lounge = r
    
    if hall_idx is None or not garage:
        return rooms, step_walls
    
    hall = rooms[hall_idx]
    
    # Check if hall and garage share the same front (y1)
    if abs(hall.y1 - garage.y1) < 0.1:
        old_y = hall.y
        old_depth = hall.depth
        new_depth = old_depth - HALL_REDUCTION
        new_y = hall.y + HALL_REDUCTION
        
        # Create new room with reduced depth and shifted position
        new_hall = Room(
            id=hall.id,
            name=hall.name,
            room_type=hall.room_type,
            x=hall.x,
            y=new_y,
            width=hall.width,
            depth=new_depth
        )
        
        rooms[hall_idx] = new_hall
        print(f"  Adjusted HALL: {hall.width:.1f}m x {old_depth:.1f}m → {new_hall.width:.1f}m x {new_depth:.1f}m")
        
        # Add step walls to fill the gap
        # Horizontal wall at HALL's new bottom (y = new_y = 1.0)
        step_walls.append(('h', new_y, hall.x, hall.x + hall.width))
        
        # Vertical wall on left side of gap (from y=0 to y=new_y at x=hall.x)
        if lounge and abs(lounge.x2 - hall.x) < 0.1:
            step_walls.append(('v', hall.x, old_y, new_y))
        
        # Vertical wall on right side of gap (from y=0 to y=new_y at x=hall.x2)
        if garage and abs(garage.x1 - (hall.x + hall.width)) < 0.1:
            step_walls.append(('v', hall.x + hall.width, old_y, new_y))
        
        print(f"  Added {len(step_walls)} step walls to fill gap")
    
    return rooms, step_walls


# =============================================================================
# GEOMETRY
# =============================================================================

def point_in_rooms(px, py, rooms, tol=0.02):
    for r in rooms:
        if r.x1 - tol < px < r.x2 + tol and r.y1 - tol < py < r.y2 + tol:
            return True
    return False


def is_external_edge(x1, y1, x2, y2, rooms):
    mid_x, mid_y = (x1 + x2) / 2, (y1 + y2) / 2
    if abs(x1 - x2) < 0.01:
        return not (point_in_rooms(mid_x - 0.1, mid_y, rooms) and 
                   point_in_rooms(mid_x + 0.1, mid_y, rooms))
    else:
        return not (point_in_rooms(mid_x, mid_y + 0.1, rooms) and 
                   point_in_rooms(mid_x, mid_y - 0.1, rooms))


def get_adjacencies(rooms, tol=0.05):
    adjs = []
    for i, r1 in enumerate(rooms):
        for r2 in rooms[i+1:]:
            if abs(r1.x2 - r2.x1) < tol:
                y1, y2 = max(r1.y1, r2.y1), min(r1.y2, r2.y2)
                if y2 > y1 + tol:
                    adjs.append((r1, r2, 'v', r1.x2, y1, y2))
            elif abs(r2.x2 - r1.x1) < tol:
                y1, y2 = max(r1.y1, r2.y1), min(r1.y2, r2.y2)
                if y2 > y1 + tol:
                    adjs.append((r2, r1, 'v', r2.x2, y1, y2))
            
            if abs(r1.y2 - r2.y1) < tol:
                x1, x2 = max(r1.x1, r2.x1), min(r1.x2, r2.x2)
                if x2 > x1 + tol:
                    adjs.append((r1, r2, 'h', r1.y2, x1, x2))
            elif abs(r2.y2 - r1.y1) < tol:
                x1, x2 = max(r1.x1, r2.x1), min(r1.x2, r2.x2)
                if x2 > x1 + tol:
                    adjs.append((r2, r1, 'h', r2.y2, x1, x2))
    return adjs


# =============================================================================
# ROOM LOGIC
# =============================================================================

def is_open_plan(r1, r2):
    t1, t2 = r1.room_type, r2.room_type
    living = {'family', 'dining', 'kitchen', 'meals'}
    
    if t1 in living and t2 in living:
        return True
    if (t1 == 'kitchen' and t2 in {'pantry', 'wip'}) or (t2 == 'kitchen' and t1 in {'pantry', 'wip'}):
        return True
    if (r1.id == 'hallway' and r2.id == 'hall_r') or (r1.id == 'hall_r' and r2.id == 'hallway'):
        return True
    
    # HALL and HALLWAY should always be connected
    hall_types = {'hall', 'entry', 'foyer'}
    if (t1 in hall_types and t2 == 'hallway') or (t2 in hall_types and t1 == 'hallway'):
        return True
    
    return False


def skip_window(room):
    return room.room_type in {'garage'}


# =============================================================================
# BUILDING OUTLINE
# =============================================================================

def get_building_outline(rooms):
    ext_edges = []
    
    for room in rooms:
        edges = [
            (room.x1, room.y1, room.x2, room.y1, 'h', 'bottom'),
            (room.x1, room.y2, room.x2, room.y2, 'h', 'top'),
            (room.x1, room.y1, room.x1, room.y2, 'v', 'left'),
            (room.x2, room.y1, room.x2, room.y2, 'v', 'right'),
        ]
        
        for x1, y1, x2, y2, orient, side in edges:
            if orient == 'h':
                if is_external_edge(x1, y1, x2, y2, rooms):
                    ext_edges.append((x1, y1, x2, y2, orient, side, room))
            else:
                if is_external_edge(x1, y1, x2, y2, rooms):
                    ext_edges.append((x1, y1, x2, y2, orient, side, room))
    
    return ext_edges


# =============================================================================
# MAIN SVG GENERATION
# =============================================================================

def generate_cad_svg(layout_data: Dict, output_path: str):
    rooms = parse_rooms(layout_data)
    rooms = merge_bedroom_robe(rooms)
    rooms, step_walls = adjust_hall_garage(rooms)
    
    if not rooms:
        raise ValueError("No rooms")
    
    # Debug: print room dimensions
    for r in rooms:
        if r.room_type in {'hall', 'garage', 'lounge', 'living'}:
            print(f"  {r.name}: {r.width:.1f}m x {r.depth:.1f}m (y1={r.y1:.1f}, y2={r.y2:.1f})")
    
    min_x = min(r.x1 for r in rooms)
    min_y = min(r.y1 for r in rooms)
    max_x = max(r.x2 for r in rooms)
    max_y = max(r.y2 for r in rooms)
    
    # Find the garage's y1 to include step walls in bounding box
    garage_y1 = min_y
    for r in rooms:
        if r.room_type == 'garage':
            garage_y1 = r.y1
            break
    
    # Use garage's y1 as the minimum (step walls extend down to garage level)
    min_y = garage_y1
    
    width = int((max_x - min_x) * SCALE) + MARGIN * 2
    height = int((max_y - min_y) * SCALE) + MARGIN * 2
    
    dwg = svgwrite.Drawing(output_path, size=(width, height))
    
    def tx(x): return (x - min_x) * SCALE + MARGIN
    def ty(y): return height - MARGIN - (y - min_y) * SCALE
    
    dwg.add(dwg.rect((0, 0), (width, height), fill=BG_COLOR))
    
    hw = EXT_WALL_PX / 2
    
    # =========================================================================
    # GET BUILDING OUTLINE
    # =========================================================================
    
    ext_edges = get_building_outline(rooms)
    
    room_ext_walls = {}
    for x1, y1, x2, y2, orient, side, room in ext_edges:
        if room.id not in room_ext_walls:
            room_ext_walls[room.id] = []
        room_ext_walls[room.id].append((x1, y1, x2, y2, orient, side, room))
    
    # =========================================================================
    # DRAW EXTERNAL WALLS
    # =========================================================================
    
    for x1, y1, x2, y2, orient, side, room in ext_edges:
        if orient == 'h':
            sx1, sx2 = tx(min(x1, x2)), tx(max(x1, x2))
            sy = ty(y1)
            dwg.add(dwg.rect((sx1 - hw, sy - hw), (sx2 - sx1 + EXT_WALL_PX, EXT_WALL_PX), fill=WALL_COLOR))
        else:
            sx = tx(x1)
            sy1, sy2 = ty(min(y1, y2)), ty(max(y1, y2))
            dwg.add(dwg.rect((sx - hw, min(sy1, sy2) - hw), (EXT_WALL_PX, abs(sy2 - sy1) + EXT_WALL_PX), fill=WALL_COLOR))
    
    # =========================================================================
    # DRAW STEP WALLS (fill gaps from hall adjustment)
    # =========================================================================
    
    for orient, coord, start, end in step_walls:
        if orient == 'h':
            sx1, sx2 = tx(start), tx(end)
            sy = ty(coord)
            dwg.add(dwg.rect((sx1 - hw, sy - hw), (sx2 - sx1 + EXT_WALL_PX, EXT_WALL_PX), fill=WALL_COLOR))
        else:
            sx = tx(coord)
            sy1, sy2 = ty(start), ty(end)
            dwg.add(dwg.rect((sx - hw, min(sy1, sy2) - hw), (EXT_WALL_PX, abs(sy2 - sy1) + EXT_WALL_PX), fill=WALL_COLOR))
    
    # =========================================================================
    # GARAGE DOOR OPENING (80% of width)
    # =========================================================================
    
    for room in rooms:
        if room.room_type == 'garage':
            garage_door_width = room.width * 0.80
            margin = (room.width - garage_door_width) / 2
            door_start = room.x1 + margin
            door_end = room.x2 - margin
            
            sx1 = tx(door_start)
            sx2 = tx(door_end)
            sy = ty(room.y1)
            
            dwg.add(dwg.rect((sx1, sy - hw), (sx2 - sx1, EXT_WALL_PX), fill=BG_COLOR))
            dwg.add(dwg.line((sx1, sy - hw + 2), (sx2, sy - hw + 2), stroke=WALL_COLOR, stroke_width=1))
            dwg.add(dwg.line((sx1, sy - hw + EXT_WALL_PX - 2), (sx2, sy - hw + EXT_WALL_PX - 2), stroke=WALL_COLOR, stroke_width=1))
    
    # =========================================================================
    # SELECT ONE WINDOW PER ROOM
    # Prefer front/back walls (horizontal) over side walls (vertical)
    # =========================================================================
    
    window_locations = []
    
    for room_id, walls in room_ext_walls.items():
        if not walls:
            continue
        
        room = walls[0][6]
        if skip_window(room):
            continue
        
        # Separate horizontal (front/back) and vertical (side) walls
        h_walls = []  # Front/back walls (preferred)
        v_walls = []  # Side walls
        
        for wall in walls:
            x1, y1, x2, y2, orient, side, r = wall
            if orient == 'h':
                wall_len = abs(x2 - x1)
                h_walls.append((wall, wall_len))
            else:
                wall_len = abs(y2 - y1)
                v_walls.append((wall, wall_len))
        
        # Choose which walls to consider:
        # If room has front/back walls, prefer those; otherwise use side walls
        if h_walls:
            candidate_walls = h_walls
        else:
            candidate_walls = v_walls
        
        # Find longest among preferred walls
        best_wall = None
        best_len = 0
        
        for wall, wall_len in candidate_walls:
            if wall_len > best_len:
                best_len = wall_len
                best_wall = wall
        
        if best_wall and best_len >= 0.5:
            x1, y1, x2, y2, orient, side, r = best_wall
            win_len = best_len * WINDOW_COVERAGE
            if orient == 'h':
                mid = (x1 + x2) / 2
                coord = y1
            else:
                mid = (y1 + y2) / 2
                coord = x1
            window_locations.append((orient, coord, mid, win_len, side))
    
    # =========================================================================
    # INTERNAL WALLS
    # =========================================================================
    
    adjs = get_adjacencies(rooms)
    processed = set()
    hw_int = INT_WALL_PX / 2
    
    for r1, r2, orient, coord, start, end in adjs:
        key = tuple(sorted([r1.id, r2.id]))
        if key in processed:
            continue
        processed.add(key)
        
        if is_open_plan(r1, r2):
            continue
        
        if orient == 'v':
            sx = tx(coord)
            sy1, sy2 = ty(start), ty(end)
            dwg.add(dwg.rect((sx - hw_int, min(sy1, sy2)), (INT_WALL_PX, abs(sy2 - sy1)), fill=WALL_COLOR))
        else:
            sy = ty(coord)
            sx1, sx2 = tx(start), tx(end)
            dwg.add(dwg.rect((min(sx1, sx2), sy - hw_int), (abs(sx2 - sx1), INT_WALL_PX), fill=WALL_COLOR))
    
    # =========================================================================
    # WINDOWS
    # =========================================================================
    
    for orient, coord, mid, win_len, side in window_locations:
        if orient == 'h':
            win_x1 = tx(mid - win_len/2)
            win_x2 = tx(mid + win_len/2)
            win_y = ty(coord)
            rect_y = win_y - hw
            
            dwg.add(dwg.rect((win_x1, rect_y), (win_x2 - win_x1, EXT_WALL_PX), fill=BG_COLOR))
            dwg.add(dwg.line((win_x1, rect_y + 2), (win_x2, rect_y + 2), stroke=WALL_COLOR, stroke_width=1.5))
            dwg.add(dwg.line((win_x1, rect_y + EXT_WALL_PX - 2), (win_x2, rect_y + EXT_WALL_PX - 2), stroke=WALL_COLOR, stroke_width=1.5))
        else:
            win_y1 = ty(mid - win_len/2)
            win_y2 = ty(mid + win_len/2)
            win_x = tx(coord)
            rect_x = win_x - hw
            
            dwg.add(dwg.rect((rect_x, min(win_y1, win_y2)), (EXT_WALL_PX, abs(win_y2 - win_y1)), fill=BG_COLOR))
            dwg.add(dwg.line((rect_x + 2, min(win_y1, win_y2)), (rect_x + 2, max(win_y1, win_y2)), stroke=WALL_COLOR, stroke_width=1.5))
            dwg.add(dwg.line((rect_x + EXT_WALL_PX - 2, min(win_y1, win_y2)), (rect_x + EXT_WALL_PX - 2, max(win_y1, win_y2)), stroke=WALL_COLOR, stroke_width=1.5))
    
    # =========================================================================
    # ROOM LABELS
    # =========================================================================
    
    for room in rooms:
        cx, cy = room.center
        sx, sy = tx(cx), ty(cy)
        dim = f'{room.width:.1f}m x {room.depth:.1f}m'
        
        if room.is_narrow_vertical:
            g = dwg.g(transform=f'translate({sx},{sy}) rotate(-90)')
            g.add(dwg.text(room.name, insert=(0, -5), text_anchor='middle',
                          font_size='10px', font_weight='bold', font_family='Arial', fill=TEXT_COLOR))
            g.add(dwg.text(dim, insert=(0, 9), text_anchor='middle',
                          font_size='8px', font_family='Arial', fill=TEXT_COLOR))
            dwg.add(g)
        else:
            dwg.add(dwg.text(room.name, insert=(sx, sy - 5), text_anchor='middle',
                           font_size='11px', font_weight='bold', font_family='Arial', fill=TEXT_COLOR))
            dwg.add(dwg.text(dim, insert=(sx, sy + 10), text_anchor='middle',
                           font_size='9px', font_family='Arial', fill=TEXT_COLOR))
    
    dwg.save()
    print(f"✓ Generated: {output_path}")
    return True


if __name__ == "__main__":
    layout_json = '''
    {
        "rooms": [
            {"id": "garage", "type": "garage", "name": "GARAGE", "x": 7.92, "y": 0, "width": 5.28, "depth": 6.3},
            {"id": "hall", "type": "hall", "name": "HALL", "x": 5.28, "y": 0, "width": 2.64, "depth": 6.3},
            {"id": "lounge", "type": "lounge", "name": "LOUNGE", "x": 0, "y": 0, "width": 5.28, "depth": 6.3},
            {"id": "hallway", "type": "hallway", "name": "HALLWAY", "x": 5.28, "y": 6.3, "width": 2.64, "depth": 10.8},
            {"id": "bed2", "type": "bedroom", "name": "BED 2", "x": 0, "y": 6.3, "width": 2.64, "depth": 3.6},
            {"id": "robe2", "type": "robe", "name": "ROBE 2", "x": 2.64, "y": 6.3, "width": 2.64, "depth": 3.6},
            {"id": "bed3", "type": "bedroom", "name": "BED 3", "x": 0, "y": 9.9, "width": 2.64, "depth": 3.6},
            {"id": "robe3", "type": "robe", "name": "ROBE 3", "x": 2.64, "y": 9.9, "width": 2.64, "depth": 3.6},
            {"id": "bed4", "type": "bedroom", "name": "BED 4", "x": 0, "y": 13.5, "width": 2.64, "depth": 3.6},
            {"id": "robe4", "type": "robe", "name": "ROBE 4", "x": 2.64, "y": 13.5, "width": 2.64, "depth": 3.6},
            {"id": "study", "type": "study", "name": "STUDY", "x": 7.92, "y": 6.3, "width": 1.76, "depth": 3.6},
            {"id": "laundry", "type": "laundry", "name": "LAUNDRY", "x": 9.68, "y": 6.3, "width": 1.76, "depth": 3.6},
            {"id": "wip", "type": "pantry", "name": "WIP", "x": 11.44, "y": 6.3, "width": 1.76, "depth": 3.6},
            {"id": "bathroom", "type": "bathroom", "name": "BATHROOM", "x": 7.92, "y": 9.9, "width": 2.64, "depth": 1.8},
            {"id": "kitchen", "type": "kitchen", "name": "KITCHEN", "x": 7.92, "y": 11.7, "width": 5.28, "depth": 5.4},
            {"id": "hall_r", "type": "hallway", "name": "HALL R", "x": 5.28, "y": 17.1, "width": 2.64, "depth": 5.4},
            {"id": "ensuite", "type": "ensuite", "name": "ENSUITE", "x": 0, "y": 17.1, "width": 2.64, "depth": 1.8},
            {"id": "wir", "type": "wir", "name": "WIR", "x": 2.64, "y": 17.1, "width": 2.64, "depth": 1.8},
            {"id": "master", "type": "master_suite", "name": "MASTER", "x": 0, "y": 18.9, "width": 5.28, "depth": 3.6},
            {"id": "dining", "type": "dining", "name": "DINING", "x": 7.92, "y": 17.1, "width": 5.28, "depth": 1.8},
            {"id": "family", "type": "family", "name": "FAMILY", "x": 7.92, "y": 18.9, "width": 5.28, "depth": 3.6},
            {"id": "store", "type": "storage", "name": "STORE", "x": 10.56, "y": 9.9, "width": 2.64, "depth": 1.8}
        ]
    }
    '''
    
    layout = json.loads(layout_json)
    generate_cad_svg(layout, '/home/claude/cad.svg')
