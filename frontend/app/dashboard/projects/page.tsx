'use client';

// frontend/app/dashboard/projects/page.tsx
// Handles LIST VIEW and DETAIL VIEW only
// Plans view is handled by separate /[id]/plans/page.tsx

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  Trash2, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  Home,
  MapPin,
  Calendar,
  ChevronRight,
  ArrowLeft,
  Ruler,
  Bed,
  Bath,
  Car,
  Layers,
  Building,
  Wand2,
  FileText,
  Shield,
  Check,
  Cpu,
  Download,
  X,
  Edit,
  ExternalLink,
  Grid3X3,
  List,
  SortAsc,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api, { Project, FloorPlan } from '@/lib/api';

type ProjectStatus = 'all' | 'draft' | 'generating' | 'generated' | 'error';
type SortOption = 'newest' | 'oldest' | 'name' | 'status';
type ViewMode = 'grid' | 'list';

interface RenderedImages {
  pdf?: string;
  png?: string;
  thumbnail?: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // URL parsing - only handle list and detail views
  // Plans view is handled by separate /[id]/plans/page.tsx
  const pathSegments = pathname?.split('/').filter(Boolean) || [];
  const lastSegment = pathSegments[pathSegments.length - 1] || '';
  
  // Check if we're on a project detail page (e.g., /dashboard/projects/123)
  const projectIdFromUrl = lastSegment && !isNaN(parseInt(lastSegment)) && lastSegment !== 'projects' 
    ? lastSegment 
    : null;
  const isDetailView = projectIdFromUrl !== null;
  
  // List view state
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectThumbnails, setProjectThumbnails] = useState<Record<number, RenderedImages>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Detail view state
  const [project, setProject] = useState<Project | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [generationProgress, setGenerationProgress] = useState<string>('');

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      if (isDetailView && projectIdFromUrl) {
        fetchProject(parseInt(projectIdFromUrl));
      } else {
        fetchProjects();
      }
    }
  }, [authLoading, isAuthenticated, isDetailView, projectIdFromUrl]);

  const fetchProjects = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await api.getProjects(1, 50);
      setProjects(response.projects);
      
      // Fetch thumbnails for generated projects
      const thumbnails: Record<number, RenderedImages> = {};
      await Promise.all(
        response.projects
          .filter(p => p.status === 'generated')
          .map(async (proj) => {
            try {
              const plans = await api.getFloorPlans(proj.id);
              if (plans.length > 0 && plans[0].layout_data) {
                const layoutData = JSON.parse(plans[0].layout_data);
                thumbnails[proj.id] = {
                  pdf: (plans[0] as any).pdf_url || layoutData.rendered_images?.pdf,
                  png: (plans[0] as any).preview_image_url || layoutData.rendered_images?.png,
                  thumbnail: layoutData.rendered_images?.thumbnail,
                };
              }
            } catch (e) {
              // Ignore errors for individual projects
            }
          })
      );
      setProjectThumbnails(thumbnails);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProject = async (id: number) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await api.getProject(id);
      setProject(data);
      
      if (data.status === 'generated') {
        try {
          const plans = await api.getFloorPlans(id);
          setFloorPlans(plans);
        } catch (planErr) {
          console.error('Error fetching floor plans:', planErr);
        }
      }
    } catch (err) {
      console.error('Error fetching project:', err);
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    setIsDeleting(true);
    try {
      await api.deleteProject(projectId);
      if (isDetailView) {
        router.push('/dashboard/projects');
      } else {
        setProjects(prev => prev.filter(p => p.id !== projectId));
      }
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting project:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleGenerateFloorPlans = async () => {
    if (!project) return;
    
    setIsGenerating(true);
    setError(null);
    setGenerationProgress('Starting AI generation...');
    
    try {
      await api.generateFloorPlans(project.id);
      setGenerationProgress('AI is designing your floor plan...');
      
      // Poll for completion
      let attempts = 0;
      const maxAttempts = 30;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          const updatedProject = await api.getProject(project.id);
          setProject(updatedProject);
          
          if (updatedProject.status === 'generated') {
            setGenerationProgress('Rendering CAD floor plan...');
            const plans = await api.getFloorPlans(project.id);
            setFloorPlans(plans);
            setGenerationProgress('');
            setIsGenerating(false);
            return;
          } else if (updatedProject.status === 'error') {
            setError('Floor plan generation failed. Please try again.');
            setGenerationProgress('');
            setIsGenerating(false);
            return;
          }
          
          setGenerationProgress(`AI is designing your floor plan... (${attempts * 2}s)`);
        } catch (pollError) {
          console.error('Error polling:', pollError);
        }
        
        attempts++;
      }
      
      setError('Generation is taking longer than expected. Please refresh.');
      setGenerationProgress('');
      setIsGenerating(false);
    } catch (err) {
      console.error('Error generating floor plans:', err);
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setGenerationProgress('');
      setIsGenerating(false);
    }
  };

  const getStatusBadge = (status?: string, size: 'sm' | 'md' = 'sm') => {
    const sizeClasses = size === 'sm' 
      ? 'px-2 py-1 text-xs gap-1' 
      : 'px-3 py-1.5 text-sm gap-2';
    const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
    
    switch (status) {
      case 'generated':
        return (
          <span className={`flex items-center ${sizeClasses} bg-green-500/20 text-green-400 rounded-full font-medium`}>
            <CheckCircle className={iconSize} /> Generated
          </span>
        );
      case 'generating':
        return (
          <span className={`flex items-center ${sizeClasses} bg-blue-500/20 text-blue-400 rounded-full font-medium`}>
            <Loader2 className={`${iconSize} animate-spin`} /> Generating
          </span>
        );
      case 'error':
        return (
          <span className={`flex items-center ${sizeClasses} bg-red-500/20 text-red-400 rounded-full font-medium`}>
            <AlertCircle className={iconSize} /> Error
          </span>
        );
      default:
        return (
          <span className={`flex items-center ${sizeClasses} bg-yellow-500/20 text-yellow-400 rounded-full font-medium`}>
            <Clock className={iconSize} /> Draft
          </span>
        );
    }
  };

  const formatDate = (dateString: string, full: boolean = false) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: full ? 'long' : 'short',
      year: 'numeric'
    });
  };

  // Filter and sort projects
  const filteredProjects = projects
    .filter(project => {
      const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.suburb?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.council?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name':
          return a.name.localeCompare(b.name);
        case 'status':
          return (a.status || '').localeCompare(b.status || '');
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  // Stats
  const stats = {
    total: projects.length,
    generated: projects.filter(p => p.status === 'generated').length,
    draft: projects.filter(p => p.status === 'draft' || !p.status).length,
    generating: projects.filter(p => p.status === 'generating').length,
  };

  // Loading state with skeleton
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
        <div className="mb-8 animate-pulse">
          <div className="h-8 w-48 bg-white/10 rounded mb-2"></div>
          <div className="h-4 w-64 bg-white/10 rounded"></div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden animate-pulse">
              <div className="h-32 bg-white/5"></div>
              <div className="p-4 space-y-3">
                <div className="h-5 w-3/4 bg-white/10 rounded"></div>
                <div className="h-4 w-1/2 bg-white/10 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ==================== DETAIL VIEW ====================
  if (isDetailView) {
    // Error state for detail view
    if (error || !project) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
          <button 
            onClick={() => router.push('/dashboard/projects')}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Projects
          </button>
          
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Project Not Found</h2>
            <p className="text-gray-400 mb-4">{error || 'The project you\'re looking for doesn\'t exist.'}</p>
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

    // Get rendered images from floor plan
    const planWithImages = floorPlans[0];
    const layoutData = planWithImages?.layout_data ? JSON.parse(planWithImages.layout_data) : null;
    const renderedImages: RenderedImages = {
      pdf: (planWithImages as any)?.pdf_url || layoutData?.rendered_images?.pdf,
      png: (planWithImages as any)?.preview_image_url || layoutData?.rendered_images?.png,
      thumbnail: layoutData?.rendered_images?.thumbnail,
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
        {/* Header */}
        <div className="mb-6">
          <button 
            onClick={() => router.push('/dashboard/projects')}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Projects
          </button>
          
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">{project.name}</h1>
                {getStatusBadge(project.status, 'md')}
              </div>
              <p className="text-gray-400 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {project.suburb}, {project.state} {project.postcode}
                {project.council && <span className="text-gray-500">• {project.council}</span>}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push(`/dashboard/projects/${project.id}/edit`)}
                className="px-3 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => setShowDeleteConfirm(project.id)}
                className="px-3 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-400 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Floor Plan Preview - Show CAD image if available */}
            {project.status === 'generated' && renderedImages.png && (
              <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-blue-400" />
                    Generated Floor Plan
                  </h2>
                  <div className="flex items-center gap-2">
                    {renderedImages.pdf && (
                      <a
                        href={renderedImages.pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 text-sm"
                      >
                        <Download className="w-4 h-4" />
                        PDF
                      </a>
                    )}
                    <button
                      onClick={() => router.push(`/dashboard/projects/${project.id}/plans`)}
                      className="px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition flex items-center gap-2 text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Full View
                    </button>
                  </div>
                </div>
                <div 
                  className="aspect-[16/10] bg-slate-800 flex items-center justify-center cursor-pointer hover:bg-slate-700 transition"
                  onClick={() => router.push(`/dashboard/projects/${project.id}/plans`)}
                >
                  <img
                    src={renderedImages.png}
                    alt="Floor Plan"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                {/* Plan Stats */}
                {planWithImages && (
                  <div className="p-4 grid grid-cols-4 gap-4 border-t border-white/10">
                    <div className="text-center">
                      <p className="text-xl font-bold text-white">{planWithImages.total_area?.toFixed(0) || '—'}</p>
                      <p className="text-xs text-gray-500">Total m²</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-white">{layoutData?.summary?.bedroom_count || project.bedrooms || '—'}</p>
                      <p className="text-xs text-gray-500">Bedrooms</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-white">{layoutData?.summary?.bathroom_count || project.bathrooms || '—'}</p>
                      <p className="text-xs text-gray-500">Bathrooms</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-white">{layoutData?.rooms?.length || '—'}</p>
                      <p className="text-xs text-gray-500">Rooms</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Location Details */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-400" />
                Location
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {project.street_address && (
                  <div>
                    <p className="text-gray-500 text-sm">Street Address</p>
                    <p className="text-white">{project.street_address}</p>
                  </div>
                )}
                {project.suburb && (
                  <div>
                    <p className="text-gray-500 text-sm">Suburb</p>
                    <p className="text-white">{project.suburb}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-500 text-sm">State</p>
                  <p className="text-white">{project.state}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Postcode</p>
                  <p className="text-white">{project.postcode}</p>
                </div>
                {project.council && (
                  <div className="sm:col-span-2">
                    <p className="text-gray-500 text-sm">Council</p>
                    <p className="text-white">{project.council}</p>
                  </div>
                )}
                {project.lot_dp && (
                  <div>
                    <p className="text-gray-500 text-sm">Lot/DP</p>
                    <p className="text-white">{project.lot_dp}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Land & Building Details */}
            <div className="grid sm:grid-cols-2 gap-6">
              {/* Land Details */}
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Ruler className="w-5 h-5 text-blue-400" />
                  Land
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Width</span>
                    <span className="text-white font-medium">{project.land_width || '—'}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Depth</span>
                    <span className="text-white font-medium">{project.land_depth || '—'}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Area</span>
                    <span className="text-white font-medium">{project.land_area?.toFixed(0) || '—'}m²</span>
                  </div>
                  {project.land_slope && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Slope</span>
                      <span className="text-white font-medium">{project.land_slope}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Building Requirements */}
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Building className="w-5 h-5 text-blue-400" />
                  Requirements
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <Bed className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{project.bedrooms || '—'}</p>
                    <p className="text-xs text-gray-500">Beds</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <Bath className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{project.bathrooms || '—'}</p>
                    <p className="text-xs text-gray-500">Baths</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <Car className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{project.garage_spaces || '—'}</p>
                    <p className="text-xs text-gray-500">Garage</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <Layers className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{project.storeys || '—'}</p>
                    <p className="text-xs text-gray-500">Storeys</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Style Tags */}
            {(project.style || project.open_plan || project.outdoor_entertainment || project.home_office) && (
              <div className="flex flex-wrap gap-2">
                {project.style && (
                  <span className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
                    {project.style}
                  </span>
                )}
                {project.open_plan && (
                  <span className="px-3 py-1.5 bg-white/10 text-gray-300 rounded-full text-sm">
                    Open Plan
                  </span>
                )}
                {project.outdoor_entertainment && (
                  <span className="px-3 py-1.5 bg-white/10 text-gray-300 rounded-full text-sm">
                    Outdoor Entertainment
                  </span>
                )}
                {project.home_office && (
                  <span className="px-3 py-1.5 bg-white/10 text-gray-300 rounded-full text-sm">
                    Home Office
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Sidebar - Actions */}
          <div className="space-y-6">
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-blue-400" />
                AI Floor Plan
              </h2>

              {project.status === 'generated' ? (
                <div>
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-green-400 mb-2">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">Generation Complete</span>
                    </div>
                    <p className="text-gray-400 text-sm">Your CAD-quality floor plan is ready</p>
                  </div>
                  
                  <div className="space-y-2">
                    <button
                      onClick={() => router.push(`/dashboard/projects/${project.id}/plans`)}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
                    >
                      <Eye className="w-5 h-5" />
                      View Floor Plan
                    </button>
                    
                    {renderedImages.pdf && (
                      <a
                        href={renderedImages.pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-white/10 text-white py-3 rounded-lg hover:bg-white/20 transition font-medium flex items-center justify-center gap-2 block"
                      >
                        <Download className="w-5 h-5" />
                        Download PDF
                      </a>
                    )}
                    
                    <button
                      onClick={handleGenerateFloorPlans}
                      disabled={isGenerating}
                      className="w-full bg-white/5 text-gray-400 py-3 rounded-lg hover:bg-white/10 transition font-medium flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Regenerate
                    </button>
                  </div>
                </div>
              ) : project.status === 'generating' || isGenerating ? (
                <div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-blue-400 mb-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-medium">Generating...</span>
                    </div>
                    <p className="text-gray-400 text-sm">
                      {generationProgress || 'Your floor plan is being created...'}
                    </p>
                  </div>
                  
                  {/* Progress animation */}
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                  </div>
                  
                  <button
                    disabled
                    className="w-full bg-white/10 text-gray-400 py-3 rounded-lg cursor-not-allowed font-medium"
                  >
                    Please Wait...
                  </button>
                </div>
              ) : (
                <div>
                  {/* Features */}
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <Cpu className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">AI-Powered</p>
                        <p className="text-gray-500 text-xs">GPT-4 optimized design</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <FileText className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">CAD Quality</p>
                        <p className="text-gray-500 text-xs">Professional PDF output</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <Shield className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">NCC Compliant</p>
                        <p className="text-gray-500 text-xs">Australian building code</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateFloorPlans}
                    disabled={isGenerating || !project.bedrooms}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="w-5 h-5" />
                    Generate Floor Plan
                  </button>
                  
                  {!project.bedrooms && (
                    <p className="text-yellow-400 text-xs mt-2 text-center">
                      Complete the questionnaire first
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Project Info */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Project Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Created</span>
                  <span className="text-white">{formatDate(project.created_at, true)}</span>
                </div>
                {project.updated_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Updated</span>
                    <span className="text-white">{formatDate(project.updated_at, true)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">ID</span>
                  <span className="text-white font-mono">#{project.id}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-2">Delete Project?</h3>
              <p className="text-gray-400 mb-6">
                Are you sure you want to delete "{project.name}"? This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteProject(showDeleteConfirm)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== LIST VIEW ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">My Projects</h1>
            <p className="text-gray-400 mt-1">Manage your floor plan projects</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/projects/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <p className="text-2xl font-bold text-white">{stats.total}</p>
          <p className="text-gray-500 text-sm">Total Projects</p>
        </div>
        <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/20">
          <p className="text-2xl font-bold text-green-400">{stats.generated}</p>
          <p className="text-green-400/70 text-sm">Generated</p>
        </div>
        <div className="bg-yellow-500/10 rounded-lg p-4 border border-yellow-500/20">
          <p className="text-2xl font-bold text-yellow-400">{stats.draft}</p>
          <p className="text-yellow-400/70 text-sm">Drafts</p>
        </div>
        <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
          <p className="text-2xl font-bold text-blue-400">{stats.generating}</p>
          <p className="text-blue-400/70 text-sm">Generating</p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-400 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search, Filter, Sort, View Toggle */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProjectStatus)}
              className="pl-9 pr-8 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-blue-500 focus:outline-none appearance-none cursor-pointer text-sm"
            >
              <option value="all" className="bg-slate-800">All Status</option>
              <option value="draft" className="bg-slate-800">Draft</option>
              <option value="generating" className="bg-slate-800">Generating</option>
              <option value="generated" className="bg-slate-800">Generated</option>
              <option value="error" className="bg-slate-800">Error</option>
            </select>
          </div>

          <div className="relative">
            <SortAsc className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="pl-9 pr-8 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-blue-500 focus:outline-none appearance-none cursor-pointer text-sm"
            >
              <option value="newest" className="bg-slate-800">Newest</option>
              <option value="oldest" className="bg-slate-800">Oldest</option>
              <option value="name" className="bg-slate-800">Name</option>
              <option value="status" className="bg-slate-800">Status</option>
            </select>
          </div>

          <div className="flex bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <Grid3X3 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Projects Grid/List */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white/5 rounded-xl p-12 text-center border border-white/10">
          <Home className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {projects.length === 0 ? 'No projects yet' : 'No matching projects'}
          </h3>
          <p className="text-gray-400 mb-6">
            {projects.length === 0 
              ? 'Create your first project to get started.'
              : 'Try adjusting your search or filter.'}
          </p>
          {projects.length === 0 && (
            <button
              onClick={() => router.push('/dashboard/projects/new')}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Create Your First Project
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        // Grid View
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((proj) => {
            const thumbnail = projectThumbnails[proj.id];
            
            return (
              <div
                key={proj.id}
                className="bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition overflow-hidden group cursor-pointer"
                onClick={() => router.push(`/dashboard/projects/${proj.id}`)}
              >
                {/* Thumbnail */}
                <div className="aspect-[16/10] bg-slate-800 relative overflow-hidden">
                  {thumbnail?.thumbnail || thumbnail?.png ? (
                    <img
                      src={thumbnail.thumbnail || thumbnail.png}
                      alt={proj.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <Home className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                        <p className="text-gray-500 text-sm">{proj.status === 'generated' ? 'View Plan' : 'No Preview'}</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Status Badge */}
                  <div className="absolute top-2 right-2">
                    {getStatusBadge(proj.status)}
                  </div>
                </div>
                
                {/* Content */}
                <div className="p-4">
                  <h3 className="text-white font-semibold mb-1 group-hover:text-blue-400 transition truncate">
                    {proj.name}
                  </h3>
                  
                  {proj.suburb && (
                    <p className="text-gray-400 text-sm flex items-center gap-1 mb-3">
                      <MapPin className="w-3 h-3" />
                      {proj.suburb}, {proj.state}
                    </p>
                  )}
                  
                  <div className="flex flex-wrap gap-2 text-xs">
                    {proj.land_area && (
                      <span className="px-2 py-1 bg-white/5 text-gray-400 rounded">
                        {proj.land_area.toFixed(0)}m²
                      </span>
                    )}
                    {proj.bedrooms && (
                      <span className="px-2 py-1 bg-white/5 text-gray-400 rounded">
                        {proj.bedrooms} bed
                      </span>
                    )}
                    {proj.bathrooms && (
                      <span className="px-2 py-1 bg-white/5 text-gray-400 rounded">
                        {proj.bathrooms} bath
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // List View
        <div className="space-y-2">
          {filteredProjects.map((proj) => {
            const thumbnail = projectThumbnails[proj.id];
            
            return (
              <div
                key={proj.id}
                className="bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition p-4 flex items-center gap-4 cursor-pointer"
                onClick={() => router.push(`/dashboard/projects/${proj.id}`)}
              >
                {/* Thumbnail */}
                <div className="w-20 h-14 bg-slate-800 rounded-lg overflow-hidden flex-shrink-0">
                  {thumbnail?.thumbnail ? (
                    <img src={thumbnail.thumbnail} alt={proj.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Home className="w-6 h-6 text-gray-600" />
                    </div>
                  )}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-semibold truncate">{proj.name}</h3>
                    {getStatusBadge(proj.status)}
                  </div>
                  <p className="text-gray-400 text-sm truncate">
                    {proj.suburb && `${proj.suburb}, ${proj.state}`}
                    {proj.council && ` • ${proj.council}`}
                  </p>
                </div>
                
                {/* Stats */}
                <div className="hidden sm:flex items-center gap-4 text-sm text-gray-400">
                  {proj.bedrooms && <span>{proj.bedrooms} bed</span>}
                  {proj.bathrooms && <span>{proj.bathrooms} bath</span>}
                  {proj.land_area && <span>{proj.land_area.toFixed(0)}m²</span>}
                </div>
                
                {/* Date */}
                <div className="text-gray-500 text-sm hidden md:block">
                  {formatDate(proj.created_at)}
                </div>
                
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Project?</h3>
            <p className="text-gray-400 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProject(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
