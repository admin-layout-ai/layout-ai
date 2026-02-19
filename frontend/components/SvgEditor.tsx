// frontend/components/SvgEditor.tsx
// Self-contained SVG floor plan editor with door placement tools.
// All editing state, handlers, toolbar, and canvas live here.

'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Loader2,
  Save,
  Trash2,
  RotateCw,
  MousePointer,
  DoorOpen,
  Undo2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PlacedDoor {
  id: number;
  x: number;
  y: number;
  rotation: number; // 0 | 90 | 180 | 270
  width: number;    // door width in SVG coordinate units
}

export interface SvgEditorSaveResult {
  previewImageUrl: string;
  doors: PlacedDoor[];
  updatedAt: string;
}

export interface SvgEditorProps {
  /** Azure blob URL (with optional cache-bust param) of the SVG to edit */
  svgUrl: string;
  /** IDs used to call the save endpoint */
  projectId: number;
  planId: number;
  /** Previously placed doors loaded from layout_data */
  existingDoors?: PlacedDoor[];
  /** Building envelope width in metres – used to auto-size doors */
  envelopeWidth?: number;
  /** Called after a successful save with the new preview URL + door data */
  onSave: (result: SvgEditorSaveResult) => void;
  /** Called when the user clicks Cancel */
  onCancel: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SvgEditor({
  svgUrl,
  projectId,
  planId,
  existingDoors,
  envelopeWidth = 12,
  onSave,
  onCancel,
}: SvgEditorProps) {

  // ── State ──────────────────────────────────────────────────────────────────

  const [isLoading, setIsLoading] = useState(true);
  const [svgContent, setSvgContent] = useState('');
  const [svgViewBox, setSvgViewBox] = useState({ x: 0, y: 0, w: 800, h: 1000 });

  const [placedDoors, setPlacedDoors] = useState<PlacedDoor[]>([]);
  const [activeTool, setActiveTool] = useState<'select' | 'door'>('door');
  const [selectedDoorId, setSelectedDoorId] = useState<number | null>(null);
  const [nextDoorId, setNextDoorId] = useState(1);
  const [doorRotation, setDoorRotation] = useState(0);
  const [doorWidth, setDoorWidth] = useState(40);
  const [isSaving, setIsSaving] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const svgInnerContent = useMemo(() => {
    if (!svgContent) return '';
    const cleaned = svgContent.replace(/<\?xml[^?]*\?>\s*/g, '');
    const match = cleaned.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    return match ? match[1] : '';
  }, [svgContent]);

  // ── Init: fetch SVG, parse viewBox, seed doors ────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(svgUrl);
        const text = await res.text();
        if (cancelled) return;

        setSvgContent(text);

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');

        if (svgEl) {
          const vb = svgEl.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
          if (vb && vb.length === 4) {
            setSvgViewBox({ x: vb[0], y: vb[1], w: vb[2], h: vb[3] });
            const svgUnitsPerMeter = vb[2] / envelopeWidth;
            setDoorWidth(Math.round(svgUnitsPerMeter * 0.82));
          } else {
            const w = parseFloat(svgEl.getAttribute('width') || '800');
            const h = parseFloat(svgEl.getAttribute('height') || '1000');
            setSvgViewBox({ x: 0, y: 0, w, h });
            setDoorWidth(Math.round(w * 0.04));
          }
        }

        // Seed previously-placed doors
        if (existingDoors && existingDoors.length > 0) {
          setPlacedDoors(existingDoors);
          setNextDoorId(Math.max(...existingDoors.map(d => d.id)) + 1);
        }
      } catch (err) {
        console.error('SvgEditor: failed to load SVG', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);          // run once on mount

  // ── Canvas click → place door ─────────────────────────────────────────────

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (activeTool !== 'door') {
        setSelectedDoorId(null);
        return;
      }

      const svg = e.currentTarget;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;

      const ctm = svg.getScreenCTM();
      if (!ctm) return;

      const svgPt = pt.matrixTransform(ctm.inverse());

      const newDoor: PlacedDoor = {
        id: nextDoorId,
        x: Math.round(svgPt.x),
        y: Math.round(svgPt.y),
        rotation: doorRotation,
        width: doorWidth,
      };

      setPlacedDoors(prev => [...prev, newDoor]);
      setNextDoorId(prev => prev + 1);
      setSelectedDoorId(newDoor.id);
    },
    [activeTool, nextDoorId, doorRotation, doorWidth],
  );

  const handleDoorClick = useCallback(
    (e: React.MouseEvent, doorId: number) => {
      e.stopPropagation();
      setSelectedDoorId(doorId);
    },
    [],
  );

  // ── Door actions ──────────────────────────────────────────────────────────

  const handleRotateSelected = useCallback(() => {
    if (selectedDoorId === null) return;
    setPlacedDoors(prev =>
      prev.map(d =>
        d.id === selectedDoorId ? { ...d, rotation: (d.rotation + 90) % 360 } : d,
      ),
    );
  }, [selectedDoorId]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedDoorId === null) return;
    setPlacedDoors(prev => prev.filter(d => d.id !== selectedDoorId));
    setSelectedDoorId(null);
  }, [selectedDoorId]);

  const handleUndo = useCallback(() => {
    setPlacedDoors(prev => {
      if (prev.length === 0) return prev;
      const removed = prev[prev.length - 1];
      if (selectedDoorId === removed.id) setSelectedDoorId(null);
      return prev.slice(0, -1);
    });
  }, [selectedDoorId]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!svgContent) return;
    setIsSaving(true);

    try {
      // Build door SVG elements for the final file
      const doorsSvg = placedDoors
        .map(door => {
          const w = door.width;
          return `<g transform="translate(${door.x}, ${door.y}) rotate(${door.rotation})" class="door-element" data-door-id="${door.id}">
  <line x1="0" y1="0" x2="${w}" y2="0" stroke="#000000" stroke-width="2" fill="none"/>
  <path d="M ${w},0 A ${w},${w} 0 0,1 0,${-w}" fill="none" stroke="#000000" stroke-width="1"/>
  <circle cx="0" cy="0" r="2" fill="#000000"/>
</g>`;
        })
        .join('\n');

      // Strip old doors layer, inject new one before </svg>
      let modifiedSvg = svgContent.replace(
        /<g\s+id="doors-layer"[\s\S]*?<\/g>\s*/g,
        '',
      );
      modifiedSvg = modifiedSvg.replace(
        '</svg>',
        `<g id="doors-layer">\n${doorsSvg}\n</g>\n</svg>`,
      );

      const token =
        localStorage.getItem('auth_token') ||
        localStorage.getItem('access_token');
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const res = await fetch(
        `${API_URL}/api/v1/plans/${projectId}/plans/${planId}/save-svg`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({
            svg_content: modifiedSvg,
            doors: placedDoors,
          }),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save');
      }

      const result = await res.json();
      const now = new Date().toISOString();

      onSave({
        previewImageUrl: result.preview_image_url,
        doors: placedDoors,
        updatedAt: now,
      });
    } catch (err) {
      console.error('SvgEditor save failed:', err);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading spinner ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-gray-400 text-sm">Loading editor…</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-3">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="bg-slate-800 rounded-xl border border-white/10 p-2 flex flex-wrap items-center gap-2">
        {/* Tool toggle */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setActiveTool('select')}
            className={`p-2 rounded-md text-sm flex items-center gap-1.5 transition ${
              activeTool === 'select'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            title="Select"
          >
            <MousePointer className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">Select</span>
          </button>
          <button
            onClick={() => {
              setActiveTool('door');
              setSelectedDoorId(null);
            }}
            className={`p-2 rounded-md text-sm flex items-center gap-1.5 transition ${
              activeTool === 'door'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            title="Add Door"
          >
            <DoorOpen className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">Door</span>
          </button>
        </div>

        <div className="w-px h-6 bg-white/10" />

        {/* Rotation presets */}
        <div className="flex items-center gap-1">
          <span className="text-gray-500 text-xs mr-1 hidden sm:inline">
            Angle:
          </span>
          {[0, 90, 180, 270].map(angle => (
            <button
              key={angle}
              onClick={() => setDoorRotation(angle)}
              className={`px-2 py-1 rounded text-xs font-mono transition ${
                doorRotation === angle
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white bg-white/5 hover:bg-white/10'
              }`}
            >
              {angle}°
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-white/10" />

        {/* Selected-door actions */}
        <button
          onClick={handleRotateSelected}
          disabled={selectedDoorId === null}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition disabled:opacity-30 disabled:cursor-not-allowed"
          title="Rotate selected door 90°"
        >
          <RotateCw className="w-4 h-4" />
        </button>
        <button
          onClick={handleDeleteSelected}
          disabled={selectedDoorId === null}
          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition disabled:opacity-30 disabled:cursor-not-allowed"
          title="Delete selected door"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={handleUndo}
          disabled={placedDoors.length === 0}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition disabled:opacity-30 disabled:cursor-not-allowed"
          title="Undo last door"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        <span className="text-gray-500 text-xs">
          {placedDoors.length} door{placedDoors.length !== 1 ? 's' : ''}
        </span>

        {/* Cancel / Save */}
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg text-xs transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Save
        </button>
      </div>

      {/* ── SVG Canvas ───────────────────────────────────────────────────── */}
      <div className="flex-1 bg-white rounded-xl shadow-xl overflow-hidden relative">
        <svg
          ref={svgRef}
          viewBox={`${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.w} ${svgViewBox.h}`}
          className="w-full h-full"
          style={{ cursor: activeTool === 'door' ? 'crosshair' : 'default' }}
          onClick={handleCanvasClick}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Original floor plan */}
          <g dangerouslySetInnerHTML={{ __html: svgInnerContent }} />

          {/* Placed doors */}
          <g id="doors-overlay">
            {placedDoors.map(door => {
              const w = door.width;
              const selected = door.id === selectedDoorId;
              return (
                <g
                  key={door.id}
                  transform={`translate(${door.x}, ${door.y}) rotate(${door.rotation})`}
                  onClick={e => handleDoorClick(e, door.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Selection highlight */}
                  {selected && (
                    <rect
                      x={-6}
                      y={-w - 6}
                      width={w + 12}
                      height={w + 12}
                      fill="rgba(59,130,246,0.08)"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      strokeDasharray="6,3"
                      rx="3"
                    />
                  )}
                  {/* Door leaf */}
                  <line
                    x1="0"
                    y1="0"
                    x2={w}
                    y2="0"
                    stroke={selected ? '#2563eb' : '#000'}
                    strokeWidth={selected ? 3 : 2}
                  />
                  {/* Swing arc */}
                  <path
                    d={`M ${w},0 A ${w},${w} 0 0,0 0,${-w}`}
                    fill="none"
                    stroke={selected ? '#2563eb' : '#000'}
                    strokeWidth={selected ? 1.5 : 1}
                    strokeDasharray="4,3"
                  />
                  {/* Hinge */}
                  <circle
                    cx="0"
                    cy="0"
                    r={selected ? 4 : 3}
                    fill={selected ? '#2563eb' : '#000'}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hint overlay */}
        {placedDoors.length === 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full pointer-events-none">
            Click on the floor plan to place a door
          </div>
        )}
      </div>
    </div>
  );
}
