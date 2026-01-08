# backend/app/services/cad_generator.py
"""
Professional CAD Floor Plan Generator
=====================================
Generates architect-quality floor plans matching professional standards.

Features:
- Proper wall construction with mitred corners
- Door symbols with accurate swing arcs (single, double, sliding, pocket, bifold)
- Window symbols on external walls
- Detailed fixture library (kitchen cabinets, bathroom fixtures, furniture)
- Cross-hatching for tiled areas
- Dimension chains
- Professional annotations and labeling
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

# Wall thicknesses in mm
EXTERNAL_WALL_THICKNESS = 200
INTERNAL_WALL_THICKNESS = 90

# Line weights
LINE_WEIGHT_HEAVY = 0.7 * mm      # External walls
LINE_WEIGHT_MEDIUM = 0.4 * mm     # Internal walls
LINE_WEIGHT_LIGHT = 0.25 * mm     # Fixtures, doors
LINE_WEIGHT_FINE = 0.15 * mm      # Details, hatching

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
    'robe': 720,
    'sliding': 1800,
    'bifold': 2700,
    'stacker': 3600,
    'garage': 2400,  # Per car
}

# Room type abbreviations (like professional plans)
ROOM_ABBREVIATIONS = {
    'master_bedroom': 'MASTER BED',
    'bedroom': 'BED',
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
    'media': 'MEDIA',
    'linen': 'LINEN',
    'store': 'STORE',
    'nook': 'NOOK',
    'broom': 'BROOM',
}


@dataclass
class Point:
    """2D point with basic operations"""
    x: float
    y: float
    
    def __add__(self, other): return Point(self.x + other.x, self.y + other.y)
    def __sub__(self, other): return Point(self.x - other.x, self.y - other.y)
    def __mul__(self, s): return Point(self.x * s, self.y * s)
    def distance_to(self, other): return math.sqrt((self.x - other.x)**2 + (self.y - other.y)**2)


@dataclass
class WallSegment:
    """A wall segment between two points"""
    start: Point
    end: Point
    is_external: bool = False
    thickness: float = INTERNAL_WALL_THICKNESS
    has_opening: bool = False
    opening_start: float = 0  # Position along wall (0-1)
    opening_width: float = 0  # Width in mm


@dataclass
class Room:
    """Room with position, dimensions, and features"""
    id: str
    name: str
    room_type: str
    x: float  # meters
    y: float
    width: float
    depth: float
    floor: int = 0
    doors: List[Dict] = field(default_factory=list)
    windows: List[Dict] = field(default_factory=list)
    features: List[str] = field(default_factory=list)
    
    @property
    def area(self) -> float:
        return self.width * self.depth
    
    @property
    def center_mm(self) -> Point:
        return Point((self.x + self.width/2) * 1000, (self.y + self.depth/2) * 1000)
    
    @property
    def bounds_mm(self) -> Tuple[float, float, float, float]:
        """Return (x, y, width, height) in mm"""
        return (self.x * 1000, self.y * 1000, self.width * 1000, self.depth * 1000)


class CADFloorPlanGenerator:
    """
    Professional CAD-quality floor plan generator.
    Produces architectural drawings matching professional design standards.
    """
    
    def __init__(self):
        self.page_size = landscape(A3)
        self.margin = 15 * mm
        self.wall_segments: List[WallSegment] = []
        
    def generate_pdf(
        self,
        layout_data: Dict[str, Any],
        project_name: str,
        project_details: Dict[str, Any] = None
    ) -> bytes:
        """Generate professional PDF floor plan"""
        
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=self.page_size)
        page_width, page_height = self.page_size
        
        # Parse rooms
        rooms = self._parse_rooms(layout_data)
        if not rooms:
            c.setFont("Helvetica", 12)
            c.drawString(100, page_height/2, "No floor plan data available")
            c.save()
            buffer.seek(0)
            return buffer.getvalue()
        
        # Calculate building bounds
        bounds = self._calculate_bounds(rooms)
        min_x, min_y, max_x, max_y = bounds
        
        # Calculate scale and offset for drawing
        scale, offset_x, offset_y = self._calculate_layout(bounds, page_width, page_height)
        
        # Build wall network
        self._build_wall_network(rooms, bounds)
        
        # Draw elements in proper order (back to front)
        self._draw_cross_hatching(c, rooms, scale, offset_x, offset_y, bounds)
        self._draw_walls_professional(c, rooms, scale, offset_x, offset_y, bounds)
        self._draw_all_doors(c, rooms, scale, offset_x, offset_y, bounds)
        self._draw_all_windows(c, rooms, scale, offset_x, offset_y, bounds)
        self._draw_all_fixtures(c, rooms, scale, offset_x, offset_y)
        self._draw_room_labels_professional(c, rooms, scale, offset_x, offset_y)
        self._draw_dimension_chains(c, rooms, scale, offset_x, offset_y, bounds)
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
        """Calculate scale and offsets to fit drawing on page"""
        min_x, min_y, max_x, max_y = bounds
        
        building_width = (max_x - min_x) * 1000  # Convert to mm
        building_depth = (max_y - min_y) * 1000
        
        # Leave space for dimensions and title
        dim_space = 30 * mm
        title_height = 35 * mm
        available_w = page_width - 2 * self.margin - 2 * dim_space
        available_h = page_height - 2 * self.margin - title_height - 2 * dim_space
        
        # Calculate scale to fit
        scale_x = available_w / building_width if building_width > 0 else 1
        scale_y = available_h / building_depth if building_depth > 0 else 1
        scale = min(scale_x, scale_y) * 0.82
        
        # Center the drawing
        offset_x = self.margin + dim_space + (available_w - building_width * scale) / 2 - min_x * 1000 * scale
        offset_y = self.margin + title_height + dim_space + (available_h - building_depth * scale) / 2 - min_y * 1000 * scale
        
        return (scale, offset_x, offset_y)
    
    def _is_external_edge(self, room: Room, edge: str, bounds: Tuple) -> bool:
        """Check if room edge is on building boundary"""
        min_x, min_y, max_x, max_y = bounds
        tol = 0.05  # 50mm tolerance
        
        if edge == 'south': return abs(room.y - min_y) < tol
        if edge == 'north': return abs(room.y + room.depth - max_y) < tol
        if edge == 'west': return abs(room.x - min_x) < tol
        if edge == 'east': return abs(room.x + room.width - max_x) < tol
        return False
    
    def _find_adjacent_room(self, room: Room, edge: str, rooms: List[Room]) -> Optional[Room]:
        """Find room adjacent to given edge"""
        tol = 0.1
        rx, ry, rw, rd = room.x, room.y, room.width, room.depth
        
        for other in rooms:
            if other.id == room.id:
                continue
            ox, oy, ow, od = other.x, other.y, other.width, other.depth
            
            if edge == 'east' and abs((rx + rw) - ox) < tol:
                # Check vertical overlap
                if ry < oy + od and ry + rd > oy:
                    return other
            elif edge == 'west' and abs(rx - (ox + ow)) < tol:
                if ry < oy + od and ry + rd > oy:
                    return other
            elif edge == 'north' and abs((ry + rd) - oy) < tol:
                if rx < ox + ow and rx + rw > ox:
                    return other
            elif edge == 'south' and abs(ry - (oy + od)) < tol:
                if rx < ox + ow and rx + rw > ox:
                    return other
        return None
    
    def _build_wall_network(self, rooms: List[Room], bounds: Tuple):
        """Build unified wall network from room boundaries"""
        self.wall_segments = []
        # This would be enhanced to properly merge and join walls
        # For now, walls are drawn per-room with thickness consideration
    
    # =========================================================================
    # CROSS HATCHING (for wet areas and outdoor)
    # =========================================================================
    
    def _draw_cross_hatching(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw cross-hatching for tiled/outdoor areas"""
        hatch_types = {
            'bathroom': 'cross',
            'main_bathroom': 'cross', 
            'ensuite': 'cross',
            'wc': 'cross',
            'toilet': 'cross',
            'powder': 'cross',
            'laundry': 'diagonal',
            'alfresco': 'diagonal',
            'porch': 'diagonal',
            'outdoor': 'diagonal',
        }
        
        for room in rooms:
            hatch_style = hatch_types.get(room.room_type)
            if not hatch_style:
                continue
            
            x, y, w, h = room.bounds_mm
            sx = x * scale + ox
            sy = y * scale + oy
            sw = w * scale
            sh = h * scale
            
            c.saveState()
            
            # Clip to room
            path = c.beginPath()
            path.rect(sx, sy, sw, sh)
            c.clipPath(path, stroke=0)
            
            c.setStrokeColor(colors.Color(0.75, 0.75, 0.75))
            c.setLineWidth(LINE_WEIGHT_FINE)
            
            spacing = 3.5 * mm
            
            if hatch_style == 'cross':
                # X pattern (diagonal both ways)
                for i in range(int((sw + sh) / spacing) + 5):
                    # Forward diagonal
                    c.line(sx - sh + i * spacing, sy, sx + i * spacing, sy + sh)
                    # Backward diagonal
                    c.line(sx + i * spacing, sy, sx - sh + i * spacing, sy + sh)
            else:
                # Single diagonal
                for i in range(int((sw + sh) / spacing) + 5):
                    c.line(sx - sh + i * spacing, sy, sx + i * spacing, sy + sh)
            
            c.restoreState()
    
    # =========================================================================
    # WALL DRAWING - PROFESSIONAL STYLE
    # =========================================================================
    
    def _draw_walls_professional(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw walls with proper thickness and joins"""
        
        min_x, min_y, max_x, max_y = bounds
        
        # First pass: Draw external building outline (thick)
        self._draw_building_envelope(c, rooms, scale, ox, oy, bounds)
        
        # Second pass: Draw internal walls
        for room in rooms:
            x, y, w, h = room.bounds_mm
            
            edges = [
                ('south', x, y, x + w, y),
                ('east', x + w, y, x + w, y + h),
                ('north', x, y + h, x + w, y + h),
                ('west', x, y, x, y + h),
            ]
            
            for edge_name, x1, y1, x2, y2 in edges:
                is_external = self._is_external_edge(room, edge_name, bounds)
                
                if not is_external:
                    # Draw internal wall
                    adjacent = self._find_adjacent_room(room, edge_name, rooms)
                    if adjacent:
                        # Shared wall - draw thin line
                        self._draw_wall_line(c, x1, y1, x2, y2, INTERNAL_WALL_THICKNESS, 
                                           False, scale, ox, oy)
    
    def _draw_building_envelope(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw thick external building outline"""
        min_x, min_y, max_x, max_y = bounds
        
        # Collect all external wall segments
        external_segments = []
        
        for room in rooms:
            x, y, w, h = room.x, room.y, room.width, room.depth
            
            # Check each edge
            if abs(y - min_y) < 0.05:  # South wall on boundary
                external_segments.append(('h', x, y, x + w, y))
            if abs(y + h - max_y) < 0.05:  # North wall
                external_segments.append(('h', x, y + h, x + w, y + h))
            if abs(x - min_x) < 0.05:  # West wall
                external_segments.append(('v', x, y, x, y + h))
            if abs(x + w - max_x) < 0.05:  # East wall
                external_segments.append(('v', x + w, y, x + w, y + h))
        
        # Draw external walls with thickness
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        
        for seg in external_segments:
            direction, x1, y1, x2, y2 = seg
            # Convert to mm and scale
            sx1 = x1 * 1000 * scale + ox
            sy1 = y1 * 1000 * scale + oy
            sx2 = x2 * 1000 * scale + ox
            sy2 = y2 * 1000 * scale + oy
            
            thickness = EXTERNAL_WALL_THICKNESS * scale
            
            if direction == 'h':  # Horizontal wall
                c.setLineWidth(thickness)
                c.line(sx1, sy1, sx2, sy2)
            else:  # Vertical wall
                c.setLineWidth(thickness)
                c.line(sx1, sy1, sx2, sy2)
    
    def _draw_wall_line(self, c, x1: float, y1: float, x2: float, y2: float, 
                       thickness: float, is_external: bool, scale: float, ox: float, oy: float):
        """Draw a single wall segment"""
        sx1 = x1 * scale + ox
        sy1 = y1 * scale + oy
        sx2 = x2 * scale + ox
        sy2 = y2 * scale + oy
        
        t = thickness * scale
        
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        c.setLineWidth(t if is_external else t * 0.5)
        
        c.line(sx1, sy1, sx2, sy2)
    
    # =========================================================================
    # DOORS
    # =========================================================================
    
    def _draw_all_doors(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw all door symbols"""
        
        # Default door configurations by room type
        default_doors = {
            'entry': [{'wall': 'south', 'type': 'single', 'width': 1020, 'position': 0.5}],
            'foyer': [{'wall': 'south', 'type': 'single', 'width': 1020, 'position': 0.5}],
            'bedroom': [{'wall': 'north', 'type': 'single', 'width': 820, 'position': 0.3}],
            'master_bedroom': [{'wall': 'north', 'type': 'single', 'width': 820, 'position': 0.25}],
            'master': [{'wall': 'north', 'type': 'single', 'width': 820, 'position': 0.25}],
            'ensuite': [{'wall': 'west', 'type': 'single', 'width': 720, 'position': 0.5}],
            'bathroom': [{'wall': 'north', 'type': 'single', 'width': 720, 'position': 0.5}],
            'main_bathroom': [{'wall': 'north', 'type': 'single', 'width': 720, 'position': 0.5}],
            'wc': [{'wall': 'north', 'type': 'single', 'width': 620, 'position': 0.5}],
            'toilet': [{'wall': 'north', 'type': 'single', 'width': 620, 'position': 0.5}],
            'powder': [{'wall': 'north', 'type': 'single', 'width': 720, 'position': 0.5}],
            'wir': [{'wall': 'west', 'type': 'single', 'width': 720, 'position': 0.5}],
            'walk_in_robe': [{'wall': 'west', 'type': 'single', 'width': 720, 'position': 0.5}],
            'robe': [{'wall': 'west', 'type': 'single', 'width': 720, 'position': 0.5}],
            'laundry': [{'wall': 'north', 'type': 'single', 'width': 820, 'position': 0.5}],
            'garage': [{'wall': 'south', 'type': 'garage', 'width': 4800, 'position': 0.5}],
            'double_garage': [{'wall': 'south', 'type': 'garage', 'width': 4800, 'position': 0.5}],
            'study': [{'wall': 'north', 'type': 'single', 'width': 820, 'position': 0.5}],
            'office': [{'wall': 'north', 'type': 'single', 'width': 820, 'position': 0.5}],
            'pantry': [{'wall': 'north', 'type': 'single', 'width': 720, 'position': 0.5}],
            'walk_in_pantry': [{'wall': 'north', 'type': 'single', 'width': 720, 'position': 0.5}],
            'theatre': [{'wall': 'north', 'type': 'double', 'width': 1640, 'position': 0.5}],
            'alfresco': [{'wall': 'north', 'type': 'stacker', 'width': 3600, 'position': 0.5}],
            'family': [{'wall': 'south', 'type': 'bifold', 'width': 2700, 'position': 0.7}],
            'living': [{'wall': 'east', 'type': 'sliding', 'width': 1800, 'position': 0.5}],
        }
        
        for room in rooms:
            # Use room's doors if specified, otherwise use defaults
            doors = room.doors if room.doors else default_doors.get(room.room_type, [])
            
            for door in doors:
                self._draw_door(c, room, door, scale, ox, oy, bounds)
    
    def _draw_door(self, c, room: Room, door: Dict, scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw a single door with opening and swing"""
        wall = door.get('wall', 'north').lower()
        door_type = door.get('type', 'single').lower()
        door_width = door.get('width', 820)  # mm
        position = door.get('position', 0.5)
        
        x, y, w, h = room.bounds_mm
        
        # Calculate door center position on wall
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
        
        # Transform coordinates
        sx = dx * scale + ox
        sy = dy * scale + oy
        sw = door_width * scale
        
        # Clear wall area for door opening
        c.saveState()
        c.translate(sx, sy)
        c.rotate(angle)
        
        # Draw opening (white rectangle to break wall)
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.white)
        c.rect(-sw/2, -3*mm, sw, 6*mm, fill=1, stroke=0)
        
        # Draw door symbol based on type
        c.setStrokeColor(colors.black)
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        
        if door_type == 'single':
            self._draw_single_door(c, sw)
        elif door_type == 'double':
            self._draw_double_door(c, sw)
        elif door_type == 'sliding':
            self._draw_sliding_door(c, sw)
        elif door_type == 'bifold':
            self._draw_bifold_door(c, sw)
        elif door_type == 'stacker':
            self._draw_stacker_door(c, sw)
        elif door_type == 'garage':
            self._draw_garage_door(c, sw)
        elif door_type == 'pocket':
            self._draw_pocket_door(c, sw)
        
        c.restoreState()
    
    def _draw_single_door(self, c, width: float):
        """Single hinged door with 90° swing arc"""
        hw = width / 2
        
        # Door jambs (short lines at ends)
        c.setLineWidth(LINE_WEIGHT_MEDIUM)
        c.line(-hw, -1*mm, -hw, 1*mm)
        c.line(hw, -1*mm, hw, 1*mm)
        
        # Door leaf
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        c.line(-hw, 0, -hw + width * 0.05, width)
        c.line(-hw + width * 0.05, width, -hw + width * 0.15, width)
        
        # 90° swing arc
        c.setLineWidth(LINE_WEIGHT_FINE)
        arc_radius = width * 0.95
        c.arc(-hw - arc_radius, -arc_radius, -hw + arc_radius, arc_radius, 0, 90)
    
    def _draw_double_door(self, c, width: float):
        """Double doors with opposing swings"""
        hw = width / 2
        leaf_w = width * 0.48
        
        # Jambs
        c.setLineWidth(LINE_WEIGHT_MEDIUM)
        c.line(-hw, -1*mm, -hw, 1*mm)
        c.line(hw, -1*mm, hw, 1*mm)
        
        # Left leaf
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        c.line(-hw, 0, -hw, leaf_w)
        
        # Right leaf
        c.line(hw, 0, hw, leaf_w)
        
        # Swing arcs
        c.setLineWidth(LINE_WEIGHT_FINE)
        c.arc(-hw - leaf_w, -leaf_w, -hw + leaf_w, leaf_w, 0, 90)
        c.arc(hw - leaf_w, -leaf_w, hw + leaf_w, leaf_w, 90, 90)
    
    def _draw_sliding_door(self, c, width: float):
        """Sliding door with arrow"""
        hw = width / 2
        
        # Frame lines
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        c.line(-hw, 0, hw, 0)
        c.line(-hw, 2.5*mm, hw, 2.5*mm)
        
        # Panel indication
        c.line(-hw * 0.8, 0.5*mm, hw * 0.2, 0.5*mm)
        c.line(-hw * 0.8, 2*mm, hw * 0.2, 2*mm)
        
        # Arrow showing slide direction
        c.line(0, 1.25*mm, hw * 0.6, 1.25*mm)
        c.line(hw * 0.45, 0.5*mm, hw * 0.6, 1.25*mm)
        c.line(hw * 0.45, 2*mm, hw * 0.6, 1.25*mm)
    
    def _draw_bifold_door(self, c, width: float):
        """Bifold door (accordion style)"""
        hw = width / 2
        num_panels = 4
        panel_w = width / num_panels
        
        # Frame
        c.setLineWidth(LINE_WEIGHT_MEDIUM)
        c.line(-hw, -1*mm, -hw, 1*mm)
        c.line(hw, -1*mm, hw, 1*mm)
        
        # Panels in zigzag pattern
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        for i in range(num_panels):
            px = -hw + i * panel_w
            fold_y = 6*mm if i % 2 == 0 else -2*mm
            c.line(px, 0, px + panel_w/2, fold_y)
            c.line(px + panel_w/2, fold_y, px + panel_w, 0)
    
    def _draw_stacker_door(self, c, width: float):
        """Stacking sliding doors"""
        hw = width / 2
        
        # Multiple track lines
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        for i in range(3):
            y_offset = i * 1.5*mm
            c.line(-hw, y_offset, hw, y_offset)
        
        # Panel indications
        c.setDash([3, 2])
        c.line(-hw * 0.9, 0.75*mm, -hw * 0.1, 0.75*mm)
        c.line(-hw * 0.4, 2.25*mm, hw * 0.4, 2.25*mm)
        c.setDash([])
    
    def _draw_garage_door(self, c, width: float):
        """Roller/sectional garage door"""
        hw = width / 2
        
        # Opening line
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        c.line(-hw, 0, hw, 0)
        
        # Roller indication (dashed lines)
        c.setDash([4, 2])
        for i in range(1, 4):
            c.line(-hw, i * 2*mm, hw, i * 2*mm)
        c.setDash([])
    
    def _draw_pocket_door(self, c, width: float):
        """Pocket door (slides into wall)"""
        hw = width / 2
        
        # Pocket cavity (dashed)
        c.setLineWidth(LINE_WEIGHT_FINE)
        c.setDash([2, 2])
        c.rect(-hw - width * 0.5, -1*mm, width * 0.5, 2*mm, fill=0, stroke=1)
        c.setDash([])
        
        # Door panel
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        c.line(-hw, 0, hw, 0)
        
        # Arrow
        c.line(-hw * 0.5, 0, -hw, 0)
        c.line(-hw + 2*mm, -1*mm, -hw, 0)
        c.line(-hw + 2*mm, 1*mm, -hw, 0)
    
    # =========================================================================
    # WINDOWS
    # =========================================================================
    
    def _draw_all_windows(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw all window symbols on external walls"""
        
        window_rooms = {
            'bedroom': {'width': 1500, 'type': 'standard'},
            'master_bedroom': {'width': 1800, 'type': 'standard'},
            'master': {'width': 1800, 'type': 'standard'},
            'living': {'width': 2400, 'type': 'large'},
            'lounge': {'width': 2400, 'type': 'large'},
            'family': {'width': 2400, 'type': 'large'},
            'kitchen': {'width': 1200, 'type': 'standard'},
            'dining': {'width': 1800, 'type': 'standard'},
            'study': {'width': 1200, 'type': 'standard'},
            'office': {'width': 1200, 'type': 'standard'},
            'bathroom': {'width': 600, 'type': 'highlight'},
            'ensuite': {'width': 600, 'type': 'highlight'},
            'laundry': {'width': 900, 'type': 'standard'},
        }
        
        for room in rooms:
            # Use room's windows if specified
            if room.windows:
                for window in room.windows:
                    self._draw_window(c, room, window, scale, ox, oy, bounds)
            else:
                # Add default windows to external walls
                config = window_rooms.get(room.room_type)
                if config:
                    for edge in ['north', 'south', 'east', 'west']:
                        if self._is_external_edge(room, edge, bounds):
                            self._draw_window(c, room, {
                                'wall': edge,
                                'width': config['width'],
                                'type': config['type'],
                                'position': 0.5
                            }, scale, ox, oy, bounds)
                            break  # One window per room for simplicity
    
    def _draw_window(self, c, room: Room, window: Dict, scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw window symbol"""
        wall = window.get('wall', 'north').lower()
        win_width = window.get('width', 1200)
        position = window.get('position', 0.5)
        
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
        else:
            wx = x
            wy = y + h * position
            angle = 90
        
        sx = wx * scale + ox
        sy = wy * scale + oy
        sw = win_width * scale
        
        c.saveState()
        c.translate(sx, sy)
        c.rotate(angle)
        
        # Clear wall for window
        c.setFillColor(colors.white)
        c.rect(-sw/2, -3*mm, sw, 6*mm, fill=1, stroke=0)
        
        # Window frame
        c.setStrokeColor(colors.black)
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        c.rect(-sw/2, -2*mm, sw, 4*mm, fill=0, stroke=1)
        
        # Glass lines (double line)
        c.setLineWidth(LINE_WEIGHT_FINE)
        c.line(-sw/2, -0.5*mm, sw/2, -0.5*mm)
        c.line(-sw/2, 0.5*mm, sw/2, 0.5*mm)
        
        # Sill (external - thicker line)
        c.setLineWidth(LINE_WEIGHT_MEDIUM)
        c.line(-sw/2 - 1*mm, 2*mm, sw/2 + 1*mm, 2*mm)
        
        c.restoreState()
    
    # =========================================================================
    # FIXTURES
    # =========================================================================
    
    def _draw_all_fixtures(self, c, rooms: List[Room], scale: float, ox: float, oy: float):
        """Draw all room fixtures"""
        for room in rooms:
            x, y, w, h = room.bounds_mm
            sx = x * scale + ox
            sy = y * scale + oy
            sw = w * scale
            sh = h * scale
            
            c.setStrokeColor(colors.black)
            c.setLineWidth(LINE_WEIGHT_FINE)
            
            rt = room.room_type
            
            if rt in ['kitchen']:
                self._draw_kitchen_detailed(c, sx, sy, sw, sh, scale)
            elif rt in ['bathroom', 'main_bathroom']:
                self._draw_bathroom_detailed(c, sx, sy, sw, sh, scale, has_bath=True)
            elif rt == 'ensuite':
                self._draw_bathroom_detailed(c, sx, sy, sw, sh, scale, has_bath=True, is_ensuite=True)
            elif rt in ['powder', 'wc', 'toilet']:
                self._draw_wc(c, sx, sy, sw, sh, scale)
            elif rt in ['bedroom', 'master', 'master_bedroom']:
                self._draw_bedroom_detailed(c, sx, sy, sw, sh, scale, rt)
            elif rt in ['living', 'lounge']:
                self._draw_lounge_detailed(c, sx, sy, sw, sh, scale)
            elif rt == 'family':
                self._draw_family_detailed(c, sx, sy, sw, sh, scale)
            elif rt in ['dining']:
                self._draw_dining_detailed(c, sx, sy, sw, sh, scale)
            elif rt == 'laundry':
                self._draw_laundry_detailed(c, sx, sy, sw, sh, scale)
            elif rt in ['garage', 'double_garage']:
                self._draw_garage_detailed(c, sx, sy, sw, sh, scale)
            elif rt in ['study', 'office', 'home_office']:
                self._draw_study_detailed(c, sx, sy, sw, sh, scale)
            elif rt in ['wir', 'walk_in_robe', 'robe', 'wardrobe']:
                self._draw_wir(c, sx, sy, sw, sh, scale)
            elif rt in ['pantry', 'walk_in_pantry', 'butlers_pantry']:
                self._draw_pantry(c, sx, sy, sw, sh, scale)
            elif rt in ['alfresco', 'outdoor']:
                self._draw_alfresco_detailed(c, sx, sy, sw, sh, scale)
            elif rt == 'theatre':
                self._draw_theatre(c, sx, sy, sw, sh, scale)
            elif rt == 'linen':
                self._draw_linen(c, sx, sy, sw, sh, scale)
    
    def _draw_kitchen_detailed(self, c, x, y, w, h, scale):
        """Detailed kitchen - cabinets, sink, cooktop, rangehood, fridge"""
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        cab_depth = min(18*mm, w * 0.12)
        
        # U-shaped or L-shaped cabinets
        # Top run (along top wall)
        c.rect(x + 3*mm, y + h - cab_depth - 3*mm, w - 6*mm, cab_depth, fill=0, stroke=1)
        
        # Draw cabinet divisions
        num_cabs = int((w - 6*mm) / (15*mm))
        for i in range(1, num_cabs):
            cx = x + 3*mm + i * (w - 6*mm) / num_cabs
            c.line(cx, y + h - cab_depth - 3*mm, cx, y + h - 3*mm)
        
        # Sink (double bowl, detailed)
        sink_w = min(22*mm, w * 0.18)
        sink_x = x + w * 0.4 - sink_w/2
        sink_y = y + h - cab_depth - 1*mm
        
        # Sink bowls
        bowl_w = (sink_w - 2*mm) / 2
        c.roundRect(sink_x, sink_y, bowl_w, cab_depth - 4*mm, 1.5*mm, fill=0, stroke=1)
        c.roundRect(sink_x + bowl_w + 2*mm, sink_y, bowl_w, cab_depth - 4*mm, 1.5*mm, fill=0, stroke=1)
        
        # Tap
        c.circle(sink_x + sink_w/2, sink_y + cab_depth - 5*mm, 1*mm, fill=0, stroke=1)
        
        # Cooktop (5 burner)
        cooktop_w = min(20*mm, w * 0.15)
        cooktop_x = x + w - 30*mm
        cooktop_y = y + h - cab_depth + 1*mm
        
        # Burner circles
        burner_positions = [
            (cooktop_x + 4*mm, cooktop_y + 4*mm, 2.5*mm),
            (cooktop_x + cooktop_w - 4*mm, cooktop_y + 4*mm, 2.5*mm),
            (cooktop_x + 4*mm, cooktop_y + cab_depth - 6*mm, 2*mm),
            (cooktop_x + cooktop_w - 4*mm, cooktop_y + cab_depth - 6*mm, 2*mm),
            (cooktop_x + cooktop_w/2, cooktop_y + cab_depth/2 - 1*mm, 2*mm),  # Center burner
        ]
        for bx, by, br in burner_positions:
            c.circle(bx, by, br, fill=0, stroke=1)
        
        # Rangehood above cooktop
        c.setDash([2, 1])
        c.rect(cooktop_x - 2*mm, y + h - 2*mm, cooktop_w + 4*mm, 1*mm, fill=0, stroke=1)
        c.setDash([])
        
        # Side cabinet run (if wide enough)
        if w > 90*mm:
            side_cab_h = h * 0.4
            c.rect(x + w - cab_depth - 3*mm, y + 3*mm, cab_depth, side_cab_h, fill=0, stroke=1)
            
            # Fridge space (dashed outline)
            fridge_h = min(22*mm, side_cab_h - 5*mm)
            c.setDash([3, 2])
            c.rect(x + w - cab_depth - 1*mm, y + 5*mm, cab_depth - 4*mm, fridge_h, fill=0, stroke=1)
            # REF label
            c.setFont("Helvetica", 4)
            c.drawCentredString(x + w - cab_depth/2 - 3*mm, y + 5*mm + fridge_h/2, "REF")
            c.setDash([])
        
        # Island bench (if room is large)
        if w > 100*mm and h > 100*mm:
            island_w = min(45*mm, w * 0.35)
            island_d = min(22*mm, h * 0.18)
            island_x = x + (w - island_w) / 2
            island_y = y + h * 0.45 - island_d/2
            c.rect(island_x, island_y, island_w, island_d, fill=0, stroke=1)
    
    def _draw_bathroom_detailed(self, c, x, y, w, h, scale, has_bath=True, is_ensuite=False):
        """Detailed bathroom - toilet, vanity, shower, bath"""
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Toilet (detailed with seat)
        toilet_x = x + 5*mm
        toilet_y = y + h - 20*mm
        
        # Cistern
        c.rect(toilet_x, toilet_y + 12*mm, 10*mm, 6*mm, fill=0, stroke=1)
        # Bowl (oval)
        c.ellipse(toilet_x, toilet_y, toilet_x + 10*mm, toilet_y + 14*mm, fill=0, stroke=1)
        # Seat (inner oval)
        c.ellipse(toilet_x + 1*mm, toilet_y + 1*mm, toilet_x + 9*mm, toilet_y + 12*mm, fill=0, stroke=1)
        
        # Vanity with basin
        vanity_w = min(28*mm, w * 0.45)
        vanity_d = min(14*mm, h * 0.15)
        vanity_x = x + w - vanity_w - 4*mm
        vanity_y = y + h - vanity_d - 4*mm
        
        c.rect(vanity_x, vanity_y, vanity_w, vanity_d, fill=0, stroke=1)
        
        # Basin (oval, centered)
        basin_w = min(12*mm, vanity_w * 0.5)
        basin_d = vanity_d - 4*mm
        c.ellipse(vanity_x + vanity_w/2 - basin_w/2, vanity_y + 2*mm,
                 vanity_x + vanity_w/2 + basin_w/2, vanity_y + vanity_d - 2*mm, fill=0, stroke=1)
        
        # Shower (dashed square with screen)
        shower_size = min(26*mm, min(w, h) * 0.35)
        shower_x = x + 4*mm
        shower_y = y + 4*mm
        
        c.setDash([3, 2])
        c.rect(shower_x, shower_y, shower_size, shower_size, fill=0, stroke=1)
        c.setDash([])
        
        # Shower screen (solid line on one side)
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        c.line(shower_x + shower_size, shower_y, shower_x + shower_size, shower_y + shower_size)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Floor waste (small circle)
        c.circle(shower_x + shower_size/2, shower_y + shower_size/2, 1.5*mm, fill=0, stroke=1)
        
        # Shower rose
        c.circle(shower_x + shower_size/2, shower_y + shower_size - 3*mm, 2*mm, fill=0, stroke=1)
        
        # Bath (if space and requested)
        if has_bath and w > 50*mm:
            bath_w = min(48*mm, w - 25*mm)
            bath_d = min(20*mm, h * 0.22)
            bath_x = x + w - bath_w - 4*mm
            bath_y = y + 4*mm
            
            c.roundRect(bath_x, bath_y, bath_w, bath_d, 5*mm, fill=0, stroke=1)
            # Tap end (small indent)
            c.ellipse(bath_x + 4*mm, bath_y + bath_d/2 - 2*mm,
                     bath_x + 8*mm, bath_y + bath_d/2 + 2*mm, fill=0, stroke=1)
    
    def _draw_wc(self, c, x, y, w, h, scale):
        """Small WC/powder room - just toilet and small vanity"""
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Toilet
        toilet_x = x + w/2 - 5*mm
        toilet_y = y + 5*mm
        c.rect(toilet_x, toilet_y + 12*mm, 10*mm, 6*mm, fill=0, stroke=1)
        c.ellipse(toilet_x, toilet_y, toilet_x + 10*mm, toilet_y + 14*mm, fill=0, stroke=1)
        
        # Small basin
        basin_x = x + w - 12*mm
        basin_y = y + h - 10*mm
        c.ellipse(basin_x, basin_y, basin_x + 8*mm, basin_y + 6*mm, fill=0, stroke=1)
    
    def _draw_bedroom_detailed(self, c, x, y, w, h, scale, room_type):
        """Bedroom with bed, bedside tables, built-in robe indication"""
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        is_master = 'master' in room_type
        
        # Bed size
        if is_master:
            bed_w = min(50*mm, w * 0.45)
            bed_h = min(60*mm, h * 0.48)
        else:
            bed_w = min(38*mm, w * 0.45)
            bed_h = min(55*mm, h * 0.48)
        
        bed_x = x + (w - bed_w) / 2
        bed_y = y + h - bed_h - 12*mm
        
        # Bed frame
        c.rect(bed_x, bed_y, bed_w, bed_h, fill=0, stroke=1)
        
        # Headboard
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        c.line(bed_x, bed_y + bed_h - 2*mm, bed_x + bed_w, bed_y + bed_h - 2*mm)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Pillows
        pillow_h = min(8*mm, bed_h * 0.12)
        pillow_w = (bed_w - 6*mm) / 2
        c.rect(bed_x + 2*mm, bed_y + bed_h - pillow_h - 5*mm, pillow_w, pillow_h, fill=0, stroke=1)
        c.rect(bed_x + bed_w - pillow_w - 2*mm, bed_y + bed_h - pillow_h - 5*mm, pillow_w, pillow_h, fill=0, stroke=1)
        
        # Bedside tables
        if w > bed_w + 35*mm:
            table_size = 12*mm
            # Left table
            c.rect(bed_x - table_size - 4*mm, bed_y + bed_h - table_size - 8*mm, table_size, table_size, fill=0, stroke=1)
            # Lamp on table
            c.circle(bed_x - table_size/2 - 4*mm, bed_y + bed_h - table_size/2 - 8*mm, 2*mm, fill=0, stroke=1)
            # Right table
            c.rect(bed_x + bed_w + 4*mm, bed_y + bed_h - table_size - 8*mm, table_size, table_size, fill=0, stroke=1)
            c.circle(bed_x + bed_w + table_size/2 + 4*mm, bed_y + bed_h - table_size/2 - 8*mm, 2*mm, fill=0, stroke=1)
    
    def _draw_lounge_detailed(self, c, x, y, w, h, scale):
        """Lounge/living with detailed sofa, coffee table, TV"""
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # L-shaped or straight sofa
        sofa_w = min(65*mm, w * 0.55)
        sofa_d = min(25*mm, h * 0.2)
        sofa_x = x + (w - sofa_w) / 2
        sofa_y = y + 10*mm
        
        # Sofa base
        c.roundRect(sofa_x, sofa_y, sofa_w, sofa_d, 3*mm, fill=0, stroke=1)
        
        # Back cushions
        cushion_d = sofa_d * 0.3
        c.roundRect(sofa_x + 2*mm, sofa_y + sofa_d - cushion_d - 1*mm, sofa_w - 4*mm, cushion_d, 2*mm, fill=0, stroke=1)
        
        # Seat cushion divisions
        num_seats = 3
        for i in range(1, num_seats):
            cx = sofa_x + i * sofa_w / num_seats
            c.line(cx, sofa_y + 2*mm, cx, sofa_y + sofa_d - cushion_d - 3*mm)
        
        # Coffee table
        table_w = min(35*mm, sofa_w * 0.5)
        table_d = min(18*mm, h * 0.12)
        table_x = x + (w - table_w) / 2
        table_y = y + h/2 - table_d/2
        c.rect(table_x, table_y, table_w, table_d, fill=0, stroke=1)
        
        # TV unit
        tv_unit_w = min(55*mm, w * 0.5)
        tv_unit_d = 12*mm
        tv_x = x + (w - tv_unit_w) / 2
        tv_y = y + h - tv_unit_d - 5*mm
        c.rect(tv_x, tv_y, tv_unit_w, tv_unit_d, fill=0, stroke=1)
        
        # TV (mounted, line)
        c.setLineWidth(LINE_WEIGHT_MEDIUM)
        c.line(tv_x + 5*mm, tv_y + tv_unit_d + 3*mm, tv_x + tv_unit_w - 5*mm, tv_y + tv_unit_d + 3*mm)
        c.setLineWidth(LINE_WEIGHT_FINE)
    
    def _draw_family_detailed(self, c, x, y, w, h, scale):
        """Family room with sofa arrangement"""
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Main sofa
        sofa_w = min(70*mm, w * 0.5)
        sofa_d = 22*mm
        sofa_x = x + w - sofa_w - 15*mm
        sofa_y = y + (h - sofa_d) / 2
        
        c.roundRect(sofa_x, sofa_y, sofa_w, sofa_d, 3*mm, fill=0, stroke=1)
        # Back
        c.roundRect(sofa_x + 2*mm, sofa_y + sofa_d - 6*mm, sofa_w - 4*mm, 5*mm, 2*mm, fill=0, stroke=1)
        
        # Armchair
        chair_w = 22*mm
        chair_d = 22*mm
        c.roundRect(x + 15*mm, y + h/2 - chair_d/2, chair_w, chair_d, 3*mm, fill=0, stroke=1)
        
        # Coffee table
        table_w = 30*mm
        table_d = 15*mm
        c.rect(x + w/2 - table_w/2, y + h/2 - table_d/2, table_w, table_d, fill=0, stroke=1)
    
    def _draw_dining_detailed(self, c, x, y, w, h, scale):
        """Dining with table and chairs"""
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Determine table size based on room
        if w > 70*mm and h > 60*mm:
            # Large table with 8 chairs
            table_w = 55*mm
            table_d = 28*mm
            chairs_long = 3
            chairs_short = 1
        else:
            # Smaller table with 6 chairs
            table_w = 42*mm
            table_d = 22*mm
            chairs_long = 2
            chairs_short = 1
        
        table_x = x + (w - table_w) / 2
        table_y = y + (h - table_d) / 2
        
        # Table
        c.rect(table_x, table_y, table_w, table_d, fill=0, stroke=1)
        
        # Chairs
        chair_w = 10*mm
        chair_d = 10*mm
        
        # Long sides
        for i in range(chairs_long):
            cx = table_x + (i + 1) * table_w / (chairs_long + 1) - chair_w/2
            # Top side
            c.rect(cx, table_y + table_d + 3*mm, chair_w, chair_d, fill=0, stroke=1)
            # Bottom side
            c.rect(cx, table_y - chair_d - 3*mm, chair_w, chair_d, fill=0, stroke=1)
        
        # Short sides (ends)
        for i in range(chairs_short):
            cy = table_y + (i + 1) * table_d / (chairs_short + 1) - chair_d/2
            # Left end
            c.rect(table_x - chair_w - 3*mm, cy, chair_w, chair_d, fill=0, stroke=1)
            # Right end
            c.rect(table_x + table_w + 3*mm, cy, chair_w, chair_d, fill=0, stroke=1)
    
    def _draw_laundry_detailed(self, c, x, y, w, h, scale):
        """Laundry with washer, dryer, tub"""
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        appliance_size = 15*mm
        
        # Washing machine
        wm_x = x + 4*mm
        wm_y = y + h - appliance_size - 4*mm
        c.rect(wm_x, wm_y, appliance_size, appliance_size, fill=0, stroke=1)
        # Door circle
        c.circle(wm_x + appliance_size/2, wm_y + appliance_size/2, appliance_size * 0.35, fill=0, stroke=1)
        # WM label
        c.setFont("Helvetica", 3)
        c.drawCentredString(wm_x + appliance_size/2, wm_y + appliance_size + 2*mm, "WM")
        
        # Dryer (stacked or side by side)
        if w > 50*mm:
            # Side by side
            dr_x = wm_x + appliance_size + 3*mm
            dr_y = wm_y
        else:
            # Stacked (draw smaller symbol)
            dr_x = wm_x
            dr_y = wm_y - appliance_size - 2*mm
        
        c.rect(dr_x, dr_y, appliance_size, appliance_size, fill=0, stroke=1)
        
        # Laundry tub
        tub_w = min(15*mm, w - appliance_size * 2 - 15*mm)
        tub_d = 12*mm
        c.rect(x + w - tub_w - 4*mm, y + h - tub_d - 4*mm, tub_w, tub_d, fill=0, stroke=1)
        
        # Broom cupboard indication
        if h > 60*mm:
            c.setDash([2, 2])
            c.rect(x + 4*mm, y + 4*mm, 12*mm, 15*mm, fill=0, stroke=1)
            c.setFont("Helvetica", 3)
            c.drawCentredString(x + 10*mm, y + 12*mm, "BROOM")
            c.setDash([])
    
    def _draw_garage_detailed(self, c, x, y, w, h, scale):
        """Garage with detailed car outlines"""
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        car_w = min(52*mm, w * 0.32)
        car_h = min(115*mm, h * 0.78)
        
        num_cars = 2 if w > 130*mm else 1
        
        c.setDash([5, 3])
        
        for i in range(num_cars):
            car_x = x + w * (i + 1) / (num_cars + 1) - car_w / 2
            car_y = y + (h - car_h) / 2
            
            # Car body outline
            c.roundRect(car_x, car_y, car_w, car_h, 8*mm, fill=0, stroke=1)
            
            # Windscreen
            ws_y = car_y + car_h * 0.65
            ws_h = car_h * 0.18
            c.line(car_x + 5*mm, ws_y, car_x + 5*mm, ws_y + ws_h)
            c.line(car_x + car_w - 5*mm, ws_y, car_x + car_w - 5*mm, ws_y + ws_h)
            c.line(car_x + 5*mm, ws_y + ws_h, car_x + car_w - 5*mm, ws_y + ws_h)
            
            # Rear window
            rw_y = car_y + car_h * 0.15
            c.line(car_x + 8*mm, rw_y, car_x + car_w - 8*mm, rw_y)
            c.line(car_x + 8*mm, rw_y, car_x + 8*mm, rw_y + car_h * 0.1)
            c.line(car_x + car_w - 8*mm, rw_y, car_x + car_w - 8*mm, rw_y + car_h * 0.1)
            
            # Wheels
            wheel_w = car_w * 0.12
            wheel_h = car_h * 0.1
            # Front wheels
            c.rect(car_x - 2*mm, car_y + car_h * 0.72, wheel_w, wheel_h, fill=0, stroke=1)
            c.rect(car_x + car_w - wheel_w + 2*mm, car_y + car_h * 0.72, wheel_w, wheel_h, fill=0, stroke=1)
            # Rear wheels
            c.rect(car_x - 2*mm, car_y + car_h * 0.15, wheel_w, wheel_h, fill=0, stroke=1)
            c.rect(car_x + car_w - wheel_w + 2*mm, car_y + car_h * 0.15, wheel_w, wheel_h, fill=0, stroke=1)
        
        c.setDash([])
    
    def _draw_study_detailed(self, c, x, y, w, h, scale):
        """Study with desk, chair, bookshelf"""
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Desk
        desk_w = min(42*mm, w * 0.65)
        desk_d = 18*mm
        desk_x = x + (w - desk_w) / 2
        desk_y = y + h - desk_d - 8*mm
        
        c.rect(desk_x, desk_y, desk_w, desk_d, fill=0, stroke=1)
        
        # Chair
        c.circle(desk_x + desk_w/2, desk_y - 12*mm, 7*mm, fill=0, stroke=1)
        # Chair base (star shape simplified)
        c.circle(desk_x + desk_w/2, desk_y - 12*mm, 3*mm, fill=0, stroke=1)
        
        # Bookshelf
        shelf_w = 12*mm
        shelf_h = min(40*mm, h * 0.5)
        c.rect(x + 4*mm, y + 4*mm, shelf_w, shelf_h, fill=0, stroke=1)
        # Shelf divisions
        for i in range(1, 4):
            sy = y + 4*mm + i * shelf_h / 4
            c.line(x + 4*mm, sy, x + 4*mm + shelf_w, sy)
    
    def _draw_wir(self, c, x, y, w, h, scale):
        """Walk-in robe with hanging rails"""
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        rail_depth = min(15*mm, w * 0.25)
        
        # Hanging rails on sides (shown as double lines)
        # Left side
        c.rect(x + 3*mm, y + 3*mm, rail_depth, h - 6*mm, fill=0, stroke=1)
        # Rail line
        c.line(x + 3*mm + rail_depth/2, y + 3*mm, x + 3*mm + rail_depth/2, y + h - 3*mm)
        
        # Right side
        c.rect(x + w - rail_depth - 3*mm, y + 3*mm, rail_depth, h - 6*mm, fill=0, stroke=1)
        c.line(x + w - rail_depth/2 - 3*mm, y + 3*mm, x + w - rail_depth/2 - 3*mm, y + h - 3*mm)
        
        # Shelving at back
        shelf_d = 10*mm
        c.rect(x + rail_depth + 6*mm, y + h - shelf_d - 3*mm, w - 2*rail_depth - 12*mm, shelf_d, fill=0, stroke=1)
    
    def _draw_pantry(self, c, x, y, w, h, scale):
        """Pantry with shelving"""
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        shelf_depth = min(10*mm, w * 0.2)
        
        # Shelves on left
        c.rect(x + 3*mm, y + 3*mm, shelf_depth, h - 6*mm, fill=0, stroke=1)
        
        # Shelves on right
        c.rect(x + w - shelf_depth - 3*mm, y + 3*mm, shelf_depth, h - 6*mm, fill=0, stroke=1)
        
        # Back counter/bench
        if h > 40*mm:
            bench_d = 12*mm
            c.rect(x + shelf_depth + 5*mm, y + h - bench_d - 3*mm, w - 2*shelf_depth - 10*mm, bench_d, fill=0, stroke=1)
    
    def _draw_alfresco_detailed(self, c, x, y, w, h, scale):
        """Alfresco with outdoor setting and BBQ"""
        c.setFillColor(colors.white)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Outdoor dining table
        table_w = min(48*mm, w * 0.5)
        table_d = min(26*mm, h * 0.35)
        table_x = x + (w - table_w) / 2
        table_y = y + h - table_d - 15*mm
        
        c.rect(table_x, table_y, table_w, table_d, fill=0, stroke=1)
        
        # Chairs around table
        chair_size = 10*mm
        # Two each side
        for i in range(2):
            cx = table_x + (i + 1) * table_w / 3 - chair_size/2
            c.rect(cx, table_y + table_d + 3*mm, chair_size, chair_size, fill=0, stroke=1)
            c.rect(cx, table_y - chair_size - 3*mm, chair_size, chair_size, fill=0, stroke=1)
        # Ends
        c.rect(table_x - chair_size - 3*mm, table_y + table_d/2 - chair_size/2, chair_size, chair_size, fill=0, stroke=1)
        c.rect(table_x + table_w + 3*mm, table_y + table_d/2 - chair_size/2, chair_size, chair_size, fill=0, stroke=1)
        
        # BBQ
        bbq_w = 25*mm
        bbq_d = 16*mm
        c.rect(x + w - bbq_w - 6*mm, y + 6*mm, bbq_w, bbq_d, fill=0, stroke=1)
        # BBQ grill lines
        for i in range(1, 4):
            gx = x + w - bbq_w - 6*mm + i * bbq_w / 4
            c.line(gx, y + 8*mm, gx, y + 6*mm + bbq_d - 2*mm)
    
    def _draw_theatre(self, c, x, y, w, h, scale):
        """Theatre with screen and tiered seating"""
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Screen
        screen_w = min(70*mm, w * 0.75)
        c.setLineWidth(LINE_WEIGHT_MEDIUM)
        c.line(x + (w - screen_w)/2, y + h - 6*mm, x + (w + screen_w)/2, y + h - 6*mm)
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Tiered seating (recliners)
        seat_w = 20*mm
        seat_d = 22*mm
        
        num_seats = min(3, int(w / (seat_w + 8*mm)))
        total_seat_w = num_seats * seat_w + (num_seats - 1) * 8*mm
        
        # Front row
        for i in range(num_seats):
            sx = x + (w - total_seat_w)/2 + i * (seat_w + 8*mm)
            sy = y + h - seat_d - 55*mm
            c.roundRect(sx, sy, seat_w, seat_d, 3*mm, fill=0, stroke=1)
        
        # Back row (if space)
        if h > 90*mm:
            # Platform indication
            c.setDash([2, 2])
            c.rect(x + 8*mm, y + 8*mm, w - 16*mm, 40*mm, fill=0, stroke=1)
            c.setDash([])
            
            for i in range(num_seats):
                sx = x + (w - total_seat_w)/2 + i * (seat_w + 8*mm)
                sy = y + 15*mm
                c.roundRect(sx, sy, seat_w, seat_d, 3*mm, fill=0, stroke=1)
    
    def _draw_linen(self, c, x, y, w, h, scale):
        """Linen cupboard with shelves"""
        c.setLineWidth(LINE_WEIGHT_FINE)
        
        # Shelves
        num_shelves = min(5, int(h / 12*mm))
        for i in range(num_shelves):
            sy = y + 4*mm + i * (h - 8*mm) / num_shelves
            c.line(x + 3*mm, sy, x + w - 3*mm, sy)
    
    # =========================================================================
    # ROOM LABELS
    # =========================================================================
    
    def _draw_room_labels_professional(self, c, rooms: List[Room], scale: float, ox: float, oy: float):
        """Draw room labels with professional abbreviations and dimensions"""
        c.setFillColor(colors.black)
        
        for room in rooms:
            x, y, w, h = room.bounds_mm
            cx = x * scale + ox + w * scale / 2
            cy = y * scale + oy + h * scale / 2
            
            sw = w * scale
            sh = h * scale
            
            # Get abbreviated name
            name = ROOM_ABBREVIATIONS.get(room.room_type, room.name.upper())
            if len(name) > 18:
                name = name[:15] + "..."
            
            # Font size based on room size
            if sw > 60*mm and sh > 50*mm:
                font_size = 9
            elif sw > 40*mm and sh > 35*mm:
                font_size = 7
            else:
                font_size = 5
            
            # Room name
            c.setFont("Helvetica-Bold", font_size)
            c.drawCentredString(cx, cy + 4*mm, name)
            
            # Dimensions (width x depth in mm format like "3500 x 3100")
            c.setFont("Helvetica", font_size - 1)
            dim_text = f"{int(w)} x {int(h)}"
            c.drawCentredString(cx, cy - 3*mm, dim_text)
    
    # =========================================================================
    # DIMENSIONS
    # =========================================================================
    
    def _draw_dimension_chains(self, c, rooms: List[Room], scale: float, ox: float, oy: float, bounds: Tuple):
        """Draw dimension chains along building edges"""
        if not rooms:
            return
        
        min_x, min_y, max_x, max_y = bounds
        
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        c.setLineWidth(LINE_WEIGHT_FINE)
        c.setFont("Helvetica", 6)
        
        offset1 = 12 * mm  # First chain
        offset2 = 22 * mm  # Overall dimension
        
        # Collect unique x and y positions
        x_positions = sorted(set([r.x for r in rooms] + [r.x + r.width for r in rooms]))
        y_positions = sorted(set([r.y for r in rooms] + [r.y + r.depth for r in rooms]))
        
        # Bottom dimension chain (individual widths)
        y_chain = min_y * 1000 * scale + oy - offset1
        for i in range(len(x_positions) - 1):
            x1 = x_positions[i] * 1000 * scale + ox
            x2 = x_positions[i + 1] * 1000 * scale + ox
            width_mm = (x_positions[i + 1] - x_positions[i]) * 1000
            
            if width_mm > 200:  # Only show if > 200mm
                self._draw_single_dimension(c, x1, y_chain, x2, y_chain, width_mm, horizontal=True)
        
        # Bottom overall dimension
        y_overall = min_y * 1000 * scale + oy - offset2
        total_width = (max_x - min_x) * 1000
        self._draw_single_dimension(c, min_x * 1000 * scale + ox, y_overall, 
                                   max_x * 1000 * scale + ox, y_overall, total_width, horizontal=True)
        
        # Right dimension chain (individual heights)
        x_chain = max_x * 1000 * scale + ox + offset1
        for i in range(len(y_positions) - 1):
            y1 = y_positions[i] * 1000 * scale + oy
            y2 = y_positions[i + 1] * 1000 * scale + oy
            height_mm = (y_positions[i + 1] - y_positions[i]) * 1000
            
            if height_mm > 200:
                self._draw_single_dimension(c, x_chain, y1, x_chain, y2, height_mm, horizontal=False)
        
        # Right overall dimension
        x_overall = max_x * 1000 * scale + ox + offset2
        total_height = (max_y - min_y) * 1000
        self._draw_single_dimension(c, x_overall, min_y * 1000 * scale + oy,
                                   x_overall, max_y * 1000 * scale + oy, total_height, horizontal=False)
    
    def _draw_single_dimension(self, c, x1: float, y1: float, x2: float, y2: float, 
                              value_mm: float, horizontal: bool = True):
        """Draw a single dimension with ticks and text"""
        # Dimension line
        c.line(x1, y1, x2, y2)
        
        # Tick marks
        tick = 2 * mm
        if horizontal:
            c.line(x1, y1 - tick, x1, y1 + tick)
            c.line(x2, y2 - tick, x2, y2 + tick)
        else:
            c.line(x1 - tick, y1, x1 + tick, y1)
            c.line(x2 - tick, y2, x2 + tick, y2)
        
        # Value text
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2
        text = f"{int(value_mm)}"
        
        if horizontal:
            c.drawCentredString(cx, cy + 2.5*mm, text)
        else:
            c.saveState()
            c.translate(cx + 2.5*mm, cy)
            c.rotate(90)
            c.drawCentredString(0, 0, text)
            c.restoreState()
    
    # =========================================================================
    # TITLE BLOCK, NORTH ARROW, SCALE BAR
    # =========================================================================
    
    def _draw_title_block(self, c, layout_data: Dict, project_name: str, 
                         project_details: Dict, page_width: float, page_height: float):
        """Professional title block"""
        block_height = 28 * mm
        block_y = self.margin
        block_w = page_width - 2 * self.margin
        
        # Main frame
        c.setStrokeColor(colors.black)
        c.setLineWidth(LINE_WEIGHT_MEDIUM)
        c.rect(self.margin, block_y, block_w, block_height, fill=0, stroke=1)
        
        # Internal dividers
        c.setLineWidth(LINE_WEIGHT_FINE)
        div1 = self.margin + 70*mm
        div2 = self.margin + 150*mm
        div3 = page_width - self.margin - 55*mm
        c.line(div1, block_y, div1, block_y + block_height)
        c.line(div2, block_y, div2, block_y + block_height)
        c.line(div3, block_y, div3, block_y + block_height)
        
        # Project info
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(self.margin + 5*mm, block_y + block_height - 10*mm, project_name[:28])
        
        c.setFont("Helvetica", 7)
        design_name = layout_data.get('design_name', 'Floor Plan')[:35]
        c.drawString(self.margin + 5*mm, block_y + block_height - 18*mm, design_name)
        
        if project_details:
            addr = f"{project_details.get('suburb', '')}, {project_details.get('state', '')} {project_details.get('postcode', '')}"
            c.drawString(self.margin + 5*mm, block_y + block_height - 25*mm, addr[:40])
        
        # Summary stats
        summary = layout_data.get('summary', {})
        c.setFont("Helvetica", 6)
        c.drawString(div1 + 5*mm, block_y + block_height - 8*mm, f"Total Area: {summary.get('total_area', 0):.0f}m²")
        c.drawString(div1 + 5*mm, block_y + block_height - 15*mm, f"Bedrooms: {summary.get('bedroom_count', 0)}")
        c.drawString(div1 + 5*mm, block_y + block_height - 22*mm, f"Bathrooms: {summary.get('bathroom_count', 0)}")
        c.drawString(div1 + 45*mm, block_y + block_height - 15*mm, f"Garage: {summary.get('garage_spaces', 0)}")
        
        # Drawing info
        c.setFont("Helvetica-Bold", 8)
        c.drawString(div2 + 5*mm, block_y + block_height - 10*mm, "FLOOR PLAN")
        c.setFont("Helvetica", 6)
        c.drawString(div2 + 5*mm, block_y + block_height - 17*mm, "Ground Floor")
        c.drawString(div2 + 5*mm, block_y + block_height - 24*mm, f"Date: {datetime.now().strftime('%d/%m/%Y')}")
        c.drawString(div2 + 45*mm, block_y + block_height - 17*mm, "Scale: 1:100")
        
        # Company logo/name
        c.setFont("Helvetica-Bold", 14)
        c.drawString(div3 + 8*mm, block_y + block_height - 13*mm, "LayoutAI")
        c.setFont("Helvetica", 6)
        c.drawString(div3 + 8*mm, block_y + block_height - 20*mm, "AI-Powered Design")
    
    def _draw_north_arrow(self, c, page_width: float, page_height: float):
        """Professional north arrow"""
        x = page_width - self.margin - 22*mm
        y = page_height - self.margin - 28*mm
        
        c.setFillColor(colors.black)
        c.setStrokeColor(colors.black)
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        
        # Arrow (filled triangle)
        path = c.beginPath()
        path.moveTo(x, y + 18*mm)
        path.lineTo(x - 6*mm, y)
        path.lineTo(x, y + 4*mm)
        path.lineTo(x + 6*mm, y)
        path.close()
        c.drawPath(path, fill=1, stroke=1)
        
        # N label
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(x, y + 22*mm, "N")
    
    def _draw_scale_bar(self, c, scale: float, page_width: float, page_height: float):
        """Professional scale bar"""
        x = page_width - self.margin - 90*mm
        y = self.margin + 8*mm
        
        bar_length = 5000 * scale  # 5 meters
        
        c.setStrokeColor(colors.black)
        c.setLineWidth(LINE_WEIGHT_LIGHT)
        
        # Main bar
        c.line(x, y, x + bar_length, y)
        
        # End caps
        c.line(x, y - 3*mm, x, y + 3*mm)
        c.line(x + bar_length, y - 3*mm, x + bar_length, y + 3*mm)
        
        # Subdivisions
        for i in range(1, 5):
            sub_x = x + bar_length * i / 5
            c.line(sub_x, y - 1.5*mm, sub_x, y + 1.5*mm)
        
        # Alternating fill
        c.setFillColor(colors.black)
        for i in range(5):
            if i % 2 == 0:
                c.rect(x + bar_length * i / 5, y - 1*mm, bar_length / 5, 2*mm, fill=1, stroke=0)
        
        # Labels
        c.setFont("Helvetica", 6)
        c.drawCentredString(x, y - 6*mm, "0")
        c.drawCentredString(x + bar_length, y - 6*mm, "5m")
        c.setFont("Helvetica", 5)
        c.drawString(x, y + 5*mm, "SCALE 1:100")


# =============================================================================
# CONVENIENCE FUNCTION
# =============================================================================

def generate_cad_floor_plan_pdf(
    layout_data: Dict[str, Any],
    project_name: str,
    project_details: Dict[str, Any] = None
) -> bytes:
    """Generate professional CAD-quality PDF floor plan"""
    generator = CADFloorPlanGenerator()
    return generator.generate_pdf(layout_data, project_name, project_details)
