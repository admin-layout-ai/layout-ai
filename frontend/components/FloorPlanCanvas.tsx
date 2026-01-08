'use client';

import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Sofa, Grid3X3 } from 'lucide-react';

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
  // Support both prop names for backward compatibility
  data?: LayoutData;
  layoutData?: LayoutData;
  compact?: boolean;
  selectedFloor?: number;
  showDimensions?: boolean;
  showFurniture?: boolean;
  showGrid?: boolean;
  scale?: number;
}

// Professional room colors
const ROOM_COLORS: Record<string, { fill: string; stroke: string; darkFill: string }> = {
  garage: { fill: '#f3f4f6', stroke: '#4b5563', darkFill: '#374151' },
  entry: { fill: '#fef9c3', stroke: '#a16207', darkFill: '#713f12' },
  foyer: { fill: '#fef9c3', stroke: '#a16207', darkFill: '#713f12' },
  porch: { fill: '#fef9c3', stroke: '#a16207', darkFill: '#713f12' },
  front: { fill: '#fef9c3', stroke: '#a16207', darkFill: '#713f12' },
  family: { fill: '#dbeafe', stroke: '#1d4ed8', darkFill: '#1e3a8a' },
  living: { fill: '#dbeafe', stroke: '#1d4ed8', darkFill: '#1e3a8a' },
  theatre: { fill: '#e0e7ff', stroke: '#4338ca', darkFill: '#312e81' },
  media: { fill: '#e0e7ff', stroke: '#4338ca', darkFill: '#312e81' },
  home: { fill: '#e0e7ff', stroke: '#4338ca', darkFill: '#312e81' },
  dining: { fill: '#fce7f3', stroke: '#be185d', darkFill: '#831843' },
  kitchen: { fill: '#d1fae5', stroke: '#047857', darkFill: '#064e3b' },
  pantry: { fill: '#a7f3d0', stroke: '#059669', darkFill: '#065f46' },
  butler: { fill: '#a7f3d0', stroke: '#059669', darkFill: '#065f46' },
  laundry: { fill: '#cffafe', stroke: '#0891b2', darkFill: '#164e63' },
  bedroom: { fill: '#ede9fe', stroke: '#7c3aed', darkFill: '#4c1d95' },
  master: { fill: '#f5d0fe', stroke: '#a21caf', darkFill: '#701a75' },
  ensuite: { fill: '#bae6fd', stroke: '#0284c7', darkFill: '#0c4a6e' },
  bathroom: { fill: '#bae6fd', stroke: '#0284c7', darkFill: '#0c4a6e' },
  main: { fill: '#bae6fd', stroke: '#0284c7', darkFill: '#0c4a6e' },
  powder: { fill: '#bae6fd', stroke: '#0284c7', darkFill: '#0c4a6e' },
  wir: { fill: '#fed7aa', stroke: '#c2410c', darkFill: '#7c2d12' },
  walk: { fill: '#fed7aa', stroke: '#c2410c', darkFill: '#7c2d12' },
  robe: { fill: '#fed7aa', stroke: '#c2410c', darkFill: '#7c2d12' },
  office: { fill: '#fecaca', stroke: '#dc2626', darkFill: '#7f1d1d' },
  study: { fill: '#fecaca', stroke: '#dc2626', darkFill: '#7f1d1d' },
  store: { fill: '#e5e7eb', stroke: '#6b7280', darkFill: '#374151' },
  storage: { fill: '#e5e7eb', stroke: '#6b7280', darkFill: '#374151' },
  mudroom: { fill: '#e5e7eb', stroke: '#6b7280', darkFill: '#374151' },
  alfresco: { fill: '#bbf7d0', stroke: '#16a34a', darkFill: '#14532d' },
  outdoor: { fill: '#bbf7d0', stroke: '#16a34a', darkFill: '#14532d' },
  balcony: { fill: '#bbf7d0', stroke: '#16a34a', darkFill: '#14532d' },
  hallway: { fill: '#f9fafb', stroke: '#9ca3af', darkFill: '#1f2937' },
  hall: { fill: '#f9fafb', stroke: '#9ca3af', darkFill: '#1f2937' },
  linen: { fill: '#e5e7eb', stroke: '#9ca3af', darkFill: '#374151' },
  open: { fill: '#dbeafe', stroke: '#1d4ed8', darkFill: '#1e3a8a' },
  double: { fill: '#f3f4f6', stroke: '#4b5563', darkFill: '#374151' },
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

  // Use layoutData if provided, otherwise use data (backward compatibility)
  const floorPlanData = layoutData || data;

  // Update internal state when props change
  useEffect(() => {
    setShowFurniture(propShowFurniture);
  }, [propShowFurniture]);

  useEffect(() => {
    setShowGrid(propShowGrid);
  }, [propShowGrid]);

  useEffect(() => {
    setShowDimensions(propShowDimensions);
  }, [propShowDimensions]);

  useEffect(() => {
    setScale(propScale);
  }, [propScale]);

  // Auto-layout rooms if they don't have x/y coordinates
  const layoutRooms = (rooms: Room[]): Room[] => {
    if (rooms.length === 0) return [];
    
    // Filter by floor
    const floorRooms = rooms.filter(r => (r.floor || 0) === selectedFloor);
    
    // Check if rooms already have positions
    if (floorRooms.every(r => r.x !== undefined && r.y !== undefined)) {
      return floorRooms;
    }

    // Simple grid layout algorithm
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
        currentY += rowHeight + 0.5;
        rowHeight = 0;
      }

      layouted.push({
        ...room,
        x: currentX,
        y: currentY,
        width,
        depth,
        area: room.area || width * depth,
      });

      currentX += width + 0.5;
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

    // Clear canvas
    ctx.fillStyle = compact ? '#1e293b' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rooms = layoutRooms(floorPlanData.rooms);
    if (rooms.length === 0) {
      // Show message if no rooms on this floor
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No rooms on this floor', canvas.width / 2, canvas.height / 2);
      return;
    }
    
    const minX = Math.min(...rooms.map(r => r.x || 0));
    const minY = Math.min(...rooms.map(r => r.y || 0));
    const maxX = Math.max(...rooms.map(r => (r.x || 0) + r.width));
    const maxY = Math.max(...rooms.map(r => (r.y || 0) + r.depth));

    const padding = compact ? 20 : 60;
    const scaleX = (canvas.width - padding * 2) / (maxX - minX || 1);
    const scaleY = (canvas.height - padding * 2) / (maxY - minY || 1);
    const autoScale = Math.min(scaleX, scaleY) * scale * 0.85;

    const offsetX = (canvas.width - (maxX - minX) * autoScale) / 2 - minX * autoScale + offset.x;
    const offsetY = (canvas.height - (maxY - minY) * autoScale) / 2 - minY * autoScale + offset.y;

    // Draw grid
    if (showGrid && !compact) {
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 0.5;
      for (let i = Math.floor(minX); i <= Math.ceil(maxX); i++) {
        ctx.beginPath();
        ctx.moveTo(offsetX + i * autoScale, offsetY + minY * autoScale);
        ctx.lineTo(offsetX + i * autoScale, offsetY + maxY * autoScale);
        ctx.stroke();
      }
      for (let i = Math.floor(minY); i <= Math.ceil(maxY); i++) {
        ctx.beginPath();
        ctx.moveTo(offsetX + minX * autoScale, offsetY + i * autoScale);
        ctx.lineTo(offsetX + maxX * autoScale, offsetY + i * autoScale);
        ctx.stroke();
      }
    }

    // Draw rooms
    rooms.forEach(room => {
      const x = offsetX + (room.x || 0) * autoScale;
      const y = offsetY + (room.y || 0) * autoScale;
      const w = room.width * autoScale;
      const h = room.depth * autoScale;

      // Get room colors - try full type, then first word
      const roomType = room.type.toLowerCase().replace(/[\s-]+/g, '_');
      const firstWord = roomType.split('_')[0];
      const colors = ROOM_COLORS[roomType] || ROOM_COLORS[firstWord] || 
                     { fill: '#f9fafb', stroke: '#6b7280', darkFill: '#374151' };

      // Room fill
      ctx.fillStyle = compact ? colors.darkFill : colors.fill;
      ctx.fillRect(x, y, w, h);

      // Thick walls (architectural style)
      const wallThickness = compact ? 2 : Math.max(3, autoScale * 0.1);
      ctx.strokeStyle = compact ? '#64748b' : colors.stroke;
      ctx.lineWidth = wallThickness;
      ctx.strokeRect(x, y, w, h);

      // Draw furniture
      if (showFurniture && !compact && w > 40 && h > 40) {
        drawFurniture(ctx, room, x, y, w, h, autoScale);
      }

      // Room label
      if (w > 35 && h > 30) {
        const fontSize = Math.max(9, Math.min(13, w / 7));
        ctx.fillStyle = compact ? '#e2e8f0' : '#1f2937';
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        
        // Room name
        const name = room.name.length > 15 ? room.name.substring(0, 12) + '...' : room.name;
        ctx.fillText(name.toUpperCase(), centerX, centerY - (showDimensions && !compact ? 10 : 0));
        
        // Dimensions
        if (showDimensions && (!compact || (w > 60 && h > 50))) {
          ctx.font = `${Math.max(8, fontSize - 2)}px Arial`;
          ctx.fillStyle = compact ? '#94a3b8' : '#6b7280';
          ctx.fillText(`${room.width.toFixed(1)} × ${room.depth.toFixed(1)}`, centerX, centerY + 6);
          
          // Area
          ctx.fillStyle = compact ? '#64748b' : '#9ca3af';
          ctx.font = `${Math.max(7, fontSize - 3)}px Arial`;
          ctx.fillText(`${(room.area || room.width * room.depth).toFixed(1)}m²`, centerX, centerY + 18);
        }
      } else if (w > 20 && h > 20) {
        // Small room - just area
        ctx.fillStyle = compact ? '#94a3b8' : '#6b7280';
        ctx.font = '8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${(room.area || room.width * room.depth).toFixed(0)}`, x + w / 2, y + h / 2);
      }
    });

    // Draw scale bar
    if (!compact) {
      const scaleBarLength = 5 * autoScale;
      const sbY = canvas.height - 35;
      const sbX = canvas.width - scaleBarLength - 30;
      
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sbX, sbY);
      ctx.lineTo(sbX + scaleBarLength, sbY);
      ctx.stroke();
      
      // End caps
      ctx.beginPath();
      ctx.moveTo(sbX, sbY - 5);
      ctx.lineTo(sbX, sbY + 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sbX + scaleBarLength, sbY - 5);
      ctx.lineTo(sbX + scaleBarLength, sbY + 5);
      ctx.stroke();
      
      ctx.fillStyle = '#374151';
      ctx.font = '11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('5m', sbX + scaleBarLength / 2, sbY + 15);
    }

    // North arrow
    if (!compact) {
      const naX = canvas.width - 35;
      const naY = 40;
      
      ctx.fillStyle = '#374151';
      ctx.beginPath();
      ctx.moveTo(naX, naY - 18);
      ctx.lineTo(naX - 8, naY + 8);
      ctx.lineTo(naX, naY + 2);
      ctx.lineTo(naX + 8, naY + 8);
      ctx.closePath();
      ctx.fill();
      
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('N', naX, naY + 22);
    }

    // Title block
    if (!compact) {
      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(15, canvas.height - 55, 200, 45);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(15, canvas.height - 55, 200, 45);
      
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'left';
      const title = floorPlanData.design_name || floorPlanData.variant_name || 'Floor Plan';
      ctx.fillText(title.length > 25 ? title.substring(0, 22) + '...' : title, 25, canvas.height - 35);
      
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px Arial';
      const floorLabel = selectedFloor === 0 ? 'Ground Floor' : `Level ${selectedFloor}`;
      const areaLabel = floorPlanData.summary?.total_area || floorPlanData.total_area || 0;
      ctx.fillText(`${floorLabel} • ${areaLabel.toFixed(0)}m² total`, 25, canvas.height - 20);
    }
  };

  const drawFurniture = (
    ctx: CanvasRenderingContext2D, 
    room: Room, 
    x: number, 
    y: number, 
    w: number, 
    h: number,
    scale: number
  ) => {
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#e5e7eb';

    const ts = (m: number) => m * scale;
    const roomType = room.type.toLowerCase().replace(/[\s-]+/g, '_');
    const roomName = room.name.toLowerCase();

    // Check for bedroom types
    if (roomType.includes('bedroom') || roomType.includes('master') || roomName.includes('bedroom')) {
      const bedW = Math.min(w * 0.5, ts(1.8));
      const bedH = Math.min(h * 0.45, ts(2));
      const bedX = x + (w - bedW) / 2;
      const bedY = y + h - bedH - ts(0.3);
      ctx.strokeRect(bedX, bedY, bedW, bedH);
      ctx.strokeRect(bedX + 3, bedY + 3, bedW / 2 - 6, bedH * 0.15);
      ctx.strokeRect(bedX + bedW / 2 + 3, bedY + 3, bedW / 2 - 6, bedH * 0.15);
      return;
    }

    // Check for living/family types
    if (roomType.includes('living') || roomType.includes('family') || roomType.includes('lounge') || 
        roomName.includes('living') || roomName.includes('family') || roomType.includes('open_plan')) {
      const sofaW = Math.min(w * 0.45, ts(2.2));
      const sofaH = Math.min(h * 0.18, ts(0.75));
      ctx.strokeRect(x + (w - sofaW) / 2, y + h - sofaH - ts(0.3), sofaW, sofaH);
      ctx.fillRect(x + w / 2 - ts(0.5), y + ts(0.15), ts(1), ts(0.08));
      return;
    }

    // Check for dining types
    if (roomType.includes('dining') || roomName.includes('dining')) {
      const tableW = Math.min(w * 0.4, ts(1.5));
      const tableH = Math.min(h * 0.35, ts(1));
      const tableX = x + (w - tableW) / 2;
      const tableY = y + (h - tableH) / 2;
      ctx.strokeRect(tableX, tableY, tableW, tableH);
      const chairSize = ts(0.3);
      ctx.strokeRect(tableX - chairSize - 3, tableY + tableH / 2 - chairSize / 2, chairSize, chairSize);
      ctx.strokeRect(tableX + tableW + 3, tableY + tableH / 2 - chairSize / 2, chairSize, chairSize);
      return;
    }

    // Check for kitchen types
    if (roomType.includes('kitchen') || roomName.includes('kitchen')) {
      const counterD = ts(0.5);
      ctx.fillRect(x + ts(0.1), y + ts(0.1), w - ts(0.2), counterD);
      ctx.strokeRect(x + ts(0.1), y + ts(0.1), w - ts(0.2), counterD);
      ctx.fillRect(x + w - counterD - ts(0.1), y + ts(0.1), counterD, Math.min(h * 0.5, ts(2)));
      ctx.strokeRect(x + w - counterD - ts(0.1), y + ts(0.1), counterD, Math.min(h * 0.5, ts(2)));
      ctx.beginPath();
      ctx.arc(x + w / 2, y + counterD / 2 + ts(0.1), ts(0.2), 0, Math.PI * 2);
      ctx.stroke();
      if (w > ts(3.5)) {
        ctx.strokeRect(x + w / 2 - ts(0.8), y + h / 2, ts(1.6), ts(0.65));
      }
      return;
    }

    // Check for bathroom types
    if (roomType.includes('bathroom') || roomType.includes('ensuite') || roomType.includes('powder') ||
        roomName.includes('bathroom') || roomName.includes('ensuite')) {
      ctx.beginPath();
      ctx.ellipse(x + ts(0.35), y + h - ts(0.4), ts(0.18), ts(0.22), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(x + w - ts(0.85), y + ts(0.1), ts(0.75), ts(0.4));
      ctx.strokeRect(x + w - ts(0.85), y + ts(0.1), ts(0.75), ts(0.4));
      ctx.beginPath();
      ctx.ellipse(x + w - ts(0.5), y + ts(0.3), ts(0.15), ts(0.1), 0, 0, Math.PI * 2);
      ctx.stroke();
      if (!roomType.includes('powder')) {
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x + ts(0.1), y + ts(0.1), ts(0.8), ts(0.8));
        ctx.setLineDash([]);
      }
      return;
    }

    // Check for garage types
    if (roomType.includes('garage') || roomName.includes('garage')) {
      const carW = ts(2.2);
      const carH = ts(4.5);
      const numCars = roomName.includes('2') || roomName.includes('double') || room.width > 5 ? 2 : 1;
      ctx.setLineDash([6, 4]);
      for (let i = 0; i < numCars; i++) {
        const carX = x + (w / (numCars + 1)) * (i + 1) - carW / 2;
        const carY = y + (h - carH) / 2;
        ctx.strokeRect(carX, carY, carW, carH);
      }
      ctx.setLineDash([]);
      return;
    }

    // Check for laundry
    if (roomType.includes('laundry') || roomName.includes('laundry')) {
      ctx.strokeRect(x + ts(0.1), y + ts(0.1), ts(0.55), ts(0.55));
      ctx.beginPath();
      ctx.arc(x + ts(0.375), y + ts(0.375), ts(0.18), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(x + ts(0.75), y + ts(0.1), ts(0.55), ts(0.55));
      return;
    }

    // Check for office/study
    if (roomType.includes('office') || roomType.includes('study') || roomName.includes('office') || roomName.includes('study')) {
      const deskW = Math.min(w - ts(0.4), ts(1.4));
      ctx.strokeRect(x + ts(0.2), y + h - ts(0.55), deskW, ts(0.45));
      ctx.beginPath();
      ctx.arc(x + ts(0.2) + deskW / 2, y + h - ts(0.85), ts(0.18), 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    // Check for WIR/robe
    if (roomType.includes('wir') || roomType.includes('robe') || roomType.includes('walk') ||
        roomName.includes('robe') || roomName.includes('walk-in')) {
      ctx.strokeRect(x + ts(0.1), y + ts(0.1), w - ts(0.2), ts(0.3));
      return;
    }

    // Check for pantry
    if (roomType.includes('pantry') || roomType.includes('butler') || roomName.includes('pantry')) {
      for (let i = 0; i < 3; i++) {
        ctx.strokeRect(x + ts(0.1), y + ts(0.1) + i * ts(0.4), w - ts(0.2), ts(0.08));
      }
      return;
    }
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
        width={canvasWidth}
        height={canvasHeight}
        className="w-full rounded-lg"
      />
    );
  }

  return (
    <div className="relative bg-white rounded-lg border border-gray-200">
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
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
