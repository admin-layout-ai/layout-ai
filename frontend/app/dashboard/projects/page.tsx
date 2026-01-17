'use client';

// frontend/app/dashboard/projects/page.tsx
// Handles LIST VIEW and DETAIL VIEW only
// Floor plan display is handled by separate /[id]/plans/page.tsx
//
// UPDATED: Supports 3 floor plan variants, removed Edit/Delete, fixed polling timeout

import { useState, useEffect, useCallback, useRef } from 'react';
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
  FolderOpen,
  Wand2,
  Check,
  X,
  Edit,
  ExternalLink,
  SortAsc,
  Layout,
  Pencil,
  Save,
  Sofa
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api, { Project, FloorPlan } from '@/lib/api';

type ProjectStatus = 'all' | 'draft' | 'generating' | 'generated' | 'error';
type SortOption = 'newest' | 'oldest' | 'name' | 'status';

// Variant information for display
const VARIANT_INFO = [
  { name: 'Optimal Layout', description: 'Balanced, efficient design', icon: '⚡' },
  { name: 'Spacious Living', description: 'Larger living areas', icon: '🏠' },
  { name: 'Master Retreat', description: 'Enhanced master suite', icon: '👑' },
];

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Detail view state
  const [project, setProject] = useState<Project | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [generatedCount, setGeneratedCount] = useState(0);
  
  // Edit mode state (for draft projects)
  const [isEditingLand, setIsEditingLand] = useState(false);
  const [isEditingRequirements, setIsEditingRequirements] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    land_width: 0,
    land_depth: 0,
    bedrooms: 0,
    bathrooms: 0,
    living_areas: 1,
    garage_spaces: 0,
    storeys: 1,
    style: '',
    open_plan: false,
    outdoor_entertainment: false,
    home_office: false
  });
  
  // Polling ref to prevent memory leaks
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
      isPollingRef.current = false;
    };
  }, []);

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
      
      // If status is generating, start polling
      if (data.status === 'generating') {
        setIsGenerating(true);
        startPolling(id);
      }
      
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

  // Start editing land dimensions
  const handleEditLand = () => {
    if (project) {
      setEditForm(prev => ({
        ...prev,
        land_width: project.land_width || 0,
        land_depth: project.land_depth || 0
      }));
      setIsEditingLand(true);
    }
  };

  // Start editing requirements
  const handleEditRequirements = () => {
    if (project) {
      setEditForm(prev => ({
        ...prev,
        bedrooms: project.bedrooms || 0,
        bathrooms: project.bathrooms || 0,
        living_areas: project.living_areas || 1,
        garage_spaces: project.garage_spaces || 0,
        storeys: project.storeys || 1,
        style: project.style || '',
        open_plan: project.open_plan || false,
        outdoor_entertainment: project.outdoor_entertainment || false,
        home_office: project.home_office || false
      }));
      setIsEditingRequirements(true);
    }
  };

  // Save land dimensions
  const handleSaveLand = async () => {
    if (!project) return;
    setIsSaving(true);
    setError(null);
    
    try {
      const landArea = editForm.land_width * editForm.land_depth;
      const updated = await api.updateProject(project.id, {
        land_width: editForm.land_width,
        land_depth: editForm.land_depth,
        land_area: landArea
      });
      setProject(updated);
      setIsEditingLand(false);
    } catch (err) {
      console.error('Error updating land dimensions:', err);
      setError(err instanceof Error ? err.message : 'Failed to update land dimensions');
    } finally {
      setIsSaving(false);
    }
  };

  // Save requirements
  const handleSaveRequirements = async () => {
    if (!project) return;
    setIsSaving(true);
    setError(null);
    
    try {
      const updated = await api.updateProject(project.id, {
        bedrooms: editForm.bedrooms,
        bathrooms: editForm.bathrooms,
        living_areas: editForm.living_areas,
        garage_spaces: editForm.garage_spaces,
        storeys: editForm.storeys,
        style: editForm.style || undefined,
        open_plan: editForm.open_plan,
        outdoor_entertainment: editForm.outdoor_entertainment,
        home_office: editForm.home_office
      });
      setProject(updated);
      setIsEditingRequirements(false);
    } catch (err) {
      console.error('Error updating requirements:', err);
      setError(err instanceof Error ? err.message : 'Failed to update requirements');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditingLand(false);
    setIsEditingRequirements(false);
  };

  // Improved polling function with better error handling
  const startPolling = useCallback((projectId: number) => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    
    const progressMessages = [
      'Loading sample floor plans...',
      'Analyzing land dimensions...',
      'Generating Variant 1: Optimal Layout...',
      'Generating Variant 2: Spacious Living...',
      'Generating Variant 3: Master Retreat...',
      'Running compliance validation...',
      'Uploading images...',
      'Finalizing designs...'
    ];
    
    let attempts = 0;
    const maxAttempts = 90; // 3 minutes max (2s intervals)
    
    const poll = async () => {
      if (!isPollingRef.current) return;
      
      try {
        const updatedProject = await api.getProject(projectId);
        setProject(updatedProject);
        
        if (updatedProject.status === 'generated') {
          // Success!
          isPollingRef.current = false;
          setGenerationProgress('All variants complete!');
          
          const plans = await api.getFloorPlans(projectId);
          setFloorPlans(plans);
          setGeneratedCount(plans.length);
          
          // Short delay then redirect to plans page
          setTimeout(() => {
            setIsGenerating(false);
            router.push(`/dashboard/projects/${projectId}/plans`);
          }, 1500);
          return;
        }
        
        if (updatedProject.status === 'error') {
          isPollingRef.current = false;
          setError('Floor plan generation failed. Please try again.');
          setGenerationProgress('');
          setIsGenerating(false);
          return;
        }
        
        // Still generating - update progress message
        const messageIndex = Math.min(Math.floor(attempts / 8), progressMessages.length - 1);
        const elapsed = attempts * 2;
        setGenerationProgress(`${progressMessages[messageIndex]} (${elapsed}s)`);
        
        attempts++;
        
        if (attempts >= maxAttempts) {
          // Don't show error - generation might still be working
          // Just update the message and keep polling slower
          setGenerationProgress('Generation is taking longer than usual. Still working...');
          
          // Continue polling but slower (every 5 seconds)
          pollingRef.current = setTimeout(poll, 5000);
          return;
        }
        
        // Continue polling
        pollingRef.current = setTimeout(poll, 2000);
        
      } catch (pollError) {
        console.error('Polling error:', pollError);
        
        // Don't stop on network errors - keep trying
        attempts++;
        if (attempts < maxAttempts) {
          pollingRef.current = setTimeout(poll, 3000);
        }
      }
    };
    
    // Start polling
    poll();
  }, [router]);

  const handleGenerateFloorPlans = async () => {
    if (!project) return;
    
    setIsGenerating(true);
    setError(null);
    setGenerationProgress('Starting generation of 3 floor plan variants...');
    setGeneratedCount(0);
    
    try {
      // Trigger generation (this returns immediately)
      await api.generateFloorPlans(project.id);
      
      // Update local project status
      setProject(prev => prev ? { ...prev, status: 'generating' } : null);
      
      // Start polling for completion
      startPolling(project.id);
      
    } catch (err) {
      console.error('Error starting generation:', err);
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
          <div className="flex items-center gap-3 mb-2">
            <div className="w-7 h-7 bg-white/10 rounded"></div>
            <div className="h-8 w-48 bg-white/10 rounded"></div>
          </div>
          <div className="h-4 w-64 bg-white/10 rounded mt-2"></div>
        </div>
        
        {/* Filter skeleton */}
        <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10 animate-pulse">
          <div className="flex gap-4">
            <div className="flex-1 h-10 bg-white/10 rounded-lg"></div>
            <div className="w-32 h-10 bg-white/10 rounded-lg"></div>
            <div className="w-32 h-10 bg-white/10 rounded-lg"></div>
          </div>
        </div>
        
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="h-4 w-20 bg-white/10 rounded mb-2"></div>
              <div className="h-8 w-12 bg-white/10 rounded"></div>
            </div>
          ))}
        </div>
        
        {/* List skeleton */}
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/10 rounded-xl flex-shrink-0"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-1/3 bg-white/10 rounded"></div>
                  <div className="h-4 w-1/4 bg-white/10 rounded"></div>
                </div>
                <div className="h-6 w-24 bg-white/10 rounded-full"></div>
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
    if (error && !project) {
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

    if (!project) return null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
        {/* Header - REMOVED Edit/Delete buttons */}
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
            
            {/* Empty div to maintain layout - buttons removed */}
            <div></div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-red-400 flex items-center gap-3">
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
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Ruler className="w-5 h-5 text-blue-400" />
                    Land Dimensions
                  </h2>
                  {project.status === 'draft' && !isEditingLand && (
                    <button
                      onClick={handleEditLand}
                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-white/10 rounded-lg transition"
                      title="Edit land dimensions"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {isEditingLand ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-gray-500 text-sm block mb-1">Width (m)</label>
                      <input
                        type="number"
                        value={editForm.land_width || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, land_width: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        step="0.1"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-sm block mb-1">Depth (m)</label>
                      <input
                        type="number"
                        value={editForm.land_depth || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, land_depth: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        step="0.1"
                        min="0"
                      />
                    </div>
                    <div className="text-gray-500 text-sm">
                      Area: <span className="text-white font-medium">{(editForm.land_width * editForm.land_depth).toFixed(0)}m²</span>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSaveLand}
                        disabled={isSaving}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                        className="flex-1 bg-white/10 text-white py-2 rounded-lg hover:bg-white/20 transition font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>

              {/* Building Requirements */}
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Building className="w-5 h-5 text-blue-400" />
                    Requirements
                  </h2>
                  {project.status === 'draft' && !isEditingRequirements && (
                    <button
                      onClick={handleEditRequirements}
                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-white/10 rounded-lg transition"
                      title="Edit requirements"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {isEditingRequirements ? (
                  <div className="space-y-4">
                    {/* Number inputs */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-gray-500 text-xs block mb-1">Bedrooms</label>
                        <input
                          type="number"
                          value={editForm.bedrooms || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, bedrooms: parseInt(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-center focus:outline-none focus:border-blue-500"
                          min="1"
                          max="10"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs block mb-1">Bathrooms</label>
                        <input
                          type="number"
                          value={editForm.bathrooms || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, bathrooms: parseFloat(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-center focus:outline-none focus:border-blue-500"
                          min="1"
                          max="10"
                          step="0.5"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs block mb-1">Living Areas</label>
                        <input
                          type="number"
                          value={editForm.living_areas || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, living_areas: parseInt(e.target.value) || 1 }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-center focus:outline-none focus:border-blue-500"
                          min="1"
                          max="5"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs block mb-1">Garage</label>
                        <input
                          type="number"
                          value={editForm.garage_spaces || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, garage_spaces: parseInt(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-center focus:outline-none focus:border-blue-500"
                          min="0"
                          max="4"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs block mb-1">Storeys</label>
                        <input
                          type="number"
                          value={editForm.storeys || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, storeys: parseInt(e.target.value) || 1 }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-center focus:outline-none focus:border-blue-500"
                          min="1"
                          max="3"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs block mb-1">Style</label>
                        <select
                          value={editForm.style || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, style: e.target.value }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="">Select...</option>
                          <option value="Modern">Modern</option>
                          <option value="Contemporary">Contemporary</option>
                          <option value="Traditional">Traditional</option>
                          <option value="Hamptons">Hamptons</option>
                          <option value="Farmhouse">Farmhouse</option>
                          <option value="Minimalist">Minimalist</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* Toggle options */}
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                        <span className="text-gray-300 text-sm">Open Plan Living</span>
                        <input
                          type="checkbox"
                          checked={editForm.open_plan}
                          onChange={(e) => setEditForm(prev => ({ ...prev, open_plan: e.target.checked }))}
                          className="w-5 h-5 rounded bg-white/10 border-white/20 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                        />
                      </label>
                      <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                        <span className="text-gray-300 text-sm">Outdoor Entertainment (Alfresco)</span>
                        <input
                          type="checkbox"
                          checked={editForm.outdoor_entertainment}
                          onChange={(e) => setEditForm(prev => ({ ...prev, outdoor_entertainment: e.target.checked }))}
                          className="w-5 h-5 rounded bg-white/10 border-white/20 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                        />
                      </label>
                      <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                        <span className="text-gray-300 text-sm">Home Office</span>
                        <input
                          type="checkbox"
                          checked={editForm.home_office}
                          onChange={(e) => setEditForm(prev => ({ ...prev, home_office: e.target.checked }))}
                          className="w-5 h-5 rounded bg-white/10 border-white/20 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                        />
                      </label>
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSaveRequirements}
                        disabled={isSaving}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                        className="flex-1 bg-white/10 text-white py-2 rounded-lg hover:bg-white/20 transition font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
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
                      <Sofa className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-white">{project.living_areas || '—'}</p>
                      <p className="text-xs text-gray-500">Living</p>
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
                )}
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
                AI Floor Plans
              </h2>

              {project.status === 'generated' ? (
                <div>
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-green-400 mb-2">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">Generation Complete</span>
                    </div>
                    <p className="text-gray-400 text-sm">
                      {floorPlans.length} floor plan variant{floorPlans.length !== 1 ? 's' : ''} ready to view
                    </p>
                  </div>
                  
                  {/* Show variant previews if we have floor plans */}
                  {floorPlans.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {floorPlans.slice(0, 3).map((plan, index) => (
                        <div 
                          key={plan.id}
                          className="bg-white/5 rounded-lg p-3 flex items-center gap-3"
                        >
                          <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-lg">
                            {VARIANT_INFO[index]?.icon || '📐'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                              {plan.plan_type || VARIANT_INFO[index]?.name || `Variant ${index + 1}`}
                            </p>
                            <p className="text-gray-500 text-xs">
                              {plan.total_area ? `${plan.total_area.toFixed(0)}m²` : ''} 
                              {plan.is_compliant && ' • Compliant'}
                            </p>
                          </div>
                          {plan.is_compliant && (
                            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <button
                      onClick={() => router.push('/dashboard/plans')}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
                    >
                      <Eye className="w-5 h-5" />
                      View All Plans
                    </button>
                  </div>
                </div>
              ) : project.status === 'generating' || isGenerating ? (
                <div className="text-center py-6">
                  <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
                  <p className="text-white font-medium mb-2">Generating 3 Floor Plan Variants</p>
                  <p className="text-gray-400 text-sm mb-4">{generationProgress || 'Please wait...'}</p>
                  
                  {/* Variant progress indicators */}
                  <div className="space-y-2 mb-4">
                    {VARIANT_INFO.map((variant, index) => (
                      <div 
                        key={index}
                        className={`flex items-center gap-3 p-2 rounded-lg ${
                          index < generatedCount 
                            ? 'bg-green-500/10' 
                            : 'bg-white/5'
                        }`}
                      >
                        <span className="text-lg">{variant.icon}</span>
                        <span className="text-sm text-gray-300 flex-1">{variant.name}</span>
                        {index < generatedCount ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-gray-600" />
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <p className="text-blue-400 text-xs">
                      AI is generating 3 unique designs optimized for your requirements. 
                      This typically takes 30-60 seconds.
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-gray-400 text-sm mb-4">
                    Generate 3 professional floor plan variants based on your requirements:
                  </p>
                  
                  {/* Variant descriptions */}
                  <div className="space-y-2 mb-6">
                    {VARIANT_INFO.map((variant, index) => (
                      <div 
                        key={index}
                        className="flex items-start gap-3 p-3 bg-white/5 rounded-lg"
                      >
                        <span className="text-lg">{variant.icon}</span>
                        <div>
                          <p className="text-white text-sm font-medium">{variant.name}</p>
                          <p className="text-gray-500 text-xs">{variant.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <ul className="text-gray-400 text-sm space-y-2 mb-6">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      Council & NCC compliant designs
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      Optimized for your land dimensions
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      Professional circulation flow
                    </li>
                  </ul>
                  
                  <button
                    onClick={handleGenerateFloorPlans}
                    disabled={!project.bedrooms || isGenerating}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="w-5 h-5" />
                    Generate 3 Floor Plans
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
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal - Kept for backwards compatibility but won't be triggered */}
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FolderOpen className="w-7 h-7 text-blue-400" />
            Projects
          </h1>
          <p className="text-gray-400 mt-1">
            Manage your floor plan projects
          </p>
        </div>
        
        <button
          onClick={() => router.push('/dashboard/projects/new')}
          className="bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 whitespace-nowrap"
        >
          <Plus className="w-5 h-5" />
          New Project
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProjectStatus)}
            className="px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all" className="bg-slate-800">All Status</option>
            <option value="draft" className="bg-slate-800">Draft</option>
            <option value="generating" className="bg-slate-800">Generating</option>
            <option value="generated" className="bg-slate-800">Generated</option>
            <option value="error" className="bg-slate-800">Error</option>
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="newest" className="bg-slate-800">Newest First</option>
            <option value="oldest" className="bg-slate-800">Oldest First</option>
            <option value="name" className="bg-slate-800">Name A-Z</option>
            <option value="status" className="bg-slate-800">By Status</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-gray-400 text-sm">Total Projects</p>
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
          <p className="text-gray-400 text-sm">Showing</p>
          <p className="text-2xl font-bold text-blue-400">{filteredProjects.length}</p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-red-400 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Empty State */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
          <Home className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">
            {projects.length === 0 ? 'No Projects Yet' : 'No Matching Projects'}
          </h3>
          <p className="text-gray-400 mb-6">
            {projects.length === 0 
              ? 'Create your first project to get started with AI-generated floor plans.'
              : 'Try adjusting your search or filters.'
            }
          </p>
          {projects.length === 0 && (
            <button
              onClick={() => router.push('/dashboard/projects/new')}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProjects.map((proj) => (
            <div
              key={proj.id}
              className="bg-white/5 rounded-xl border border-white/10 p-4 hover:border-blue-500/50 transition cursor-pointer group"
              onClick={() => router.push(`/dashboard/projects/${proj.id}`)}
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/10">
                  <Home className="w-7 h-7 text-blue-400" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold truncate group-hover:text-blue-400 transition">{proj.name}</h3>
                  <p className="text-gray-400 text-sm flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {proj.suburb}, {proj.state} {proj.postcode}
                  </p>
                </div>
                
                <div className="hidden sm:flex items-center gap-6 text-gray-400 text-sm">
                  {proj.bedrooms && (
                    <span className="flex items-center gap-1.5">
                      <Bed className="w-4 h-4" /> {proj.bedrooms}
                    </span>
                  )}
                  {proj.bathrooms && (
                    <span className="flex items-center gap-1.5">
                      <Bath className="w-4 h-4" /> {proj.bathrooms}
                    </span>
                  )}
                </div>
                
                {getStatusBadge(proj.status)}
                
                <span className="text-gray-500 text-sm hidden md:block">
                  {formatDate(proj.created_at)}
                </span>
                
                <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-blue-400 transition" />
              </div>
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
