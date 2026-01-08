// frontend/app/dashboard/projects/[id]/plans/page.tsx
'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  MapPin, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Download,
  Bed,
  Bath,
  Car,
  Maximize2,
  Grid3X3,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileText,
  Layers
} from 'lucide-react';
import api, { Project, FloorPlan } from '@/lib/api';
import FloorPlanCanvas from '@/components/FloorPlanCanvas';

interface PageProps {
  params: Promise<{ id: string }>;
}

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
  compliance?: {
    ncc_compliant?: boolean;
    notes?: string[];
  };
  input_parameters?: Record<string, any>;
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
}

export default function PlansPage({ params }: PageProps) {
  const { id } = use(params);
  const projectId = parseInt(id);
  const router = useRouter();
  
  const [project, setProject] = useState<Project | null>(null);
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const [layoutData, setLayoutData] = useState<LayoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  
  // View settings
  const [showDimensions, setShowDimensions] = useState(true);
  const [showFurniture, setShowFurniture] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [scale, setScale] = useState(1);
  const [selectedFloor, setSelectedFloor] = useState(0);

  useEffect(() => {
    if (projectId > 0) {
      loadData();
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
      
      if (plansData.length > 0) {
        setFloorPlan(plansData[0]);
        
        // Parse layout data
        if (plansData[0].layout_data) {
          try {
            const parsed = JSON.parse(plansData[0].layout_data);
            setLayoutData(parsed);
          } catch (e) {
            console.error('Failed to parse layout data:', e);
          }
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load floor plan');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!floorPlan) return;
    
    try {
      setDownloading(true);
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/plans/${projectId}/plans/${floorPlan.id}/pdf`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project?.name || 'Floor_Plan'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const hasMultipleFloors = layoutData?.rooms?.some(r => (r.floor || 0) > 0);

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
        <div className="text-center bg-white p-8 rounded-xl shadow-lg max-w-md">
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button 
            onClick={() => router.push(`/dashboard/projects`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-3 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Projects
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project.name} - Floor Plan</h1>
              <p className="text-gray-500 flex items-center gap-2 mt-1">
                <MapPin className="w-4 h-4" />
                {project.suburb}, {project.state} {project.postcode}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {layoutData?.compliance?.ncc_compliant && (
                <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">NCC Compliant</span>
                </div>
              )}
              
              {floorPlan && (
                <button
                  onClick={handleDownloadPDF}
                  disabled={downloading}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {downloading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                  Download PDF
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {!floorPlan ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm">
            <Layers className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Floor Plan Generated</h2>
            <p className="text-gray-500 mb-6">Generate a floor plan from the project page.</p>
            <button
              onClick={() => router.push(`/dashboard/projects`)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Back to Project
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              {/* Design Summary */}
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-2">
                  {layoutData?.design_name || 'Floor Plan'}
                </h3>
                <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                  {layoutData?.description || 'AI-generated floor plan based on your requirements.'}
                </p>
                
                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <Maximize2 className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                    <div className="text-lg font-bold text-gray-900">
                      {layoutData?.summary?.total_area?.toFixed(0) || floorPlan.total_area?.toFixed(0) || '—'}
                    </div>
                    <div className="text-xs text-gray-500">Total m²</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <Bed className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                    <div className="text-lg font-bold text-gray-900">
                      {layoutData?.summary?.bedroom_count || project.bedrooms || '—'}
                    </div>
                    <div className="text-xs text-gray-500">Bedrooms</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <Bath className="w-5 h-5 text-cyan-600 mx-auto mb-1" />
                    <div className="text-lg font-bold text-gray-900">
                      {layoutData?.summary?.bathroom_count || project.bathrooms || '—'}
                    </div>
                    <div className="text-xs text-gray-500">Bathrooms</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <Car className="w-5 h-5 text-gray-600 mx-auto mb-1" />
                    <div className="text-lg font-bold text-gray-900">
                      {layoutData?.summary?.garage_spaces || project.garage_spaces || '—'}
                    </div>
                    <div className="text-xs text-gray-500">Garage</div>
                  </div>
                </div>
              </div>

              {/* View Controls */}
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <h4 className="font-medium text-gray-900 mb-3">View Options</h4>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDimensions}
                      onChange={(e) => setShowDimensions(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Show Dimensions</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showFurniture}
                      onChange={(e) => setShowFurniture(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Show Furniture</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showGrid}
                      onChange={(e) => setShowGrid(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Show Grid</span>
                  </label>
                </div>
              </div>

              {/* Floor Selector */}
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

              {/* AI Model Info */}
              {floorPlan.ai_model_version && (
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <h4 className="font-medium text-gray-900 mb-2">Generation Info</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p><span className="font-medium">Model:</span> {floorPlan.ai_model_version}</p>
                    <p><span className="font-medium">Generated:</span> {new Date(floorPlan.created_at || '').toLocaleDateString()}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3 space-y-6">
              {/* Floor Plan Canvas */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between p-4 border-b bg-gray-50">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-700">
                      {selectedFloor === 0 ? 'Ground Floor' : `Level ${selectedFloor}`}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                      className="p-2 bg-white border rounded-lg hover:bg-gray-50 transition"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4 text-gray-600" />
                    </button>
                    <span className="text-sm text-gray-600 w-16 text-center font-medium">
                      {(scale * 100).toFixed(0)}%
                    </span>
                    <button
                      onClick={() => setScale(s => Math.min(2, s + 0.1))}
                      className="p-2 bg-white border rounded-lg hover:bg-gray-50 transition"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      onClick={() => setScale(1)}
                      className="p-2 bg-white border rounded-lg hover:bg-gray-50 transition"
                      title="Reset Zoom"
                    >
                      <RotateCcw className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
                
                {/* Canvas */}
                <div className="h-[600px] overflow-auto bg-gray-100">
                  {layoutData ? (
                    <FloorPlanCanvas
                      layoutData={layoutData}
                      selectedFloor={selectedFloor}
                      showDimensions={showDimensions}
                      showFurniture={showFurniture}
                      showGrid={showGrid}
                      scale={scale}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <p>No floor plan data available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Room Schedule */}
              {layoutData?.rooms && layoutData.rooms.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b bg-gray-50">
                    <h3 className="font-semibold text-gray-900">Room Schedule</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Room</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Type</th>
                          <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">Width</th>
                          <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">Depth</th>
                          <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Area</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Features</th>
                        </tr>
                      </thead>
                      <tbody>
                        {layoutData.rooms
                          .filter(r => (r.floor || 0) === selectedFloor)
                          .map((room, index) => (
                          <tr key={room.id || index} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-3 px-4 font-medium text-gray-900">{room.name}</td>
                            <td className="py-3 px-4 text-gray-600 capitalize">{room.type.replace('_', ' ')}</td>
                            <td className="py-3 px-4 text-center text-gray-600">{room.width.toFixed(1)}m</td>
                            <td className="py-3 px-4 text-center text-gray-600">{room.depth.toFixed(1)}m</td>
                            <td className="py-3 px-4 text-right text-gray-900 font-medium">{room.area.toFixed(1)} m²</td>
                            <td className="py-3 px-4 text-gray-500 text-sm">
                              {room.features?.slice(0, 3).join(', ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-50">
                        <tr>
                          <td colSpan={4} className="py-3 px-4 font-semibold text-blue-900">
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

              {/* Compliance Notes */}
              {layoutData?.compliance?.notes && layoutData.compliance.notes.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Compliance Notes
                  </h3>
                  <ul className="space-y-2">
                    {layoutData.compliance.notes.map((note, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-green-500 mt-1">•</span>
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
