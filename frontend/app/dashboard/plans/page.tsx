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
  FileText,
  Layers,
  ExternalLink,
  RefreshCw,
  Share2,
  Printer,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Home,
  Eye,
  EyeOff,
  Ruler,
  Sofa,
  Move
} from 'lucide-react';
import api, { Project, FloorPlan } from '@/lib/api';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface RenderedImages {
  pdf?: string;
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
  ensuite: 'bg-cyan-50 text-cyan-700',
  bathroom: 'bg-cyan-50 text-cyan-700',
  laundry: 'bg-sky-50 text-sky-700',
  study: 'bg-red-50 text-red-700',
  office: 'bg-red-50 text-red-700',
  alfresco: 'bg-green-50 text-green-700',
  pantry: 'bg-teal-50 text-teal-700',
  wir: 'bg-orange-50 text-orange-700',
  theatre: 'bg-indigo-50 text-indigo-700',
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  
  // View settings
  const [scale, setScale] = useState(1);
  const [selectedFloor, setSelectedFloor] = useState(0);
  const [highlightedRoom, setHighlightedRoom] = useState<string | null>(null);
  
  // Get rendered image URLs
  const renderedImages: RenderedImages = {
    pdf: (floorPlan as any)?.pdf_url || layoutData?.rendered_images?.pdf,
    png: (floorPlan as any)?.preview_image_url || layoutData?.rendered_images?.png,
    thumbnail: layoutData?.rendered_images?.thumbnail,
  };
  
  const hasCADImage = !!renderedImages.png;

  useEffect(() => {
    if (projectId > 0) {
      loadData();
    }
  }, [projectId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (isFullscreen || showLightbox)) {
        setIsFullscreen(false);
        setShowLightbox(false);
      }
      if (e.key === '+' || e.key === '=') {
        setScale(s => Math.min(3, s + 0.1));
      }
      if (e.key === '-') {
        setScale(s => Math.max(0.5, s - 0.1));
      }
      if (e.key === '0') {
        setScale(1);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, showLightbox]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      setImageLoaded(false);
      setImageError(false);
      
      const [projectData, plansData] = await Promise.all([
        api.getProject(projectId),
        api.getFloorPlans(projectId)
      ]);
      
      setProject(projectData);
      
      if (plansData.length > 0) {
        setFloorPlan(plansData[0]);
        
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

  const handleDownloadPDF = useCallback(async () => {
    // If we have a direct PDF URL, open it
    if (renderedImages.pdf) {
      window.open(renderedImages.pdf, '_blank');
      return;
    }
    
    // Otherwise fetch from API
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
      
      if (!response.ok) throw new Error('Failed to download PDF');
      
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
  }, [floorPlan, projectId, project, renderedImages.pdf]);

  const handleRegenerate = async () => {
    if (!project || regenerating) return;
    
    if (!confirm('This will replace the current floor plan. Continue?')) return;
    
    try {
      setRegenerating(true);
      await api.generateFloorPlan(projectId);
      await loadData();
    } catch (err) {
      console.error('Regeneration failed:', err);
      alert('Failed to regenerate floor plan. Please try again.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${project?.name} - Floor Plan`,
          url: url
        });
      } catch (err) {
        // User cancelled or error
      }
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    }
  };

  const handlePrint = () => {
    if (renderedImages.pdf) {
      const printWindow = window.open(renderedImages.pdf, '_blank');
      printWindow?.print();
    } else {
      window.print();
    }
  };

  const getRoomTypeColor = (type: string): string => {
    const normalized = type.toLowerCase().replace(/[_\s-]+/g, '');
    for (const [key, value] of Object.entries(ROOM_TYPE_COLORS)) {
      if (normalized.includes(key)) return value;
    }
    return 'bg-gray-50 text-gray-700';
  };

  const hasMultipleFloors = layoutData?.rooms?.some(r => (r.floor || 0) > 0);
  const currentFloorRooms = layoutData?.rooms?.filter(r => (r.floor || 0) === selectedFloor) || [];
  const totalFloorArea = currentFloorRooms.reduce((sum, r) => sum + r.area, 0);

  // Loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="animate-pulse">
              <div className="h-4 w-32 bg-gray-200 rounded mb-3"></div>
              <div className="h-8 w-64 bg-gray-200 rounded mb-2"></div>
              <div className="h-4 w-48 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-xl p-5 shadow-sm animate-pulse">
                <div className="h-6 w-48 bg-gray-200 rounded mb-4"></div>
                <div className="grid grid-cols-2 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-20 bg-gray-100 rounded-lg"></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="lg:col-span-3">
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="h-12 bg-gray-50 border-b"></div>
                <div className="h-[600px] bg-gray-100 animate-pulse flex items-center justify-center">
                  <Loader2 className="w-12 h-12 text-gray-300 animate-spin" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
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
    <div className={`min-h-screen bg-gray-50 ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''}`}>
      {/* Lightbox */}
      {showLightbox && renderedImages.png && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowLightbox(false)}
        >
          <button
            onClick={() => setShowLightbox(false)}
            className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 transition"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={renderedImages.png}
            alt="Floor Plan"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Header */}
      <div className={`bg-white border-b shadow-sm ${isFullscreen ? 'hidden' : 'sticky top-0 z-10'}`}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button 
            onClick={() => router.push(`/dashboard/projects`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-3 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Projects
          </button>
          
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project.name} - Floor Plan</h1>
              <p className="text-gray-500 flex items-center gap-2 mt-1">
                <MapPin className="w-4 h-4" />
                {project.suburb}, {project.state} {project.postcode}
              </p>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {layoutData?.compliance?.ncc_compliant && (
                <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">NCC Compliant</span>
                </div>
              )}
              
              {hasCADImage && (
                <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm">
                  <ImageIcon className="w-4 h-4" />
                  <span className="font-medium">CAD Quality</span>
                </div>
              )}
              
              <button
                onClick={handleShare}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                title="Share"
              >
                <Share2 className="w-5 h-5" />
              </button>
              
              <button
                onClick={handlePrint}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                title="Print"
              >
                <Printer className="w-5 h-5" />
              </button>
              
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex items-center gap-2 px-3 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
                title="Regenerate Floor Plan"
              >
                <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Regenerate</span>
              </button>
              
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
                  <span className="hidden sm:inline">Download PDF</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`max-w-7xl mx-auto px-4 py-6 ${isFullscreen ? 'hidden' : ''}`}>
        {!floorPlan ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm">
            <Layers className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Floor Plan Generated</h2>
            <p className="text-gray-500 mb-6">Generate a floor plan from the project page.</p>
            <button
              onClick={() => router.push(`/dashboard/projects`)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Back to Projects
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              {/* Design Summary */}
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-2">
                  {layoutData?.design_name || floorPlan.plan_type || 'Floor Plan'}
                </h3>
                <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                  {layoutData?.description || 'AI-generated floor plan based on your requirements.'}
                </p>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 text-center">
                    <Maximize2 className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                    <div className="text-xl font-bold text-gray-900">
                      {layoutData?.summary?.total_area?.toFixed(0) || floorPlan.total_area?.toFixed(0) || '—'}
                    </div>
                    <div className="text-xs text-gray-500">Total m²</div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3 text-center">
                    <Bed className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                    <div className="text-xl font-bold text-gray-900">
                      {layoutData?.summary?.bedroom_count || project.bedrooms || '—'}
                    </div>
                    <div className="text-xs text-gray-500">Bedrooms</div>
                  </div>
                  <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-3 text-center">
                    <Bath className="w-5 h-5 text-cyan-600 mx-auto mb-1" />
                    <div className="text-xl font-bold text-gray-900">
                      {layoutData?.summary?.bathroom_count || project.bathrooms || '—'}
                    </div>
                    <div className="text-xs text-gray-500">Bathrooms</div>
                  </div>
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 text-center">
                    <Car className="w-5 h-5 text-gray-600 mx-auto mb-1" />
                    <div className="text-xl font-bold text-gray-900">
                      {layoutData?.summary?.garage_spaces || project.garage_spaces || '—'}
                    </div>
                    <div className="text-xs text-gray-500">Garage</div>
                  </div>
                </div>
                
                {/* Living Area */}
                {layoutData?.summary?.living_area && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Living Area</span>
                      <span className="font-medium text-gray-900">{layoutData.summary.living_area.toFixed(0)} m²</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Floor Selector */}
              {hasMultipleFloors && (
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Floor Level
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedFloor(0)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                        selectedFloor === 0 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Home className="w-4 h-4 mx-auto mb-1" />
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
                      <ChevronRight className="w-4 h-4 mx-auto mb-1 rotate-[-90deg]" />
                      First
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Links */}
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <h4 className="font-medium text-gray-900 mb-3">Quick Actions</h4>
                <div className="space-y-2">
                  {renderedImages.pdf && (
                    <a
                      href={renderedImages.pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2 text-gray-700 hover:bg-gray-50 rounded-lg transition"
                    >
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                      <span className="text-sm">Open PDF in New Tab</span>
                    </a>
                  )}
                  {renderedImages.png && (
                    <button
                      onClick={() => setShowLightbox(true)}
                      className="flex items-center gap-3 p-2 text-gray-700 hover:bg-gray-50 rounded-lg transition w-full text-left"
                    >
                      <ImageIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-sm">View Full Size Image</span>
                    </button>
                  )}
                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="flex items-center gap-3 p-2 text-gray-700 hover:bg-gray-50 rounded-lg transition w-full text-left"
                  >
                    <Maximize2 className="w-4 h-4 text-gray-400" />
                    <span className="text-sm">Fullscreen Mode</span>
                  </button>
                </div>
              </div>

              {/* AI Model Info */}
              {floorPlan.ai_model_version && (
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <h4 className="font-medium text-gray-900 mb-2">Generation Info</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p><span className="font-medium">Model:</span> {floorPlan.ai_model_version}</p>
                    <p><span className="font-medium">Generated:</span> {new Date(floorPlan.created_at || '').toLocaleDateString()}</p>
                    {floorPlan.generation_time_seconds && (
                      <p><span className="font-medium">Tokens:</span> ~{(floorPlan.generation_time_seconds * 1000).toFixed(0)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3 space-y-6">
              {/* Floor Plan Display */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between p-4 border-b bg-gray-50">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-700">
                      {selectedFloor === 0 ? 'Ground Floor' : `Level ${selectedFloor}`}
                    </span>
                    <span className="text-sm text-gray-500">
                      ({currentFloorRooms.length} rooms • {totalFloorArea.toFixed(0)} m²)
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                      className="p-2 bg-white border rounded-lg hover:bg-gray-50 transition"
                      title="Zoom Out (-)"
                    >
                      <ZoomOut className="w-4 h-4 text-gray-600" />
                    </button>
                    <span className="text-sm text-gray-600 w-14 text-center font-medium bg-white border rounded-lg py-1">
                      {(scale * 100).toFixed(0)}%
                    </span>
                    <button
                      onClick={() => setScale(s => Math.min(3, s + 0.1))}
                      className="p-2 bg-white border rounded-lg hover:bg-gray-50 transition"
                      title="Zoom In (+)"
                    >
                      <ZoomIn className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      onClick={() => setScale(1)}
                      className="p-2 bg-white border rounded-lg hover:bg-gray-50 transition"
                      title="Reset (0)"
                    >
                      <RotateCcw className="w-4 h-4 text-gray-600" />
                    </button>
                    <div className="w-px h-6 bg-gray-200 mx-1" />
                    <button
                      onClick={() => setIsFullscreen(true)}
                      className="p-2 bg-white border rounded-lg hover:bg-gray-50 transition"
                      title="Fullscreen"
                    >
                      <Maximize2 className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
                
                {/* Canvas / Image Display */}
                <div className="h-[600px] overflow-auto bg-gray-100 relative">
                  {hasCADImage ? (
                    // Display pre-rendered CAD image
                    <div className="w-full h-full flex items-center justify-center p-4">
                      {!imageLoaded && !imageError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                          <div className="text-center">
                            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Loading CAD floor plan...</p>
                          </div>
                        </div>
                      )}
                      
                      {imageError && (
                        <div className="text-center text-gray-400">
                          <AlertCircle className="w-12 h-12 mx-auto mb-2" />
                          <p>Failed to load floor plan image</p>
                          {renderedImages.pdf && (
                            <a
                              href={renderedImages.pdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline mt-2 inline-block"
                            >
                              Open PDF instead
                            </a>
                          )}
                        </div>
                      )}
                      
                      <img
                        src={renderedImages.png}
                        alt="CAD Floor Plan"
                        onLoad={() => setImageLoaded(true)}
                        onError={() => setImageError(true)}
                        onClick={() => setShowLightbox(true)}
                        style={{
                          transform: `scale(${scale})`,
                          transformOrigin: 'center',
                          cursor: 'zoom-in',
                          display: imageLoaded ? 'block' : 'none',
                        }}
                        className="max-w-none transition-transform duration-200 shadow-lg"
                      />
                    </div>
                  ) : layoutData ? (
                    // Fallback: Import FloorPlanCanvas dynamically
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <div className="text-center">
                        <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                        <p>CAD image not available</p>
                        <p className="text-sm mt-1">Download PDF for full quality</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <p>No floor plan data available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Room Schedule */}
              {currentFloorRooms.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Room Schedule</h3>
                    <span className="text-sm text-gray-500">{currentFloorRooms.length} rooms</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Room</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Type</th>
                          <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">Dimensions</th>
                          <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Area</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Features</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentFloorRooms.map((room, index) => (
                          <tr 
                            key={room.id || index} 
                            className={`border-b last:border-0 hover:bg-gray-50 transition cursor-pointer ${
                              highlightedRoom === room.id ? 'bg-blue-50' : ''
                            }`}
                            onMouseEnter={() => setHighlightedRoom(room.id || null)}
                            onMouseLeave={() => setHighlightedRoom(null)}
                          >
                            <td className="py-3 px-4">
                              <span className="font-medium text-gray-900">{room.name}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getRoomTypeColor(room.type)}`}>
                                {room.type.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center text-gray-600 font-mono text-sm">
                              {room.width.toFixed(1)}m × {room.depth.toFixed(1)}m
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="font-semibold text-gray-900">{room.area.toFixed(1)}</span>
                              <span className="text-gray-500 text-sm ml-1">m²</span>
                            </td>
                            <td className="py-3 px-4 text-gray-500 text-sm max-w-[200px] truncate">
                              {room.features?.slice(0, 3).join(', ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gradient-to-r from-blue-50 to-blue-100">
                        <tr>
                          <td colSpan={3} className="py-3 px-4 font-semibold text-blue-900">
                            Total ({selectedFloor === 0 ? 'Ground Floor' : `Level ${selectedFloor}`})
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="font-bold text-blue-900 text-lg">{totalFloorArea.toFixed(1)}</span>
                            <span className="text-blue-700 text-sm ml-1">m²</span>
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
                        <span className="text-green-500 mt-0.5">✓</span>
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

      {/* Fullscreen Mode */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between p-4 border-b bg-gray-50">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsFullscreen(false)}
                className="p-2 hover:bg-gray-200 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="font-medium text-gray-700">
                {project?.name} - {selectedFloor === 0 ? 'Ground Floor' : `Level ${selectedFloor}`}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setScale(s => Math.max(0.3, s - 0.1))}
                className="p-2 bg-white border rounded-lg hover:bg-gray-50"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-sm w-14 text-center">{(scale * 100).toFixed(0)}%</span>
              <button
                onClick={() => setScale(s => Math.min(5, s + 0.1))}
                className="p-2 bg-white border rounded-lg hover:bg-gray-50"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setScale(1)}
                className="p-2 bg-white border rounded-lg hover:bg-gray-50"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-gray-200 mx-2" />
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <Download className="w-4 h-4" />
                PDF
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center">
            {hasCADImage ? (
              <img
                src={renderedImages.png}
                alt="Floor Plan"
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: 'center',
                }}
                className="max-w-none transition-transform duration-200"
              />
            ) : (
              <div className="text-gray-400 text-center">
                <ImageIcon className="w-16 h-16 mx-auto mb-2" />
                <p>No CAD image available</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
