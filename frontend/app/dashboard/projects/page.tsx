'use client';

// frontend/app/dashboard/projects/page.tsx
// Handles LIST VIEW and DETAIL VIEW only
// Floor plan display is handled by separate /[id]/plans/page.tsx

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
  Check,
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

export default function ProjectsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // URL parsing - only handle list and detail views
  const pathSegments = pathname?.split('/').filter(Boolean) || [];
  const lastSegment = pathSegments[pathSegments.length - 1] || '';
  
  // Check if we're on a project detail page (e.g., /dashboard/projects/123)
  const projectIdFromUrl = lastSegment && !isNaN(parseInt(lastSegment)) && lastSegment !== 'projects' 
    ? lastSegment 
    : null;
  const isDetailView = projectIdFromUrl !== null;
  
  // List view state
  const [projects, setProjects] = useState<Project[]>([]);
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
    setGenerationProgress('Loading sample floor plans...');
    
    try {
      await api.generateFloorPlans(project.id);
      setGenerationProgress('Finding best matching sample plan...');
      
      // Poll for completion
      let attempts = 0;
      const maxAttempts = 45; // Increased for sample-based processing
      
      const progressMessages = [
        'Finding best matching sample plan...',
        'Analyzing land dimensions...',
        'Matching requirements to samples...',
        'Adapting floor plan layout...',
        'Applying minimal modifications...',
        'Preserving circulation flow...',
        'Generating floor plan image...',
        'Finalizing design...'
      ];
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          const updatedProject = await api.getProject(project.id);
          setProject(updatedProject);
          
          if (updatedProject.status === 'generated') {
            setGenerationProgress('Complete!');
            const plans = await api.getFloorPlans(project.id);
            setFloorPlans(plans);
            
            // Redirect to plans page after short delay
            setTimeout(() => {
              router.push(`/dashboard/projects/${project.id}/plans`);
            }, 1000);
            
            setIsGenerating(false);
            return;
          } else if (updatedProject.status === 'error') {
            setError('Floor plan generation failed. Please try again.');
            setGenerationProgress('');
            setIsGenerating(false);
            return;
          }
          
          // Cycle through progress messages
          const messageIndex = Math.min(Math.floor(attempts / 3), progressMessages.length - 1);
          setGenerationProgress(`${progressMessages[messageIndex]} (${attempts * 2}s)`);
        } catch (pollError) {
          console.error('Error polling:', pollError);
        }
        
        attempts++;
      }
      
      setError('Generation is taking longer than expected. Please refresh the page.');
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
                  Land Dimensions
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
                    <p className="text-gray-400 text-sm">Your floor plan is ready to view</p>
                  </div>
                  
                  <div className="space-y-2">
                    <button
                      onClick={() => router.push(`/dashboard/projects/${project.id}/plans`)}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
                    >
                      <Eye className="w-5 h-5" />
                      View Floor Plan
                    </button>
                    
                    <button
                      onClick={handleGenerateFloorPlans}
                      disabled={isGenerating}
                      className="w-full bg-white/10 text-white py-3 rounded-lg hover:bg-white/20 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                      Regenerate
                    </button>
                  </div>
                </div>
              ) : project.status === 'generating' || isGenerating ? (
                <div className="text-center py-8">
                  <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
                  <p className="text-white font-medium mb-2">Generating Floor Plan</p>
                  <p className="text-gray-400 text-sm">{generationProgress || 'Please wait...'}</p>
                  
                  <div className="mt-4 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <p className="text-blue-400 text-xs">
                      AI is selecting the best matching sample plan and adapting it for your land dimensions
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-gray-400 text-sm mb-4">
                    Generate a professional floor plan based on your requirements. Our AI will:
                  </p>
                  <ul className="text-gray-400 text-sm space-y-2 mb-6">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      Find the best matching sample from our library
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      Adapt it to fit your land dimensions
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      Preserve professional circulation flow
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      Generate a livable, NCC-compliant design
                    </li>
                  </ul>
                  
                  <button
                    onClick={handleGenerateFloorPlans}
                    disabled={!project.bedrooms || isGenerating}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="w-5 h-5" />
                    Generate Floor Plan
                  </button>
                  
                  {!project.bedrooms && (
                    <p className="text-yellow-400 text-xs mt-2 text-center">
                      Please complete the questionnaire first
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Project Info */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Project Details</h3>
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
                  <span className="text-white">#{project.id}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm !== null && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-white/10">
              <h3 className="text-xl font-semibold text-white mb-2">Delete Project?</h3>
              <p className="text-gray-400 mb-6">
                This will permanently delete &quot;{project?.name}&quot; and all associated floor plans.
                This action cannot be undone.
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
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">My Projects</h1>
            <p className="text-gray-400">Manage your floor plan projects</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/projects/new')}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition flex items-center gap-2 font-medium"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-gray-400 text-sm">Total</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-gray-400 text-sm">Generated</p>
            <p className="text-2xl font-bold text-green-400">{stats.generated}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-gray-400 text-sm">Draft</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.draft}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-gray-400 text-sm">In Progress</p>
            <p className="text-2xl font-bold text-blue-400">{stats.generating}</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProjectStatus)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="generating">Generating</option>
            <option value="generated">Generated</option>
            <option value="error">Error</option>
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">Name A-Z</option>
            <option value="status">By Status</option>
          </select>
          
          <div className="flex bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <List className="w-4 h-4" />
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

      {/* Projects Grid/List */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16">
          <Home className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-white mb-2">
            {projects.length === 0 ? 'No projects yet' : 'No matching projects'}
          </h3>
          <p className="text-gray-400 mb-6">
            {projects.length === 0 
              ? 'Create your first project to get started'
              : 'Try adjusting your search or filters'
            }
          </p>
          {projects.length === 0 && (
            <button
              onClick={() => router.push('/dashboard/projects/new')}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Project
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((proj) => (
            <div
              key={proj.id}
              className="bg-white/5 rounded-xl border border-white/10 overflow-hidden hover:border-blue-500/50 transition cursor-pointer group"
              onClick={() => router.push(`/dashboard/projects/${proj.id}`)}
            >
              {/* Card Header */}
              <div className="h-24 bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center relative">
                <Home className="w-10 h-10 text-blue-400/50" />
                <div className="absolute top-2 right-2">
                  {getStatusBadge(proj.status)}
                </div>
              </div>
              
              {/* Card Content */}
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-blue-400 transition truncate">
                  {proj.name}
                </h3>
                <p className="text-gray-400 text-sm flex items-center gap-1 mb-3">
                  <MapPin className="w-3 h-3" />
                  {proj.suburb}, {proj.state}
                </p>
                
                {/* Quick Stats */}
                <div className="flex items-center gap-4 text-gray-500 text-sm">
                  {proj.bedrooms && (
                    <span className="flex items-center gap-1">
                      <Bed className="w-3 h-3" /> {proj.bedrooms}
                    </span>
                  )}
                  {proj.bathrooms && (
                    <span className="flex items-center gap-1">
                      <Bath className="w-3 h-3" /> {proj.bathrooms}
                    </span>
                  )}
                  {proj.garage_spaces && (
                    <span className="flex items-center gap-1">
                      <Car className="w-3 h-3" /> {proj.garage_spaces}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Card Footer */}
              <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-gray-500 text-xs">
                  {formatDate(proj.created_at)}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-blue-400 transition" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredProjects.map((proj) => (
            <div
              key={proj.id}
              className="bg-white/5 rounded-lg border border-white/10 p-4 hover:border-blue-500/50 transition cursor-pointer flex items-center gap-4"
              onClick={() => router.push(`/dashboard/projects/${proj.id}`)}
            >
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Home className="w-6 h-6 text-blue-400/50" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-medium truncate">{proj.name}</h3>
                <p className="text-gray-500 text-sm flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {proj.suburb}, {proj.state} {proj.postcode}
                </p>
              </div>
              
              <div className="flex items-center gap-4 text-gray-500 text-sm hidden sm:flex">
                {proj.bedrooms && (
                  <span className="flex items-center gap-1">
                    <Bed className="w-3 h-3" /> {proj.bedrooms}
                  </span>
                )}
                {proj.bathrooms && (
                  <span className="flex items-center gap-1">
                    <Bath className="w-3 h-3" /> {proj.bathrooms}
                  </span>
                )}
              </div>
              
              {getStatusBadge(proj.status)}
              
              <span className="text-gray-500 text-xs hidden md:block">
                {formatDate(proj.created_at)}
              </span>
              
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-white/10">
            <h3 className="text-xl font-semibold text-white mb-2">Delete Project?</h3>
            <p className="text-gray-400 mb-6">
              This will permanently delete this project and all associated floor plans.
              This action cannot be undone.
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
