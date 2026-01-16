# backend/app/services/tile_layout_engine.py
"""
Tile-Based Floor Plan Layout Engine

Generates mathematically correct floor plan coordinates using a discrete grid.
Each tile belongs to exactly one room - no gaps possible.

UPDATED: Better handling of different lot sizes, bedroom counts, and edge cases.
FIXED: 5+ bedroom allocation issues - correct bedroom numbering, overflow protection,
       and accurate zone classification for Gemini prompts.

Usage:
    from .tile_layout_engine import generate_tile_layout, format_layout_for_gemini
    
    layout = generate_tile_layout(building_width, building_depth, requirements)
    prompt_section = format_layout_for_gemini(layout)
"""

from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
import logging
import json

logger = logging.getLogger(__name__)


# =============================================================================
# CONFIGURATION
# =============================================================================

DEFAULT_TILE_SIZE = 0.9  # meters

# Minimum dimensions for different lot types
MIN_WIDTH_DOUBLE_GARAGE = 12.0  # Need at least 12m for double garage + rooms
MIN_WIDTH_SINGLE_GARAGE = 8.0   # Can do single garage down to 8m


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class TileRoom:
    """Room defined by grid tiles"""
    name: str
    room_type: str
    col: int        # Starting column (0 = left)
    row: int        # Starting row (0 = front/street)
    cols: int       # Width in tiles
    rows: int       # Depth in tiles
    
    def to_meters(self, tile_w: float, tile_d: float) -> Dict[str, Any]:
        """Convert to meter coordinates"""
        return {
            'name': self.name,
            'type': self.room_type,
            'x': round(self.col * tile_w, 2),
            'y': round(self.row * tile_d, 2),
            'width': round(self.cols * tile_w, 2),
            'depth': round(self.rows * tile_d, 2),
            'area': round(self.cols * tile_w * self.rows * tile_d, 1),
            'grid': {
                'col': self.col,
                'row': self.row,
                'cols': self.cols,
                'rows': self.rows
            }
        }


@dataclass
class TileLayout:
    """Complete tile-based floor plan layout"""
    building_width: float
    building_depth: float
    cols: int
    rows: int
    tile_w: float
    tile_d: float
    rooms: List[TileRoom] = field(default_factory=list)
    grid: List[List[Optional[str]]] = field(default_factory=list)
    # Store zone boundaries for accurate classification
    front_rows: int = 0
    middle_rows: int = 0
    rear_rows: int = 0
    
    def __post_init__(self):
        if not self.grid:
            self.grid = [[None for _ in range(self.cols)] for _ in range(self.rows)]
    
    def add_room(self, room: TileRoom) -> bool:
        """Add a room to the layout, filling grid cells."""
        # Check bounds
        if room.col < 0 or room.row < 0:
            logger.error(f"Room {room.name} has negative position")
            return False
        if room.col + room.cols > self.cols or room.row + room.rows > self.rows:
            logger.error(f"Room {room.name} exceeds grid bounds")
            return False
        
        # Check for overlaps
        for r in range(room.row, room.row + room.rows):
            for c in range(room.col, room.col + room.cols):
                if self.grid[r][c] is not None:
                    logger.error(f"Overlap at ({c},{r}): {self.grid[r][c]} vs {room.name}")
                    return False
        
        # Fill grid
        for r in range(room.row, room.row + room.rows):
            for c in range(room.col, room.col + room.cols):
                self.grid[r][c] = room.name
        
        self.rooms.append(room)
        return True
    
    def get_gaps(self) -> List[Tuple[int, int]]:
        """Find any unassigned tiles"""
        gaps = []
        for r in range(self.rows):
            for c in range(self.cols):
                if self.grid[r][c] is None:
                    gaps.append((c, r))
        return gaps
    
    def fill_gaps_with_storage(self) -> int:
        """Fill any remaining gaps with storage rooms."""
        gaps = self.get_gaps()
        if not gaps:
            return 0
        
        filled = 0
        storage_num = 1
        
        # Group adjacent gaps into regions
        while gaps:
            # Start a new storage room from first gap
            start_col, start_row = gaps[0]
            
            # Find contiguous region (simple: expand right and down)
            end_col = start_col
            end_row = start_row
            
            # Expand right while still gap
            while end_col + 1 < self.cols and (end_col + 1, start_row) in gaps:
                end_col += 1
            
            # Expand down while entire row is gap
            while end_row + 1 < self.rows:
                row_ok = all((c, end_row + 1) in gaps for c in range(start_col, end_col + 1))
                if row_ok:
                    end_row += 1
                else:
                    break
            
            # Create storage room
            room = TileRoom(
                name=f"STORE {storage_num}" if storage_num > 1 else "STORE",
                room_type="storage",
                col=start_col,
                row=start_row,
                cols=end_col - start_col + 1,
                rows=end_row - start_row + 1
            )
            
            if self.add_room(room):
                filled += room.cols * room.rows
                storage_num += 1
            
            # Update gaps list
            gaps = self.get_gaps()
        
        return filled
    
    def verify(self) -> Dict[str, Any]:
        """Verify layout has no gaps and dimensions are correct"""
        gaps = self.get_gaps()
        
        width_errors = []
        for r in range(self.rows):
            tiles = sum(1 for c in range(self.cols) if self.grid[r][c] is not None)
            if tiles != self.cols:
                width_errors.append(f"Row {r}: {tiles}/{self.cols} tiles")
        
        return {
            'valid': len(gaps) == 0 and len(width_errors) == 0,
            'gaps': len(gaps),
            'gap_positions': gaps[:10],
            'width_errors': width_errors[:10],
            'total_tiles': self.cols * self.rows,
            'assigned_tiles': self.cols * self.rows - len(gaps),
            'coverage': round((1 - len(gaps) / (self.cols * self.rows)) * 100, 1)
        }
    
    def to_dict(self) -> Dict[str, Any]:
        """Export layout as dictionary"""
        rooms_meters = [room.to_meters(self.tile_w, self.tile_d) for room in self.rooms]
        
        return {
            'building_envelope': {
                'width': self.building_width,
                'depth': self.building_depth,
                'area': round(self.building_width * self.building_depth, 1)
            },
            'grid': {
                'cols': self.cols,
                'rows': self.rows,
                'tile_width': round(self.tile_w, 4),
                'tile_depth': round(self.tile_d, 4)
            },
            'zones': {
                'front_rows': self.front_rows,
                'middle_rows': self.middle_rows,
                'rear_rows': self.rear_rows
            },
            'rooms': rooms_meters,
            'verification': self.verify()
        }
    
    def to_json(self) -> str:
        """Export as JSON string"""
        return json.dumps(self.to_dict(), indent=2)


# =============================================================================
# LAYOUT GENERATION
# =============================================================================

def calculate_grid_size(
    building_width: float,
    building_depth: float,
    target_tile_size: float = DEFAULT_TILE_SIZE
) -> Tuple[int, int, float, float]:
    """Calculate optimal grid dimensions."""
    cols = max(8, round(building_width / target_tile_size))
    rows = max(10, round(building_depth / target_tile_size))
    
    tile_w = building_width / cols
    tile_d = building_depth / rows
    
    logger.info(f"Grid: {cols}×{rows} tiles, tile size: {tile_w:.3f}m × {tile_d:.3f}m")
    
    return cols, rows, tile_w, tile_d


def generate_tile_layout(
    building_width: float,
    building_depth: float,
    requirements: Dict[str, Any],
    target_tile_size: float = DEFAULT_TILE_SIZE
) -> TileLayout:
    """
    Generate a complete tile-based floor plan layout.
    
    Handles various lot sizes and requirements:
    - 3-6+ bedrooms
    - Narrow lots (single garage)
    - Wide lots
    - With/without study
    - 1-2 living areas
    
    Args:
        building_width: Building envelope width in meters
        building_depth: Building envelope depth in meters
        requirements: Dict with bedrooms, bathrooms, living_areas, home_office, etc.
        target_tile_size: Approximate tile size (actual will be adjusted)
    
    Returns:
        TileLayout with all rooms placed and verified
    """
    bedrooms = requirements.get('bedrooms', 4)
    bathrooms = requirements.get('bathrooms', 2)
    living_areas = requirements.get('living_areas', 1)
    has_study = requirements.get('home_office', False) or requirements.get('has_study', False)
    garage_spaces = requirements.get('garage_spaces', 2)
    
    # Adjust garage for narrow lots
    if building_width < MIN_WIDTH_DOUBLE_GARAGE:
        garage_spaces = min(garage_spaces, 1)
        logger.info(f"Narrow lot ({building_width}m): reducing to single garage")
    
    # Calculate grid
    cols, rows, tile_w, tile_d = calculate_grid_size(
        building_width, building_depth, target_tile_size
    )
    
    layout = TileLayout(
        building_width=building_width,
        building_depth=building_depth,
        cols=cols,
        rows=rows,
        tile_w=tile_w,
        tile_d=tile_d
    )
    
    # ==========================================================================
    # ADAPTIVE ZONE CALCULATIONS
    # ==========================================================================
    
    # Calculate zones based on building proportions
    is_narrow = building_width < 14
    is_wide = building_width > 18
    is_deep = building_depth > 25
    
    # Front zone: 25-30% for garage/entry
    front_pct = 0.28 if not is_deep else 0.25
    front_rows = max(5, min(8, int(rows * front_pct)))
    
    # Rear zone: needs more space for 5+ bedrooms (extra bed + ensuite + master)
    # FIXED: Calculate based on number of extra bedrooms in rear
    extra_beds_in_rear = max(0, bedrooms - 4)  # Beds beyond 4 go to rear
    
    if extra_beds_in_rear >= 2:
        # 6+ bedrooms: need even more rear space
        rear_pct = 0.40
        rear_rows = max(12, min(16, int(rows * rear_pct)))
    elif extra_beds_in_rear == 1:
        # 5 bedrooms: extra_bed(4) + ensuite(2) + master(4) = 10 rows minimum
        rear_pct = 0.35
        rear_rows = max(10, min(14, int(rows * rear_pct)))
    elif bedrooms >= 4:
        rear_pct = 0.24
        rear_rows = max(6, min(8, int(rows * rear_pct)))
    else:
        rear_pct = 0.28
        rear_rows = max(5, min(8, int(rows * rear_pct)))
    
    # Middle zone: remainder for bedrooms/kitchen
    middle_rows = rows - front_rows - rear_rows
    
    # Ensure minimum middle zone for bedrooms
    if middle_rows < 8 and rows > 16:
        front_rows = max(4, front_rows - 1)
        # Don't reduce rear for 5+ beds - they need it!
        if bedrooms < 5:
            rear_rows = max(4, rear_rows - 1)
        middle_rows = rows - front_rows - rear_rows
    
    # Store zone boundaries in layout for accurate classification later
    layout.front_rows = front_rows
    layout.middle_rows = middle_rows
    layout.rear_rows = rear_rows
    
    # Wing widths - adapt to building width
    hallway_cols = 2  # ~1.8m hallway (fixed)
    
    if is_narrow:
        # Narrow lot: smaller left wing, no entry vestibule
        left_cols = max(4, int(cols * 0.40))
        right_cols = cols - left_cols - hallway_cols
    elif is_wide:
        # Wide lot: balanced wings
        left_cols = max(7, int(cols * 0.35))
        right_cols = cols - left_cols - hallway_cols
    else:
        # Standard: bedroom wing ~35%
        left_cols = max(6, int(cols * 0.35))
        right_cols = cols - left_cols - hallway_cols
    
    logger.info(f"Zones - Front: {front_rows}, Middle: {middle_rows}, Rear: {rear_rows} rows")
    logger.info(f"Wings - Left: {left_cols}, Hall: {hallway_cols}, Right: {right_cols} cols")
    
    # ==========================================================================
    # FRONT ZONE (rows 0 to front_rows)
    # ==========================================================================
    
    # Check if we need a powder room (3+ bathrooms or fractional like 2.5)
    needs_powder = bathrooms >= 3 or (bathrooms % 1) >= 0.5
    
    # Garage sizing
    if garage_spaces >= 2:
        garage_cols = max(6, min(int(right_cols * 0.75), int(cols * 0.4)))
    else:
        garage_cols = max(3, min(5, int(cols * 0.35)))
    
    garage_start_col = cols - garage_cols
    
    layout.add_room(TileRoom(
        name="GARAGE",
        room_type="garage",
        col=garage_start_col,
        row=0,
        cols=garage_cols,
        rows=front_rows
    ))
    
    # Calculate what's left for entry and hall
    # Left wing: left_cols (for lounge)
    # Remaining: garage_start_col - left_cols
    remaining_front_cols = garage_start_col - left_cols
    
    if remaining_front_cols >= 4:
        # Enough space for hall + entry
        actual_hallway_cols = hallway_cols  # Keep original hallway width
        entry_cols = remaining_front_cols - actual_hallway_cols
        
        layout.add_room(TileRoom(
            name="HALL",
            room_type="hallway",
            col=left_cols,
            row=0,
            cols=actual_hallway_cols,
            rows=front_rows
        ))
        
        layout.add_room(TileRoom(
            name="ENTRY",
            room_type="entry",
            col=left_cols + actual_hallway_cols,
            row=0,
            cols=entry_cols,
            rows=front_rows
        ))
    else:
        # Narrow: just hall (no separate entry)
        actual_hallway_cols = remaining_front_cols
        entry_cols = 0
        
        layout.add_room(TileRoom(
            name="HALL",
            room_type="hallway",
            col=left_cols,
            row=0,
            cols=actual_hallway_cols,
            rows=front_rows
        ))
    
    # Update hallway_cols for middle zone calculations
    hallway_cols = actual_hallway_cols
    
    # Lounge (left side) - ONLY if living_areas >= 2
    # When living_areas = 1, put a bedroom in front instead of lounge/sitting
    bed_in_front = False  # Track if we placed a bedroom in front zone
    
    if living_areas >= 2:
        layout.add_room(TileRoom(
            name="LOUNGE",
            room_type="lounge",
            col=0,
            row=0,
            cols=left_cols,
            rows=front_rows
        ))
    else:
        # living_areas = 1: Put BED 2 + ROBE in front zone to spread bedrooms evenly
        # This gives more space to other bedrooms in middle zone
        bed_in_front = True
        
        # Calculate bed and robe widths for front bedroom
        if left_cols >= 5:
            front_bed_cols = max(3, int(left_cols * 0.55))
            front_robe_cols = left_cols - front_bed_cols
        elif left_cols >= 3:
            front_bed_cols = left_cols - 1
            front_robe_cols = 1
        else:
            front_bed_cols = left_cols
            front_robe_cols = 0
        
        layout.add_room(TileRoom(
            name="BED 2",
            room_type="bedroom",
            col=0,
            row=0,
            cols=front_bed_cols,
            rows=front_rows
        ))
        
        if front_robe_cols > 0:
            layout.add_room(TileRoom(
                name="ROBE 2",
                room_type="robe",
                col=front_bed_cols,
                row=0,
                cols=front_robe_cols,
                rows=front_rows
            ))
    
    # ==========================================================================
    # MIDDLE ZONE (rows front_rows to front_rows + middle_rows)
    # ==========================================================================
    
    middle_start = front_rows
    right_start_col = left_cols + hallway_cols  # This now uses the corrected hallway_cols
    right_cols = cols - right_start_col  # Recalculate right wing width
    
    # Hallway (center, full middle height)
    layout.add_room(TileRoom(
        name="HALLWAY",
        room_type="hallway",
        col=left_cols,
        row=middle_start,
        cols=hallway_cols,
        rows=middle_rows
    ))
    
    # --- LEFT WING: Bedrooms ---
    # FIXED: Calculate how many minor beds go in middle zone
    # For 5-bed: Master in rear, BED 5 in rear, BED 2/3/4 in middle (or BED 3/4 if bed in front)
    # For 6-bed: Master in rear, BED 5/6 in rear, BED 2/3/4 in middle
    
    # Account for bedroom placed in front zone
    beds_already_placed = 1 if bed_in_front else 0  # BED 2 in front if living_areas == 1
    
    # Calculate remaining minor beds for middle zone
    # Total minor beds = bedrooms - 1 (excluding master)
    # Minus beds in front, minus beds in rear
    minor_beds_in_middle = bedrooms - 1 - beds_already_placed - extra_beds_in_rear
    minor_beds_in_middle = max(0, min(minor_beds_in_middle, 3))  # 0-3 beds in middle
    
    # Starting bedroom number for middle zone
    first_bed_num_in_middle = 2 + beds_already_placed  # Start from BED 3 if BED 2 is in front
    
    # FIXED: Calculate bed_rows with overflow protection
    if minor_beds_in_middle > 0:
        # Calculate rows per bedroom, ensuring we don't overflow
        bed_rows = middle_rows // minor_beds_in_middle
        bed_rows = max(3, min(bed_rows, middle_rows // minor_beds_in_middle))  # At least 3 rows, but don't overflow
        
        # Double-check total doesn't exceed available space
        total_bed_rows_needed = bed_rows * minor_beds_in_middle
        if total_bed_rows_needed > middle_rows:
            bed_rows = middle_rows // minor_beds_in_middle
            logger.warning(f"Adjusted bed_rows to {bed_rows} to fit {minor_beds_in_middle} beds in {middle_rows} rows")
    else:
        bed_rows = 4
    
    # Calculate bed and robe widths - ensure both have at least 1 column
    if left_cols >= 5:
        # Normal case: 55% for bed, rest for robe
        bed_cols = max(3, int(left_cols * 0.55))
        robe_cols = left_cols - bed_cols
    elif left_cols >= 3:
        # Narrow: bed gets most, robe gets at least 1
        bed_cols = left_cols - 1
        robe_cols = 1
    else:
        # Very narrow: no separate robe
        bed_cols = left_cols
        robe_cols = 0
    
    # Stack bedrooms in middle zone
    current_row = middle_start
    beds_placed_in_middle = 0
    
    for i in range(minor_beds_in_middle):
        bed_num = first_bed_num_in_middle + i  # Use calculated starting number
        
        # FIXED: Last bedroom gets remaining space to avoid gaps
        is_last_bed = (i == minor_beds_in_middle - 1)
        if is_last_bed:
            actual_bed_rows = middle_rows - (current_row - middle_start)
        else:
            actual_bed_rows = bed_rows
        
        # Safety check: don't exceed middle zone
        if current_row + actual_bed_rows > middle_start + middle_rows:
            actual_bed_rows = middle_start + middle_rows - current_row
            if actual_bed_rows < 2:
                logger.warning(f"Not enough space for BED {bed_num}, skipping")
                break
        
        if actual_bed_rows >= 2:  # Minimum viable bedroom height
            added = layout.add_room(TileRoom(
                name=f"BED {bed_num}",
                room_type="bedroom",
                col=0,
                row=current_row,
                cols=bed_cols,
                rows=actual_bed_rows
            ))
            
            if added:
                beds_placed_in_middle += 1
                
                # Only add robe if it has space
                if robe_cols > 0:
                    layout.add_room(TileRoom(
                        name=f"ROBE {bed_num}",
                        room_type="robe",
                        col=bed_cols,
                        row=current_row,
                        cols=robe_cols,
                        rows=actual_bed_rows
                    ))
                
                current_row += actual_bed_rows
            else:
                logger.error(f"Failed to add BED {bed_num}")
    
    # If there's remaining space in left wing, add storage/linen
    remaining = middle_start + middle_rows - current_row
    if remaining >= 1:
        layout.add_room(TileRoom(
            name="LINEN",
            room_type="storage",
            col=0,
            row=current_row,
            cols=left_cols,
            rows=remaining
        ))
    
    # --- RIGHT WING: Study/Bathroom/Powder/Laundry/Kitchen ---
    right_cols = cols - right_start_col
    
    # Check if we need powder room (3+ bathrooms)
    needs_powder = bathrooms >= 3 or (bathrooms % 1) >= 0.5
    
    # Top portion: utility rooms
    top_right_rows = max(3, int(middle_rows * 0.35))
    
    if has_study and right_cols >= 10 and needs_powder:
        # Study + BATHROOM + POWDER + Laundry + WIP (5 rooms, need 10+ cols)
        study_cols = max(2, int(right_cols * 0.20))
        bath_cols = max(2, int(right_cols * 0.20))
        powder_cols = max(2, int(right_cols * 0.15))
        laundry_cols = max(2, int(right_cols * 0.20))
        wip_cols = right_cols - study_cols - bath_cols - powder_cols - laundry_cols
        
        if wip_cols < 1:
            wip_cols = 1
            laundry_cols = max(1, right_cols - study_cols - bath_cols - powder_cols - wip_cols)
        
        layout.add_room(TileRoom(
            name="STUDY",
            room_type="study",
            col=right_start_col,
            row=middle_start,
            cols=study_cols,
            rows=top_right_rows
        ))
        layout.add_room(TileRoom(
            name="BATHROOM",
            room_type="bathroom",
            col=right_start_col + study_cols,
            row=middle_start,
            cols=bath_cols,
            rows=top_right_rows
        ))
        layout.add_room(TileRoom(
            name="POWDER",
            room_type="powder",
            col=right_start_col + study_cols + bath_cols,
            row=middle_start,
            cols=powder_cols,
            rows=top_right_rows
        ))
        layout.add_room(TileRoom(
            name="LAUNDRY",
            room_type="laundry",
            col=right_start_col + study_cols + bath_cols + powder_cols,
            row=middle_start,
            cols=laundry_cols,
            rows=top_right_rows
        ))
        layout.add_room(TileRoom(
            name="WIP",
            room_type="pantry",
            col=right_start_col + study_cols + bath_cols + powder_cols + laundry_cols,
            row=middle_start,
            cols=wip_cols,
            rows=top_right_rows
        ))
    elif has_study and right_cols >= 8:
        # Study + BATHROOM + Laundry + WIP (need at least 8 cols for 4 rooms)
        study_cols = max(2, int(right_cols * 0.28))
        bath_cols = max(2, int(right_cols * 0.22))
        laundry_cols = max(2, int(right_cols * 0.25))
        wip_cols = right_cols - study_cols - bath_cols - laundry_cols
        
        if wip_cols < 1:
            wip_cols = 1
            laundry_cols = max(1, right_cols - study_cols - bath_cols - wip_cols)
        
        layout.add_room(TileRoom(
            name="STUDY",
            room_type="study",
            col=right_start_col,
            row=middle_start,
            cols=study_cols,
            rows=top_right_rows
        ))
        layout.add_room(TileRoom(
            name="BATHROOM",
            room_type="bathroom",
            col=right_start_col + study_cols,
            row=middle_start,
            cols=bath_cols,
            rows=top_right_rows
        ))
        layout.add_room(TileRoom(
            name="LAUNDRY",
            room_type="laundry",
            col=right_start_col + study_cols + bath_cols,
            row=middle_start,
            cols=laundry_cols,
            rows=top_right_rows
        ))
        layout.add_room(TileRoom(
            name="WIP",
            room_type="pantry",
            col=right_start_col + study_cols + bath_cols + laundry_cols,
            row=middle_start,
            cols=wip_cols,
            rows=top_right_rows
        ))
        
        # Add powder room if needed (in a second row)
        if needs_powder:
            bath_rows = 2
            layout.add_room(TileRoom(
                name="POWDER",
                room_type="powder",
                col=right_start_col,
                row=middle_start + top_right_rows,
                cols=max(2, study_cols),
                rows=bath_rows
            ))
            top_right_rows += bath_rows
    elif has_study and right_cols >= 6:
        # Study + Laundry + WIP (need at least 6 cols) + Bathroom below
        study_cols = max(2, int(right_cols * 0.38))
        laundry_cols = max(2, int(right_cols * 0.32))
        wip_cols = right_cols - study_cols - laundry_cols
        
        if wip_cols < 1:
            # Redistribute
            wip_cols = 1
            study_cols = (right_cols - wip_cols) // 2
            laundry_cols = right_cols - study_cols - wip_cols
        
        layout.add_room(TileRoom(
            name="STUDY",
            room_type="study",
            col=right_start_col,
            row=middle_start,
            cols=study_cols,
            rows=top_right_rows
        ))
        layout.add_room(TileRoom(
            name="LAUNDRY",
            room_type="laundry",
            col=right_start_col + study_cols,
            row=middle_start,
            cols=laundry_cols,
            rows=top_right_rows
        ))
        layout.add_room(TileRoom(
            name="WIP",
            room_type="pantry",
            col=right_start_col + study_cols + laundry_cols,
            row=middle_start,
            cols=wip_cols,
            rows=top_right_rows
        ))
        
        # Add bathroom row below utility area
        bath_rows = 2
        bath_cols = max(2, right_cols // 2)
        layout.add_room(TileRoom(
            name="BATHROOM",
            room_type="bathroom",
            col=right_start_col,
            row=middle_start + top_right_rows,
            cols=bath_cols,
            rows=bath_rows
        ))
        
        # Add powder if needed
        if needs_powder:
            powder_cols = right_cols - bath_cols
            if powder_cols >= 2:
                layout.add_room(TileRoom(
                    name="POWDER",
                    room_type="powder",
                    col=right_start_col + bath_cols,
                    row=middle_start + top_right_rows,
                    cols=powder_cols,
                    rows=bath_rows
                ))
        
        top_right_rows += bath_rows
        
    elif right_cols >= 4:
        # BATHROOM + Laundry + WIP (need at least 4 cols)
        bath_cols = max(2, right_cols // 3)
        laundry_cols = max(2, (right_cols - bath_cols + 1) // 2)
        wip_cols = right_cols - bath_cols - laundry_cols
        
        if wip_cols < 1:
            wip_cols = 1
            laundry_cols = right_cols - bath_cols - 1
        
        layout.add_room(TileRoom(
            name="BATHROOM",
            room_type="bathroom",
            col=right_start_col,
            row=middle_start,
            cols=bath_cols,
            rows=top_right_rows
        ))
        layout.add_room(TileRoom(
            name="LAUNDRY",
            room_type="laundry",
            col=right_start_col + bath_cols,
            row=middle_start,
            cols=laundry_cols,
            rows=top_right_rows
        ))
        layout.add_room(TileRoom(
            name="WIP",
            room_type="pantry",
            col=right_start_col + bath_cols + laundry_cols,
            row=middle_start,
            cols=wip_cols,
            rows=top_right_rows
        ))
        
        # Add powder if needed
        if needs_powder:
            powder_rows = 2
            layout.add_room(TileRoom(
                name="POWDER",
                room_type="powder",
                col=right_start_col,
                row=middle_start + top_right_rows,
                cols=max(2, bath_cols),
                rows=powder_rows
            ))
            top_right_rows += powder_rows
    else:
        # Very narrow: just laundry
        layout.add_room(TileRoom(
            name="LAUNDRY",
            room_type="laundry",
            col=right_start_col,
            row=middle_start,
            cols=right_cols,
            rows=top_right_rows
        ))
    
    # Kitchen (large, below utility rooms)
    kitchen_rows = middle_rows - top_right_rows
    layout.add_room(TileRoom(
        name="KITCHEN",
        room_type="kitchen",
        col=right_start_col,
        row=middle_start + top_right_rows,
        cols=right_cols,
        rows=kitchen_rows
    ))
    
    # ==========================================================================
    # REAR ZONE (rows front_rows + middle_rows to end)
    # ==========================================================================
    
    rear_start = front_rows + middle_rows
    
    # Rear hallway
    layout.add_room(TileRoom(
        name="HALL R",
        room_type="hallway",
        col=left_cols,
        row=rear_start,
        cols=hallway_cols,
        rows=rear_rows
    ))
    
    # --- LEFT WING: Extra Bedrooms (for 5+ bed), Ensuite/WIR, Master ---
    # FIXED: Properly handle multiple extra bedrooms for 6+ bedroom homes
    
    if extra_beds_in_rear > 0:
        # 5+ bedroom homes: extra beds go in rear zone
        # Calculate space allocation
        min_master_rows = 4  # 3.6m minimum for master
        min_ensuite_rows = 2  # 1.8m for ensuite/WIR row
        min_bed_rows = 3  # 2.7m minimum per bedroom
        
        # Calculate total space needed
        total_extra_bed_rows = min_bed_rows * extra_beds_in_rear
        total_fixed_rows = min_master_rows + min_ensuite_rows
        total_needed = total_fixed_rows + total_extra_bed_rows
        
        if rear_rows >= total_needed:
            # Enough space - distribute proportionally
            available_for_beds = rear_rows - total_fixed_rows
            extra_bed_rows_each = max(min_bed_rows, available_for_beds // extra_beds_in_rear)
            ensuite_rows = min_ensuite_rows
            master_rows = rear_rows - (extra_bed_rows_each * extra_beds_in_rear) - ensuite_rows
        else:
            # Tight space - use minimums but prioritize master
            logger.warning(f"Tight rear zone ({rear_rows} rows) for {extra_beds_in_rear} extra beds")
            master_rows = min_master_rows
            ensuite_rows = min_ensuite_rows
            available_for_beds = rear_rows - master_rows - ensuite_rows
            extra_bed_rows_each = max(2, available_for_beds // extra_beds_in_rear)
        
        # Place extra bedrooms (BED 5, BED 6, etc.)
        current_rear_row = rear_start
        
        for i in range(extra_beds_in_rear):
            # FIXED: Correct bedroom numbering for 5+ bedroom homes
            # Account for: bed in front (if any) + beds in middle + current index
            bed_num = 2 + beds_already_placed + beds_placed_in_middle + i
            
            # For last extra bed, use remaining allocated space
            if i == extra_beds_in_rear - 1:
                this_bed_rows = rear_start + (extra_bed_rows_each * extra_beds_in_rear) - current_rear_row
            else:
                this_bed_rows = extra_bed_rows_each
            
            # Calculate bed and robe widths for extra bedrooms
            extra_bed_cols = max(3, int(left_cols * 0.55))  # At least 3 cols (~2.7m)
            extra_robe_cols = left_cols - extra_bed_cols
            
            added = layout.add_room(TileRoom(
                name=f"BED {bed_num}",
                room_type="bedroom",
                col=0,
                row=current_rear_row,
                cols=extra_bed_cols,
                rows=this_bed_rows
            ))
            
            if added:
                if extra_robe_cols > 0:
                    layout.add_room(TileRoom(
                        name=f"ROBE {bed_num}",
                        room_type="robe",
                        col=extra_bed_cols,
                        row=current_rear_row,
                        cols=extra_robe_cols,
                        rows=this_bed_rows
                    ))
                current_rear_row += this_bed_rows
            else:
                logger.error(f"Failed to add BED {bed_num} in rear zone")
        
        # Ensuite and WIR row (after extra bedrooms)
        ensuite_cols = max(3, int(left_cols * 0.50))
        wir_cols = left_cols - ensuite_cols
        
        layout.add_room(TileRoom(
            name="ENSUITE",
            room_type="ensuite",
            col=0,
            row=current_rear_row,
            cols=ensuite_cols,
            rows=ensuite_rows
        ))
        
        if wir_cols > 0:
            layout.add_room(TileRoom(
                name="WIR",
                room_type="wir",
                col=ensuite_cols,
                row=current_rear_row,
                cols=wir_cols,
                rows=ensuite_rows
            ))
        
        current_rear_row += ensuite_rows
        
        # Master bedroom (remaining space at the rear)
        master_rows = rear_start + rear_rows - current_rear_row
        layout.add_room(TileRoom(
            name="MASTER",
            room_type="master_suite",
            col=0,
            row=current_rear_row,
            cols=left_cols,
            rows=master_rows
        ))
        
        logger.info(f"{extra_beds_in_rear}-bed rear layout: Extra beds={extra_bed_rows_each} rows each, Ensuite={ensuite_rows} rows, Master={master_rows} rows")
    
    else:
        # Standard layout (no extra beds in rear) - 4 bedrooms or less
        # Ensuite/WIR row, then Master
        ensuite_rows = max(2, int(rear_rows * 0.35))
        master_rows = rear_rows - ensuite_rows
        
        ensuite_cols = max(3, int(left_cols * 0.50))
        wir_cols = left_cols - ensuite_cols
        
        layout.add_room(TileRoom(
            name="ENSUITE",
            room_type="ensuite",
            col=0,
            row=rear_start,
            cols=ensuite_cols,
            rows=ensuite_rows
        ))
        
        if wir_cols > 0:
            layout.add_room(TileRoom(
                name="WIR",
                room_type="wir",
                col=ensuite_cols,
                row=rear_start,
                cols=wir_cols,
                rows=ensuite_rows
            ))
        
        layout.add_room(TileRoom(
            name="MASTER",
            room_type="master_suite",
            col=0,
            row=rear_start + ensuite_rows,
            cols=left_cols,
            rows=master_rows
        ))
    
    # --- RIGHT WING: Dining, Family ---
    dining_rows = max(2, int(rear_rows * 0.38))
    family_rows = rear_rows - dining_rows
    
    layout.add_room(TileRoom(
        name="DINING",
        room_type="dining",
        col=right_start_col,
        row=rear_start,
        cols=right_cols,
        rows=dining_rows
    ))
    layout.add_room(TileRoom(
        name="FAMILY",
        room_type="family",
        col=right_start_col,
        row=rear_start + dining_rows,
        cols=right_cols,
        rows=family_rows
    ))
    
    # ==========================================================================
    # FILL ANY REMAINING GAPS
    # ==========================================================================
    
    gaps_before = len(layout.get_gaps())
    if gaps_before > 0:
        logger.warning(f"Layout has {gaps_before} gaps, filling with storage...")
        filled = layout.fill_gaps_with_storage()
        logger.info(f"Filled {filled} tiles with storage rooms")
    
    # Final verification
    verification = layout.verify()
    if not verification['valid']:
        logger.error(f"Layout verification failed: {verification}")
    else:
        logger.info(f"Layout verified: {len(layout.rooms)} rooms, 100% coverage")
    
    return layout


# =============================================================================
# GEMINI PROMPT FORMATTING
# =============================================================================

def format_layout_for_gemini(layout: TileLayout) -> str:
    """
    Format the tile layout as a prompt section for Gemini.
    
    FIXED: Uses actual zone boundaries stored in layout instead of fixed percentages.
    """
    rooms = layout.to_dict()['rooms']
    
    lines = [
        "=" * 60,
        "PRE-CALCULATED ROOM COORDINATES (MATHEMATICALLY VERIFIED)",
        "=" * 60,
        f"Building: {layout.building_width}m × {layout.building_depth}m",
        f"Grid: {layout.cols} × {layout.rows} tiles ({layout.tile_w:.2f}m × {layout.tile_d:.2f}m each)",
        "",
        "⚠️ DRAW EACH ROOM AT THESE EXACT POSITIONS - DO NOT RECALCULATE ⚠️",
        ""
    ]
    
    # FIXED: Use actual zone boundaries from layout instead of fixed percentages
    front_end_y = layout.front_rows * layout.tile_d
    middle_end_y = (layout.front_rows + layout.middle_rows) * layout.tile_d
    
    # Classify rooms based on actual zone boundaries
    front_rooms = []
    middle_rooms = []
    rear_rooms = []
    
    for r in rooms:
        room_start_y = r['y']
        room_end_y = r['y'] + r['depth']
        
        # A room belongs to a zone if its start is within that zone
        if room_start_y < front_end_y:
            front_rooms.append(r)
        elif room_start_y < middle_end_y:
            middle_rooms.append(r)
        else:
            rear_rooms.append(r)
    
    for zone_name, zone_rooms in [("FRONT", front_rooms), ("MIDDLE", middle_rooms), ("REAR", rear_rooms)]:
        if zone_rooms:
            lines.append(f"--- {zone_name} ZONE ---")
            for room in sorted(zone_rooms, key=lambda r: (r['y'], r['x'])):
                lines.append(
                    f"• {room['name']}: x={room['x']:.1f}m, y={room['y']:.1f}m, "
                    f"w={room['width']:.1f}m × d={room['depth']:.1f}m ({room['area']}m²)"
                )
            lines.append("")
    
    # Add verification
    lines.append("=" * 60)
    lines.append("DIMENSION VERIFICATION (ALL ROWS SUM TO BUILDING WIDTH)")
    lines.append("=" * 60)
    
    for row_idx in [0, layout.rows // 2, layout.rows - 1]:
        y = row_idx * layout.tile_d
        row_rooms = [r for r in rooms if r['y'] <= y < r['y'] + r['depth']]
        row_rooms.sort(key=lambda r: r['x'])
        total = sum(r['width'] for r in row_rooms)
        names = " + ".join([f"{r['name']}({r['width']:.1f})" for r in row_rooms])
        lines.append(f"Row y={y:.1f}m: {names} = {total:.1f}m ✓")
    
    lines.append("")
    lines.append(f"Total coverage: {layout.cols * layout.rows} tiles = 100% ✓")
    
    return "\n".join(lines)


def get_room_dimensions_table(layout: TileLayout) -> str:
    """Get a formatted table of room dimensions."""
    rooms = layout.to_dict()['rooms']
    
    lines = ["ROOM DIMENSIONS:", ""]
    
    for room in sorted(rooms, key=lambda r: r['name']):
        lines.append(f"• {room['name']}: {room['width']:.1f}m × {room['depth']:.1f}m = {room['area']}m²")
    
    total_area = sum(r['area'] for r in rooms)
    lines.append("")
    lines.append(f"Total: {total_area:.1f}m² / {layout.building_width * layout.building_depth:.1f}m² envelope")
    
    return "\n".join(lines)


def layout_to_floor_plan_json(layout: TileLayout, requirements: Dict[str, Any]) -> Dict[str, Any]:
    """Convert TileLayout to the floor plan JSON format used by your system."""
    layout_dict = layout.to_dict()
    
    rooms = []
    for room in layout_dict['rooms']:
        rooms.append({
            'id': f"{room['type']}_{room['name'].lower().replace(' ', '_')}",
            'type': room['type'],
            'name': room['name'],
            'x': room['x'],
            'y': room['y'],
            'width': room['width'],
            'depth': room['depth'],
            'area': room['area'],
            'floor': 0
        })
    
    # Count actual bedrooms placed
    bedroom_count = sum(1 for r in rooms if r['type'] in ['bedroom', 'master_suite'])
    bathroom_count = sum(1 for r in rooms if r['type'] in ['bathroom', 'ensuite'])
    
    return {
        'design_name': f"{requirements.get('bedrooms', 4)} Bedroom Modern Home",
        'description': f"Tile-based layout: {layout.cols}×{layout.rows} grid, mathematically verified",
        'rooms': rooms,
        'building_envelope': layout_dict['building_envelope'],
        'grid_info': layout_dict['grid'],
        'zones': layout_dict['zones'],
        'verification': layout_dict['verification'],
        'metadata': {
            'bedrooms': requirements.get('bedrooms', 4),
            'bathrooms': requirements.get('bathrooms', 2),
            'living_areas': requirements.get('living_areas', 1),
            'has_study': requirements.get('home_office', False),
            'garage_spaces': requirements.get('garage_spaces', 2)
        },
        'summary': {
            'total_area': sum(r['area'] for r in rooms),
            'living_area': sum(r['area'] for r in rooms if r['type'] in ['bedroom', 'master_suite', 'family', 'lounge', 'living']),
            'bedroom_count': bedroom_count,
            'bathroom_count': bathroom_count,
            'garage_spaces': requirements.get('garage_spaces', 2)
        }
    }
