# backend/app/services/cad_generator.py
# Complete CAD-quality floor plan generator
# Produces professional architectural drawings

"""
CAD Floor Plan Generator
========================
Professional floor plan generator producing architect-quality output.

Features:
- Proper wall construction with thickness
- Door symbols with swing arcs
- Window symbols
- Detailed fixture library
- Dimension chains
- Hatching patterns
- Professional annotations
"""

import io
import math
import logging
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional
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

class WallType(Enum):
    EXTERNAL = "external"
    INTERNAL = "internal"

WALL_THICKNESS = {
    WallType.EXTERNAL: 200,  # mm
    WallType.INTERNAL: 90,
}

COLORS = {
    'wall': colors.black,
    'dimension': colors.Color(0.8, 0, 0),
    'dimension_text': colors.Color(0.8, 0, 0),
    'fixture': colors.black,
    'hatch': colors.Color(0.7, 0.7, 0.7),
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class Point:
    x: float
    y: float
    
    def __add__(self, other): return Point(self.x + other.x, self.y + other.y)
    def __sub__(self, other): return Point(self.x - other.x, self.y - other.y)
    def __mul__(self, s): return Point(self.x * s, self.y * s)
    
    def distance_to(self, other):
        return math.sqrt((self.x - other.x)**2 + (self.y - other.y)**2)


@dataclass 
class Room:
    id: str
    name: str
    room_type: str
    x: float  # meters
    y: float
    width: float
    depth: float
    floor: int = 0
    features: List[str] = field(default_factory=list)
    
    @property
    def area(self): return self.width * self.depth
    
    @property
    def bounds_mm(self):
        return (self.x * 1000, self.y * 1000, self.width * 1000, self.depth * 1000)


# =============================================================================
# MAIN GENERATOR CLASS
# =============================================================================

class CADFloorPlanGenerator:
    """Professional CAD floor plan generator"""
    
    def __init__(self):
        self.page_size = landscape(A3)
        self.margin = 15 * mm
        
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
            c.drawString(100, page_height/2, "No floor plan data")
            c.save()
            buffer.seek(0)
            return buffer.getvalue()
        
        # Calculate scale and offset
        scale, offset_x, offset_y = self._calculate_layout(rooms, page_width, page_height)
        
        # Draw elements in order
        self._draw_floor_hatching(c, rooms, scale, offset_x, offset_y)
        self._draw_walls(c, rooms, scale, offset_x, offset_y)
        self._draw_doors(c, rooms, scale, offset_x, offset_y)
        self._draw_windows(c, rooms, scale, offset_x, offset_y)
        self._draw_fixtures(c, rooms, scale, offset_x, offset_y)
        self._draw_room_labels(c, rooms, scale, offset_x, offset_y)
        self._draw_dimensions(c, rooms, scale, offset_x, offset_y, page_width, page_height)
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
            rooms.append(Room(
                id=r.get('id', f'room_{i}'),
                name=r.get('name', f'Room {i+1}'),
                room_type=r.get('type', 'room').lower().replace(' ', '_'),
                x=float(r.get('x', 0)),
                y=float(r.get('y', 0)),
                width=float(r.get('width', 4)),
                depth=float(r.get('depth', 4)),
                floor=int(r.get('floor', 0)),
                features=r.get('features', []),
            ))
        return rooms
    
    def _calculate_layout(self, rooms: List[Room], page_width: float, page_height: float):
        """Calculate scale and offsets"""
        if not rooms:
            return (1, 0, 0)
        
        min_x = min(r.x for r in rooms)
        min_y = min(r.y for r in rooms)
        max_x = max(r.x + r.width for r in rooms)
        max_y = max(r.y + r.depth for r in rooms)
        
        building_width = (max_x - min_x) * 1000  # Convert to mm
        building_depth = (max_y - min_y) * 1000
        
        # Available area (leaving space for dimensions and title)
        dim_space = 25 * mm
        title_height = 35 * mm
        available_w = page_width - 2 * self.margin - 2 * dim_space
        available_h = page_height - 2 * self.margin - title_height - 2 * dim_space
        
        scale_x = available_w / building_width if building_width > 0 else 1
        scale_y = available_h / building_depth if building_depth > 0 else 1
        scale = min(scale_x, scale_y) * 0.85
        
        # Center the drawing
        offset_x = self.margin + dim_space + (available_w - building_width * scale) / 2 - min_x * 1000 * scale
        offset_y = self.margin + title_height + dim_space + (available_h - building_depth * scale) / 2 - min_y * 1000 * scale
        
        return (scale, offset_x, offset_y)
    
    # =========================================================================
    # HATCHING
    # =========================================================================
    
    def _draw_floor_hatching(self, c, rooms, scale, ox, oy):
        """Draw hatching for tiled areas"""
        hatch_types = ['alfresco', 'bathroom', 'ensuite', 'laundry', 'porch']
        
        for room in rooms:
            if room.room_type in hatch_types:
                x, y, w, h = room.bounds_mm
                sx = x * scale + ox
                sy = y * scale + oy
                sw = w * scale
                sh = h * scale
                
                c.setStrokeColor(COLORS['hatch'])
                c.setLineWidth(0.1 * mm)
                
                # Diagonal hatching
                spacing = 4 * mm
                for i in range(int((sw + sh) / spacing) + 1):
                    x1 = sx + i * spacing
                    y1 = sy
                    x2 = sx
                    y2 = sy + i * spacing
                    
                    # Clip to room bounds
                    if x1 > sx + sw:
                        y1 += (x1 - sx - sw)
                        x1 = sx + sw
                    if y2 > sy + sh:
                        x2 += (y2 - sy - sh)
                        y2 = sy + sh
                    
                    if x1 >= sx and y1 <= sy + sh and x2 <= sx + sw and y2 >= sy:
                        c.line(x1, y1, x2, y2)
    
    # =========================================================================
    # WALLS
    # =========================================================================
    
    def _draw_walls(self, c, rooms, scale, ox, oy):
        """Draw walls with proper thickness"""
        
        # Find external boundary
        min_x = min(r.x for r in rooms)
        min_y = min(r.y for r in rooms)
        max_x = max(r.x + r.width for r in rooms)
        max_y = max(r.y + r.depth for r in rooms)
        
        for room in rooms:
            x, y, w, h = room.bounds_mm
            
            # Draw each wall
            walls = [
                ((x, y), (x + w, y), 'bottom'),
                ((x + w, y), (x + w, y + h), 'right'),
                ((x + w, y + h), (x, y + h), 'top'),
                ((x, y + h), (x, y), 'left'),
            ]
            
            for (x1, y1), (x2, y2), edge in walls:
                # Determine if external wall
                is_external = self._is_external_wall(room, edge, min_x, min_y, max_x, max_y)
                thickness = WALL_THICKNESS[WallType.EXTERNAL if is_external else WallType.INTERNAL]
                
                self._draw_wall_segment(c, x1, y1, x2, y2, thickness, is_external, scale, ox, oy)
    
    def _is_external_wall(self, room, edge, min_x, min_y, max_x, max_y):
        """Check if wall is on external boundary"""
        tol = 0.01
        if edge == 'bottom': return abs(room.y - min_y) < tol
        if edge == 'top': return abs(room.y + room.depth - max_y) < tol
        if edge == 'left': return abs(room.x - min_x) < tol
        if edge == 'right': return abs(room.x + room.width - max_x) < tol
        return False
    
    def _draw_wall_segment(self, c, x1, y1, x2, y2, thickness, is_external, scale, ox, oy):
        """Draw a wall segment with thickness"""
        sx1 = x1 * scale + ox
        sy1 = y1 * scale + oy
        sx2 = x2 * scale + ox
        sy2 = y2 * scale + oy
        t = thickness * scale / 2
        
        dx = sx2 - sx1
        dy = sy2 - sy1
        length = math.sqrt(dx*dx + dy*dy)
        if length == 0: return
        
        nx = -dy / length * t
        ny = dx / length * t
        
        c.setFillColor(colors.black)
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.5 * mm if is_external else 0.35 * mm)
        
        path = c.beginPath()
        path.moveTo(sx1 + nx, sy1 + ny)
        path.lineTo(sx1 - nx, sy1 - ny)
        path.lineTo(sx2 - nx, sy2 - ny)
        path.lineTo(sx2 + nx, sy2 + ny)
        path.close()
        c.drawPath(path, fill=1, stroke=1)
    
    # =========================================================================
    # DOORS
    # =========================================================================
    
    def _draw_doors(self, c, rooms, scale, ox, oy):
        """Draw door symbols"""
        door_rooms = {
            'entry': {'wall': 'bottom', 'width': 1020, 'type': 'single'},
            'foyer': {'wall': 'bottom', 'width': 1020, 'type': 'single'},
            'bedroom': {'wall': 'top', 'width': 820, 'type': 'single'},
            'master': {'wall': 'top', 'width': 820, 'type': 'single'},
            'bathroom': {'wall': 'top', 'width': 720, 'type': 'single'},
            'ensuite': {'wall': 'left', 'width': 720, 'type': 'single'},
            'wir': {'wall': 'left', 'width': 720, 'type': 'single'},
            'walk_in_robe': {'wall': 'left', 'width': 720, 'type': 'single'},
            'laundry': {'wall': 'top', 'width': 820, 'type': 'single'},
            'garage': {'wall': 'bottom', 'width': 4800, 'type': 'garage'},
            'office': {'wall': 'top', 'width': 820, 'type': 'single'},
            'study': {'wall': 'top', 'width': 820, 'type': 'single'},
            'alfresco': {'wall': 'right', 'width': 2400, 'type': 'sliding'},
            'pantry': {'wall': 'top', 'width': 820, 'type': 'single'},
            'theatre': {'wall': 'top', 'width': 1640, 'type': 'double'},
        }
        
        for room in rooms:
            config = door_rooms.get(room.room_type)
            if not config: continue
            
            x, y, w, h = room.bounds_mm
            wall = config['wall']
            door_width = config['width']
            door_type = config['type']
            
            # Calculate door position
            if wall == 'bottom':
                dx, dy = x + w/2, y
                angle = 0
            elif wall == 'top':
                dx, dy = x + w/2, y + h
                angle = 180
            elif wall == 'left':
                dx, dy = x, y + h/2
                angle = 90
            else:  # right
                dx, dy = x + w, y + h/2
                angle = 270
            
            self._draw_door_symbol(c, dx, dy, door_width, door_type, angle, scale, ox, oy)
    
    def _draw_door_symbol(self, c, x, y, width, door_type, angle, scale, ox, oy):
        """Draw door with swing arc"""
        sx = x * scale + ox
        sy = y * scale + oy
        sw = width * scale
        
        c.saveState()
        c.translate(sx, sy)
        c.rotate(angle)
        
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.white)
        c.setLineWidth(0.25 * mm)
        
        if door_type == 'single':
            # Door leaf
            c.line(-sw/2, 0, sw/2, 0)
            c.setLineWidth(0.35 * mm)
            c.line(-sw/2, 0, -sw/2, sw)
            # Swing arc
            c.setLineWidth(0.18 * mm)
            c.setDash([2, 2])
            c.arc(-sw/2 - sw, -sw, -sw/2 + sw, sw, 0, 90)
            c.setDash([])
            
        elif door_type == 'double':
            # Two leaves
            c.line(-sw/2, 0, sw/2, 0)
            c.setLineWidth(0.35 * mm)
            c.line(-sw/2, 0, -sw/2, sw/2)
            c.line(sw/2, 0, sw/2, sw/2)
            # Swing arcs
            c.setLineWidth(0.18 * mm)
            c.setDash([2, 2])
            c.arc(-sw/2 - sw/2, -sw/2, -sw/2 + sw/2, sw/2, 0, 90)
            c.arc(sw/2 - sw/2, -sw/2, sw/2 + sw/2, sw/2, 90, 90)
            c.setDash([])
            
        elif door_type == 'sliding':
            # Frame
            c.line(-sw/2, 0, sw/2, 0)
            c.line(-sw/2, 3*mm, sw/2, 3*mm)
            # Arrow
            c.setLineWidth(0.25 * mm)
            c.line(-sw/4, 1.5*mm, sw/4, 1.5*mm)
            c.line(sw/4 - 2*mm, 0.5*mm, sw/4, 1.5*mm)
            c.line(sw/4 - 2*mm, 2.5*mm, sw/4, 1.5*mm)
            
        elif door_type == 'garage':
            # Roller door
            c.line(-sw/2, 0, sw/2, 0)
            c.setDash([4, 2])
            for i in range(1, 4):
                c.line(-sw/2, i * 2*mm, sw/2, i * 2*mm)
            c.setDash([])
        
        c.restoreState()
    
    # =========================================================================
    # WINDOWS
    # =========================================================================
    
    def _draw_windows(self, c, rooms, scale, ox, oy):
        """Draw window symbols on external walls"""
        window_rooms = {
            'bedroom': {'width': 1500},
            'master': {'width': 1800},
            'living': {'width': 2400},
            'family': {'width': 2400},
            'kitchen': {'width': 1200},
            'dining': {'width': 1800},
            'office': {'width': 1200},
            'study': {'width': 1200},
        }
        
        min_x = min(r.x for r in rooms)
        min_y = min(r.y for r in rooms)
        max_x = max(r.x + r.width for r in rooms)
        max_y = max(r.y + r.depth for r in rooms)
        
        for room in rooms:
            config = window_rooms.get(room.room_type)
            if not config: continue
            
            x, y, w, h = room.bounds_mm
            window_width = config['width']
            
            # Find external wall and add window
            for edge in ['bottom', 'top', 'left', 'right']:
                if self._is_external_wall(room, edge, min_x, min_y, max_x, max_y):
                    if edge == 'bottom':
                        wx, wy = x + w/2, y
                        angle = 0
                    elif edge == 'top':
                        wx, wy = x + w/2, y + h
                        angle = 0
                    elif edge == 'left':
                        wx, wy = x, y + h/2
                        angle = 90
                    else:
                        wx, wy = x + w, y + h/2
                        angle = 90
                    
                    self._draw_window_symbol(c, wx, wy, window_width, angle, scale, ox, oy)
                    break
    
    def _draw_window_symbol(self, c, x, y, width, angle, scale, ox, oy):
        """Draw window with glass lines"""
        sx = x * scale + ox
        sy = y * scale + oy
        sw = width * scale
        
        c.saveState()
        c.translate(sx, sy)
        c.rotate(angle)
        
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.25 * mm)
        
        # Window frame
        frame_depth = 6 * mm
        c.setFillColor(colors.white)
        c.rect(-sw/2, -frame_depth/2, sw, frame_depth, fill=1, stroke=1)
        
        # Glass lines
        c.line(-sw/2, -frame_depth/4, sw/2, -frame_depth/4)
        c.line(-sw/2, frame_depth/4, sw/2, frame_depth/4)
        
        # Sill (thicker line on outside)
        c.setLineWidth(0.5 * mm)
        c.line(-sw/2 - 2*mm, frame_depth/2, sw/2 + 2*mm, frame_depth/2)
        
        c.restoreState()
    
    # =========================================================================
    # FIXTURES
    # =========================================================================
    
    def _draw_fixtures(self, c, rooms, scale, ox, oy):
        """Draw room fixtures"""
        for room in rooms:
            x, y, w, h = room.bounds_mm
            sx = x * scale + ox
            sy = y * scale + oy
            sw = w * scale
            sh = h * scale
            
            c.setStrokeColor(colors.black)
            c.setLineWidth(0.18 * mm)
            
            rt = room.room_type
            
            if rt in ['kitchen', 'kitchen_dining']:
                self._draw_kitchen(c, sx, sy, sw, sh, scale)
            elif rt in ['bathroom', 'main_bathroom']:
                self._draw_bathroom(c, sx, sy, sw, sh, scale, has_bath=True)
            elif rt == 'ensuite':
                self._draw_bathroom(c, sx, sy, sw, sh, scale, has_bath=True)
            elif rt in ['powder', 'powder_room']:
                self._draw_bathroom(c, sx, sy, sw, sh, scale, has_bath=False, has_shower=False)
            elif rt in ['bedroom', 'master', 'master_bedroom']:
                self._draw_bedroom(c, sx, sy, sw, sh, scale, rt)
            elif rt in ['living', 'family', 'lounge']:
                self._draw_living(c, sx, sy, sw, sh, scale)
            elif rt in ['dining', 'dining_area']:
                self._draw_dining(c, sx, sy, sw, sh, scale)
            elif rt == 'laundry':
                self._draw_laundry(c, sx, sy, sw, sh, scale)
            elif rt in ['garage', 'double_garage']:
                self._draw_garage(c, sx, sy, sw, sh, scale)
            elif rt in ['office', 'study', 'home_office']:
                self._draw_office(c, sx, sy, sw, sh, scale)
            elif rt in ['wir', 'walk_in_robe', 'robe']:
                self._draw_wardrobe(c, sx, sy, sw, sh, scale)
            elif rt in ['pantry', 'butlers_pantry']:
                self._draw_pantry(c, sx, sy, sw, sh, scale)
            elif rt in ['alfresco', 'outdoor']:
                self._draw_alfresco(c, sx, sy, sw, sh, scale)
            elif rt == 'theatre':
                self._draw_theatre(c, sx, sy, sw, sh, scale)
    
    def _draw_kitchen(self, c, x, y, w, h, scale):
        """Draw kitchen fixtures"""
        cab_d = 600 * scale / 1000 * scale  # Cabinet depth scaled
        cab_d = min(w * 0.15, 15 * mm)
        
        # Benchtop along top wall
        c.setFillColor(colors.Color(0.9, 0.9, 0.9))
        c.rect(x + 2*mm, y + h - cab_d - 2*mm, w - 4*mm, cab_d, fill=1, stroke=1)
        
        # Sink (double bowl)
        sink_w = min(20*mm, w * 0.25)
        sink_x = x + w/2 - sink_w/2
        c.setFillColor(colors.white)
        c.ellipse(sink_x, y + h - cab_d + 1*mm, sink_x + sink_w/2 - 1*mm, y + h - 3*mm, fill=1, stroke=1)
        c.ellipse(sink_x + sink_w/2 + 1*mm, y + h - cab_d + 1*mm, sink_x + sink_w, y + h - 3*mm, fill=1, stroke=1)
        
        # Cooktop (4 circles)
        cooktop_x = x + w - cab_d - 18*mm
        cooktop_y = y + h - cab_d + 2*mm
        burner_r = 2*mm
        for i in range(2):
            for j in range(2):
                cx = cooktop_x + 4*mm + i * 8*mm
                cy = cooktop_y + 3*mm + j * 6*mm
                c.circle(cx, cy, burner_r, fill=0, stroke=1)
        
        # Side cabinet run
        if w > 80*mm:
            c.setFillColor(colors.Color(0.9, 0.9, 0.9))
            c.rect(x + w - cab_d - 2*mm, y + 2*mm, cab_d, h * 0.5, fill=1, stroke=1)
            
            # Fridge outline
            c.setFillColor(colors.white)
            c.setDash([3, 2])
            c.rect(x + w - cab_d, y + 4*mm, cab_d - 2*mm, 18*mm, fill=0, stroke=1)
            c.setDash([])
        
        # Island (if large)
        if w > 100*mm and h > 100*mm:
            island_w = min(50*mm, w * 0.4)
            island_d = min(25*mm, h * 0.2)
            c.setFillColor(colors.white)
            c.rect(x + (w - island_w)/2, y + h/2 - island_d/2, island_w, island_d, fill=1, stroke=1)
    
    def _draw_bathroom(self, c, x, y, w, h, scale, has_bath=True, has_shower=True):
        """Draw bathroom fixtures"""
        # Toilet
        c.setFillColor(colors.white)
        toilet_x = x + 4*mm
        toilet_y = y + 4*mm
        c.ellipse(toilet_x, toilet_y, toilet_x + 10*mm, toilet_y + 14*mm, fill=1, stroke=1)
        # Cistern
        c.rect(toilet_x + 1*mm, toilet_y + 12*mm, 8*mm, 5*mm, fill=1, stroke=1)
        
        # Vanity
        vanity_w = min(30*mm, w * 0.5)
        vanity_d = 14*mm
        vanity_x = x + w - vanity_w - 3*mm
        vanity_y = y + h - vanity_d - 3*mm
        c.setFillColor(colors.Color(0.9, 0.9, 0.9))
        c.rect(vanity_x, vanity_y, vanity_w, vanity_d, fill=1, stroke=1)
        # Basin
        c.setFillColor(colors.white)
        c.ellipse(vanity_x + vanity_w/2 - 5*mm, vanity_y + 2*mm, 
                 vanity_x + vanity_w/2 + 5*mm, vanity_y + vanity_d - 3*mm, fill=1, stroke=1)
        
        # Shower
        if has_shower:
            shower_size = min(25*mm, min(w, h) * 0.4)
            c.setDash([3, 2])
            c.rect(x + 3*mm, y + h - shower_size - 3*mm, shower_size, shower_size, fill=0, stroke=1)
            c.setDash([])
            # Floor waste
            c.circle(x + 3*mm + shower_size/2, y + h - shower_size/2 - 3*mm, 2*mm, fill=0, stroke=1)
        
        # Bath
        if has_bath and h > 50*mm:
            bath_w = min(45*mm, w - 20*mm)
            bath_d = 18*mm
            c.setFillColor(colors.white)
            c.roundRect(x + w - bath_w - 3*mm, y + 3*mm, bath_w, bath_d, 4*mm, fill=1, stroke=1)
    
    def _draw_bedroom(self, c, x, y, w, h, scale, room_type):
        """Draw bedroom fixtures"""
        # Bed size based on room type
        if 'master' in room_type:
            bed_w, bed_l = 45*mm, 52*mm
        else:
            bed_w, bed_l = 35*mm, 50*mm
        
        bed_w = min(bed_w, w * 0.5)
        bed_l = min(bed_l, h * 0.5)
        
        bed_x = x + (w - bed_w) / 2
        bed_y = y + h - bed_l - 8*mm
        
        c.setFillColor(colors.white)
        c.rect(bed_x, bed_y, bed_w, bed_l, fill=1, stroke=1)
        
        # Pillows
        pillow_h = bed_l * 0.12
        c.rect(bed_x + 2*mm, bed_y + bed_l - pillow_h - 2*mm, bed_w/2 - 3*mm, pillow_h, fill=1, stroke=1)
        c.rect(bed_x + bed_w/2 + 1*mm, bed_y + bed_l - pillow_h - 2*mm, bed_w/2 - 3*mm, pillow_h, fill=1, stroke=1)
        
        # Bedside tables
        if w > bed_w + 30*mm:
            table_size = 12*mm
            c.rect(bed_x - table_size - 3*mm, bed_y + bed_l - table_size - 5*mm, table_size, table_size, fill=1, stroke=1)
            c.rect(bed_x + bed_w + 3*mm, bed_y + bed_l - table_size - 5*mm, table_size, table_size, fill=1, stroke=1)
    
    def _draw_living(self, c, x, y, w, h, scale):
        """Draw living room fixtures"""
        # Sofa
        sofa_w = min(60*mm, w * 0.6)
        sofa_d = 22*mm
        sofa_x = x + (w - sofa_w) / 2
        sofa_y = y + 8*mm
        
        c.setFillColor(colors.white)
        c.roundRect(sofa_x, sofa_y, sofa_w, sofa_d, 3*mm, fill=1, stroke=1)
        # Back cushions
        c.roundRect(sofa_x + 2*mm, sofa_y + sofa_d - 6*mm, sofa_w - 4*mm, 5*mm, 2*mm, fill=1, stroke=1)
        
        # Coffee table
        table_w = min(30*mm, sofa_w * 0.5)
        table_d = 15*mm
        c.rect(x + (w - table_w)/2, y + h/2 - table_d/2, table_w, table_d, fill=1, stroke=1)
        
        # TV unit
        tv_w = min(50*mm, w * 0.6)
        c.rect(x + (w - tv_w)/2, y + h - 12*mm, tv_w, 10*mm, fill=1, stroke=1)
        
        # TV (thin line)
        c.setLineWidth(0.5*mm)
        c.line(x + (w - tv_w * 0.8)/2, y + h - 5*mm, x + (w + tv_w * 0.8)/2, y + h - 5*mm)
        c.setLineWidth(0.18*mm)
    
    def _draw_dining(self, c, x, y, w, h, scale):
        """Draw dining room fixtures"""
        # Table
        table_w = min(50*mm, w * 0.6)
        table_d = min(25*mm, h * 0.4)
        table_x = x + (w - table_w) / 2
        table_y = y + (h - table_d) / 2
        
        c.setFillColor(colors.white)
        c.rect(table_x, table_y, table_w, table_d, fill=1, stroke=1)
        
        # Chairs
        chair_size = 10*mm
        # Top and bottom
        for i in range(3):
            cx = table_x + table_w * (i + 1) / 4 - chair_size/2
            c.rect(cx, table_y + table_d + 2*mm, chair_size, chair_size, fill=1, stroke=1)
            c.rect(cx, table_y - chair_size - 2*mm, chair_size, chair_size, fill=1, stroke=1)
        # Ends
        c.rect(table_x - chair_size - 2*mm, table_y + table_d/2 - chair_size/2, chair_size, chair_size, fill=1, stroke=1)
        c.rect(table_x + table_w + 2*mm, table_y + table_d/2 - chair_size/2, chair_size, chair_size, fill=1, stroke=1)
    
    def _draw_laundry(self, c, x, y, w, h, scale):
        """Draw laundry fixtures"""
        appliance_size = 15*mm
        
        # Washing machine
        c.setFillColor(colors.white)
        c.rect(x + 3*mm, y + h - appliance_size - 3*mm, appliance_size, appliance_size, fill=1, stroke=1)
        c.circle(x + 3*mm + appliance_size/2, y + h - appliance_size/2 - 3*mm, appliance_size * 0.35, fill=0, stroke=1)
        
        # Dryer
        c.rect(x + appliance_size + 6*mm, y + h - appliance_size - 3*mm, appliance_size, appliance_size, fill=1, stroke=1)
        
        # Tub
        tub_w = min(15*mm, w - appliance_size * 2 - 15*mm)
        c.rect(x + w - tub_w - 3*mm, y + h - 12*mm, tub_w, 10*mm, fill=1, stroke=1)
    
    def _draw_garage(self, c, x, y, w, h, scale):
        """Draw garage with car outlines"""
        car_w = 55*mm
        car_l = 120*mm
        
        car_w = min(car_w, w * 0.35)
        car_l = min(car_l, h * 0.8)
        
        num_cars = 2 if w > 140*mm else 1
        
        c.setDash([5, 3])
        for i in range(num_cars):
            car_x = x + w * (i + 1) / (num_cars + 1) - car_w / 2
            car_y = y + (h - car_l) / 2
            c.roundRect(car_x, car_y, car_w, car_l, 5*mm, fill=0, stroke=1)
            
            # Wheels
            wheel_w = car_w * 0.15
            wheel_l = car_l * 0.12
            c.rect(car_x - 2*mm, car_y + car_l * 0.15, wheel_w, wheel_l, fill=0, stroke=1)
            c.rect(car_x - 2*mm, car_y + car_l * 0.7, wheel_w, wheel_l, fill=0, stroke=1)
            c.rect(car_x + car_w - wheel_w + 2*mm, car_y + car_l * 0.15, wheel_w, wheel_l, fill=0, stroke=1)
            c.rect(car_x + car_w - wheel_w + 2*mm, car_y + car_l * 0.7, wheel_w, wheel_l, fill=0, stroke=1)
        c.setDash([])
    
    def _draw_office(self, c, x, y, w, h, scale):
        """Draw office fixtures"""
        # Desk
        desk_w = min(40*mm, w * 0.7)
        desk_d = 18*mm
        desk_x = x + (w - desk_w) / 2
        desk_y = y + h - desk_d - 5*mm
        
        c.setFillColor(colors.white)
        c.rect(desk_x, desk_y, desk_w, desk_d, fill=1, stroke=1)
        
        # Chair
        c.circle(desk_x + desk_w/2, desk_y - 10*mm, 6*mm, fill=1, stroke=1)
        
        # Bookshelf
        c.rect(x + 3*mm, y + 3*mm, 10*mm, min(40*mm, h * 0.5), fill=1, stroke=1)
    
    def _draw_wardrobe(self, c, x, y, w, h, scale):
        """Draw WIR fixtures"""
        rail_depth = 15*mm
        
        # Hanging rails on sides
        c.rect(x + 3*mm, y + 3*mm, rail_depth, h - 6*mm, fill=0, stroke=1)
        c.rect(x + w - rail_depth - 3*mm, y + 3*mm, rail_depth, h - 6*mm, fill=0, stroke=1)
        
        # Shelving at back
        c.rect(x + rail_depth + 6*mm, y + h - 12*mm, w - 2*rail_depth - 12*mm, 10*mm, fill=0, stroke=1)
    
    def _draw_pantry(self, c, x, y, w, h, scale):
        """Draw pantry fixtures"""
        shelf_d = 10*mm
        
        # Shelves on sides
        c.rect(x + 2*mm, y + 2*mm, shelf_d, h - 4*mm, fill=0, stroke=1)
        c.rect(x + w - shelf_d - 2*mm, y + 2*mm, shelf_d, h - 4*mm, fill=0, stroke=1)
        
        # Back bench
        c.rect(x + shelf_d + 4*mm, y + h - 15*mm, w - 2*shelf_d - 8*mm, 13*mm, fill=0, stroke=1)
    
    def _draw_alfresco(self, c, x, y, w, h, scale):
        """Draw alfresco fixtures"""
        # Outdoor table
        table_w = min(45*mm, w * 0.5)
        table_d = min(25*mm, h * 0.35)
        table_x = x + (w - table_w) / 2
        table_y = y + h - table_d - 10*mm
        
        c.setFillColor(colors.white)
        c.rect(table_x, table_y, table_w, table_d, fill=1, stroke=1)
        
        # Chairs
        chair_size = 10*mm
        for i in range(4):
            if i < 2:
                cx = table_x + table_w * (i + 1) / 3 - chair_size/2
                cy = table_y + table_d + 2*mm
            else:
                cx = table_x + table_w * (i - 1) / 3 - chair_size/2
                cy = table_y - chair_size - 2*mm
            c.rect(cx, cy, chair_size, chair_size, fill=1, stroke=1)
        
        # BBQ
        bbq_w = 25*mm
        bbq_d = 15*mm
        c.rect(x + w - bbq_w - 5*mm, y + 5*mm, bbq_w, bbq_d, fill=1, stroke=1)
    
    def _draw_theatre(self, c, x, y, w, h, scale):
        """Draw theatre fixtures"""
        # Screen
        screen_w = min(80*mm, w * 0.8)
        c.setLineWidth(0.5*mm)
        c.line(x + (w - screen_w)/2, y + h - 5*mm, x + (w + screen_w)/2, y + h - 5*mm)
        c.setLineWidth(0.18*mm)
        
        # Recliners
        seat_w = 22*mm
        seat_d = 25*mm
        seats_per_row = min(3, int(w / (seat_w + 5*mm)))
        total_w = seats_per_row * seat_w + (seats_per_row - 1) * 5*mm
        
        for i in range(seats_per_row):
            sx = x + (w - total_w)/2 + i * (seat_w + 5*mm)
            sy = y + h - seat_d - 60*mm
            c.roundRect(sx, sy, seat_w, seat_d, 3*mm, fill=1, stroke=1)
    
    # =========================================================================
    # ROOM LABELS
    # =========================================================================
    
    def _draw_room_labels(self, c, rooms, scale, ox, oy):
        """Draw room names and areas"""
        c.setFillColor(colors.black)
        
        for room in rooms:
            x, y, w, h = room.bounds_mm
            cx = x * scale + ox + w * scale / 2
            cy = y * scale + oy + h * scale / 2
            
            # Room name
            c.setFont("Helvetica-Bold", 8)
            name = room.name.upper()
            if len(name) > 15:
                name = name[:12] + "..."
            c.drawCentredString(cx, cy + 3*mm, name)
            
            # Area
            c.setFont("Helvetica", 6)
            area_text = f"{room.area:.1f}m²"
            c.drawCentredString(cx, cy - 2*mm, area_text)
    
    # =========================================================================
    # DIMENSIONS
    # =========================================================================
    
    def _draw_dimensions(self, c, rooms, scale, ox, oy, page_width, page_height):
        """Draw dimension chains"""
        if not rooms:
            return
        
        min_x = min(r.x for r in rooms)
        min_y = min(r.y for r in rooms)
        max_x = max(r.x + r.width for r in rooms)
        max_y = max(r.y + r.depth for r in rooms)
        
        c.setStrokeColor(COLORS['dimension'])
        c.setFillColor(COLORS['dimension_text'])
        c.setLineWidth(0.18 * mm)
        c.setFont("Helvetica", 6)
        
        offset = 15 * mm
        
        # Bottom dimension (total width)
        x1 = min_x * 1000 * scale + ox
        x2 = max_x * 1000 * scale + ox
        y_dim = min_y * 1000 * scale + oy - offset
        
        self._draw_dimension_line(c, x1, y_dim, x2, y_dim, (max_x - min_x) * 1000, horizontal=True)
        
        # Right dimension (total depth)
        y1 = min_y * 1000 * scale + oy
        y2 = max_y * 1000 * scale + oy
        x_dim = max_x * 1000 * scale + ox + offset
        
        self._draw_dimension_line(c, x_dim, y1, x_dim, y2, (max_y - min_y) * 1000, horizontal=False)
        
        # Individual room dimensions along top and left
        y_top = max_y * 1000 * scale + oy + offset
        x_left = min_x * 1000 * scale + ox - offset
        
        # Collect unique x positions for room widths
        x_positions = sorted(set([r.x for r in rooms] + [r.x + r.width for r in rooms]))
        for i in range(len(x_positions) - 1):
            x1 = x_positions[i] * 1000 * scale + ox
            x2 = x_positions[i + 1] * 1000 * scale + ox
            width_mm = (x_positions[i + 1] - x_positions[i]) * 1000
            if width_mm > 100:  # Only show if > 100mm
                self._draw_dimension_line(c, x1, y_top, x2, y_top, width_mm, horizontal=True, is_detail=True)
        
        # Collect unique y positions for room depths
        y_positions = sorted(set([r.y for r in rooms] + [r.y + r.depth for r in rooms]))
        for i in range(len(y_positions) - 1):
            y1 = y_positions[i] * 1000 * scale + oy
            y2 = y_positions[i + 1] * 1000 * scale + oy
            depth_mm = (y_positions[i + 1] - y_positions[i]) * 1000
            if depth_mm > 100:
                self._draw_dimension_line(c, x_left, y1, x_left, y2, depth_mm, horizontal=False, is_detail=True)
    
    def _draw_dimension_line(self, c, x1, y1, x2, y2, value_mm, horizontal=True, is_detail=False):
        """Draw a single dimension line with value"""
        # Main line
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
        
        # Format value
        if value_mm >= 1000:
            text = f"{value_mm/1000:.2f}"  # Show as meters
        else:
            text = f"{int(value_mm)}"  # Show as mm
        
        font_size = 5 if is_detail else 6
        c.setFont("Helvetica", font_size)
        
        if horizontal:
            c.drawCentredString(cx, cy + 2*mm, text)
        else:
            c.saveState()
            c.translate(cx - 2*mm, cy)
            c.rotate(90)
            c.drawCentredString(0, 0, text)
            c.restoreState()
    
    # =========================================================================
    # TITLE BLOCK
    # =========================================================================
    
    def _draw_title_block(self, c, layout_data, project_name, project_details, page_width, page_height):
        """Draw title block"""
        block_height = 30 * mm
        block_y = self.margin
        
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.5 * mm)
        c.rect(self.margin, block_y, page_width - 2 * self.margin, block_height, fill=0, stroke=1)
        
        # Dividers
        c.setLineWidth(0.25 * mm)
        c.line(self.margin + 70*mm, block_y, self.margin + 70*mm, block_y + block_height)
        c.line(self.margin + 140*mm, block_y, self.margin + 140*mm, block_y + block_height)
        c.line(page_width - self.margin - 50*mm, block_y, page_width - self.margin - 50*mm, block_y + block_height)
        
        # Project name
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(self.margin + 5*mm, block_y + block_height - 12*mm, project_name[:30])
        
        # Design name
        c.setFont("Helvetica", 8)
        design_name = layout_data.get('design_name', 'Floor Plan')
        c.drawString(self.margin + 5*mm, block_y + block_height - 20*mm, design_name[:35])
        
        # Address
        if project_details:
            addr = f"{project_details.get('suburb', '')}, {project_details.get('state', '')} {project_details.get('postcode', '')}"
            c.drawString(self.margin + 5*mm, block_y + block_height - 27*mm, addr[:40])
        
        # Summary
        summary = layout_data.get('summary', {})
        c.setFont("Helvetica", 7)
        c.drawString(self.margin + 75*mm, block_y + block_height - 10*mm, f"Total Area: {summary.get('total_area', 0):.1f}m²")
        c.drawString(self.margin + 75*mm, block_y + block_height - 17*mm, f"Bedrooms: {summary.get('bedroom_count', 0)}")
        c.drawString(self.margin + 75*mm, block_y + block_height - 24*mm, f"Bathrooms: {summary.get('bathroom_count', 0)}")
        c.drawString(self.margin + 110*mm, block_y + block_height - 17*mm, f"Garage: {summary.get('garage_spaces', 0)}")
        
        # Drawing info
        c.drawString(self.margin + 145*mm, block_y + block_height - 10*mm, "FLOOR PLAN")
        c.drawString(self.margin + 145*mm, block_y + block_height - 17*mm, "Ground Floor")
        c.drawString(self.margin + 145*mm, block_y + block_height - 24*mm, f"Date: {datetime.now().strftime('%d/%m/%Y')}")
        
        # Logo
        c.setFont("Helvetica-Bold", 14)
        c.drawString(page_width - self.margin - 45*mm, block_y + block_height - 15*mm, "LayoutAI")
        c.setFont("Helvetica", 7)
        c.drawString(page_width - self.margin - 45*mm, block_y + block_height - 22*mm, "AI-Powered Floor Plans")
    
    # =========================================================================
    # NORTH ARROW & SCALE BAR
    # =========================================================================
    
    def _draw_north_arrow(self, c, page_width, page_height):
        """Draw north arrow"""
        x = page_width - self.margin - 20*mm
        y = page_height - self.margin - 25*mm
        
        c.setFillColor(colors.black)
        c.setStrokeColor(colors.black)
        
        # Arrow
        path = c.beginPath()
        path.moveTo(x, y + 15*mm)
        path.lineTo(x - 5*mm, y)
        path.lineTo(x, y + 3*mm)
        path.lineTo(x + 5*mm, y)
        path.close()
        c.drawPath(path, fill=1, stroke=1)
        
        # N label
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(x, y + 18*mm, "N")
    
    def _draw_scale_bar(self, c, scale, page_width, page_height):
        """Draw scale bar"""
        x = page_width - self.margin - 80*mm
        y = self.margin + 10*mm
        
        # 5 meter bar
        bar_length = 5000 * scale  # 5m in drawing units
        
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.5 * mm)
        
        # Main bar
        c.line(x, y, x + bar_length, y)
        
        # End caps
        c.line(x, y - 2*mm, x, y + 2*mm)
        c.line(x + bar_length, y - 2*mm, x + bar_length, y + 2*mm)
        
        # Subdivisions
        c.setLineWidth(0.25 * mm)
        for i in range(1, 5):
            c.line(x + bar_length * i / 5, y - 1*mm, x + bar_length * i / 5, y + 1*mm)
        
        # Labels
        c.setFont("Helvetica", 7)
        c.drawCentredString(x, y - 5*mm, "0")
        c.drawCentredString(x + bar_length, y - 5*mm, "5m")
        c.drawString(x, y + 4*mm, "SCALE 1:100")


# =============================================================================
# CONVENIENCE FUNCTION
# =============================================================================

def generate_cad_floor_plan_pdf(
    layout_data: Dict[str, Any],
    project_name: str,
    project_details: Dict[str, Any] = None
) -> bytes:
    """Generate CAD-quality PDF floor plan"""
    generator = CADFloorPlanGenerator()
    return generator.generate_pdf(layout_data, project_name, project_details)
