'use client';

import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Ruler, Sofa, Grid3X3 } from 'lucide-react';

interface Room {
  id?: string;
  type: string;
  name: string;
  x?: number;
  y?: number;
  width: number;
  depth: number;
  area?: number;
  floor?: number;
  features?: string[];
  doors?: Array<{ to?: string; type?: string; wall?: string }>;
  windows?: Array<{ wall?: string; width?: number }>;
}

interface LayoutData {
  rooms?: Room[];
  total_area?: number;
  variant_name?: string;
  design_name?: string;
  description?: string;
  summary?: {
    total_area?: number;
    bedroom_count?: number;
    bathroom_count?: number;
    garage_spaces?: number;
  };
}

interface FloorPlanCanvasProps {
  data?: LayoutData;
  layoutData?: LayoutData;
  compact?: boolean;
  selectedFloor?: number;
  showDimensions?: boolean;
  showFurniture?: boolean;
  showGrid?: boolean;
  scale?: number;
}

// Professional architectural colors (subtle, not garish)
const ROOM_COLORS: Record<string, { fill: string; stroke: string }> = {
  garage: { fill: '#f5f5f5', stroke: '#374151' },
  double_garage: { fill: '#f5f5f5', stroke: '#374151' },
  entry: { fill: '#fffbeb', stroke: '#92400e' },
  foyer: { fill: '#fffbeb', stroke: '#92400e' },
  front_porch: { fill: '#fffbeb', stroke: '#92400e' },
  porch: { fill: '#fef3c7', stroke: '#92400e' },
  family: { fill: '#eff6ff', stroke: '#1e40af' },
  living: { fill: '#eff6ff', stroke: '#1e40af' },
  open_plan: { fill: '#eff6ff', stroke: '#1e40af' },
  theatre: { fill: '#eef2ff', stroke: '#3730a3' },
  media: { fill: '#eef2ff', stroke: '#3730a3' },
  dining: { fill: '#fdf2f8', stroke: '#9d174d' },
  dining_area: { fill: '#fdf2f8', stroke: '#9d174d' },
  kitchen: { fill: '#ecfdf5', stroke: '#065f46' },
  pantry: { fill: '#d1fae5', stroke: '#047857' },
  walk_in_pantry: { fill: '#d1fae5', stroke: '#047857' },
  butlers_pantry: { fill: '#d1fae5', stroke: '#047857' },
  laundry: { fill: '#e0f2fe', stroke: '#0369a1' },
  bedroom: { fill: '#f3e8ff', stroke: '#6b21a8' },
  master: { fill: '#fae8ff', stroke: '#86198f' },
  master_bedroom: { fill: '#fae8ff', stroke: '#86198f' },
  ensuite: { fill: '#e0f2fe', stroke: '#0284c7' },
  master_ensuite: { fill: '#e0f2fe', stroke: '#0284c7' },
  bathroom: { fill: '#e0f2fe', stroke: '#0284c7' },
  main_bathroom: { fill: '#e0f2fe', stroke: '#0284c7' },
  powder: { fill: '#e0f2fe', stroke: '#0284c7' },
  wir: { fill: '#fef3c7', stroke: '#b45309' },
  walk_in_robe: { fill: '#fef3c7', stroke: '#b45309' },
  robe: { fill: '#fef3c7', stroke: '#b45309' },
  office: { fill: '#fef2f2', stroke: '#b91c1c' },
  study: { fill: '#fef2f2', stroke: '#b91c1c' },
  home_office: { fill: '#fef2f2', stroke: '#b91c1c' },
  store: { fill: '#f3f4f6', stroke: '#6b7280' },
  storage: { fill: '#f3f4f6', stroke: '#6b7280' },
  alfresco: { fill: '#dcfce7', stroke: '#15803d' },
  outdoor: { fill: '#dcfce7', stroke: '#15803d' },
  hallway: { fill: '#fafafa', stroke: '#a1a1aa' },
  hall: { fill: '#fafafa', stroke: '#a1a1aa' },
  linen: { fill: '#f3f4f6', stroke: '#9ca3af' },
};

export default function FloorPlanCanvas({
  data,
  layoutData,
  compact = false,
  selectedFloor = 0,
  showDimensions: propShowDimensions = true,
  showFurniture: propShowFurniture = true,
  showGrid: propShowGrid = false,
  scale: propScale = 1,
}: FloorPlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(propScale);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showFurniture, setShowFurniture] = useState(propShowFurniture);
  const [showGrid, setShowGrid] = useState(propShowGrid);
  const [showDimensions, setShowDimensions] = useState(propShowDimensions);

  const floorPlanData = layoutData || data;

  useEffect(() => { setShowFurniture(propShowFurniture); }, [propShowFurniture]);
  useEffect(() => { setShowGrid(propShowGrid); }, [propShowGrid]);
  useEffect(() => { setShowDimensions(propShowDimensions); }, [propShowDimensions]);
  useEffect(() => { setScale(propScale); }, [propScale]);

  // Auto-layout rooms if no x/y coordinates
  const layoutRooms = (rooms: Room[]): Room[] => {
    if (rooms.length === 0) return [];
    const floorRooms = rooms.filter(r => (r.floor || 0) === selectedFloor);
    if (floorRooms.every(r => r.x !== undefined && r.y !== undefined)) {
      return floorRooms;
    }

    const layouted: Room[] = [];
    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;
    const maxWidth = 25;

    floorRooms.forEach((room) => {
      const width = room.width || 4;
      const depth = room.depth || 4;
      if (currentX + width > maxWidth && currentX > 0) {
        currentX = 0;
        currentY += rowHeight + 0.3;
        rowHeight = 0;
      }
      layouted.push({ ...room, x: currentX, y: currentY, width, depth, area: room.area || width * depth });
      currentX += width + 0.3;
      rowHeight = Math.max(rowHeight, depth);
    });
    return layouted;
  };

  useEffect(() => {
    drawFloorPlan();
  }, [floorPlanData, scale, offset, showFurniture, showGrid, showDimensions, selectedFloor]);

  const drawFloorPlan = () => {
    const canvas = canvasRef.current;
    if (!canvas || !floorPlanData?.rooms || floorPlanData.rooms.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High DPI support
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    const rooms = layoutRooms(floorPlanData.rooms);
    if (rooms.length === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No rooms on this floor', displayWidth / 2, displayHeight / 2);
      return;
    }

    // Calculate bounds
    const minX = Math.min(...rooms.map(r => r.x || 0));
    const minY = Math.min(...rooms.map(r => r.y || 0));
    const maxX = Math.max(...rooms.map(r => (r.x || 0) + r.width));
    const maxY = Math.max(...rooms.map(r => (r.y || 0) + r.depth));

    const padding = compact ? 20 : 60;
    const dimSpace = compact ? 0 : 30;
    const scaleX = (displayWidth - padding * 2 - dimSpace * 2) / ((maxX - minX) || 1);
    const scaleY = (displayHeight - padding * 2 - dimSpace * 2) / ((maxY - minY) || 1);
    const autoScale = Math.min(scaleX, scaleY) * scale * 0.9;

    const offsetX = padding + dimSpace + (displayWidth - padding * 2 - dimSpace * 2 - (maxX - minX) * autoScale) / 2 - minX * autoScale + offset.x;
    const offsetY = padding + dimSpace + (displayHeight - padding * 2 - dimSpace * 2 - (maxY - minY) * autoScale) / 2 - minY * autoScale + offset.y;

    // Helper: transform coordinates
    const tx = (x: number) => x * autoScale + offsetX;
    const ty = (y: number) => y * autoScale + offsetY;
    const ts = (size: number) => size * autoScale;

    // Draw grid
    if (showGrid && !compact) {
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 0.5;
      for (let i = Math.floor(minX); i <= Math.ceil(maxX); i++) {
        ctx.beginPath();
        ctx.moveTo(tx(i), ty(minY));
        ctx.lineTo(tx(i), ty(maxY));
        ctx.stroke();
      }
      for (let i = Math.floor(minY); i <= Math.ceil(maxY); i++) {
        ctx.beginPath();
        ctx.moveTo(tx(minX), ty(i));
        ctx.lineTo(tx(maxX), ty(i));
        ctx.stroke();
      }
    }

    // Draw hatching for wet areas
    const hatchTypes = ['alfresco', 'bathroom', 'ensuite', 'laundry', 'porch', 'main_bathroom', 'master_ensuite'];
    rooms.forEach(room => {
      const roomType = room.type.toLowerCase().replace(/[\s-]+/g, '_');
      if (hatchTypes.some(t => roomType.includes(t))) {
        const x = tx(room.x || 0);
        const y = ty(room.y || 0);
        const w = ts(room.width);
        const h = ts(room.depth);

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 0.5;
        const spacing = 6;
        for (let i = -Math.max(w, h); i < Math.max(w, h) * 2; i += spacing) {
          ctx.beginPath();
          ctx.moveTo(x + i, y);
          ctx.lineTo(x + i + h, y + h);
          ctx.stroke();
        }
        ctx.restore();
      }
    });

    // Draw rooms
    rooms.forEach(room => {
      const roomX = room.x || 0;
      const roomY = room.y || 0;
      const x = tx(roomX);
      const y = ty(roomY);
      const w = ts(room.width);
      const h = ts(room.depth);

      const roomType = room.type.toLowerCase().replace(/[\s-]+/g, '_');
      const colors = ROOM_COLORS[roomType] || ROOM_COLORS[roomType.split('_')[0]] || { fill: '#fafafa', stroke: '#6b7280' };

      // Room fill
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x, y, w, h);

      // Determine wall thickness
      const isExternal = ['garage', 'double_garage', 'alfresco', 'porch', 'front_porch'].some(t => roomType.includes(t)) ||
        roomX <= minX + 0.1 || roomY <= minY + 0.1 ||
        roomX + room.width >= maxX - 0.1 || roomY + room.depth >= maxY - 0.1;

      const wallThickness = isExternal ? Math.max(4, ts(0.2)) : Math.max(2, ts(0.09));

      // Draw walls (thick black lines)
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = wallThickness;
      ctx.strokeRect(x, y, w, h);

      // Draw fixtures
      if (showFurniture && !compact && w > 40 && h > 40) {
        drawRoomFixtures(ctx, room, x, y, w, h, autoScale);
      }

      // Room label
      if (w > 30 && h > 25) {
        const fontSize = Math.max(8, Math.min(12, Math.min(w, h) / 7));
        ctx.fillStyle = '#1f2937';
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const name = room.name.length > 14 ? room.name.substring(0, 11) + '...' : room.name;
        const centerX = x + w / 2;
        const centerY = y + h / 2;

        ctx.fillText(name.toUpperCase(), centerX, centerY - (showDimensions ? fontSize * 0.8 : 0));

        if (showDimensions) {
          ctx.fillStyle = '#6b7280';
          ctx.font = `${Math.max(7, fontSize - 2)}px Arial`;
          ctx.fillText(`${room.width.toFixed(1)} × ${room.depth.toFixed(1)}`, centerX, centerY + 4);

          ctx.fillStyle = '#9ca3af';
          ctx.font = `${Math.max(6, fontSize - 3)}px Arial`;
          const area = room.area || room.width * room.depth;
          ctx.fillText(`${area.toFixed(1)}m²`, centerX, centerY + fontSize + 2);
        }
      }
    });

    // Draw dimension chains (red, like professional drawings)
    if (showDimensions && !compact) {
      drawDimensionChains(ctx, rooms, minX, minY, maxX, maxY, tx, ty, ts, displayWidth, displayHeight);
    }

    // North arrow
    if (!compact) {
      drawNorthArrow(ctx, displayWidth - 40, 40);
    }

    // Scale bar
    if (!compact) {
      drawScaleBar(ctx, autoScale, displayWidth - 120, displayHeight - 30);
    }

    // Title block
    if (!compact) {
      drawTitleBlock(ctx, floorPlanData, selectedFloor, 15, displayHeight - 50);
    }
  };

  // Draw room fixtures
  const drawRoomFixtures = (
    ctx: CanvasRenderingContext2D,
    room: Room,
    x: number, y: number, w: number, h: number,
    scale: number
  ) => {
    ctx.strokeStyle = '#9ca3af';
    ctx.fillStyle = '#f3f4f6';
    ctx.lineWidth = 1;

    const ts = (m: number) => m * scale;
    const roomType = room.type.toLowerCase().replace(/[\s-]+/g, '_');
    const roomName = room.name.toLowerCase();

    // Kitchen
    if (roomType.includes('kitchen')) {
      // Countertop along top
      const counterD = Math.min(ts(0.6), h * 0.15);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(x + 4, y + 4, w - 8, counterD);
      ctx.strokeRect(x + 4, y + 4, w - 8, counterD);

      // Sink
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + counterD / 2 + 4, ts(0.25), ts(0.15), 0, 0, Math.PI * 2);
      ctx.stroke();

      // Cooktop (4 circles)
      const cooktopX = x + w - ts(0.9);
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          ctx.beginPath();
          ctx.arc(cooktopX + i * ts(0.25), y + counterD / 2 + 4 + (j - 0.5) * ts(0.2), ts(0.08), 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Island (if large)
      if (w > ts(3.5) && h > ts(3.5)) {
        ctx.strokeRect(x + w / 2 - ts(0.8), y + h / 2, ts(1.6), ts(0.6));
      }
    }

    // Bathroom / Ensuite
    else if (roomType.includes('bathroom') || roomType.includes('ensuite') || roomType.includes('powder')) {
      // Toilet
      ctx.beginPath();
      ctx.ellipse(x + ts(0.35), y + h - ts(0.4), ts(0.18), ts(0.25), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(x + ts(0.2), y + h - ts(0.2), ts(0.3), ts(0.15));
      ctx.strokeRect(x + ts(0.2), y + h - ts(0.2), ts(0.3), ts(0.15));

      // Vanity
      const vanityW = Math.min(ts(0.9), w * 0.4);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(x + w - vanityW - 4, y + 4, vanityW, ts(0.45));
      ctx.strokeRect(x + w - vanityW - 4, y + 4, vanityW, ts(0.45));

      // Basin
      ctx.beginPath();
      ctx.ellipse(x + w - vanityW / 2 - 4, y + ts(0.25), ts(0.15), ts(0.1), 0, 0, Math.PI * 2);
      ctx.stroke();

      // Shower (dashed)
      if (!roomType.includes('powder')) {
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x + 4, y + 4, ts(0.85), ts(0.85));
        ctx.setLineDash([]);
      }
    }

    // Bedroom
    else if (roomType.includes('bedroom') || roomType.includes('master')) {
      const isMaster = roomType.includes('master');
      const bedW = Math.min(w * 0.5, ts(isMaster ? 1.8 : 1.4));
      const bedH = Math.min(h * 0.45, ts(2.1));
      const bedX = x + (w - bedW) / 2;
      const bedY = y + h - bedH - ts(0.3);

      ctx.strokeRect(bedX, bedY, bedW, bedH);

      // Pillows
      const pillowH = bedH * 0.12;
      ctx.strokeRect(bedX + 3, bedY + bedH - pillowH - 3, bedW / 2 - 5, pillowH);
      ctx.strokeRect(bedX + bedW / 2 + 2, bedY + bedH - pillowH - 3, bedW / 2 - 5, pillowH);

      // Bedside tables
      if (w > bedW + ts(1.2)) {
        const tableSize = ts(0.45);
        ctx.strokeRect(bedX - tableSize - 4, bedY + bedH - tableSize - 10, tableSize, tableSize);
        ctx.strokeRect(bedX + bedW + 4, bedY + bedH - tableSize - 10, tableSize, tableSize);
      }
    }

    // Living / Family
    else if (roomType.includes('living') || roomType.includes('family') || roomType.includes('open_plan')) {
      // Sofa
      const sofaW = Math.min(w * 0.5, ts(2.4));
      const sofaH = Math.min(h * 0.18, ts(0.85));
      ctx.strokeRect(x + (w - sofaW) / 2, y + 10, sofaW, sofaH);

      // Coffee table
      const tableW = sofaW * 0.5;
      const tableH = ts(0.5);
      ctx.strokeRect(x + (w - tableW) / 2, y + h / 2 - tableH / 2, tableW, tableH);

      // TV unit
      ctx.fillRect(x + (w - sofaW * 0.8) / 2, y + h - 12, sofaW * 0.8, 8);
    }

    // Dining
    else if (roomType.includes('dining')) {
      const tableW = Math.min(w * 0.5, ts(1.8));
      const tableH = Math.min(h * 0.4, ts(1));
      const tableX = x + (w - tableW) / 2;
      const tableY = y + (h - tableH) / 2;

      ctx.strokeRect(tableX, tableY, tableW, tableH);

      // Chairs
      const chairSize = ts(0.35);
      ctx.strokeRect(tableX - chairSize - 4, tableY + tableH / 2 - chairSize / 2, chairSize, chairSize);
      ctx.strokeRect(tableX + tableW + 4, tableY + tableH / 2 - chairSize / 2, chairSize, chairSize);
      ctx.strokeRect(tableX + tableW / 3 - chairSize / 2, tableY - chairSize - 4, chairSize, chairSize);
      ctx.strokeRect(tableX + tableW * 2 / 3 - chairSize / 2, tableY - chairSize - 4, chairSize, chairSize);
      ctx.strokeRect(tableX + tableW / 3 - chairSize / 2, tableY + tableH + 4, chairSize, chairSize);
      ctx.strokeRect(tableX + tableW * 2 / 3 - chairSize / 2, tableY + tableH + 4, chairSize, chairSize);
    }

    // Garage
    else if (roomType.includes('garage')) {
      const carW = ts(2.2);
      const carH = ts(4.5);
      const numCars = roomName.includes('double') || room.width > 5 ? 2 : 1;

      ctx.setLineDash([6, 4]);
      for (let i = 0; i < numCars; i++) {
        const carX = x + w * (i + 1) / (numCars + 1) - carW / 2;
        const carY = y + (h - carH) / 2;

        // Car outline
        ctx.beginPath();
        ctx.roundRect(carX, carY, carW, carH, 8);
        ctx.stroke();

        // Wheels
        const wheelW = carW * 0.12;
        const wheelH = carH * 0.1;
        ctx.strokeRect(carX - 2, carY + carH * 0.15, wheelW, wheelH);
        ctx.strokeRect(carX - 2, carY + carH * 0.72, wheelW, wheelH);
        ctx.strokeRect(carX + carW - wheelW + 2, carY + carH * 0.15, wheelW, wheelH);
        ctx.strokeRect(carX + carW - wheelW + 2, carY + carH * 0.72, wheelW, wheelH);
      }
      ctx.setLineDash([]);
    }

    // Laundry
    else if (roomType.includes('laundry')) {
      const appSize = ts(0.55);
      // Washer
      ctx.strokeRect(x + 4, y + 4, appSize, appSize);
      ctx.beginPath();
      ctx.arc(x + 4 + appSize / 2, y + 4 + appSize / 2, appSize * 0.35, 0, Math.PI * 2);
      ctx.stroke();
      // Dryer
      ctx.strokeRect(x + appSize + 8, y + 4, appSize, appSize);
    }

    // Office / Study
    else if (roomType.includes('office') || roomType.includes('study')) {
      const deskW = Math.min(w - ts(0.4), ts(1.4));
      const deskH = ts(0.5);
      ctx.strokeRect(x + (w - deskW) / 2, y + h - deskH - 10, deskW, deskH);

      // Chair
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h - deskH - ts(0.4), ts(0.2), 0, Math.PI * 2);
      ctx.stroke();
    }

    // WIR / Robe
    else if (roomType.includes('wir') || roomType.includes('robe') || roomType.includes('walk_in')) {
      // Hanging rails
      ctx.strokeRect(x + 4, y + 4, ts(0.5), h - 8);
      ctx.strokeRect(x + w - ts(0.5) - 4, y + 4, ts(0.5), h - 8);
    }

    // Pantry
    else if (roomType.includes('pantry')) {
      // Shelves
      ctx.strokeRect(x + 4, y + 4, ts(0.35), h - 8);
      ctx.strokeRect(x + w - ts(0.35) - 4, y + 4, ts(0.35), h - 8);
    }

    // Alfresco
    else if (roomType.includes('alfresco')) {
      // Outdoor table
      const tableW = Math.min(w * 0.5, ts(1.8));
      const tableH = Math.min(h * 0.35, ts(1));
      ctx.strokeRect(x + (w - tableW) / 2, y + (h - tableH) / 2, tableW, tableH);

      // BBQ
      ctx.fillStyle = '#d1d5db';
      ctx.fillRect(x + w - ts(0.9) - 4, y + 4, ts(0.8), ts(0.5));
      ctx.strokeRect(x + w - ts(0.9) - 4, y + 4, ts(0.8), ts(0.5));
    }
  };

  // Draw dimension chains
  const drawDimensionChains = (
    ctx: CanvasRenderingContext2D,
    rooms: Room[],
    minX: number, minY: number, maxX: number, maxY: number,
    tx: (x: number) => number,
    ty: (y: number) => number,
    ts: (s: number) => number,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    ctx.strokeStyle = '#dc2626';
    ctx.fillStyle = '#dc2626';
    ctx.lineWidth = 1;
    ctx.font = '9px Arial';

    const offset = 18;

    // Bottom dimension (total width)
    const x1 = tx(minX);
    const x2 = tx(maxX);
    const yDim = ty(minY) - offset;

    ctx.beginPath();
    ctx.moveTo(x1, yDim);
    ctx.lineTo(x2, yDim);
    ctx.stroke();

    // Ticks
    ctx.beginPath();
    ctx.moveTo(x1, yDim - 4);
    ctx.lineTo(x1, yDim + 4);
    ctx.moveTo(x2, yDim - 4);
    ctx.lineTo(x2, yDim + 4);
    ctx.stroke();

    // Extension lines
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x1, ty(minY));
    ctx.lineTo(x1, yDim - 4);
    ctx.moveTo(x2, ty(minY));
    ctx.lineTo(x2, yDim - 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    const totalWidth = maxX - minX;
    ctx.textAlign = 'center';
    ctx.fillText(`${(totalWidth * 1000).toFixed(0)}`, (x1 + x2) / 2, yDim - 6);

    // Right dimension (total depth)
    const y1 = ty(minY);
    const y2 = ty(maxY);
    const xDim = tx(maxX) + offset;

    ctx.beginPath();
    ctx.moveTo(xDim, y1);
    ctx.lineTo(xDim, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(xDim - 4, y1);
    ctx.lineTo(xDim + 4, y1);
    ctx.moveTo(xDim - 4, y2);
    ctx.lineTo(xDim + 4, y2);
    ctx.stroke();

    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(tx(maxX), y1);
    ctx.lineTo(xDim - 4, y1);
    ctx.moveTo(tx(maxX), y2);
    ctx.lineTo(xDim - 4, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    const totalDepth = maxY - minY;
    ctx.save();
    ctx.translate(xDim + 12, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${(totalDepth * 1000).toFixed(0)}`, 0, 0);
    ctx.restore();
  };

  // Draw north arrow
  const drawNorthArrow = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.fillStyle = '#374151';
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x - 8, y + 6);
    ctx.lineTo(x, y);
    ctx.lineTo(x + 8, y + 6);
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('N', x, y + 20);
  };

  // Draw scale bar
  const drawScaleBar = (ctx: CanvasRenderingContext2D, scale: number, x: number, y: number) => {
    const barLength = 5 * scale; // 5 meters

    ctx.strokeStyle = '#374151';
    ctx.fillStyle = '#374151';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + barLength, y);
    ctx.stroke();

    // End caps
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x + barLength, y - 4);
    ctx.lineTo(x + barLength, y + 4);
    ctx.stroke();

    ctx.font = '9px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('5m', x + barLength / 2, y + 14);
  };

  // Draw title block
  const drawTitleBlock = (
    ctx: CanvasRenderingContext2D,
    data: LayoutData,
    floor: number,
    x: number,
    y: number
  ) => {
    ctx.fillStyle = '#f9fafb';
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;

    ctx.fillRect(x, y, 180, 40);
    ctx.strokeRect(x, y, 180, 40);

    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'left';
    const title = data.design_name || data.variant_name || 'Floor Plan';
    ctx.fillText(title.length > 25 ? title.substring(0, 22) + '...' : title, x + 8, y + 16);

    ctx.fillStyle = '#6b7280';
    ctx.font = '9px Arial';
    const floorLabel = floor === 0 ? 'Ground Floor' : `Level ${floor}`;
    const areaLabel = data.summary?.total_area || data.total_area || 0;
    ctx.fillText(`${floorLabel} • ${areaLabel.toFixed(0)}m²`, x + 8, y + 30);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev * delta)));
  };

  const canvasWidth = compact ? 400 : 900;
  const canvasHeight = compact ? 300 : 650;

  if (compact) {
    return (
      <canvas
        ref={canvasRef}
        style={{ width: canvasWidth, height: canvasHeight }}
        className="w-full rounded-lg"
      />
    );
  }

  return (
    <div className="relative bg-white rounded-lg border border-gray-200">
      {/* Toolbar */}
      <div className="absolute top-3 right-3 flex gap-1.5 z-10">
        <button
          onClick={() => setShowDimensions(!showDimensions)}
          className={`p-2 rounded-lg shadow-sm transition ${showDimensions ? 'bg-red-100 text-red-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          title="Toggle Dimensions"
        >
          <Ruler className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowFurniture(!showFurniture)}
          className={`p-2 rounded-lg shadow-sm transition ${showFurniture ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          title="Toggle Furniture"
        >
          <Sofa className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`p-2 rounded-lg shadow-sm transition ${showGrid ? 'bg-green-100 text-green-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          title="Toggle Grid"
        >
          <Grid3X3 className="w-4 h-4" />
        </button>
        <div className="w-px bg-gray-200 mx-0.5" />
        <button
          onClick={() => setScale(prev => Math.min(3, prev * 1.2))}
          className="p-2 bg-white rounded-lg shadow-sm hover:bg-gray-50 transition"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4 text-gray-600" />
        </button>
        <button
          onClick={() => setScale(prev => Math.max(0.5, prev * 0.8))}
          className="p-2 bg-white rounded-lg shadow-sm hover:bg-gray-50 transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4 text-gray-600" />
        </button>
        <button
          onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
          className="p-2 bg-white rounded-lg shadow-sm hover:bg-gray-50 transition"
          title="Reset View"
        >
          <RotateCw className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      <canvas
        ref={canvasRef}
        style={{ width: canvasWidth, height: canvasHeight }}
        className="w-full cursor-move"
        onWheel={handleWheel}
        onMouseDown={(e) => {
          setIsDragging(true);
          setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
        }}
        onMouseMove={(e) => {
          if (isDragging) setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
      />
    </div>
  );
}
