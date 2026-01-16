'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Layers, 
  Search, 
  Filter,
  Eye,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  MapPin,
  Calendar,
  Bed,
  Bath,
  Car,
  Home,
  ChevronRight,
  X,
  ImageIcon
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api, { Project, FloorPlan } from '@/lib/api';

// Variant information
const VARIANT_INFO: Record<number, { name: string; icon: string; color: string }> = {
  1: { name: 'Optimal Layout', icon: '⚡', color: 'bg-yellow-500/20 text-yellow-400' },
  2: { name: 'Spacious Living', icon: '🏠', color: 'bg-blue-500/20 text-blue-400' },
  3: { name: 'Master Retreat', icon: '👑', color: 'bg-purple-500/20 text-purple-400' },
};

interface FloorPlanWithProject extends FloorPlan {
  project?: Project;
}

export default function PlansGalleryPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [plans, setPlans] = useState<FloorPlanWithProject[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<number | 'all'>('all');
  const [selectedVariant, setSelectedVariant] = useState<number | 'all'>('all');
  
  // Lightbox state
  const [lightboxPlan, setLightboxPlan] = useState<FloorPlanWithProject | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadAllPlans();
    }
  }, [authLoading, isAuthenticated]);

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
          // Add project reference to each plan
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

  // Filter plans
  const filteredPlans = plans.filter(plan => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesProject = plan.project?.name?.toLowerCase().includes(query);
      const matchesType = plan.plan_type?.toLowerCase().includes(query);
      const matchesLocation = plan.project?.suburb?.toLowerCase().includes(query);
      if (!matchesProject && !matchesType && !matchesLocation) return false;
    }
    
    // Project filter
    if (selectedProject !== 'all' && plan.project_id !== selectedProject) {
      return false;
    }
    
    // Variant filter
    if (selectedVariant !== 'all' && plan.variant_number !== selectedVariant) {
      return false;
    }
    
    return true;
  });

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleViewPlan = (plan: FloorPlanWithProject) => {
    router.push(`/dashboard/projects/${plan.project_id}/plans`);
  };

  const handleDownload = async (plan: FloorPlanWithProject, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!plan.preview_image_url) return;
    
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
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Projects</option>
            {projects.filter(p => p.status === 'generated').map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          
          {/* Variant Filter */}
          <select
            value={selectedVariant}
            onChange={(e) => setSelectedVariant(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
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
