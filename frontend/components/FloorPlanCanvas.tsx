'use client';

import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface Room {
  type: string;
  name: string;
  x?: number;
  y?: number;
  width: number;
  depth: number;
  area?: number;
}

interface FloorPlanCanvasProps {
  data: { 
    rooms: Room[]; 
    total_area?: number;
    variant_name?: string;
  };
  compact?: boolean;
}

export default function FloorPlanCanvas({ data, compact = false }: FloorPlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Auto-layout rooms if they don't have x/y coordinates
  const layoutRooms = (rooms: Room[]): Room[] => {
    if (rooms.length === 0) return [];
    
    // Check if rooms already have positions
    if (rooms.every(r => r.x !== undefined && r.y !== undefined)) {
      return rooms;
    }

    // Simple grid layout algorithm
    const layouted: Room[] = [];
    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;
    const maxWidth = 25; // Max width before wrapping to next row

    rooms.forEach((room, index) => {
      const width = room.width || 4;
      const depth = room.depth || 4;

      // Check if we need to wrap to next row
      if (currentX + width > maxWidth && currentX > 0) {
        currentX = 0;
        currentY += rowHeight + 0.5; // Add gap between rows
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

      currentX += width + 0.5; // Add gap between rooms
      rowHeight = Math.max(rowHeight, depth);
    });

    return layouted;
  };

  useEffect(() => {
    drawFloorPlan();
  }, [data, scale, offset]);

  const drawFloorPlan = () => {
    const canvas = canvasRef.current;
    if (!canvas || !data.rooms || data.rooms.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = compact ? '#1e293b' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rooms = layoutRooms(data.rooms);
    
    const maxX = Math.max(...rooms.map(r => (r.x || 0) + r.width));
    const maxY = Math.max(...rooms.map(r => (r.y || 0) + r.depth));

    const padding = compact ? 20 : 50;
    const scaleX = (canvas.width - padding * 2) / maxX;
    const scaleY = (canvas.height - padding * 2) / maxY;
    const autoScale = Math.min(scaleX, scaleY) * scale;

    const offsetX = (canvas.width - maxX * autoScale) / 2 + offset.x;
    const offsetY = (canvas.height - maxY * autoScale) / 2 + offset.y;

    // Draw grid (only in non-compact mode)
    if (!compact) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= maxX; i++) {
        ctx.beginPath();
        ctx.moveTo(offsetX + i * autoScale, offsetY);
        ctx.lineTo(offsetX + i * autoScale, offsetY + maxY * autoScale);
        ctx.stroke();
      }
      for (let i = 0; i <= maxY; i++) {
        ctx.beginPath();
        ctx.moveTo(offsetX, offsetY + i * autoScale);
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

      // Room fill
      ctx.fillStyle = getRoomColor(room.type);
      ctx.fillRect(x, y, w, h);

      // Room border
      ctx.strokeStyle = compact ? '#475569' : '#374151';
      ctx.lineWidth = compact ? 1 : 2;
      ctx.strokeRect(x, y, w, h);

      // Room label (only if room is big enough)
      if (w > 30 && h > 30) {
        ctx.fillStyle = compact ? '#e2e8f0' : '#111827';
        ctx.font = `${Math.max(10, Math.min(14, 12 * scale))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        
        // Room name
        ctx.fillText(room.name, centerX, centerY - (compact ? 6 : 10));
        
        // Dimensions (only in non-compact mode or if room is large)
        if (!compact || (w > 60 && h > 60)) {
          ctx.font = `${Math.max(8, 10 * scale)}px Arial`;
          ctx.fillStyle = compact ? '#94a3b8' : '#6b7280';
          ctx.fillText(`${room.width.toFixed(1)}m × ${room.depth.toFixed(1)}m`, centerX, centerY + (compact ? 6 : 8));
        }
      }
    });

    // Scale bar (only in non-compact mode)
    if (!compact) {
      const scaleBarLength = 5 * autoScale;
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(20, canvas.height - 30);
      ctx.lineTo(20 + scaleBarLength, canvas.height - 30);
      ctx.stroke();
      
      ctx.fillStyle = '#374151';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('5m', 20 + scaleBarLength / 2, canvas.height - 15);

      // North arrow
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'right';
      ctx.fillText('N ↑', canvas.width - 20, 30);
    }
  };

  const getRoomColor = (type: string): string => {
    const colors: { [key: string]: string } = {
      bedroom: compact ? '#1e3a5f' : '#dbeafe',
      bathroom: compact ? '#312e81' : '#e0e7ff',
      ensuite: compact ? '#312e81' : '#e0e7ff',
      kitchen: compact ? '#78350f' : '#fef3c7',
      kitchen_dining: compact ? '#365314' : '#d1fae5',
      living: compact ? '#14532d' : '#d1fae5',
      dining: compact ? '#831843' : '#fce7f3',
      garage: compact ? '#374151' : '#e5e7eb',
      office: compact ? '#7c2d12' : '#ffedd5',
      alfresco: compact ? '#164e63' : '#cffafe',
    };
    return colors[type] || (compact ? '#475569' : '#f3f4f6');
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev * delta)));
  };

  const canvasWidth = compact ? 400 : 800;
  const canvasHeight = compact ? 300 : 600;

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
    <div className="relative bg-white rounded-lg shadow-lg border border-gray-200">
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button 
          onClick={() => setScale(prev => Math.min(3, prev * 1.2))} 
          className="bg-white p-2 rounded-lg shadow hover:bg-gray-50 transition"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5 text-gray-600" />
        </button>
        <button 
          onClick={() => setScale(prev => Math.max(0.5, prev * 0.8))} 
          className="bg-white p-2 rounded-lg shadow hover:bg-gray-50 transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5 text-gray-600" />
        </button>
        <button 
          onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} 
          className="bg-white p-2 rounded-lg shadow hover:bg-gray-50 transition"
          title="Reset View"
        >
          <RotateCw className="w-5 h-5 text-gray-600" />
        </button>
      </div>

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
