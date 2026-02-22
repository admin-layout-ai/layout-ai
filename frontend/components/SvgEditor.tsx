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
  Columns,
  UtensilsCrossed,
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
  /** true = renders as white eraser line over existing walls */
  erase?: boolean;
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

export type KitchenSubtype = 'island' | 'bench' | 'fridge' | 'sink' | 'cooktop' | 'dishwasher';

export interface PlacedKitchen {
  id: number;
  x: number; y: number;
  rotation: number;
  subtype: KitchenSubtype;
  /** primary dimension (length along x-axis) in SVG units */
  length: number;
  /** secondary dimension (depth along y-axis) in SVG units */
  depth: number;
}

export interface SvgEditorSaveResult {
  previewImageUrl: string;
  doors: PlacedDoor[];
  walls: PlacedWall[];
  windows: PlacedWindow[];
  robes: PlacedRobe[];
  kitchens: PlacedKitchen[];
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
  existingKitchens?: PlacedKitchen[];
  envelopeWidth?: number;
  onSave: (result: SvgEditorSaveResult) => void;
  onCancel: () => void;
}

// ── Drag target union ──────────────────────────────────────────────────────────

type DragTarget =
  | { kind: 'door';       id: number; ox: number; oy: number }
  | { kind: 'wall-body';  id: number; grabX: number; grabY: number; startX1: number; startY1: number; startX2: number; startY2: number; startCpx: number; startCpy: number }
  | { kind: 'wall-ep1';   id: number }
  | { kind: 'wall-ep2';   id: number }
  | { kind: 'wall-mid';   id: number }
  | { kind: 'window';     id: number; ox: number; oy: number }
  | { kind: 'robe';       id: number; ox: number; oy: number }
  | { kind: 'kitchen';    id: number; ox: number; oy: number };

// ── Undo history ───────────────────────────────────────────────────────────────

type HistoryEntry =
  | { type: 'door';    element: PlacedDoor }
  | { type: 'wall';    element: PlacedWall }
  | { type: 'window';  element: PlacedWindow }
  | { type: 'robe';    element: PlacedRobe }
  | { type: 'kitchen'; element: PlacedKitchen };

type ActiveTool = 'select' | 'door' | 'wall' | 'window' | 'robe' | 'kitchen';
type ElementKind = 'door' | 'wall' | 'window' | 'robe' | 'kitchen';
type SelectedEl = { kind: ElementKind; id: number } | null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ── Kitchen symbol renderer ────────────────────────────────────────────────────
// Returns SVG JSX for a given kitchen item. Coordinates are local (origin = top-left of item).

function KitchenSymbol({ item, sw, sel }: { item: PlacedKitchen; sw: number; sel: boolean }) {
  const { subtype, length: L, depth: D } = item;
  const stroke = sel ? '#2563eb' : '#1a1a1a';
  const thin = sw * 0.35;
  const thick = sw * 0.55;

  switch (subtype) {
    case 'island':
    case 'bench':
      return (
        <>
          <rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick} />
          {/* Worktop edge shadow line */}
          <rect x={D * 0.12} y={D * 0.12} width={L - D * 0.24} height={D - D * 0.24}
            fill="none" stroke={stroke} strokeWidth={thin * 0.6} opacity={0.4} />
        </>
      );

    case 'fridge': {
      const r = Math.min(L, D) * 0.08;
      return (
        <>
          <rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick} rx={r} />
          {/* Handle */}
          <line x1={L * 0.2} y1={D * 0.08} x2={L * 0.8} y2={D * 0.08} stroke={stroke} strokeWidth={thin * 1.2} strokeLinecap="round" />
          {/* Hinge dot */}
          <circle cx={L * 0.08} cy={D * 0.5} r={thin} fill={stroke} />
          {/* Door seal line */}
          <line x1={L * 0.06} y1={D * 0.15} x2={L * 0.94} y2={D * 0.15} stroke={stroke} strokeWidth={thin * 0.5} strokeDasharray={`${thin * 2},${thin}`} />
        </>
      );
    }

    case 'sink': {
      // Single or double basin based on aspect ratio
      const dbl = L > D * 1.5;
      const bw = dbl ? L * 0.42 : L * 0.72;
      const bh = D * 0.68;
      const by = D * 0.16;
      return (
        <>
          <rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick} />
          {dbl ? (
            <>
              <rect x={L * 0.04} y={by} width={bw} height={bh} fill="none" stroke={stroke} strokeWidth={thin} rx={thin} />
              <rect x={L * 0.54} y={by} width={bw} height={bh} fill="none" stroke={stroke} strokeWidth={thin} rx={thin} />
              <circle cx={L * 0.25} cy={D * 0.5} r={thin * 1.5} fill={stroke} />
              <circle cx={L * 0.75} cy={D * 0.5} r={thin * 1.5} fill={stroke} />
            </>
          ) : (
            <>
              <rect x={(L - bw) / 2} y={by} width={bw} height={bh} fill="none" stroke={stroke} strokeWidth={thin} rx={thin} />
              <circle cx={L / 2} cy={D * 0.5} r={thin * 1.5} fill={stroke} />
            </>
          )}
          {/* Tap */}
          <line x1={L * 0.45} y1={D * 0.05} x2={L * 0.55} y2={D * 0.05} stroke={stroke} strokeWidth={thin * 1.2} strokeLinecap="round" />
          <line x1={L * 0.5}  y1={D * 0.05} x2={L * 0.5}  y2={by}       stroke={stroke} strokeWidth={thin * 0.8} />
        </>
      );
    }

    case 'cooktop': {
      // 4 burner circles
      const bx = [L * 0.25, L * 0.75, L * 0.25, L * 0.75];
      const by2 = [D * 0.28, D * 0.28, D * 0.72, D * 0.72];
      const r1 = Math.min(L, D) * 0.18;
      const r2 = r1 * 0.55;
      return (
        <>
          <rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick} />
          {bx.map((bxi, i) => (
            <g key={i}>
              <circle cx={bxi} cy={by2[i]} r={r1} fill="none" stroke={stroke} strokeWidth={thin} />
              <circle cx={bxi} cy={by2[i]} r={r2} fill="none" stroke={stroke} strokeWidth={thin * 0.6} />
              <circle cx={bxi} cy={by2[i]} r={thin * 0.9} fill={stroke} />
            </g>
          ))}
        </>
      );
    }

    case 'dishwasher': {
      return (
        <>
          <rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick} />
          {/* Control panel strip at top */}
          <rect x={0} y={0} width={L} height={D * 0.12} fill={sel ? 'rgba(37,99,235,0.08)' : 'rgba(0,0,0,0.04)'} stroke={stroke} strokeWidth={thin * 0.5} />
          {/* Horizontal rack lines */}
          {[0.3, 0.5, 0.7, 0.88].map((t, i) => (
            <line key={i} x1={L * 0.08} y1={D * t} x2={L * 0.92} y2={D * t} stroke={stroke} strokeWidth={thin * 0.5} strokeDasharray={`${thin * 3},${thin * 1.5}`} />
          ))}
          {/* Handle */}
          <line x1={L * 0.25} y1={D * 0.06} x2={L * 0.75} y2={D * 0.06} stroke={stroke} strokeWidth={thin * 1.2} strokeLinecap="round" />
        </>
      );
    }

    default: return null;
  }
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
  existingKitchens,
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
  const [placedDoors,    setPlacedDoors]    = useState<PlacedDoor[]>([]);
  const [placedWalls,    setPlacedWalls]    = useState<PlacedWall[]>([]);
  const [placedWindows,  setPlacedWindows]  = useState<PlacedWindow[]>([]);
  const [placedRobes,    setPlacedRobes]    = useState<PlacedRobe[]>([]);
  const [placedKitchens, setPlacedKitchens] = useState<PlacedKitchen[]>([]);

  // IDs
  const [nextDoorId,    setNextDoorId]    = useState(1);
  const [nextWallId,    setNextWallId]    = useState(1);
  const [nextWindowId,  setNextWindowId]  = useState(1);
  const [nextRobeId,    setNextRobeId]    = useState(1);
  const [nextKitchenId, setNextKitchenId] = useState(1);

  // Active kitchen sub-type for placement
  const [kitchenSubtype, setKitchenSubtype] = useState<KitchenSubtype>('island');

  // Default sizes
  const [doorWidth,   setDoorWidth]   = useState(40);   // ~820mm
  const [windowWidth, setWindowWidth] = useState(50);   // ~1000mm
  const [robeFixedW,  setRobeFixedW]  = useState(30);   // fixed 600mm
  const [robeLength,  setRobeLength]  = useState(80);   // default ~1600mm
  const [wallStroke,  setWallStroke]  = useState(5);    // SVG stroke-width

  // Kitchen default sizes (set from upm in init)
  const [kitchenDefaults, setKitchenDefaults] = useState<Record<KitchenSubtype, { length: number; depth: number }>>({
    island:      { length: 96, depth: 36 },
    bench:       { length: 96, depth: 24 },
    fridge:      { length: 28, depth: 28 },
    sink:        { length: 36, depth: 20 },
    cooktop:     { length: 24, depth: 24 },
    dishwasher:  { length: 24, depth: 24 },
  });

  // Active tool & selection
  const [activeTool, setActiveTool] = useState<ActiveTool>('door');
  const [wallEraseMode, setWallEraseMode] = useState(false);
  const [selectedEl, setSelectedEl] = useState<SelectedEl>(null);

  // Wall drawing (two-click mode)
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [eraseStart, setEraseStart] = useState<{ x: number; y: number } | null>(null);
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

          // ── Scale detection (multi-strategy) ────────────────────────────────
          // Strategy 1: parse "Nm x Nm" text labels and match to enclosing walls.
          // Works regardless of wall fill colour by querying ALL rects.
          let svgUnitsPerMeter = 0;

          // Collect ALL rects (walls can be any dark fill or stroke)
          const allRects = Array.from(svgEl.querySelectorAll('rect'));

          // Prefer text-based scale: find "W m x H m" labels
          const dimTexts = Array.from(svgEl.querySelectorAll('text'));
          const dimRegex = /(\d+\.?\d*)\s*m\s*[x×]\s*(\d+\.?\d*)\s*m/i;
          interface RoomLabel { widthM: number; heightM: number; cx: number; cy: number; }
          const labels: RoomLabel[] = [];
          for (const t of dimTexts) {
            const m = (t.textContent || '').replace(/\s+/g, ' ').trim().match(dimRegex);
            if (m) {
              const cx = parseFloat(t.getAttribute('x') || '0');
              const cy = parseFloat(t.getAttribute('y') || '0');
              labels.push({ widthM: parseFloat(m[1]), heightM: parseFloat(m[2]), cx, cy });
            }
          }

          // For each label, find the nearest enclosing rect (room boundary or wall pair)
          // Strategy: find two vertical rects that bracket the text horizontally
          const verticalRects = allRects
            .map(r => ({
              x: parseFloat(r.getAttribute('x') || '0'),
              y: parseFloat(r.getAttribute('y') || '0'),
              w: parseFloat(r.getAttribute('width') || '0'),
              h: parseFloat(r.getAttribute('height') || '0'),
            }))
            .filter(r => r.h > r.w * 1.5 && r.h > 10 && r.w > 0);

          const candidates: number[] = [];
          for (const label of labels) {
            const sorted = [...verticalRects].sort((a, b) => a.x - b.x);
            let left: typeof sorted[0] | null = null;
            let right: typeof sorted[0] | null = null;
            for (const r of sorted) { if (r.x + r.w <= label.cx) left = r; }
            for (const r of sorted) { if (r.x >= label.cx && !right) right = r; }
            if (left && right) {
              const innerWidth = right.x - (left.x + left.w);
              if (innerWidth > 0) candidates.push(innerWidth / label.widthM);
            }
          }

          if (candidates.length > 0) {
            // Median to reject outliers
            candidates.sort((a, b) => a - b);
            svgUnitsPerMeter = candidates[Math.floor(candidates.length / 2)];
          }

          // Strategy 2: try horizontal rects for height-based scale and average
          if (candidates.length === 0) {
            const horizontalRects = allRects
              .map(r => ({
                x: parseFloat(r.getAttribute('x') || '0'),
                y: parseFloat(r.getAttribute('y') || '0'),
                w: parseFloat(r.getAttribute('width') || '0'),
                h: parseFloat(r.getAttribute('height') || '0'),
              }))
              .filter(r => r.w > r.h * 1.5 && r.w > 10 && r.h > 0);

            for (const label of labels) {
              const sorted = [...horizontalRects].sort((a, b) => a.y - b.y);
              let top: typeof sorted[0] | null = null;
              let bot: typeof sorted[0] | null = null;
              for (const r of sorted) { if (r.y + r.h <= label.cy) top = r; }
              for (const r of sorted) { if (r.y >= label.cy && !bot) bot = r; }
              if (top && bot) {
                const innerH = bot.y - (top.y + top.h);
                if (innerH > 0) candidates.push(innerH / label.heightM);
              }
            }
            if (candidates.length > 0) {
              candidates.sort((a, b) => a - b);
              svgUnitsPerMeter = candidates[Math.floor(candidates.length / 2)];
            }
          }

          // Strategy 3: viewBox width ÷ envelopeWidth
          if (svgUnitsPerMeter <= 0) {
            const viewW = vb ? vb[2] : parseFloat(svgEl.getAttribute('width') || '800');
            svgUnitsPerMeter = viewW / envelopeWidth;
          }

          // Sanity clamp: if result looks impossibly small (<10) or large (>50000)
          // it means the approach failed — clamp to a safe minimum of 50
          if (svgUnitsPerMeter < 10) svgUnitsPerMeter = Math.max(svgUnitsPerMeter * 100, 50);

          const upm = svgUnitsPerMeter;
          setUnitsPerMeter(upm);
          setDoorWidth(Math.round(upm * 0.82));
          setWindowWidth(Math.round(upm * 1.0));
          setRobeFixedW(Math.round(upm * 0.6));
          setRobeLength(Math.round(upm * 1.6));
          setWallClearHeight(Math.max(upm * 0.08, Math.round(upm * 0.35)));

          // ── Detect internal wall thickness from the SVG ──────────────────────
          // Internal partition walls are thin rects (width=5 in a 654px canvas).
          // Collect the short dimension of all dark rects, bucket into external
          // (thicker) vs internal (thinner) by looking for a bimodal distribution.
          const darkRects = Array.from(svgEl.querySelectorAll('rect[fill="#1a1a1a"]'))
            .map(r => ({
              w: parseFloat(r.getAttribute('width') || '0'),
              h: parseFloat(r.getAttribute('height') || '0'),
            }))
            .filter(r => r.w > 0 && r.h > 0);

          const thinDims = darkRects.map(r => Math.min(r.w, r.h)).filter(d => d > 0);
          if (thinDims.length > 0) {
            thinDims.sort((a, b) => a - b);
            // The smallest repeated thin dimension = internal wall width
            const median = thinDims[Math.floor(thinDims.length / 2)];
            // Use median of the lower half (internal walls are thinner than external)
            const lowerHalf = thinDims.filter(d => d <= median);
            const internalW = lowerHalf[Math.floor(lowerHalf.length / 2)];
            setWallStroke(Math.max(2, internalW));
          } else {
            setWallStroke(Math.max(2, Math.round(upm * 0.12)));
          }

          nudgeStep.current = Math.max(1, Math.round(upm * 0.025));

          // Kitchen defaults scaled to upm
          setKitchenDefaults({
            island:     { length: Math.round(upm * 2.4), depth: Math.round(upm * 0.88) },
            bench:      { length: Math.round(upm * 2.4), depth: Math.round(upm * 0.6) },
            fridge:     { length: Math.round(upm * 0.7), depth: Math.round(upm * 0.7) },
            sink:       { length: Math.round(upm * 0.9), depth: Math.round(upm * 0.5) },
            cooktop:    { length: Math.round(upm * 0.8), depth: Math.round(upm * 0.4) },
            dishwasher: { length: Math.round(upm * 0.6), depth: Math.round(upm * 0.6) },
          });
        }

        // Seed existing elements
        if (existingDoors?.length)    { setPlacedDoors(existingDoors);       setNextDoorId(Math.max(...existingDoors.map(d => d.id)) + 1); }
        if (existingWalls?.length)    { setPlacedWalls(existingWalls);       setNextWallId(Math.max(...existingWalls.map(w => w.id)) + 1); }
        if (existingWindows?.length)  { setPlacedWindows(existingWindows);   setNextWindowId(Math.max(...existingWindows.map(w => w.id)) + 1); }
        if (existingRobes?.length)    { setPlacedRobes(existingRobes);       setNextRobeId(Math.max(...existingRobes.map(r => r.id)) + 1); }
        if (existingKitchens?.length) { setPlacedKitchens(existingKitchens); setNextKitchenId(Math.max(...existingKitchens.map(k => k.id)) + 1); }

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
      if (wallEraseMode) {
        if (!eraseStart) {
          setEraseStart({ x: cx, y: cy });
        } else {
          const newEraseWall: PlacedWall = {
            id: nextWallId,
            x1: eraseStart.x, y1: eraseStart.y,
            x2: cx, y2: cy,
            curved: false,
            cpx: (eraseStart.x + cx) / 2,
            cpy: (eraseStart.y + cy) / 2,
            erase: true,
          };
          setPlacedWalls(prev => [...prev, newEraseWall]);
          setNextWallId(p => p + 1);
          setAddHistory(prev => [...prev, { type: 'wall', element: newEraseWall }]);
          setEraseStart(null);
        }
      } else {
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
          setWallStart(null);
        }
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

    if (activeTool === 'kitchen') {
      const def = kitchenDefaults[kitchenSubtype];
      const newItem: PlacedKitchen = { id: nextKitchenId, x: cx, y: cy, rotation: 0, subtype: kitchenSubtype, length: def.length, depth: def.depth };
      setPlacedKitchens(prev => [...prev, newItem]);
      setNextKitchenId(p => p + 1);
      setSelectedEl({ kind: 'kitchen', id: newItem.id });
      setAddHistory(prev => [...prev, { type: 'kitchen', element: newItem }]);
      return;
    }
  }, [activeTool, nextDoorId, nextWallId, nextWindowId, nextRobeId, nextKitchenId,
      doorWidth, windowWidth, robeLength, robeFixedW, kitchenSubtype, kitchenDefaults,
      wallStart, wallEraseMode, eraseStart, wallStroke, placedWalls, selectedEl, screenToSvg]);

  // ── Element click (stops propagation) ──────────────────────────────────────

  const handleElementClick = useCallback((e: React.MouseEvent, kind: ElementKind, id: number) => {
    e.stopPropagation();
    // Erase mode: delete the wall immediately
    if (activeTool === 'wall' && wallEraseMode && kind === 'wall') {
      setPlacedWalls(prev => prev.filter(w => w.id !== id));
      if (selectedEl?.id === id) setSelectedEl(null);
      return;
    }
    // Any other tool: select the element and switch to select mode
    setSelectedEl({ kind, id });
    setActiveTool('select');
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
    } else if (selectedEl.kind === 'kitchen') {
      setPlacedKitchens(prev => prev.map(k => k.id === selectedEl.id ? { ...k, rotation: (k.rotation + 90) % 360 } : k));
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
    if (selectedEl.kind === 'door')    setPlacedDoors(prev => prev.filter(d => d.id !== selectedEl.id));
    if (selectedEl.kind === 'wall')    setPlacedWalls(prev => prev.filter(w => w.id !== selectedEl.id));
    if (selectedEl.kind === 'window')  setPlacedWindows(prev => prev.filter(w => w.id !== selectedEl.id));
    if (selectedEl.kind === 'robe')    setPlacedRobes(prev => prev.filter(r => r.id !== selectedEl.id));
    if (selectedEl.kind === 'kitchen') setPlacedKitchens(prev => prev.filter(k => k.id !== selectedEl.id));
    setSelectedEl(null);
  }, [selectedEl]);

  const handleUndo = useCallback(() => {
    if (addHistory.length === 0) return;
    const last = addHistory[addHistory.length - 1];
    if (last.type === 'door')    setPlacedDoors(prev => prev.filter(d => d.id !== last.element.id));
    if (last.type === 'wall')    setPlacedWalls(prev => prev.filter(w => w.id !== last.element.id));
    if (last.type === 'window')  setPlacedWindows(prev => prev.filter(w => w.id !== last.element.id));
    if (last.type === 'robe')    setPlacedRobes(prev => prev.filter(r => r.id !== last.element.id));
    if (last.type === 'kitchen') setPlacedKitchens(prev => prev.filter(k => k.id !== last.element.id));
    if (selectedEl?.id === last.element.id) setSelectedEl(null);
    setAddHistory(prev => prev.slice(0, -1));
  }, [addHistory, selectedEl]);

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape: cancel wall drawing or deselect
      if (e.key === 'Escape') { setWallStart(null); setEraseStart(null); setWallEraseMode(false); setSelectedEl(null); return; }

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
      } else if (selectedEl.kind === 'kitchen') {
        setPlacedKitchens(prev => prev.map(k => k.id === selectedEl.id ? { ...k, x: k.x + dx, y: k.y + dy } : k));
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
    } else if (drag.kind === 'kitchen') {
      setPlacedKitchens(prev => prev.map(k => k.id === drag.id ? { ...k, x: Math.round(cx - drag.ox), y: Math.round(cy - drag.oy) } : k));
    } else if (drag.kind === 'wall-body') {
      const ddx = Math.round(cx - drag.grabX);
      const ddy = Math.round(cy - drag.grabY);
      setPlacedWalls(prev => prev.map(w => w.id === drag.id ? {
        ...w,
        x1: drag.startX1 + ddx, y1: drag.startY1 + ddy,
        x2: drag.startX2 + ddx, y2: drag.startY2 + ddy,
        cpx: drag.startCpx + ddx,
        cpy: drag.startCpy + ddy,
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

  const startDragKitchen = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation(); e.preventDefault();
    const svgPt = screenToSvg(e.clientX, e.clientY);
    if (!svgPt) return;
    const item = placedKitchens.find(k => k.id === id);
    if (!item) return;
    setSelectedEl({ kind: 'kitchen', id });
    activeDrag.current = { kind: 'kitchen', id, ox: svgPt.x - item.x, oy: svgPt.y - item.y };
    wasDragged.current = false;
  }, [placedKitchens, screenToSvg]);

  const startDragWallBody = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation(); e.preventDefault();
    const svgPt = screenToSvg(e.clientX, e.clientY);
    if (!svgPt) return;
    const wall = placedWalls.find(w => w.id === id);
    if (!wall) return;
    setSelectedEl({ kind: 'wall', id });
    activeDrag.current = { kind: 'wall-body', id, grabX: svgPt.x, grabY: svgPt.y, startX1: wall.x1, startY1: wall.y1, startX2: wall.x2, startY2: wall.y2, startCpx: wall.cpx, startCpy: wall.cpy };
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

  const selectedRobe    = selectedEl?.kind === 'robe'    ? placedRobes.find(r => r.id === selectedEl.id)    : null;
  const selectedWall    = selectedEl?.kind === 'wall'    ? placedWalls.find(w => w.id === selectedEl.id)    : null;
  const selectedWindow  = selectedEl?.kind === 'window'  ? placedWindows.find(w => w.id === selectedEl.id)  : null;
  const selectedDoor    = selectedEl?.kind === 'door'    ? placedDoors.find(d => d.id === selectedEl.id)    : null;
  const selectedKitchen = selectedEl?.kind === 'kitchen' ? placedKitchens.find(k => k.id === selectedEl.id) : null;

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!svgContent) return;
    setIsSaving(true);
    try {
      const wch = wallClearHeight;
      const sw  = wallStroke;

      // Doors SVG
      const doorsSvg = placedDoors.map(door => {
        const w = door.width;
        const flipScale = door.flipped ? ' scale(1,-1)' : '';
        return `<g transform="translate(${door.x},${door.y}) rotate(${door.rotation})${flipScale}" class="door-element" data-door-id="${door.id}">
  <rect x="${-wch}" y="${-wch/2}" width="${w+2*wch}" height="${wch}" fill="#FFFFFF" stroke="none"/>
  <line x1="0" y1="0" x2="${w}" y2="0" stroke="#000000" stroke-width="${sw}" fill="none"/>
  <path d="M ${w},0 A ${w},${w} 0 0,1 0,${-w}" fill="none" stroke="#000000" stroke-width="${sw*0.5}"/>
  <circle cx="0" cy="0" r="${sw}" fill="#000000"/>
</g>`;
      }).join('\n');

      // Walls SVG (erase walls rendered white at 1.5× width, placed last so they paint over)
      const normalWalls = placedWalls.filter(w => !w.erase);
      const eraseWalls  = placedWalls.filter(w =>  w.erase);
      const toWallPath = (wall: PlacedWall, isErase: boolean) => {
        const d = wall.curved
          ? `M ${wall.x1},${wall.y1} Q ${wall.cpx},${wall.cpy} ${wall.x2},${wall.y2}`
          : `M ${wall.x1},${wall.y1} L ${wall.x2},${wall.y2}`;
        const stroke = isErase ? '#FFFFFF' : '#1a1a1a';
        const width  = isErase ? sw * 1.5 : sw;
        return `<path d="${d}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" fill="none" class="wall-element" data-wall-id="${wall.id}" data-erase="${isErase}"/>`;
      };
      const wallsSvg = [
        ...normalWalls.map(w => toWallPath(w, false)),
        ...eraseWalls.map(w  => toWallPath(w, true)),
      ].join('\n');

      // Windows SVG
      const windowsSvg = placedWindows.map(win => {
        const w = win.width;
        const wt = wch; // wall thickness
        const inset = Math.max(1.5, wt / 7);
        const flipScale = win.flipped ? ' scale(1,-1)' : '';
        return `<g transform="translate(${win.x},${win.y}) rotate(${win.rotation})${flipScale}" class="window-element" data-window-id="${win.id}">
  <rect x="0" y="${-wt/2}" width="${w}" height="${wt}" fill="#FFFFFF" stroke="none"/>
  <line x1="0" y1="${-wt/2 + inset}" x2="${w}" y2="${-wt/2 + inset}" stroke="#1a1a1a" stroke-width="${sw * 0.4}"/>
  <line x1="0" y1="${wt/2 - inset}" x2="${w}" y2="${wt/2 - inset}" stroke="#1a1a1a" stroke-width="${sw * 0.4}"/>
</g>`;
      }).join('\n');

      // Robes SVG
      const robesSvg = placedRobes.map(robe => {
        const rw = robe.width;
        const rl = robe.length;
        return `<g transform="translate(${robe.x},${robe.y}) rotate(${robe.rotation})" class="robe-element" data-robe-id="${robe.id}">
  <rect x="0" y="0" width="${rl}" height="${rw}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${sw * 0.5}"/>
</g>`;
      }).join('\n');

      // Kitchen SVG
      const kitchenSvg = placedKitchens.map(k => {
        const { subtype, length: L, depth: D } = k;
        const thin = sw * 0.35, thick = sw * 0.55;
        let inner = '';
        if (subtype === 'island' || subtype === 'bench') {
          inner = `<rect x="${D*0.12}" y="${D*0.12}" width="${L-D*0.24}" height="${D-D*0.24}" fill="none" stroke="#1a1a1a" stroke-width="${thin*0.6}" opacity="0.4"/>`;
        } else if (subtype === 'fridge') {
          const r = Math.min(L,D)*0.08;
          inner = `<line x1="${L*0.2}" y1="${D*0.08}" x2="${L*0.8}" y2="${D*0.08}" stroke="#1a1a1a" stroke-width="${thin*1.2}" stroke-linecap="round"/>
  <circle cx="${L*0.08}" cy="${D*0.5}" r="${thin}" fill="#1a1a1a"/>
  <line x1="${L*0.06}" y1="${D*0.15}" x2="${L*0.94}" y2="${D*0.15}" stroke="#1a1a1a" stroke-width="${thin*0.5}" stroke-dasharray="${thin*2},${thin}"/>`;
        } else if (subtype === 'sink') {
          const dbl = L > D*1.5, bw = dbl ? L*0.42 : L*0.72, bh = D*0.68, by2 = D*0.16;
          if (dbl) {
            inner = `<rect x="${L*0.04}" y="${by2}" width="${bw}" height="${bh}" fill="none" stroke="#1a1a1a" stroke-width="${thin}" rx="${thin}"/>
  <rect x="${L*0.54}" y="${by2}" width="${bw}" height="${bh}" fill="none" stroke="#1a1a1a" stroke-width="${thin}" rx="${thin}"/>
  <circle cx="${L*0.25}" cy="${D*0.5}" r="${thin*1.5}" fill="#1a1a1a"/>
  <circle cx="${L*0.75}" cy="${D*0.5}" r="${thin*1.5}" fill="#1a1a1a"/>`;
          } else {
            inner = `<rect x="${(L-bw)/2}" y="${by2}" width="${bw}" height="${bh}" fill="none" stroke="#1a1a1a" stroke-width="${thin}" rx="${thin}"/>
  <circle cx="${L/2}" cy="${D*0.5}" r="${thin*1.5}" fill="#1a1a1a"/>`;
          }
          inner += `\n  <line x1="${L*0.45}" y1="${D*0.05}" x2="${L*0.55}" y2="${D*0.05}" stroke="#1a1a1a" stroke-width="${thin*1.2}" stroke-linecap="round"/>
  <line x1="${L*0.5}" y1="${D*0.05}" x2="${L*0.5}" y2="${D*0.16}" stroke="#1a1a1a" stroke-width="${thin*0.8}"/>`;
        } else if (subtype === 'cooktop') {
          const bxs = [L*0.25,L*0.75,L*0.25,L*0.75], bys = [D*0.28,D*0.28,D*0.72,D*0.72], r1=Math.min(L,D)*0.18, r2=r1*0.55;
          inner = bxs.map((bx,i)=>`<circle cx="${bx}" cy="${bys[i]}" r="${r1}" fill="none" stroke="#1a1a1a" stroke-width="${thin}"/>
  <circle cx="${bx}" cy="${bys[i]}" r="${r2}" fill="none" stroke="#1a1a1a" stroke-width="${thin*0.6}"/>
  <circle cx="${bx}" cy="${bys[i]}" r="${thin*0.9}" fill="#1a1a1a"/>`).join('\n  ');
        } else if (subtype === 'dishwasher') {
          inner = `<rect x="0" y="0" width="${L}" height="${D*0.12}" fill="rgba(0,0,0,0.04)" stroke="#1a1a1a" stroke-width="${thin*0.5}"/>
  ${[0.3,0.5,0.7,0.88].map(t=>`<line x1="${L*0.08}" y1="${D*t}" x2="${L*0.92}" y2="${D*t}" stroke="#1a1a1a" stroke-width="${thin*0.5}" stroke-dasharray="${thin*3},${thin*1.5}"/>`).join('\n  ')}
  <line x1="${L*0.25}" y1="${D*0.06}" x2="${L*0.75}" y2="${D*0.06}" stroke="#1a1a1a" stroke-width="${thin*1.2}" stroke-linecap="round"/>`;
        }
        return `<g transform="translate(${k.x},${k.y}) rotate(${k.rotation})" class="kitchen-element" data-kitchen-id="${k.id}" data-subtype="${subtype}">
  <rect x="0" y="0" width="${L}" height="${D}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${thick}"/>
  ${inner}
</g>`;
      }).join('\n');

      let modifiedSvg = svgContent
        .replace(/<g\s+id="doors-layer"[\s\S]*?<\/g>\s*/g, '')
        .replace(/<g\s+id="walls-layer"[\s\S]*?<\/g>\s*/g, '')
        .replace(/<g\s+id="windows-layer"[\s\S]*?<\/g>\s*/g, '')
        .replace(/<g\s+id="robes-layer"[\s\S]*?<\/g>\s*/g, '')
        .replace(/<g\s+id="kitchen-layer"[\s\S]*?<\/g>\s*/g, '');

      modifiedSvg = modifiedSvg.replace(
        '</svg>',
        `<g id="walls-layer">\n${wallsSvg}\n</g>\n<g id="windows-layer">\n${windowsSvg}\n</g>\n<g id="robes-layer">\n${robesSvg}\n</g>\n<g id="kitchen-layer">\n${kitchenSvg}\n</g>\n<g id="doors-layer">\n${doorsSvg}\n</g>\n</svg>`,
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
      onSave({ previewImageUrl: result.preview_image_url, doors: placedDoors, walls: placedWalls, windows: placedWindows, robes: placedRobes, kitchens: placedKitchens, updatedAt: new Date().toISOString() });
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
    activeTool === 'door' || activeTool === 'window' || activeTool === 'robe' || activeTool === 'kitchen' ? 'crosshair' :
    activeTool === 'wall' ? (wallEraseMode ? 'cell' : wallStart ? 'crosshair' : 'cell') :
    'default';

  const totalElements = placedDoors.length + placedWalls.length + placedWindows.length + placedRobes.length + placedKitchens.length;

  // ── Tool button helper ──────────────────────────────────────────────────────

  const toolBtn = (tool: ActiveTool, label: string, Icon: React.ElementType, color: string) => {
    const active = activeTool === tool;
    return (
      <button
        onClick={() => { setActiveTool(tool); if (tool !== 'wall') { setWallStart(null); setEraseStart(null); setWallEraseMode(false); } if (tool !== 'select') setSelectedEl(null); }}
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
                    {/* Fat invisible hit target – must use stroke with pointerEvents=all, transparent strokes aren't hit-testable in SVG */}
                    <path
                      d={pathD}
                      stroke="rgba(0,0,0,0.001)"
                      strokeWidth={Math.max(wallStroke + 16, 20)}
                      fill="none"
                      pointerEvents="all"
                      style={{ cursor: activeTool === 'wall' && wallEraseMode ? 'crosshair' : activeTool === 'select' ? 'grab' : 'default' }}
                      onClick={e => handleElementClick(e, 'wall', wall.id)}
                      onMouseDown={e => { if (activeTool === 'select') startDragWallBody(e, wall.id); }}
                    />
                    {/* Visible wall – white if erase, dark if normal */}
                    <path
                      d={pathD}
                      stroke={wall.erase ? '#FFFFFF' : sel ? '#2563eb' : '#1a1a1a'}
                      strokeWidth={wall.erase ? wallStroke * 1.5 : wallStroke}
                      strokeLinecap="round"
                      fill="none"
                      pointerEvents="none"
                    />
                    {sel && !wall.erase && (
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

            {/* ── Erase preview line while drawing ─────────────────────── */}
            {activeTool === 'wall' && wallEraseMode && eraseStart && (
              <g pointerEvents="none">
                <line
                  x1={eraseStart.x} y1={eraseStart.y}
                  x2={cursorPos.x}   y2={cursorPos.y}
                  stroke="#FFFFFF" strokeWidth={wallStroke * 1.5} strokeLinecap="round" opacity={0.9}
                />
                {/* Red dashed outline so you can see where you're erasing */}
                <line
                  x1={eraseStart.x} y1={eraseStart.y}
                  x2={cursorPos.x}   y2={cursorPos.y}
                  stroke="#ef4444" strokeWidth={1} strokeDasharray="6,4" strokeLinecap="round" opacity={0.7}
                />
                <circle cx={eraseStart.x} cy={eraseStart.y} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
                <circle cx={cursorPos.x} cy={cursorPos.y} r={4} fill="none" stroke="#ef4444" strokeWidth={1.5} opacity={0.7} />
              </g>
            )}

            {/* ── Windows overlay ──────────────────────────────────────── */}
            <g id="windows-overlay">
              {placedWindows.map(win => {
                const w = win.width;
                const wt = wallClearHeight; // wall thickness
                const inset = Math.max(1.5, wt / 7); // ~2px for 14px wall
                const sel = selectedEl?.kind === 'window' && selectedEl.id === win.id;
                const flipScale = win.flipped ? ' scale(1,-1)' : '';
                return (
                  <g
                    key={win.id}
                    transform={`translate(${win.x},${win.y}) rotate(${win.rotation})${flipScale}`}
                    onClick={e => handleElementClick(e, 'window', win.id)}
                    onMouseDown={e => { if (activeTool === 'select') startDragWindow(e, win.id); }}
                    style={{ cursor: sel ? 'grab' : 'pointer' }}
                  >
                    {/* White rect clearing exact wall thickness × window length */}
                    <rect x={0} y={-wt/2} width={w} height={wt} fill="#FFFFFF" stroke="none" />
                    {/* Selection highlight */}
                    {sel && <rect x={-4} y={-wt/2 - 4} width={w + 8} height={wt + 8} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5,3" rx={2} />}
                    {/* Line 1 – inset from near wall edge */}
                    <line x1={0} y1={-wt/2 + inset} x2={w} y2={-wt/2 + inset}
                      stroke={sel ? '#2563eb' : '#1a1a1a'}
                      strokeWidth={sel ? 1.5 : wallStroke * 0.4} />
                    {/* Line 2 – inset from far wall edge */}
                    <line x1={0} y1={wt/2 - inset} x2={w} y2={wt/2 - inset}
                      stroke={sel ? '#2563eb' : '#1a1a1a'}
                      strokeWidth={sel ? 1.5 : wallStroke * 0.4} />
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
                    onMouseDown={e => { if (activeTool === 'select') startDragRobe(e, robe.id); }}
                    style={{ cursor: sel ? 'grab' : 'pointer' }}
                  >
                    {sel && <rect x={-4} y={-4} width={rl + 8} height={rw + 8} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5,3" rx={2} />}
                    {/* Plain white rectangle – no interior lines */}
                    <rect x={0} y={0} width={rl} height={rw} fill="#FFFFFF" stroke={sel ? '#2563eb' : '#1a1a1a'} strokeWidth={sel ? 1.5 : wallStroke * 0.5} />
                  </g>
                );
              })}
            </g>

            {/* ── Kitchen overlay ──────────────────────────────────────── */}
            <g id="kitchen-overlay">
              {placedKitchens.map(item => {
                const sel = selectedEl?.kind === 'kitchen' && selectedEl.id === item.id;
                return (
                  <g
                    key={item.id}
                    transform={`translate(${item.x},${item.y}) rotate(${item.rotation})`}
                    onClick={e => handleElementClick(e, 'kitchen', item.id)}
                    onMouseDown={e => { if (activeTool === 'select') startDragKitchen(e, item.id); }}
                    style={{ cursor: sel ? 'grab' : 'pointer' }}
                  >
                    {sel && <rect x={-5} y={-5} width={item.length + 10} height={item.depth + 10} fill="rgba(59,130,246,0.06)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6,3" rx={3} />}
                    <KitchenSymbol item={item} sw={wallStroke} sel={sel} />
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
                    onMouseDown={e => { if (activeTool === 'select') startDragDoor(e, door.id); }}
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
              {activeTool === 'wall' && !wallEraseMode && !wallStart && 'Click to start a wall segment'}
              {activeTool === 'wall' && !wallEraseMode && wallStart && 'Click to finish the wall'}
              {activeTool === 'wall' && wallEraseMode && !eraseStart && 'Click to start erasing'}
              {activeTool === 'wall' && wallEraseMode && eraseStart && 'Click to finish erase stroke'}
              {activeTool === 'window' && 'Click to place a window'}
              {activeTool === 'robe' && 'Click to place a built-in robe'}
              {activeTool === 'kitchen' && `Click to place ${kitchenSubtype}`}
            </div>
          )}
          {(activeTool === 'wall' && wallStart && totalElements > 0) || (activeTool === 'wall' && wallEraseMode && eraseStart) ? (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full pointer-events-none">
              Click to finish · Esc to cancel
            </div>
          ) : null}
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
              {toolBtn('select',  'Select',  MousePointer,    'bg-slate-600')}
              {toolBtn('door',    'Door',    DoorOpen,        'bg-blue-600')}
              {toolBtn('wall',    'Wall',    Minus,           'bg-violet-600')}
              {toolBtn('window',  'Window',  Square,          'bg-cyan-600')}
              {toolBtn('robe',    'Robe',    Columns,         'bg-amber-600')}
              {toolBtn('kitchen', 'Kitchen', UtensilsCrossed, 'bg-orange-600')}
            </div>

            {/* Kitchen sub-palette */}
            {activeTool === 'kitchen' && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-gray-500 text-[10px] mb-2 uppercase tracking-wider">Item to place</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['island','bench','fridge','sink','cooktop','dishwasher'] as KitchenSubtype[]).map(st => (
                    <button
                      key={st}
                      onClick={() => setKitchenSubtype(st)}
                      className={`px-2 py-1.5 rounded-md text-[11px] font-medium capitalize transition border ${
                        kitchenSubtype === st
                          ? 'bg-orange-600 border-orange-500 text-white'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Context actions */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Actions</h4>
            <div className="grid grid-cols-5 gap-2">
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
                disabled={selectedEl?.kind !== 'wall' || !!(selectedEl && placedWalls.find(w => w.id === selectedEl.id)?.erase)}
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
              {/* Erase toggle – active only when Wall tool is selected */}
              <button
                onClick={() => {
                  if (activeTool !== 'wall') { setActiveTool('wall'); setWallEraseMode(true); setSelectedEl(null); setWallStart(null); }
                  else { setWallEraseMode(p => !p); setEraseStart(null); setWallStart(null); }
                }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition border ${
                  activeTool === 'wall' && wallEraseMode
                    ? 'bg-red-500/20 border-red-500/40 text-red-400'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400'
                }`}
                title="Toggle wall erase mode"
              >
                <Eraser className="w-4 h-4" />
                <span className="text-xs">Erase</span>
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

              {/* Kitchen */}
              {selectedKitchen && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Type</span>
                    <span className="font-mono text-white capitalize">{selectedKitchen.subtype}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Rotation</span>
                    <span className="font-mono text-white">{selectedKitchen.rotation}°</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Length</span>
                    <span className="font-mono text-white">{Math.round(selectedKitchen.length / unitsPerMeter * 1000)} mm</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Depth</span>
                    <span className="font-mono text-white">{Math.round(selectedKitchen.depth / unitsPerMeter * 1000)} mm</span>
                  </div>
                  <label className="block text-gray-400 text-xs mt-2">Adjust length</label>
                  <input
                    type="range"
                    min={Math.round(unitsPerMeter * 0.3)} max={Math.round(unitsPerMeter * 5.0)} step={Math.round(unitsPerMeter * 0.005)}
                    value={selectedKitchen.length}
                    onChange={e => setPlacedKitchens(prev => prev.map(k => k.id === selectedKitchen.id ? { ...k, length: +e.target.value } : k))}
                    className="w-full accent-orange-500"
                  />
                  <label className="block text-gray-400 text-xs mt-1">Adjust depth</label>
                  <input
                    type="range"
                    min={Math.round(unitsPerMeter * 0.3)} max={Math.round(unitsPerMeter * 1.2)} step={Math.round(unitsPerMeter * 0.005)}
                    value={selectedKitchen.depth}
                    onChange={e => setPlacedKitchens(prev => prev.map(k => k.id === selectedKitchen.id ? { ...k, depth: +e.target.value } : k))}
                    className="w-full accent-orange-400"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500 -mt-1">
                    <span>300 mm</span>
                    <span>depth max 1200 mm</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Elements summary */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Placed Elements</h4>
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: 'Doors',   count: placedDoors.length,    color: 'text-blue-400',   bg: 'bg-blue-500/10' },
                { label: 'Walls',   count: placedWalls.length,    color: 'text-violet-400', bg: 'bg-violet-500/10' },
                { label: 'Windows', count: placedWindows.length,  color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
                { label: 'Robes',   count: placedRobes.length,    color: 'text-amber-400',  bg: 'bg-amber-500/10' },
                { label: 'Kitchen', count: placedKitchens.length, color: 'text-orange-400', bg: 'bg-orange-500/10' },
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
