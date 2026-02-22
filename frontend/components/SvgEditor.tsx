// frontend/components/SvgEditor.tsx
// Self-contained SVG floor plan editor with multi-element placement.
// Supports doors, windows, sliding doors, walls, robes, kitchen,
// kitchen island, and furniture (bed, sofa, table, toilet, basin, shower, bath).
//
// Renders a 60/40 split: canvas on the left, controls on the right.

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
} from 'lucide-react';

// ── Element Type Definitions ────────────────────────────────────────────────

export type ElementType =
  | 'door'
  | 'sliding_door'
  | 'bifold_door'
  | 'window'
  | 'wall'
  | 'robe'
  | 'kitchen'
  | 'kitchen_island'
  | 'bed_single'
  | 'bed_double'
  | 'sofa'
  | 'dining_table'
  | 'toilet'
  | 'basin'
  | 'shower'
  | 'bathtub';

interface ElementConfig {
  label: string;
  category: 'openings' | 'structure' | 'fixtures' | 'furniture';
  /** Width and height in metres — converted to SVG units at runtime */
  widthM: number;
  heightM: number;
  /** Whether this element clears the wall underneath */
  clearsWall: boolean;
  /** Whether flip makes sense for this element */
  canFlip: boolean;
}

const ELEMENT_CONFIGS: Record<ElementType, ElementConfig> = {
  door:           { label: 'Door',           category: 'openings',  widthM: 0.82, heightM: 0.82, clearsWall: true,  canFlip: true  },
  sliding_door:   { label: 'Sliding Door',   category: 'openings',  widthM: 1.8,  heightM: 0.1,  clearsWall: true,  canFlip: true  },
  bifold_door:    { label: 'Bifold Door',    category: 'openings',  widthM: 1.8,  heightM: 0.1,  clearsWall: true,  canFlip: true  },
  window:         { label: 'Window',         category: 'openings',  widthM: 1.2,  heightM: 0.12, clearsWall: true,  canFlip: false },
  wall:           { label: 'Wall',           category: 'structure', widthM: 1.0,  heightM: 0.1,  clearsWall: false, canFlip: false },
  robe:           { label: 'Robe',           category: 'fixtures',  widthM: 1.8,  heightM: 0.6,  clearsWall: false, canFlip: false },
  kitchen:        { label: 'Kitchen',        category: 'fixtures',  widthM: 3.0,  heightM: 0.6,  clearsWall: false, canFlip: true  },
  kitchen_island: { label: 'Island',         category: 'fixtures',  widthM: 2.0,  heightM: 0.9,  clearsWall: false, canFlip: false },
  bed_single:     { label: 'Single Bed',     category: 'furniture', widthM: 0.92, heightM: 1.88, clearsWall: false, canFlip: false },
  bed_double:     { label: 'Double Bed',     category: 'furniture', widthM: 1.38, heightM: 1.88, clearsWall: false, canFlip: false },
  sofa:           { label: 'Sofa',           category: 'furniture', widthM: 2.0,  heightM: 0.85, clearsWall: false, canFlip: true  },
  dining_table:   { label: 'Dining Table',   category: 'furniture', widthM: 1.6,  heightM: 0.9,  clearsWall: false, canFlip: false },
  toilet:         { label: 'Toilet',         category: 'fixtures',  widthM: 0.38, heightM: 0.7,  clearsWall: false, canFlip: false },
  basin:          { label: 'Basin',          category: 'fixtures',  widthM: 0.5,  heightM: 0.4,  clearsWall: false, canFlip: false },
  shower:         { label: 'Shower',         category: 'fixtures',  widthM: 0.9,  heightM: 0.9,  clearsWall: false, canFlip: false },
  bathtub:        { label: 'Bathtub',        category: 'fixtures',  widthM: 0.7,  heightM: 1.7,  clearsWall: false, canFlip: true  },
};

const CATEGORIES = [
  { key: 'openings' as const,  label: 'Openings' },
  { key: 'structure' as const, label: 'Structure' },
  { key: 'fixtures' as const,  label: 'Fixtures' },
  { key: 'furniture' as const, label: 'Furniture' },
];

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PlacedElement {
  id: number;
  type: ElementType;
  x: number;
  y: number;
  rotation: number;
  w: number;   // width in SVG units
  h: number;   // height in SVG units
  flipped: boolean;
}

// Backwards compat alias
export type PlacedDoor = PlacedElement;

export interface SvgEditorSaveResult {
  previewImageUrl: string;
  elements: PlacedElement[];
  doors: PlacedElement[];       // backward compat — just doors
  updatedAt: string;
}

export interface SvgEditorProps {
  svgUrl: string;
  projectId: number;
  planId: number;
  existingDoors?: PlacedElement[];
  existingElements?: PlacedElement[];
  envelopeWidth?: number;
  onSave: (result: SvgEditorSaveResult) => void;
  onCancel: () => void;
}

// ── SVG Renderers ───────────────────────────────────────────────────────────

/** Render element SVG for the interactive overlay (React JSX) */
function renderElementJsx(
  el: PlacedElement,
  selected: boolean,
  wch: number,
): React.ReactNode {
  const { w, h, type } = el;
  const sc = selected ? '#2563eb' : '#000';
  const sw = selected ? 1.5 : 1;
  const swThin = selected ? 1 : 0.5;

  switch (type) {
    case 'door':
      return <>
        <rect x={-wch} y={-wch/2} width={w + 2*wch} height={wch} fill="#FFF" stroke="none" />
        <line x1="0" y1="0" x2={w} y2="0" stroke={sc} strokeWidth={sw} />
        <path d={`M ${w},0 A ${w},${w} 0 0,0 0,${-w}`} fill="none" stroke={sc} strokeWidth={swThin} strokeDasharray="4,3" />
        <circle cx="0" cy="0" r={selected ? 3 : 1.5} fill={sc} />
      </>;

    case 'sliding_door':
      return <>
        <rect x={-wch} y={-wch/2} width={w + 2*wch} height={wch} fill="#FFF" stroke="none" />
        <line x1="0" y1="0" x2={w} y2="0" stroke={sc} strokeWidth={sw} />
        <line x1={w*0.1} y1={-h*0.4} x2={w*0.55} y2={-h*0.4} stroke={sc} strokeWidth={sw} />
        <line x1={w*0.45} y1={h*0.4} x2={w*0.9} y2={h*0.4} stroke={sc} strokeWidth={sw} />
        <line x1={w*0.1} y1={-h*0.4} x2={w*0.1} y2={0} stroke={sc} strokeWidth={swThin} strokeDasharray="2,2" />
        <line x1={w*0.9} y1={0} x2={w*0.9} y2={h*0.4} stroke={sc} strokeWidth={swThin} strokeDasharray="2,2" />
      </>;

    case 'bifold_door':
      return <>
        <rect x={-wch} y={-wch/2} width={w + 2*wch} height={wch} fill="#FFF" stroke="none" />
        <line x1="0" y1="0" x2={w*0.25} y2={-h*0.8} stroke={sc} strokeWidth={sw} />
        <line x1={w*0.25} y1={-h*0.8} x2={w*0.5} y2="0" stroke={sc} strokeWidth={sw} />
        <line x1={w*0.5} y1="0" x2={w*0.75} y2={-h*0.8} stroke={sc} strokeWidth={sw} />
        <line x1={w*0.75} y1={-h*0.8} x2={w} y2="0" stroke={sc} strokeWidth={sw} />
        <circle cx="0" cy="0" r={selected ? 2 : 1} fill={sc} />
        <circle cx={w} cy="0" r={selected ? 2 : 1} fill={sc} />
      </>;

    case 'window':
      return <>
        <rect x={-wch} y={-wch/2} width={w + 2*wch} height={wch} fill="#FFF" stroke="none" />
        <line x1="0" y1={-h/2} x2={w} y2={-h/2} stroke={sc} strokeWidth={sw} />
        <line x1="0" y1={h/2} x2={w} y2={h/2} stroke={sc} strokeWidth={sw} />
        <line x1={0} y1={-h/2} x2={0} y2={h/2} stroke={sc} strokeWidth={swThin} />
        <line x1={w} y1={-h/2} x2={w} y2={h/2} stroke={sc} strokeWidth={swThin} />
        <line x1={w/2} y1={-h/2} x2={w/2} y2={h/2} stroke={sc} strokeWidth={swThin} />
      </>;

    case 'wall':
      return <rect x="0" y={-h/2} width={w} height={h} fill={sc} stroke="none" />;

    case 'robe':
      return <>
        <rect x="0" y="0" width={w} height={h} fill="none" stroke={sc} strokeWidth={sw} />
        {/* Hanging rail */}
        <line x1={w*0.1} y1={h*0.3} x2={w*0.9} y2={h*0.3} stroke={sc} strokeWidth={swThin} strokeDasharray="3,2" />
        {/* Shelf */}
        <line x1={0} y1={h*0.65} x2={w} y2={h*0.65} stroke={sc} strokeWidth={swThin} />
      </>;

    case 'kitchen':
      return <>
        <rect x="0" y="0" width={w} height={h} fill="none" stroke={sc} strokeWidth={sw} />
        {/* Countertop edge */}
        <line x1="0" y1={h*0.15} x2={w} y2={h*0.15} stroke={sc} strokeWidth={swThin} />
        {/* Sink */}
        <rect x={w*0.35} y={h*0.25} width={w*0.15} height={h*0.55} rx="2" fill="none" stroke={sc} strokeWidth={swThin} />
        <rect x={w*0.52} y={h*0.25} width={w*0.15} height={h*0.55} rx="2" fill="none" stroke={sc} strokeWidth={swThin} />
        {/* Cooktop */}
        <circle cx={w*0.12} cy={h*0.5} r={h*0.15} fill="none" stroke={sc} strokeWidth={swThin} />
        <circle cx={w*0.88} cy={h*0.5} r={h*0.15} fill="none" stroke={sc} strokeWidth={swThin} />
      </>;

    case 'kitchen_island':
      return <>
        <rect x="0" y="0" width={w} height={h} fill="none" stroke={sc} strokeWidth={sw} />
        <rect x={w*0.05} y={h*0.05} width={w*0.9} height={h*0.9} fill="none" stroke={sc} strokeWidth={swThin} strokeDasharray="3,2" />
      </>;

    case 'bed_single':
    case 'bed_double':
      return <>
        <rect x="0" y="0" width={w} height={h} fill="none" stroke={sc} strokeWidth={sw} />
        {/* Pillow */}
        <rect x={w*0.1} y={h*0.04} width={w*0.8} height={h*0.15} rx="2" fill="none" stroke={sc} strokeWidth={swThin} />
        {/* Duvet fold */}
        <line x1={w*0.05} y1={h*0.35} x2={w*0.95} y2={h*0.35} stroke={sc} strokeWidth={swThin} />
      </>;

    case 'sofa':
      return <>
        <rect x="0" y="0" width={w} height={h} rx="3" fill="none" stroke={sc} strokeWidth={sw} />
        {/* Back rest */}
        <rect x={w*0.05} y="0" width={w*0.9} height={h*0.3} rx="2" fill="none" stroke={sc} strokeWidth={swThin} />
        {/* Seat cushions */}
        <line x1={w*0.33} y1={h*0.3} x2={w*0.33} y2={h*0.95} stroke={sc} strokeWidth={swThin} />
        <line x1={w*0.66} y1={h*0.3} x2={w*0.66} y2={h*0.95} stroke={sc} strokeWidth={swThin} />
      </>;

    case 'dining_table':
      return <>
        <rect x="0" y="0" width={w} height={h} rx="2" fill="none" stroke={sc} strokeWidth={sw} />
        {/* Chairs (small rects) */}
        <rect x={w*0.15} y={-h*0.2} width={w*0.2} height={h*0.15} rx="1" fill="none" stroke={sc} strokeWidth={swThin} />
        <rect x={w*0.65} y={-h*0.2} width={w*0.2} height={h*0.15} rx="1" fill="none" stroke={sc} strokeWidth={swThin} />
        <rect x={w*0.15} y={h*1.05} width={w*0.2} height={h*0.15} rx="1" fill="none" stroke={sc} strokeWidth={swThin} />
        <rect x={w*0.65} y={h*1.05} width={w*0.2} height={h*0.15} rx="1" fill="none" stroke={sc} strokeWidth={swThin} />
      </>;

    case 'toilet':
      return <>
        {/* Cistern */}
        <rect x={w*0.1} y="0" width={w*0.8} height={h*0.25} rx="2" fill="none" stroke={sc} strokeWidth={sw} />
        {/* Bowl */}
        <ellipse cx={w/2} cy={h*0.6} rx={w*0.42} ry={h*0.35} fill="none" stroke={sc} strokeWidth={sw} />
      </>;

    case 'basin':
      return <>
        <rect x="0" y="0" width={w} height={h} rx="3" fill="none" stroke={sc} strokeWidth={sw} />
        <ellipse cx={w/2} cy={h*0.5} rx={w*0.3} ry={h*0.3} fill="none" stroke={sc} strokeWidth={swThin} />
        {/* Tap */}
        <circle cx={w/2} cy={h*0.15} r={w*0.06} fill={sc} />
      </>;

    case 'shower':
      return <>
        <rect x="0" y="0" width={w} height={h} fill="none" stroke={sc} strokeWidth={sw} />
        {/* Drain */}
        <circle cx={w/2} cy={h/2} r={w*0.08} fill="none" stroke={sc} strokeWidth={swThin} />
        {/* Shower head */}
        <circle cx={w/2} cy={h*0.15} r={w*0.12} fill="none" stroke={sc} strokeWidth={swThin} strokeDasharray="2,2" />
      </>;

    case 'bathtub':
      return <>
        <rect x="0" y="0" width={w} height={h} rx="5" fill="none" stroke={sc} strokeWidth={sw} />
        <rect x={w*0.08} y={h*0.06} width={w*0.84} height={h*0.88} rx="4" fill="none" stroke={sc} strokeWidth={swThin} />
        {/* Tap end */}
        <circle cx={w/2} cy={h*0.1} r={w*0.06} fill={sc} />
      </>;

    default:
      return <rect x="0" y="0" width={w} height={h} fill="none" stroke={sc} strokeWidth={sw} />;
  }
}

/** Render element SVG string for saving to file */
function renderElementSvgString(el: PlacedElement, wch: number): string {
  const { w, h, type } = el;
  const s = '#000000';

  switch (type) {
    case 'door':
      return [
        `<rect x="${-wch}" y="${-wch/2}" width="${w + 2*wch}" height="${wch}" fill="#FFFFFF" stroke="none"/>`,
        `<line x1="0" y1="0" x2="${w}" y2="0" stroke="${s}" stroke-width="1" fill="none"/>`,
        `<path d="M ${w},0 A ${w},${w} 0 0,1 0,${-w}" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<circle cx="0" cy="0" r="1.5" fill="${s}"/>`,
      ].join('\n  ');

    case 'sliding_door':
      return [
        `<rect x="${-wch}" y="${-wch/2}" width="${w + 2*wch}" height="${wch}" fill="#FFFFFF" stroke="none"/>`,
        `<line x1="0" y1="0" x2="${w}" y2="0" stroke="${s}" stroke-width="1"/>`,
        `<line x1="${w*0.1}" y1="${-h*0.4}" x2="${w*0.55}" y2="${-h*0.4}" stroke="${s}" stroke-width="1"/>`,
        `<line x1="${w*0.45}" y1="${h*0.4}" x2="${w*0.9}" y2="${h*0.4}" stroke="${s}" stroke-width="1"/>`,
        `<line x1="${w*0.1}" y1="${-h*0.4}" x2="${w*0.1}" y2="0" stroke="${s}" stroke-width="0.5" stroke-dasharray="2,2"/>`,
        `<line x1="${w*0.9}" y1="0" x2="${w*0.9}" y2="${h*0.4}" stroke="${s}" stroke-width="0.5" stroke-dasharray="2,2"/>`,
      ].join('\n  ');

    case 'bifold_door':
      return [
        `<rect x="${-wch}" y="${-wch/2}" width="${w + 2*wch}" height="${wch}" fill="#FFFFFF" stroke="none"/>`,
        `<line x1="0" y1="0" x2="${w*0.25}" y2="${-h*0.8}" stroke="${s}" stroke-width="1"/>`,
        `<line x1="${w*0.25}" y1="${-h*0.8}" x2="${w*0.5}" y2="0" stroke="${s}" stroke-width="1"/>`,
        `<line x1="${w*0.5}" y1="0" x2="${w*0.75}" y2="${-h*0.8}" stroke="${s}" stroke-width="1"/>`,
        `<line x1="${w*0.75}" y1="${-h*0.8}" x2="${w}" y2="0" stroke="${s}" stroke-width="1"/>`,
        `<circle cx="0" cy="0" r="1" fill="${s}"/>`,
        `<circle cx="${w}" cy="0" r="1" fill="${s}"/>`,
      ].join('\n  ');

    case 'window':
      return [
        `<rect x="${-wch}" y="${-wch/2}" width="${w + 2*wch}" height="${wch}" fill="#FFFFFF" stroke="none"/>`,
        `<line x1="0" y1="${-h/2}" x2="${w}" y2="${-h/2}" stroke="${s}" stroke-width="1"/>`,
        `<line x1="0" y1="${h/2}" x2="${w}" y2="${h/2}" stroke="${s}" stroke-width="1"/>`,
        `<line x1="0" y1="${-h/2}" x2="0" y2="${h/2}" stroke="${s}" stroke-width="0.5"/>`,
        `<line x1="${w}" y1="${-h/2}" x2="${w}" y2="${h/2}" stroke="${s}" stroke-width="0.5"/>`,
        `<line x1="${w/2}" y1="${-h/2}" x2="${w/2}" y2="${h/2}" stroke="${s}" stroke-width="0.5"/>`,
      ].join('\n  ');

    case 'wall':
      return `<rect x="0" y="${-h/2}" width="${w}" height="${h}" fill="${s}" stroke="none"/>`;

    case 'robe':
      return [
        `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${s}" stroke-width="1"/>`,
        `<line x1="${w*0.1}" y1="${h*0.3}" x2="${w*0.9}" y2="${h*0.3}" stroke="${s}" stroke-width="0.5" stroke-dasharray="3,2"/>`,
        `<line x1="0" y1="${h*0.65}" x2="${w}" y2="${h*0.65}" stroke="${s}" stroke-width="0.5"/>`,
      ].join('\n  ');

    case 'kitchen':
      return [
        `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${s}" stroke-width="1"/>`,
        `<line x1="0" y1="${h*0.15}" x2="${w}" y2="${h*0.15}" stroke="${s}" stroke-width="0.5"/>`,
        `<rect x="${w*0.35}" y="${h*0.25}" width="${w*0.15}" height="${h*0.55}" rx="2" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<rect x="${w*0.52}" y="${h*0.25}" width="${w*0.15}" height="${h*0.55}" rx="2" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<circle cx="${w*0.12}" cy="${h*0.5}" r="${h*0.15}" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<circle cx="${w*0.88}" cy="${h*0.5}" r="${h*0.15}" fill="none" stroke="${s}" stroke-width="0.5"/>`,
      ].join('\n  ');

    case 'kitchen_island':
      return [
        `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${s}" stroke-width="1"/>`,
        `<rect x="${w*0.05}" y="${h*0.05}" width="${w*0.9}" height="${h*0.9}" fill="none" stroke="${s}" stroke-width="0.5" stroke-dasharray="3,2"/>`,
      ].join('\n  ');

    case 'bed_single':
    case 'bed_double':
      return [
        `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${s}" stroke-width="1"/>`,
        `<rect x="${w*0.1}" y="${h*0.04}" width="${w*0.8}" height="${h*0.15}" rx="2" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<line x1="${w*0.05}" y1="${h*0.35}" x2="${w*0.95}" y2="${h*0.35}" stroke="${s}" stroke-width="0.5"/>`,
      ].join('\n  ');

    case 'sofa':
      return [
        `<rect x="0" y="0" width="${w}" height="${h}" rx="3" fill="none" stroke="${s}" stroke-width="1"/>`,
        `<rect x="${w*0.05}" y="0" width="${w*0.9}" height="${h*0.3}" rx="2" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<line x1="${w*0.33}" y1="${h*0.3}" x2="${w*0.33}" y2="${h*0.95}" stroke="${s}" stroke-width="0.5"/>`,
        `<line x1="${w*0.66}" y1="${h*0.3}" x2="${w*0.66}" y2="${h*0.95}" stroke="${s}" stroke-width="0.5"/>`,
      ].join('\n  ');

    case 'dining_table':
      return [
        `<rect x="0" y="0" width="${w}" height="${h}" rx="2" fill="none" stroke="${s}" stroke-width="1"/>`,
        `<rect x="${w*0.15}" y="${-h*0.2}" width="${w*0.2}" height="${h*0.15}" rx="1" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<rect x="${w*0.65}" y="${-h*0.2}" width="${w*0.2}" height="${h*0.15}" rx="1" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<rect x="${w*0.15}" y="${h*1.05}" width="${w*0.2}" height="${h*0.15}" rx="1" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<rect x="${w*0.65}" y="${h*1.05}" width="${w*0.2}" height="${h*0.15}" rx="1" fill="none" stroke="${s}" stroke-width="0.5"/>`,
      ].join('\n  ');

    case 'toilet':
      return [
        `<rect x="${w*0.1}" y="0" width="${w*0.8}" height="${h*0.25}" rx="2" fill="none" stroke="${s}" stroke-width="1"/>`,
        `<ellipse cx="${w/2}" cy="${h*0.6}" rx="${w*0.42}" ry="${h*0.35}" fill="none" stroke="${s}" stroke-width="1"/>`,
      ].join('\n  ');

    case 'basin':
      return [
        `<rect x="0" y="0" width="${w}" height="${h}" rx="3" fill="none" stroke="${s}" stroke-width="1"/>`,
        `<ellipse cx="${w/2}" cy="${h*0.5}" rx="${w*0.3}" ry="${h*0.3}" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<circle cx="${w/2}" cy="${h*0.15}" r="${w*0.06}" fill="${s}"/>`,
      ].join('\n  ');

    case 'shower':
      return [
        `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${s}" stroke-width="1"/>`,
        `<circle cx="${w/2}" cy="${h/2}" r="${w*0.08}" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<circle cx="${w/2}" cy="${h*0.15}" r="${w*0.12}" fill="none" stroke="${s}" stroke-width="0.5" stroke-dasharray="2,2"/>`,
      ].join('\n  ');

    case 'bathtub':
      return [
        `<rect x="0" y="0" width="${w}" height="${h}" rx="5" fill="none" stroke="${s}" stroke-width="1"/>`,
        `<rect x="${w*0.08}" y="${h*0.06}" width="${w*0.84}" height="${h*0.88}" rx="4" fill="none" stroke="${s}" stroke-width="0.5"/>`,
        `<circle cx="${w/2}" cy="${h*0.1}" r="${w*0.06}" fill="${s}"/>`,
      ].join('\n  ');

    default:
      return `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${s}" stroke-width="1"/>`;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SvgEditor({
  svgUrl,
  projectId,
  planId,
  existingDoors,
  existingElements,
  envelopeWidth = 12,
  onSave,
  onCancel,
}: SvgEditorProps) {

  // ── State ──────────────────────────────────────────────────────────────────

  const [isLoading, setIsLoading] = useState(true);
  const [svgContent, setSvgContent] = useState('');
  const [svgViewBox, setSvgViewBox] = useState({ x: 0, y: 0, w: 800, h: 1000 });

  const [elements, setElements] = useState<PlacedElement[]>([]);
  const [activeTool, setActiveTool] = useState<ElementType | 'select'>('door');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [nextId, setNextId] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [scale, setScale] = useState(40); // svgUnitsPerMeter

  const svgRef = useRef<SVGSVGElement>(null);
  const svgContentGroupRef = useRef<SVGGElement>(null);

  // Drag state
  const isDragging = useRef(false);
  const wasDragged = useRef(false);
  const dragElId = useRef<number | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const nudgeStep = useRef(2);
  const [wallClearHeight, setWallClearHeight] = useState(16);

  // Expand the element palette
  const [expandedCategory, setExpandedCategory] = useState<string>('openings');

  // ── Inject original SVG content via DOM ────────────────────────────────────

  useEffect(() => {
    if (!svgContent || !svgContentGroupRef.current) return;
    const cleaned = svgContent.replace(/<\?xml[^?]*\?>\s*/g, '');
    const match = cleaned.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    if (match && match[1]) {
      svgContentGroupRef.current.innerHTML = match[1];
    }
  }, [svgContent]);

  // ── Init: fetch SVG, parse viewBox, detect scale ──────────────────────────

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

          // ── Detect true scale from room dimensions ────────────────────
          let svgUnitsPerMeter = 0;

          const allRects = Array.from(svgEl.querySelectorAll('rect[fill="#1a1a1a"]'));
          const verticalWalls = allRects
            .filter(r => {
              const rw = parseFloat(r.getAttribute('width') || '0');
              const rh = parseFloat(r.getAttribute('height') || '0');
              return rh > rw * 2 && rh > 20;
            })
            .map(r => ({
              x: parseFloat(r.getAttribute('x') || '0'),
              w: parseFloat(r.getAttribute('width') || '0'),
            }));

          const dimTexts = Array.from(svgEl.querySelectorAll('text'));
          const dimRegex = /^(\d+\.?\d*)\s*m\s*x\s*(\d+\.?\d*)\s*m$/i;
          let roomWidthM = 0;
          let roomTextX = 0;

          for (const t of dimTexts) {
            const m = (t.textContent || '').trim().match(dimRegex);
            if (m) {
              const rw = parseFloat(m[1]);
              if (rw > roomWidthM) {
                roomWidthM = rw;
                roomTextX = parseFloat(t.getAttribute('x') || '0');
              }
            }
          }

          if (roomWidthM > 0 && verticalWalls.length >= 2) {
            const sorted = [...verticalWalls].sort((a, b) => a.x - b.x);
            let bestLeft: typeof sorted[0] | null = null;
            let bestRight: typeof sorted[0] | null = null;

            for (const vw of sorted) {
              if (vw.x + vw.w <= roomTextX) bestLeft = vw;
            }
            for (const vw of sorted) {
              if (vw.x >= roomTextX && !bestRight) bestRight = vw;
            }

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
            const buildingWidth = (maxX > minX) ? (maxX - minX) : (vb ? vb[2] : 800);
            svgUnitsPerMeter = buildingWidth / envelopeWidth;
          }

          setScale(svgUnitsPerMeter);
          setWallClearHeight(Math.max(16, Math.round(svgUnitsPerMeter * 0.35)));
          nudgeStep.current = Math.max(1, Math.round(svgUnitsPerMeter * 0.05));
        }

        // Seed existing elements (backward-compat: existingDoors → elements)
        const existing = existingElements || existingDoors || [];
        if (existing.length > 0) {
          setElements(existing);
          setNextId(Math.max(...existing.map(d => d.id)) + 1);
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

  // ── Helper: compute SVG dimensions for a given element type ───────────────

  const getElementDims = useCallback((type: ElementType) => {
    const cfg = ELEMENT_CONFIGS[type];
    return {
      w: Math.round(scale * cfg.widthM),
      h: Math.round(scale * cfg.heightM),
    };
  }, [scale]);

  // ── Canvas click → place element ──────────────────────────────────────────

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (wasDragged.current) {
        wasDragged.current = false;
        return;
      }

      if (activeTool === 'select') {
        setSelectedId(null);
        return;
      }

      const svg = e.currentTarget;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;

      const ctm = svg.getScreenCTM();
      if (!ctm) return;

      const svgPt = pt.matrixTransform(ctm.inverse());
      const dims = getElementDims(activeTool);

      const newEl: PlacedElement = {
        id: nextId,
        type: activeTool,
        x: Math.round(svgPt.x),
        y: Math.round(svgPt.y),
        rotation: 0,
        w: dims.w,
        h: dims.h,
        flipped: false,
      };

      setElements(prev => [...prev, newEl]);
      setNextId(prev => prev + 1);
      setSelectedId(newEl.id);
    },
    [activeTool, nextId, getElementDims],
  );

  const handleElementClick = useCallback(
    (e: React.MouseEvent, elId: number) => {
      e.stopPropagation();
      setSelectedId(elId);
    },
    [],
  );

  // ── Element actions ────────────────────────────────────────────────────────

  const handleRotateSelected = useCallback(() => {
    if (selectedId === null) return;
    setElements(prev =>
      prev.map(d =>
        d.id === selectedId ? { ...d, rotation: (d.rotation + 90) % 360 } : d,
      ),
    );
  }, [selectedId]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedId === null) return;
    setElements(prev => prev.filter(d => d.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const handleUndo = useCallback(() => {
    setElements(prev => {
      if (prev.length === 0) return prev;
      const removed = prev[prev.length - 1];
      if (selectedId === removed.id) setSelectedId(null);
      return prev.slice(0, -1);
    });
  }, [selectedId]);

  const handleFlipSelected = useCallback(() => {
    if (selectedId === null) return;
    setElements(prev =>
      prev.map(d =>
        d.id === selectedId ? { ...d, flipped: !d.flipped } : d,
      ),
    );
  }, [selectedId]);

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedId === null) return;
      const step = e.shiftKey ? nudgeStep.current * 5 : nudgeStep.current;
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
        case 'f':
        case 'F':          handleFlipSelected(); return;
        default: return;
      }

      e.preventDefault();
      setElements(prev =>
        prev.map(d =>
          d.id === selectedId ? { ...d, x: d.x + dx, y: d.y + dy } : d,
        ),
      );
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, handleDeleteSelected, handleRotateSelected, handleFlipSelected]);

  // ── Mouse drag ────────────────────────────────────────────────────────────

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

  const handleElementMouseDown = useCallback(
    (e: React.MouseEvent, elId: number) => {
      e.stopPropagation();
      e.preventDefault();
      setSelectedId(elId);
      setActiveTool('select');

      const svgPt = screenToSvg(e.clientX, e.clientY);
      if (!svgPt) return;

      const el = elements.find(d => d.id === elId);
      if (!el) return;

      isDragging.current = true;
      wasDragged.current = false;
      dragElId.current = elId;
      dragOffset.current = { x: svgPt.x - el.x, y: svgPt.y - el.y };
    },
    [elements, screenToSvg],
  );

  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging.current || dragElId.current === null) return;
      wasDragged.current = true;

      const svgPt = screenToSvg(e.clientX, e.clientY);
      if (!svgPt) return;

      setElements(prev =>
        prev.map(d =>
          d.id === dragElId.current
            ? { ...d, x: Math.round(svgPt.x - dragOffset.current.x), y: Math.round(svgPt.y - dragOffset.current.y) }
            : d,
        ),
      );
    },
    [screenToSvg],
  );

  const handleSvgMouseUp = useCallback(() => {
    isDragging.current = false;
    dragElId.current = null;
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!svgContent) return;
    setIsSaving(true);

    try {
      const elementsSvg = elements
        .map(el => {
          const flipScale = el.flipped ? ' scale(1,-1)' : '';
          const inner = renderElementSvgString(el, wallClearHeight);
          return `<g transform="translate(${el.x}, ${el.y}) rotate(${el.rotation})${flipScale}" class="editor-element" data-element-type="${el.type}" data-element-id="${el.id}">
  ${inner}
</g>`;
        })
        .join('\n');

      let modifiedSvg = svgContent.replace(
        /<g\s+id="(doors-layer|editor-elements)"[\s\S]*?<\/g>\s*/g,
        '',
      );
      modifiedSvg = modifiedSvg.replace(
        '</svg>',
        `<g id="editor-elements">\n${elementsSvg}\n</g>\n</svg>`,
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
            doors: elements.filter(e => e.type === 'door'),
            elements: elements,
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
        elements: elements,
        doors: elements.filter(e => e.type === 'door'),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('SvgEditor save failed:', err);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const selectedEl = elements.find(e => e.id === selectedId) || null;
  const selectedConfig = selectedEl ? ELEMENT_CONFIGS[selectedEl.type] : null;

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── LEFT: SVG Canvas (60%) ──────────────────────────────────────── */}
      <div className="w-full lg:w-[60%] p-3 sm:p-4 lg:p-6 flex flex-col overflow-visible lg:overflow-hidden min-h-[300px] sm:min-h-[400px]">
        <div className="flex-1 bg-white rounded-xl shadow-xl overflow-hidden relative">
          <svg
            ref={svgRef}
            viewBox={`${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.w} ${svgViewBox.h}`}
            className="w-full h-full"
            style={{ cursor: isDragging.current ? 'grabbing' : activeTool !== 'select' ? 'crosshair' : 'default' }}
            onClick={handleCanvasClick}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
            preserveAspectRatio="xMidYMid meet"
            tabIndex={0}
          >
            <g ref={svgContentGroupRef} />

            <g id="elements-overlay">
              {elements.map(el => {
                const selected = el.id === selectedId;
                const flipScale = el.flipped ? ' scale(1,-1)' : '';
                const cfg = ELEMENT_CONFIGS[el.type];
                // Selection bounding box
                const bx = cfg.clearsWall ? -wallClearHeight : -2;
                const by = cfg.clearsWall ? -(Math.max(el.w, el.h) + 6) : -2;
                const bw = cfg.clearsWall ? (el.w + 2 * wallClearHeight + 4) : (el.w + 4);
                const bh = cfg.clearsWall ? (Math.max(el.w, el.h) + el.h + 12) : (el.h + 4);

                return (
                  <g
                    key={el.id}
                    transform={`translate(${el.x}, ${el.y}) rotate(${el.rotation})${flipScale}`}
                    onClick={e => handleElementClick(e, el.id)}
                    onMouseDown={e => handleElementMouseDown(e, el.id)}
                    style={{ cursor: selected ? 'grab' : 'pointer' }}
                  >
                    {selected && (
                      <rect
                        x={bx} y={by}
                        width={bw} height={bh}
                        fill="rgba(59,130,246,0.06)"
                        stroke="#3b82f6" strokeWidth="1.5"
                        strokeDasharray="5,3" rx="2"
                      />
                    )}
                    {renderElementJsx(el, selected, wallClearHeight)}
                  </g>
                );
              })}
            </g>
          </svg>

          {elements.length === 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full pointer-events-none">
              Select a tool then click on the floor plan to place it
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Editor Controls (40%) ───────────────────────────────── */}
      <div className="w-full lg:w-[40%] p-3 sm:p-4 lg:p-6 border-t lg:border-t-0 lg:border-l border-white/10 overflow-y-auto">
        <div className="space-y-4">

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

          {/* ── Tool Palette ─────────────────────────────────────────────── */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            {/* Select tool */}
            <button
              onClick={() => { setActiveTool('select'); setSelectedId(null); }}
              className={`w-full flex items-center gap-2 p-2.5 rounded-lg text-sm font-medium transition mb-3 ${
                activeTool === 'select'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
              }`}
            >
              <MousePointer className="w-4 h-4" />
              Select / Move
            </button>

            {/* Category accordions */}
            {CATEGORIES.map(cat => {
              const catElements = (Object.entries(ELEMENT_CONFIGS) as [ElementType, ElementConfig][])
                .filter(([, cfg]) => cfg.category === cat.key);
              const isExpanded = expandedCategory === cat.key;

              return (
                <div key={cat.key} className="mb-1">
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? '' : cat.key)}
                    className="w-full flex items-center justify-between py-2 px-1 text-xs font-medium uppercase tracking-wider text-gray-400 hover:text-white transition"
                  >
                    {cat.label}
                    <span className="text-[10px]">{isExpanded ? '▾' : '▸'}</span>
                  </button>
                  {isExpanded && (
                    <div className="grid grid-cols-3 gap-1.5 pb-2">
                      {catElements.map(([type, cfg]) => (
                        <button
                          key={type}
                          onClick={() => { setActiveTool(type); setSelectedId(null); }}
                          className={`flex flex-col items-center gap-1 p-2 rounded-lg text-[11px] font-medium transition ${
                            activeTool === type
                              ? 'bg-blue-600 text-white'
                              : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
                          }`}
                        >
                          <span className="text-[10px] leading-tight text-center">{cfg.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">
              Actions {selectedEl && <span className="text-blue-400 normal-case">— {ELEMENT_CONFIGS[selectedEl.type].label}</span>}
            </h4>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={handleRotateSelected}
                disabled={selectedId === null}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white"
                title="Rotate 90° (R)"
              >
                <RotateCw className="w-4 h-4" />
                <span className="text-[10px]">Rotate</span>
              </button>
              <button
                onClick={handleFlipSelected}
                disabled={selectedId === null || (selectedConfig && !selectedConfig.canFlip)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-blue-500/10 hover:border-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-blue-400"
                title="Flip / mirror (F)"
              >
                <FlipHorizontal2 className="w-4 h-4" />
                <span className="text-[10px]">Flip</span>
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={selectedId === null}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-red-400"
                title="Delete (Del)"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-[10px]">Delete</span>
              </button>
              <button
                onClick={handleUndo}
                disabled={elements.length === 0}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg text-sm transition bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white"
                title="Undo last"
              >
                <Undo2 className="w-4 h-4" />
                <span className="text-[10px]">Undo</span>
              </button>
            </div>
            <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
              <div className="flex items-center gap-2 text-gray-500 text-[10px]">
                <Move className="w-3 h-3" />
                <span>Arrow keys to nudge · Shift = 5× faster</span>
              </div>
              <div className="text-gray-500 text-[10px] ml-5">
                Drag to move · R = rotate · F = flip · Del = delete
              </div>
            </div>
          </div>

          {/* ── Placed Elements List ─────────────────────────────────────── */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Placed Elements</h4>
              <span className="text-white font-semibold text-lg">{elements.length}</span>
            </div>
            {elements.length > 0 && (
              <div className="mt-2 max-h-[180px] overflow-y-auto space-y-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                {elements.map((el, idx) => {
                  const cfg = ELEMENT_CONFIGS[el.type];
                  return (
                    <button
                      key={el.id}
                      onClick={() => { setActiveTool('select'); setSelectedId(el.id); }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition ${
                        el.id === selectedId
                          ? 'bg-blue-600/20 border border-blue-500/50 text-blue-400'
                          : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-current opacity-50" />
                        {cfg.label} {idx + 1}
                      </span>
                      <span className="font-mono text-[10px]">{el.rotation}°{el.flipped ? ' ↔' : ''}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Save / Cancel ────────────────────────────────────────────── */}
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
