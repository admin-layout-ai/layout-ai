// frontend/app/dashboard/plans/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
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
  Loader2
} from 'lucide-react';
import api, { Project, FloorPlan } from '@/lib/api';

// Room colors for visualization
const ROOM_COLORS: Record<string, string> = {
  bedroom: '#3b82f6',
  bathroom: '#8b5cf6',
  ensuite: '#a855f7',
  living: '#22c55e',
  kitchen: '#f59e0b',
  dining: '#f97316',
  kitchen_dining: '#eab308',
  garage: '#6b7280',
  entry: '#94a3b8',
  laundry: '#06b6d4',
  office: '#ec4899',
  alfresco: '#84cc16',
  wir: '#d946ef',
  pantry: '#14b8a6',
  hallway: '#cbd5e1',
  open_plan: '#10b981',
};

interface LayoutData {
  variant_name?: string;
  description?: string;
  rooms?: Room[];
  total_area?: number;
  living_area?: number;
  building_width?: number;
  building_depth?: number;
  compliant?: boolean;
  compliance_notes?: string;
  style?: string;
  storeys?: number;
}

interface Room {
  type: string;
  name: string;
  area: number;
  width: number;
  depth: number;
  x: number;
  y: number;
  floor?: number;
}

function PlansContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = parseInt(searchParams.get('projectId') || '0');
  
  const [project, setProject] = useState<Project | null>(null);
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<FloorPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

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
      
      console.log('Loaded project:', projectData);
      console.log('Loaded plans:', plansData);
      
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
      console.error('Failed to parse layout_data:', plan.layout_data);
      return null;
    }
  };

  const getStatusBadge = (status?: string) => {
    const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
      generated: { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: <CheckCircle2 className="w-4 h-4" />, label: 'Generated' },
      generating: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Generating' },
      error: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <AlertCircle className="w-4 h-4" />, label: 'Error' },
      draft: { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: <AlertCircle className="w-4 h-4" />, label: 'Draft' },
    };
    const config = statusConfig[status || 'draft'] || statusConfig.draft;
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${config.color}`}>
        {config.icon} {config.label}
      </span>
    );
  };

  const renderFloorPlanCanvas = (plan: FloorPlan) => {
    const layoutData = parseLayoutData(plan);
    if (!layoutData || !layoutData.rooms || layoutData.rooms.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No room layout data available</p>
            <p className="text-xs mt-2 text-gray-500">layout_data: {plan.layout_data ? 'exists' : 'null'}</p>
          </div>
        </div>
      );
    }

    const rooms = layoutData.rooms;
    
    // Calculate bounds
    const minX = Math.min(...rooms.map(r => r.x));
    const minY = Math.min(...rooms.map(r => r.y));
    const maxX = Math.max(...rooms.map(r => r.x + r.width));
    const maxY = Math.max(...rooms.map(r => r.y + r.depth));
    
    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;
    
    // Scale to fit canvas
    const canvasWidth = 600;
    const canvasHeight = 450;
    const padding = 40;
    
    const scaleX = (canvasWidth - padding * 2) / totalWidth;
    const scaleY = (canvasHeight - padding * 2) / totalHeight;
    const scale = Math.min(scaleX, scaleY) * zoom;
    
    const offsetX = (canvasWidth - totalWidth * scale) / 2 + pan.x;
    const offsetY = (canvasHeight - totalHeight * scale) / 2 + pan.y;

    return (
      <svg 
        width="100%" 
        height="100%" 
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        className="bg-slate-900 rounded-lg"
      >
        {/* Grid pattern */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Rooms */}
        {rooms.map((room, index) => {
          const x = (room.x - minX) * scale + offsetX;
          const y = (room.y - minY) * scale + offsetY;
          const width = room.width * scale;
          const height = room.depth * scale;
          const color = ROOM_COLORS[room.type] || '#475569';
          
          return (
            <g key={index}>
              {/* Room rectangle */}
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={color}
                fillOpacity={0.3}
                stroke={color}
                strokeWidth={2}
                rx={4}
              />
              
              {/* Room label */}
              {width > 40 && height > 30 && (
                <>
                  <text
                    x={x + width / 2}
                    y={y + height / 2 - 6}
                    textAnchor="middle"
                    fill="white"
                    fontSize={Math.min(12, width / 8)}
                    fontWeight="500"
                  >
                    {room.name}
                  </text>
                  <text
                    x={x + width / 2}
                    y={y + height / 2 + 10}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.6)"
                    fontSize={Math.min(10, width / 10)}
                  >
                    {room.area.toFixed(1)}m²
                  </text>
                </>
              )}
            </g>
          );
        })}
        
        {/* Scale indicator */}
        <g transform={`translate(${canvasWidth - 100}, ${canvasHeight - 30})`}>
          <line x1="0" y1="0" x2="60" y2="0" stroke="white" strokeWidth="2" />
          <line x1="0" y1="-5" x2="0" y2="5" stroke="white" strokeWidth="2" />
          <line x1="60" y1="-5" x2="60" y2="5" stroke="white" strokeWidth="2" />
          <text x="30" y="15" textAnchor="middle" fill="white" fontSize="10">
            {(60 / scale).toFixed(1)}m
          </text>
        </g>
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading floor plans...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error Loading Floor Plans</h2>
          <p className="text-gray-400 mb-4">{error || 'Project not found'}</p>
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const selectedLayoutData = selectedPlan ? parseLayoutData(selectedPlan) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button 
            onClick={() => router.push(`/dashboard/projects?view=${projectId}`)}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Project
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">{project.name} - Floor Plans</h1>
                {getStatusBadge(project.status)}
              </div>
              <p className="text-gray-400 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {project.suburb}, {project.state} {project.postcode}
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        {floorPlans.length === 0 ? (
          <div className="bg-white/5 rounded-xl p-12 border border-white/10 text-center">
            <Layers className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No Floor Plans Yet</h2>
            <p className="text-gray-400 mb-6">Floor plans are being generated or haven&apos;t been created yet.</p>
            <button
              onClick={() => router.push(`/dashboard/projects?view=${projectId}`)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Back to Project
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Plan Selector Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-lg font-semibold text-white mb-4">Select Variant</h2>
              
              {floorPlans.map((plan) => {
                const layoutData = parseLayoutData(plan);
                const isSelected = selectedPlan?.id === plan.id;
                
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`w-full p-4 rounded-xl border text-left transition ${
                      isSelected 
                        ? 'bg-blue-600/20 border-blue-500' 
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">
                        {layoutData?.variant_name || `Variant ${plan.variant_number}`}
                      </span>
                      <span className={`w-3 h-3 rounded-full ${isSelected ? 'bg-blue-500' : 'bg-gray-600'}`} />
                    </div>
                    <p className="text-gray-400 text-sm mb-2">
                      {layoutData?.description || 'Floor plan variant'}
                    </p>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>{plan.total_area?.toFixed(0) || layoutData?.total_area?.toFixed(0) || '—'} m²</span>
                      <span>{layoutData?.rooms?.length || 0} rooms</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Floor Plan Visualization */}
            <div className="lg:col-span-3">
              <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">
                      {selectedLayoutData?.variant_name || `Variant ${selectedPlan?.variant_number}`}
                    </h3>
                    {selectedPlan?.is_compliant && (
                      <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs">
                        NCC Compliant
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
                      className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4 text-white" />
                    </button>
                    <span className="text-white text-sm w-16 text-center">{(zoom * 100).toFixed(0)}%</span>
                    <button
                      onClick={() => setZoom(z => Math.min(2, z + 0.1))}
                      className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                      className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition"
                      title="Reset View"
                    >
                      <RotateCcw className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
                
                {/* Canvas */}
                <div className="h-[500px] p-4">
                  {selectedPlan && renderFloorPlanCanvas(selectedPlan)}
                </div>
                
                {/* Room Legend */}
                <div className="p-4 border-t border-white/10">
                  <h4 className="text-sm font-medium text-gray-400 mb-3">Room Types</h4>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(ROOM_COLORS).slice(0, 10).map(([type, color]) => (
                      <div key={type} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
                        <span className="text-xs text-gray-400 capitalize">{type.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Room Schedule */}
              {selectedLayoutData?.rooms && selectedLayoutData.rooms.length > 0 && (
                <div className="mt-6 bg-white/5 rounded-xl border border-white/10 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Room Schedule</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-gray-400 text-sm border-b border-white/10">
                          <th className="pb-3">Room</th>
                          <th className="pb-3">Type</th>
                          <th className="pb-3">Dimensions</th>
                          <th className="pb-3">Area</th>
                        </tr>
                      </thead>
                      <tbody className="text-white">
                        {selectedLayoutData.rooms.map((room, index) => (
                          <tr key={index} className="border-b border-white/5">
                            <td className="py-3 font-medium">{room.name}</td>
                            <td className="py-3 text-gray-400 capitalize">{room.type.replace('_', ' ')}</td>
                            <td className="py-3 text-gray-400">{room.width.toFixed(1)}m × {room.depth.toFixed(1)}m</td>
                            <td className="py-3">{room.area.toFixed(1)} m²</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="text-blue-400 font-semibold">
                          <td className="pt-4" colSpan={3}>Total Area</td>
                          <td className="pt-4">
                            {selectedLayoutData.rooms.reduce((sum, r) => sum + r.area, 0).toFixed(1)} m²
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Compliance Notes */}
              {selectedPlan?.compliance_notes && (
                <div className="mt-6 bg-green-500/10 rounded-xl border border-green-500/20 p-6">
                  <h3 className="text-lg font-semibold text-green-400 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Compliance Notes
                  </h3>
                  <p className="text-gray-300">{selectedPlan.compliance_notes}</p>
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <PlansContent />
    </Suspense>
  );
}
