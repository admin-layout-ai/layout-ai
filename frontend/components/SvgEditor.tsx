// frontend/components/SvgEditor.tsx
// Floor plan editor: Doors · Walls · Windows · Robes
// 60/40 split – canvas left, controls right.

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
  FlipHorizontal2,
  Minus,
  Eraser,
  Square,
  LayoutGrid,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PlacedDoor {
  id: number;
  x: number;
  y: number;
  rotation: number;
  width: number;
  flipped: boolean;
}

export interface PlacedWall {
  id: number;
  x1: number; y1: number;
  x2: number; y2: number;
  /** true when the user has curved this segment */
  curved: boolean;
  /** Quadratic Bézier control point (only used when curved=true) */
  cpx: number; cpy: number;
}

export interface PlacedWindow {
  id: number;
  x: number; y: number;
  rotation: number;
  width: number;
  flipped: boolean;
}

export interface PlacedRobe {
  id: number;
  x: number; y: number;
  rotation: number;
  /** length in SVG units (user-adjustable) */
  length: number;
  /** width is always fixed to 600 mm in SVG units – stored for convenience */
  width: number;
}

export interface SvgEditorSaveResult {
  previewImageUrl: string;
  doors: PlacedDoor[];
  walls: PlacedWall[];
  windows: PlacedWindow[];
  robes: PlacedRobe[];
  updatedAt: string;
}

export interface SvgEditorProps {
  svgUrl: string;
  projectId: number;
  planId: number;
  existingDoors?: PlacedDoor[];
  existingWalls?: PlacedWall[];
  existingWindows?: PlacedWindow[];
  existingRobes?: PlacedRobe[];
  envelopeWidth?: number;
  onSave: (result: SvgEditorSaveResult) => void;
  onCancel: () => void;
}

// ── Drag target union ──────────────────────────────────────────────────────────

type DragTarget =
  | { kind: 'door';       id: number; ox: number; oy: number }
  | { kind: 'wall-body';  id: number; grabX: number; grabY: number; startX1: number; startY1: number; startX2: number; startY2: number }
  | { kind: 'wall-ep1';   id: number }
  | { kind: 'wall-ep2';   id: number }
  | { kind: 'wall-mid';   id: number }
  | { kind: 'window';     id: number; ox: number; oy: number }
  | { kind: 'robe';       id: number; ox: number; oy: number };

// ── Undo history ───────────────────────────────────────────────────────────────

type HistoryEntry =
  | { type: 'door';   element: PlacedDoor }
  | { type: 'wall';   element: PlacedWall }
  | { type: 'window'; element: PlacedWindow }
  | { type: 'robe';   element: PlacedRobe };

type ActiveTool = 'select' | 'door' | 'wall' | 'wall-erase' | 'window' | 'robe';
type SelectedEl = { kind: 'door' | 'wall' | 'window' | 'robe'; id: number } | null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SvgEditor({
  svgUrl,
  projectId,
  planId,
  existingDoors,
  existingWalls,
  existingWindows,
  existingRobes,
  envelopeWidth = 12,
  onSave,
  onCancel,
}: SvgEditorProps) {

  // ── Core state ─────────────────────────────────────────────────────────────

  const [isLoading, setIsLoading] = useState(true);
  const [svgContent, setSvgContent] = useState('');
  const [svgViewBox, setSvgViewBox] = useState({ x: 0, y: 0, w: 800, h: 1000 });
  const [isSaving, setIsSaving] = useState(false);

  // Metric helpers (in SVG units)
  const [unitsPerMeter, setUnitsPerMeter] = useState(80);
  const [wallClearHeight, setWallClearHeight] = useState(8);
  const nudgeStep = useRef(1);

  // Per-type state
  const [placedDoors,   setPlacedDoors]   = useState<PlacedDoor[]>([]);
  const [placedWalls,   setPlacedWalls]   = useState<PlacedWall[]>([]);
  const [placedWindows, setPlacedWindows] = useState<PlacedWindow[]>([]);
  const [placedRobes,   setPlacedRobes]   = useState<PlacedRobe[]>([]);

  // IDs
  const [nextDoorId,   setNextDoorId]   = useState(1);
  const [nextWallId,   setNextWallId]   = useState(1);
  const [nextWindowId, setNextWindowId] = useState(1);
  const [nextRobeId,   setNextRobeId]   = useState(1);

  // Default sizes
  const [doorWidth,   setDoorWidth]   = useState(40);   // ~820mm
  const [windowWidth, setWindowWidth] = useState(50);   // ~1000mm
  const [robeFixedW,  setRobeFixedW]  = useState(30);   // fixed 600mm
  const [robeLength,  setRobeLength]  = useState(80);   // default ~1600mm
  const [wallStroke,  setWallStroke]  = useState(5);    // SVG stroke-width

  // Active tool & selection
  const [activeTool, setActiveTool] = useState<ActiveTool>('door');
  const [selectedEl, setSelectedEl] = useState<SelectedEl>(null);

  // Wall drawing (two-click mode)
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Undo history
  const [addHistory, setAddHistory] = useState<HistoryEntry[]>([]);

  // Refs
  const svgRef = useRef<SVGSVGElement>(null);
  const svgContentGroupRef = useRef<SVGGElement>(null);
  const activeDrag = useRef<DragTarget | null>(null);
  const wasDragged = useRef(false);

  // ── Inject SVG content ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!svgContent || !svgContentGroupRef.current) return;
    const cleaned = svgContent.replace(/<\?xml[^?]*\?>\s*/g, '');
    const match = cleaned.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    if (match && match[1]) svgContentGroupRef.current.innerHTML = match[1];
  }, [svgContent]);

  // ── Init ────────────────────────────────────────────────────────────────────

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
          } else {
            const w = parseFloat(svgEl.getAttribute('width') || '800');
            const h = parseFloat(svgEl.getAttribute('height') || '1000');
            setSvgViewBox({ x: 0, y: 0, w, h });
          }

          // Scale detection
          let svgUnitsPerMeter = 0;
          const allRects = Array.from(svgEl.querySelectorAll('rect[fill="#1a1a1a"]'));
          const verticalWalls = allRects
            .filter(r => {
              const rw = parseFloat(r.getAttribute('width') || '0');
              const rh = parseFloat(r.getAttribute('height') || '0');
              return rh > rw * 2 && rh > 20;
            })
            .map(r => ({ x: parseFloat(r.getAttribute('x') || '0'), w: parseFloat(r.getAttribute('width') || '0') }));

          const dimTexts = Array.from(svgEl.querySelectorAll('text'));
          const dimRegex = /^(\d+\.?\d*)\s*m\s*x\s*(\d+\.?\d*)\s*m$/i;
          let roomWidthM = 0, roomTextX = 0;
          for (const t of dimTexts) {
            const match = (t.textContent || '').trim().match(dimRegex);
            if (match) {
              const rw = parseFloat(match[1]);
              if (rw > roomWidthM) { roomWidthM = rw; roomTextX = parseFloat(t.getAttribute('x') || '0'); }
            }
          }

          if (roomWidthM > 0 && verticalWalls.length >= 2) {
            const sorted = [...verticalWalls].sort((a, b) => a.x - b.x);
            let bestLeft: typeof sorted[0] | null = null;
            let bestRight: typeof sorted[0] | null = null;
            for (const vw of sorted) { if (vw.x + vw.w <= roomTextX) bestLeft = vw; }
            for (const vw of sorted) { if (vw.x >= roomTextX && !bestRight) bestRight = vw; }
            if (bestLeft && bestRight) {
              const roomSvgWidth = bestRight.x - (bestLeft.x + bestLeft.w);
              if (roomSvgWidth > 0) svgUnitsPerMeter = roomSvgWidth / roomWidthM;
            }
          }

          if (svgUnitsPerMeter <= 0) {
            let minX = Infinity, maxX = -Infinity;
            allRects.forEach(r => {
              const rx = parseFloat(r.getAttribute('x') || '0');
              const rw = parseFloat(r.getAttribute('width') || '0');
              if (rx < minX) minX = rx;
              if (rx + rw > maxX) maxX = rx + rw;
            });
            const buildingWidth = maxX > minX ? maxX - minX : (vb ? vb[2] : 800);
            svgUnitsPerMeter = buildingWidth / envelopeWidth;
          }

          const upm = svgUnitsPerMeter;
          setUnitsPerMeter(upm);
          setDoorWidth(Math.round(upm * 0.82));
          setWindowWidth(Math.round(upm * 1.0));
          setRobeFixedW(Math.round(upm * 0.6));
          setRobeLength(Math.round(upm * 1.6));
          setWallClearHeight(Math.max(16, Math.round(upm * 0.35)));
          setWallStroke(Math.max(3, Math.round(upm * 0.06)));
          nudgeStep.current = Math.max(1, Math.round(upm * 0.05));
        }

        // Seed existing elements
        if (existingDoors?.length)   { setPlacedDoors(existingDoors);   setNextDoorId(Math.max(...existingDoors.map(d => d.id)) + 1); }
        if (existingWalls?.length)   { setPlacedWalls(existingWalls);   setNextWallId(Math.max(...existingWalls.map(w => w.id)) + 1); }
        if (existingWindows?.length) { setPlacedWindows(existingWindows); setNextWindowId(Math.max(...existingWindows.map(w => w.id)) + 1); }
        if (existingRobes?.length)   { setPlacedRobes(existingRobes);   setNextRobeId(Math.max(...existingRobes.map(r => r.id)) + 1); }

      } catch (err) {
        console.error('SvgEditor: failed to load SVG', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── SVG coordinate helper ───────────────────────────────────────────────────

  const screenToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  }, []);

  // ── Canvas click ────────────────────────────────────────────────────────────

  const handleCanvasClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (wasDragged.current) { wasDragged.current = false; return; }

    const svgPt = screenToSvg(e.clientX, e.clientY);
    if (!svgPt) return;
    const cx = Math.round(svgPt.x);
    const cy = Math.round(svgPt.y);

    if (activeTool === 'select') {
      setSelectedEl(null);
      return;
    }

    if (activeTool === 'door') {
      const newDoor: PlacedDoor = { id: nextDoorId, x: cx, y: cy, rotation: 0, width: doorWidth, flipped: false };
      setPlacedDoors(prev => [...prev, newDoor]);
      setNextDoorId(p => p + 1);
      setSelectedEl({ kind: 'door', id: newDoor.id });
      setAddHistory(prev => [...prev, { type: 'door', element: newDoor }]);
      return;
    }

    if (activeTool === 'wall') {
      if (!wallStart) {
        setWallStart({ x: cx, y: cy });
      } else {
        const newWall: PlacedWall = {
          id: nextWallId,
          x1: wallStart.x, y1: wallStart.y,
          x2: cx, y2: cy,
          curved: false,
          cpx: (wallStart.x + cx) / 2,
          cpy: (wallStart.y + cy) / 2,
        };
        setPlacedWalls(prev => [...prev, newWall]);
        setNextWallId(p => p + 1);
        setSelectedEl({ kind: 'wall', id: newWall.id });
        setAddHistory(prev => [...prev, { type: 'wall', element: newWall }]);
        setWallStart(null); // end this segment; start next from same point if shift held
      }
      return;
    }

    if (activeTool === 'wall-erase') {
      // Find nearest wall within a tolerance of wallStroke * 3
      const tol = Math.max(wallStroke * 4, 12);
      let nearest: PlacedWall | null = null;
      let nearestDist = tol;
      for (const w of placedWalls) {
        const d = distPointToSegment(cx, cy, w.x1, w.y1, w.x2, w.y2);
        if (d < nearestDist) { nearestDist = d; nearest = w; }
      }
      if (nearest) {
        setPlacedWalls(prev => prev.filter(w => w.id !== nearest!.id));
        if (selectedEl?.kind === 'wall' && selectedEl.id === nearest.id) setSelectedEl(null);
      }
      return;
    }

    if (activeTool === 'window') {
      const newWindow: PlacedWindow = { id: nextWindowId, x: cx, y: cy, rotation: 0, width: windowWidth, flipped: false };
      setPlacedWindows(prev => [...prev, newWindow]);
      setNextWindowId(p => p + 1);
      setSelectedEl({ kind: 'window', id: newWindow.id });
      setAddHistory(prev => [...prev, { type: 'window', element: newWindow }]);
      return;
    }

    if (activeTool === 'robe') {
      const newRobe: PlacedRobe = { id: nextRobeId, x: cx, y: cy, rotation: 0, length: robeLength, width: robeFixedW };
      setPlacedRobes(prev => [...prev, newRobe]);
      setNextRobeId(p => p + 1);
      setSelectedEl({ kind: 'robe', id: newRobe.id });
      setAddHistory(prev => [...prev, { type: 'robe', element: newRobe }]);
      return;
    }
  }, [activeTool, nextDoorId, nextWallId, nextWindowId, nextRobeId,
      doorWidth, windowWidth, robeLength, robeFixedW,
      wallStart, wallStroke, placedWalls, selectedEl, screenToSvg]);

  // ── Element click (stops propagation) ──────────────────────────────────────

  const handleElementClick = useCallback((e: React.MouseEvent, kind: SelectedEl['kind'], id: number) => {
    e.stopPropagation();
    if (activeTool === 'wall-erase' && kind === 'wall') {
      setPlacedWalls(prev => prev.filter(w => w.id !== id));
      if (selectedEl?.id === id) setSelectedEl(null);
      return;
    }
    setSelectedEl({ kind, id });
    if (activeTool !== 'select') setActiveTool('select');
  }, [activeTool, selectedEl]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleRotateSelected = useCallback(() => {
    if (!selectedEl) return;
    if (selectedEl.kind === 'door') {
      setPlacedDoors(prev => prev.map(d => d.id === selectedEl.id ? { ...d, rotation: (d.rotation + 90) % 360 } : d));
    } else if (selectedEl.kind === 'window') {
      setPlacedWindows(prev => prev.map(w => w.id === selectedEl.id ? { ...w, rotation: (w.rotation + 90) % 360 } : w));
    } else if (selectedEl.kind === 'robe') {
      setPlacedRobes(prev => prev.map(r => r.id === selectedEl.id ? { ...r, rotation: (r.rotation + 90) % 360 } : r));
    }
  }, [selectedEl]);

  const handleFlipSelected = useCallback(() => {
    if (!selectedEl) return;
    if (selectedEl.kind === 'door') {
      setPlacedDoors(prev => prev.map(d => d.id === selectedEl.id ? { ...d, flipped: !d.flipped } : d));
    } else if (selectedEl.kind === 'window') {
      setPlacedWindows(prev => prev.map(w => w.id === selectedEl.id ? { ...w, flipped: !w.flipped } : w));
    }
  }, [selectedEl]);

  const handleCurveSelected = useCallback(() => {
    if (selectedEl?.kind !== 'wall') return;
    setPlacedWalls(prev => prev.map(w => {
      if (w.id !== selectedEl.id) return w;
      if (w.curved) return { ...w, curved: false, cpx: (w.x1 + w.x2) / 2, cpy: (w.y1 + w.y2) / 2 };
      // nudge control point perpendicular to wall
      const mx = (w.x1 + w.x2) / 2;
      const my = (w.y1 + w.y2) / 2;
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
      const perp = { x: -(w.y2 - w.y1) / len, y: (w.x2 - w.x1) / len };
      return { ...w, curved: true, cpx: mx + perp.x * len * 0.2, cpy: my + perp.y * len * 0.2 };
    }));
  }, [selectedEl]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedEl) return;
    if (selectedEl.kind === 'door')   setPlacedDoors(prev => prev.filter(d => d.id !== selectedEl.id));
    if (selectedEl.kind === 'wall')   setPlacedWalls(prev => prev.filter(w => w.id !== selectedEl.id));
    if (selectedEl.kind === 'window') setPlacedWindows(prev => prev.filter(w => w.id !== selectedEl.id));
    if (selectedEl.kind === 'robe')   setPlacedRobes(prev => prev.filter(r => r.id !== selectedEl.id));
    setSelectedEl(null);
  }, [selectedEl]);

  const handleUndo = useCallback(() => {
    if (addHistory.length === 0) return;
    const last = addHistory[addHistory.length - 1];
    if (last.type === 'door')   setPlacedDoors(prev => prev.filter(d => d.id !== last.element.id));
    if (last.type === 'wall')   setPlacedWalls(prev => prev.filter(w => w.id !== last.element.id));
    if (last.type === 'window') setPlacedWindows(prev => prev.filter(w => w.id !== last.element.id));
    if (last.type === 'robe')   setPlacedRobes(prev => prev.filter(r => r.id !== last.element.id));
    if (selectedEl?.id === last.element.id) setSelectedEl(null);
    setAddHistory(prev => prev.slice(0, -1));
  }, [addHistory, selectedEl]);

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape: cancel wall drawing or deselect
      if (e.key === 'Escape') { setWallStart(null); setSelectedEl(null); return; }

      if (e.key === 'r' || e.key === 'R') { handleRotateSelected(); return; }
      if (e.key === 'f' || e.key === 'F') { handleFlipSelected(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEl) { e.preventDefault(); handleDeleteSelected(); return; }

      if (!selectedEl) return;
      const step = e.shiftKey ? nudgeStep.current * 5 : nudgeStep.current;
      let dx = 0, dy = 0;
      switch (e.key) {
        case 'ArrowUp':    dy = -step; break;
        case 'ArrowDown':  dy =  step; break;
        case 'ArrowLeft':  dx = -step; break;
        case 'ArrowRight': dx =  step; break;
        default: return;
      }
      e.preventDefault();

      if (selectedEl.kind === 'door') {
        setPlacedDoors(prev => prev.map(d => d.id === selectedEl.id ? { ...d, x: d.x + dx, y: d.y + dy } : d));
      } else if (selectedEl.kind === 'wall') {
        setPlacedWalls(prev => prev.map(w => w.id === selectedEl.id ? { ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy, cpx: w.cpx + dx, cpy: w.cpy + dy } : w));
      } else if (selectedEl.kind === 'window') {
        setPlacedWindows(prev => prev.map(w => w.id === selectedEl.id ? { ...w, x: w.x + dx, y: w.y + dy } : w));
      } else if (selectedEl.kind === 'robe') {
        setPlacedRobes(prev => prev.map(r => r.id === selectedEl.id ? { ...r, x: r.x + dx, y: r.y + dy } : r));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEl, handleRotateSelected, handleFlipSelected, handleDeleteSelected]);

  // ── Mouse Move (drag + wall preview) ─────────────────────────────────────────

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svgPt = screenToSvg(e.clientX, e.clientY);
    if (!svgPt) return;
    const cx = svgPt.x, cy = svgPt.y;

    // Update cursor for wall preview
    setCursorPos({ x: cx, y: cy });

    if (!activeDrag.current) return;
    wasDragged.current = true;
    const drag = activeDrag.current;

    if (drag.kind === 'door') {
      setPlacedDoors(prev => prev.map(d => d.id === drag.id ? { ...d, x: Math.round(cx - drag.ox), y: Math.round(cy - drag.oy) } : d));
    } else if (drag.kind === 'window') {
      setPlacedWindows(prev => prev.map(w => w.id === drag.id ? { ...w, x: Math.round(cx - drag.ox), y: Math.round(cy - drag.oy) } : w));
    } else if (drag.kind === 'robe') {
      setPlacedRobes(prev => prev.map(r => r.id === drag.id ? { ...r, x: Math.round(cx - drag.ox), y: Math.round(cy - drag.oy) } : r));
    } else if (drag.kind === 'wall-body') {
      const ddx = Math.round(cx - drag.grabX);
      const ddy = Math.round(cy - drag.grabY);
      setPlacedWalls(prev => prev.map(w => w.id === drag.id ? {
        ...w,
        x1: drag.startX1 + ddx, y1: drag.startY1 + ddy,
        x2: drag.startX2 + ddx, y2: drag.startY2 + ddy,
        cpx: w.cpx + ddx - (w.x1 - drag.startX1),
        cpy: w.cpy + ddy - (w.y1 - drag.startY1),
      } : w));
    } else if (drag.kind === 'wall-ep1') {
      setPlacedWalls(prev => prev.map(w => w.id === drag.id ? { ...w, x1: Math.round(cx), y1: Math.round(cy) } : w));
    } else if (drag.kind === 'wall-ep2') {
      setPlacedWalls(prev => prev.map(w => w.id === drag.id ? { ...w, x2: Math.round(cx), y2: Math.round(cy) } : w));
    } else if (drag.kind === 'wall-mid') {
      setPlacedWalls(prev => prev.map(w => w.id === drag.id ? { ...w, curved: true, cpx: Math.round(cx), cpy: Math.round(cy) } : w));
    }
  }, [screenToSvg]);

  const handleSvgMouseUp = useCallback(() => {
    activeDrag.current = null;
  }, []);

  // ── MouseDown on elements to start drag ──────────────────────────────────────

  const startDragDoor = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation(); e.preventDefault();
    const svgPt = screenToSvg(e.clientX, e.clientY);
    if (!svgPt) return;
    const door = placedDoors.find(d => d.id === id);
    if (!door) return;
    setSelectedEl({ kind: 'door', id });
    activeDrag.current = { kind: 'door', id, ox: svgPt.x - door.x, oy: svgPt.y - door.y };
    wasDragged.current = false;
  }, [placedDoors, screenToSvg]);

  const startDragWindow = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation(); e.preventDefault();
    const svgPt = screenToSvg(e.clientX, e.clientY);
    if (!svgPt) return;
    const win = placedWindows.find(w => w.id === id);
    if (!win) return;
    setSelectedEl({ kind: 'window', id });
    activeDrag.current = { kind: 'window', id, ox: svgPt.x - win.x, oy: svgPt.y - win.y };
    wasDragged.current = false;
  }, [placedWindows, screenToSvg]);

  const startDragRobe = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation(); e.preventDefault();
    const svgPt = screenToSvg(e.clientX, e.clientY);
    if (!svgPt) return;
    const robe = placedRobes.find(r => r.id === id);
    if (!robe) return;
    setSelectedEl({ kind: 'robe', id });
    activeDrag.current = { kind: 'robe', id, ox: svgPt.x - robe.x, oy: svgPt.y - robe.y };
    wasDragged.current = false;
  }, [placedRobes, screenToSvg]);

  const startDragWallBody = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation(); e.preventDefault();
    const svgPt = screenToSvg(e.clientX, e.clientY);
    if (!svgPt) return;
    const wall = placedWalls.find(w => w.id === id);
    if (!wall) return;
    setSelectedEl({ kind: 'wall', id });
    activeDrag.current = { kind: 'wall-body', id, grabX: svgPt.x, grabY: svgPt.y, startX1: wall.x1, startY1: wall.y1, startX2: wall.x2, startY2: wall.y2 };
    wasDragged.current = false;
  }, [placedWalls, screenToSvg]);

  const startDragWallEp = useCallback((e: React.MouseEvent, id: number, ep: 'ep1' | 'ep2') => {
    e.stopPropagation(); e.preventDefault();
    activeDrag.current = { kind: ep === 'ep1' ? 'wall-ep1' : 'wall-ep2', id };
    wasDragged.current = false;
  }, []);

  const startDragWallMid = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation(); e.preventDefault();
    activeDrag.current = { kind: 'wall-mid', id };
    wasDragged.current = false;
  }, []);

  // ── Robe length adjustment ──────────────────────────────────────────────────

  const selectedRobe = selectedEl?.kind === 'robe' ? placedRobes.find(r => r.id === selectedEl.id) : null;
  const selectedWall = selectedEl?.kind === 'wall' ? placedWalls.find(w => w.id === selectedEl.id) : null;
  const selectedWindow = selectedEl?.kind === 'window' ? placedWindows.find(w => w.id === selectedEl.id) : null;
  const selectedDoor = selectedEl?.kind === 'door' ? placedDoors.find(d => d.id === selectedEl.id) : null;

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!svgContent) return;
    setIsSaving(true);
    try {
      const wch = wallClearHeight;

      // Doors SVG
      const doorsSvg = placedDoors.map(door => {
        const w = door.width;
        const flipScale = door.flipped ? ' scale(1,-1)' : '';
        return `<g transform="translate(${door.x},${door.y}) rotate(${door.rotation})${flipScale}" class="door-element" data-door-id="${door.id}">
  <rect x="${-wch}" y="${-wch/2}" width="${w+2*wch}" height="${wch}" fill="#FFFFFF" stroke="none"/>
  <line x1="0" y1="0" x2="${w}" y2="0" stroke="#000000" stroke-width="1" fill="none"/>
  <path d="M ${w},0 A ${w},${w} 0 0,1 0,${-w}" fill="none" stroke="#000000" stroke-width="0.5"/>
  <circle cx="0" cy="0" r="1.5" fill="#000000"/>
</g>`;
      }).join('\n');

      // Walls SVG
      const wallsSvg = placedWalls.map(wall => {
        const d = wall.curved
          ? `M ${wall.x1},${wall.y1} Q ${wall.cpx},${wall.cpy} ${wall.x2},${wall.y2}`
          : `M ${wall.x1},${wall.y1} L ${wall.x2},${wall.y2}`;
        return `<path d="${d}" stroke="#1a1a1a" stroke-width="${wallStroke}" stroke-linecap="round" fill="none" class="wall-element" data-wall-id="${wall.id}"/>`;
      }).join('\n');

      // Windows SVG
      const windowsSvg = placedWindows.map(win => {
        const w = win.width;
        const flipScale = win.flipped ? ' scale(1,-1)' : '';
        return `<g transform="translate(${win.x},${win.y}) rotate(${win.rotation})${flipScale}" class="window-element" data-window-id="${win.id}">
  <rect x="${-wch}" y="${-wch/2}" width="${w+2*wch}" height="${wch}" fill="#FFFFFF" stroke="none"/>
  <rect x="0" y="${-wch/2}" width="${w}" height="${wch}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${wallStroke}"/>
  <line x1="0" y1="0" x2="${w}" y2="0" stroke="#1a1a1a" stroke-width="0.8"/>
</g>`;
      }).join('\n');

      // Robes SVG
      const robesSvg = placedRobes.map(robe => {
        const rw = robe.width;
        const rl = robe.length;
        return `<g transform="translate(${robe.x},${robe.y}) rotate(${robe.rotation})" class="robe-element" data-robe-id="${robe.id}">
  <rect x="0" y="0" width="${rl}" height="${rw}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${wallStroke}"/>
  <line x1="0" y1="0" x2="${rl}" y2="${rw}" stroke="#1a1a1a" stroke-width="0.8"/>
  <line x1="${rl}" y1="0" x2="0" y2="${rw}" stroke="#1a1a1a" stroke-width="0.8"/>
</g>`;
      }).join('\n');

      let modifiedSvg = svgContent
        .replace(/<g\s+id="doors-layer"[\s\S]*?<\/g>\s*/g, '')
        .replace(/<g\s+id="walls-layer"[\s\S]*?<\/g>\s*/g, '')
        .replace(/<g\s+id="windows-layer"[\s\S]*?<\/g>\s*/g, '')
        .replace(/<g\s+id="robes-layer"[\s\S]*?<\/g>\s*/g, '');

      modifiedSvg = modifiedSvg.replace(
        '</svg>',
        `<g id="walls-layer">\n${wallsSvg}\n</g>\n<g id="windows-layer">\n${windowsSvg}\n</g>\n<g id="robes-layer">\n${robesSvg}\n</g>\n<g id="doors-layer">\n${doorsSvg}\n</g>\n</svg>`,
      );

      const token = localStorage.getItem('auth_token') || localStorage.getItem('access_token');
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const res = await fetch(`${API_URL}/api/v1/plans/${projectId}/plans/${planId}/save-svg`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ svg_content: modifiedSvg, doors: placedDoors, walls: placedWalls, windows: placedWindows, robes: placedRobes }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save');
      }

      const result = await res.json();
      onSave({ previewImageUrl: result.preview_image_url, doors: placedDoors, walls: placedWalls, windows: placedWindows, robes: placedRobes, updatedAt: new Date().toISOString() });
    } catch (err) {
      console.error('SvgEditor save failed:', err);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading ─────────────────────────────────────────────────────────────────

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

  // ── Cursor style ────────────────────────────────────────────────────────────

  const cursorStyle =
    activeDrag.current ? 'grabbing' :
    activeTool === 'door' || activeTool === 'window' || activeTool === 'robe' ? 'crosshair' :
    activeTool === 'wall' ? (wallStart ? 'crosshair' : 'cell') :
    activeTool === 'wall-erase' ? 'not-allowed' :
    'default';

  const totalElements = placedDoors.length + placedWalls.length + placedWindows.length + placedRobes.length;

  // ── Tool button helper ──────────────────────────────────────────────────────

  const toolBtn = (tool: ActiveTool, label: string, Icon: React.ElementType, color: string) => {
    const active = activeTool === tool;
    return (
      <button
        onClick={() => { setActiveTool(tool); if (tool !== 'wall') setWallStart(null); if (tool !== 'select') setSelectedEl(null); }}
        className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg text-xs font-medium transition ${
          active ? `${color} text-white` : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
        }`}
      >
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{label}</span>
      </button>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── LEFT: Canvas (60%) ─────────────────────────────────────────────── */}
      <div className="w-full lg:w-[60%] p-3 sm:p-4 lg:p-6 flex flex-col overflow-visible lg:overflow-hidden min-h-[300px] sm:min-h-[400px]">
        <div className="flex-1 bg-white rounded-xl shadow-xl overflow-hidden relative">
          <svg
            ref={svgRef}
            viewBox={`${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.w} ${svgViewBox.h}`}
            className="w-full h-full"
            style={{ cursor: cursorStyle }}
            onClick={handleCanvasClick}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
            preserveAspectRatio="xMidYMid meet"
            tabIndex={0}
          >
            {/* Original plan content */}
            <g ref={svgContentGroupRef} />

            {/* ── Walls overlay ────────────────────────────────────────── */}
            <g id="walls-overlay">
              {placedWalls.map(wall => {
                const sel = selectedEl?.kind === 'wall' && selectedEl.id === wall.id;
                const mx = (wall.x1 + wall.x2) / 2;
                const my = (wall.y1 + wall.y2) / 2;
                const pathD = wall.curved
                  ? `M ${wall.x1},${wall.y1} Q ${wall.cpx},${wall.cpy} ${wall.x2},${wall.y2}`
                  : `M ${wall.x1},${wall.y1} L ${wall.x2},${wall.y2}`;
                return (
                  <g key={wall.id}>
                    {/* Fat invisible hit target */}
                    <path
                      d={pathD}
                      stroke="transparent"
                      strokeWidth={Math.max(wallStroke + 12, 18)}
                      fill="none"
                      style={{ cursor: activeTool === 'wall-erase' ? 'not-allowed' : 'grab' }}
                      onClick={e => handleElementClick(e, 'wall', wall.id)}
                      onMouseDown={e => { if (activeTool !== 'wall-erase') startDragWallBody(e, wall.id); }}
                    />
                    {/* Visible wall */}
                    <path
                      d={pathD}
                      stroke={sel ? '#2563eb' : '#1a1a1a'}
                      strokeWidth={wallStroke}
                      strokeLinecap="round"
                      fill="none"
                      pointerEvents="none"
                    />
                    {sel && (
                      <>
                        {/* Selection dashes */}
                        <path d={pathD} stroke="#93c5fd" strokeWidth={wallStroke + 4} strokeDasharray="8,4" fill="none" opacity={0.4} pointerEvents="none" />
                        {/* Endpoint handles */}
                        <circle cx={wall.x1} cy={wall.y1} r={6} fill="#2563eb" stroke="#fff" strokeWidth={1.5} style={{ cursor: 'move' }} onMouseDown={e => startDragWallEp(e, wall.id, 'ep1')} />
                        <circle cx={wall.x2} cy={wall.y2} r={6} fill="#2563eb" stroke="#fff" strokeWidth={1.5} style={{ cursor: 'move' }} onMouseDown={e => startDragWallEp(e, wall.id, 'ep2')} />
                        {/* Midpoint / curve handle */}
                        <circle
                          cx={wall.curved ? wall.cpx : mx}
                          cy={wall.curved ? wall.cpy : my}
                          r={5} fill={wall.curved ? '#f59e0b' : '#fff'} stroke={wall.curved ? '#fff' : '#2563eb'} strokeWidth={1.5}
                          style={{ cursor: 'crosshair' }}
                          onMouseDown={e => startDragWallMid(e, wall.id)}
                        />
                        {wall.curved && <line x1={mx} y1={my} x2={wall.cpx} y2={wall.cpy} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,2" pointerEvents="none" />}
                      </>
                    )}
                  </g>
                );
              })}
            </g>

            {/* ── Wall preview line while drawing ─────────────────────── */}
            {activeTool === 'wall' && wallStart && (
              <g pointerEvents="none">
                <line
                  x1={wallStart.x} y1={wallStart.y}
                  x2={cursorPos.x}  y2={cursorPos.y}
                  stroke="#2563eb" strokeWidth={wallStroke} strokeDasharray="8,4" strokeLinecap="round" opacity={0.7}
                />
                <circle cx={wallStart.x} cy={wallStart.y} r={5} fill="#2563eb" stroke="#fff" strokeWidth={1.5} />
                <circle cx={cursorPos.x} cy={cursorPos.y} r={4} fill="none" stroke="#2563eb" strokeWidth={1.5} opacity={0.6} />
              </g>
            )}

            {/* ── Windows overlay ──────────────────────────────────────── */}
            <g id="windows-overlay">
              {placedWindows.map(win => {
                const w = win.width;
                const wch = wallClearHeight;
                const sel = selectedEl?.kind === 'window' && selectedEl.id === win.id;
                const flipScale = win.flipped ? ' scale(1,-1)' : '';
                return (
                  <g
                    key={win.id}
                    transform={`translate(${win.x},${win.y}) rotate(${win.rotation})${flipScale}`}
                    onClick={e => handleElementClick(e, 'window', win.id)}
                    onMouseDown={e => startDragWindow(e, win.id)}
                    style={{ cursor: sel ? 'grab' : 'pointer' }}
                  >
                    {/* Clear wall */}
                    <rect x={-wch} y={-wch/2} width={w + 2*wch} height={wch} fill="#FFFFFF" stroke="none" />
                    {/* Selection highlight */}
                    {sel && <rect x={-4} y={-wch/2 - 4} width={w + 8} height={wch + 8} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5,3" rx={2} />}
                    {/* Window frame */}
                    <rect
                      x={0} y={-wch/2}
                      width={w} height={wch}
                      fill="#e8f4f8"
                      stroke={sel ? '#2563eb' : '#1a1a1a'}
                      strokeWidth={sel ? 1.5 : wallStroke}
                    />
                    {/* Centre pane line */}
                    <line x1={0} y1={0} x2={w} y2={0} stroke={sel ? '#2563eb' : '#555'} strokeWidth={0.8} />
                  </g>
                );
              })}
            </g>

            {/* ── Robes overlay ────────────────────────────────────────── */}
            <g id="robes-overlay">
              {placedRobes.map(robe => {
                const rl = robe.length;
                const rw = robe.width;
                const sel = selectedEl?.kind === 'robe' && selectedEl.id === robe.id;
                return (
                  <g
                    key={robe.id}
                    transform={`translate(${robe.x},${robe.y}) rotate(${robe.rotation})`}
                    onClick={e => handleElementClick(e, 'robe', robe.id)}
                    onMouseDown={e => startDragRobe(e, robe.id)}
                    style={{ cursor: sel ? 'grab' : 'pointer' }}
                  >
                    {sel && <rect x={-4} y={-4} width={rl + 8} height={rw + 8} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5,3" rx={2} />}
                    {/* Body */}
                    <rect x={0} y={0} width={rl} height={rw} fill="#f5f0e8" stroke={sel ? '#2563eb' : '#1a1a1a'} strokeWidth={sel ? 1.5 : wallStroke} />
                    {/* Cross-hatch diagonals */}
                    <line x1={0} y1={0} x2={rl} y2={rw} stroke={sel ? '#2563eb' : '#888'} strokeWidth={0.8} />
                    <line x1={rl} y1={0} x2={0} y2={rw} stroke={sel ? '#2563eb' : '#888'} strokeWidth={0.8} />
                    {/* Hanging rod line */}
                    <line x1={0} y1={rw/2} x2={rl} y2={rw/2} stroke={sel ? '#2563eb' : '#aaa'} strokeWidth={0.5} strokeDasharray="4,3" />
                  </g>
                );
              })}
            </g>

            {/* ── Doors overlay ────────────────────────────────────────── */}
            <g id="doors-overlay">
              {placedDoors.map(door => {
                const w = door.width;
                const wch = wallClearHeight;
                const sel = selectedEl?.kind === 'door' && selectedEl.id === door.id;
                const flipScale = door.flipped ? ' scale(1,-1)' : '';
                return (
                  <g
                    key={door.id}
                    transform={`translate(${door.x},${door.y}) rotate(${door.rotation})${flipScale}`}
                    onClick={e => handleElementClick(e, 'door', door.id)}
                    onMouseDown={e => startDragDoor(e, door.id)}
                    style={{ cursor: sel ? 'grab' : 'pointer' }}
                  >
                    <rect x={-wch} y={-wch/2} width={w + 2*wch} height={wch} fill="#FFFFFF" stroke="none" />
                    {sel && (
                      <rect x={-6} y={-w - 6} width={w + 12} height={w + 12}
                        fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6,3" rx={3} />
                    )}
                    <line x1={0} y1={0} x2={w} y2={0} stroke={sel ? '#2563eb' : '#000'} strokeWidth={sel ? 1.5 : 1} />
                    <path d={`M ${w},0 A ${w},${w} 0 0,0 0,${-w}`} fill="none" stroke={sel ? '#2563eb' : '#000'} strokeWidth={sel ? 1 : 0.5} strokeDasharray="4,3" />
                    <circle cx={0} cy={0} r={sel ? 3 : 1.5} fill={sel ? '#2563eb' : '#000'} />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Hint overlay */}
          {totalElements === 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full pointer-events-none">
              {activeTool === 'door' && 'Click to place a door'}
              {activeTool === 'wall' && !wallStart && 'Click to start a wall segment'}
              {activeTool === 'wall' && wallStart && 'Click to finish the wall'}
              {activeTool === 'window' && 'Click to place a window'}
              {activeTool === 'robe' && 'Click to place a built-in robe'}
              {activeTool === 'wall-erase' && 'Click a wall to erase it'}
            </div>
          )}
          {activeTool === 'wall' && wallStart && totalElements > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-600/80 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full pointer-events-none">
              Click to finish · Esc to cancel
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Controls (40%) ───────────────────────────────────────────── */}
      <div className="w-full lg:w-[40%] p-3 sm:p-4 lg:p-6 border-t lg:border-t-0 lg:border-l border-white/10 overflow-y-auto">
        <div className="space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2 text-sm sm:text-base">
              <Pencil className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
              Floor Plan Editor
            </h3>
            <button onClick={onCancel} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs transition">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          </div>

          {/* Tools */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Tools</h4>
            <div className="grid grid-cols-3 gap-2">
              {toolBtn('select',     'Select',     MousePointer, 'bg-slate-600')}
              {toolBtn('door',       'Door',        DoorOpen,     'bg-blue-600')}
              {toolBtn('wall',       'Add Wall',    Minus,        'bg-violet-600')}
              {toolBtn('wall-erase', 'Erase Wall',  Eraser,       'bg-red-600')}
              {toolBtn('window',     'Window',      Square,       'bg-cyan-600')}
              {toolBtn('robe',       'Robe',        LayoutGrid,   'bg-amber-600')}
            </div>
          </div>

          {/* Context actions */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Actions</h4>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={handleRotateSelected}
                disabled={!selectedEl || selectedEl.kind === 'wall'}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white"
                title="Rotate 90° (R)"
              >
                <RotateCw className="w-4 h-4" />
                <span className="text-xs">Rotate</span>
              </button>
              <button
                onClick={handleFlipSelected}
                disabled={!selectedEl || (selectedEl.kind !== 'door' && selectedEl.kind !== 'window')}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-blue-500/10 hover:border-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-blue-400"
                title="Flip (F)"
              >
                <FlipHorizontal2 className="w-4 h-4" />
                <span className="text-xs">Flip</span>
              </button>
              <button
                onClick={handleCurveSelected}
                disabled={selectedEl?.kind !== 'wall'}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition border disabled:opacity-30 disabled:cursor-not-allowed ${
                  selectedWall?.curved
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-400'
                }`}
                title="Toggle wall curve"
              >
                <Minus className="w-4 h-4" style={{ transform: 'rotate(-15deg)' }} />
                <span className="text-xs">Curve</span>
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={!selectedEl}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-red-400"
                title="Delete (Del)"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-xs">Delete</span>
              </button>
            </div>
            <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-500 text-[10px]">
                <Move className="w-3 h-3" />
                <span>Arrow keys to nudge · Shift = 5×</span>
              </div>
              <button
                onClick={handleUndo}
                disabled={addHistory.length === 0}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white"
              >
                <Undo2 className="w-3 h-3" />
                Undo
              </button>
            </div>
          </div>

          {/* Properties panel – shows when something is selected */}
          {selectedEl && (
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Properties</h4>

              {/* Door */}
              {selectedDoor && (
                <div className="space-y-2 text-xs text-gray-300">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Rotation</span>
                    <span className="font-mono text-white">{selectedDoor.rotation}°</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Flipped</span>
                    <span className="font-mono text-white">{selectedDoor.flipped ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Width</span>
                    <span className="font-mono text-white">{Math.round(selectedDoor.width / unitsPerMeter * 1000)} mm</span>
                  </div>
                </div>
              )}

              {/* Wall */}
              {selectedWall && (
                <div className="space-y-2 text-xs text-gray-300">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Length</span>
                    <span className="font-mono text-white">
                      {Math.round(Math.hypot(selectedWall.x2 - selectedWall.x1, selectedWall.y2 - selectedWall.y1) / unitsPerMeter * 1000)} mm
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Curved</span>
                    <span className="font-mono text-white">{selectedWall.curved ? 'Yes – drag ⬤ handle' : 'No'}</span>
                  </div>
                  <p className="text-gray-500 text-[10px] pt-1">Drag the blue ● endpoints to adjust. Drag the middle handle to curve.</p>
                </div>
              )}

              {/* Window */}
              {selectedWindow && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Width</span>
                    <span className="font-mono text-white">{Math.round(selectedWindow.width / unitsPerMeter * 1000)} mm</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Rotation</span>
                    <span className="font-mono text-white">{selectedWindow.rotation}°</span>
                  </div>
                  <label className="block text-gray-400 text-xs mt-2">Adjust width</label>
                  <input
                    type="range" min={Math.round(unitsPerMeter * 0.6)} max={Math.round(unitsPerMeter * 3.0)} step={Math.round(unitsPerMeter * 0.05)}
                    value={selectedWindow.width}
                    onChange={e => setPlacedWindows(prev => prev.map(w => w.id === selectedWindow.id ? { ...w, width: +e.target.value } : w))}
                    className="w-full accent-cyan-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>600 mm</span>
                    <span>3000 mm</span>
                  </div>
                </div>
              )}

              {/* Robe */}
              {selectedRobe && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Width (fixed)</span>
                    <span className="font-mono text-white">600 mm</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Length</span>
                    <span className="font-mono text-white">{Math.round(selectedRobe.length / unitsPerMeter * 1000)} mm</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Rotation</span>
                    <span className="font-mono text-white">{selectedRobe.rotation}°</span>
                  </div>
                  <label className="block text-gray-400 text-xs mt-2">Adjust length</label>
                  <input
                    type="range" min={Math.round(unitsPerMeter * 0.9)} max={Math.round(unitsPerMeter * 6.0)} step={Math.round(unitsPerMeter * 0.1)}
                    value={selectedRobe.length}
                    onChange={e => setPlacedRobes(prev => prev.map(r => r.id === selectedRobe.id ? { ...r, length: +e.target.value } : r))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>900 mm</span>
                    <span>6000 mm</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Elements summary */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Placed Elements</h4>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Doors',   count: placedDoors.length,   color: 'text-blue-400',   bg: 'bg-blue-500/10' },
                { label: 'Walls',   count: placedWalls.length,   color: 'text-violet-400', bg: 'bg-violet-500/10' },
                { label: 'Windows', count: placedWindows.length, color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
                { label: 'Robes',   count: placedRobes.length,   color: 'text-amber-400',  bg: 'bg-amber-500/10' },
              ].map(({ label, count, color, bg }) => (
                <div key={label} className={`${bg} rounded-lg p-2 text-center`}>
                  <div className={`text-xl font-bold ${color}`}>{count}</div>
                  <div className="text-gray-500 text-[10px] mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="space-y-2 pt-1">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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
