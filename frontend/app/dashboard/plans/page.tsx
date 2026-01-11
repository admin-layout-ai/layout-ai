// frontend/app/dashboard/projects/[id]/plans/page.tsx
'use client';

import { useState, useEffect, use, useCallback } from 'react';
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
  Layers,
  ExternalLink,
  RefreshCw,
  Share2,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Home,
  Eye,
  EyeOff,
  Ruler,
  Sofa,
  Move,
  Info,
  Sparkles
} from 'lucide-react';
import api, { Project, FloorPlan } from '@/lib/api';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface RenderedImages {
  png?: string;
  thumbnail?: string;
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
  rendered_images?: RenderedImages;
  base_sample?: string;
  match_score?: number;
  modifications_summary?: string[];
  generation_method?: string;
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

// Room type colors for visual consistency
const ROOM_TYPE_COLORS: Record<string, string> = {
  garage: 'bg-gray-100 text-gray-700',
  entry: 'bg-amber-50 text-amber-700',
  family: 'bg-blue-50 text-blue-700',
  living: 'bg-blue-50 text-blue-700',
  kitchen: 'bg-emerald-50 text-emerald-700',
  dining: 'bg-pink-50 text-pink-700',
  bedroom: 'bg-purple-50 text-purple-700',
  master: 'bg-fuchsia-50 text-fuchsia-700',
  master_bedroom: 'bg-fuchsia-50 text-fuchsia-700',
  ensuite: 'bg-cyan-50 text-cyan-700',
  bathroom: 'bg-cyan-50 text-cyan-700',
  laundry: 'bg-sky-50 text-sky-700',
  study: 'bg-red-50 text-red-700',
  office: 'bg-red-50 text-red-700',
  alfresco: 'bg-green-50 text-green-700',
  pantry: 'bg-teal-50 text-teal-700',
  wir: 'bg-orange-50 text-orange-700',
  theatre: 'bg-indigo-50 text-indigo-700',
  hallway: 'bg-slate-50 text-slate-700',
  porch: 'bg-lime-50 text-lime-700',
  meals: 'bg-pink-50 text-pink-700',
  powder: 'bg-cyan-50 text-cyan-700',
  linen: 'bg-slate-50 text-slate-700',
  activities: 'bg-violet-50 text-violet-700',
};

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
  const [regenerating, setRegenerating] = useState(false);
  
  // Image display state
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  
  // View settings
  const [scale, setScale] = useState(1);
  const [highlightedRoom, setHighlightedRoom] = useState<string | null>(null);
  const [showRoomList, setShowRoomList] = useState(true);
  const [showGenerationInfo, setShowGenerationInfo] = useState(false);
  
  // Get rendered image URLs
  const renderedImages: RenderedImages = {
    png: (floorPlan as any)?.preview_image_url || layoutData?.rendered_images?.png,
    thumbnail: layoutData?.rendered_images?.thumbnail,
  };
  
  const hasImage = !!renderedImages.png;

  useEffect(() => {
    if (projectId > 0) {
      loadData();
    }
  }, [projectId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showLightbox) {
        setShowLightbox(false);
      }
      if (e.key === '+' || e.key === '=') {
        setScale(s => Math.min(s + 0.25, 3));
      }
      if (e.key === '-') {
        setScale(s => Math.max(s - 0.25, 0.5));
      }
      if (e.key === '0') {
        setScale(1);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLightbox]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch project
      const projectData = await api.getProject(projectId);
      setProject(projectData);
      
      // Fetch floor plans
      const plans = await api.getFloorPlans(projectId);
      
      if (plans.length > 0) {
        const plan = plans[0];
        setFloorPlan(plan);
        
        // Parse layout data
        if (plan.layout_data) {
          try {
            const parsed = JSON.parse(plan.layout_data);
            setLayoutData(parsed);
          } catch (e) {
            console.error('Error parsing layout data:', e);
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

  const handleRegenerate = async () => {
    if (!project) return;
    
    setRegenerating(true);
    setError(null);
    
    try {
      await api.generateFloorPlans(project.id);
      
      // Poll for completion
      let attempts = 0;
      const maxAttempts = 45;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const updatedProject = await api.getProject(project.id);
        
        if (updatedProject.status === 'generated') {
          await loadData();
          setRegenerating(false);
          return;
        } else if (updatedProject.status === 'error') {
          setError('Regeneration failed. Please try again.');
          setRegenerating(false);
          return;
        }
        
        attempts++;
      }
      
      setError('Regeneration is taking longer than expected.');
      setRegenerating(false);
    } catch (err) {
      console.error('Error regenerating:', err);
      setError(err instanceof Error ? err.message : 'Failed to regenerate');
      setRegenerating(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!renderedImages.png) return;
    
    setDownloading(true);
    try {
      const response = await fetch(renderedImages.png);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project?.name || 'floor_plan'}_layout.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed:', err);
      setError('Failed to download image');
    } finally {
      setDownloading(false);
    }
  };

  // Group rooms by type for summary
  const getRoomsByType = () => {
    if (!layoutData?.rooms) return {};
    
    const grouped: Record<string, Room[]> = {};
    for (const room of layoutData.rooms) {
      const type = room.type || 'other';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(room);
    }
    return grouped;
  };

  const roomsByType = getRoomsByType();

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-white/10 rounded"></div>
          <div className="h-96 bg-white/5 rounded-xl"></div>
        </div>
      </div>
    );
  }

  // Error or no plan state
  if (error || !project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
        <button 
          onClick={() => router.push(`/dashboard/projects/${projectId}`)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"
        >
          <ArrowLeft className="w-5 h-5" /> Back to Project
        </button>
        
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-8 text-center max-w-md mx-auto">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error Loading Floor Plan</h2>
          <p className="text-gray-400 mb-6">{error || 'Could not load the floor plan.'}</p>
          <button
            onClick={() => router.push(`/dashboard/projects/${projectId}`)}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Back to Project
          </button>
        </div>
      </div>
    );
  }

  // No floor plan generated yet
  if (!floorPlan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
        <button 
          onClick={() => router.push(`/dashboard/projects/${projectId}`)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"
        >
          <ArrowLeft className="w-5 h-5" /> Back to Project
        </button>
        
        <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center max-w-md mx-auto">
          <Layers className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">No Floor Plan Yet</h2>
          <p className="text-gray-400 mb-6">Generate a floor plan from the project page to see it here.</p>
          <button
            onClick={() => router.push(`/dashboard/projects/${projectId}`)}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Go to Project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900">
      {/* Header */}
      <div className="bg-slate-800/50 border-b border-white/10 sticky top-0 z-10 backdrop-blur-sm">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push(`/dashboard/projects/${projectId}`)}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">{project.name}</h1>
              <p className="text-gray-400 text-sm flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {project.suburb}, {project.state}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-1 bg-white/5 rounded-lg p-1">
              <button
                onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}
                className="p-2 text-gray-400 hover:text-white transition"
                title="Zoom out (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-white text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
              <button
                onClick={() => setScale(s => Math.min(s + 0.25, 3))}
                className="p-2 text-gray-400 hover:text-white transition"
                title="Zoom in (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setScale(1)}
                className="p-2 text-gray-400 hover:text-white transition"
                title="Reset zoom (0)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            
            {/* Actions */}
            {hasImage && (
              <button
                onClick={handleDownloadImage}
                disabled={downloading}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 text-sm"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Image</span>
              </button>
            )}
            
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="px-3 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition flex items-center gap-2 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Regenerate</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/20 border-b border-red-500/30 p-3 flex items-center justify-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Regenerating overlay */}
      {regenerating && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-8 text-center max-w-sm border border-white/10">
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Regenerating Floor Plan</h3>
            <p className="text-gray-400 text-sm">Finding best matching sample and adapting...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row">
        {/* Floor Plan Display */}
        <div className="flex-1 p-4 lg:p-6">
          {hasImage ? (
            <div className="bg-white rounded-xl overflow-hidden shadow-xl">
              {/* Image container */}
              <div 
                className="relative bg-gray-50 overflow-auto"
                style={{ maxHeight: 'calc(100vh - 200px)' }}
              >
                <div 
                  className="min-w-full min-h-full flex items-center justify-center p-4 cursor-zoom-in"
                  onClick={() => setShowLightbox(true)}
                >
                  <img
                    src={renderedImages.png}
                    alt="Floor Plan"
                    className="max-w-full h-auto transition-transform"
                    style={{ transform: `scale(${scale})` }}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageError(true)}
                  />
                </div>
                
                {!imageLoaded && !imageError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                    <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                  </div>
                )}
                
                {imageError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                    <div className="text-center text-gray-500">
                      <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                      <p>Failed to load image</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Image info bar */}
              <div className="bg-gray-100 px-4 py-2 flex items-center justify-between text-sm text-gray-600">
                <span>Click image to view fullscreen</span>
                <span>Use + / - keys to zoom</span>
              </div>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
              <Layers className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-white mb-2">No Preview Image</h3>
              <p className="text-gray-400 mb-4">The floor plan was generated but no preview image is available.</p>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Regenerate with Image
              </button>
            </div>
          )}
        </div>

        {/* Sidebar - Plan Details */}
        <div className="w-full lg:w-96 bg-slate-800/50 border-t lg:border-t-0 lg:border-l border-white/10 p-4 lg:p-6 space-y-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
          {/* Plan Summary */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Home className="w-5 h-5 text-blue-400" />
              {layoutData?.design_name || floorPlan?.plan_type || 'Floor Plan'}
            </h2>
            
            {layoutData?.description && (
              <p className="text-gray-400 text-sm mb-4">{layoutData.description}</p>
            )}
            
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-white">
                  {floorPlan?.total_area?.toFixed(0) || layoutData?.summary?.total_area?.toFixed(0) || '—'}
                </p>
                <p className="text-xs text-gray-500">Total m²</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-white">
                  {layoutData?.rooms?.length || '—'}
                </p>
                <p className="text-xs text-gray-500">Rooms</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <Bed className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">
                  {layoutData?.summary?.bedroom_count || project?.bedrooms || '—'}
                </p>
                <p className="text-xs text-gray-500">Beds</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <Bath className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">
                  {layoutData?.summary?.bathroom_count || project?.bathrooms || '—'}
                </p>
                <p className="text-xs text-gray-500">Baths</p>
              </div>
            </div>
          </div>

          {/* Generation Info */}
          {(layoutData?.base_sample || layoutData?.match_score) && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <button 
                onClick={() => setShowGenerationInfo(!showGenerationInfo)}
                className="flex items-center justify-between w-full text-left"
              >
                <span className="text-blue-400 font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  AI Generation Info
                </span>
                <ChevronRight className={`w-4 h-4 text-blue-400 transition-transform ${showGenerationInfo ? 'rotate-90' : ''}`} />
              </button>
              
              {showGenerationInfo && (
                <div className="mt-3 space-y-2 text-sm">
                  {layoutData?.base_sample && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Based on</span>
                      <span className="text-white">{layoutData.base_sample}</span>
                    </div>
                  )}
                  {layoutData?.match_score && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Match score</span>
                      <span className="text-white">{layoutData.match_score.toFixed(1)} / 100</span>
                    </div>
                  )}
                  {layoutData?.generation_method && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Method</span>
                      <span className="text-white capitalize">{layoutData.generation_method.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                  {layoutData?.modifications_summary && layoutData.modifications_summary.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/10">
                      <p className="text-gray-400 mb-1">Modifications made:</p>
                      <ul className="text-white text-xs space-y-1">
                        {layoutData.modifications_summary.map((mod, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-blue-400">•</span>
                            {mod}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Room List Toggle */}
          <div>
            <button
              onClick={() => setShowRoomList(!showRoomList)}
              className="flex items-center justify-between w-full text-left mb-3"
            >
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                Room Breakdown
              </h3>
              {showRoomList ? (
                <EyeOff className="w-4 h-4 text-gray-500" />
              ) : (
                <Eye className="w-4 h-4 text-gray-500" />
              )}
            </button>
            
            {showRoomList && layoutData?.rooms && (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {layoutData.rooms.map((room, index) => {
                  const colorClass = ROOM_TYPE_COLORS[room.type] || 'bg-gray-100 text-gray-700';
                  
                  return (
                    <div
                      key={room.id || index}
                      className={`p-3 rounded-lg transition cursor-pointer ${
                        highlightedRoom === room.id 
                          ? 'bg-blue-500/20 border border-blue-500/30' 
                          : 'bg-white/5 border border-transparent hover:bg-white/10'
                      }`}
                      onMouseEnter={() => setHighlightedRoom(room.id || null)}
                      onMouseLeave={() => setHighlightedRoom(null)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-medium text-sm truncate">
                          {room.name}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
                          {room.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-gray-500 text-xs">
                        <span className="flex items-center gap-1">
                          <Ruler className="w-3 h-3" />
                          {room.width?.toFixed(1)}m × {room.depth?.toFixed(1)}m
                        </span>
                        <span>{room.area?.toFixed(1)}m²</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Compliance Status */}
          {layoutData?.compliance && (
            <div className={`rounded-lg p-4 ${
              layoutData.compliance.ncc_compliant 
                ? 'bg-green-500/10 border border-green-500/20' 
                : 'bg-yellow-500/10 border border-yellow-500/20'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className={`w-5 h-5 ${
                  layoutData.compliance.ncc_compliant ? 'text-green-400' : 'text-yellow-400'
                }`} />
                <span className={`font-medium ${
                  layoutData.compliance.ncc_compliant ? 'text-green-400' : 'text-yellow-400'
                }`}>
                  {layoutData.compliance.ncc_compliant ? 'NCC Compliant' : 'Review Needed'}
                </span>
              </div>
              
              {layoutData.compliance.notes && layoutData.compliance.notes.length > 0 && (
                <ul className="text-xs text-gray-400 space-y-1">
                  {layoutData.compliance.notes.slice(0, 3).map((note, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-gray-500">•</span>
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Input Parameters */}
          {layoutData?.input_parameters && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
                Design Parameters
              </h3>
              <div className="bg-white/5 rounded-lg p-4 space-y-2 text-sm">
                {layoutData.input_parameters.land_width && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Land</span>
                    <span className="text-white">
                      {layoutData.input_parameters.land_width}m × {layoutData.input_parameters.land_depth}m
                    </span>
                  </div>
                )}
                {layoutData.input_parameters.style && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Style</span>
                    <span className="text-white">{layoutData.input_parameters.style}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Open Plan</span>
                  <span className="text-white">{layoutData.input_parameters.open_plan ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Alfresco</span>
                  <span className="text-white">{layoutData.input_parameters.outdoor_entertainment ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Generation Time */}
          {floorPlan?.generation_time_seconds && (
            <div className="text-center text-gray-500 text-xs pt-4 border-t border-white/10">
              Generated in {floorPlan.generation_time_seconds.toFixed(1)}s
              {floorPlan.ai_model_version && (
                <span className="block mt-1">{floorPlan.ai_model_version}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {showLightbox && hasImage && (
        <div 
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
          onClick={() => setShowLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setShowLightbox(false)}
          >
            <X className="w-8 h-8" />
          </button>
          
          <img
            src={renderedImages.png}
            alt="Floor Plan"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 rounded-lg px-4 py-2 text-white text-sm">
            Press ESC or click outside to close
          </div>
        </div>
      )}
    </div>
  );
}
