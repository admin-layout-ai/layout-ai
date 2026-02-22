// frontend/components/SvgEditor.tsx
// Floor plan editor: Doors · Walls · Windows · Robes · Kitchen
// v2 – Full undo · Zoom/pan · Grid snap · MS Paint eraser · Bug fixes

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, Save, Trash2, RotateCw, MousePointer, DoorOpen, Undo2, Pencil,
  ArrowLeft, Move, FlipHorizontal2, Minus, Eraser, Square, Columns,
  UtensilsCrossed, ZoomIn, ZoomOut, Maximize2, Grid,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PlacedDoor {
  id: number; x: number; y: number;
  rotation: number; width: number; flipped: boolean;
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
export interface PlacedRobe {
  id: number; x: number; y: number;
  rotation: number; length: number; width: number;
}
export type KitchenSubtype = 'island' | 'bench' | 'fridge' | 'sink' | 'cooktop' | 'dishwasher';
export interface PlacedKitchen {
  id: number; x: number; y: number;
  rotation: number; subtype: KitchenSubtype; length: number; depth: number;
}
export interface SvgEditorSaveResult {
  previewImageUrl: string;
  doors: PlacedDoor[]; walls: PlacedWall[]; windows: PlacedWindow[];
  robes: PlacedRobe[]; kitchens: PlacedKitchen[]; updatedAt: string;
}
export interface SvgEditorProps {
  svgUrl: string; projectId: number; planId: number;
  existingDoors?: PlacedDoor[]; existingWalls?: PlacedWall[];
  existingWindows?: PlacedWindow[]; existingRobes?: PlacedRobe[];
  existingKitchens?: PlacedKitchen[]; envelopeWidth?: number;
  onSave: (result: SvgEditorSaveResult) => void; onCancel: () => void;
}

// ── Internal types ─────────────────────────────────────────────────────────────

type DragTarget =
  | { kind: 'door';      id: number; ox: number; oy: number }
  | { kind: 'wall-body'; id: number; grabX: number; grabY: number; startX1: number; startY1: number; startX2: number; startY2: number; startCpx: number; startCpy: number }
  | { kind: 'wall-ep1'; id: number }
  | { kind: 'wall-ep2'; id: number }
  | { kind: 'wall-mid'; id: number }
  | { kind: 'window';   id: number; ox: number; oy: number }
  | { kind: 'robe';     id: number; ox: number; oy: number }
  | { kind: 'kitchen';  id: number; ox: number; oy: number };

interface Snapshot {
  doors: PlacedDoor[]; walls: PlacedWall[]; windows: PlacedWindow[];
  robes: PlacedRobe[]; kitchens: PlacedKitchen[];
}
type ActiveTool = 'select' | 'door' | 'wall' | 'window' | 'robe' | 'kitchen';
type ElementKind = 'door' | 'wall' | 'window' | 'robe' | 'kitchen';
type SelectedEl = { kind: ElementKind; id: number } | null;

// ── Utilities ──────────────────────────────────────────────────────────────────

function ptsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  return `M ${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x},${p.y}`).join(' ');
}

// ── Kitchen symbol ─────────────────────────────────────────────────────────────

function KitchenSymbol({ item, sw, sel }: { item: PlacedKitchen; sw: number; sel: boolean }) {
  const { subtype, length: L, depth: D } = item;
  const stroke = sel ? '#2563eb' : '#1a1a1a';
  const scale = (subtype==='island'||subtype==='bench') ? 1 : 0.5;
  const thin = sw * 0.35 * scale, thick = sw * 0.55 * scale;
  switch (subtype) {
    case 'island': case 'bench': return (
      <>{/* bench/island */}
        <rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick} />
        <rect x={D*0.12} y={D*0.12} width={L-D*0.24} height={D-D*0.24} fill="none" stroke={stroke} strokeWidth={thin*0.6} opacity={0.4}/>
      </>);
    case 'fridge': { const r=Math.min(L,D)*0.08; return (
      <><rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick} rx={r}/>
        <line x1={L*0.2} y1={D*0.08} x2={L*0.8} y2={D*0.08} stroke={stroke} strokeWidth={thin*1.2} strokeLinecap="round"/>
        <circle cx={L*0.08} cy={D*0.5} r={thin} fill={stroke}/>
        <line x1={L*0.06} y1={D*0.15} x2={L*0.94} y2={D*0.15} stroke={stroke} strokeWidth={thin*0.5} strokeDasharray={`${thin*2},${thin}`}/></>); }
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
    case 'dishwasher': return (
      <><rect x={0} y={0} width={L} height={D} fill="#FFFFFF" stroke={stroke} strokeWidth={thick}/>
        <rect x={0} y={0} width={L} height={D*0.12} fill={sel?'rgba(37,99,235,0.08)':'rgba(0,0,0,0.04)'} stroke={stroke} strokeWidth={thin*0.5}/>
        {[0.3,0.5,0.7,0.88].map((t,i)=><line key={i} x1={L*0.08} y1={D*t} x2={L*0.92} y2={D*t} stroke={stroke} strokeWidth={thin*0.5} strokeDasharray={`${thin*3},${thin*1.5}`}/>)}
        <line x1={L*0.25} y1={D*0.06} x2={L*0.75} y2={D*0.06} stroke={stroke} strokeWidth={thin*1.2} strokeLinecap="round"/></>);
    default: return null;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SvgEditor({
  svgUrl, projectId, planId,
  existingDoors, existingWalls, existingWindows, existingRobes, existingKitchens,
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
  const [eraseSize, setEraseSize]             = useState(15);
  const nudgeStep = useRef(1);

  const [placedDoors,    setPlacedDoors]    = useState<PlacedDoor[]>([]);
  const [placedWalls,    setPlacedWalls]    = useState<PlacedWall[]>([]);
  const [placedWindows,  setPlacedWindows]  = useState<PlacedWindow[]>([]);
  const [placedRobes,    setPlacedRobes]    = useState<PlacedRobe[]>([]);
  const [placedKitchens, setPlacedKitchens] = useState<PlacedKitchen[]>([]);

  const nextId = useRef(1); // unified ID counter

  const [doorWidth,    setDoorWidth]    = useState(40);
  const [windowWidth,  setWindowWidth]  = useState(50);
  const [robeFixedW,   setRobeFixedW]   = useState(30);
  const [robeLength,   setRobeLength]   = useState(80);
  const [kitchenSubtype, setKitchenSubtype] = useState<KitchenSubtype>('island');
  const [kitchenDefaults, setKitchenDefaults] = useState<Record<KitchenSubtype,{length:number;depth:number}>>({
    island:{length:96,depth:36},bench:{length:96,depth:24},fridge:{length:28,depth:28},
    sink:{length:36,depth:20},cooktop:{length:24,depth:24},dishwasher:{length:24,depth:24},
  });

  const [activeTool,    setActiveTool]    = useState<ActiveTool>('door');
  const [wallEraseMode, setWallEraseMode] = useState(false);
  const [selectedEl,    setSelectedEl]    = useState<SelectedEl>(null);
  const [wallStart,     setWallStart]     = useState<{x:number;y:number}|null>(null);
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
  const isErasingRef   = useRef(false);
  const [liveErasePts, setLiveErasePts] = useState<{x:number;y:number}[]>([]);

  // Full undo stack
  const undoStack   = useRef<Snapshot[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const stateRef    = useRef<Snapshot>({doors:[],walls:[],windows:[],robes:[],kitchens:[]});

  const svgRef             = useRef<SVGSVGElement>(null);
  const svgContentGroupRef = useRef<SVGGElement>(null);
  const activeDrag         = useRef<DragTarget|null>(null);
  const wasDragged         = useRef(false);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = { doors:placedDoors, walls:placedWalls, windows:placedWindows, robes:placedRobes, kitchens:placedKitchens };
  }, [placedDoors, placedWalls, placedWindows, placedRobes, placedKitchens]);

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
    const g = Math.max(1, Math.round(unitsPerMeter * 0.1));
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
      {doors:[...s.doors],walls:[...s.walls],windows:[...s.windows],robes:[...s.robes],kitchens:[...s.kitchens]},
    ];
    setUndoDepth(undoStack.current.length);
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoStack.current.length) return;
    const prev = undoStack.current[undoStack.current.length-1];
    undoStack.current = undoStack.current.slice(0,-1);
    setPlacedDoors(prev.doors); setPlacedWalls(prev.walls);
    setPlacedWindows(prev.windows); setPlacedRobes(prev.robes);
    setPlacedKitchens(prev.kitchens); setSelectedEl(null);
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
          setDoorWidth(Math.round(upm*0.82));
          setWindowWidth(Math.round(upm*1.0));
          setRobeFixedW(Math.round(upm*0.6));
          setRobeLength(Math.round(upm*1.6));
          setWallClearHeight(Math.max(upm*0.08,Math.round(upm*0.35)));

          // Detect internal wall stroke
          const darkRects=Array.from(svgEl.querySelectorAll('rect[fill="#1a1a1a"]'))
            .map(r=>({w:parseFloat(r.getAttribute('width')||'0'),h:parseFloat(r.getAttribute('height')||'0')}))
            .filter(r=>r.w>0&&r.h>0);
          const thinDims=darkRects.map(r=>Math.min(r.w,r.h)).filter(d=>d>0);
          let ws=Math.max(2,Math.round(upm*0.12));
          if(thinDims.length>0){thinDims.sort((a,b)=>a-b);const med=thinDims[Math.floor(thinDims.length/2)];const lo=thinDims.filter(d=>d<=med);ws=Math.max(2,lo[Math.floor(lo.length/2)]);}
          setWallStroke(ws);
          setEraseSize(Math.round(ws*4));
          nudgeStep.current=Math.max(1,Math.round(upm*0.025));

          setKitchenDefaults({
            island:{length:Math.round(upm*2.4),depth:Math.round(upm*0.88)},
            bench:{length:Math.round(upm*2.4),depth:Math.round(upm*0.6)},
            fridge:{length:Math.round(upm*0.7),depth:Math.round(upm*0.7)},
            sink:{length:Math.round(upm*0.9),depth:Math.round(upm*0.5)},
            cooktop:{length:Math.round(upm*0.8),depth:Math.round(upm*0.4)},
            dishwasher:{length:Math.round(upm*0.6),depth:Math.round(upm*0.6)},
          });
        }

        const allIds:number[]=[];
        if(existingDoors?.length)   {setPlacedDoors(existingDoors);      allIds.push(...existingDoors.map(d=>d.id));}
        if(existingWalls?.length)   {setPlacedWalls(existingWalls);      allIds.push(...existingWalls.map(w=>w.id));}
        if(existingWindows?.length) {setPlacedWindows(existingWindows);  allIds.push(...existingWindows.map(w=>w.id));}
        if(existingRobes?.length)   {setPlacedRobes(existingRobes);      allIds.push(...existingRobes.map(r=>r.id));}
        if(existingKitchens?.length){setPlacedKitchens(existingKitchens);allIds.push(...existingKitchens.map(k=>k.id));}
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
  }, [selectedEl, pushUndo]);

  const handleFlipSelected = useCallback(() => {
    if(!selectedEl) return; pushUndo();
    if(selectedEl.kind==='door')   setPlacedDoors(p  =>p.map(d=>d.id===selectedEl.id?{...d,flipped:!d.flipped}:d));
    if(selectedEl.kind==='window') setPlacedWindows(p=>p.map(w=>w.id===selectedEl.id?{...w,flipped:!w.flipped}:w));
  }, [selectedEl, pushUndo]);

  const handleCurveSelected = useCallback(() => {
    if(selectedEl?.kind!=='wall') return; pushUndo();
    setPlacedWalls(prev=>prev.map(w=>{
      if(w.id!==selectedEl.id) return w;
      if(w.curved) return {...w,curved:false,cpx:(w.x1+w.x2)/2,cpy:(w.y1+w.y2)/2};
      const mx=(w.x1+w.x2)/2,my=(w.y1+w.y2)/2,len=Math.hypot(w.x2-w.x1,w.y2-w.y1)||1;
      const perp={x:-(w.y2-w.y1)/len,y:(w.x2-w.x1)/len};
      return {...w,curved:true,cpx:mx+perp.x*len*0.2,cpy:my+perp.y*len*0.2};
    }));
  }, [selectedEl, pushUndo]);

  const handleDeleteSelected = useCallback(() => {
    if(!selectedEl) return; pushUndo();
    if(selectedEl.kind==='door')    setPlacedDoors(p    =>p.filter(d=>d.id!==selectedEl.id));
    if(selectedEl.kind==='wall')    setPlacedWalls(p    =>p.filter(w=>w.id!==selectedEl.id));
    if(selectedEl.kind==='window')  setPlacedWindows(p  =>p.filter(w=>w.id!==selectedEl.id));
    if(selectedEl.kind==='robe')    setPlacedRobes(p    =>p.filter(r=>r.id!==selectedEl.id));
    if(selectedEl.kind==='kitchen') setPlacedKitchens(p =>p.filter(k=>k.id!==selectedEl.id));
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
      if(e.code==='Space'&&!e.repeat){e.preventDefault();setSpaceDown(true);return;}
      if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();handleUndo();return;}
      if(e.key==='Escape'){setWallStart(null);setWallEraseMode(false);setSelectedEl(null);return;}
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
      if(selectedEl.kind==='wall')    setPlacedWalls(p    =>p.map(w=>w.id===selectedEl.id?{...w,x1:w.x1+dx,y1:w.y1+dy,x2:w.x2+dx,y2:w.y2+dy,cpx:w.cpx+dx,cpy:w.cpy+dy}:w));
      if(selectedEl.kind==='window')  setPlacedWindows(p  =>p.map(w=>w.id===selectedEl.id?{...w,x:w.x+dx,y:w.y+dy}:w));
      if(selectedEl.kind==='robe')    setPlacedRobes(p    =>p.map(r=>r.id===selectedEl.id?{...r,x:r.x+dx,y:r.y+dy}:r));
      if(selectedEl.kind==='kitchen') setPlacedKitchens(p =>p.map(k=>k.id===selectedEl.id?{...k,x:k.x+dx,y:k.y+dy}:k));
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
    if(wallEraseMode) return;
    const svgPt=screenToSvg(e.clientX,e.clientY); if(!svgPt) return;
    const cx=snap(svgPt.x),cy=snap(svgPt.y);

    if(activeTool==='select'){setSelectedEl(null);return;}

    if(activeTool==='door'){
      pushUndo(); const id=nextId.current++;
      setPlacedDoors(p=>[...p,{id,x:cx,y:cy,rotation:0,width:doorWidth,flipped:false}]);
      setSelectedEl({kind:'door',id}); return;
    }
    if(activeTool==='wall'){
      if(!wallStart){setWallStart({x:cx,y:cy});}
      else{
        const end=snapToAngle(wallStart.x,wallStart.y,cx,cy,e.shiftKey);
        const x2=snap(end.x),y2=snap(end.y);
        pushUndo(); const id=nextId.current++;
        setPlacedWalls(p=>[...p,{id,x1:wallStart.x,y1:wallStart.y,x2,y2,curved:false,cpx:(wallStart.x+x2)/2,cpy:(wallStart.y+y2)/2}]);
        setSelectedEl({kind:'wall',id}); setWallStart(null);
      }
      return;
    }
    if(activeTool==='window'){
      pushUndo(); const id=nextId.current++;
      setPlacedWindows(p=>[...p,{id,x:cx,y:cy,rotation:0,width:windowWidth,flipped:false}]);
      setSelectedEl({kind:'window',id}); return;
    }
    if(activeTool==='robe'){
      pushUndo(); const id=nextId.current++;
      setPlacedRobes(p=>[...p,{id,x:cx,y:cy,rotation:0,length:robeLength,width:robeFixedW}]);
      setSelectedEl({kind:'robe',id}); return;
    }
    if(activeTool==='kitchen'){
      pushUndo(); const def=kitchenDefaults[kitchenSubtype]; const id=nextId.current++;
      setPlacedKitchens(p=>[...p,{id,x:cx,y:cy,rotation:0,subtype:kitchenSubtype,length:def.length,depth:def.depth}]);
      setSelectedEl({kind:'kitchen',id}); return;
    }
  }, [activeTool,doorWidth,windowWidth,robeLength,robeFixedW,kitchenSubtype,kitchenDefaults,
      wallStart,wallEraseMode,snap,snapToAngle,pushUndo,screenToSvg]);

  const handleElementClick = useCallback((e:React.MouseEvent,kind:ElementKind,id:number) => {
    e.stopPropagation();
    if(activeTool==='wall'&&wallEraseMode&&kind==='wall'){
      pushUndo(); setPlacedWalls(p=>p.filter(w=>w.id!==id));
      if(selectedEl?.id===id) setSelectedEl(null); return;
    }
    setSelectedEl({kind,id}); setActiveTool('select');
  }, [activeTool, wallEraseMode, selectedEl, pushUndo]);

  const handleSvgMouseDown = useCallback((e:React.MouseEvent<SVGSVGElement>) => {
    if(e.button===1||(e.button===0&&spaceDown)){
      e.preventDefault(); isPanningRef.current=true;
      const vs=viewStateRef.current;
      panStartRef.current={screenX:e.clientX,screenY:e.clientY,panX:vs.panX,panY:vs.panY};
      return;
    }
    if(activeTool==='wall'&&wallEraseMode&&e.button===0){
      const svgPt=screenToSvg(e.clientX,e.clientY); if(!svgPt) return;
      pushUndo(); isErasingRef.current=true;
      setLiveErasePts([{x:svgPt.x,y:svgPt.y}]);
    }
  }, [spaceDown, activeTool, wallEraseMode, screenToSvg, pushUndo]);

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
    if(isErasingRef.current&&svgPt){
      setLiveErasePts(prev=>{
        const last=prev[prev.length-1];
        if(last&&Math.hypot(svgPt.x-last.x,svgPt.y-last.y)<2) return prev;
        return [...prev,{x:svgPt.x,y:svgPt.y}];
      });
      return;
    }

    // Element drag
    if(!activeDrag.current||!svgPt) return;
    wasDragged.current=true;
    const cx=svgPt.x,cy=svgPt.y,drag=activeDrag.current;
    if(drag.kind==='door')    setPlacedDoors(p    =>p.map(d=>d.id===drag.id?{...d,x:snap(cx-drag.ox),y:snap(cy-drag.oy)}:d));
    if(drag.kind==='window')  setPlacedWindows(p  =>p.map(w=>w.id===drag.id?{...w,x:snap(cx-drag.ox),y:snap(cy-drag.oy)}:w));
    if(drag.kind==='robe')    setPlacedRobes(p    =>p.map(r=>r.id===drag.id?{...r,x:snap(cx-drag.ox),y:snap(cy-drag.oy)}:r));
    if(drag.kind==='kitchen') setPlacedKitchens(p =>p.map(k=>k.id===drag.id?{...k,x:snap(cx-drag.ox),y:snap(cy-drag.oy)}:k));
    if(drag.kind==='wall-body'){
      const ddx=snap(cx-drag.grabX),ddy=snap(cy-drag.grabY);
      setPlacedWalls(p=>p.map(w=>w.id===drag.id?{...w,x1:drag.startX1+ddx,y1:drag.startY1+ddy,x2:drag.startX2+ddx,y2:drag.startY2+ddy,cpx:drag.startCpx+ddx,cpy:drag.startCpy+ddy}:w));
    }
    if(drag.kind==='wall-ep1') setPlacedWalls(p=>p.map(w=>w.id===drag.id?{...w,x1:snap(cx),y1:snap(cy)}:w));
    if(drag.kind==='wall-ep2') setPlacedWalls(p=>p.map(w=>w.id===drag.id?{...w,x2:snap(cx),y2:snap(cy)}:w));
    if(drag.kind==='wall-mid') setPlacedWalls(p=>p.map(w=>w.id===drag.id?{...w,curved:true,cpx:snap(cx),cpy:snap(cy)}:w));
  }, [screenToSvg, snap]);

  const handleSvgMouseUp = useCallback(() => {
    if(isPanningRef.current){isPanningRef.current=false;panStartRef.current=null;return;}
    if(isErasingRef.current){
      isErasingRef.current=false;
      setLiveErasePts(pts=>{
        if(pts.length>=2){
          const id=nextId.current++;
          const eraseWall:PlacedWall={id,x1:pts[0].x,y1:pts[0].y,x2:pts[pts.length-1].x,y2:pts[pts.length-1].y,curved:false,cpx:0,cpy:0,erase:true,points:[...pts]};
          setPlacedWalls(prev=>[...prev,eraseWall]);
        }
        return [];
      });
      return;
    }
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

  const startDragWallBody = useCallback((e:React.MouseEvent,id:number) => {
    e.stopPropagation();e.preventDefault();
    const svgPt=screenToSvg(e.clientX,e.clientY);if(!svgPt)return;
    const wall=placedWalls.find(w=>w.id===id);if(!wall)return;
    pushUndo();setSelectedEl({kind:'wall',id});
    activeDrag.current={kind:'wall-body',id,grabX:svgPt.x,grabY:svgPt.y,startX1:wall.x1,startY1:wall.y1,startX2:wall.x2,startY2:wall.y2,startCpx:wall.cpx,startCpy:wall.cpy};
    wasDragged.current=false;
  },[placedWalls,screenToSvg,pushUndo]);

  const startDragWallEp = useCallback((e:React.MouseEvent,id:number,ep:'ep1'|'ep2') => {
    e.stopPropagation();e.preventDefault(); pushUndo();
    activeDrag.current={kind:ep==='ep1'?'wall-ep1':'wall-ep2',id};wasDragged.current=false;
  },[pushUndo]);

  const startDragWallMid = useCallback((e:React.MouseEvent,id:number) => {
    e.stopPropagation();e.preventDefault(); pushUndo();
    activeDrag.current={kind:'wall-mid',id};wasDragged.current=false;
  },[pushUndo]);

  // Derived selected items
  const selectedDoor    = selectedEl?.kind==='door'    ? placedDoors.find(d=>d.id===selectedEl.id)    : null;
  const selectedWall    = selectedEl?.kind==='wall'    ? placedWalls.find(w=>w.id===selectedEl.id)    : null;
  const selectedWindow  = selectedEl?.kind==='window'  ? placedWindows.find(w=>w.id===selectedEl.id)  : null;
  const selectedRobe    = selectedEl?.kind==='robe'    ? placedRobes.find(r=>r.id===selectedEl.id)    : null;
  const selectedKitchen = selectedEl?.kind==='kitchen' ? placedKitchens.find(k=>k.id===selectedEl.id) : null;

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if(!svgContent) return;
    setIsSaving(true);
    try {
      const wch=wallClearHeight, sw=wallStroke;

      // Doors – flip in nested <g> (correct transform order)
      const doorsSvg=placedDoors.map(door=>{
        const w=door.width;
        return `<g transform="translate(${door.x},${door.y}) rotate(${door.rotation})" class="door-element" data-door-id="${door.id}">
  <g transform="${door.flipped?'scale(1,-1)':'scale(1,1)'}">
    <rect x="${-wch}" y="${-wch/2}" width="${w+2*wch}" height="${wch}" fill="#FFFFFF" stroke="none"/>
    <line x1="0" y1="0" x2="${w}" y2="0" stroke="#000000" stroke-width="${sw}"/>
    <path d="M ${w},0 A ${w},${w} 0 0,1 0,${-w}" fill="none" stroke="#000000" stroke-width="${sw*0.5}"/>
    <circle cx="0" cy="0" r="${sw}" fill="#000000"/>
  </g>
</g>`;}).join('\n');

      // Walls – freehand erase uses stored points array
      const toWallPath=(wall:PlacedWall,isErase:boolean)=>{
        let d:string;
        if(isErase&&wall.points&&wall.points.length>=2) d=ptsToPath(wall.points);
        else if(wall.curved) d=`M ${wall.x1},${wall.y1} Q ${wall.cpx},${wall.cpy} ${wall.x2},${wall.y2}`;
        else d=`M ${wall.x1},${wall.y1} L ${wall.x2},${wall.y2}`;
        return `<path d="${d}" stroke="${isErase?'#FFFFFF':'#1a1a1a'}" stroke-width="${isErase?eraseSize:sw}" stroke-linecap="round" stroke-linejoin="round" fill="none" class="wall-element" data-wall-id="${wall.id}"/>`;
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

      // Robes - proper architectural sliding door (2 overlapping panels + directional arrows)
      const robesSvg=placedRobes.map(robe=>{
        const rw=robe.width,rl=robe.length;
        const pw=rl*0.55;          // each panel width (panels overlap in centre)
        const sw2=sw*0.5;
        const aw=Math.min(rw*0.22,pw*0.18); // arrowhead size
        const p1x2=pw;
        const p2x1=rl-pw;
        return `<g transform="translate(${robe.x},${robe.y}) rotate(${robe.rotation})" class="robe-element" data-robe-id="${robe.id}">
  <rect x="0" y="0" width="${rl}" height="${rw}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${sw2}"/>
  <rect x="0" y="0" width="${pw}" height="${rw}" fill="none" stroke="#1a1a1a" stroke-width="${sw2*0.7}"/>
  <line x1="${aw}" y1="${rw*0.25}" x2="${p1x2-aw*0.5}" y2="${rw*0.25}" stroke="#1a1a1a" stroke-width="${sw2*0.6}" stroke-linecap="round"/>
  <polyline points="${p1x2-aw*0.5-aw},${rw*0.25-aw*0.6} ${p1x2-aw*0.5},${rw*0.25} ${p1x2-aw*0.5-aw},${rw*0.25+aw*0.6}" fill="none" stroke="#1a1a1a" stroke-width="${sw2*0.6}" stroke-linejoin="round" stroke-linecap="round"/>
  <rect x="${p2x1}" y="0" width="${pw}" height="${rw}" fill="none" stroke="#1a1a1a" stroke-width="${sw2*0.7}"/>
  <line x1="${rl-aw}" y1="${rw*0.75}" x2="${p2x1+aw*0.5}" y2="${rw*0.75}" stroke="#1a1a1a" stroke-width="${sw2*0.6}" stroke-linecap="round"/>
  <polyline points="${p2x1+aw*0.5+aw},${rw*0.75-aw*0.6} ${p2x1+aw*0.5},${rw*0.75} ${p2x1+aw*0.5+aw},${rw*0.75+aw*0.6}" fill="none" stroke="#1a1a1a" stroke-width="${sw2*0.6}" stroke-linejoin="round" stroke-linecap="round"/>
</g>`;}).join('\n');

      // Kitchen
      const kitchenSvg=placedKitchens.map(k=>{
        const{subtype,length:L,depth:D}=k;
        const kscale=(subtype==='island'||subtype==='bench')?1:0.5;
        const thin=sw*0.35*kscale,thick=sw*0.55*kscale;
        let inner='';
        if(subtype==='island'||subtype==='bench'){inner=`<rect x="${D*0.12}" y="${D*0.12}" width="${L-D*0.24}" height="${D-D*0.24}" fill="none" stroke="#1a1a1a" stroke-width="${thin*0.6}" opacity="0.4"/>`;}
        else if(subtype==='fridge'){const r=Math.min(L,D)*0.08;inner=`<rect x="0" y="0" width="${L}" height="${D}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${thick}" rx="${r}"/><line x1="${L*0.2}" y1="${D*0.08}" x2="${L*0.8}" y2="${D*0.08}" stroke="#1a1a1a" stroke-width="${thin*1.2}" stroke-linecap="round"/><circle cx="${L*0.08}" cy="${D*0.5}" r="${thin}" fill="#1a1a1a"/>`;}
        else if(subtype==='sink'){const dbl=L>D*1.5,bw=dbl?L*0.42:L*0.72,bh=D*0.68,by2=D*0.16;
          inner=dbl?`<rect x="${L*0.04}" y="${by2}" width="${bw}" height="${bh}" fill="none" stroke="#1a1a1a" stroke-width="${thin}" rx="${thin}"/><rect x="${L*0.54}" y="${by2}" width="${bw}" height="${bh}" fill="none" stroke="#1a1a1a" stroke-width="${thin}" rx="${thin}"/><circle cx="${L*0.25}" cy="${D*0.5}" r="${thin*1.5}" fill="#1a1a1a"/><circle cx="${L*0.75}" cy="${D*0.5}" r="${thin*1.5}" fill="#1a1a1a"/>`:
            `<rect x="${(L-bw)/2}" y="${by2}" width="${bw}" height="${bh}" fill="none" stroke="#1a1a1a" stroke-width="${thin}" rx="${thin}"/><circle cx="${L/2}" cy="${D*0.5}" r="${thin*1.5}" fill="#1a1a1a"/>`;
          inner+=`<line x1="${L*0.45}" y1="${D*0.05}" x2="${L*0.55}" y2="${D*0.05}" stroke="#1a1a1a" stroke-width="${thin*1.2}" stroke-linecap="round"/><line x1="${L*0.5}" y1="${D*0.05}" x2="${L*0.5}" y2="${D*0.16}" stroke="#1a1a1a" stroke-width="${thin*0.8}"/>`;}
        else if(subtype==='cooktop'){const bxs=[L*0.25,L*0.75,L*0.25,L*0.75],bys=[D*0.28,D*0.28,D*0.72,D*0.72],r1=Math.min(L,D)*0.18,r2=r1*0.55;
          inner=bxs.map((bx,i)=>`<circle cx="${bx}" cy="${bys[i]}" r="${r1}" fill="none" stroke="#1a1a1a" stroke-width="${thin}"/><circle cx="${bx}" cy="${bys[i]}" r="${r2}" fill="none" stroke="#1a1a1a" stroke-width="${thin*0.6}"/><circle cx="${bx}" cy="${bys[i]}" r="${thin*0.9}" fill="#1a1a1a"/>`).join('');}
        else if(subtype==='dishwasher'){inner=`<rect x="0" y="0" width="${L}" height="${D*0.12}" fill="rgba(0,0,0,0.04)" stroke="#1a1a1a" stroke-width="${thin*0.5}"/>${[0.3,0.5,0.7,0.88].map(t=>`<line x1="${L*0.08}" y1="${D*t}" x2="${L*0.92}" y2="${D*t}" stroke="#1a1a1a" stroke-width="${thin*0.5}" stroke-dasharray="${thin*3},${thin*1.5}"/>`).join('')}<line x1="${L*0.25}" y1="${D*0.06}" x2="${L*0.75}" y2="${D*0.06}" stroke="#1a1a1a" stroke-width="${thin*1.2}" stroke-linecap="round"/>`;}
        return `<g transform="translate(${k.x},${k.y}) rotate(${k.rotation})" class="kitchen-element" data-kitchen-id="${k.id}" data-subtype="${subtype}">
  <rect x="0" y="0" width="${L}" height="${D}" fill="#FFFFFF" stroke="#1a1a1a" stroke-width="${thick}"/>
  ${inner}
</g>`;}).join('\n');

      let modifiedSvg=svgContent
        .replace(/<g\s+id="doors-layer"[\s\S]*?<\/g>\s*/g,'')
        .replace(/<g\s+id="walls-layer"[\s\S]*?<\/g>\s*/g,'')
        .replace(/<g\s+id="windows-layer"[\s\S]*?<\/g>\s*/g,'')
        .replace(/<g\s+id="robes-layer"[\s\S]*?<\/g>\s*/g,'')
        .replace(/<g\s+id="kitchen-layer"[\s\S]*?<\/g>\s*/g,'');

      modifiedSvg=modifiedSvg.replace('</svg>',
        `<g id="walls-layer">\n${wallsSvg}\n</g>\n`+
        `<g id="windows-layer">\n${windowsSvg}\n</g>\n`+
        `<g id="robes-layer">\n${robesSvg}\n</g>\n`+
        `<g id="kitchen-layer">\n${kitchenSvg}\n</g>\n`+
        `<g id="doors-layer">\n${doorsSvg}\n</g>\n</svg>`);

      const token=localStorage.getItem('auth_token')||localStorage.getItem('access_token');
      const API_URL=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000';
      const res=await fetch(`${API_URL}/api/v1/plans/${projectId}/plans/${planId}/save-svg`,{
        method:'PUT',
        headers:{'Content-Type':'application/json',...(token&&{Authorization:`Bearer ${token}`})},
        body:JSON.stringify({svg_content:modifiedSvg,doors:placedDoors,walls:placedWalls,windows:placedWindows,robes:placedRobes,kitchens:placedKitchens}),
      });
      if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.detail||'Save failed');}
      const result=await res.json();
      showToast('Floor plan saved!','success');
      onSave({previewImageUrl:result.preview_image_url,doors:placedDoors,walls:placedWalls,windows:placedWindows,robes:placedRobes,kitchens:placedKitchens,updatedAt:new Date().toISOString()});
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
    activeTool==='wall'&&wallEraseMode ? 'none' :
    activeDrag.current        ? 'grabbing' :
    activeTool==='door'||activeTool==='window'||activeTool==='robe'||activeTool==='kitchen' ? 'crosshair' :
    activeTool==='wall'       ? (wallStart?'crosshair':'cell') : 'default';

  const totalElements=placedDoors.length+placedWalls.length+placedWindows.length+placedRobes.length+placedKitchens.length;

  const toolBtn=(tool:ActiveTool,label:string,Icon:React.ElementType,color:string)=>{
    const active=activeTool===tool;
    return (
      <button key={tool}
        onClick={()=>{setActiveTool(tool);if(tool!=='wall'){setWallStart(null);setWallEraseMode(false);}if(tool!=='select')setSelectedEl(null);}}
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
      <div className="w-full lg:w-[60%] p-3 sm:p-4 lg:p-6 flex flex-col overflow-visible lg:overflow-hidden min-h-[300px] sm:min-h-[400px]">
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

            {/* Walls overlay */}
            <g id="walls-overlay">
              {placedWalls.map(wall=>{
                const sel=selectedEl?.kind==='wall'&&selectedEl.id===wall.id;
                const mx=(wall.x1+wall.x2)/2, my=(wall.y1+wall.y2)/2;

                // Freehand erase stroke (MS Paint)
                if(wall.erase&&wall.points&&wall.points.length>=2){
                  const pd=ptsToPath(wall.points);
                  return (
                    <g key={wall.id}>
                      <path d={pd} stroke="rgba(0,0,0,0.001)" strokeWidth={Math.max(eraseSize+14,22)} fill="none" pointerEvents="all"
                        style={{cursor:activeTool==='wall'&&wallEraseMode?'none':'default'}}
                        onClick={e=>handleElementClick(e,'wall',wall.id)}/>
                      <path d={pd} stroke="#FFFFFF" strokeWidth={eraseSize} strokeLinecap="round" strokeLinejoin="round" fill="none" pointerEvents="none"/>
                      {sel&&<path d={pd} stroke="#3b82f6" strokeWidth={eraseSize+4} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.3} pointerEvents="none"/>}
                    </g>
                  );
                }

                const pathD=wall.curved?`M ${wall.x1},${wall.y1} Q ${wall.cpx},${wall.cpy} ${wall.x2},${wall.y2}`:`M ${wall.x1},${wall.y1} L ${wall.x2},${wall.y2}`;
                return (
                  <g key={wall.id}>
                    <path d={pathD} stroke="rgba(0,0,0,0.001)" strokeWidth={Math.max(wallStroke+16,20)} fill="none" pointerEvents="all"
                      style={{cursor:activeTool==='select'?'grab':'default'}}
                      onClick={e=>handleElementClick(e,'wall',wall.id)}
                      onMouseDown={e=>{if(activeTool==='select')startDragWallBody(e,wall.id);}}/>
                    <path d={pathD} stroke={sel?'#2563eb':'#1a1a1a'} strokeWidth={wallStroke} strokeLinecap="round" fill="none" pointerEvents="none"/>
                    {sel&&(
                      <>
                        <path d={pathD} stroke="#93c5fd" strokeWidth={wallStroke+4} strokeDasharray="8,4" fill="none" opacity={0.4} pointerEvents="none"/>
                        <circle cx={wall.x1} cy={wall.y1} r={6} fill="#2563eb" stroke="#fff" strokeWidth={1.5} style={{cursor:'move'}} onMouseDown={e=>startDragWallEp(e,wall.id,'ep1')}/>
                        <circle cx={wall.x2} cy={wall.y2} r={6} fill="#2563eb" stroke="#fff" strokeWidth={1.5} style={{cursor:'move'}} onMouseDown={e=>startDragWallEp(e,wall.id,'ep2')}/>
                        <circle cx={wall.curved?wall.cpx:mx} cy={wall.curved?wall.cpy:my} r={5} fill={wall.curved?'#f59e0b':'#fff'} stroke={wall.curved?'#fff':'#2563eb'} strokeWidth={1.5} style={{cursor:'crosshair'}} onMouseDown={e=>startDragWallMid(e,wall.id)}/>
                        {wall.curved&&<line x1={mx} y1={my} x2={wall.cpx} y2={wall.cpy} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,2" pointerEvents="none"/>}
                      </>
                    )}
                  </g>
                );
              })}
            </g>

            {/* Live MS Paint erase stroke preview */}
            {liveErasePts.length>=2&&(
              <g pointerEvents="none">
                <path d={ptsToPath(liveErasePts)} stroke="#FFFFFF" strokeWidth={eraseSize} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d={ptsToPath(liveErasePts)} stroke="#ef4444" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="6,3" opacity={0.65}/>
              </g>
            )}

            {/* Eraser cursor (MS Paint white square with red dashed border) */}
            {activeTool==='wall'&&wallEraseMode&&(
              <g pointerEvents="none">
                <rect x={cursorPos.x-eraseSize/2} y={cursorPos.y-eraseSize/2}
                  width={eraseSize} height={eraseSize}
                  fill="white" fillOpacity={0.75} stroke="#ef4444" strokeWidth={0.8} strokeDasharray="3,2"/>
              </g>
            )}

            {/* Wall draw preview */}
            {activeTool==='wall'&&!wallEraseMode&&wallStart&&(
              <g pointerEvents="none">
                <line x1={wallStart.x} y1={wallStart.y} x2={cursorPos.x} y2={cursorPos.y}
                  stroke="#2563eb" strokeWidth={wallStroke} strokeDasharray="8,4" strokeLinecap="round" opacity={0.7}/>
                <circle cx={wallStart.x} cy={wallStart.y} r={5} fill="#2563eb" stroke="#fff" strokeWidth={1.5}/>
                <circle cx={cursorPos.x} cy={cursorPos.y} r={4} fill="none" stroke="#2563eb" strokeWidth={1.5} opacity={0.6}/>
              </g>
            )}

            {/* Windows overlay */}
            <g id="windows-overlay">
              {placedWindows.map(win=>{
                const w=win.width,wt=wallClearHeight,inset=Math.max(1.5,wt/7);
                const sel=selectedEl?.kind==='window'&&selectedEl.id===win.id;
                return (
                  <g key={win.id} transform={`translate(${win.x},${win.y}) rotate(${win.rotation})`}
                    onClick={e=>handleElementClick(e,'window',win.id)}
                    onMouseDown={e=>{if(activeTool==='select')startDragWindow(e,win.id);}}
                    style={{cursor:sel?'grab':'pointer'}}>
                    <g transform={win.flipped?'scale(1,-1)':''}>
                      <rect x={0} y={-wt/2} width={w} height={wt} fill="#FFFFFF" stroke="none"/>
                      {sel&&<rect x={-4} y={-wt/2-4} width={w+8} height={wt+8} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5,3" rx={2}/>}
                      <line x1={0} y1={-wt/2+inset} x2={w} y2={-wt/2+inset} stroke={sel?'#2563eb':'#1a1a1a'} strokeWidth={sel?1.5:wallStroke*0.4}/>
                      <line x1={0} y1={wt/2-inset}  x2={w} y2={wt/2-inset}  stroke={sel?'#2563eb':'#1a1a1a'} strokeWidth={sel?1.5:wallStroke*0.4}/>
                    </g>
                  </g>
                );
              })}
            </g>

            {/* Robes overlay */}
            <g id="robes-overlay">
              {placedRobes.map(robe=>{
                const rl=robe.length,rw=robe.width,sel=selectedEl?.kind==='robe'&&selectedEl.id===robe.id;
                const pw=rl*0.55;
                const sw2=wallStroke*0.5;
                const aw=Math.min(rw*0.22,pw*0.18);
                const p1x2=pw, p2x1=rl-pw;
                const sc=sel?'#2563eb':'#1a1a1a';
                return (
                  <g key={robe.id} transform={`translate(${robe.x},${robe.y}) rotate(${robe.rotation})`}
                    onClick={e=>handleElementClick(e,'robe',robe.id)}
                    onMouseDown={e=>{if(activeTool==='select')startDragRobe(e,robe.id);}}
                    style={{cursor:sel?'grab':'pointer'}}>
                    {sel&&<rect x={-4} y={-4} width={rl+8} height={rw+8} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5,3" rx={2}/>}
                    {/* Outer carcass */}
                    <rect x={0} y={0} width={rl} height={rw} fill="#FFFFFF" stroke={sc} strokeWidth={sel?1.5:sw2}/>
                    {/* Panel 1 – slides right */}
                    <rect x={0} y={0} width={pw} height={rw} fill="none" stroke={sc} strokeWidth={sw2*0.7}/>
                    <line x1={aw} y1={rw*0.25} x2={p1x2-aw*0.5} y2={rw*0.25} stroke={sc} strokeWidth={sw2*0.6} strokeLinecap="round"/>
                    <polyline points={`${p1x2-aw*0.5-aw},${rw*0.25-aw*0.6} ${p1x2-aw*0.5},${rw*0.25} ${p1x2-aw*0.5-aw},${rw*0.25+aw*0.6}`} fill="none" stroke={sc} strokeWidth={sw2*0.6} strokeLinejoin="round" strokeLinecap="round"/>
                    {/* Panel 2 – slides left */}
                    <rect x={p2x1} y={0} width={pw} height={rw} fill="none" stroke={sc} strokeWidth={sw2*0.7}/>
                    <line x1={rl-aw} y1={rw*0.75} x2={p2x1+aw*0.5} y2={rw*0.75} stroke={sc} strokeWidth={sw2*0.6} strokeLinecap="round"/>
                    <polyline points={`${p2x1+aw*0.5+aw},${rw*0.75-aw*0.6} ${p2x1+aw*0.5},${rw*0.75} ${p2x1+aw*0.5+aw},${rw*0.75+aw*0.6}`} fill="none" stroke={sc} strokeWidth={sw2*0.6} strokeLinejoin="round" strokeLinecap="round"/>
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

            {/* Doors overlay */}
            <g id="doors-overlay">
              {placedDoors.map(door=>{
                const w=door.width,wch=wallClearHeight,sel=selectedEl?.kind==='door'&&selectedEl.id===door.id;
                return (
                  <g key={door.id} transform={`translate(${door.x},${door.y}) rotate(${door.rotation})`}
                    onClick={e=>handleElementClick(e,'door',door.id)}
                    onMouseDown={e=>{if(activeTool==='select')startDragDoor(e,door.id);}}
                    style={{cursor:sel?'grab':'pointer'}}>
                    {/* Flip in nested g – correct transform order */}
                    <g transform={door.flipped?'scale(1,-1)':''}>
                      <rect x={-wch} y={-wch/2} width={w+2*wch} height={wch} fill="#FFFFFF" stroke="none"/>
                      {sel&&<rect x={-6} y={-w-6} width={w+12} height={w+12} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6,3" rx={3}/>}
                      <line x1={0} y1={0} x2={w} y2={0} stroke={sel?'#2563eb':'#000'} strokeWidth={sel?1.5:1}/>
                      <path d={`M ${w},0 A ${w},${w} 0 0,0 0,${-w}`} fill="none" stroke={sel?'#2563eb':'#000'} strokeWidth={sel?1:0.5} strokeDasharray="4,3"/>
                      <circle cx={0} cy={0} r={sel?3:1.5} fill={sel?'#2563eb':'#000'}/>
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Canvas hints */}
          {totalElements===0&&!wallStart&&(
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full pointer-events-none whitespace-nowrap">
              {activeTool==='door'    && 'Click on the plan to place a door'}
              {activeTool==='wall'    &&!wallEraseMode&&'Click to start a wall segment'}
              {activeTool==='wall'    && wallEraseMode &&'Click and drag to erase (MS Paint style)'}
              {activeTool==='window'  && 'Click to place a window'}
              {activeTool==='robe'    && 'Click to place a built-in robe'}
              {activeTool==='kitchen' && `Click to place ${kitchenSubtype}`}
            </div>
          )}
          {activeTool==='wall'&&!wallEraseMode&&wallStart&&(
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full pointer-events-none">
              Click to finish · Shift=angle snap · Esc=cancel
            </div>
          )}
          {activeTool==='wall'&&wallEraseMode&&(
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-red-900/80 backdrop-blur-sm text-red-200 text-xs px-3 py-1.5 rounded-full pointer-events-none flex items-center gap-1.5">
              <Eraser className="w-3 h-3"/>Erase active — click &amp; drag to paint-erase
            </div>
          )}
        </div>
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
              {toolBtn('wall','Wall',Minus,'bg-violet-600')}
              {toolBtn('window','Window',Square,'bg-cyan-600')}
              {toolBtn('robe','Robe',Columns,'bg-amber-600')}
              {toolBtn('kitchen','Kitchen',UtensilsCrossed,'bg-orange-600')}
            </div>

            {/* Wall sub-options: erase mode + size */}
            {activeTool==='wall'&&(
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <button
                    onClick={()=>{setWallEraseMode(p=>!p);setWallStart(null);}}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition border ${wallEraseMode?'bg-red-500/20 border-red-500/40 text-red-400':'bg-white/5 border-white/10 text-gray-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30'}`}>
                    <Eraser className="w-3.5 h-3.5"/>{wallEraseMode?'Erasing…':'Erase Mode'}
                  </button>
                </div>
                {wallEraseMode&&(
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>Eraser size</span>
                      <span className="font-mono text-gray-400">{Math.round(eraseSize/unitsPerMeter*1000)} mm</span>
                    </div>
                    <input type="range" min={Math.round(wallStroke*1.5)} max={Math.round(wallStroke*12)} step={1}
                      value={eraseSize} onChange={e=>setEraseSize(+e.target.value)}
                      className="w-full accent-red-500"/>
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>Small</span><span>Large</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Kitchen sub-palette */}
            {activeTool==='kitchen'&&(
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-gray-500 text-[10px] mb-2 uppercase tracking-wider">Item to place</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['island','bench','fridge','sink','cooktop','dishwasher'] as KitchenSubtype[]).map(st=>(
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
            <div className="grid grid-cols-4 gap-2">
              <button onClick={handleRotateSelected} disabled={!selectedEl||selectedEl.kind==='wall'}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white"
                title="Rotate 90° (R)"><RotateCw className="w-4 h-4"/><span className="text-xs">Rotate</span></button>
              <button onClick={handleFlipSelected} disabled={!selectedEl||(selectedEl.kind!=='door'&&selectedEl.kind!=='window')}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-blue-500/10 hover:border-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-blue-400"
                title="Flip (F)"><FlipHorizontal2 className="w-4 h-4"/><span className="text-xs">Flip</span></button>
              <button onClick={handleCurveSelected} disabled={selectedEl?.kind!=='wall'||!!(selectedEl&&placedWalls.find(w=>w.id===selectedEl.id)?.erase)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg text-sm transition border disabled:opacity-30 disabled:cursor-not-allowed ${selectedWall?.curved?'bg-amber-500/20 border-amber-500/40 text-amber-400':'bg-white/5 border-white/10 text-gray-400 hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-400'}`}
                title="Toggle wall curve"><Minus className="w-4 h-4" style={{transform:'rotate(-15deg)'}}/><span className="text-xs">Curve</span></button>
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

              {/* ── Reusable inline editable row ──
                  Shows: label | [  value  ] mm
                  Slider below for quick drag adjustment.
                  On blur / Enter the value is committed. */}
              {selectedDoor&&(()=>{
                const mmVal = Math.round(selectedDoor.width/unitsPerMeter*1000);
                const setWidth=(mm:number)=>{
                  pushUndo();
                  setPlacedDoors(p=>p.map(d=>d.id===selectedDoor.id?{...d,width:Math.round(mm/1000*unitsPerMeter)}:d));
                };
                const setRot=(deg:number)=>{pushUndo();setPlacedDoors(p=>p.map(d=>d.id===selectedDoor.id?{...d,rotation:((Math.round(deg)%360)+360)%360}:d));};
                return (
                  <div className="space-y-2">
                    {/* Rotation */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-400 text-xs w-16 shrink-0">Rotation</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <input type="number" step={1}
                          value={selectedDoor.rotation}
                          onChange={e=>setRot(+e.target.value)}
                          onBlur={e=>setRot(+e.target.value)}
                          className="w-16 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:border-blue-400 focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                        <span className="text-gray-500 text-xs">°</span>
                      </div>
                    </div>
                    {/* Width */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-400 text-xs w-16 shrink-0">Width</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <input type="number" step={1}
                          value={mmVal}
                          onChange={e=>setWidth(+e.target.value)}
                          onBlur={e=>setWidth(+e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}
                          className="w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:border-blue-400 focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                        <span className="text-gray-500 text-xs">mm</span>
                      </div>
                    </div>
                    {/* Flipped badge */}
                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <span className="text-gray-400">Flipped</span>
                      <span className={`font-mono ${selectedDoor.flipped?'text-blue-400':'text-gray-500'}`}>{selectedDoor.flipped?'Yes':'No'}</span>
                    </div>
                  </div>
                );
              })()}

              {selectedWall&&(
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Length</span>
                    <span className="font-mono text-white">{Math.round(Math.hypot(selectedWall.x2-selectedWall.x1,selectedWall.y2-selectedWall.y1)/unitsPerMeter*1000)} mm</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Angle</span>
                    <span className="font-mono text-white">{Math.round(Math.atan2(selectedWall.y2-selectedWall.y1,selectedWall.x2-selectedWall.x1)*180/Math.PI)}°</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Curved</span>
                    <span className={`font-mono ${selectedWall.curved?'text-amber-400':'text-gray-500'}`}>{selectedWall.curved?'Yes':'No'}</span>
                  </div>
                  <p className="text-gray-600 text-[10px] pt-1">Drag ● endpoints to adjust length. Drag mid-handle to curve.</p>
                </div>
              )}

              {selectedWindow&&(()=>{
                const mmVal=Math.round(selectedWindow.width/unitsPerMeter*1000);
                const setWidth=(mm:number)=>{
                  pushUndo();
                  setPlacedWindows(p=>p.map(w=>w.id===selectedWindow.id?{...w,width:Math.round(mm/1000*unitsPerMeter)}:w));
                };
                const setRot=(deg:number)=>{pushUndo();setPlacedWindows(p=>p.map(w=>w.id===selectedWindow.id?{...w,rotation:((Math.round(deg)%360)+360)%360}:w));};
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-400 text-xs w-16 shrink-0">Rotation</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <input type="number" step={1}
                          value={selectedWindow.rotation}
                          onChange={e=>setRot(+e.target.value)}
                          onBlur={e=>setRot(+e.target.value)}
                          className="w-16 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:border-cyan-400 focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                        <span className="text-gray-500 text-xs">°</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-400 text-xs w-16 shrink-0">Width</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <input type="number" step={1}
                          value={mmVal}
                          onChange={e=>setWidth(+e.target.value)}
                          onBlur={e=>setWidth(+e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}
                          className="w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:border-cyan-400 focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
                        <span className="text-gray-500 text-xs">mm</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {selectedRobe&&(()=>{
                const mmLen=Math.round(selectedRobe.length/unitsPerMeter*1000);
                const mmWid=Math.round(selectedRobe.width/unitsPerMeter*1000);
                const setLen=(mm:number)=>{
                  pushUndo();
                  setPlacedRobes(p=>p.map(r=>r.id===selectedRobe.id?{...r,length:Math.round(mm/1000*unitsPerMeter)}:r));
                };
                const setWid=(mm:number)=>{
                  pushUndo();
                  setPlacedRobes(p=>p.map(r=>r.id===selectedRobe.id?{...r,width:Math.round(mm/1000*unitsPerMeter)}:r));
                };
                const setRot=(deg:number)=>{pushUndo();setPlacedRobes(p=>p.map(r=>r.id===selectedRobe.id?{...r,rotation:((Math.round(deg)%360)+360)%360}:r));};
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-400 text-xs w-16 shrink-0">Rotation</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <input type="number" step={1}
                          value={selectedRobe.rotation}
                          onChange={e=>setRot(+e.target.value)}
                          onBlur={e=>setRot(+e.target.value)}
                          className="w-16 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:border-amber-400 focus:bg-white/15"/>
                        <span className="text-gray-500 text-xs">°</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-400 text-xs w-16 shrink-0">Length</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <input type="number" step={1}
                          value={mmLen}
                          onChange={e=>setLen(+e.target.value)}
                          onBlur={e=>setLen(+e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}
                          className="w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:border-amber-400 focus:bg-white/15"/>
                        <span className="text-gray-500 text-xs">mm</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-gray-400 text-xs w-16 shrink-0">Width</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <input type="number" step={1}
                          value={mmWid}
                          onChange={e=>setWid(+e.target.value)}
                          onBlur={e=>setWid(+e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}
                          className="w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:border-amber-400 focus:bg-white/15"/>
                        <span className="text-gray-500 text-xs">mm</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {selectedKitchen&&(()=>{
                const mmLen=Math.round(selectedKitchen.length/unitsPerMeter*1000);
                const mmDep=Math.round(selectedKitchen.depth/unitsPerMeter*1000);
                const setLen=(mm:number)=>{
                  pushUndo();
                  setPlacedKitchens(p=>p.map(k=>k.id===selectedKitchen.id?{...k,length:Math.round(mm/1000*unitsPerMeter)}:k));
                };
                const setDep=(mm:number)=>{
                  pushUndo();
                  setPlacedKitchens(p=>p.map(k=>k.id===selectedKitchen.id?{...k,depth:Math.round(mm/1000*unitsPerMeter)}:k));
                };
                const setRot=(deg:number)=>{pushUndo();setPlacedKitchens(p=>p.map(k=>k.id===selectedKitchen.id?{...k,rotation:((Math.round(deg)%360)+360)%360}:k));};
                const accentCls='focus:border-orange-400';
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Type</span>
                      <span className="font-mono text-white capitalize">{selectedKitchen.subtype}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-400 text-xs w-16 shrink-0">Rotation</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <input type="number" step={1}
                          value={selectedKitchen.rotation}
                          onChange={e=>setRot(+e.target.value)}
                          onBlur={e=>setRot(+e.target.value)}
                          className={`w-16 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none ${accentCls} focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}/>
                        <span className="text-gray-500 text-xs">°</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-400 text-xs w-16 shrink-0">Length</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <input type="number" step={1}
                          value={mmLen}
                          onChange={e=>setLen(+e.target.value)}
                          onBlur={e=>setLen(+e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}
                          className={`w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none ${accentCls} focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}/>
                        <span className="text-gray-500 text-xs">mm</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-gray-400 text-xs w-16 shrink-0">Depth</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <input type="number" step={1}
                          value={mmDep}
                          onChange={e=>setDep(+e.target.value)}
                          onBlur={e=>setDep(+e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}
                          className={`w-20 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white font-mono text-right focus:outline-none ${accentCls} focus:bg-white/15 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}/>
                        <span className="text-gray-500 text-xs">mm</span>
                      </div>
                    </div>
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
                {label:'Walls',count:placedWalls.length,color:'text-violet-400',bg:'bg-violet-500/10'},
                {label:'Windows',count:placedWindows.length,color:'text-cyan-400',bg:'bg-cyan-500/10'},
                {label:'Robes',count:placedRobes.length,color:'text-amber-400',bg:'bg-amber-500/10'},
                {label:'Kitchen',count:placedKitchens.length,color:'text-orange-400',bg:'bg-orange-500/10'},
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
