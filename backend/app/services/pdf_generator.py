# backend/app/services/pdf_generator.py
# Professional PDF floor plan generator using ReportLab

import io
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.units import mm, cm
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Table, TableStyle

logger = logging.getLogger(__name__)

# Room colors (light fills for professional look)
ROOM_COLORS = {
    'garage': colors.Color(0.95, 0.95, 0.95),
    'porch': colors.Color(0.98, 0.98, 0.98),
    'entry': colors.Color(1, 0.97, 0.9),
    'family': colors.Color(0.94, 0.97, 1),
    'living': colors.Color(0.94, 0.97, 1),
    'theatre': colors.Color(0.96, 0.94, 1),
    'dining': colors.Color(1, 0.96, 0.96),
    'kitchen': colors.Color(0.94, 1, 0.96),
    'pantry': colors.Color(0.91, 0.96, 0.91),
    'laundry': colors.Color(0.89, 0.95, 0.99),
    'bedroom': colors.Color(0.99, 0.89, 0.93),
    'ensuite': colors.Color(0.88, 0.96, 0.99),
    'bathroom': colors.Color(0.88, 0.96, 0.99),
    'powder': colors.Color(0.88, 0.96, 0.99),
    'wir': colors.Color(1, 0.95, 0.88),
    'robe': colors.Color(1, 0.95, 0.88),
    'office': colors.Color(1, 0.97, 0.88),
    'alfresco': colors.Color(0.91, 0.96, 0.91),
    'store': colors.Color(0.93, 0.93, 0.93),
    'mudroom': colors.Color(0.93, 0.93, 0.93),
    'hallway': colors.Color(0.98, 0.98, 0.98),
}

WALL_COLOR = colors.Color(0.1, 0.1, 0.1)
DIMENSION_COLOR = colors.Color(0.3, 0.3, 0.3)
FURNITURE_COLOR = colors.Color(0.6, 0.6, 0.6)


class FloorPlanPDFGenerator:
    """Generate professional PDF floor plans."""
    
    def __init__(self):
        self.page_size = landscape(A3)
        self.margin = 20 * mm
        self.wall_thickness = 2  # points
        
    def generate_pdf(
        self, 
        layout_data: Dict[str, Any], 
        project_name: str,
        project_details: Dict[str, Any] = None
    ) -> bytes:
        """
        Generate a professional PDF floor plan.
        
        Args:
            layout_data: Floor plan layout data with rooms
            project_name: Name of the project
            project_details: Additional project details (address, etc.)
            
        Returns:
            PDF file as bytes
        """
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=self.page_size)
        
        page_width, page_height = self.page_size
        
        # Drawing area (excluding margins and title block)
        draw_area_left = self.margin
        draw_area_bottom = self.margin + 40 * mm  # Space for title block
        draw_area_width = page_width - 2 * self.margin
        draw_area_height = page_height - self.margin - draw_area_bottom
        
        rooms = layout_data.get('rooms', [])
        if not rooms:
            c.drawString(100, page_height / 2, "No floor plan data available")
            c.save()
            buffer.seek(0)
            return buffer.getvalue()
        
        # Calculate bounds
        min_x = min(r['x'] for r in rooms)
        max_x = max(r['x'] + r['width'] for r in rooms)
        min_y = min(r['y'] for r in rooms)
        max_y = max(r['y'] + r['depth'] for r in rooms)
        
        plan_width = max_x - min_x
        plan_height = max_y - min_y
        
        # Calculate scale to fit drawing area
        scale_x = draw_area_width / (plan_width + 4)  # Add padding
        scale_y = draw_area_height / (plan_height + 4)
        scale = min(scale_x, scale_y) * 0.85
        
        # Calculate offset to center the drawing
        offset_x = draw_area_left + (draw_area_width - plan_width * scale) / 2 - min_x * scale
        offset_y = draw_area_bottom + (draw_area_height - plan_height * scale) / 2 - min_y * scale
        
        # Transform functions
        def tx(x): return x * scale + offset_x
        def ty(y): return y * scale + offset_y
        def ts(s): return s * scale
        
        # Draw each room
        for room in rooms:
            self._draw_room(c, room, tx, ty, ts)
        
        # Draw overall dimensions
        self._draw_dimensions(c, rooms, tx, ty, ts, min_x, max_x, min_y, max_y)
        
        # Draw title block
        self._draw_title_block(c, layout_data, project_name, project_details, page_width, page_height)
        
        # Draw north arrow
        self._draw_north_arrow(c, page_width - 30 * mm, page_height - 30 * mm)
        
        # Draw scale bar
        self._draw_scale_bar(c, page_width - 80 * mm, self.margin + 15 * mm, scale)
        
        # Draw room schedule on second page
        c.showPage()
        self._draw_room_schedule(c, layout_data, project_name, page_width, page_height)
        
        c.save()
        buffer.seek(0)
        return buffer.getvalue()
    
    def _draw_room(self, c: canvas.Canvas, room: Dict, tx, ty, ts):
        """Draw a single room with walls, label, and furniture."""
        x = tx(room['x'])
        y = ty(room['y'])
        width = ts(room['width'])
        height = ts(room['depth'])
        
        # Room fill
        fill_color = ROOM_COLORS.get(room['type'], colors.white)
        c.setFillColor(fill_color)
        c.setStrokeColor(WALL_COLOR)
        c.setLineWidth(self.wall_thickness)
        c.rect(x, y, width, height, fill=1, stroke=1)
        
        # Room label
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", min(10, width / 8))
        
        label = room['name'].upper()
        label_width = c.stringWidth(label, "Helvetica-Bold", min(10, width / 8))
        
        if label_width < width - 10:
            c.drawCentredString(x + width / 2, y + height / 2 + 5, label)
        
        # Dimensions
        c.setFont("Helvetica", min(8, width / 10))
        c.setFillColor(DIMENSION_COLOR)
        dim_text = f"{room['width']:.1f} × {room['depth']:.1f}"
        c.drawCentredString(x + width / 2, y + height / 2 - 8, dim_text)
        
        # Area
        area_text = f"{room['area']:.1f}m²"
        c.drawCentredString(x + width / 2, y + height / 2 - 18, area_text)
        
        # Draw furniture
        self._draw_furniture(c, room, x, y, width, height, ts)
    
    def _draw_furniture(self, c: canvas.Canvas, room: Dict, x: float, y: float, width: float, height: float, ts):
        """Draw furniture symbols based on room type."""
        c.setStrokeColor(FURNITURE_COLOR)
        c.setLineWidth(0.5)
        c.setFillColor(colors.white)
        
        room_type = room['type']
        
        if room_type == 'bedroom':
            # Bed
            bed_w = min(width * 0.5, ts(1.8))
            bed_h = min(height * 0.4, ts(2))
            bed_x = x + (width - bed_w) / 2
            bed_y = y + height - bed_h - ts(0.3)
            c.rect(bed_x, bed_y, bed_w, bed_h, fill=0, stroke=1)
            # Pillows
            c.rect(bed_x + 3, bed_y + bed_h - ts(0.3), bed_w / 2 - 6, ts(0.25), fill=0, stroke=1)
            c.rect(bed_x + bed_w / 2 + 3, bed_y + bed_h - ts(0.3), bed_w / 2 - 6, ts(0.25), fill=0, stroke=1)
            
        elif room_type in ['living', 'family']:
            # Sofa
            sofa_w = min(width * 0.4, ts(2.2))
            sofa_h = min(height * 0.2, ts(0.8))
            sofa_x = x + (width - sofa_w) / 2
            sofa_y = y + ts(0.5)
            c.roundRect(sofa_x, sofa_y, sofa_w, sofa_h, ts(0.1), fill=0, stroke=1)
            
        elif room_type == 'dining':
            # Table
            table_w = min(width * 0.4, ts(1.6))
            table_h = min(height * 0.3, ts(1))
            table_x = x + (width - table_w) / 2
            table_y = y + (height - table_h) / 2
            c.rect(table_x, table_y, table_w, table_h, fill=0, stroke=1)
            # Chairs
            chair_size = min(table_w * 0.15, ts(0.35))
            c.rect(table_x - chair_size - 3, table_y + table_h / 2 - chair_size / 2, chair_size, chair_size, fill=0, stroke=1)
            c.rect(table_x + table_w + 3, table_y + table_h / 2 - chair_size / 2, chair_size, chair_size, fill=0, stroke=1)
            
        elif room_type == 'kitchen':
            # Counter
            counter_depth = ts(0.5)
            c.setFillColor(colors.Color(0.9, 0.9, 0.9))
            c.rect(x + ts(0.1), y + height - counter_depth - ts(0.1), width - ts(0.2), counter_depth, fill=1, stroke=1)
            c.setFillColor(colors.white)
            # Sink
            c.ellipse(x + width / 2 - ts(0.25), y + height - counter_depth / 2 - ts(0.15) - ts(0.1),
                     x + width / 2 + ts(0.25), y + height - counter_depth / 2 + ts(0.15) - ts(0.1), fill=0, stroke=1)
            # Island (if wide enough)
            if width > ts(3.5):
                island_w = ts(1.5)
                island_h = ts(0.7)
                c.rect(x + width / 2 - island_w / 2, y + height / 2 - island_h / 2, island_w, island_h, fill=0, stroke=1)
                
        elif room_type in ['bathroom', 'ensuite']:
            # Toilet
            c.ellipse(x + ts(0.2), y + ts(0.2), x + ts(0.6), y + ts(0.7), fill=0, stroke=1)
            # Vanity
            c.setFillColor(colors.Color(0.9, 0.9, 0.9))
            c.rect(x + width - ts(1), y + height - ts(0.5), ts(0.9), ts(0.4), fill=1, stroke=1)
            c.setFillColor(colors.white)
            # Basin
            c.ellipse(x + width - ts(0.7), y + height - ts(0.4), x + width - ts(0.3), y + height - ts(0.15), fill=0, stroke=1)
            # Shower
            c.setDash([3, 2])
            c.rect(x + ts(0.1), y + height - ts(0.9), ts(0.8), ts(0.8), fill=0, stroke=1)
            c.setDash([])
            
        elif room_type == 'garage':
            # Car outline (dashed)
            c.setDash([5, 3])
            car_w = ts(2.2)
            car_h = ts(4.5)
            num_cars = 2 if ('2' in room['name'] or 'Double' in room['name']) else 1
            for i in range(num_cars):
                car_x = x + (width / (num_cars + 1)) * (i + 1) - car_w / 2
                car_y = y + (height - car_h) / 2
                c.roundRect(car_x, car_y, car_w, car_h, ts(0.2), fill=0, stroke=1)
            c.setDash([])
            
        elif room_type == 'laundry':
            # Washer
            c.rect(x + ts(0.1), y + height - ts(0.65), ts(0.55), ts(0.55), fill=0, stroke=1)
            c.circle(x + ts(0.375), y + height - ts(0.375), ts(0.18), fill=0, stroke=1)
            # Dryer
            c.rect(x + ts(0.75), y + height - ts(0.65), ts(0.55), ts(0.55), fill=0, stroke=1)
            
        elif room_type == 'office':
            # Desk
            desk_w = min(width * 0.7, ts(1.4))
            desk_h = ts(0.5)
            c.rect(x + (width - desk_w) / 2, y + ts(0.2), desk_w, desk_h, fill=0, stroke=1)
            # Chair
            c.circle(x + width / 2, y + ts(0.9), ts(0.2), fill=0, stroke=1)
    
    def _draw_dimensions(self, c: canvas.Canvas, rooms: List[Dict], tx, ty, ts, min_x, max_x, min_y, max_y):
        """Draw overall dimension lines."""
        c.setStrokeColor(DIMENSION_COLOR)
        c.setFillColor(DIMENSION_COLOR)
        c.setLineWidth(0.5)
        c.setFont("Helvetica", 8)
        
        dim_offset = ts(1.5)
        
        # Width dimension (bottom)
        y_pos = ty(min_y) - dim_offset
        c.line(tx(min_x), y_pos, tx(max_x), y_pos)
        # Arrows
        c.line(tx(min_x), y_pos, tx(min_x) + 5, y_pos + 3)
        c.line(tx(min_x), y_pos, tx(min_x) + 5, y_pos - 3)
        c.line(tx(max_x), y_pos, tx(max_x) - 5, y_pos + 3)
        c.line(tx(max_x), y_pos, tx(max_x) - 5, y_pos - 3)
        # Extension lines
        c.line(tx(min_x), ty(min_y), tx(min_x), y_pos - 5)
        c.line(tx(max_x), ty(min_y), tx(max_x), y_pos - 5)
        # Text
        width_val = max_x - min_x
        c.drawCentredString((tx(min_x) + tx(max_x)) / 2, y_pos - 15, f"{width_val:.1f}m")
        
        # Depth dimension (right)
        x_pos = tx(max_x) + dim_offset
        c.line(x_pos, ty(min_y), x_pos, ty(max_y))
        # Arrows
        c.line(x_pos, ty(min_y), x_pos - 3, ty(min_y) + 5)
        c.line(x_pos, ty(min_y), x_pos + 3, ty(min_y) + 5)
        c.line(x_pos, ty(max_y), x_pos - 3, ty(max_y) - 5)
        c.line(x_pos, ty(max_y), x_pos + 3, ty(max_y) - 5)
        # Extension lines
        c.line(tx(max_x), ty(min_y), x_pos + 5, ty(min_y))
        c.line(tx(max_x), ty(max_y), x_pos + 5, ty(max_y))
        # Text
        depth_val = max_y - min_y
        c.saveState()
        c.translate(x_pos + 15, (ty(min_y) + ty(max_y)) / 2)
        c.rotate(90)
        c.drawCentredString(0, 0, f"{depth_val:.1f}m")
        c.restoreState()
    
    def _draw_title_block(self, c: canvas.Canvas, layout_data: Dict, project_name: str, 
                          project_details: Dict, page_width: float, page_height: float):
        """Draw the title block at bottom of page."""
        block_height = 35 * mm
        block_y = self.margin
        
        # Border
        c.setStrokeColor(colors.black)
        c.setLineWidth(1)
        c.rect(self.margin, block_y, page_width - 2 * self.margin, block_height, fill=0, stroke=1)
        
        # Dividers
        c.line(self.margin + 80 * mm, block_y, self.margin + 80 * mm, block_y + block_height)
        c.line(self.margin + 160 * mm, block_y, self.margin + 160 * mm, block_y + block_height)
        c.line(page_width - self.margin - 60 * mm, block_y, page_width - self.margin - 60 * mm, block_y + block_height)
        
        # Project info
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(self.margin + 5 * mm, block_y + block_height - 12 * mm, project_name)
        
        c.setFont("Helvetica", 9)
        design_name = layout_data.get('design_name', 'Floor Plan')
        c.drawString(self.margin + 5 * mm, block_y + block_height - 20 * mm, design_name[:40])
        
        if project_details:
            address = f"{project_details.get('suburb', '')}, {project_details.get('state', '')} {project_details.get('postcode', '')}"
            c.drawString(self.margin + 5 * mm, block_y + block_height - 28 * mm, address)
        
        # Summary
        summary = layout_data.get('summary', {})
        c.setFont("Helvetica", 9)
        c.drawString(self.margin + 85 * mm, block_y + block_height - 10 * mm, f"Total Area: {summary.get('total_area', 0):.1f}m²")
        c.drawString(self.margin + 85 * mm, block_y + block_height - 18 * mm, f"Bedrooms: {summary.get('bedroom_count', 0)}")
        c.drawString(self.margin + 85 * mm, block_y + block_height - 26 * mm, f"Bathrooms: {summary.get('bathroom_count', 0)}")
        c.drawString(self.margin + 125 * mm, block_y + block_height - 18 * mm, f"Garage: {summary.get('garage_spaces', 0)} car")
        c.drawString(self.margin + 125 * mm, block_y + block_height - 26 * mm, f"Living: {summary.get('living_area', 0):.1f}m²")
        
        # Drawing info
        c.setFont("Helvetica", 8)
        c.drawString(self.margin + 165 * mm, block_y + block_height - 10 * mm, "FLOOR PLAN")
        c.drawString(self.margin + 165 * mm, block_y + block_height - 18 * mm, "Ground Floor")
        c.drawString(self.margin + 165 * mm, block_y + block_height - 26 * mm, f"Generated: {datetime.now().strftime('%d/%m/%Y')}")
        
        # Logo area
        c.setFont("Helvetica-Bold", 16)
        c.drawString(page_width - self.margin - 55 * mm, block_y + block_height - 15 * mm, "LayoutAI")
        c.setFont("Helvetica", 8)
        c.drawString(page_width - self.margin - 55 * mm, block_y + block_height - 25 * mm, "AI-Powered Floor Plans")
    
    def _draw_north_arrow(self, c: canvas.Canvas, x: float, y: float):
        """Draw north arrow."""
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        c.setLineWidth(1)
        
        # Arrow
        path = c.beginPath()
        path.moveTo(x, y + 15)
        path.lineTo(x - 6, y - 8)
        path.lineTo(x, y - 3)
        path.lineTo(x + 6, y - 8)
        path.close()
        c.drawPath(path, fill=1, stroke=1)
        
        # N label
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(x, y + 22, "N")
    
    def _draw_scale_bar(self, c: canvas.Canvas, x: float, y: float, scale: float):
        """Draw scale bar."""
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        c.setLineWidth(1)
        
        # 5 meter bar
        bar_length = 5 * scale
        c.line(x, y, x + bar_length, y)
        c.line(x, y - 3, x, y + 3)
        c.line(x + bar_length, y - 3, x + bar_length, y + 3)
        
        c.setFont("Helvetica", 8)
        c.drawCentredString(x + bar_length / 2, y - 10, "5m")
        c.drawString(x, y + 8, "SCALE")
    
    def _draw_room_schedule(self, c: canvas.Canvas, layout_data: Dict, project_name: str, 
                            page_width: float, page_height: float):
        """Draw room schedule table on second page."""
        c.setFont("Helvetica-Bold", 18)
        c.drawString(self.margin, page_height - self.margin - 15 * mm, f"{project_name} - Room Schedule")
        
        rooms = layout_data.get('rooms', [])
        
        # Prepare table data
        data = [['Room', 'Type', 'Width (m)', 'Depth (m)', 'Area (m²)', 'Floor', 'Features']]
        
        for room in rooms:
            features = ', '.join(room.get('features', [])[:3]) if room.get('features') else '-'
            if len(features) > 30:
                features = features[:27] + '...'
            data.append([
                room['name'],
                room['type'].replace('_', ' ').title(),
                f"{room['width']:.1f}",
                f"{room['depth']:.1f}",
                f"{room['area']:.1f}",
                'Ground' if room.get('floor', 0) == 0 else f"Level {room.get('floor')}",
                features
            ])
        
        # Add totals row
        total_area = sum(r['area'] for r in rooms)
        data.append(['TOTAL', '', '', '', f"{total_area:.1f}", '', ''])
        
        # Create table
        col_widths = [60 * mm, 40 * mm, 25 * mm, 25 * mm, 25 * mm, 25 * mm, 80 * mm]
        table = Table(data, colWidths=col_widths)
        
        # Style
        style = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.Color(0.2, 0.2, 0.2)),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (0, 1), (0, -1), 'LEFT'),
            ('ALIGN', (-1, 1), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ('BACKGROUND', (0, -1), (-1, -1), colors.Color(0.9, 0.9, 0.9)),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.black),
            ('LINEABOVE', (0, -1), (-1, -1), 1, colors.black),
        ])
        
        # Alternate row colors
        for i in range(1, len(data) - 1):
            if i % 2 == 0:
                style.add('BACKGROUND', (0, i), (-1, i), colors.Color(0.97, 0.97, 0.97))
        
        table.setStyle(style)
        
        # Position table
        table_width, table_height = table.wrap(0, 0)
        table.drawOn(c, self.margin, page_height - self.margin - 30 * mm - table_height)
        
        # Summary section
        summary = layout_data.get('summary', {})
        summary_y = page_height - self.margin - 50 * mm - table_height
        
        c.setFont("Helvetica-Bold", 12)
        c.drawString(self.margin, summary_y, "Summary")
        
        c.setFont("Helvetica", 10)
        c.drawString(self.margin, summary_y - 15, f"Total Floor Area: {summary.get('total_area', 0):.1f}m²")
        c.drawString(self.margin, summary_y - 30, f"Living Area: {summary.get('living_area', 0):.1f}m²")
        c.drawString(self.margin + 80 * mm, summary_y - 15, f"Bedrooms: {summary.get('bedroom_count', 0)}")
        c.drawString(self.margin + 80 * mm, summary_y - 30, f"Bathrooms: {summary.get('bathroom_count', 0)}")
        c.drawString(self.margin + 140 * mm, summary_y - 15, f"Garage: {summary.get('garage_spaces', 0)} spaces")
        
        # Compliance notes
        compliance = layout_data.get('compliance', {})
        if compliance.get('notes'):
            c.setFont("Helvetica-Bold", 12)
            c.drawString(self.margin, summary_y - 55, "Compliance Notes")
            
            c.setFont("Helvetica", 9)
            for i, note in enumerate(compliance['notes'][:5]):
                c.drawString(self.margin + 10, summary_y - 70 - (i * 12), f"• {note}")


def generate_floor_plan_pdf(layout_data: Dict[str, Any], project_name: str, 
                            project_details: Dict[str, Any] = None) -> bytes:
    """
    Convenience function to generate a floor plan PDF.
    
    Args:
        layout_data: Floor plan layout data
        project_name: Name of the project
        project_details: Optional project details
        
    Returns:
        PDF as bytes
    """
    generator = FloorPlanPDFGenerator()
    return generator.generate_pdf(layout_data, project_name, project_details)
