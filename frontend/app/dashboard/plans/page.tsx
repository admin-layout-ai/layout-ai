// frontend/app/dashboard/plans/page.tsx
'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, 
  MapPin, 
  CheckCircle2, 
  AlertCircle,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Loader2,
  Download,
  Home,
  Bed,
  Bath,
  Car,
  Maximize2,
  Grid3X3
} from 'lucide-react';
import api, { Project, FloorPlan } from '@/lib/api';

// Professional room colors matching architectural standards
const ROOM_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  garage: { fill: '#e5e7eb', stroke: '#6b7280', label: 'Garage' },
  entry: { fill: '#fef3c7', stroke: '#d97706', label: 'Entry' },
  porch: { fill: '#fef3c7', stroke: '#d97706', label: 'Porch' },
  family: { fill: '#dbeafe', stroke: '#2563eb', label: 'Family' },
  living: { fill: '#dbeafe', stroke: '#2563eb', label: 'Living' },
  theatre: { fill: '#e0e7ff', stroke: '#4f46e5', label: 'Theatre' },
  dining: { fill: '#fce7f3', stroke: '#db2777', label: 'Dining' },
  kitchen: { fill: '#ccfbf1', stroke: '#0d9488', label: 'Kitchen' },
  kitchen_dining: { fill: '#ccfbf1', stroke: '#0d9488', label: 'Kitchen/Dining' },
  pantry: { fill: '#d1fae5', stroke: '#059669', label: 'Pantry' },
  laundry: { fill: '#cffafe', stroke: '#0891b2', label: 'Laundry' },
  bedroom: { fill: '#ede9fe', stroke: '#7c3aed', label: 'Bedroom' },
  ensuite: { fill: '#fae8ff', stroke: '#c026d3', label: 'Ensuite' },
  bathroom: { fill: '#fae8ff', stroke: '#c026d3', label: 'Bathroom' },
  powder: { fill: '#fae8ff', stroke: '#c026d3', label: 'Powder' },
  wir: { fill: '#fef9c3', stroke: '#ca8a04', label: 'WIR' },
  robe: { fill: '#fef9c3', stroke: '#ca8a04', label: 'Robe' },
  office: { fill: '#fee2e2', stroke: '#dc2626', label: 'Study' },
  store: { fill: '#f3f4f6', stroke: '#9ca3af', label: 'Store' },
  mudroom: { fill: '#f3f4f6', stroke: '#9ca3af', label: 'Mud Room' },
  alfresco: { fill: '#bbf7d0', stroke: '#16a34a', label: 'Alfresco' },
  balcony: { fill: '#bbf7d0', stroke: '#16a34a', label: 'Balcony' },
  hallway: { fill: '#f9fafb', stroke: '#d1d5db', label: 'Hall' },
  linen: { fill: '#f3f4f6', stroke: '#9ca3af', label: 'Linen' },
  study_nook: { fill: '#fee2e2', stroke: '#dc2626', label: 'Study Nook' },
};

interface LayoutData {
  design_name?: string;
  description?: string;
  rooms?: Room[];
  summary?: {
    total_area?: number;
    living_area?: number;
    bedroom_count?: number;
    bathroom_count?: number;
    garage_spaces?: number;
    outdoor_area?: number;
  };
  land_utilization?: {
    building_width?: number;
    building_depth?: number;
    building_footprint?: number;
    land_coverage_percent?: number;
  };
  compliance?: {
    ncc_compliant?: boolean;
    notes?: string[];
  };
}

interface Room {
  id?: string;
  type: string;
  name: string;
  area: number;
  width: number;
  depth: number;
  x: number;
  y: number;
  floor?: number;
  features?: string[];
  connections?: string[];
}

function PlansContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = parseInt(searchParams.get('projectId') || '0');
  const canvasRef = useRef<SVGSVGElement>(null);
  
  const [project, setProject] = useState<Project | null>(null);
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<FloorPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [selectedFloor, setSelectedFloor] = useState(0);

  useEffect(() => {
    if (projectId > 0) {
      loadData();
    } else {
      setError('No project ID provided');
      setLoading(false);
    }
  }, [projectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [projectData, plansData] = await Promise.all([
        api.getProject(projectId),
        api.getFloorPlans(projectId)
      ]);
      
      setProject(projectData);
      setFloorPlans(plansData);
      
      if (plansData.length > 0) {
        setSelectedPlan(plansData[0]);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load floor plans');
    } finally {
      setLoading(false);
    }
  };

  const parseLayoutData = (plan: FloorPlan): LayoutData | null => {
    if (!plan.layout_data) return null;
    try {
      return JSON.parse(plan.layout_data);
    } catch {
      return null;
    }
  };

  const renderProfessionalFloorPlan = (plan: FloorPlan) => {
    const layoutData = parseLayoutData(plan);
    if (!layoutData || !layoutData.rooms || layoutData.rooms.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <Layers className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No floor plan data available</p>
          </div>
        </div>
      );
    }

    // Filter rooms by floor
    const rooms = layoutData.rooms.filter(r => (r.floor || 0) === selectedFloor);
    
    if (rooms.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          <p>No rooms on this floor</p>
        </div>
      );
    }

    // Calculate bounds with padding
    const padding = 2;
    const minX = Math.min(...rooms.map(r => r.x)) - padding;
    const minY = Math.min(...rooms.map(r => r.y)) - padding;
    const maxX = Math.max(...rooms.map(r => r.x + r.width)) + padding;
    const maxY = Math.max(...rooms.map(r => r.y + r.depth)) + padding;
    
    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;
    
    // Canvas dimensions
    const canvasWidth = 800;
    const canvasHeight = 600;
    
    // Scale to fit
    const scaleX = canvasWidth / totalWidth;
    const scaleY = canvasHeight / totalHeight;
    const baseScale = Math.min(scaleX, scaleY) * 0.85;
    const scale = baseScale * zoom;
    
    const offsetX = (canvasWidth - totalWidth * scale) / 2 - minX * scale;
    const offsetY = (canvasHeight - totalHeight * scale) / 2 - minY * scale;

    return (
      <svg 
        ref={canvasRef}
        width="100%" 
        height="100%" 
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        className="bg-white"
        style={{ minHeight: '500px' }}
      >
        {/* Background */}
        <rect width="100%" height="100%" fill="#ffffff" />
        
        {/* Grid pattern */}
        {showGrid && (
          <>
            <defs>
              <pattern id="smallGrid" width={scale} height={scale} patternUnits="userSpaceOnUse">
                <path d={`M ${scale} 0 L 0 0 0 ${scale}`} fill="none" stroke="#f0f0f0" strokeWidth="0.5"/>
              </pattern>
              <pattern id="largeGrid" width={scale * 5} height={scale * 5} patternUnits="userSpaceOnUse">
                <rect width={scale * 5} height={scale * 5} fill="url(#smallGrid)"/>
                <path d={`M ${scale * 5} 0 L 0 0 0 ${scale * 5}`} fill="none" stroke="#e0e0e0" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#largeGrid)" />
          </>
        )}
        
        {/* Rooms */}
        {rooms.map((room, index) => {
          const x = room.x * scale + offsetX;
          const y = room.y * scale + offsetY;
          const width = room.width * scale;
          const height = room.depth * scale;
          const colors = ROOM_COLORS[room.type] || { fill: '#f3f4f6', stroke: '#6b7280', label: room.type };
          
          return (
            <g key={room.id || index}>
              {/* Room fill */}
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={2}
              />
              
              {/* Room label - centered */}
              {width > 30 && height > 25 && (
                <g>
                  <text
                    x={x + width / 2}
                    y={y + height / 2 - 8}
                    textAnchor="middle"
                    fill="#1f2937"
                    fontSize={Math.min(14, width / 6)}
                    fontWeight="600"
                    fontFamily="Arial, sans-serif"
                  >
                    {room.name.toUpperCase()}
                  </text>
                  <text
                    x={x + width / 2}
                    y={y + height / 2 + 10}
                    textAnchor="middle"
                    fill="#6b7280"
                    fontSize={Math.min(11, width / 8)}
                    fontFamily="Arial, sans-serif"
                  >
                    {room.width.toFixed(1)} × {room.depth.toFixed(1)}m
                  </text>
                  <text
                    x={x + width / 2}
                    y={y + height / 2 + 24}
                    textAnchor="middle"
                    fill="#9ca3af"
                    fontSize={Math.min(10, width / 9)}
                    fontFamily="Arial, sans-serif"
                  >
                    {room.area.toFixed(1)}m²
                  </text>
                </g>
              )}
              
              {/* Smaller rooms - just area */}
              {width > 20 && width <= 30 && height > 15 && (
                <text
                  x={x + width / 2}
                  y={y + height / 2 + 4}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize={9}
                  fontFamily="Arial, sans-serif"
                >
                  {room.area.toFixed(0)}m²
                </text>
              )}
            </g>
          );
        })}
        
        {/* Scale bar */}
        <g transform={`translate(${canvasWidth - 120}, ${canvasHeight - 40})`}>
          <rect x="0" y="0" width="100" height="20" fill="white" fillOpacity="0.9" rx="4" />
          <line x1="10" y1="10" x2={10 + 5 * scale} y2="10" stroke="#1f2937" strokeWidth="2" />
          <line x1="10" y1="5" x2="10" y2="15" stroke="#1f2937" strokeWidth="2" />
          <line x1={10 + 5 * scale} y1="5" x2={10 + 5 * scale} y2="15" stroke="#1f2937" strokeWidth="2" />
          <text x={10 + 2.5 * scale} y="18" textAnchor="middle" fill="#1f2937" fontSize="10" fontFamily="Arial">
            5m
          </text>
        </g>
        
        {/* Title */}
        <text x="20" y="30" fill="#1f2937" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif">
          {layoutData.design_name || 'Floor Plan'}
        </text>
        <text x="20" y="50" fill="#6b7280" fontSize="12" fontFamily="Arial, sans-serif">
          {selectedFloor === 0 ? 'GROUND FLOOR' : `FLOOR ${selectedFloor}`}
        </text>
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading floor plan...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-6">{error || 'Project not found'}</p>
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const layoutData = selectedPlan ? parseLayoutData(selectedPlan) : null;
  const summary = layoutData?.summary;
  const hasMultipleFloors = layoutData?.rooms?.some(r => (r.floor || 0) > 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button 
            onClick={() => router.push(`/dashboard/projects?view=${projectId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Project
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              <p className="text-gray-500 flex items-center gap-2 mt-1">
                <MapPin className="w-4 h-4" />
                {project.suburb}, {project.state} {project.postcode}
              </p>
            </div>
            
            {layoutData?.compliance?.ncc_compliant && (
              <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">NCC Compliant</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {floorPlans.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm">
            <Layers className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Floor Plan Yet</h2>
            <p className="text-gray-500 mb-6">Generate a floor plan to see it here.</p>
            <button
              onClick={() => router.push(`/dashboard/projects?view=${projectId}`)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Back to Project
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Summary Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              {/* Design Info */}
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-3">
                  {layoutData?.design_name || 'Floor Plan'}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {layoutData?.description || 'Custom designed floor plan'}
                </p>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <Maximize2 className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                    <div className="text-lg font-bold text-gray-900">{summary?.total_area?.toFixed(0) || '—'}</div>
                    <div className="text-xs text-gray-500">Total m²</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <Bed className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                    <div className="text-lg font-bold text-gray-900">{summary?.bedroom_count || '—'}</div>
                    <div className="text-xs text-gray-500">Bedrooms</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <Bath className="w-5 h-5 text-cyan-600 mx-auto mb-1" />
                    <div className="text-lg font-bold text-gray-900">{summary?.bathroom_count || '—'}</div>
                    <div className="text-xs text-gray-500">Bathrooms</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <Car className="w-5 h-5 text-gray-600 mx-auto mb-1" />
                    <div className="text-lg font-bold text-gray-900">{summary?.garage_spaces || '—'}</div>
                    <div className="text-xs text-gray-500">Garage</div>
                  </div>
                </div>
              </div>

              {/* Floor Selector (if multi-storey) */}
              {hasMultipleFloors && (
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <h4 className="font-medium text-gray-900 mb-3">Floor Level</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedFloor(0)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                        selectedFloor === 0 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Ground
                    </button>
                    <button
                      onClick={() => setSelectedFloor(1)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                        selectedFloor === 1 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      First Floor
                    </button>
                  </div>
                </div>
              )}

              {/* Room Legend */}
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <h4 className="font-medium text-gray-900 mb-3">Room Types</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {Object.entries(ROOM_COLORS).slice(0, 12).map(([type, colors]) => (
                    <div key={type} className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded border"
                        style={{ backgroundColor: colors.fill, borderColor: colors.stroke }}
                      />
                      <span className="text-xs text-gray-600">{colors.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Floor Plan Canvas */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between p-4 border-b bg-gray-50">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setShowGrid(!showGrid)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
                        showGrid ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <Grid3X3 className="w-4 h-4" />
                      Grid
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
                      className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                    >
                      <ZoomOut className="w-4 h-4 text-gray-600" />
                    </button>
                    <span className="text-sm text-gray-600 w-16 text-center">{(zoom * 100).toFixed(0)}%</span>
                    <button
                      onClick={() => setZoom(z => Math.min(2, z + 0.1))}
                      className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                    >
                      <ZoomIn className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      onClick={() => setZoom(1)}
                      className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                    >
                      <RotateCcw className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
                
                {/* Canvas */}
                <div className="h-[600px] overflow-auto bg-gray-100 p-4">
                  {selectedPlan && renderProfessionalFloorPlan(selectedPlan)}
                </div>
              </div>

              {/* Room Schedule Table */}
              {layoutData?.rooms && layoutData.rooms.length > 0 && (
                <div className="mt-6 bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b bg-gray-50">
                    <h3 className="font-semibold text-gray-900">Room Schedule</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Room</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Type</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Dimensions</th>
                          <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Area</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Floor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {layoutData.rooms
                          .filter(r => (r.floor || 0) === selectedFloor)
                          .map((room, index) => (
                          <tr key={room.id || index} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-3 px-4 font-medium text-gray-900">{room.name}</td>
                            <td className="py-3 px-4 text-gray-600 capitalize">{room.type.replace('_', ' ')}</td>
                            <td className="py-3 px-4 text-gray-600">{room.width.toFixed(1)}m × {room.depth.toFixed(1)}m</td>
                            <td className="py-3 px-4 text-right text-gray-900 font-medium">{room.area.toFixed(1)} m²</td>
                            <td className="py-3 px-4 text-gray-600">{(room.floor || 0) === 0 ? 'Ground' : `Level ${room.floor}`}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-50">
                        <tr>
                          <td colSpan={3} className="py-3 px-4 font-semibold text-blue-900">
                            Total ({selectedFloor === 0 ? 'Ground Floor' : `Level ${selectedFloor}`})
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-blue-900">
                            {layoutData.rooms
                              .filter(r => (r.floor || 0) === selectedFloor)
                              .reduce((sum, r) => sum + r.area, 0)
                              .toFixed(1)} m²
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    }>
      <PlansContent />
    </Suspense>
  );
}
