# backend/app/services/cad_generator.py
"""
Professional CAD Floor Plan Generator v2
========================================
KEY FIX: Solid continuous outer walls with NO GAPS

Features:
- Continuous building envelope (outer walls as solid polygon)
- Internal walls between rooms only
- Proper door/window openings
- Professional CAD quality output
"""

import io
import math
import logging
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional, Set
from dataclasses import dataclass, field
from enum import Enum

from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, A2, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)


# =============================================================================
# CONSTANTS
# =============================================================================

# Wall thicknesses in mm (at 1:100 scale)
EXTERNAL_WALL_THICKNESS = 300  # 300mm external walls
INTERNAL_WALL_THICKNESS = 110  # 110mm internal walls

# Line weights for drawing
LINE_WEIGHT_EXTERNAL = 0.8 * mm   # Thick for external walls
LINE_WEIGHT_INTERNAL = 0.35 * mm  # Medium for internal walls
LINE_WEIGHT_LIGHT = 0.25 * mm     # Light for fixtures, doors
LINE_WEIGHT_FINE = 0.15 * mm      # Fine for details, hatching

# Standard door widths (mm)
DOOR_WIDTHS = {
    'entry': 1020,
    'front': 1020,
    'internal': 820,
    'bedroom': 820,
    'bathroom': 720,
    'ensuite': 720,
    'wc': 620,
    'wir': 720,
    'sliding': 1800,
    'bifold': 2700,
    'stacker': 3600,
    'garage': 2400,
}

# Room type abbreviations
ROOM_ABBREVIATIONS = {
    'master_bedroom': 'MASTER BED',
    'master': 'MASTER BED',
    'bedroom': 'BED',
    'bed': 'BED',
    'ensuite': 'ENS',
    'bathroom': 'BATH',
    'main_bathroom': 'BATH',
    'powder': 'PDR',
    'powder_room': 'PDR',
    'wc': 'WC',
    'toilet': 'WC',
    'walk_in_robe': 'WIR',
    'wir': 'WIR',
    'robe': 'WIR',
    'wardrobe': 'WIR',
    'kitchen': 'KITC.',
    'living': 'LIVING',
    'family': 'FAMILY / MEALS',
    'family_meals': 'FAMILY / MEALS',
    'lounge': 'LOUNGE',
    'dining': 'DINING',
    'study': 'STUDY',
    'office': 'STUDY',
    'home_office': 'STUDY',
    'laundry': "L'DRY",
    'garage': 'GARAGE',
    'double_garage': 'GARAGE',
    'alfresco': 'ALFRESCO',
    'porch': 'PORCH',
    'entry': 'ENTRY',
    'foyer': 'ENTRY',
    'pantry': 'WIP',
    'walk_in_pantry': 'WIP',
    'butlers_pantry': 'WIP',
    'theatre': 'THEATRE',
    'media': 'THEATRE',
    'linen': 'LINEN',
    'store': 'STORE',
    'hallway': 'MAIN HALLWAY',
    'main_hallway': 'MAIN HALLWAY',
    'bedroom_hallway': 'BEDROOM HALLWAY',
    'corridor': 'HALL',
}


@dataclass
class Room:
    """Room data structure"""
    id: str
    name: str
    room_type: str
    x: float  # meters from origin
    y: float  # meters from origin
    width: float  # meters
    depth: float  # meters
    floor: int = 0
    doors: List[Dict] = field(default_factory=list)
    windows: List[Dict] = field(default_factory=list)
    features: List[str] = field(default_factory=list)
    
    @property
    def bounds_mm(self) -> Tuple[float, float, float, float]:
        """Return bounds in mm: (x, y, width, height)"""
        return (self.x * 1000, self.y * 1000, self.width * 1000, self.depth * 1000)
    
    @property
    def center_mm(self) -> Tuple[float, float]:
        """Return center point in mm"""
        return (self.x * 1000 + self.width * 500, self.y * 1000 + self.depth * 500)
    
    @property
    def area(self) -> float:
        """Return area in m²"""
        return self.width * self.depth


class ProfessionalCADGenerator:
    """Generate CAD-quality floor plan PDFs"""
    
    def __init__(self):
        self.margin = 15 * mm
        self.wall_segments = []
        self.door_openings = []  # Track where doors cut walls
    
    def generate(self, layout_data: Dict, project_name: str = "Floor Plan", 
                 project_details: Dict = None) -> bytes:
        """Generate PDF floor plan"""
        
        # Parse rooms
        rooms = self._parse_rooms(layout_data)
        if not rooms:
            raise ValueError("No rooms in layout data")
        
        # Filter to ground floor
        ground_floor_rooms = [r for r in rooms if r.floor == 0]
        if not ground_floor_rooms:
            ground_floor_rooms = rooms
        
        # Calculate bounds and layout
        bounds = self._calculate_bounds(ground_floor_rooms)
        
        # Choose page size based on building size
        min_x, min_y, max_x, max_y = bounds
        building_width = (max_x - min_x) * 1000
        building_depth = (max_y - min_y) * 1000
        
        if building_width > 15000 or building_depth > 15000:
            page_width, page_height = landscape(A2)
        else:
            page_width, page_height = landscape(A3)
        
        # Calculate scale and position
        scale, offset_x, offset_y = self._calculate_layout(bounds, page_width, page_height)
        
        # Create PDF
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=(page_width, page_height))
        
        # Draw in correct order (back to front)
        self._draw_room_fills(c, ground_floor_rooms, scale, offset_x, offset_y, bounds)
        self._draw_hatching(c, ground_floor_rooms, scale, offset_x, offset_y)
        
        # KEY: Draw building envelope as continuous polygon FIRST
        self._draw_building_envelope_solid(c, ground_floor_rooms, scale, offset_x, offset_y, bounds)
        
        # Then draw internal walls
        self._draw_internal_walls(c, ground_floor_rooms, scale, offset_x, offset_y, bounds)
        
        # Door and window openings
        self._draw_doors(c, ground_floor_rooms, scale, offset_x, offset_y, bounds)
        self._draw_windows(c, ground_floor_rooms, scale, offset_x, offset_y, bounds)
        
        # Fixtures and labels
        self._draw_fixtures(c, ground_floor_rooms, scale, offset_x, offset_y)
        self._draw_room_labels(c, ground_floor_rooms, scale, offset_x, offset_y)
        
        # Dimensions
        self._draw_dimensions(c, ground_floor_rooms, scale, offset_x, offset_y, bounds)
        
        # Title block and annotations
        self._draw_title_block(c, layout_data, project_name, project_details, page_width, page_height)
        self._draw_north_arrow(c, page_width, page_height)
        self._draw_scale_bar(c, scale, page_width, page_height)
        
        c.save()
        buffer.seek(0)
        return buffer.getvalue()
    
    def _parse_rooms(self, layout_data: Dict) -> List[Room]:
        """Parse layout data into Room objects"""
        rooms = []
        for i, r in enumerate(layout_data.get('rooms', [])):
            room_type = r.get('type', 'room').lower().replace(' ', '_').replace('-', '_')
            rooms.append(Room(
                id=r.get('id', f'room_{i}'),
                name=r.get('name', f'Room {i+1}'),
                room_type=room_type,
                x=float(r.get('x', 0)),
                y=float(r.get('y', 0)),
                width=float(r.get('width', 4)),
                depth=float(r.get('depth', 4)),
                floor=int(r.get('floor', 0)),
                doors=r.get('doors', []),
                windows=r.get('windows', []),
                features=r.get('features', []),
            ))
        return rooms
    
    def _calculate_bounds(self, rooms: List[Room]) -> Tuple[float, float, float, float]:
        """Calculate building envelope bounds in meters"""
        if not rooms:
            return (0, 0, 10, 10)
        min_x = min(r.x for r in rooms)
        min_y = min(r.y for r in rooms)
        max_x = max(r.x + r.width for r in rooms)
        max_y = max(r.y + r.depth for r in rooms)
        return (min_x, min_y, max_x, max_y)
    
    def _calculate_layout(self, bounds: Tuple, page_width: float, page_height: float) -> Tuple[float, float, float]:
        """Calculate scale and offsets"""
        min_x, min_y, max_x, max_y = bounds
        
        building_width = (max_x - min_x) * 1000  # mm
        building_depth = (max_y - min_y) * 1000
        
        # Leave margins for dimensions and title
        dim_space = 25 * mm
        title_height = 35 * mm
        available_w = page_width - 2 * self.margin - 2 * dim_space
        available_h = page_height - 2 * self.margin - title_height - 2 * dim_space
        
        # Calculate scale
        scale_x = available_w / building_width if building_width > 0 else 1
        scale_y = available_h / building_depth if building_depth > 0 else 1
        scale = min(scale_x, scale_y) * 0.85
        
        # Center the drawing
        offset_x = self.margin + dim_space + (available_w - building_width * scale) / 2 - min_x * 1000 * scale
        offset_y = self.margin + title_height + dim_space + (available_h - building_depth * scale) / 2 - min_y * 1000 * scale
        
        return (scale, offset_x, offset_y)
    
    # =========================================================================
    # BUILDING ENVELOPE - SOLID OUTER WALLS (KEY FIX)
    # =========================================================================
    
    def _draw_building_envelope_solid(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """
        Draw the building envelope as a SOLID continuous polygon.
        This creates proper outer walls with NO GAPS.
        """
        # Get the building outline as a polygon
        outline_points = self._compute_building_outline(rooms, bounds)
        
        if len(outline_points) < 3:
            # Fallback to simple rectangle
            min_x, min_y, max_x, max_y = bounds
            outline_points = [
                (min_x, min_y),
                (max_x, min_y),
                (max_x, max_y),
                (min_x, max_y),
            ]
        
        # Convert to screen coordinates
        screen_points = []
        for px, py in outline_points:
            sx = px * 1000 * scale + ox
            sy = py * 1000 * scale + oy
            screen_points.append((sx, sy))
        
        wall_thickness = EXTERNAL_WALL_THICKNESS * scale
        
        # Draw thick outer line for the entire perimeter
        c.setStrokeColor(colors.black)
        c.setLineWidth(wall_thickness)
        c.setLineCap(0)  # Projecting cap for sharp corners
        c.setLineJoin(0)  # Mitre join for sharp corners
        
        # Draw as a closed polygon
        path = c.beginPath()
        path.moveTo(screen_points[0][0], screen_points[0][1])
        for sx, sy in screen_points[1:]:
            path.lineTo(sx, sy)
        path.close()
        c.drawPath(path, stroke=1, fill=0)
    
    def _compute_building_outline(self, rooms: List[Room], bounds: Tuple) -> List[Tuple[float, float]]:
        """
        Compute the outer boundary polygon of the building.
        This traces the exterior edge of all rooms combined.
        """
        min_x, min_y, max_x, max_y = bounds
        
        # Create a grid of points along the boundary
        # and trace the outer edge clockwise
        
        # Collect all room rectangles
        rects = [(r.x, r.y, r.x + r.width, r.y + r.depth) for r in rooms]
        
        # Find unique X and Y coordinates (sorted)
        x_coords = sorted(set([r[0] for r in rects] + [r[2] for r in rects]))
        y_coords = sorted(set([r[1] for r in rects] + [r[3] for r in rects]))
        
        # Create occupancy grid
        def is_inside(px, py):
            """Check if point is inside any room"""
            for rx1, ry1, rx2, ry2 in rects:
                if rx1 <= px < rx2 and ry1 <= py < ry2:
                    return True
            return False
        
        # Trace outline using marching squares approach
        # For simplicity, we'll use a convex hull-like approach
        # that traces the outer boundary
        
        outline = []
        
        # Start from bottom-left, go clockwise
        # Bottom edge (left to right)
        for i, x in enumerate(x_coords):
            for r in rooms:
                if abs(r.y - min_y) < 0.01 and r.x <= x < r.x + r.width:
                    if not outline or outline[-1] != (x, min_y):
                        outline.append((x, min_y))
                    break
        
        # Add bottom-right corner
        outline.append((max_x, min_y))
        
        # Right edge (bottom to top)
        for y in y_coords:
            for r in rooms:
                if abs(r.x + r.width - max_x) < 0.01 and r.y <= y < r.y + r.depth:
                    if outline[-1] != (max_x, y):
                        outline.append((max_x, y))
                    break
        
        # Add top-right corner
        outline.append((max_x, max_y))
        
        # Top edge (right to left)
        for x in reversed(x_coords):
            for r in rooms:
                if abs(r.y + r.depth - max_y) < 0.01 and r.x <= x < r.x + r.width:
                    if outline[-1] != (x, max_y):
                        outline.append((x, max_y))
                    break
        
        # Add top-left corner
        outline.append((min_x, max_y))
        
        # Left edge (top to bottom)
        for y in reversed(y_coords):
            for r in rooms:
                if abs(r.x - min_x) < 0.01 and r.y <= y < r.y + r.depth:
                    if outline[-1] != (min_x, y):
                        outline.append((min_x, y))
                    break
        
        # Simplify: remove duplicate consecutive points
        simplified = [outline[0]]
        for p in outline[1:]:
            if p != simplified[-1]:
                simplified.append(p)
        
        # If outline is too simple, use bounds rectangle
        if len(simplified) < 4:
            return [
                (min_x, min_y),
                (max_x, min_y),
                (max_x, max_y),
                (min_x, max_y),
            ]
        
        return simplified
    
    # =========================================================================
    # INTERNAL WALLS
    # =========================================================================
    
    def _draw_internal_walls(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw internal walls between rooms"""
        min_x, min_y, max_x, max_y = bounds
        tol = 0.05  # 50mm tolerance for matching edges
        
        c.setStrokeColor(colors.black)
        c.setLineWidth(INTERNAL_WALL_THICKNESS * scale)
        c.setLineCap(0)
        c.setLineJoin(0)
        
        drawn_walls = set()  # Track drawn walls to avoid duplicates
        
        # Room types that always need internal walls on non-external edges
        enclosed_rooms = {'bedroom', 'bed', 'master_bedroom', 'master', 'ensuite', 
                         'bathroom', 'main_bathroom', 'wc', 'toilet', 'powder',
                         'wir', 'walk_in_robe', 'study', 'office', 'laundry'}
        
        for room in rooms:
            rx1, ry1 = room.x, room.y
            rx2, ry2 = room.x + room.width, room.y + room.depth
            
            # Check each edge
            edges = [
                ('south', rx1, ry1, rx2, ry1),  # Bottom
                ('north', rx1, ry2, rx2, ry2),  # Top
                ('west', rx1, ry1, rx1, ry2),   # Left
                ('east', rx2, ry1, rx2, ry2),   # Right
            ]
            
            for edge_name, x1, y1, x2, y2 in edges:
                # Skip if this is an external edge
                if edge_name == 'south' and abs(y1 - min_y) < tol:
                    continue
                if edge_name == 'north' and abs(y2 - max_y) < tol:
                    continue
                if edge_name == 'west' and abs(x1 - min_x) < tol:
                    continue
                if edge_name == 'east' and abs(x2 - max_x) < tol:
                    continue
                
                # Create wall key to avoid duplicates
                wall_key = tuple(sorted([(round(x1, 2), round(y1, 2)), (round(x2, 2), round(y2, 2))]))
                if wall_key in drawn_walls:
                    continue
                drawn_walls.add(wall_key)
                
                # Check if there's an adjacent room
                has_neighbor = self._has_adjacent_room(room, edge_name, rooms)
                
                # For enclosed rooms (bedrooms, etc.), always draw internal walls
                # For other rooms, only draw if there's an adjacent room
                should_draw = has_neighbor or (room.room_type in enclosed_rooms)
                
                if should_draw:
                    sx1 = x1 * 1000 * scale + ox
                    sy1 = y1 * 1000 * scale + oy
                    sx2 = x2 * 1000 * scale + ox
                    sy2 = y2 * 1000 * scale + oy
                    
                    c.line(sx1, sy1, sx2, sy2)
    
    def _has_adjacent_room(self, room: Room, edge: str, rooms: List[Room]) -> bool:
        """Check if there's a room adjacent to the given edge"""
        tol = 0.1
        rx1, ry1 = room.x, room.y
        rx2, ry2 = room.x + room.width, room.y + room.depth
        
        for other in rooms:
            if other.id == room.id:
                continue
            ox1, oy1 = other.x, other.y
            ox2, oy2 = other.x + other.width, other.y + other.depth
            
            if edge == 'east':
                if abs(rx2 - ox1) < tol:
                    if ry1 < oy2 and ry2 > oy1:
                        return True
            elif edge == 'west':
                if abs(rx1 - ox2) < tol:
                    if ry1 < oy2 and ry2 > oy1:
                        return True
            elif edge == 'north':
                if abs(ry2 - oy1) < tol:
                    if rx1 < ox2 and rx2 > ox1:
                        return True
            elif edge == 'south':
                if abs(ry1 - oy2) < tol:
                    if rx1 < ox2 and rx2 > ox1:
                        return True
        return False
    
    # =========================================================================
    # ROOM FILLS AND HATCHING
    # =========================================================================
    
    def _draw_room_fills(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """Fill room interiors with white"""
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.white)
        
        for room in rooms:
            x, y, w, h = room.bounds_mm
            sx = x * scale + ox
            sy = y * scale + oy
            sw = w * scale
            sh = h * scale
            c.rect(sx, sy, sw, sh, fill=1, stroke=0)
    
    def _draw_hatching(self, c, rooms: List[Room], scale: float, ox: float, oy: float):
        """Draw hatching for wet areas and outdoor spaces"""
        hatch_rooms = {
            'bathroom': 'cross',
            'main_bathroom': 'cross',
            'ensuite': 'cross',
            'wc': 'cross',
            'toilet': 'cross',
            'powder': 'cross',
            'laundry': 'diagonal',
            'alfresco': 'diagonal',
            'porch': 'diagonal',
            'garage': 'none',  # No hatching for garage
        }
        
        c.setStrokeColor(colors.Color(0.8, 0.8, 0.8))
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        for room in rooms:
            hatch_style = hatch_rooms.get(room.room_type)
            if not hatch_style or hatch_style == 'none':
                continue
            
            x, y, w, h = room.bounds_mm
            sx = x * scale + ox
            sy = y * scale + oy
            sw = w * scale
            sh = h * scale
            
            spacing = 4 * mm
            
            c.saveState()
            path = c.beginPath()
            path.rect(sx + 2, sy + 2, sw - 4, sh - 4)
            c.clipPath(path, stroke=0)
            
            if hatch_style == 'diagonal':
                # Diagonal lines
                for i in range(int((sw + sh) / spacing) + 1):
                    x1 = sx + i * spacing
                    y1 = sy
                    x2 = sx
                    y2 = sy + i * spacing
                    c.line(x1, y1, x2, y2)
            elif hatch_style == 'cross':
                # Cross-hatch
                for i in range(int((sw + sh) / spacing) + 1):
                    x1 = sx + i * spacing
                    y1 = sy
                    x2 = sx
                    y2 = sy + i * spacing
                    c.line(x1, y1, x2, y2)
                for i in range(int((sw + sh) / spacing) + 1):
                    x1 = sx
                    y1 = sy + sh - i * spacing
                    x2 = sx + i * spacing
                    y2 = sy + sh
                    c.line(x1, y1, x2, y2)
            
            c.restoreState()
    
    # =========================================================================
    # DOORS
    # =========================================================================
    
    def _draw_doors(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw door symbols"""
        min_x, min_y, max_x, max_y = bounds
        
        # Default doors by room type
        default_doors = {
            'entry': [{'wall': 'south', 'type': 'single', 'width': 1020}],
            'foyer': [{'wall': 'south', 'type': 'single', 'width': 1020}],
            'bedroom': [{'wall': 'north', 'type': 'single', 'width': 820}],
            'bed': [{'wall': 'north', 'type': 'single', 'width': 820}],
            'master_bedroom': [{'wall': 'north', 'type': 'single', 'width': 820}],
            'master': [{'wall': 'north', 'type': 'single', 'width': 820}],
            'ensuite': [{'wall': 'south', 'type': 'single', 'width': 720}],
            'bathroom': [{'wall': 'north', 'type': 'single', 'width': 720}],
            'main_bathroom': [{'wall': 'north', 'type': 'single', 'width': 720}],
            'wc': [{'wall': 'north', 'type': 'single', 'width': 620}],
            'powder': [{'wall': 'north', 'type': 'single', 'width': 720}],
            'wir': [{'wall': 'east', 'type': 'single', 'width': 720}],
            'walk_in_robe': [{'wall': 'east', 'type': 'single', 'width': 720}],
            'laundry': [{'wall': 'north', 'type': 'single', 'width': 820}],
            'garage': [{'wall': 'south', 'type': 'garage', 'width': 4800}],
            'double_garage': [{'wall': 'south', 'type': 'garage', 'width': 4800}],
            'study': [{'wall': 'north', 'type': 'single', 'width': 820}],
            'office': [{'wall': 'north', 'type': 'single', 'width': 820}],
            'pantry': [{'wall': 'south', 'type': 'single', 'width': 720}],
            'walk_in_pantry': [{'wall': 'south', 'type': 'single', 'width': 720}],
            'theatre': [{'wall': 'north', 'type': 'double', 'width': 1640}],
            'alfresco': [{'wall': 'south', 'type': 'stacker', 'width': 3600}],
            'family': [],  # Open to kitchen usually
            'family_meals': [],
            'kitchen': [],
        }
        
        for room in rooms:
            doors = room.doors if room.doors else default_doors.get(room.room_type, [])
            
            for door in doors:
                self._draw_single_door(c, room, door, scale, ox, oy, bounds)
    
    def _draw_single_door(self, c, room: Room, door: Dict, scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw a single door with opening and swing arc"""
        wall = door.get('wall', 'north').lower()
        door_type = door.get('type', 'single').lower()
        door_width = door.get('width', 820)  # mm
        position = door.get('position', 0.5)
        
        x, y, w, h = room.bounds_mm
        
        # Calculate door position on wall
        if wall == 'north':
            dx = x + w * position
            dy = y + h
            angle = 90
        elif wall == 'south':
            dx = x + w * position
            dy = y
            angle = 270
        elif wall == 'east':
            dx = x + w
            dy = y + h * position
            angle = 0
        else:  # west
            dx = x
            dy = y + h * position
            angle = 180
        
        # Transform to screen coordinates
        sx = dx * scale + ox
        sy = dy * scale + oy
        sw = door_width * scale
        
        c.saveState()
        c.translate(sx, sy)
        c.rotate(angle)
        
        # Clear wall for door opening (white rectangle)
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.white)
        wall_clear = EXTERNAL_WALL_THICKNESS * scale * 1.5
        c.rect(-sw/2 - 2, -wall_clear/2, sw + 4, wall_clear, fill=1, stroke=0)
        
        # Draw door symbol
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        
        if door_type == 'single':
            # Door leaf and 90° swing arc
            c.rect(-sw/2, 0, sw, 2*mm, fill=1, stroke=1)
            c.arc(-sw/2, 0, sw/2, sw, 0, 90)
        elif door_type == 'double':
            # Two leaves with swing arcs
            half = sw / 2
            c.rect(-sw/2, 0, half - 1, 2*mm, fill=1, stroke=1)
            c.rect(1, 0, half - 1, 2*mm, fill=1, stroke=1)
            c.arc(-sw/2, 0, 0, half, 0, 90)
            c.arc(0, 0, sw/2, half, 90, 90)
        elif door_type == 'sliding':
            # Sliding door - dashed line
            c.setDash([3*mm, 2*mm])
            c.line(-sw/2, 0, sw/2, 0)
            c.setDash([])
            # Arrow
            c.line(sw/4, -2*mm, sw/2, 0)
            c.line(sw/4, 2*mm, sw/2, 0)
        elif door_type == 'bifold' or door_type == 'stacker':
            # Bifold/stacker - zigzag pattern
            segments = 4
            seg_w = sw / segments
            for i in range(segments):
                x1 = -sw/2 + i * seg_w
                x2 = x1 + seg_w
                if i % 2 == 0:
                    c.line(x1, 0, x2, 3*mm)
                else:
                    c.line(x1, 3*mm, x2, 0)
        elif door_type == 'garage':
            # Garage door - thick dashed line
            c.setLineWidth(LINE_WEIGHT_INTERNAL)
            c.setDash([5*mm, 3*mm])
            c.line(-sw/2, 0, sw/2, 0)
            c.setDash([])
        
        c.restoreState()
    
    # =========================================================================
    # WINDOWS
    # =========================================================================
    
    def _draw_windows(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw window symbols on external walls"""
        min_x, min_y, max_x, max_y = bounds
        tol = 0.05
        
        # Default windows for rooms on external walls
        window_rooms = ['bedroom', 'bed', 'master_bedroom', 'master', 'living', 'family', 
                       'family_meals', 'kitchen', 'dining', 'study', 'lounge', 'theatre']
        
        for room in rooms:
            if room.room_type not in window_rooms:
                continue
            
            # Check which walls are external
            if abs(room.y - min_y) < tol:
                # South wall is external
                self._draw_window(c, room, 'south', 1500, 0.5, scale, ox, oy)
            if abs(room.y + room.depth - max_y) < tol:
                # North wall is external
                self._draw_window(c, room, 'north', 1500, 0.5, scale, ox, oy)
            if abs(room.x - min_x) < tol:
                # West wall is external
                self._draw_window(c, room, 'west', 1200, 0.5, scale, ox, oy)
            if abs(room.x + room.width - max_x) < tol:
                # East wall is external
                self._draw_window(c, room, 'east', 1200, 0.5, scale, ox, oy)
    
    def _draw_window(self, c, room: Room, wall: str, width: float, position: float, 
                     scale: float, ox: float, oy: float):
        """Draw a window symbol"""
        x, y, w, h = room.bounds_mm
        
        if wall == 'north':
            wx = x + w * position
            wy = y + h
            angle = 0
        elif wall == 'south':
            wx = x + w * position
            wy = y
            angle = 0
        elif wall == 'east':
            wx = x + w
            wy = y + h * position
            angle = 90
        else:  # west
            wx = x
            wy = y + h * position
            angle = 90
        
        sx = wx * scale + ox
        sy = wy * scale + oy
        sw = width * scale
        
        c.saveState()
        c.translate(sx, sy)
        c.rotate(angle)
        
        # Window symbol - parallel lines
        c.setStrokeColor(colors.black)
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        c.setFillColor(colors.white)
        
        gap = 2 * mm
        c.rect(-sw/2, -gap, sw, gap * 2, fill=1, stroke=1)
        c.line(-sw/2, 0, sw/2, 0)
        
        c.restoreState()
    
    # =========================================================================
    # FIXTURES
    # =========================================================================
    
    def _draw_fixtures(self, c, rooms: List[Room], scale: float, ox: float, oy: float):
        """Draw room fixtures (toilets, sinks, appliances, etc.)"""
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        
        for room in rooms:
            x, y, w, h = room.bounds_mm
            sx = x * scale + ox
            sy = y * scale + oy
            sw = w * scale
            sh = h * scale
            
            rt = room.room_type
            
            if rt in ['bathroom', 'main_bathroom']:
                self._draw_bath(c, sx + sw * 0.7, sy + sh * 0.5, scale)
                self._draw_toilet(c, sx + sw * 0.2, sy + sh * 0.25, scale)
                self._draw_basin(c, sx + sw * 0.2, sy + sh * 0.7, scale)
            
            elif rt == 'ensuite':
                self._draw_shower(c, sx + sw * 0.75, sy + sh * 0.7, scale)
                self._draw_toilet(c, sx + sw * 0.25, sy + sh * 0.25, scale)
                self._draw_basin(c, sx + sw * 0.25, sy + sh * 0.7, scale)
            
            elif rt in ['wc', 'toilet', 'powder']:
                self._draw_toilet(c, sx + sw * 0.5, sy + sh * 0.35, scale)
                self._draw_basin(c, sx + sw * 0.5, sy + sh * 0.75, scale)
            
            elif rt == 'laundry':
                self._draw_washer(c, sx + sw * 0.75, sy + sh * 0.5, scale)
                self._draw_laundry_tub(c, sx + sw * 0.25, sy + sh * 0.5, scale)
            
            elif rt == 'kitchen':
                self._draw_kitchen(c, sx, sy, sw, sh, scale)
            
            elif rt in ['garage', 'double_garage']:
                self._draw_cars(c, sx, sy, sw, sh, scale, room.room_type == 'double_garage')
            
            elif rt in ['bedroom', 'bed', 'master_bedroom', 'master']:
                self._draw_bed(c, sx + sw * 0.5, sy + sh * 0.4, scale, rt in ['master_bedroom', 'master'])
            
            elif rt in ['family', 'family_meals', 'living', 'lounge']:
                self._draw_living_furniture(c, sx, sy, sw, sh, scale)
            
            elif rt in ['wir', 'walk_in_robe', 'robe']:
                self._draw_wardrobe_rails(c, sx, sy, sw, sh, scale)
    
    def _draw_toilet(self, c, cx: float, cy: float, scale: float):
        """Draw toilet symbol"""
        w = 400 * scale
        h = 650 * scale
        c.ellipse(cx - w/2, cy - h/2, cx + w/2, cy + h/2, fill=1, stroke=1)
        # Tank
        c.rect(cx - w/2.5, cy + h/2 - 2, w/1.25, h * 0.25, fill=1, stroke=1)
    
    def _draw_basin(self, c, cx: float, cy: float, scale: float):
        """Draw basin/vanity symbol"""
        w = 500 * scale
        h = 400 * scale
        c.rect(cx - w/2, cy - h/2, w, h, fill=1, stroke=1)
        c.ellipse(cx - w/3, cy - h/3, cx + w/3, cy + h/3, fill=0, stroke=1)
    
    def _draw_bath(self, c, cx: float, cy: float, scale: float):
        """Draw bathtub symbol"""
        w = 750 * scale
        h = 1700 * scale
        c.roundRect(cx - w/2, cy - h/2, w, h, 10*scale, fill=1, stroke=1)
    
    def _draw_shower(self, c, cx: float, cy: float, scale: float):
        """Draw shower symbol"""
        w = 900 * scale
        h = 900 * scale
        c.rect(cx - w/2, cy - h/2, w, h, fill=1, stroke=1)
        # Diagonal hatching for shower
        c.setLineWidth(LINE_WEIGHT_FINE)
        for i in range(6):
            offset = i * w / 5
            c.line(cx - w/2 + offset, cy - h/2, cx - w/2, cy - h/2 + offset)
            c.line(cx + w/2 - offset, cy + h/2, cx + w/2, cy + h/2 - offset)
    
    def _draw_washer(self, c, cx: float, cy: float, scale: float):
        """Draw washing machine symbol"""
        w = 600 * scale
        c.rect(cx - w/2, cy - w/2, w, w, fill=1, stroke=1)
        c.circle(cx, cy, w * 0.35, fill=0, stroke=1)
        # WM label
        c.setFont("Helvetica", 6 * scale / 0.01)
        c.drawCentredString(cx, cy - 2 * scale, "WM")
    
    def _draw_laundry_tub(self, c, cx: float, cy: float, scale: float):
        """Draw laundry tub symbol"""
        w = 550 * scale
        h = 500 * scale
        c.rect(cx - w/2, cy - h/2, w, h, fill=1, stroke=1)
        c.rect(cx - w/2.5, cy - h/2.5, w/1.25, h/1.25, fill=0, stroke=1)
    
    def _draw_kitchen(self, c, sx: float, sy: float, sw: float, sh: float, scale: float):
        """Draw kitchen layout"""
        # Benchtop along one wall
        bench_d = 600 * scale
        c.rect(sx + 2, sy + sh - bench_d, sw - 4, bench_d, fill=1, stroke=1)
        
        # Sink
        sink_w = 400 * scale
        c.ellipse(sx + sw * 0.3, sy + sh - bench_d + 100*scale, 
                 sx + sw * 0.3 + sink_w, sy + sh - 100*scale, fill=0, stroke=1)
        
        # Cooktop
        cooktop_x = sx + sw * 0.6
        for i in range(4):
            cx = cooktop_x + (i % 2) * 150 * scale
            cy = sy + sh - bench_d/2 + (i // 2) * 150 * scale - 75 * scale
            c.circle(cx, cy, 60 * scale, fill=0, stroke=1)
        
        # Fridge symbol
        fridge_w = 700 * scale
        fridge_h = 700 * scale
        c.rect(sx + sw - fridge_w - 5, sy + 5, fridge_w, fridge_h, fill=1, stroke=1)
        c.setFont("Helvetica", 5)
        c.drawCentredString(sx + sw - fridge_w/2 - 5, sy + fridge_h/2, "REF")
    
    def _draw_cars(self, c, sx: float, sy: float, sw: float, sh: float, scale: float, double: bool):
        """Draw car outlines in garage"""
        car_w = 1800 * scale
        car_h = 4500 * scale
        
        c.setStrokeColor(colors.Color(0.7, 0.7, 0.7))
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        
        if double:
            # Two cars
            c.roundRect(sx + sw * 0.25 - car_w/2, sy + (sh - car_h)/2, car_w, car_h, 15*scale, fill=0, stroke=1)
            c.roundRect(sx + sw * 0.75 - car_w/2, sy + (sh - car_h)/2, car_w, car_h, 15*scale, fill=0, stroke=1)
        else:
            # One car
            c.roundRect(sx + sw/2 - car_w/2, sy + (sh - car_h)/2, car_w, car_h, 15*scale, fill=0, stroke=1)
    
    def _draw_bed(self, c, cx: float, cy: float, scale: float, is_master: bool):
        """Draw bed symbol"""
        if is_master:
            w = 1800 * scale  # King
            h = 2100 * scale
        else:
            w = 1400 * scale  # Double/Queen
            h = 2000 * scale
        
        c.setStrokeColor(colors.Color(0.6, 0.6, 0.6))
        c.rect(cx - w/2, cy - h/2, w, h, fill=0, stroke=1)
        # Pillows
        pillow_h = 300 * scale
        c.rect(cx - w/2 + 50*scale, cy + h/2 - pillow_h - 50*scale, 
               w - 100*scale, pillow_h, fill=0, stroke=1)
    
    def _draw_living_furniture(self, c, sx: float, sy: float, sw: float, sh: float, scale: float):
        """Draw living room furniture"""
        c.setStrokeColor(colors.Color(0.7, 0.7, 0.7))
        
        # Sofa
        sofa_w = min(2500 * scale, sw * 0.6)
        sofa_h = 900 * scale
        c.rect(sx + (sw - sofa_w)/2, sy + sh * 0.2, sofa_w, sofa_h, fill=0, stroke=1)
        
        # Dining table if family/meals
        table_w = 1600 * scale
        table_h = 1000 * scale
        c.rect(sx + sw * 0.6, sy + sh * 0.55, table_w, table_h, fill=0, stroke=1)
    
    def _draw_wardrobe_rails(self, c, sx: float, sy: float, sw: float, sh: float, scale: float):
        """Draw wardrobe hanging rails"""
        c.setStrokeColor(colors.Color(0.7, 0.7, 0.7))
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Rails along walls
        rail_offset = 300 * scale
        c.line(sx + rail_offset, sy + 5, sx + rail_offset, sy + sh - 5)
        c.line(sx + sw - rail_offset, sy + 5, sx + sw - rail_offset, sy + sh - 5)
    
    # =========================================================================
    # LABELS
    # =========================================================================
    
    def _draw_room_labels(self, c, rooms: List[Room], scale: float, ox: float, oy: float):
        """Draw room names and dimensions"""
        for room in rooms:
            cx, cy = room.center_mm
            sx = cx * scale + ox
            sy = cy * scale + oy
            
            # Get abbreviated name
            abbrev = ROOM_ABBREVIATIONS.get(room.room_type, room.name.upper())
            
            # Room name
            c.setFont("Helvetica-Bold", 9)
            c.setFillColor(colors.black)
            c.drawCentredString(sx, sy + 3*mm, abbrev)
            
            # Dimensions (width x depth in mm)
            dim_text = f"{int(room.width * 1000)} x {int(room.depth * 1000)}"
            c.setFont("Helvetica", 7)
            c.drawCentredString(sx, sy - 4*mm, dim_text)
    
    # =========================================================================
    # DIMENSIONS
    # =========================================================================
    
    def _draw_dimensions(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw dimension chains"""
        min_x, min_y, max_x, max_y = bounds
        
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        c.setLineWidth(LINE_WEIGHT_FINE)
        c.setFont("Helvetica", 6)
        
        # Collect unique X coordinates
        x_coords = sorted(set([r.x for r in rooms] + [r.x + r.width for r in rooms]))
        y_coords = sorted(set([r.y for r in rooms] + [r.y + r.depth for r in rooms]))
        
        dim_offset = 15 * mm
        
        # Bottom dimension chain
        y_pos = min_y * 1000 * scale + oy - dim_offset
        for i in range(len(x_coords) - 1):
            x1 = x_coords[i] * 1000 * scale + ox
            x2 = x_coords[i + 1] * 1000 * scale + ox
            dim = int((x_coords[i + 1] - x_coords[i]) * 1000)
            
            # Extension lines
            c.line(x1, y_pos - 3*mm, x1, y_pos + 3*mm)
            c.line(x2, y_pos - 3*mm, x2, y_pos + 3*mm)
            # Dimension line
            c.line(x1, y_pos, x2, y_pos)
            # Text
            c.drawCentredString((x1 + x2) / 2, y_pos + 1*mm, str(dim))
        
        # Total width
        total_y = y_pos - 8 * mm
        x1 = min_x * 1000 * scale + ox
        x2 = max_x * 1000 * scale + ox
        c.line(x1, total_y - 3*mm, x1, total_y + 3*mm)
        c.line(x2, total_y - 3*mm, x2, total_y + 3*mm)
        c.line(x1, total_y, x2, total_y)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString((x1 + x2) / 2, total_y + 1.5*mm, str(int((max_x - min_x) * 1000)))
        
        # Left dimension chain
        x_pos = min_x * 1000 * scale + ox - dim_offset
        c.setFont("Helvetica", 6)
        for i in range(len(y_coords) - 1):
            y1 = y_coords[i] * 1000 * scale + oy
            y2 = y_coords[i + 1] * 1000 * scale + oy
            dim = int((y_coords[i + 1] - y_coords[i]) * 1000)
            
            c.line(x_pos - 3*mm, y1, x_pos + 3*mm, y1)
            c.line(x_pos - 3*mm, y2, x_pos + 3*mm, y2)
            c.line(x_pos, y1, x_pos, y2)
            
            c.saveState()
            c.translate(x_pos - 2*mm, (y1 + y2) / 2)
            c.rotate(90)
            c.drawCentredString(0, 0, str(dim))
            c.restoreState()
        
        # Total depth
        total_x = x_pos - 8 * mm
        y1 = min_y * 1000 * scale + oy
        y2 = max_y * 1000 * scale + oy
        c.line(total_x - 3*mm, y1, total_x + 3*mm, y1)
        c.line(total_x - 3*mm, y2, total_x + 3*mm, y2)
        c.line(total_x, y1, total_x, y2)
        c.setFont("Helvetica-Bold", 7)
        c.saveState()
        c.translate(total_x - 2*mm, (y1 + y2) / 2)
        c.rotate(90)
        c.drawCentredString(0, 0, str(int((max_y - min_y) * 1000)))
        c.restoreState()
    
    # =========================================================================
    # TITLE BLOCK
    # =========================================================================
    
    def _draw_title_block(self, c, layout_data: Dict, project_name: str, 
                          project_details: Dict, page_width: float, page_height: float):
        """Draw professional title block"""
        block_height = 30 * mm
        block_width = 180 * mm
        
        x = page_width - block_width - self.margin
        y = self.margin
        
        # Background
        c.setFillColor(colors.Color(0.98, 0.98, 0.98))
        c.rect(x, y, block_width, block_height, fill=1, stroke=0)
        
        # Border
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.5 * mm)
        c.rect(x, y, block_width, block_height, fill=0, stroke=1)
        
        # Dividers
        c.setLineWidth(0.25 * mm)
        c.line(x + 90*mm, y, x + 90*mm, y + block_height)
        c.line(x + 90*mm, y + block_height/2, x + block_width, y + block_height/2)
        
        # Project name
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.black)
        c.drawString(x + 5*mm, y + block_height - 10*mm, project_name)
        
        # Design name
        design_name = layout_data.get('design_name', 'Floor Plan')
        c.setFont("Helvetica", 9)
        c.drawString(x + 5*mm, y + block_height - 18*mm, design_name)
        
        # Location
        if project_details:
            location = f"{project_details.get('suburb', '')}, {project_details.get('state', '')} {project_details.get('postcode', '')}"
            c.drawString(x + 5*mm, y + block_height - 26*mm, location.strip(', '))
        
        # Summary
        summary = layout_data.get('summary', {})
        c.setFont("Helvetica", 8)
        info_x = x + 95*mm
        c.drawString(info_x, y + block_height - 8*mm, f"Total Area: {int(summary.get('total_area', 0))}m²")
        c.drawString(info_x, y + block_height - 14*mm, f"Bedrooms: {summary.get('bedroom_count', '-')}")
        c.drawString(info_x + 40*mm, y + block_height - 8*mm, f"Bathrooms: {summary.get('bathroom_count', '-')}")
        c.drawString(info_x + 40*mm, y + block_height - 14*mm, f"Garage: {summary.get('garage_spaces', '-')}")
        
        # Title
        c.setFont("Helvetica-Bold", 10)
        c.drawString(info_x, y + 8*mm, "FLOOR PLAN")
        c.setFont("Helvetica", 8)
        c.drawString(info_x, y + 3*mm, "Ground Floor")
        
        # Date and scale
        c.drawString(info_x + 50*mm, y + 8*mm, f"Date: {datetime.now().strftime('%d/%m/%Y')}")
        c.drawString(info_x + 50*mm, y + 3*mm, "Scale: 1:100")
        
        # Logo
        c.setFont("Helvetica-Bold", 14)
        c.setFillColor(colors.Color(0.2, 0.4, 0.8))
        c.drawString(x + 5*mm, y + 5*mm, "LayoutAI")
        c.setFont("Helvetica", 6)
        c.setFillColor(colors.black)
        c.drawString(x + 5*mm, y + 1*mm, "AI-Powered Design")
    
    def _draw_north_arrow(self, c, page_width: float, page_height: float):
        """Draw north arrow"""
        cx = page_width - self.margin - 25*mm
        cy = page_height - self.margin - 25*mm
        
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        c.setLineWidth(0.5 * mm)
        
        # Arrow
        arrow_len = 12 * mm
        c.line(cx, cy - arrow_len/2, cx, cy + arrow_len/2)
        c.line(cx - 3*mm, cy + arrow_len/2 - 4*mm, cx, cy + arrow_len/2)
        c.line(cx + 3*mm, cy + arrow_len/2 - 4*mm, cx, cy + arrow_len/2)
        
        # Fill arrowhead
        path = c.beginPath()
        path.moveTo(cx, cy + arrow_len/2)
        path.lineTo(cx - 3*mm, cy + arrow_len/2 - 4*mm)
        path.lineTo(cx + 3*mm, cy + arrow_len/2 - 4*mm)
        path.close()
        c.drawPath(path, fill=1, stroke=0)
        
        # N label
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(cx, cy + arrow_len/2 + 3*mm, "N")
    
    def _draw_scale_bar(self, c, scale: float, page_width: float, page_height: float):
        """Draw scale bar"""
        x = self.margin + 10*mm
        y = self.margin + 5*mm
        
        # 5m bar
        bar_length = 5000 * scale  # 5 meters
        
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        c.setLineWidth(0.5 * mm)
        
        # Bar outline
        c.rect(x, y, bar_length, 3*mm, fill=0, stroke=1)
        
        # Alternating fills
        segment = bar_length / 5
        for i in range(5):
            if i % 2 == 0:
                c.rect(x + i * segment, y, segment, 3*mm, fill=1, stroke=0)
        
        # Labels
        c.setFont("Helvetica", 7)
        c.drawCentredString(x, y - 2*mm, "0")
        c.drawCentredString(x + bar_length, y - 2*mm, "5m")
        
        c.setFont("Helvetica", 8)
        c.drawString(x, y + 5*mm, "SCALE 1:100")


# =============================================================================
# PUBLIC API
# =============================================================================

def generate_cad_floor_plan_pdf(layout_data: Dict, project_name: str = "Floor Plan",
                                 project_details: Dict = None) -> bytes:
    """
    Generate a professional CAD-quality floor plan PDF.
    
    Args:
        layout_data: Floor plan data with rooms array
        project_name: Name for title block
        project_details: Optional dict with suburb, state, etc.
    
    Returns:
        PDF file as bytes
    """
    generator = ProfessionalCADGenerator()
    return generator.generate(layout_data, project_name, project_details or {})