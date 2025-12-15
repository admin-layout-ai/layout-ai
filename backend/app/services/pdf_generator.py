from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A3
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from io import BytesIO
from datetime import datetime
import json
from typing import Dict, List

class FloorPlanPDFGenerator:
    """Generate professional PDF documents for floor plans"""
    
    def __init__(self):
        self.page_width = A3[0]
        self.page_height = A3[1]
        self.margin = 20 * mm
        
    def generate(self, project_data: Dict, floor_plan_data: Dict) -> BytesIO:
        """Generate a complete PDF with floor plan and specifications"""
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A3,
            rightMargin=self.margin,
            leftMargin=self.margin,
            topMargin=self.margin,
            bottomMargin=self.margin
        )
        
        story = []
        styles = getSampleStyleSheet()
        
        # Title Page
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1e40af'),
            spaceAfter=30,
            alignment=TA_CENTER
        )
        
        story.append(Spacer(1, 50 * mm))
        story.append(Paragraph("Layout AI", title_style))
        story.append(Paragraph("Professional Floor Plan", styles['Heading2']))
        story.append(Spacer(1, 20 * mm))
        
        # Project Details Table
        project_details = [
            ['Project Name:', project_data.get('name', 'Untitled')],
            ['Date Generated:', datetime.now().strftime('%d %B %Y')],
            ['Land Size:', f"{project_data.get('land_width', 0)}m x {project_data.get('land_depth', 0)}m"],
            ['Bedrooms:', str(project_data.get('bedrooms', 0))],
            ['Bathrooms:', str(project_data.get('bathrooms', 0))],
            ['Style:', project_data.get('style', 'Modern').title()],
        ]
        
        details_table = Table(project_details, colWidths=[120 * mm, 150 * mm])
        details_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 12),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 12),
        ]))
        
        story.append(details_table)
        story.append(PageBreak())
        
        # Floor Plan Visualization
        story.append(Paragraph("Floor Plan Layout", styles['Heading1']))
        story.append(Spacer(1, 10 * mm))
        
        floor_plan_drawing = self._draw_floor_plan(floor_plan_data)
        story.append(floor_plan_drawing)
        story.append(PageBreak())
        
        # Room Schedule
        story.append(Paragraph("Room Schedule", styles['Heading1']))
        story.append(Spacer(1, 10 * mm))
        
        rooms = json.loads(floor_plan_data.get('layout_data', '{}'))
        room_schedule = [['Room', 'Dimensions', 'Area (m²)']]
        
        for room in rooms.get('rooms', []):
            room_schedule.append([
                room['name'],
                f"{room['width']:.1f}m x {room['depth']:.1f}m",
                f"{room['area']:.1f}"
            ])
        
        total_area = sum(r['area'] for r in rooms.get('rooms', []))
        room_schedule.append(['Total Living Area', '', f"{total_area:.1f}"])
        
        schedule_table = Table(room_schedule, colWidths=[200 * mm, 100 * mm, 80 * mm])
        schedule_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#dbeafe')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ]))
        
        story.append(schedule_table)
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer
    
    def _draw_floor_plan(self, floor_plan_data: Dict) -> Drawing:
        """Draw 2D floor plan visualization"""
        layout = json.loads(floor_plan_data.get('layout_data', '{}'))
        rooms = layout.get('rooms', [])
        
        # Calculate scale
        max_width = max([r['x'] + r['width'] for r in rooms]) if rooms else 15
        max_depth = max([r['y'] + r['depth'] for r in rooms]) if rooms else 30
        
        drawing_width = 700
        drawing_height = 500
        
        scale = min(drawing_width / max_width, drawing_height / max_depth) * 0.9
        
        d = Drawing(drawing_width, drawing_height)
        
        # Draw each room
        for room in rooms:
            x = room['x'] * scale + 20
            y = room['y'] * scale + 20
            w = room['width'] * scale
            h = room['depth'] * scale
            
            rect = Rect(x, y, w, h, fillColor=self._get_room_color(room['type']), strokeColor=colors.black, strokeWidth=1)
            d.add(rect)
            
            label = String(x + w/2, y + h/2, room['name'], fontSize=8, fillColor=colors.black, textAnchor='middle')
            d.add(label)
        
        # Add scale indicator
        scale_line = Line(20, drawing_height - 20, 20 + 5*scale, drawing_height - 20, strokeWidth=2)
        d.add(scale_line)
        scale_text = String(20 + 2.5*scale, drawing_height - 30, "5m", fontSize=8, textAnchor='middle')
        d.add(scale_text)
        
        return d
    
    def _get_room_color(self, room_type: str) -> colors.Color:
        """Get color for room type"""
        color_map = {
            'bedroom': colors.HexColor('#dbeafe'),
            'bathroom': colors.HexColor('#e0e7ff'),
            'kitchen': colors.HexColor('#fef3c7'),
            'living': colors.HexColor('#d1fae5'),
            'dining': colors.HexColor('#fce7f3'),
            'garage': colors.HexColor('#e5e7eb'),
            'open_plan': colors.HexColor('#d1fae5'),
        }
        return color_map.get(room_type, colors.white)

def generate_floor_plan_pdf(project_data: Dict, floor_plan_data: Dict) -> BytesIO:
    """Main entry point for PDF generation"""
    generator = FloorPlanPDFGenerator()
    return generator.generate(project_data, floor_plan_data)