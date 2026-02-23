// frontend/components/SvgEditor.tsx
// Floor plan editor: Doors · Walls · Windows · Robes · Kitchen
// v2 – Full undo · Zoom/pan · Grid snap · MS Paint eraser · Bug fixes

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, Save, Trash2, RotateCw, MousePointer, DoorOpen, Undo2, Pencil,
  ArrowLeft, Move, FlipHorizontal2, Square, Columns,
  UtensilsCrossed, ZoomIn, ZoomOut, Maximize2, Grid,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PlacedDoor {
  id: number; x: number; y: number;
  rotation: number; width: number; flipped: boolean; subtype: 'swing' | 'sliding' | 'entry';
}
export interface PlacedWall {
  id: number; x1: number; y1: number; x2: number; y2: number;
  curved: boolean; cpx: number; cpy: number;
  erase?: boolean;
  /** Freehand stroke points for MS-Paint erase */
  points?: { x: number; y: number }[];
}
export interface PlacedWindow {
  id: number; x: number; y: number;
  rotation: number; width: number; flipped: boolean;
}
export type RobeSubtype = 'straight' | 'lshape' | 'ushape';
export interface PlacedRobe {
  id: number; x: number; y: number;
  rotation: number; length: number; width: number; subtype: RobeSubtype;
}
export type KitchenSubtype = 'island' | 'bench' | 'fridge' | 'sink' | 'cooktop' | 'dishwasher' | 'washer';
export type BathSubtype = 'bathtub' | 'shower' | 'vanity' | 'basin' | 'toilet';
export interface PlacedBath {
  id: number; x: number; y: number;
  rotation: number; subtype: BathSubtype; length: number; depth: number;
}
export interface PlacedKitchen {
  id: number; x: number; y: number;
  rotation: number; subtype: KitchenSubtype; length: number; depth: number;
}
export interface SvgEditorSaveResult {
  previewImageUrl: string;
  doors: PlacedDoor[]; windows: PlacedWindow[];
  robes: PlacedRobe[]; kitchens: PlacedKitchen[]; baths: PlacedBath[]; updatedAt: string;
}
export interface SvgEditorProps {
  svgUrl: string; projectId: number; planId: number;
  existingDoors?: PlacedDoor[]; existingWalls?: PlacedWall[];
  existingWindows?: PlacedWindow[]; existingRobes?: PlacedRobe[];
  existingKitchens?: PlacedKitchen[]; existingBaths?: PlacedBath[]; envelopeWidth?: number;
  onSave: (result: SvgEditorSaveResult) => void; onCancel: () => void;
}

// ── Internal types ─────────────────────────────────────────────────────────────

type DragTarget =
  | { kind: 'door';      id: number; ox: number; oy: number }
  | { kind: 'window';   id: number; ox: number; oy: number }
  | { kind: 'robe';     id: number; ox: number; oy: number }
  | { kind: 'kitchen';  id: number; ox: number; oy: number }
  | { kind: 'bath';     id: number; ox: number; oy: number };

interface Snapshot {
  doors: PlacedDoor[]; windows: PlacedWindow[];
  robes: PlacedRobe[]; kitchens: PlacedKitchen[]; baths: PlacedBath[];
}
type ActiveTool = 'select' | 'door' | 'window' | 'robe' | 'kitchen' | 'bath';
type ElementKind = 'door' | 'window' | 'robe' | 'kitchen' | 'bath';
type SelectedEl = { kind: ElementKind; id: number } | null;

// ── Utilities ──────────────────────────────────────────────────────────────────

function ptsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  return `M ${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x},${p.y}`).join(' ');
}

// ── PropRow helper ────────────────────────────────────────────────────────────────
function PropRow({ label, unit, children }: { label: string; unit: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400 text-xs w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-1 ml-auto">
        {children}
        <span className="text-gray-500 text-xs">{unit}</span>
      </div>
    </div>
  );
}

// ── Kitchen symbol ─────────────────────────────────────────────────────────────

function KitchenSymbol({ item, sw, sel }: { item: PlacedKitchen; sw: number; sel: boolean }) {
  const { subtype, length: L, depth: D } = item;
  const stroke = sel ? '#2563eb' : '#1a1a1a';
  const scale = 0.5;
  const thin = sw * 0.35 * scale, thick = sw * 0.55 * scale;
  switch (subtype) {
    case 'island': return (
      <>{/* island */}
        <rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick} />
        <rect x={D*0.12} y={D*0.12} width={L-D*0.24} height={D-D*0.24} fill="none" stroke={stroke} strokeWidth={thin*0.6} opacity={0.4}/>
      </>);
    case 'bench': return (
      <rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick} />
    );
    case 'fridge': { const r=Math.min(L,D)*0.08; const fs=Math.min(L,D)*0.38; return (
      <><rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick} rx={r}/>
        <text x={L*0.5} y={D*0.5} textAnchor="middle" dominantBaseline="central"
          fontSize={fs} fontFamily="Arial, sans-serif" fontWeight="600" fill={stroke} letterSpacing="0.05em">FR</text>
      </>); }
    case 'sink': { const dbl=L>D*1.5,bw=dbl?L*0.42:L*0.72,bh=D*0.68,by=D*0.16; return (
      <><rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick}/>
        {dbl?<><rect x={L*0.04} y={by} width={bw} height={bh} fill="none" stroke={stroke} strokeWidth={thin} rx={thin}/>
          <rect x={L*0.54} y={by} width={bw} height={bh} fill="none" stroke={stroke} strokeWidth={thin} rx={thin}/>
          <circle cx={L*0.25} cy={D*0.5} r={thin*1.5} fill={stroke}/><circle cx={L*0.75} cy={D*0.5} r={thin*1.5} fill={stroke}/></>
        :<><rect x={(L-bw)/2} y={by} width={bw} height={bh} fill="none" stroke={stroke} strokeWidth={thin} rx={thin}/>
          <circle cx={L/2} cy={D*0.5} r={thin*1.5} fill={stroke}/></>}
        <line x1={L*0.45} y1={D*0.05} x2={L*0.55} y2={D*0.05} stroke={stroke} strokeWidth={thin*1.2} strokeLinecap="round"/>
        <line x1={L*0.5} y1={D*0.05} x2={L*0.5} y2={by} stroke={stroke} strokeWidth={thin*0.8}/></>); }
    case 'cooktop': { const bx=[L*0.25,L*0.75,L*0.25,L*0.75],by2=[D*0.28,D*0.28,D*0.72,D*0.72],r1=Math.min(L,D)*0.18,r2=r1*0.55; return (
      <><rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick}/>
        {bx.map((bxi,i)=><g key={i}><circle cx={bxi} cy={by2[i]} r={r1} fill="none" stroke={stroke} strokeWidth={thin}/>
          <circle cx={bxi} cy={by2[i]} r={r2} fill="none" stroke={stroke} strokeWidth={thin*0.6}/>
          <circle cx={bxi} cy={by2[i]} r={thin*0.9} fill={stroke}/></g>)}</> ); }
    case 'dishwasher': { const fs=Math.min(L,D)*0.38; return (
      <><rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick}/>
        <text x={L*0.5} y={D*0.5} textAnchor="middle" dominantBaseline="central"
          fontSize={fs} fontFamily="Arial, sans-serif" fontWeight="600" fill={stroke} letterSpacing="0.05em">DW</text>
      </>); }
    case 'washer': { const fs=Math.min(L,D)*0.38; return (
      <><rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick}/>
        <text x={L*0.5} y={D*0.5} textAnchor="middle" dominantBaseline="central"
          fontSize={fs} fontFamily="Arial, sans-serif" fontWeight="600" fill={stroke} letterSpacing="0.05em">WR</text>
      </>); }
    default: return null;
  }
}

// ── Bath symbol ────────────────────────────────────────────────────────────────

function BathSymbol({ item, sw, sel }: { item: PlacedBath; sw: number; sel: boolean }) {
  const { subtype, length: L, depth: D } = item;
  const stroke = sel ? '#2563eb' : '#1a1a1a';
  const t = sw * 0.25; // thin line weight for all bath items

  switch (subtype) {
    case 'bathtub': {
      // Outer rounded rect + inset inner rounded rect (pill shape)
      const r = Math.min(L, D) * 0.5; // outer corner radius — full pill
      const pad = Math.min(L, D) * 0.08;
      const ri = Math.min(L - pad * 2, D - pad * 2) * 0.5; // inner corner radius
      return (
        <>
          <rect x={0} y={0} width={L} height={D} rx={r} ry={r} fill="#FFFFFF" stroke={stroke} strokeWidth={t * 1.5}/>
          <rect x={pad} y={pad} width={L - pad * 2} height={D - pad * 2} rx={ri} ry={ri} fill="none" stroke={stroke} strokeWidth={t}/>
        </>
      );
    }
    case 'shower': {
      return (
        <>
          <rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={t * 1.5}/>
          {/* Cross drain */}
          <line x1={L*0.5-t*2} y1={D*0.5} x2={L*0.5+t*2} y2={D*0.5} stroke={stroke} strokeWidth={t}/>
          <line x1={L*0.5} y1={D*0.5-t*2} x2={L*0.5} y2={D*0.5+t*2} stroke={stroke} strokeWidth={t}/>
          <circle cx={L*0.5} cy={D*0.5} r={t*3} fill="none" stroke={stroke} strokeWidth={t*0.6}/>
        </>
      );
    }
    case 'vanity': {
      // Rectangle (cabinet) + inset basin oval
      const bw = Math.min(L * 0.55, D * 0.75), bh = Math.min(D * 0.65, L * 0.65);
      const bx = (L - bw) / 2, by = (D - bh) / 2;
      return (
        <>
          <rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={t * 1.5}/>
          <ellipse cx={L/2} cy={D/2} rx={bw/2} ry={bh/2} fill="none" stroke={stroke} strokeWidth={t}/>
          <circle cx={L/2} cy={D*0.42} r={t * 1.2} fill={stroke}/>
        </>
      );
    }
    case 'basin': {
      // Small wall-mounted basin: rectangle + oval bowl + tap
      const bw = L * 0.72, bh = D * 0.68;
      return (
        <>
          <rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={t * 1.5}/>
          <ellipse cx={L/2} cy={D*0.55} rx={bw/2} ry={bh/2} fill="none" stroke={stroke} strokeWidth={t}/>
          <circle cx={L/2} cy={D*0.22} r={t*1.2} fill={stroke}/>
          <line x1={L*0.38} y1={D*0.22} x2={L*0.62} y2={D*0.22} stroke={stroke} strokeWidth={t*1.2} strokeLinecap="round"/>
        </>
      );
    }
    case 'toilet': {
      // Square cistern at top + rounded-rect bowl below
      const cisH = D * 0.3;
      const bowlY = cisH;
      const bowlH = D - cisH;
      const bowlR = Math.min(L, bowlH) * 0.48; // pill corners
      return (
        <>
          {/* Cistern — square */}
          <rect x={0} y={0} width={L} height={cisH} fill="#FFFFFF" stroke={stroke} strokeWidth={t * 1.5}/>
          {/* Bowl — rounded rect (pill) */}
          <rect x={0} y={bowlY} width={L} height={bowlH} rx={bowlR} ry={bowlR} fill="#FFFFFF" stroke={stroke} strokeWidth={t * 1.5}/>
          {/* Flush button on cistern */}
          <circle cx={L/2} cy={cisH*0.5} r={t*1.8} fill={stroke}/>
        </>
      );
    }
    default: return null;
  }
}


// ── Component ──────────────────────────────────────────────────────────────────

export default function SvgEditor({
  svgUrl, projectId, planId,
  existingDoors, existingWalls, existingWindows, existingRobes, existingKitchens, existingBaths,
  envelopeWidth = 12, onSave, onCancel,
}: SvgEditorProps) {

  // ── State ───────────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading]   = useState(true);
  const [svgContent, setSvgContent] = useState('');
  const [svgViewBox, setSvgViewBox] = useState({ x: 0, y: 0, w: 800, h: 1000 });
  const [isSaving, setIsSaving]     = useState(false);
  const [toast, setToast]           = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [unitsPerMeter, setUnitsPerMeter]     = useState(80);
  const [wallClearHeight, setWallClearHeight] = useState(8);
  const [wallStroke, setWallStroke]           = useState(5);
  const nudgeStep = useRef(1);

  const [placedDoors,    setPlacedDoors]    = useState<PlacedDoor[]>([]);
  const [placedWalls,    setPlacedWalls]    = useState<PlacedWall[]>([]);
  const [placedWindows,  setPlacedWindows]  = useState<PlacedWindow[]>([]);
  const [placedRobes,    setPlacedRobes]    = useState<PlacedRobe[]>([]);
  const [placedKitchens, setPlacedKitchens] = useState<PlacedKitchen[]>([]);

  const nextId = useRef(1); // unified ID counter

  const [doorWidth,    setDoorWidth]    = useState(40);
  const [doorSubtype,  setDoorSubtype]  = useState<'swing'|'sliding'|'entry'>('swing');
  const [windowWidth,  setWindowWidth]  = useState(50);
  const [robeFixedW,   setRobeFixedW]   = useState(30);
  const [robeLength,   setRobeLength]   = useState(80);
  const [robeSubtype,  setRobeSubtype]  = useState<RobeSubtype>('straight');
  const [kitchenSubtype, setKitchenSubtype] = useState<KitchenSubtype>('island');
  const [kitchenDefaults, setKitchenDefaults] = useState<Record<KitchenSubtype,{length:number;depth:number}>>({
    island:{length:96,depth:36},bench:{length:96,depth:24},fridge:{length:28,depth:28},
    sink:{length:36,depth:20},cooktop:{length:24,depth:24},dishwasher:{length:24,depth:24},washer:{length:24,depth:24},
  });
  const [placedBaths,    setPlacedBaths]    = useState<PlacedBath[]>([]);
  const [bathSubtype,    setBathSubtype]    = useState<BathSubtype>('bathtub');
  const [bathDefaults,   setBathDefaults]   = useState<Record<BathSubtype,{length:number;depth:number}>>({
    bathtub:{length:170,depth:70},shower:{length:90,depth:90},
    vanity:{length:90,depth:50},basin:{length:50,depth:40},toilet:{length:37,depth:60},
  });

  const [activeTool,    setActiveTool]    = useState<ActiveTool>('door');
  const [selectedEl,    setSelectedEl]    = useState<SelectedEl>(null);
  const [cursorPos,     setCursorPos]     = useState({x:0,y:0});
  const [snapEnabled,   setSnapEnabled]   = useState(true);

  // Zoom/pan
  const [viewState, setViewState]  = useState({ zoom: 1, panX: 0, panY: 0 });
  const viewStateRef  = useRef(viewState);
  const svgViewBoxRef = useRef(svgViewBox);
  viewStateRef.current  = viewState;
  svgViewBoxRef.current = svgViewBox;

  const [spaceDown, setSpaceDown] = useState(false);
  const isPanningRef  = useRef(false);
  const panStartRef   = useRef<{screenX:number;screenY:number;panX:number;panY:number}|null>(null);

  // MS Paint erase

  // Full undo stack
  const undoStack   = useRef<Snapshot[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const stateRef    = useRef<Snapshot>({doors:[],windows:[],robes:[],kitchens:[],baths:[]});

  const svgRef             = useRef<SVGSVGElement>(null);
  const svgContentGroupRef = useRef<SVGGElement>(null);
  const activeDrag         = useRef<DragTarget|null>(null);
  const wasDragged         = useRef(false);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = { doors:placedDoors, windows:placedWindows, robes:placedRobes, kitchens:placedKitchens, baths:placedBaths };
  }, [placedDoors, placedWindows, placedRobes, placedKitchens, placedBaths]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const showToast = useCallback((msg:string, type:'success'|'error'='success') => setToast({msg,type}), []);

  // Grid snap
  const snap = useCallback((v:number):number => {
    if (!snapEnabled) return Math.round(v);
    const g = Math.max(1, Math.round(unitsPerMeter * 0.05));
    return Math.round(v / g) * g;
  }, [snapEnabled, unitsPerMeter]);

  // Angle snap (Shift key during wall draw)
  const snapToAngle = useCallback((x1:number,y1:number,x2:number,y2:number,shift:boolean) => {
    if (!shift) return {x:x2,y:y2};
    const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
    if (len===0) return {x:x2,y:y2};
    const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4);
    return {x:x1+Math.cos(angle)*len, y:y1+Math.sin(angle)*len};
  }, []);

  // ── Full undo ──────────────────────────────────────────────────────────────
  const pushUndo = useCallback(() => {
    const s = stateRef.current;
    undoStack.current = [
      ...undoStack.current.slice(-49),
      {doors:[...s.doors],windows:[...s.windows],robes:[...s.robes],kitchens:[...s.kitchens],baths:[...(s.baths||[])]},
    ];
    setUndoDepth(undoStack.current.length);
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoStack.current.length) return;
    const prev = undoStack.current[undoStack.current.length-1];
    undoStack.current = undoStack.current.slice(0,-1);
    setPlacedDoors(prev.doors); 
    setPlacedWindows(prev.windows); setPlacedRobes(prev.robes);
    setPlacedKitchens(prev.kitchens); setPlacedBaths((prev as any).baths||[]); setSelectedEl(null);
    setUndoDepth(undoStack.current.length);
  }, []);

  // Inject SVG content into group
  useEffect(() => {
    if (!svgContent || !svgContentGroupRef.current) return;
    const cleaned = svgContent.replace(/<\?xml[^?]*\?>\s*/g,'');
    const match = cleaned.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    if (match?.[1]) svgContentGroupRef.current.innerHTML = match[1];
  }, [svgContent]);

  // ── Init / SVG load ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(svgUrl);
        const text = await res.text();
        if (cancelled) return;
        setSvgContent(text);

        const parser = new DOMParser();
        const doc    = parser.parseFromString(text, 'image/svg+xml');
        const svgEl  = doc.querySelector('svg');

        if (svgEl) {
          const vb = svgEl.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
          if (vb && vb.length===4) setSvgViewBox({x:vb[0],y:vb[1],w:vb[2],h:vb[3]});
          else { const w=parseFloat(svgEl.getAttribute('width')||'800'),h=parseFloat(svgEl.getAttribute('height')||'1000'); setSvgViewBox({x:0,y:0,w,h}); }

          // Scale detection – Strategy 1: text labels "Nm x Nm"
          let upm = 0;
          const allRects = Array.from(svgEl.querySelectorAll('rect'));
          const dimRegex = /(\d+\.?\d*)\s*m\s*[x×]\s*(\d+\.?\d*)\s*m/i;
          interface RL {widthM:number;heightM:number;cx:number;cy:number}
          const labels:RL[]=[];
          for (const t of Array.from(svgEl.querySelectorAll('text'))) {
            const m=(t.textContent||'').replace(/\s+/g,' ').trim().match(dimRegex);
            if (m) labels.push({widthM:parseFloat(m[1]),heightM:parseFloat(m[2]),cx:parseFloat(t.getAttribute('x')||'0'),cy:parseFloat(t.getAttribute('y')||'0')});
          }
          const toR=(r:Element)=>({x:parseFloat(r.getAttribute('x')||'0'),y:parseFloat(r.getAttribute('y')||'0'),w:parseFloat(r.getAttribute('width')||'0'),h:parseFloat(r.getAttribute('height')||'0')});
          const vertR = allRects.map(toR).filter(r=>r.h>r.w*1.5&&r.h>10&&r.w>0);
          const cands:number[]=[];
          for (const label of labels) {
            const sorted=[...vertR].sort((a,b)=>a.x-b.x);
            let left:typeof sorted[0]|null=null,right:typeof sorted[0]|null=null;
            for (const r of sorted){if(r.x+r.w<=label.cx)left=r;}
            for (const r of sorted){if(r.x>=label.cx&&!right)right=r;}
            if(left&&right){const inner=right.x-(left.x+left.w);if(inner>0)cands.push(inner/label.widthM);}
          }
          if(cands.length>0){cands.sort((a,b)=>a-b);upm=cands[Math.floor(cands.length/2)];}

          // Strategy 2: horizontal rects
          if (cands.length===0) {
            const horizR=allRects.map(toR).filter(r=>r.w>r.h*1.5&&r.w>10&&r.h>0);
            for (const label of labels) {
              const sorted=[...horizR].sort((a,b)=>a.y-b.y);
              let top:typeof sorted[0]|null=null,bot:typeof sorted[0]|null=null;
              for(const r of sorted){if(r.y+r.h<=label.cy)top=r;}
              for(const r of sorted){if(r.y>=label.cy&&!bot)bot=r;}
              if(top&&bot){const inner=bot.y-(top.y+top.h);if(inner>0)cands.push(inner/label.heightM);}
            }
            if(cands.length>0){cands.sort((a,b)=>a-b);upm=cands[Math.floor(cands.length/2)];}
          }
          // Strategy 3: viewBox fallback
          if (upm<=0){const viewW=vb?vb[2]:parseFloat(svgEl.getAttribute('width')||'800');upm=viewW/envelopeWidth;}
          if (upm<10) upm=Math.max(upm*100,50);

          setUnitsPerMeter(upm);
          setDoorWidth(0.82*upm);
          setWindowWidth(Math.round(upm*1.0));
          setRobeFixedW(0.6*upm);
          setRobeLength(1.8*upm);
          setWallClearHeight(Math.max(upm*0.08,Math.round(upm*0.35)));

          // Detect internal wall stroke
          const darkRects=Array.from(svgEl.querySelectorAll('rect[fill="#1a1a1a"]'))
            .map(r=>({w:parseFloat(r.getAttribute('width')||'0'),h:parseFloat(r.getAttribute('height')||'0')}))
            .filter(r=>r.w>0&&r.h>0);
          const thinDims=darkRects.map(r=>Math.min(r.w,r.h)).filter(d=>d>0);
          let ws=Math.max(2,Math.round(upm*0.12));
          if(thinDims.length>0){thinDims.sort((a,b)=>a-b);const med=thinDims[Math.floor(thinDims.length/2)];const lo=thinDims.filter(d=>d<=med);ws=Math.max(2,lo[Math.floor(lo.length/2)]);}
          setWallStroke(ws);
          nudgeStep.current=Math.max(1,upm*0.01);

          setBathDefaults({
            bathtub:{length:1.7*upm,depth:0.75*upm},shower:{length:0.9*upm,depth:0.9*upm},
            vanity:{length:0.9*upm,depth:0.5*upm},basin:{length:0.5*upm,depth:0.4*upm},toilet:{length:0.37*upm,depth:0.6*upm},
          });
          setKitchenDefaults({
            island:{length:2.5*upm,depth:0.9*upm},
            bench:{length:2.4*upm,depth:0.6*upm},
            fridge:{length:Math.round(upm*0.7),depth:Math.round(upm*0.7)},
            sink:{length:0.8*upm,depth:0.4*upm},
            cooktop:{length:0.8*upm,depth:0.4*upm},
            dishwasher:{length:0.6*upm,depth:0.6*upm},washer:{length:0.6*upm,depth:0.6*upm},
          });
        }

        const allIds:number[]=[];
        if(existingDoors?.length)   {setPlacedDoors(existingDoors);      allIds.push(...existingDoors.map(d=>d.id));}
        if(existingWalls?.length)   {setPlacedWalls(existingWalls);      allIds.push(...existingWalls.map(w=>w.id));}
        if(existingWindows?.length) {setPlacedWindows(existingWindows);  allIds.push(...existingWindows.map(w=>w.id));}
        if(existingRobes?.length)   {setPlacedRobes(existingRobes);      allIds.push(...existingRobes.map(r=>r.id));}
        if(existingKitchens?.length){setPlacedKitchens(existingKitchens);allIds.push(...existingKitchens.map(k=>k.id));}
        if(existingBaths?.length){setPlacedBaths(existingBaths);allIds.push(...existingBaths.map((b:PlacedBath)=>b.id));}
        if(allIds.length>0) nextId.current=Math.max(...allIds)+1;

      } catch(err) { console.error('SvgEditor: failed to load SVG',err); }
      finally { if(!cancelled) setIsLoading(false); }
    })();
    return () => { cancelled=true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Display viewBox = base vb + pan/zoom
  const displayVB = {
    x: svgViewBox.x + viewState.panX,
    y: svgViewBox.y + viewState.panY,
    w: svgViewBox.w / viewState.zoom,
    h: svgViewBox.h / viewState.zoom,
  };

  // Screen → SVG coordinate transform
  const screenToSvg = useCallback((clientX:number,clientY:number) => {
    const svg=svgRef.current; if(!svg) return null;
    const pt=svg.createSVGPoint(); pt.x=clientX; pt.y=clientY;
    const ctm=svg.getScreenCTM(); if(!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleRotateSelected = useCallback(() => {
    if(!selectedEl) return; pushUndo();
    if(selectedEl.kind==='door')    setPlacedDoors(p    =>p.map(d=>d.id===selectedEl.id?{...d,rotation:(d.rotation+90)%360}:d));
    if(selectedEl.kind==='window')  setPlacedWindows(p  =>p.map(w=>w.id===selectedEl.id?{...w,rotation:(w.rotation+90)%360}:w));
    if(selectedEl.kind==='robe')    setPlacedRobes(p    =>p.map(r=>r.id===selectedEl.id?{...r,rotation:(r.rotation+90)%360}:r));
    if(selectedEl.kind==='kitchen') setPlacedKitchens(p =>p.map(k=>k.id===selectedEl.id?{...k,rotation:(k.rotation+90)%360}:k));
    if(selectedEl.kind==='bath')    setPlacedBaths(p    =>p.map(b=>b.id===selectedEl.id?{...b,rotation:(b.rotation+90)%360}:b));
  }, [selectedEl, pushUndo]);

  const handleFlipSelected = useCallback(() => {
    if(!selectedEl) return; pushUndo();
    if(selectedEl.kind==='door')   setPlacedDoors(p  =>p.map(d=>d.id===selectedEl.id?{...d,flipped:!d.flipped}:d));
    if(selectedEl.kind==='window') setPlacedWindows(p=>p.map(w=>w.id===selectedEl.id?{...w,flipped:!w.flipped}:w));
  }, [selectedEl, pushUndo]);


  const handleDeleteSelected = useCallback(() => {
    if(!selectedEl) return; pushUndo();
    if(selectedEl.kind==='door')    setPlacedDoors(p    =>p.filter(d=>d.id!==selectedEl.id));
    if(selectedEl.kind==='window')  setPlacedWindows(p  =>p.filter(w=>w.id!==selectedEl.id));
    if(selectedEl.kind==='robe')    setPlacedRobes(p    =>p.filter(r=>r.id!==selectedEl.id));
    if(selectedEl.kind==='kitchen') setPlacedKitchens(p =>p.filter(k=>k.id!==selectedEl.id));
    if(selectedEl.kind==='bath')    setPlacedBaths(p    =>p.filter(b=>b.id!==selectedEl.id));
    setSelectedEl(null);
  }, [selectedEl, pushUndo]);

  // ── Zoom ────────────────────────────────────────────────────────────────────
  const resetView = useCallback(() => setViewState({zoom:1,panX:0,panY:0}), []);
  const zoomStep  = useCallback((factor:number) => setViewState(vs=>({...vs,zoom:Math.max(0.25,Math.min(15,vs.zoom*factor))})), []);

  // Wheel zoom (non-passive to allow preventDefault)
  const handleWheel = useCallback((e:WheelEvent) => {
    e.preventDefault();
    const factor=e.deltaY<0?1.15:1/1.15;
    const el=svgRef.current; if(!el) return;
    const rect=el.getBoundingClientRect();
    const fracX=(e.clientX-rect.left)/rect.width, fracY=(e.clientY-rect.top)/rect.height;
    const vs=viewStateRef.current, vb=svgViewBoxRef.current;
    const newZ=Math.max(0.25,Math.min(15,vs.zoom*factor));
    const oldW=vb.w/vs.zoom,oldH=vb.h/vs.zoom,newW=vb.w/newZ,newH=vb.h/newZ;
    setViewState({zoom:newZ,panX:vs.panX+(oldW-newW)*fracX,panY:vs.panY+(oldH-newH)*fracY});
  }, []);
  useEffect(() => {
    const el=svgRef.current; if(!el) return;
    el.addEventListener('wheel',handleWheel,{passive:false});
    return ()=>el.removeEventListener('wheel',handleWheel);
  }, [handleWheel]);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e:KeyboardEvent) => {
      // Don't intercept when user is typing in an input/textarea
      const tag=(document.activeElement as HTMLElement)?.tagName;
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') {
        // Still allow Escape to blur the field
        if(e.key==='Escape')(document.activeElement as HTMLElement).blur();
        return;
      }
      if(e.code==='Space'&&!e.repeat){e.preventDefault();setSpaceDown(true);return;}
      if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();handleUndo();return;}
      if(e.key==='Escape'){setSelectedEl(null);return;}
      if(e.key==='r'||e.key==='R'){handleRotateSelected();return;}
      if(e.key==='f'||e.key==='F'){handleFlipSelected();return;}
      if((e.key==='Delete'||e.key==='Backspace')&&selectedEl){e.preventDefault();handleDeleteSelected();return;}
      if(!selectedEl) return;
      const step=e.shiftKey?nudgeStep.current*5:nudgeStep.current;
      let dx=0,dy=0;
      if(e.key==='ArrowUp')   dy=-step;
      if(e.key==='ArrowDown') dy= step;
      if(e.key==='ArrowLeft') dx=-step;
      if(e.key==='ArrowRight')dx= step;
      if(!dx&&!dy) return;
      e.preventDefault(); pushUndo();
      if(selectedEl.kind==='door')    setPlacedDoors(p    =>p.map(d=>d.id===selectedEl.id?{...d,x:d.x+dx,y:d.y+dy}:d));
        if(selectedEl.kind==='window')  setPlacedWindows(p  =>p.map(w=>w.id===selectedEl.id?{...w,x:w.x+dx,y:w.y+dy}:w));
      if(selectedEl.kind==='robe')    setPlacedRobes(p    =>p.map(r=>r.id===selectedEl.id?{...r,x:r.x+dx,y:r.y+dy}:r));
      if(selectedEl.kind==='kitchen') setPlacedKitchens(p =>p.map(k=>k.id===selectedEl.id?{...k,x:k.x+dx,y:k.y+dy}:k));
      if(selectedEl.kind==='bath')    setPlacedBaths(p    =>p.map(b=>b.id===selectedEl.id?{...b,x:b.x+dx,y:b.y+dy}:b));
      };
    const onKeyUp = (e:KeyboardEvent) => { if(e.code==='Space') setSpaceDown(false); };
    window.addEventListener('keydown',onKeyDown);
    window.addEventListener('keyup',onKeyUp);
    return ()=>{window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);};
  }, [selectedEl, handleRotateSelected, handleFlipSelected, handleDeleteSelected, handleUndo, pushUndo]);

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  const handleCanvasClick = useCallback((e:React.MouseEvent<SVGSVGElement>) => {
    if(wasDragged.current){wasDragged.current=false;return;}
    if(isPanningRef.current) return;
    const svgPt=screenToSvg(e.clientX,e.clientY); if(!svgPt) return;
    const cx=snap(svgPt.x),cy=snap(svgPt.y);

    if(activeTool==='select'){setSelectedEl(null);return;}

    if(activeTool==='door'){
      pushUndo(); const id=nextId.current++;
      setPlacedDoors(p=>[...p,{id,x:cx,y:cy,rotation:0,width:doorWidth,flipped:false,subtype:doorSubtype}]);
      setSelectedEl({kind:'door',id}); return;
    }
    if(activeTool==='window'){
      pushUndo(); const id=nextId.current++;
      setPlacedWindows(p=>[...p,{id,x:cx,y:cy,rotation:0,width:windowWidth,flipped:false}]);
      setSelectedEl({kind:'window',id}); return;
    }
    if(activeTool==='robe'){
      pushUndo(); const id=nextId.current++;
      setPlacedRobes(p=>[...p,{id,x:cx,y:cy,rotation:0,length:robeLength,width:robeFixedW,subtype:robeSubtype}]);
      setSelectedEl({kind:'robe',id}); return;
    }
    if(activeTool==='kitchen'){
      pushUndo(); const def=kitchenDefaults[kitchenSubtype]; const id=nextId.current++;
      setPlacedKitchens(p=>[...p,{id,x:cx,y:cy,rotation:0,subtype:kitchenSubtype,length:def.length,depth:def.depth}]);
      setSelectedEl({kind:'kitchen',id}); return;
    }
    if(activeTool==='bath'){
      pushUndo(); const def=bathDefaults[bathSubtype]; const id=nextId.current++;
      setPlacedBaths(p=>[...p,{id,x:cx,y:cy,rotation:0,subtype:bathSubtype,length:def.length,depth:def.depth}]);
      setSelectedEl({kind:'bath',id}); return;
    }
  }, [activeTool,doorWidth,doorSubtype,windowWidth,robeLength,robeFixedW,robeSubtype,kitchenSubtype,kitchenDefaults,bathSubtype,bathDefaults,snap,snapToAngle,pushUndo,screenToSvg,unitsPerMeter]);

  const handleElementClick = useCallback((e:React.MouseEvent,kind:ElementKind,id:number) => {
    e.stopPropagation();
    setSelectedEl({kind,id}); setActiveTool('select');
  }, [activeTool]);

  const handleSvgMouseDown = useCallback((e:React.MouseEvent<SVGSVGElement>) => {
    if(e.button===1||(e.button===0&&spaceDown)){
      e.preventDefault(); isPanningRef.current=true;
      const vs=viewStateRef.current;
      panStartRef.current={screenX:e.clientX,screenY:e.clientY,panX:vs.panX,panY:vs.panY};
      return;
    }
  }, [spaceDown, activeTool, screenToSvg, pushUndo]);

  const handleSvgMouseMove = useCallback((e:React.MouseEvent<SVGSVGElement>) => {
    const svgPt=screenToSvg(e.clientX,e.clientY);
    if(svgPt) setCursorPos({x:svgPt.x,y:svgPt.y});

    // Pan
    if(isPanningRef.current&&panStartRef.current){
      const el=svgRef.current; if(!el) return;
      const rect=el.getBoundingClientRect();
      const vs=viewStateRef.current,vb=svgViewBoxRef.current;
      const dispW=vb.w/vs.zoom,dispH=vb.h/vs.zoom;
      const dxSvg=-(e.clientX-panStartRef.current.screenX)*dispW/rect.width;
      const dySvg=-(e.clientY-panStartRef.current.screenY)*dispH/rect.height;
      setViewState(vs=>({...vs,panX:panStartRef.current!.panX+dxSvg,panY:panStartRef.current!.panY+dySvg}));
      return;
    }

    // MS Paint erase accumulate path

    // Element drag
    if(!activeDrag.current||!svgPt) return;
    wasDragged.current=true;
    const cx=svgPt.x,cy=svgPt.y,drag=activeDrag.current;
    if(drag.kind==='door')    setPlacedDoors(p    =>p.map(d=>d.id===drag.id?{...d,x:snap(cx-drag.ox),y:snap(cy-drag.oy)}:d));
    if(drag.kind==='window')  setPlacedWindows(p  =>p.map(w=>w.id===drag.id?{...w,x:snap(cx-drag.ox),y:snap(cy-drag.oy)}:w));
    if(drag.kind==='robe')    setPlacedRobes(p    =>p.map(r=>r.id===drag.id?{...r,x:snap(cx-drag.ox),y:snap(cy-drag.oy)}:r));
    if(drag.kind==='kitchen') setPlacedKitchens(p =>p.map(k=>k.id===drag.id?{...k,x:snap(cx-drag.ox),y:snap(cy-drag.oy)}:k));
    if(drag.kind==='bath')    setPlacedBaths(p    =>p.map(b=>b.id===drag.id?{...b,x:snap(cx-drag.ox),y:snap(cy-drag.oy)}:b));
  }, [screenToSvg, snap]);

  const handleSvgMouseUp = useCallback(() => {
    if(isPanningRef.current){isPanningRef.current=false;panStartRef.current=null;return;}
    activeDrag.current=null;
  }, []);

  // Drag start helpers
  const startDragDoor = useCallback((e:React.MouseEvent,id:number) => {
    e.stopPropagation();e.preventDefault();
    const svgPt=screenToSvg(e.clientX,e.clientY);if(!svgPt)return;
    const door=placedDoors.find(d=>d.id===id);if(!door)return;
    pushUndo();setSelectedEl({kind:'door',id});
    activeDrag.current={kind:'door',id,ox:svgPt.x-door.x,oy:svgPt.y-door.y};wasDragged.current=false;
  },[placedDoors,screenToSvg,pushUndo]);

  const startDragWindow = useCallback((e:React.MouseEvent,id:number) => {
    e.stopPropagation();e.preventDefault();
    const svgPt=screenToSvg(e.clientX,e.clientY);if(!svgPt)return;
    const win=placedWindows.find(w=>w.id===id);if(!win)return;
    pushUndo();setSelectedEl({kind:'window',id});
    activeDrag.current={kind:'window',id,ox:svgPt.x-win.x,oy:svgPt.y-win.y};wasDragged.current=false;
  },[placedWindows,screenToSvg,pushUndo]);

  const startDragRobe = useCallback((e:React.MouseEvent,id:number) => {
    e.stopPropagation();e.preventDefault();
    const svgPt=screenToSvg(e.clientX,e.clientY);if(!svgPt)return;
    const robe=placedRobes.find(r=>r.id===id);if(!robe)return;
    pushUndo();setSelectedEl({kind:'robe',id});
    activeDrag.current={kind:'robe',id,ox:svgPt.x-robe.x,oy:svgPt.y-robe.y};wasDragged.current=false;
  },[placedRobes,screenToSvg,pushUndo]);

  const startDragKitchen = useCallback((e:React.MouseEvent,id:number) => {
    e.stopPropagation();e.preventDefault();
    const svgPt=screenToSvg(e.clientX,e.clientY);if(!svgPt)return;
    const item=placedKitchens.find(k=>k.id===id);if(!item)return;
    pushUndo();setSelectedEl({kind:'kitchen',id});
    activeDrag.current={kind:'kitchen',id,ox:svgPt.x-item.x,oy:svgPt.y-item.y};wasDragged.current=false;
  },[placedKitchens,screenToSvg,pushUndo]);

  const startDragBath = useCallback((e:React.MouseEvent,id:number) => {
    e.stopPropagation();e.preventDefault();
    const svgPt=screenToSvg(e.clientX,e.clientY);if(!svgPt)return;
    const item=placedBaths.find(b=>b.id===id);if(!item)return;
    pushUndo();setSelectedEl({kind:'bath',id});
    activeDrag.current={kind:'bath',id,ox:svgPt.x-item.x,oy:svgPt.y-item.y};wasDragged.current=false;
  },[placedBaths,screenToSvg,pushUndo]);




  // Derived selected items
  const selectedDoor    = selectedEl?.kind==='door'    ? placedDoors.find(d=>d.id===selectedEl.id)    : null;
  const selectedWindow  = selectedEl?.kind==='window'  ? placedWindows.find(w=>w.id===selectedEl.id)  : null;
  const selectedRobe    = selectedEl?.kind==='robe'    ? placedRobes.find(r=>r.id===selectedEl.id)    : null;
  const selectedKitchen = selectedEl?.kind==='kitchen' ? placedKitchens.find(k=>k.id===selectedEl.id) : null;
  const selectedBath    = selectedEl?.kind==='bath'    ? placedBaths.find(b=>b.id===selectedEl.id)    : null;

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if(!svgContent) return;
    setIsSaving(true);
    try {
      const wch=wallClearHeight, sw=wallStroke;

      // Doors – swing or sliding cavity
      const doorsSvg=placedDoors.map(door=>{
        const w=door.width, st=door.subtype||'swing';
        let inner='';
        if(st==='swing'){
          inner=`<line x1="0" y1="0" x2="${w}" y2="0" stroke="#000000" stroke-width="${sw}"/>
    <path d="M ${w},0 A ${w},${w} 0 0,1 0,${-w}" fill="none" stroke="#000000" stroke-width="${sw*0.5}"/>
    <circle cx="0" cy="0" r="${sw}" fill="#000000"/>`;
        } else if(st==='sliding'){
          const blockW=wch, panelH=wch*0.35, panelW=w-blockW*0.4;
          const flip=door.flipped;
          const panelX=flip?blockW*0.4:-blockW*0.4;
          inner=`<rect x="0" y="${-wch/2}" width="${blockW}" height="${wch}" fill="#1a1a1a"/>
    <rect x="${w-blockW}" y="${-wch/2}" width="${blockW}" height="${wch}" fill="#1a1a1a"/>
    <rect x="${panelX}" y="${-panelH/2}" width="${panelW}" height="${panelH}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${sw*0.35}"/>`;
        } else {
          // entry – two solid jamb lines, wall thickness tall
          inner=`<line x1="0" y1="${-wch/2}" x2="0" y2="${wch/2}" stroke="#000000" stroke-width="${sw*0.9}" stroke-linecap="square"/>
    <line x1="${w}" y1="${-wch/2}" x2="${w}" y2="${wch/2}" stroke="#000000" stroke-width="${sw*0.9}" stroke-linecap="square"/>`;
        }
        return `<g transform="translate(${door.x},${door.y}) rotate(${door.rotation})" class="door-element" data-door-id="${door.id}">
  <g transform="${door.flipped?'scale(1,-1)':'scale(1,1)'}">
    <rect x="0" y="${-wch/2}" width="${w}" height="${wch}" fill="#FFFFFF" stroke="none"/>
    ${inner}
  </g>
</g>`;}).join('\n');

      // Walls – freehand erase uses stored points array
      const toWallPath=(wall:PlacedWall,isErase:boolean)=>{
        let d:string;
        if(isErase&&wall.points&&wall.points.length>=2) d=ptsToPath(wall.points);
        else if(wall.curved) d=`M ${wall.x1},${wall.y1} Q ${wall.cpx},${wall.cpy} ${wall.x2},${wall.y2}`;
        else d=`M ${wall.x1},${wall.y1} L ${wall.x2},${wall.y2}`;
        return `<path d="${d}" stroke="${isErase?'#FFFFFF':'#1a1a1a'}" stroke-width="${sw}" stroke-linecap="square" stroke-linejoin="miter" fill="none" class="wall-element" data-wall-id="${wall.id}"/>`;
      };
      const wallsSvg=[...placedWalls.filter(w=>!w.erase).map(w=>toWallPath(w,false)),...placedWalls.filter(w=>w.erase).map(w=>toWallPath(w,true))].join('\n');

      // Windows – flip in nested <g>
      const windowsSvg=placedWindows.map(win=>{
        const w=win.width,wt=wch,inset=Math.max(1.5,wt/7);
        return `<g transform="translate(${win.x},${win.y}) rotate(${win.rotation})" class="window-element" data-window-id="${win.id}">
  <g transform="${win.flipped?'scale(1,-1)':'scale(1,1)'}">
    <rect x="0" y="${-wt/2}" width="${w}" height="${wt}" fill="#FFFFFF" stroke="none"/>
    <line x1="0" y1="${-wt/2+inset}" x2="${w}" y2="${-wt/2+inset}" stroke="#1a1a1a" stroke-width="${sw*0.4}"/>
    <line x1="0" y1="${wt/2-inset}" x2="${w}" y2="${wt/2-inset}" stroke="#1a1a1a" stroke-width="${sw*0.4}"/>
  </g>
</g>`;}).join('\n');

      // Robes – simple rectangle: 3 sides at full wall stroke, front (bottom) side at 0.25x
      const robesSvg=placedRobes.map(robe=>{
        const rw=robe.width,rl=robe.length,st=robe.subtype||'straight';
        const tk=sw*0.5, tn=sw*0.12;
        let body='';
        if(st==='straight'){
          body=`<rect x="0" y="0" width="${rl}" height="${rw}" fill="#FFFFFF" stroke="none"/>
  <line x1="0" y1="0" x2="${rl}" y2="0" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>
  <line x1="0" y1="0" x2="0" y2="${rw}" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>
  <line x1="${rl}" y1="0" x2="${rl}" y2="${rw}" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>
  <line x1="0" y1="${rw}" x2="${rl}" y2="${rw}" stroke="#1a1a1a" stroke-width="${tn}" stroke-linecap="square"/>`;
        } else if(st==='lshape'){
          const bw=rl,bh=rw,sw2=rw,sh2=rl*0.5;
          body=`<rect x="0" y="0" width="${bw}" height="${bh}" fill="#FFFFFF" stroke="none"/>
  <rect x="${bw-sw2}" y="${bh}" width="${sw2}" height="${sh2}" fill="#FFFFFF" stroke="none"/>
  <line x1="0" y1="0" x2="${bw}" y2="0" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>
  <line x1="0" y1="0" x2="0" y2="${bh}" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>
  <line x1="0" y1="${bh}" x2="${bw-sw2}" y2="${bh}" stroke="#1a1a1a" stroke-width="${tn}" stroke-linecap="square"/>
  <line x1="${bw-sw2}" y1="${bh}" x2="${bw-sw2}" y2="${bh+sh2}" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>
  <line x1="${bw-sw2}" y1="${bh+sh2}" x2="${bw}" y2="${bh+sh2}" stroke="#1a1a1a" stroke-width="${tn}" stroke-linecap="square"/>
  <line x1="${bw}" y1="0" x2="${bw}" y2="${bh+sh2}" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>`;
        } else {
          const bw=rl,bh=rw,legL=rl*0.45;
          body=`<rect x="0" y="0" width="${bw}" height="${bh}" fill="#FFFFFF" stroke="none"/>
  <rect x="0" y="${bh}" width="${bh}" height="${legL}" fill="#FFFFFF" stroke="none"/>
  <rect x="${bw-bh}" y="${bh}" width="${bh}" height="${legL}" fill="#FFFFFF" stroke="none"/>
  <line x1="0" y1="0" x2="${bw}" y2="0" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>
  <line x1="0" y1="0" x2="0" y2="${bh+legL}" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>
  <line x1="0" y1="${bh+legL}" x2="${bh}" y2="${bh+legL}" stroke="#1a1a1a" stroke-width="${tn}" stroke-linecap="square"/>
  <line x1="${bh}" y1="${bh}" x2="${bh}" y2="${bh+legL}" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>
  <line x1="${bh}" y1="${bh}" x2="${bw-bh}" y2="${bh}" stroke="#1a1a1a" stroke-width="${tn}" stroke-linecap="square"/>
  <line x1="${bw-bh}" y1="${bh}" x2="${bw-bh}" y2="${bh+legL}" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>
  <line x1="${bw-bh}" y1="${bh+legL}" x2="${bw}" y2="${bh+legL}" stroke="#1a1a1a" stroke-width="${tn}" stroke-linecap="square"/>
  <line x1="${bw}" y1="0" x2="${bw}" y2="${bh+legL}" stroke="#1a1a1a" stroke-width="${tk}" stroke-linecap="square"/>`;
        }
        return `<g transform="translate(${robe.x},${robe.y}) rotate(${robe.rotation})" class="robe-element" data-robe-id="${robe.id}">
  ${body}
</g>`;
      }).join('\n');

      // Kitchen
      const kitchenSvg=placedKitchens.map(k=>{
        const{subtype,length:L,depth:D}=k;
        const kscale=0.5;
        const thin=sw*0.35*kscale,thick=sw*0.55*kscale;
        let inner='';
        if(subtype==='island'){inner=`<rect x="${D*0.12}" y="${D*0.12}" width="${L-D*0.24}" height="${D-D*0.24}" fill="none" stroke="#1a1a1a" stroke-width="${thin*0.6}" opacity="0.4"/>"`;}
        else if(subtype==='bench'){inner='';}
        else if(subtype==='fridge'){const r=Math.min(L,D)*0.08,fs=Math.min(L,D)*0.38;inner=`<rect x="0" y="0" width="${L}" height="${D}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${thick}" rx="${r}"/><text x="${L*0.5}" y="${D*0.5}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-family="Arial, sans-serif" font-weight="600" fill="#1a1a1a" letter-spacing="0.05em">FR</text>`;}
        else if(subtype==='sink'){const dbl=L>D*1.5,bw=dbl?L*0.42:L*0.72,bh=D*0.68,by2=D*0.16;
          inner=dbl?`<rect x="${L*0.04}" y="${by2}" width="${bw}" height="${bh}" fill="none" stroke="#1a1a1a" stroke-width="${thin}" rx="${thin}"/><rect x="${L*0.54}" y="${by2}" width="${bw}" height="${bh}" fill="none" stroke="#1a1a1a" stroke-width="${thin}" rx="${thin}"/><circle cx="${L*0.25}" cy="${D*0.5}" r="${thin*1.5}" fill="#1a1a1a"/><circle cx="${L*0.75}" cy="${D*0.5}" r="${thin*1.5}" fill="#1a1a1a"/>`:
            `<rect x="${(L-bw)/2}" y="${by2}" width="${bw}" height="${bh}" fill="none" stroke="#1a1a1a" stroke-width="${thin}" rx="${thin}"/><circle cx="${L/2}" cy="${D*0.5}" r="${thin*1.5}" fill="#1a1a1a"/>`;
          inner+=`<line x1="${L*0.45}" y1="${D*0.05}" x2="${L*0.55}" y2="${D*0.05}" stroke="#1a1a1a" stroke-width="${thin*1.2}" stroke-linecap="round"/><line x1="${L*0.5}" y1="${D*0.05}" x2="${L*0.5}" y2="${D*0.16}" stroke="#1a1a1a" stroke-width="${thin*0.8}"/>`;}
        else if(subtype==='cooktop'){const bxs=[L*0.25,L*0.75,L*0.25,L*0.75],bys=[D*0.28,D*0.28,D*0.72,D*0.72],r1=Math.min(L,D)*0.18,r2=r1*0.55;
          inner=bxs.map((bx,i)=>`<circle cx="${bx}" cy="${bys[i]}" r="${r1}" fill="none" stroke="#1a1a1a" stroke-width="${thin}"/><circle cx="${bx}" cy="${bys[i]}" r="${r2}" fill="none" stroke="#1a1a1a" stroke-width="${thin*0.6}"/><circle cx="${bx}" cy="${bys[i]}" r="${thin*0.9}" fill="#1a1a1a"/>`).join('');}
        else if(subtype==='dishwasher'){const fs=Math.min(L,D)*0.38;inner=`<text x="${L*0.5}" y="${D*0.5}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-family="Arial, sans-serif" font-weight="600" fill="#1a1a1a" letter-spacing="0.05em">DW</text>`;}
        else if(subtype==='washer'){const fs=Math.min(L,D)*0.38;inner=`<text x="${L*0.5}" y="${D*0.5}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-family="Arial, sans-serif" font-weight="600" fill="#1a1a1a" letter-spacing="0.05em">WR</text>`;}
        return `<g transform="translate(${k.x},${k.y}) rotate(${k.rotation})" class="kitchen-element" data-kitchen-id="${k.id}" data-subtype="${subtype}">
  <rect x="0" y="0" width="${L}" height="${D}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${thick}"/>
  ${inner}
</g>`;}).join('\n');

      // Baths
      const bathSvg=placedBaths.map(b=>{
        const{subtype,length:L,depth:D}=b;
        const t=sw*0.25;
        let inner='';
        if(subtype==='bathtub'){
          const r=Math.min(L,D)*0.5,pad=Math.min(L,D)*0.08,ri=Math.min(L-pad*2,D-pad*2)*0.5;
          inner=`<rect x="${pad}" y="${pad}" width="${L-pad*2}" height="${D-pad*2}" rx="${ri}" ry="${ri}" fill="none" stroke="#1a1a1a" stroke-width="${t}"/>`;
        } else if(subtype==='shower'){
          inner=`<line x1="${L*0.5-t*2}" y1="${D*0.5}" x2="${L*0.5+t*2}" y2="${D*0.5}" stroke="#1a1a1a" stroke-width="${t}"/><line x1="${L*0.5}" y1="${D*0.5-t*2}" x2="${L*0.5}" y2="${D*0.5+t*2}" stroke="#1a1a1a" stroke-width="${t}"/><circle cx="${L*0.5}" cy="${D*0.5}" r="${t*3}" fill="none" stroke="#1a1a1a" stroke-width="${t*0.6}"/>`;
        } else if(subtype==='vanity'){
          const bw=Math.min(L*0.55,D*0.75),bh=Math.min(D*0.65,L*0.65);
          inner=`<ellipse cx="${L/2}" cy="${D/2}" rx="${bw/2}" ry="${bh/2}" fill="none" stroke="#1a1a1a" stroke-width="${t}"/><circle cx="${L/2}" cy="${D*0.42}" r="${t*1.2}" fill="#1a1a1a"/>`;
        } else if(subtype==='basin'){
          const bw=L*0.72,bh=D*0.68;
          inner=`<ellipse cx="${L/2}" cy="${D*0.55}" rx="${bw/2}" ry="${bh/2}" fill="none" stroke="#1a1a1a" stroke-width="${t}"/><circle cx="${L/2}" cy="${D*0.22}" r="${t*1.2}" fill="#1a1a1a"/><line x1="${L*0.38}" y1="${D*0.22}" x2="${L*0.62}" y2="${D*0.22}" stroke="#1a1a1a" stroke-width="${t*1.2}" stroke-linecap="round"/>`;
        } else if(subtype==='toilet'){
          const cisH=D*0.3,bowlH=D-cisH,bowlR=Math.min(L,bowlH)*0.48;
          inner=`<rect x="0" y="0" width="${L}" height="${cisH}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${t*1.5}"/><rect x="0" y="${cisH}" width="${L}" height="${bowlH}" rx="${bowlR}" ry="${bowlR}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${t*1.5}"/><circle cx="${L/2}" cy="${cisH*0.5}" r="${t*1.8}" fill="#1a1a1a"/>`;
          return `<g transform="translate(${b.x},${b.y}) rotate(${b.rotation})" class="bath-element" data-bath-id="${b.id}" data-subtype="${subtype}">${inner}</g>`;
        }
        return `<g transform="translate(${b.x},${b.y}) rotate(${b.rotation})" class="bath-element" data-bath-id="${b.id}" data-subtype="${subtype}">
  <rect x="0" y="0" width="${L}" height="${D}" rx="${subtype==='bathtub'?Math.min(L,D)*0.5:0}" ry="${subtype==='bathtub'?Math.min(L,D)*0.5:0}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${t*1.5}"/>
  ${inner}
</g>`;
      }).join('\n');

      let modifiedSvg=svgContent
        .replace(/<g\s+id="doors-layer"[\s\S]*?<\/g>\s*/g,'')
        .replace(/<g\s+id="windows-layer"[\s\S]*?<\/g>\s*/g,'')
        .replace(/<g\s+id="robes-layer"[\s\S]*?<\/g>\s*/g,'')
        .replace(/<g\s+id="kitchen-layer"[\s\S]*?<\/g>\s*/g,'')
        .replace(/<g\s+id="bath-layer"[\s\S]*?<\/g>\s*/g,'');

      modifiedSvg=modifiedSvg.replace('</svg>',
        `<g id="windows-layer">\n${windowsSvg}\n</g>\n`+
        `<g id="robes-layer">\n${robesSvg}\n</g>\n`+
        `<g id="kitchen-layer">\n${kitchenSvg}\n</g>\n`+
        `<g id="bath-layer">\n${bathSvg}\n</g>\n`+
        `<g id="doors-layer">\n${doorsSvg}\n</g>\n</svg>`);

      const token=localStorage.getItem('auth_token')||localStorage.getItem('access_token');
      const API_URL=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000';
      const res=await fetch(`${API_URL}/api/v1/plans/${projectId}/plans/${planId}/save-svg`,{
        method:'PUT',
        headers:{'Content-Type':'application/json',...(token&&{Authorization:`Bearer ${token}`})},
        body:JSON.stringify({svg_content:modifiedSvg,doors:placedDoors,windows:placedWindows,robes:placedRobes,kitchens:placedKitchens,baths:placedBaths}),
      });
      if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.detail||'Save failed');}
      const result=await res.json();
      showToast('Floor plan saved!','success');
      onSave({previewImageUrl:result.preview_image_url,doors:placedDoors,windows:placedWindows,robes:placedRobes,kitchens:placedKitchens,baths:placedBaths,updatedAt:new Date().toISOString()});
    } catch(err:any) {
      console.error('SvgEditor save failed:',err);
      showToast(err?.message||'Failed to save. Please try again.','error');
    } finally { setIsSaving(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3"/>
        <p className="text-gray-400 text-sm">Loading editor…</p>
      </div>
    </div>
  );

  const cursorStyle =
    isPanningRef.current      ? 'grabbing' :
    spaceDown                 ? 'grab' :
    activeDrag.current        ? 'grabbing' :
    activeTool==='door'||activeTool==='window'||activeTool==='robe'||activeTool==='kitchen'||activeTool==='bath' ? 'crosshair' :
    'default';

  const totalElements=placedDoors.length+placedWindows.length+placedRobes.length+placedKitchens.length+placedBaths.length;

  const toolBtn=(tool:ActiveTool,label:string,Icon:React.ElementType,color:string)=>{
    const active=activeTool===tool;
    return (
      <button key={tool}
        onClick={()=>{setActiveTool(tool);if(tool!=='select')setSelectedEl(null);}}
        className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg text-xs font-medium transition ${active?`${color} text-white`:'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'}`}>
        <Icon className="w-3.5 h-3.5 flex-shrink-0"/><span>{label}</span>
      </button>
    );
  };

  return (
    <>
      {/* Toast */}
      {toast&&(
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium pointer-events-none ${toast.type==='success'?'bg-green-600 text-white':'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* LEFT: Canvas */}
      <div className="w-full lg:w-[60%] p-3 sm:p-4 lg:p-6 flex flex-col overflow-visible lg:overflow-hidden min-h-[300px] sm:min-h-[400px] relative">
        {/* Zoom/snap toolbar */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <button onClick={()=>zoomStep(1.25)} title="Zoom in"   className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 transition"><ZoomIn  className="w-3.5 h-3.5"/></button>
          <button onClick={()=>zoomStep(0.8)}  title="Zoom out"  className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 transition"><ZoomOut className="w-3.5 h-3.5"/></button>
          <button onClick={resetView}           title="Reset view" className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 transition"><Maximize2 className="w-3.5 h-3.5"/></button>
          <span className="text-gray-500 text-[10px] font-mono w-8 text-right">{Math.round(viewState.zoom*100)}%</span>
          <div className="w-px h-4 bg-white/10 mx-1"/>
          <button onClick={()=>setSnapEnabled(p=>!p)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition ${snapEnabled?'bg-indigo-500/20 border-indigo-500/40 text-indigo-300':'bg-white/5 border-white/10 text-gray-500'}`}
            title="Toggle 100mm grid snap">
            <Grid className="w-3 h-3"/>Snap {snapEnabled?'ON':'OFF'}
          </button>
          <span className="text-gray-600 text-[10px] ml-1 hidden sm:block">Scroll=zoom · Space+drag=pan · Shift=angle snap</span>
        </div>

        <div className="flex-1 bg-white rounded-xl shadow-xl overflow-hidden relative select-none">
          <svg
            ref={svgRef}
            viewBox={`${svgViewBox.x+viewState.panX} ${svgViewBox.y+viewState.panY} ${svgViewBox.w/viewState.zoom} ${svgViewBox.h/viewState.zoom}`}
            className="w-full h-full"
            style={{cursor:cursorStyle}}
            onClick={handleCanvasClick}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
            preserveAspectRatio="xMidYMid meet"
            tabIndex={0}
          >
            {/* Original floor plan */}
            <g ref={svgContentGroupRef}/>

            {/* Robes overlay */}
            <g id="robes-overlay">
              {placedRobes.map(robe=>{
                const rl=robe.length,rw=robe.width,sel=selectedEl?.kind==='robe'&&selectedEl.id===robe.id;
                const st=robe.subtype||'straight';
                const tk=sel?1.5:wallStroke*0.5, tn=sel?0.4:wallStroke*0.12;
                const sc=sel?'#2563eb':'#1a1a1a';
                // arm2 = perpendicular arm depth for L/U shapes
                const arm=rw; // same depth as main width
                const arm2L=rl*0.5; // L side arm length
                return (
                  <g key={robe.id} transform={`translate(${robe.x},${robe.y}) rotate(${robe.rotation})`}
                    onClick={e=>handleElementClick(e,'robe',robe.id)}
                    onMouseDown={e=>{if(activeTool==='select')startDragRobe(e,robe.id);}}
                    style={{cursor:sel?'grab':'pointer'}}>

                  {st==='straight'&&<>
                    {sel&&<rect x={-4} y={-4} width={rl+8} height={rw+8} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5,3" rx={2}/>}
                    <rect x={0} y={0} width={rl} height={rw} fill="#FFFFFF" stroke="none"/>
                    <line x1={0}  y1={0}  x2={rl} y2={0}  stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                    <line x1={0}  y1={0}  x2={0}  y2={rw} stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                    <line x1={rl} y1={0}  x2={rl} y2={rw} stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                    <line x1={0}  y1={rw} x2={rl} y2={rw} stroke={sc} strokeWidth={tn} strokeLinecap="square"/>
                  </>}

                  {st==='lshape'&&(()=>{
                    // Main arm: top (rl × rw). Side arm: right side going down (rw × arm2L)
                    const bw=rl, bh=rw, sw2=rw, sh2=arm2L;
                    return (<>
                      {sel&&<rect x={-4} y={-4} width={bw+8} height={bh+sh2+8} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5,3" rx={2}/>}
                      {/* White fill for both arms */}
                      <rect x={0}      y={0}   width={bw}  height={bh}  fill="#FFFFFF" stroke="none"/>
                      <rect x={bw-sw2} y={bh}  width={sw2} height={sh2} fill="#FFFFFF" stroke="none"/>
                      {/* Outline – L-shape path, opening at bottom of main arm and bottom of side arm */}
                      {/* top rail */}
                      <line x1={0} y1={0} x2={bw} y2={0} stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                      {/* left side – full height of main arm */}
                      <line x1={0} y1={0} x2={0} y2={bh} stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                      {/* bottom of main arm – up to side arm */}
                      <line x1={0} y1={bh} x2={bw-sw2} y2={bh} stroke={sc} strokeWidth={tn} strokeLinecap="square"/>
                      {/* inner vertical – left side of side arm */}
                      <line x1={bw-sw2} y1={bh} x2={bw-sw2} y2={bh+sh2} stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                      {/* bottom of side arm – opening */}
                      <line x1={bw-sw2} y1={bh+sh2} x2={bw} y2={bh+sh2} stroke={sc} strokeWidth={tn} strokeLinecap="square"/>
                      {/* right side – full height */}
                      <line x1={bw} y1={0} x2={bw} y2={bh+sh2} stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                    </>);
                  })()}

                  {st==='ushape'&&(()=>{
                    // U: back rail (top, rl wide), two side arms going down (rw wide × rl*0.45 long)
                    const bw=rl, bh=rw, legL=rl*0.45, gap=bw-2*bh;
                    return (<>
                      {sel&&<rect x={-4} y={-4} width={bw+8} height={bh+legL+8} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5,3" rx={2}/>}
                      {/* White fills */}
                      <rect x={0}      y={0}    width={bw} height={bh}   fill="#FFFFFF" stroke="none"/>
                      <rect x={0}      y={bh}   width={bh} height={legL} fill="#FFFFFF" stroke="none"/>
                      <rect x={bw-bh}  y={bh}   width={bh} height={legL} fill="#FFFFFF" stroke="none"/>
                      {/* Back rail top */}
                      <line x1={0}    y1={0}       x2={bw}    y2={0}       stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                      {/* Left outer */}
                      <line x1={0}    y1={0}       x2={0}     y2={bh+legL} stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                      {/* Left leg bottom – opening */}
                      <line x1={0}    y1={bh+legL} x2={bh}    y2={bh+legL} stroke={sc} strokeWidth={tn} strokeLinecap="square"/>
                      {/* Left inner */}
                      <line x1={bh}   y1={bh}      x2={bh}    y2={bh+legL} stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                      {/* Opening between legs (bottom of back) */}
                      <line x1={bh}   y1={bh}      x2={bw-bh} y2={bh}      stroke={sc} strokeWidth={tn} strokeLinecap="square"/>
                      {/* Right inner */}
                      <line x1={bw-bh} y1={bh}     x2={bw-bh} y2={bh+legL} stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                      {/* Right leg bottom – opening */}
                      <line x1={bw-bh} y1={bh+legL} x2={bw}  y2={bh+legL} stroke={sc} strokeWidth={tn} strokeLinecap="square"/>
                      {/* Right outer */}
                      <line x1={bw}   y1={0}       x2={bw}    y2={bh+legL} stroke={sc} strokeWidth={tk} strokeLinecap="square"/>
                    </>);
                  })()}
                  </g>
                );
              })}
            </g>

            {/* Kitchen overlay */}
            <g id="kitchen-overlay">
              {placedKitchens.map(item=>{
                const sel=selectedEl?.kind==='kitchen'&&selectedEl.id===item.id;
                return (
                  <g key={item.id} transform={`translate(${item.x},${item.y}) rotate(${item.rotation})`}
                    onClick={e=>handleElementClick(e,'kitchen',item.id)}
                    onMouseDown={e=>{if(activeTool==='select')startDragKitchen(e,item.id);}}
                    style={{cursor:sel?'grab':'pointer'}}>
                    {sel&&<rect x={-5} y={-5} width={item.length+10} height={item.depth+10} fill="rgba(59,130,246,0.06)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6,3" rx={3}/>}
                    <KitchenSymbol item={item} sw={wallStroke} sel={sel}/>
                  </g>
                );
              })}
            </g>

            {/* Bath overlay */}
            <g id="bath-overlay">
              {placedBaths.map(item=>{
                const sel=selectedEl?.kind==='bath'&&selectedEl.id===item.id;
                return (
                  <g key={item.id} transform={`translate(${item.x},${item.y}) rotate(${item.rotation})`}
                    onClick={e=>handleElementClick(e,'bath',item.id)}
                    onMouseDown={e=>{if(activeTool==='select')startDragBath(e,item.id);}}
                    style={{cursor:sel?'grab':'pointer'}}>
                    {sel&&<rect x={-5} y={-5} width={item.length+10} height={item.depth+10} fill="rgba(59,130,246,0.06)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6,3" rx={3}/>}
                    <BathSymbol item={item} sw={wallStroke} sel={sel}/>
                  </g>
                );
              })}
            </g>

            {/* Doors overlay */}
            <g id="doors-overlay">
              {placedDoors.map(door=>{
                const w=door.width,wch=wallClearHeight,sel=selectedEl?.kind==='door'&&selectedEl.id===door.id;
                const st=door.subtype||'swing';
                const sc=sel?'#2563eb':'#000';
                return (
                  <g key={door.id} transform={`translate(${door.x},${door.y}) rotate(${door.rotation})`}
                    onClick={e=>handleElementClick(e,'door',door.id)}
                    onMouseDown={e=>{if(activeTool==='select')startDragDoor(e,door.id);}}
                    style={{cursor:sel?'grab':'pointer'}}>
                    <g transform={door.flipped?'scale(1,-1)':''}>
                      {/* Wall clear */}
                      <rect x={0} y={-wch/2} width={w} height={wch} fill="#FFFFFF" stroke="none"/>
                      {st==='swing' && <>
                        {sel&&<rect x={-6} y={-w-6} width={w+12} height={w+12} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6,3" rx={3}/>}
                        <line x1={0} y1={0} x2={w} y2={0} stroke={sc} strokeWidth={sel?1.5:1}/>
                        <path d={`M ${w},0 A ${w},${w} 0 0,0 0,${-w}`} fill="none" stroke={sc} strokeWidth={sel?1:0.5} strokeDasharray="4,3"/>
                        <circle cx={0} cy={0} r={sel?3:1.5} fill={sc}/>
                      </>}
                      {st==='sliding' && (()=>{
                        const blockW=wch;
                        const panelH=wch*0.35;
                        const panelW=w-blockW*0.4;
                        const flip=door.flipped;
                        const panelX=flip ? blockW*0.4 : -blockW*0.4;
                        return (<>
                          {sel&&<rect x={-6} y={-wch/2-6} width={w+12} height={wch+12} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6,3" rx={3}/>}
                          {/* Left wall block */}
                          <rect x={0} y={-wch/2} width={blockW} height={wch} fill={sc}/>
                          {/* Right wall block */}
                          <rect x={w-blockW} y={-wch/2} width={blockW} height={wch} fill={sc}/>
                          {/* Door panel — thin, slid to one side */}
                          <rect x={panelX} y={-panelH/2} width={panelW} height={panelH}
                            fill="#FFFFFF" stroke={sc} strokeWidth={wallStroke*0.35}/>
                        </>);
                      })()}
                      {st==='entry' && (()=>{
                        return (<>
                          {sel&&<rect x={-6} y={-wch/2-6} width={w+12} height={wch+12} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6,3" rx={3}/>}
                          {/* Two solid jamb lines — wall thickness tall */}
                          <line x1={0} y1={-wch/2} x2={0} y2={wch/2} stroke={sc} strokeWidth={wallStroke*0.9} strokeLinecap="square"/>
                          <line x1={w} y1={-wch/2} x2={w} y2={wch/2} stroke={sc} strokeWidth={wallStroke*0.9} strokeLinecap="square"/>
                        </>);
                      })()}
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Canvas hints */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full pointer-events-none whitespace-nowrap">
              {activeTool==='door'    && 'Click on the plan to place a door'}
              {activeTool==='window'  && 'Click to place a window'}
              {activeTool==='robe'    && 'Click to place a built-in robe'}
              {activeTool==='kitchen' && `Click to place ${kitchenSubtype}`}
              {activeTool==='bath'    && `Click to place ${bathSubtype}`}
            </div>
        </div>

        {/* Horizontal scrollbar – visible only when zoomed in */}
        {viewState.zoom > 1 && (
          <div className="flex items-center gap-1 mt-1.5 px-1">
            <span className="text-gray-600 text-[10px] w-3">←</span>
            <input
              type="range"
              min={0}
              max={svgViewBox.w * (1 - 1 / viewState.zoom)}
              step={svgViewBox.w / 1000}
              value={Math.max(0, Math.min(viewState.panX, svgViewBox.w * (1 - 1 / viewState.zoom)))}
              onChange={e => setViewState(vs => ({ ...vs, panX: +e.target.value }))}
              className="flex-1 h-1.5 accent-indigo-400"
              style={{ cursor: 'ew-resize' }}
            />
            <span className="text-gray-600 text-[10px] w-3">→</span>
          </div>
        )}

        {/* Vertical scrollbar */}
        {viewState.zoom > 1 && (
          <div className="flex items-center gap-1 absolute right-2 top-10 bottom-2" style={{ flexDirection: 'column' }}>
            <span className="text-gray-600 text-[10px]">↑</span>
            <input
              type="range"
              min={0}
              max={svgViewBox.h * (1 - 1 / viewState.zoom)}
              step={svgViewBox.h / 1000}
              value={Math.max(0, Math.min(viewState.panY, svgViewBox.h * (1 - 1 / viewState.zoom)))}
              onChange={e => setViewState(vs => ({ ...vs, panY: +e.target.value }))}
              className="flex-1 accent-indigo-400"
              style={{ writingMode: 'vertical-lr', direction: 'rtl', cursor: 'ns-resize', width: '6px' }}
            />
            <span className="text-gray-600 text-[10px]">↓</span>
          </div>
        )}
      </div>

      {/* RIGHT: Controls */}
      <div className="w-full lg:w-[40%] p-3 sm:p-4 lg:p-6 border-t lg:border-t-0 lg:border-l border-white/10 overflow-y-auto">
        <div className="space-y-4">

          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2 text-sm sm:text-base">
              <Pencil className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400"/>Floor Plan Editor
            </h3>
            <button onClick={onCancel} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs transition">
              <ArrowLeft className="w-3.5 h-3.5"/>Back
            </button>
          </div>

          {/* Tools */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Tools</h4>
            <div className="grid grid-cols-3 gap-2">
              {toolBtn('select','Select',MousePointer,'bg-slate-600')}
              {toolBtn('door','Door',DoorOpen,'bg-blue-600')}
              {toolBtn('window','Window',Square,'bg-cyan-600')}
              {toolBtn('robe','Robe',Columns,'bg-amber-600')}
              {toolBtn('kitchen','Kitchen',UtensilsCrossed,'bg-orange-600')}
              {toolBtn('bath','Bath',Square,'bg-teal-600')}
            </div>


            {/* Door sub-palette */}
            {activeTool==='door'&&(
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-gray-500 text-[10px] mb-2 uppercase tracking-wider">Door type</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['swing','sliding','entry'] as const).map(st=>(
                    <button key={st} onClick={()=>setDoorSubtype(st)}
                      className={`px-2 py-1.5 rounded-md text-[11px] font-medium capitalize transition border ${doorSubtype===st?'bg-blue-600 border-blue-500 text-white':'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'}`}>
                      {st==='swing'?'Swing':st==='sliding'?'Sliding Cavity':'Open Entry'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bath sub-palette */}
            {activeTool==='bath'&&(
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-gray-500 text-[10px] mb-2 uppercase tracking-wider">Item to place</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['bathtub','shower','vanity','basin','toilet'] as BathSubtype[]).map(st=>(
                    <button key={st} onClick={()=>setBathSubtype(st)}
                      className={`px-2 py-1.5 rounded-md text-[11px] font-medium capitalize transition border ${bathSubtype===st?'bg-teal-600 border-teal-500 text-white':'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'}`}>
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Robe sub-palette */}
            {activeTool==='robe'&&(
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-gray-500 text-[10px] mb-2 uppercase tracking-wider">Shape</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['straight','lshape','ushape'] as RobeSubtype[]).map(st=>(
                    <button key={st} onClick={()=>setRobeSubtype(st)}
                      className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition border ${robeSubtype===st?'bg-amber-600 border-amber-500 text-white':'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'}`}>
                      {st==='straight'?'Straight':st==='lshape'?'L-Shape':'U-Shape'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Kitchen sub-palette */}
            {activeTool==='kitchen'&&(
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-gray-500 text-[10px] mb-2 uppercase tracking-wider">Item to place</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['island','bench','fridge','sink','cooktop','dishwasher','washer'] as KitchenSubtype[]).map(st=>(
                    <button key={st} onClick={()=>setKitchenSubtype(st)}
                      className={`px-2 py-1.5 rounded-md text-[11px] font-medium capitalize transition border ${kitchenSubtype===st?'bg-orange-600 border-orange-500 text-white':'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'}`}>
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Actions</h4>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handleRotateSelected} disabled={!selectedEl}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white"
                title="Rotate 90° (R)"><RotateCw className="w-4 h-4"/><span className="text-xs">Rotate</span></button>
              <button onClick={handleFlipSelected} disabled={!selectedEl||(selectedEl.kind!=='door'&&selectedEl.kind!=='window')}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-blue-500/10 hover:border-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-blue-400"
                title="Flip (F)"><FlipHorizontal2 className="w-4 h-4"/><span className="text-xs">Flip</span></button>
              <button onClick={handleDeleteSelected} disabled={!selectedEl}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-red-400"
                title="Delete (Del)"><Trash2 className="w-4 h-4"/><span className="text-xs">Delete</span></button>
            </div>
            <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-500 text-[10px]">
                <Move className="w-3 h-3"/>
                <span>Arrows nudge · Shift×5 · R rotate · F flip · Del</span>
              </div>
              <button onClick={handleUndo} disabled={undoDepth===0}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white"
                title="Undo (Ctrl+Z)">
                <Undo2 className="w-3 h-3"/>Undo {undoDepth>0&&<span className="text-gray-600 ml-0.5">({undoDepth})</span>}
              </button>
            </div>
          </div>

          {/* Properties */}
          {selectedEl&&(
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Properties</h4>

              {/* Inputs are UNCONTROLLED. key resets field when selection changes.
                  Commits only on blur or Enter — user can type freely. */}
              {selectedDoor&&(()=>{
                const commit=(field:'width'|'rotation',raw:string)=>{
                  const v=parseInt(raw,10); if(isNaN(v)) return; pushUndo();
                  if(field==='rotation') setPlacedDoors(p=>p.map(d=>d.id===selectedDoor.id?{...d,rotation:((v%360)+360)%360}:d));
                  if(field==='width')    setPlacedDoors(p=>p.map(d=>d.id===selectedDoor.id?{...d,width:Math.max(0.001, v/1000*unitsPerMeter)}:d));
                };
                const kd=(e:React.KeyboardEvent<HTMLInputElement>)=>{ if(e.key==='Enter') e.currentTarget.blur(); };
                return (
                  <div className="space-y-2">
                    <PropRow label="Rotation" unit="°">
                      <input type="text" inputMode="numeric" defaultValue={selectedDoor.rotation}
                        key={`door-rot-${selectedDoor.id}`}
                        onBlur={e=>commit('rotation',e.target.value)} onKeyDown={kd}
                        className="w-16 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                    </PropRow>
                    <PropRow label="Width" unit="mm">
                      <input type="text" inputMode="numeric" defaultValue={Math.round(selectedDoor.width/unitsPerMeter*1000)}
                        key={`door-w-${selectedDoor.id}`}
                        onBlur={e=>commit('width',e.target.value)} onKeyDown={kd}
                        className="w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                    </PropRow>
                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <span className="text-gray-400">Type</span>
                      <div className="flex gap-1">
                        {(['swing','sliding','entry'] as const).map(st=>(
                          <button key={st} onClick={()=>{pushUndo();setPlacedDoors(p=>p.map(d=>d.id===selectedDoor.id?{...d,subtype:st}:d));}}
                            className={`px-1.5 py-0.5 rounded text-[10px] capitalize border transition ${(selectedDoor.subtype||'swing')===st?'bg-blue-600 border-blue-500 text-white':'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                            {st==='swing'?'Swing':st==='sliding'?'Cavity':'Entry'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <span className="text-gray-400">Flipped</span>
                      <span className={`font-mono ${selectedDoor.flipped?'text-blue-400':'text-gray-500'}`}>{selectedDoor.flipped?'Yes':'No'}</span>
                    </div>
                  </div>
                );
              })()}


              {selectedWindow&&(()=>{
                const commit=(field:'width'|'rotation',raw:string)=>{
                  const v=parseInt(raw,10); if(isNaN(v)) return; pushUndo();
                  if(field==='rotation') setPlacedWindows(p=>p.map(w=>w.id===selectedWindow.id?{...w,rotation:((v%360)+360)%360}:w));
                  if(field==='width')    setPlacedWindows(p=>p.map(w=>w.id===selectedWindow.id?{...w,width:Math.max(0.001, v/1000*unitsPerMeter)}:w));
                };
                const kd=(e:React.KeyboardEvent<HTMLInputElement>)=>{ if(e.key==='Enter') e.currentTarget.blur(); };
                return (
                  <div className="space-y-2">
                    <PropRow label="Rotation" unit="°">
                      <input type="text" inputMode="numeric" defaultValue={selectedWindow.rotation}
                        key={`win-rot-${selectedWindow.id}`}
                        onBlur={e=>commit('rotation',e.target.value)} onKeyDown={kd}
                        className="w-16 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                    </PropRow>
                    <PropRow label="Width" unit="mm">
                      <input type="text" inputMode="numeric" defaultValue={Math.round(selectedWindow.width/unitsPerMeter*1000)}
                        key={`win-w-${selectedWindow.id}`}
                        onBlur={e=>commit('width',e.target.value)} onKeyDown={kd}
                        className="w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                    </PropRow>
                  </div>
                );
              })()}

              {selectedRobe&&(()=>{
                const commit=(field:'length'|'width'|'rotation',raw:string)=>{
                  const v=parseInt(raw,10); if(isNaN(v)) return; pushUndo();
                  if(field==='rotation') setPlacedRobes(p=>p.map(r=>r.id===selectedRobe.id?{...r,rotation:((v%360)+360)%360}:r));
                  if(field==='length')   setPlacedRobes(p=>p.map(r=>r.id===selectedRobe.id?{...r,length:Math.max(0.001, v/1000*unitsPerMeter)}:r));
                  if(field==='width')    setPlacedRobes(p=>p.map(r=>r.id===selectedRobe.id?{...r,width:Math.max(0.001, v/1000*unitsPerMeter)}:r));
                };
                const kd=(e:React.KeyboardEvent<HTMLInputElement>)=>{ if(e.key==='Enter') e.currentTarget.blur(); };
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs pb-1">
                      <span className="text-gray-400">Shape</span>
                      <div className="flex gap-1">
                        {(['straight','lshape','ushape'] as RobeSubtype[]).map(st=>(
                          <button key={st} onClick={()=>{pushUndo();setPlacedRobes(p=>p.map(r=>r.id===selectedRobe.id?{...r,subtype:st}:r));}}
                            className={`px-1.5 py-0.5 rounded text-[10px] border transition ${(selectedRobe.subtype||'straight')===st?'bg-amber-600 border-amber-500 text-white':'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                            {st==='straight'?'S':st==='lshape'?'L':'U'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <PropRow label="Rotation" unit="°">
                      <input type="text" inputMode="numeric" defaultValue={selectedRobe.rotation}
                        key={`robe-rot-${selectedRobe.id}`}
                        onBlur={e=>commit('rotation',e.target.value)} onKeyDown={kd}
                        className="w-16 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                    </PropRow>
                    <PropRow label="Length" unit="mm">
                      <input type="text" inputMode="numeric" defaultValue={Math.round(selectedRobe.length/unitsPerMeter*1000)}
                        key={`robe-len-${selectedRobe.id}`}
                        onBlur={e=>commit('length',e.target.value)} onKeyDown={kd}
                        className="w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                    </PropRow>
                    <PropRow label="Width" unit="mm">
                      <input type="text" inputMode="numeric" defaultValue={Math.round(selectedRobe.width/unitsPerMeter*1000)}
                        key={`robe-wid-${selectedRobe.id}`}
                        onBlur={e=>commit('width',e.target.value)} onKeyDown={kd}
                        className="w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                    </PropRow>
                  </div>
                );
              })()}

              {selectedKitchen&&(()=>{
                const commit=(field:'length'|'depth'|'rotation',raw:string)=>{
                  const v=parseInt(raw,10); if(isNaN(v)) return; pushUndo();
                  if(field==='rotation') setPlacedKitchens(p=>p.map(k=>k.id===selectedKitchen.id?{...k,rotation:((v%360)+360)%360}:k));
                  if(field==='length')   setPlacedKitchens(p=>p.map(k=>k.id===selectedKitchen.id?{...k,length:Math.max(0.001, v/1000*unitsPerMeter)}:k));
                  if(field==='depth')    setPlacedKitchens(p=>p.map(k=>k.id===selectedKitchen.id?{...k,depth:Math.max(0.001, v/1000*unitsPerMeter)}:k));
                };
                const kd=(e:React.KeyboardEvent<HTMLInputElement>)=>{ if(e.key==='Enter') e.currentTarget.blur(); };
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Type</span>
                      <span className="font-mono text-white capitalize">{selectedKitchen.subtype}</span>
                    </div>
                    <PropRow label="Rotation" unit="°">
                      <input type="text" inputMode="numeric" defaultValue={selectedKitchen.rotation}
                        key={`kit-rot-${selectedKitchen.id}`}
                        onBlur={e=>commit('rotation',e.target.value)} onKeyDown={kd}
                        className="w-16 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                    </PropRow>
                    <PropRow label="Length" unit="mm">
                      <input type="text" inputMode="numeric" defaultValue={Math.round(selectedKitchen.length/unitsPerMeter*1000)}
                        key={`kit-len-${selectedKitchen.id}`}
                        onBlur={e=>commit('length',e.target.value)} onKeyDown={kd}
                        className="w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                    </PropRow>
                    <PropRow label="Depth" unit="mm">
                      <input type="text" inputMode="numeric" defaultValue={Math.round(selectedKitchen.depth/unitsPerMeter*1000)}
                        key={`kit-dep-${selectedKitchen.id}`}
                        onBlur={e=>commit('depth',e.target.value)} onKeyDown={kd}
                        className="w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                    </PropRow>
                  </div>
                );
              })()}
              {selectedBath&&(()=>{
                const mmLen=Math.round(selectedBath.length/unitsPerMeter*1000);
                const mmDep=Math.round(selectedBath.depth/unitsPerMeter*1000);
                const commit=(field:'rotation'|'length'|'depth',raw:string)=>{
                  const v=parseInt(raw,10); if(isNaN(v)) return; pushUndo();
                  if(field==='rotation') setPlacedBaths(p=>p.map(b=>b.id===selectedBath.id?{...b,rotation:((v%360)+360)%360}:b));
                  if(field==='length')   setPlacedBaths(p=>p.map(b=>b.id===selectedBath.id?{...b,length:Math.max(0.001,v/1000*unitsPerMeter)}:b));
                  if(field==='depth')    setPlacedBaths(p=>p.map(b=>b.id===selectedBath.id?{...b,depth:Math.max(0.001,v/1000*unitsPerMeter)}:b));
                };
                const kd=(e:React.KeyboardEvent<HTMLInputElement>)=>{ if(e.key==='Enter') e.currentTarget.blur(); };
                const inputCls="w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:border-teal-400 focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Type</span>
                      <span className="font-mono text-white capitalize">{selectedBath.subtype}</span>
                    </div>
                    <PropRow label="Rotation" unit="°">
                      <input type="text" inputMode="numeric" defaultValue={selectedBath.rotation}
                        key={`bath-rot-${selectedBath.id}`}
                        onBlur={e=>commit('rotation',e.target.value)} onKeyDown={kd}
                        className={inputCls.replace('w-20','w-16')}/>
                    </PropRow>
                    <PropRow label="Length" unit="mm">
                      <input type="text" inputMode="numeric" defaultValue={mmLen}
                        key={`bath-len-${selectedBath.id}-${mmLen}`}
                        onBlur={e=>commit('length',e.target.value)} onKeyDown={kd}
                        className={inputCls}/>
                    </PropRow>
                    <PropRow label="Depth" unit="mm">
                      <input type="text" inputMode="numeric" defaultValue={mmDep}
                        key={`bath-dep-${selectedBath.id}-${mmDep}`}
                        onBlur={e=>commit('depth',e.target.value)} onKeyDown={kd}
                        className={inputCls}/>
                    </PropRow>
                  </div>
                );
              })()}

            </div>
          )}

          {/* Elements summary */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Placed Elements</h4>
            <div className="grid grid-cols-5 gap-2">
              {[{label:'Doors',count:placedDoors.length,color:'text-blue-400',bg:'bg-blue-500/10'},
                {label:'Windows',count:placedWindows.length,color:'text-cyan-400',bg:'bg-cyan-500/10'},
                {label:'Robes',count:placedRobes.length,color:'text-amber-400',bg:'bg-amber-500/10'},
                {label:'Kitchen',count:placedKitchens.length,color:'text-orange-400',bg:'bg-orange-500/10'},
                {label:'Bath',count:placedBaths.length,color:'text-teal-400',bg:'bg-teal-500/10'},
              ].map(({label,count,color,bg})=>(
                <div key={label} className={`${bg} rounded-lg p-2 text-center`}>
                  <div className={`text-xl font-bold ${color}`}>{count}</div>
                  <div className="text-gray-500 text-[10px]">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="space-y-2 pt-1">
            <button onClick={handleSave} disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed">
              {isSaving?<Loader2 className="w-4 h-4 animate-spin"/>:<Save className="w-4 h-4"/>}
              {isSaving?'Saving…':'Save Changes'}
            </button>
            <button onClick={onCancel}
              className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white py-3 rounded-xl text-sm font-medium transition border border-white/10">
              Cancel
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
