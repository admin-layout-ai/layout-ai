'use client';

// frontend/app/dashboard/facades/page.tsx
// Handles GALLERY VIEW for facade designs
// - Gallery: Shows all facades in a grid
// - Detail: Click a facade to view details

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Building2, 
  Search, 
  Loader2,
  AlertCircle,
  MapPin,
  Bed,
  Bath,
  Home,
  ImageIcon,
  Palette,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api, { Project } from '@/lib/api';

// Facade style information
const FACADE_STYLES: Record<string, { name: string; icon: string; color: string; description: string }> = {
  'modern': { name: 'Modern', icon: '🏢', color: 'bg-blue-500/20 text-blue-400', description: 'Clean lines and minimalist design' },
  'contemporary': { name: 'Contemporary', icon: '✨', color: 'bg-purple-500/20 text-purple-400', description: 'Current trends and styles' },
  'traditional': { name: 'Traditional', icon: '🏛️', color: 'bg-amber-500/20 text-amber-400', description: 'Classic architectural elements' },
  'hamptons': { name: 'Hamptons', icon: '🏖️', color: 'bg-cyan-500/20 text-cyan-400', description: 'Coastal elegance' },
  'farmhouse': { name: 'Farmhouse', icon: '🏡', color: 'bg-green-500/20 text-green-400', description: 'Rustic charm' },
};

interface Facade {
  id: number;
  project_id: number;
  style: string;
  preview_image_url?: string;
  created_at: string;
  project?: Project;
}

export default function FacadesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Get project filter from URL query param
  const projectParam = searchParams.get('project');
  const initialProjectFilter = projectParam ? parseInt(projectParam) : 'all';
  
  // Gallery view state
  const [facades, setFacades] = useState<Facade[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<number | 'all'>(initialProjectFilter);
  const [selectedStyleFilter, setSelectedStyleFilter] = useState<string | 'all'>('all');

  // Sync project filter with URL param when it changes
  useEffect(() => {
    const projectParam = searchParams.get('project');
    if (projectParam) {
      const projectId = parseInt(projectParam);
      if (!isNaN(projectId)) {
        setSelectedProjectFilter(projectId);
      }
    }
  }, [searchParams]);

  // Load data on mount
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadData();
    }
  }, [authLoading, isAuthenticated]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch all projects
      const projectsResponse = await api.getProjects();
      const allProjects = projectsResponse.projects || [];
      setProjects(allProjects);
      
      // For now, facades is a placeholder - no actual API yet
      // This will be populated when facade generation is implemented
      setFacades([]);
      
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load facades');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter facades
  const filteredFacades = facades.filter(facade => {
    // Project filter
    if (selectedProjectFilter !== 'all' && facade.project_id !== selectedProjectFilter) {
      return false;
    }
    
    // Style filter
    if (selectedStyleFilter !== 'all' && facade.style !== selectedStyleFilter) {
      return false;
    }
    
    // Search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const projectName = facade.project?.name?.toLowerCase() || '';
      const suburb = facade.project?.suburb?.toLowerCase() || '';
      const style = facade.style?.toLowerCase() || '';
      
      if (!projectName.includes(query) && !suburb.includes(query) && !style.includes(query)) {
        return false;
      }
    }
    
    return true;
  });

  // Loading state
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
        
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading facades...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Building2 className="w-7 h-7 text-blue-400" />
          Facade Designs
        </h1>
        <p className="text-gray-400 mt-1">
          View and download AI-generated facade designs for your projects
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
              placeholder="Search by project name, location, style..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          
          {/* Project Filter */}
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all" className="bg-slate-800">All Projects</option>
            {projects.filter(p => p.status === 'generated').map(project => (
              <option key={project.id} value={project.id} className="bg-slate-800">{project.name}</option>
            ))}
          </select>
          
          {/* Style Filter */}
          <select
            value={selectedStyleFilter}
            onChange={(e) => setSelectedStyleFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all" className="bg-slate-800">All Styles</option>
            {Object.entries(FACADE_STYLES).map(([key, style]) => (
              <option key={key} value={key} className="bg-slate-800">{style.icon} {style.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-gray-400 text-sm">Total Facades</p>
          <p className="text-2xl font-bold text-white">{facades.length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-gray-400 text-sm">Projects</p>
          <p className="text-2xl font-bold text-white">{projects.filter(p => p.status === 'generated').length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-gray-400 text-sm">Styles</p>
          <p className="text-2xl font-bold text-purple-400">{Object.keys(FACADE_STYLES).length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-gray-400 text-sm">Showing</p>
          <p className="text-2xl font-bold text-blue-400">{filteredFacades.length}</p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-white font-medium mb-2">Error Loading Facades</p>
          <p className="text-gray-400 text-sm">{error}</p>
        </div>
      )}

      {/* Empty State / Coming Soon */}
      {!isLoading && !error && filteredFacades.length === 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 text-blue-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Facade Generation Coming Soon</h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            AI-powered facade design generation is currently in development. 
            Soon you'll be able to generate beautiful facade designs for your floor plans automatically.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {Object.entries(FACADE_STYLES).map(([key, style]) => (
              <div 
                key={key}
                className={`px-3 py-1.5 rounded-full text-sm ${style.color}`}
              >
                {style.icon} {style.name}
              </div>
            ))}
          </div>
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition"
          >
            View Projects
          </button>
        </div>
      )}

      {/* Facades Grid */}
      {!isLoading && !error && filteredFacades.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {filteredFacades.map((facade) => {
            const style = FACADE_STYLES[facade.style] || FACADE_STYLES['modern'];
            
            return (
              <div
                key={facade.id}
                className="bg-white/5 rounded-lg border border-white/10 overflow-hidden hover:border-blue-500/50 transition cursor-pointer"
              >
                {/* Image */}
                <div className="aspect-[4/3] bg-slate-800 relative overflow-hidden">
                  {facade.preview_image_url ? (
                    <img
                      src={facade.preview_image_url}
                      alt={`${style.name} Facade`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-gray-600" />
                    </div>
                  )}
                  
                  {/* Style Badge */}
                  <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${style.color}`}>
                    {style.icon} {style.name}
                  </div>
                </div>
                
                {/* Info */}
                <div className="p-2">
                  <h3 className="font-medium text-white truncate text-xs mb-0.5">
                    {facade.project?.name || `Project ${facade.project_id}`}
                  </h3>
                  <p className="text-gray-400 text-[10px] flex items-center gap-1 mb-1.5">
                    <MapPin className="w-2.5 h-2.5" />
                    {facade.project?.suburb}, {facade.project?.state}
                  </p>
                  
                  {/* Stats Row */}
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    {facade.project?.bedrooms && (
                      <span className="flex items-center gap-0.5">
                        <Bed className="w-2.5 h-2.5" />
                        {facade.project.bedrooms}
                      </span>
                    )}
                    {facade.project?.bathrooms && (
                      <span className="flex items-center gap-0.5">
                        <Bath className="w-2.5 h-2.5" />
                        {facade.project.bathrooms}
                      </span>
                    )}
                    {facade.project?.storeys && (
                      <span className="flex items-center gap-0.5">
                        <Home className="w-2.5 h-2.5" />
                        {facade.project.storeys} storey
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
