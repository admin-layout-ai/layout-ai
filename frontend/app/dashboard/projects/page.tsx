'use client';

// frontend/app/dashboard/projects/page.tsx
// Smart page that handles both project list AND project detail based on URL

import { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api, { Project } from '@/lib/api';
import FloorPlanCanvas from '@/components/FloorPlanCanvas';

type ProjectStatus = 'all' | 'draft' | 'generating' | 'generated' | 'error';

export default function ProjectsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Determine if we're viewing a specific project, plans, or the list
  // /dashboard/projects -> list view
  // /dashboard/projects/1 -> detail view for project 1
  // /dashboard/projects/1/plans -> plans view for project 1
  const pathSegments = pathname?.split('/').filter(Boolean) || [];
  const lastSegment = pathSegments[pathSegments.length - 1] || '';
  const isPlansView = lastSegment === 'plans';
  
  // Get project ID - either second to last (if /plans) or last segment
  const projectIdSegment = isPlansView 
    ? pathSegments[pathSegments.length - 2] 
    : lastSegment;
  const projectIdFromUrl = projectIdSegment && !isNaN(parseInt(projectIdSegment)) ? projectIdSegment : null;
  const isDetailView = projectIdFromUrl !== null && !isPlansView;
  const isProjectView = projectIdFromUrl !== null; // Either detail or plans view
  
  // List view state
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus>('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Detail view state
  const [project, setProject] = useState<Project | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [floorPlans, setFloorPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      if (isProjectView && projectIdFromUrl) {
        fetchProject(parseInt(projectIdFromUrl));
      } else {
        fetchProjects();
      }
    }
  }, [authLoading, isAuthenticated, isProjectView, projectIdFromUrl]);

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
      
      // If project is generated, fetch floor plans
      if (data.status === 'generated') {
        try {
          const plans = await api.getFloorPlans(id);
          setFloorPlans(plans);
        } catch (planErr) {
          console.error('Error fetching floor plans:', planErr);
          // Don't set error - floor plans are optional
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
        router.push('/dashboard');
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
    try {
      await api.generateFloorPlans(project.id);
      await fetchProject(project.id);
    } catch (err) {
      console.error('Error generating floor plans:', err);
      setError(err instanceof Error ? err.message : 'Failed to start generation');
    } finally {
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
      case 'draft':
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

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.suburb?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.council?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  // ==================== PLANS VIEW ====================
  if (isPlansView) {
    if (error || !project) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
          <button 
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Dashboard
          </button>
          
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Project Not Found</h2>
            <p className="text-gray-400 mb-4">{error || 'The project you\'re looking for doesn\'t exist.'}</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Go to Dashboard
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
            onClick={() => router.push(`/dashboard/projects/${project.id}`)}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Project
          </button>
          
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">{project.name} - Floor Plans</h1>
                {getStatusBadge(project.status, 'md')}
              </div>
              <p className="text-gray-400 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {project.suburb}, {project.state} {project.postcode}
              </p>
            </div>
          </div>
        </div>

        {/* Floor Plans Grid */}
        {floorPlans.length === 0 ? (
          <div className="bg-white/5 rounded-xl p-12 text-center border border-white/10">
            <Layers className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Floor Plans Yet</h3>
            <p className="text-gray-400 mb-6">
              Floor plans are being generated or haven't been created yet.
            </p>
            <button
              onClick={() => router.push(`/dashboard/projects/${project.id}`)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Back to Project
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {floorPlans.map((plan, index) => {
              const layoutData = typeof plan.layout_data === 'string' 
                ? JSON.parse(plan.layout_data) 
                : plan.layout_data;
              
              return (
                <div 
                  key={plan.id || index}
                  className="bg-white/5 rounded-xl border border-white/10 overflow-hidden hover:border-blue-500/50 transition group"
                >
                  {/* Plan Preview - Using FloorPlanCanvas */}
                  <div className="aspect-[4/3] bg-slate-800 overflow-hidden cursor-pointer"
                    onClick={() => setSelectedPlan({ ...plan, layoutData })}
                  >
                    {layoutData?.rooms && layoutData.rooms.length > 0 ? (
                      <FloorPlanCanvas 
                        data={{ rooms: layoutData.rooms, total_area: plan.total_area }}
                        compact={true}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <Layers className="w-12 h-12 text-blue-400 mx-auto mb-2" />
                          <p className="text-gray-400 text-sm">{layoutData?.variant_name || `Variant ${plan.variant_number}`}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Plan Details */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-semibold">
                        {layoutData?.variant_name || `Floor Plan ${plan.variant_number}`}
                      </h3>
                      {plan.is_compliant && (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                          NCC Compliant
                        </span>
                      )}
                    </div>
                    
                    {layoutData?.description && (
                      <p className="text-gray-400 text-sm mb-3">{layoutData.description}</p>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                      <div className="bg-white/5 rounded p-2 text-center">
                        <p className="text-white font-medium">{plan.total_area?.toFixed(0) || '-'}m²</p>
                        <p className="text-gray-500 text-xs">Total Area</p>
                      </div>
                      <div className="bg-white/5 rounded p-2 text-center">
                        <p className="text-white font-medium">{plan.living_area?.toFixed(0) || '-'}m²</p>
                        <p className="text-gray-500 text-xs">Living Area</p>
                      </div>
                    </div>

                    {/* Room Summary */}
                    {layoutData?.rooms && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {(() => {
                          const roomCounts: Record<string, number> = {};
                          layoutData.rooms.forEach((room: any) => {
                            const type = room.type || 'other';
                            roomCounts[type] = (roomCounts[type] || 0) + 1;
                          });
                          return Object.entries(roomCounts).slice(0, 4).map(([type, count]) => (
                            <span key={type} className="px-2 py-0.5 bg-white/5 text-gray-400 rounded text-xs capitalize">
                              {count} {type.replace('_', ' ')}
                            </span>
                          ));
                        })()}
                      </div>
                    )}
                    
                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedPlan({ ...plan, layoutData })}
                        className="flex-1 bg-white/10 text-white py-2 rounded-lg hover:bg-white/20 transition text-sm flex items-center justify-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                      <button
                        onClick={() => {
                          // TODO: Implement PDF download
                          alert('PDF download coming soon!');
                        }}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm flex items-center justify-center gap-1"
                      >
                        <Download className="w-4 h-4" />
                        PDF
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Floor Plan Detail Modal */}
        {selectedPlan && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden border border-white/10">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {selectedPlan.layoutData?.variant_name || `Floor Plan ${selectedPlan.variant_number}`}
                  </h2>
                  <p className="text-gray-400 text-sm">
                    {selectedPlan.layoutData?.description || 'Floor plan layout'}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPlan(null)}
                  className="p-2 hover:bg-white/10 rounded-lg transition"
                >
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>
              
              {/* Modal Body */}
              <div className="p-4 overflow-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
                {/* Floor Plan Canvas */}
                {selectedPlan.layoutData?.rooms && selectedPlan.layoutData.rooms.length > 0 ? (
                  <FloorPlanCanvas 
                    data={{ 
                      rooms: selectedPlan.layoutData.rooms, 
                      total_area: selectedPlan.total_area,
                      variant_name: selectedPlan.layoutData.variant_name
                    }}
                    compact={false}
                  />
                ) : (
                  <div className="bg-slate-700 rounded-lg p-12 text-center">
                    <Layers className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                    <p className="text-gray-400">No room layout data available</p>
                  </div>
                )}
                
                {/* Plan Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  <div className="bg-white/5 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-white">{selectedPlan.total_area?.toFixed(0) || '-'}m²</p>
                    <p className="text-gray-500 text-sm">Total Area</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-white">{selectedPlan.living_area?.toFixed(0) || '-'}m²</p>
                    <p className="text-gray-500 text-sm">Living Area</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-white">{selectedPlan.layoutData?.rooms?.length || 0}</p>
                    <p className="text-gray-500 text-sm">Rooms</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4 text-center">
                    {selectedPlan.is_compliant ? (
                      <div className="flex items-center justify-center gap-2">
                        <Check className="w-6 h-6 text-green-400" />
                        <span className="text-green-400 font-medium">Compliant</span>
                      </div>
                    ) : (
                      <span className="text-yellow-400">Pending</span>
                    )}
                    <p className="text-gray-500 text-sm">NCC Status</p>
                  </div>
                </div>

                {/* Room List */}
                {selectedPlan.layoutData?.rooms && (
                  <div className="mt-6">
                    <h3 className="text-white font-semibold mb-3">Room Details</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {selectedPlan.layoutData.rooms.map((room: any, idx: number) => (
                        <div key={idx} className="bg-white/5 rounded-lg p-3">
                          <p className="text-white font-medium text-sm">{room.name}</p>
                          <p className="text-gray-400 text-xs">
                            {room.width}m × {room.depth}m = {room.area?.toFixed(1) || (room.width * room.depth).toFixed(1)}m²
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
                <button
                  onClick={() => setSelectedPlan(null)}
                  className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
                >
                  Close
                </button>
                <button
                  onClick={() => alert('PDF download coming soon!')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== DETAIL VIEW ====================
  if (isDetailView) {
    if (error || !project) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
          <button 
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Dashboard
          </button>
          
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Project Not Found</h2>
            <p className="text-gray-400 mb-4">{error || 'The project you\'re looking for doesn\'t exist.'}</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Go to Dashboard
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
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Dashboard
          </button>
          
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">{project.name}</h1>
                {getStatusBadge(project.status, 'md')}
              </div>
              <p className="text-gray-400 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Created {formatDate(project.created_at, true)}
              </p>
            </div>
            
            <button
              onClick={() => setShowDeleteConfirm(project.id)}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
              title="Delete project"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

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

            {/* Land Details */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Ruler className="w-5 h-5 text-blue-400" />
                Land Details
              </h2>
              
              <div className="grid sm:grid-cols-3 gap-4">
                {project.land_width && (
                  <div className="bg-white/5 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-white">{project.land_width}m</p>
                    <p className="text-gray-500 text-sm">Width</p>
                  </div>
                )}
                {project.land_depth && (
                  <div className="bg-white/5 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-white">{project.land_depth}m</p>
                    <p className="text-gray-500 text-sm">Depth</p>
                  </div>
                )}
                {project.land_area && (
                  <div className="bg-white/5 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-white">{project.land_area.toFixed(0)}m²</p>
                    <p className="text-gray-500 text-sm">Total Area</p>
                  </div>
                )}
              </div>

              {project.contour_plan_url && (
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
                  <FileText className="w-5 h-5 text-green-400" />
                  <span className="text-green-400 text-sm">Contour plan uploaded</span>
                </div>
              )}
            </div>

            {/* Building Requirements */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-400" />
                Building Requirements
              </h2>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {project.bedrooms && (
                  <div className="bg-white/5 rounded-lg p-4 text-center">
                    <Bed className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                    <p className="text-xl font-bold text-white">{project.bedrooms}</p>
                    <p className="text-gray-500 text-xs">Bedrooms</p>
                  </div>
                )}
                {project.bathrooms && (
                  <div className="bg-white/5 rounded-lg p-4 text-center">
                    <Bath className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                    <p className="text-xl font-bold text-white">{project.bathrooms}</p>
                    <p className="text-gray-500 text-xs">Bathrooms</p>
                  </div>
                )}
                {project.garage_spaces && (
                  <div className="bg-white/5 rounded-lg p-4 text-center">
                    <Car className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                    <p className="text-xl font-bold text-white">{project.garage_spaces}</p>
                    <p className="text-gray-500 text-xs">Garage</p>
                  </div>
                )}
                {project.storeys && (
                  <div className="bg-white/5 rounded-lg p-4 text-center">
                    <Layers className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                    <p className="text-xl font-bold text-white">{project.storeys}</p>
                    <p className="text-gray-500 text-xs">Storeys</p>
                  </div>
                )}
              </div>

              {/* Style Preferences */}
              <div className="mt-4 flex flex-wrap gap-2">
                {project.style && (
                  <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                    {project.style}
                  </span>
                )}
                {project.open_plan && (
                  <span className="px-3 py-1 bg-white/10 text-gray-300 rounded-full text-sm">
                    Open Plan
                  </span>
                )}
                {project.outdoor_entertainment && (
                  <span className="px-3 py-1 bg-white/10 text-gray-300 rounded-full text-sm">
                    Outdoor Entertainment
                  </span>
                )}
                {project.home_office && (
                  <span className="px-3 py-1 bg-white/10 text-gray-300 rounded-full text-sm">
                    Home Office
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar - Generate Floor Plans */}
          <div className="space-y-6">
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-400" />
                Generate AI Floor Plans
              </h2>

              {project.status === 'generated' ? (
                <div>
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-green-400 mb-2">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">Generation Complete</span>
                    </div>
                    <p className="text-gray-400 text-sm">3 floor plan variants are ready to view</p>
                  </div>
                  <button
                    onClick={() => router.push(`/dashboard/projects/${project.id}/plans`)}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium"
                  >
                    View Floor Plans
                  </button>
                </div>
              ) : project.status === 'generating' ? (
                <div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-blue-400 mb-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-medium">Generating...</span>
                    </div>
                    <p className="text-gray-400 text-sm">Your floor plans are being created. This typically takes 2-5 minutes.</p>
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
                  {/* Feature Cards */}
                  <div className="grid grid-cols-1 gap-3 mb-6">
                    {/* AI-Powered Design */}
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mb-3">
                        <Cpu className="w-5 h-5 text-blue-400" />
                      </div>
                      <h4 className="text-white font-medium mb-1">AI-Powered Design</h4>
                      <p className="text-gray-400 text-xs">Advanced algorithms optimize your floor plan layout</p>
                    </div>
                    
                    {/* 3 Unique Variants */}
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mb-3">
                        <Layers className="w-5 h-5 text-blue-400" />
                      </div>
                      <h4 className="text-white font-medium mb-1">3 Unique Variants</h4>
                      <p className="text-gray-400 text-xs">Choose from three different layout options</p>
                    </div>
                    
                    {/* NCC Compliant */}
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mb-3">
                        <Shield className="w-5 h-5 text-blue-400" />
                      </div>
                      <h4 className="text-white font-medium mb-1">NCC Compliant</h4>
                      <p className="text-gray-400 text-xs">Meets Australian building code requirements</p>
                    </div>
                  </div>

                  {/* What's Included */}
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10 mb-6">
                    <h4 className="text-white font-medium mb-3">What's Included</h4>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400" />
                        <span className="text-gray-300">Detailed room dimensions</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400" />
                        <span className="text-gray-300">Optimized traffic flow</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400" />
                        <span className="text-gray-300">PDF export ready</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400" />
                        <span className="text-gray-300">Council compliance notes</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateFloorPlans}
                    disabled={isGenerating}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Starting Generation...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-5 h-5" />
                        Generate Floor Plans
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Project Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Project ID</span>
                  <span className="text-white">#{project.id}</span>
                </div>
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

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-2">Delete Project?</h3>
              <p className="text-gray-400 mb-6">
                Are you sure you want to delete "{project.name}"? This action cannot be undone.
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
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
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
        <div className="flex items-center justify-between">
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

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-400 flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Search and Filter */}
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

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProjectStatus)}
            className="pl-10 pr-8 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-blue-500 focus:outline-none appearance-none cursor-pointer"
          >
            <option value="all" className="bg-slate-800">All Status</option>
            <option value="draft" className="bg-slate-800">Draft</option>
            <option value="generating" className="bg-slate-800">Generating</option>
            <option value="generated" className="bg-slate-800">Generated</option>
            <option value="error" className="bg-slate-800">Error</option>
          </select>
        </div>
      </div>

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white/5 rounded-xl p-12 text-center border border-white/10">
          <Home className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {projects.length === 0 ? 'No projects yet' : 'No matching projects'}
          </h3>
          <p className="text-gray-400 mb-6">
            {projects.length === 0 
              ? 'Create your first project to get started with AI floor plan generation.'
              : 'Try adjusting your search or filter criteria.'}
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
      ) : (
        <div className="grid gap-4">
          {filteredProjects.map((proj) => (
            <div
              key={proj.id}
              className="bg-white/5 rounded-xl p-5 border border-white/10 hover:border-white/20 transition cursor-pointer group"
              onClick={() => router.push(`/dashboard/projects/${proj.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition">
                      {proj.name}
                    </h3>
                    {getStatusBadge(proj.status)}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                    {proj.suburb && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {proj.suburb}, {proj.state} {proj.postcode}
                      </span>
                    )}
                    {proj.council && (
                      <span className="text-gray-500">• {proj.council}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(proj.created_at)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                    {proj.land_area && (
                      <span className="bg-white/5 px-2 py-1 rounded">
                        {proj.land_area.toFixed(0)} m² land
                      </span>
                    )}
                    {proj.bedrooms && (
                      <span className="bg-white/5 px-2 py-1 rounded">
                        {proj.bedrooms} bed
                      </span>
                    )}
                    {proj.bathrooms && (
                      <span className="bg-white/5 px-2 py-1 rounded">
                        {proj.bathrooms} bath
                      </span>
                    )}
                    {proj.storeys && (
                      <span className="bg-white/5 px-2 py-1 rounded">
                        {proj.storeys} storey
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal for List View */}
      {showDeleteConfirm && !isDetailView && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Project?</h3>
            <p className="text-gray-400 mb-6">
              Are you sure you want to delete this project? This action cannot be undone.
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
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
