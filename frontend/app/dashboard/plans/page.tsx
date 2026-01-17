'use client';

// frontend/app/dashboard/plans/page.tsx
// Handles GALLERY VIEW and DETAIL VIEW using state-based navigation
// - Gallery: Shows all plans in a grid
// - Detail: Click a plan to view details (no URL change)

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Layers, 
  Search, 
  Eye,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  MapPin,
  Bed,
  Bath,
  Home,
  ChevronRight,
  X,
  ImageIcon,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Info,
  FileText,
  Ruler,
  Clock
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api, { Project, FloorPlan } from '@/lib/api';

// Variant information
const VARIANT_INFO: Record<number, { name: string; icon: string; color: string; description: string }> = {
  1: { name: 'Optimal Layout', icon: '⚡', color: 'bg-yellow-500/20 text-yellow-400', description: 'Balanced, efficient design' },
  2: { name: 'Spacious Living', icon: '🏠', color: 'bg-blue-500/20 text-blue-400', description: 'Emphasis on living areas' },
  3: { name: 'Master Retreat', icon: '👑', color: 'bg-purple-500/20 text-purple-400', description: 'Enhanced master suite' },
};

interface FloorPlanWithProject extends FloorPlan {
  project?: Project;
}

interface ValidationItem {
  code?: string;
  message: string;
  severity?: 'error' | 'warning';
  room?: string;
  details?: string;
}

interface LayoutData {
  rooms?: Array<{
    type: string;
    name?: string;
    width: number;
    depth: number;
    area?: number;
  }>;
  summary?: {
    total_area?: number;
    living_area?: number;
  };
  building_envelope?: {
    width?: number;
    depth?: number;
  };
  errors?: ValidationItem[];
  warnings?: ValidationItem[];
  validation_results?: {
    errors?: ValidationItem[];
    warnings?: ValidationItem[];
  };
}

export default function PlansPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Gallery view state
  const [plans, setPlans] = useState<FloorPlanWithProject[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<number | 'all'>('all');
  const [selectedVariantFilter, setSelectedVariantFilter] = useState<number | 'all'>('all');
  
  // Detail view state - when selectedPlan is set, show detail view
  const [selectedPlan, setSelectedPlan] = useState<FloorPlanWithProject | null>(null);
  const [layoutData, setLayoutData] = useState<LayoutData | null>(null);
  const [scale, setScale] = useState(1);
  const [showDetails, setShowDetails] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  // Lightbox state (for gallery quick view)
  const [lightboxPlan, setLightboxPlan] = useState<FloorPlanWithProject | null>(null);

  // Load all plans on mount
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadAllPlans();
    }
  }, [authLoading, isAuthenticated]);

  // Parse layout data when plan is selected
  useEffect(() => {
    if (selectedPlan?.layout_data) {
      try {
        const parsed = JSON.parse(selectedPlan.layout_data);
        setLayoutData(parsed);
      } catch (e) {
        console.error('Error parsing layout data:', e);
        setLayoutData(null);
      }
    } else {
      setLayoutData(null);
    }
    // Reset image state when plan changes
    setImageLoaded(false);
    setImageError(false);
    setScale(1);
  }, [selectedPlan]);

  const loadAllPlans = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch all projects
      const projectsResponse = await api.getProjects();
      const allProjects = projectsResponse.projects || [];
      setProjects(allProjects);
      
      // Fetch floor plans for projects with status 'generated'
      const generatedProjects = allProjects.filter(p => p.status === 'generated');
      
      const allPlans: FloorPlanWithProject[] = [];
      
      for (const project of generatedProjects) {
        try {
          const projectPlans = await api.getFloorPlans(project.id);
          const plansWithProject = projectPlans.map(plan => ({
            ...plan,
            project
          }));
          allPlans.push(...plansWithProject);
        } catch (err) {
          console.error(`Error fetching plans for project ${project.id}:`, err);
        }
      }
      
      // Sort by creation date (newest first)
      allPlans.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
      
      setPlans(allPlans);
    } catch (err) {
      console.error('Error loading plans:', err);
      setError(err instanceof Error ? err.message : 'Failed to load floor plans');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter plans for gallery view
  const filteredPlans = plans.filter(plan => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesProject = plan.project?.name?.toLowerCase().includes(query);
      const matchesType = plan.plan_type?.toLowerCase().includes(query);
      const matchesLocation = plan.project?.suburb?.toLowerCase().includes(query);
      if (!matchesProject && !matchesType && !matchesLocation) return false;
    }
    
    if (selectedProjectFilter !== 'all' && plan.project_id !== selectedProjectFilter) {
      return false;
    }
    
    if (selectedVariantFilter !== 'all' && plan.variant_number !== selectedVariantFilter) {
      return false;
    }
    
    return true;
  });

  const formatDate = (dateString: string | undefined, includeTime = false) => {
    if (!dateString) return '—';
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(includeTime && { hour: '2-digit', minute: '2-digit' })
    };
    return new Date(dateString).toLocaleDateString('en-AU', options);
  };

  const handleViewPlan = (plan: FloorPlanWithProject) => {
    setSelectedPlan(plan);
  };

  const handleBackToGallery = () => {
    setSelectedPlan(null);
    setLayoutData(null);
  };

  const handleDownload = async (plan: FloorPlanWithProject, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!plan.preview_image_url) return;
    
    setDownloading(true);
    try {
      const response = await fetch(plan.preview_image_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `floor_plan_${plan.project?.name || plan.project_id}_v${plan.variant_number || 1}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  // =========================================================================
  // DETAIL VIEW - When a plan is selected
  // =========================================================================
  if (selectedPlan) {
    const variant = VARIANT_INFO[selectedPlan.variant_number || 1] || VARIANT_INFO[1];
    
    return (
      <div className="h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-800/50 border-b border-white/10 z-10 backdrop-blur-sm flex-shrink-0">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={handleBackToGallery}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-white">{selectedPlan.project?.name || 'Floor Plan'}</h1>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {selectedPlan.project?.suburb}, {selectedPlan.project?.state}
                  </span>
                  <span className={variant.color.replace('bg-', 'text-').split(' ')[1]}>
                    {variant.icon} {variant.name}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="hidden sm:flex items-center gap-1 bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}
                  className="p-2 text-gray-400 hover:text-white transition"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-white text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
                <button
                  onClick={() => setScale(s => Math.min(s + 0.25, 3))}
                  className="p-2 text-gray-400 hover:text-white transition"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setScale(1)}
                  className="p-2 text-gray-400 hover:text-white transition"
                  title="Reset zoom"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
              
              {/* Toggle Details */}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className={`p-2 rounded-lg transition ${showDetails ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                title="Toggle details panel"
              >
                <Info className="w-5 h-5" />
              </button>
              
              {/* Download */}
              {selectedPlan.preview_image_url && (
                <button
                  onClick={() => handleDownload(selectedPlan)}
                  disabled={downloading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          {/* Left Section: Floor Plan (60%) + Errors Panel (40%) */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Floor Plan Image - Portrait orientation, trimmed whitespace */}
            <div className="w-full lg:w-[60%] p-4 lg:p-6 flex items-center justify-center overflow-hidden">
              {selectedPlan.preview_image_url ? (
                <div className="bg-white rounded-xl shadow-xl flex items-center justify-center p-2 overflow-hidden" style={{ maxHeight: '100%', aspectRatio: '3/4' }}>
                  <img
                    src={selectedPlan.preview_image_url}
                    alt="Floor Plan"
                    className="h-full w-full object-contain transition-transform origin-center"
                    style={{ transform: `scale(${scale}) rotate(90deg)` }}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageError(true)}
                  />
                  
                  {!imageLoaded && !imageError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                      <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white/5 rounded-xl p-20 text-center">
                  <Layers className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No image available for this floor plan</p>
                </div>
              )}
            </div>

            {/* Errors & Warnings Panel - 40% */}
            <div className="w-full lg:w-[40%] p-4 lg:p-6 lg:border-l border-white/10 overflow-y-auto">
              <div className="space-y-4">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-400" />
                  Validation Results
                </h3>
                
                {/* Errors Section */}
                {(() => {
                  const errors = layoutData?.errors || layoutData?.validation_results?.errors || [];
                  const errorCount = errors.length || (selectedPlan.compliance_notes?.match(/Errors:\s*(\d+)/)?.[1] ? parseInt(selectedPlan.compliance_notes.match(/Errors:\s*(\d+)/)?.[1] || '0') : 0);
                  
                  return (
                    <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/30">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        <span className="text-red-400 font-medium">Errors ({errors.length > 0 ? errors.length : errorCount})</span>
                      </div>
                      {errors.length > 0 ? (
                        <ul className="space-y-2">
                          {errors.map((error, index) => (
                            <li key={index} className="text-sm text-gray-300 flex items-start gap-2">
                              <span className="text-red-400 mt-0.5">•</span>
                              <div>
                                <p>{error.message}</p>
                                {error.room && <p className="text-gray-500 text-xs">Room: {error.room}</p>}
                                {error.details && <p className="text-gray-500 text-xs">{error.details}</p>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : errorCount > 0 ? (
                        <p className="text-gray-400 text-sm">
                          {errorCount} error{errorCount !== 1 ? 's' : ''} detected. Check layout_data for details.
                        </p>
                      ) : (
                        <p className="text-gray-400 text-sm">No errors detected</p>
                      )}
                    </div>
                  );
                })()}

                {/* Warnings Section */}
                {(() => {
                  const warnings = layoutData?.warnings || layoutData?.validation_results?.warnings || [];
                  const warningCount = warnings.length || (selectedPlan.compliance_notes?.match(/Warnings:\s*(\d+)/)?.[1] ? parseInt(selectedPlan.compliance_notes.match(/Warnings:\s*(\d+)/)?.[1] || '0') : 0);
                  
                  return (
                    <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/30">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        <span className="text-yellow-400 font-medium">Warnings ({warnings.length > 0 ? warnings.length : warningCount})</span>
                      </div>
                      {warnings.length > 0 ? (
                        <ul className="space-y-2">
                          {warnings.map((warning, index) => (
                            <li key={index} className="text-sm text-gray-300 flex items-start gap-2">
                              <span className="text-yellow-400 mt-0.5">•</span>
                              <div>
                                <p>{warning.message}</p>
                                {warning.room && <p className="text-gray-500 text-xs">Room: {warning.room}</p>}
                                {warning.details && <p className="text-gray-500 text-xs">{warning.details}</p>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : warningCount > 0 ? (
                        <p className="text-gray-400 text-sm">
                          {warningCount} warning{warningCount !== 1 ? 's' : ''} detected. Check layout_data for details.
                        </p>
                      ) : (
                        <p className="text-gray-400 text-sm">No warnings detected</p>
                      )}
                    </div>
                  );
                })()}

                {/* Compliance Summary */}
                {selectedPlan.compliance_notes && (
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <h4 className="text-white font-medium text-sm mb-2">Compliance Notes</h4>
                    <p className="text-gray-400 text-sm">{selectedPlan.compliance_notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Details Sidebar - Fixed width */}
          {showDetails && (
            <div className="lg:w-80 p-4 lg:p-6 lg:border-l border-white/10 overflow-y-auto bg-slate-900/50">
              <div className="space-y-6">
                {/* Variant Info */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{variant.icon}</span>
                    <div>
                      <h3 className="text-white font-semibold">{variant.name}</h3>
                      <p className="text-gray-400 text-sm">{variant.description}</p>
                    </div>
                  </div>
                </div>

                {/* Compliance Status */}
                <div className={`rounded-xl p-4 border ${
                  selectedPlan.is_compliant 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : 'bg-orange-500/10 border-orange-500/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {selectedPlan.is_compliant ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-orange-400" />
                    )}
                    <span className={`font-medium ${selectedPlan.is_compliant ? 'text-green-400' : 'text-orange-400'}`}>
                      {selectedPlan.is_compliant ? 'Compliant' : 'Needs Review'}
                    </span>
                  </div>
                  {selectedPlan.compliance_notes && (
                    <p className="text-gray-400 text-sm">{selectedPlan.compliance_notes}</p>
                  )}
                </div>

                {/* Plan Summary */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                    <Home className="w-5 h-5 text-blue-400" />
                    Plan Summary
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-white/5 rounded-lg">
                      <p className="text-2xl font-bold text-white">
                        {selectedPlan.total_area ? Math.round(selectedPlan.total_area) : '—'}
                      </p>
                      <p className="text-gray-400 text-xs">Total Area (m²)</p>
                    </div>
                    {selectedPlan.living_area && (
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <p className="text-2xl font-bold text-white">{Math.round(selectedPlan.living_area)}</p>
                        <p className="text-gray-400 text-xs">Living Area (m²)</p>
                      </div>
                    )}
                    {selectedPlan.project?.bedrooms && (
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <Bed className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                        <p className="text-xl font-bold text-white">{selectedPlan.project.bedrooms}</p>
                        <p className="text-gray-400 text-xs">Bedrooms</p>
                      </div>
                    )}
                    {selectedPlan.project?.bathrooms && (
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <Bath className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                        <p className="text-xl font-bold text-white">{selectedPlan.project.bathrooms}</p>
                        <p className="text-gray-400 text-xs">Bathrooms</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Building Envelope */}
                {layoutData?.building_envelope && (
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Ruler className="w-5 h-5 text-blue-400" />
                      Building Envelope
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Width</span>
                        <span className="text-white">{layoutData.building_envelope.width?.toFixed(1)}m</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Depth</span>
                        <span className="text-white">{layoutData.building_envelope.depth?.toFixed(1)}m</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generation Info */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-400" />
                    Generation Info
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Created</span>
                      <span className="text-white">{formatDate(selectedPlan.created_at, true)}</span>
                    </div>
                    {selectedPlan.generation_time_seconds && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Generation Time</span>
                        <span className="text-white">{selectedPlan.generation_time_seconds.toFixed(1)}s</span>
                      </div>
                    )}
                    {selectedPlan.ai_model_version && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">AI Model</span>
                        <span className="text-white text-xs">{selectedPlan.ai_model_version}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Back to Project */}
                <button
                  onClick={() => router.push(`/dashboard/projects/${selectedPlan.project_id}`)}
                  className="w-full bg-white/5 text-white py-3 rounded-lg hover:bg-white/10 transition flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5" />
                  View Project Details
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // GALLERY VIEW - List of all plans (/dashboard/plans)
  // =========================================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Layers className="w-7 h-7 text-blue-400" />
          Generated Floor Plans
        </h1>
        <p className="text-gray-400 mt-1">
          View and download all your AI-generated floor plans
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search by project name, location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          
          {/* Project Filter */}
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Projects</option>
            {projects.filter(p => p.status === 'generated').map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          
          {/* Variant Filter */}
          <select
            value={selectedVariantFilter}
            onChange={(e) => setSelectedVariantFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Variants</option>
            <option value={1}>⚡ Optimal Layout</option>
            <option value={2}>🏠 Spacious Living</option>
            <option value={3}>👑 Master Retreat</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-gray-400 text-sm">Total Plans</p>
          <p className="text-2xl font-bold text-white">{plans.length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-gray-400 text-sm">Projects</p>
          <p className="text-2xl font-bold text-white">{projects.filter(p => p.status === 'generated').length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-gray-400 text-sm">Compliant</p>
          <p className="text-2xl font-bold text-green-400">{plans.filter(p => p.is_compliant).length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-gray-400 text-sm">Showing</p>
          <p className="text-2xl font-bold text-blue-400">{filteredPlans.length}</p>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading floor plans...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-white font-medium mb-2">Error Loading Plans</p>
          <p className="text-gray-400 text-sm">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredPlans.length === 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
          <Layers className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No Floor Plans Found</h3>
          <p className="text-gray-400 mb-6">
            {plans.length === 0 
              ? "You haven't generated any floor plans yet. Create a project and generate plans to see them here."
              : "No plans match your current filters. Try adjusting your search."
            }
          </p>
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition"
          >
            Go to Projects
          </button>
        </div>
      )}

      {/* Plans Grid */}
      {!isLoading && !error && filteredPlans.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredPlans.map((plan) => {
            const variant = VARIANT_INFO[plan.variant_number || 1] || VARIANT_INFO[1];
            
            return (
              <div
                key={plan.id}
                className="bg-white/5 rounded-xl border border-white/10 overflow-hidden hover:border-blue-500/50 transition group cursor-pointer"
                onClick={() => handleViewPlan(plan)}
              >
                {/* Image */}
                <div className="aspect-[4/3] bg-slate-800 relative overflow-hidden">
                  {plan.preview_image_url ? (
                    <img
                      src={plan.preview_image_url}
                      alt={plan.plan_type || 'Floor Plan'}
                      className="w-full h-full object-contain bg-white group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-12 h-12 text-gray-600" />
                    </div>
                  )}
                  
                  {/* Variant Badge */}
                  <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-medium ${variant.color}`}>
                    {variant.icon} {variant.name}
                  </div>
                  
                  {/* Compliance Badge */}
                  <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-medium ${
                    plan.is_compliant 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-orange-500/20 text-orange-400'
                  }`}>
                    {plan.is_compliant ? '✓ Compliant' : '⚠ Review'}
                  </div>
                  
                  {/* Hover Actions */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxPlan(plan);
                      }}
                      className="p-3 bg-white/20 rounded-full hover:bg-white/30 transition"
                      title="Quick View"
                    >
                      <Eye className="w-5 h-5 text-white" />
                    </button>
                    {plan.preview_image_url && (
                      <button
                        onClick={(e) => handleDownload(plan, e)}
                        className="p-3 bg-white/20 rounded-full hover:bg-white/30 transition"
                        title="Download"
                      >
                        <Download className="w-5 h-5 text-white" />
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-white truncate mb-1">
                    {plan.project?.name || `Project ${plan.project_id}`}
                  </h3>
                  <p className="text-gray-400 text-sm flex items-center gap-1 mb-3">
                    <MapPin className="w-3 h-3" />
                    {plan.project?.suburb}, {plan.project?.state}
                  </p>
                  
                  {/* Stats Row */}
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    {plan.total_area && (
                      <span className="flex items-center gap-1">
                        <Home className="w-3.5 h-3.5" />
                        {Math.round(plan.total_area)}m²
                      </span>
                    )}
                    {plan.project?.bedrooms && (
                      <span className="flex items-center gap-1">
                        <Bed className="w-3.5 h-3.5" />
                        {plan.project.bedrooms}
                      </span>
                    )}
                    {plan.project?.bathrooms && (
                      <span className="flex items-center gap-1">
                        <Bath className="w-3.5 h-3.5" />
                        {plan.project.bathrooms}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightboxPlan && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxPlan(null)}
        >
          <button 
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white"
            onClick={() => setLightboxPlan(null)}
          >
            <X className="w-8 h-8" />
          </button>
          
          <div className="max-w-5xl max-h-[90vh] overflow-auto">
            {lightboxPlan.preview_image_url ? (
              <img
                src={lightboxPlan.preview_image_url}
                alt={lightboxPlan.plan_type || 'Floor Plan'}
                className="max-w-full h-auto bg-white rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="bg-slate-800 rounded-lg p-20 text-center">
                <ImageIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No image available</p>
              </div>
            )}
          </div>
          
          {/* Plan Info */}
          <div 
            className="absolute bottom-4 left-4 right-4 bg-black/70 rounded-lg p-4 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">{lightboxPlan.project?.name}</h3>
                <p className="text-gray-400 text-sm">
                  {VARIANT_INFO[lightboxPlan.variant_number || 1]?.icon} {VARIANT_INFO[lightboxPlan.variant_number || 1]?.name}
                  {lightboxPlan.total_area && ` • ${Math.round(lightboxPlan.total_area)}m²`}
                </p>
              </div>
              <div className="flex gap-2">
                {lightboxPlan.preview_image_url && (
                  <button
                    onClick={(e) => handleDownload(lightboxPlan, e)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                )}
                <button
                  onClick={() => {
                    setLightboxPlan(null);
                    handleViewPlan(lightboxPlan);
                  }}
                  className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition flex items-center gap-2"
                >
                  View Details
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
