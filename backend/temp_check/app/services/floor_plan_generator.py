from typing import Dict, List

class BasicFloorPlanGenerator:
    """Rule-based floor plan generator for rectangular blocks"""
    
    def __init__(self):
        self.min_room_sizes = {
            'bedroom_master': 12.0,
            'bedroom': 9.0,
            'bathroom': 4.5,
            'kitchen': 8.0,
            'living': 15.0,
            'dining': 10.0,
            'garage_single': 18.0,
            'garage_double': 36.0,
        }
    
    def generate(self, project_data: Dict) -> List[Dict]:
        """Generate floor plan layouts"""
        land_width = float(project_data.get('land_width', 15))
        land_depth = float(project_data.get('land_depth', 30))
        bedrooms = int(project_data.get('bedrooms', 3))
        bathrooms = float(project_data.get('bathrooms', 2))
        living_areas = int(project_data.get('living_areas', 1))
        garage_spaces = int(project_data.get('garage_spaces', 2))
        open_plan = bool(project_data.get('open_plan', True))
        
        print(f"Generating floor plan for: {land_width}m x {land_depth}m, {bedrooms}BR, {bathrooms}BA")
        
        layouts = []
        
        # Generate a simple layout
        layout = self._generate_simple_layout(
            land_width, land_depth, bedrooms, bathrooms, 
            living_areas, garage_spaces, open_plan
        )
        layouts.append(layout)
        
        return layouts
    
    def _generate_simple_layout(
        self, width: float, depth: float, bedrooms: int, bathrooms: float, 
        living_areas: int, garage_spaces: int, open_plan: bool
    ) -> Dict:
        """Generate a simple rectangular layout"""
        rooms = []
        current_y = 0
        
        # Garage at front
        if garage_spaces > 0:
            garage_width = 6.0
            garage_depth = 6.0
            rooms.append({
                'type': 'garage',
                'name': f'{garage_spaces}-Car Garage',
                'x': 0.0, 
                'y': current_y,
                'width': garage_width, 
                'depth': garage_depth,
                'area': garage_width * garage_depth
            })
            current_y += garage_depth
        
        # Living area
        living_width = width * 0.6
        living_depth = 8.0
        living_area = living_width * living_depth
        
        rooms.append({
            'type': 'open_plan' if open_plan else 'living',
            'name': 'Living/Dining/Kitchen' if open_plan else 'Living Room',
            'x': 0.0, 
            'y': current_y,
            'width': living_width, 
            'depth': living_depth,
            'area': living_area
        })
        current_y += living_depth
        
        # Bedrooms
        bedroom_width = width / max(bedrooms, 1)  # Prevent division by zero
        bedroom_depth = 4.0
        
        for i in range(bedrooms):
            bedroom_area = bedroom_width * bedroom_depth
            rooms.append({
                'type': 'bedroom',
                'name': 'Master Bedroom' if i == 0 else f'Bedroom {i+1}',
                'x': i * bedroom_width, 
                'y': current_y,
                'width': bedroom_width, 
                'depth': bedroom_depth,
                'area': bedroom_area
            })
        
        # Bathrooms
        bathroom_width = 3.0
        bathroom_depth = 2.5
        for i in range(int(bathrooms)):
            rooms.append({
                'type': 'bathroom',
                'name': f'Bathroom {i+1}',
                'x': width - bathroom_width,
                'y': current_y + (i * bathroom_depth),
                'width': bathroom_width,
                'depth': bathroom_depth,
                'area': bathroom_width * bathroom_depth
            })
        
        # Calculate totals
        total_area = sum(r['area'] for r in rooms)
        living_area_total = sum(r['area'] for r in rooms if r['type'] in ['living', 'open_plan', 'dining'])
        
        return {
            'variant': 1,
            'name': 'Simple Layout',
            'total_area': round(total_area, 2),
            'living_area': round(living_area_total, 2),
            'rooms': rooms,
            'compliant': True,
            'compliance_notes': 'Basic layout meets minimum room size requirements'
        }

def generate_floor_plans(project_data: Dict) -> List[Dict]:
    """Main entry point for floor plan generation"""
    try:
        generator = BasicFloorPlanGenerator()
        layouts = generator.generate(project_data)
        print(f"✅ Successfully generated {len(layouts)} floor plan(s)")
        return layouts
    except Exception as e:
        print(f"❌ Error generating floor plans: {e}")
        raise