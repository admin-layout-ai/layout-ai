// frontend/components/SvgEditor.tsx
// Self-contained SVG floor plan editor with door placement tools.
// Renders a 60/40 split: canvas on the left, controls on the right.
// The parent wraps this inside the same flex container used for the
// normal image + validation layout so it slots in seamlessly.

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2,
  Save,
  Trash2,
  RotateCw,
  MousePointer,
  DoorOpen,
  Undo2,
  Pencil,
  ArrowLeft,
  Move,
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
  /** Azure blob URL of the SVG to edit */
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
  /** Called when the user clicks Cancel / Back */
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
  const svgContentGroupRef = useRef<SVGGElement>(null);

  // Drag state for mouse-based door movement
  const isDragging = useRef(false);
  const wasDragged = useRef(false);
  const dragDoorId = useRef<number | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Arrow key nudge step in SVG units (recalculated from envelope)
  const nudgeStep = useRef(1);

  // ── Inject original SVG content via DOM (React can't handle SVG namespaces) ─

  useEffect(() => {
    if (!svgContent || !svgContentGroupRef.current) return;
    // Strip XML declaration
    const cleaned = svgContent.replace(/<\?xml[^?]*\?>\s*/g, '');
    // Extract inner content between <svg> and </svg>
    const match = cleaned.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    if (match && match[1]) {
      svgContentGroupRef.current.innerHTML = match[1];
    }
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
            setDoorWidth(Math.round(svgUnitsPerMeter * 0.82)); // 820mm standard door
            nudgeStep.current = Math.max(1, Math.round(svgUnitsPerMeter * 0.05)); // 50mm per arrow press
          } else {
            const w = parseFloat(svgEl.getAttribute('width') || '800');
            const h = parseFloat(svgEl.getAttribute('height') || '1000');
            setSvgViewBox({ x: 0, y: 0, w, h });
            const fallbackUnitsPerMeter = w / envelopeWidth;
            setDoorWidth(Math.round(fallbackUnitsPerMeter * 0.82));
            nudgeStep.current = Math.max(1, Math.round(fallbackUnitsPerMeter * 0.05));
          }
        }

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
  }, []);

  // ── Canvas click → place door ─────────────────────────────────────────────

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Don't place a door if we just finished dragging one
      if (wasDragged.current) {
        wasDragged.current = false;
        return;
      }

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

  // ── Keyboard arrow keys → nudge selected door ─────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedDoorId === null) return;
      const step = e.shiftKey ? nudgeStep.current * 5 : nudgeStep.current; // Shift = 5x bigger step
      let dx = 0, dy = 0;

      switch (e.key) {
        case 'ArrowUp':    dy = -step; break;
        case 'ArrowDown':  dy = step;  break;
        case 'ArrowLeft':  dx = -step; break;
        case 'ArrowRight': dx = step;  break;
        case 'Delete':
        case 'Backspace':  handleDeleteSelected(); return;
        case 'r':
        case 'R':          handleRotateSelected(); return;
        default: return;
      }

      e.preventDefault();
      setPlacedDoors(prev =>
        prev.map(d =>
          d.id === selectedDoorId
            ? { ...d, x: d.x + dx, y: d.y + dy }
            : d,
        ),
      );
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDoorId, handleDeleteSelected, handleRotateSelected]);

  // ── Mouse drag → move selected door ───────────────────────────────────────

  // Convert screen coords to SVG coords
  const screenToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  }, []);

  const handleDoorMouseDown = useCallback(
    (e: React.MouseEvent, doorId: number) => {
      e.stopPropagation();
      e.preventDefault();

      // Select the door
      setSelectedDoorId(doorId);
      setActiveTool('select');

      // Calculate offset between click point and door origin
      const svgPt = screenToSvg(e.clientX, e.clientY);
      if (!svgPt) return;

      const door = placedDoors.find(d => d.id === doorId);
      if (!door) return;

      isDragging.current = true;
      wasDragged.current = false;
      dragDoorId.current = doorId;
      dragOffset.current = { x: svgPt.x - door.x, y: svgPt.y - door.y };
    },
    [placedDoors, screenToSvg],
  );

  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging.current || dragDoorId.current === null) return;

      wasDragged.current = true;
      const svgPt = screenToSvg(e.clientX, e.clientY);
      if (!svgPt) return;

      const newX = Math.round(svgPt.x - dragOffset.current.x);
      const newY = Math.round(svgPt.y - dragOffset.current.y);

      setPlacedDoors(prev =>
        prev.map(d =>
          d.id === dragDoorId.current
            ? { ...d, x: newX, y: newY }
            : d,
        ),
      );
    },
    [screenToSvg],
  );

  const handleSvgMouseUp = useCallback(() => {
    isDragging.current = false;
    dragDoorId.current = null;
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!svgContent) return;
    setIsSaving(true);

    try {
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

      onSave({
        previewImageUrl: result.preview_image_url,
        doors: placedDoors,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('SvgEditor save failed:', err);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading editor…</p>
        </div>
      </div>
    );
  }

  // ── Render — two children that slot into the parent's flex row ─────────

  return (
    <>
      {/* ── LEFT: SVG Canvas (60%) ─────────────────────────────────────── */}
      <div className="w-full lg:w-[60%] p-3 sm:p-4 lg:p-6 flex flex-col overflow-visible lg:overflow-hidden min-h-[300px] sm:min-h-[400px]">
        <div className="flex-1 bg-white rounded-xl shadow-xl overflow-hidden relative">
          <svg
            ref={svgRef}
            viewBox={`${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.w} ${svgViewBox.h}`}
            className="w-full h-full"
            style={{ cursor: isDragging.current ? 'grabbing' : activeTool === 'door' ? 'crosshair' : 'default' }}
            onClick={handleCanvasClick}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
            preserveAspectRatio="xMidYMid meet"
            tabIndex={0}
          >
            <g ref={svgContentGroupRef} />

            <g id="doors-overlay">
              {placedDoors.map(door => {
                const w = door.width;
                const selected = door.id === selectedDoorId;
                return (
                  <g
                    key={door.id}
                    transform={`translate(${door.x}, ${door.y}) rotate(${door.rotation})`}
                    onClick={e => handleDoorClick(e, door.id)}
                    onMouseDown={e => handleDoorMouseDown(e, door.id)}
                    style={{ cursor: selected ? 'grab' : 'pointer' }}
                  >
                    {selected && (
                      <rect
                        x={-6} y={-w - 6}
                        width={w + 12} height={w + 12}
                        fill="rgba(59,130,246,0.08)"
                        stroke="#3b82f6" strokeWidth="2"
                        strokeDasharray="6,3" rx="3"
                      />
                    )}
                    <line
                      x1="0" y1="0" x2={w} y2="0"
                      stroke={selected ? '#2563eb' : '#000'}
                      strokeWidth={selected ? 3 : 2}
                    />
                    <path
                      d={`M ${w},0 A ${w},${w} 0 0,0 0,${-w}`}
                      fill="none"
                      stroke={selected ? '#2563eb' : '#000'}
                      strokeWidth={selected ? 1.5 : 1}
                      strokeDasharray="4,3"
                    />
                    <circle
                      cx="0" cy="0"
                      r={selected ? 4 : 3}
                      fill={selected ? '#2563eb' : '#000'}
                    />
                  </g>
                );
              })}
            </g>
          </svg>

          {placedDoors.length === 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full pointer-events-none">
              Click on the floor plan to place a door
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Editor Controls (40%) ───────────────────────────────── */}
      <div className="w-full lg:w-[40%] p-3 sm:p-4 lg:p-6 border-t lg:border-t-0 lg:border-l border-white/10 overflow-y-auto">
        <div className="space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2 text-sm sm:text-base">
              <Pencil className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
              Floor Plan Editor
            </h3>
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          </div>

          {/* Active Tool */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Tool</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setActiveTool('select')}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg text-sm font-medium transition ${
                  activeTool === 'select'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
                }`}
              >
                <MousePointer className="w-4 h-4" />
                Select
              </button>
              <button
                onClick={() => { setActiveTool('door'); setSelectedDoorId(null); }}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg text-sm font-medium transition ${
                  activeTool === 'door'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
                }`}
              >
                <DoorOpen className="w-4 h-4" />
                Add Door
              </button>
            </div>
          </div>

          {/* Door Rotation */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Door Rotation</h4>
            <div className="grid grid-cols-4 gap-2">
              {[0, 90, 180, 270].map(angle => (
                <button
                  key={angle}
                  onClick={() => setDoorRotation(angle)}
                  className={`py-2 rounded-lg text-sm font-mono transition ${
                    doorRotation === angle
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {angle}°
                </button>
              ))}
            </div>
          </div>

          {/* Selected Door Actions */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Actions</h4>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleRotateSelected}
                disabled={selectedDoorId === null}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white"
                title="Rotate selected 90°"
              >
                <RotateCw className="w-4 h-4" />
                <span className="text-xs">Rotate</span>
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={selectedDoorId === null}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-red-400"
                title="Delete selected"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-xs">Delete</span>
              </button>
              <button
                onClick={handleUndo}
                disabled={placedDoors.length === 0}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white"
                title="Undo last"
              >
                <Undo2 className="w-4 h-4" />
                <span className="text-xs">Undo</span>
              </button>
            </div>
            {/* Keyboard shortcut hints */}
            <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
              <div className="flex items-center gap-2 text-gray-500 text-[10px]">
                <Move className="w-3 h-3" />
                <span>Arrow keys to nudge · Shift+Arrow = 5× faster</span>
              </div>
              <div className="flex items-center gap-2 text-gray-500 text-[10px]">
                <span className="ml-5">Drag door with mouse · R = rotate · Del = delete</span>
              </div>
            </div>
          </div>

          {/* Placed Doors List */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Placed Doors</h4>
              <span className="text-white font-semibold text-lg">{placedDoors.length}</span>
            </div>
            {placedDoors.length > 0 && (
              <div className="mt-2 max-h-[140px] overflow-y-auto space-y-1.5" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                {placedDoors.map((door, idx) => (
                  <button
                    key={door.id}
                    onClick={() => { setActiveTool('select'); setSelectedDoorId(door.id); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition ${
                      door.id === selectedDoorId
                        ? 'bg-blue-600/20 border border-blue-500/50 text-blue-400'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <DoorOpen className="w-3 h-3" />
                      Door {idx + 1}
                    </span>
                    <span className="font-mono">{door.rotation}°</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Save / Cancel */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              onClick={onCancel}
              className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white py-3 rounded-xl text-sm font-medium transition border border-white/10"
            >
              Cancel
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
