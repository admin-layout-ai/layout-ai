'use client';

import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface Room {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  area: number;
}

interface FloorPlanCanvasProps {
  data: { rooms: Room[]; total_area: number };
}

export default function FloorPlanCanvas({ data }: FloorPlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    drawFloorPlan();
  }, [data, scale, offset]);

  const drawFloorPlan = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const maxX = Math.max(...data.rooms.map(r => r.x + r.width));
    const maxY = Math.max(...data.rooms.map(r => r.y + r.depth));

    const scaleX = (canvas.width - 100) / maxX;
    const scaleY = (canvas.height - 100) / maxY;
    const autoScale = Math.min(scaleX, scaleY) * scale;

    const offsetX = (canvas.width - maxX * autoScale) / 2 + offset.x;
    const offsetY = (canvas.height - maxY * autoScale) / 2 + offset.y;

    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < maxX; i++) {
      ctx.beginPath();
      ctx.moveTo(offsetX + i * autoScale, offsetY);
      ctx.lineTo(offsetX + i * autoScale, offsetY + maxY * autoScale);
      ctx.stroke();
    }

    // Draw rooms
    data.rooms.forEach(room => {
      const x = offsetX + room.x * autoScale;
      const y = offsetY + room.y * autoScale;
      const w = room.width * autoScale;
      const h = room.depth * autoScale;

      ctx.fillStyle = getRoomColor(room.type);
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = '#111827';
      ctx.font = `${Math.max(12, 10 * scale)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(room.name, x + w / 2, y + h / 2 - 8 * scale);
      
      ctx.font = `${Math.max(10, 8 * scale)}px Arial`;
      ctx.fillStyle = '#6b7280';
      ctx.fillText(`${room.width.toFixed(1)}m × ${room.depth.toFixed(1)}m`, x + w / 2, y + h / 2 + 8 * scale);
      ctx.fillText(`${room.area.toFixed(1)}m²`, x + w / 2, y + h / 2 + 20 * scale);
    });

    // Scale bar
    const scaleBarLength = 5 * autoScale;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 30);
    ctx.lineTo(20 + scaleBarLength, canvas.height - 30);
    ctx.stroke();
    
    ctx.fillStyle = '#000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('5m', 20 + scaleBarLength / 2, canvas.height - 15);

    // North arrow
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('N ↑', canvas.width - 20, 30);
  };

  const getRoomColor = (type: string): string => {
    const colors: { [key: string]: string } = {
      bedroom: '#dbeafe',
      bathroom: '#e0e7ff',
      kitchen: '#fef3c7',
      living: '#d1fae5',
      dining: '#fce7f3',
      garage: '#e5e7eb',
      open_plan: '#d1fae5',
    };
    return colors[type] || '#ffffff';
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev * delta)));
  };

  return (
    <div className="relative bg-white rounded-lg shadow-lg border border-gray-200">
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button onClick={() => setScale(prev => Math.min(3, prev * 1.2))} className="bg-white p-2 rounded-lg shadow hover:bg-gray-50">
          <ZoomIn className="w-5 h-5" />
        </button>
        <button onClick={() => setScale(prev => Math.max(0.5, prev * 0.8))} className="bg-white p-2 rounded-lg shadow hover:bg-gray-50">
          <ZoomOut className="w-5 h-5" />
        </button>
        <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} className="bg-white p-2 rounded-lg shadow hover:bg-gray-50">
          <RotateCw className="w-5 h-5" />
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="w-full cursor-move"
        onWheel={handleWheel}
        onMouseDown={(e) => { setIsDragging(true); setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y }); }}
        onMouseMove={(e) => { if (isDragging) setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
      />
    </div>
  );
}