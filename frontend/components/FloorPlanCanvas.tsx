'use client';

import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Download, Maximize2, Image as ImageIcon } from 'lucide-react';

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
}

interface RenderedImages {
  pdf?: string;
  png?: string;
  thumbnail?: string;
}

interface LayoutData {
  rooms?: Room[];
  total_area?: number;
  variant_name?: string;
  design_name?: string;
  description?: string;
  rendered_images?: RenderedImages;
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

// Room colors for fallback rendering
const ROOM_COLORS: Record<string, { fill: string; stroke: string }> = {
  garage: { fill: '#f5f5f5', stroke: '#374151' },
  entry: { fill: '#fefce8', stroke: '#854d0e' },
  living: { fill: '#eff6ff', stroke: '#1e40af' },
  family: { fill: '#eff6ff', stroke: '#1e40af' },
  kitchen: { fill: '#ecfdf5', stroke: '#065f46' },
  dining: { fill: '#fdf2f8', stroke: '#9d174d' },
  bedroom: { fill: '#faf5ff', stroke: '#7c3aed' },
  master: { fill: '#fdf4ff', stroke: '#a21caf' },
  ensuite: { fill: '#e0f2fe', stroke: '#0284c7' },
  bathroom: { fill: '#e0f2fe', stroke: '#0284c7' },
  laundry: { fill: '#e0f2fe', stroke: '#0369a1' },
  study: { fill: '#fef2f2', stroke: '#b91c1c' },
  office: { fill: '#fef2f2', stroke: '#b91c1c' },
  alfresco: { fill: '#dcfce7', stroke: '#15803d' },
  pantry: { fill: '#d1fae5', stroke: '#047857' },
  wir: { fill: '#fef3c7', stroke: '#b45309' },
  theatre: { fill: '#eef2ff', stroke: '#3730a3' },
};

export default function FloorPlanCanvas({
  data,
  layoutData,
  compact = false,
  selectedFloor = 0,
}: FloorPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const floorPlanData = layoutData || data;
  const renderedImages = floorPlanData?.rendered_images;
  const hasRenderedImage = renderedImages?.png || renderedImages?.pdf;

  // Check if we have a pre-rendered CAD image
  const imageUrl = renderedImages?.png || null;
  const pdfUrl = renderedImages?.pdf || null;
  const thumbnailUrl = renderedImages?.thumbnail || null;

  // If we have a rendered image, display it
  // Otherwise, fall back to basic canvas rendering

  useEffect(() => {
    if (!hasRenderedImage) {
      // No pre-rendered image, use fallback canvas
      drawFallbackCanvas();
    }
  }, [floorPlanData, scale, hasRenderedImage, selectedFloor]);

  const drawFallbackCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !floorPlanData?.rooms) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High DPI
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    const rooms = floorPlanData.rooms.filter(r => (r.floor || 0) === selectedFloor);
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

    const padding = compact ? 20 : 50;
    const scaleX = (displayWidth - padding * 2) / ((maxX - minX) || 1);
    const scaleY = (displayHeight - padding * 2) / ((maxY - minY) || 1);
    const autoScale = Math.min(scaleX, scaleY) * scale * 0.9;

    const offsetX = padding + (displayWidth - padding * 2 - (maxX - minX) * autoScale) / 2 - minX * autoScale;
    const offsetY = padding + (displayHeight - padding * 2 - (maxY - minY) * autoScale) / 2 - minY * autoScale;

    const tx = (x: number) => x * autoScale + offsetX;
    const ty = (y: number) => y * autoScale + offsetY;
    const ts = (size: number) => size * autoScale;

    // Draw rooms
    rooms.forEach(room => {
      const x = tx(room.x || 0);
      const y = ty(room.y || 0);
      const w = ts(room.width);
      const h = ts(room.depth);

      const roomType = room.type.toLowerCase().replace(/[\s-]+/g, '_');
      const colors = ROOM_COLORS[roomType] || ROOM_COLORS[roomType.split('_')[0]] || { fill: '#fafafa', stroke: '#6b7280' };

      // Fill
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x, y, w, h);

      // Stroke
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Label
      if (w > 30 && h > 25) {
        const fontSize = Math.max(8, Math.min(11, Math.min(w, h) / 8));
        ctx.fillStyle = '#1f2937';
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const name = room.name.length > 12 ? room.name.substring(0, 10) + '..' : room.name;
        ctx.fillText(name.toUpperCase(), x + w / 2, y + h / 2 - fontSize * 0.6);

        ctx.fillStyle = '#6b7280';
        ctx.font = `${fontSize - 2}px Arial`;
        ctx.fillText(`${room.width.toFixed(1)} × ${room.depth.toFixed(1)}`, x + w / 2, y + h / 2 + 4);

        ctx.fillStyle = '#9ca3af';
        ctx.font = `${fontSize - 2}px Arial`;
        const area = room.area || room.width * room.depth;
        ctx.fillText(`${area.toFixed(1)}m²`, x + w / 2, y + h / 2 + fontSize + 2);
      }
    });

    // Note about CAD rendering
    if (!compact) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Basic preview - Download PDF for CAD-quality output', 10, displayHeight - 10);
    }
  };

  const handleDownloadPDF = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  };

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (!isFullscreen) {
        containerRef.current.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
      setIsFullscreen(!isFullscreen);
    }
  };

  const canvasWidth = compact ? 400 : 900;
  const canvasHeight = compact ? 300 : 650;

  // If we have a rendered image, show it
  if (hasRenderedImage && imageUrl) {
    return (
      <div ref={containerRef} className="relative bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        {!compact && (
          <div className="absolute top-3 right-3 flex gap-1.5 z-10">
            <button
              onClick={() => setScale(prev => Math.min(3, prev * 1.2))}
              className="p-2 bg-white/90 rounded-lg shadow-sm hover:bg-gray-50 transition"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => setScale(prev => Math.max(0.5, prev * 0.8))}
              className="p-2 bg-white/90 rounded-lg shadow-sm hover:bg-gray-50 transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => setScale(1)}
              className="p-2 bg-white/90 rounded-lg shadow-sm hover:bg-gray-50 transition"
              title="Reset Zoom"
            >
              <RotateCw className="w-4 h-4 text-gray-600" />
            </button>
            <div className="w-px bg-gray-200 mx-0.5" />
            <button
              onClick={handleFullscreen}
              className="p-2 bg-white/90 rounded-lg shadow-sm hover:bg-gray-50 transition"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4 text-gray-600" />
            </button>
            {pdfUrl && (
              <button
                onClick={handleDownloadPDF}
                className="p-2 bg-blue-500 text-white rounded-lg shadow-sm hover:bg-blue-600 transition"
                title="Download PDF"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* CAD Rendered Image */}
        <div 
          className="overflow-auto"
          style={{ 
            width: canvasWidth, 
            height: canvasHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f9fafb'
          }}
        >
          {!imageLoaded && !imageError && (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <ImageIcon className="w-8 h-8 animate-pulse" />
              <span className="text-sm">Loading CAD floor plan...</span>
            </div>
          )}
          
          {imageError && (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <ImageIcon className="w-8 h-8" />
              <span className="text-sm">Failed to load image</span>
              {pdfUrl && (
                <button 
                  onClick={handleDownloadPDF}
                  className="text-blue-500 hover:underline text-sm"
                >
                  Download PDF instead
                </button>
              )}
            </div>
          )}

          <img
            src={imageUrl}
            alt="CAD Floor Plan"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center',
              maxWidth: '100%',
              maxHeight: '100%',
              display: imageLoaded ? 'block' : 'none',
            }}
            className="transition-transform duration-200"
          />
        </div>

        {/* CAD Quality Badge */}
        {!compact && imageLoaded && (
          <div className="absolute bottom-3 left-3 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            CAD Quality
          </div>
        )}
      </div>
    );
  }

  // Fallback: Basic canvas rendering
  return (
    <div ref={containerRef} className="relative bg-white rounded-lg border border-gray-200">
      {/* Toolbar */}
      {!compact && (
        <div className="absolute top-3 right-3 flex gap-1.5 z-10">
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
            onClick={() => setScale(1)}
            className="p-2 bg-white rounded-lg shadow-sm hover:bg-gray-50 transition"
            title="Reset Zoom"
          >
            <RotateCw className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{ width: canvasWidth, height: canvasHeight }}
        className="w-full"
      />

      {/* Preview indicator */}
      {!compact && (
        <div className="absolute bottom-3 left-3 bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Preview Mode
        </div>
      )}
    </div>
  );
}
