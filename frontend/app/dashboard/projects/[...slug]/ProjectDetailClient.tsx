'use client';

// frontend/app/dashboard/projects/[...slug]/ProjectDetailClient.tsx
// Client component with all interactive logic

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { 
  ArrowLeft, 
  MapPin, 
  Calendar,
  Ruler,
  Bed,
  Bath,
  Car,
  Layers,
  Building,
  Check,
  Clock,
  Loader2,
  AlertCircle,
  Wand2,
  FileText,
  Trash2,
  Shield
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api, { Project } from '@/lib/api';

export default function ProjectDetailClient() {
  const router = useRouter();
  const pathname = usePathname();
  
  // Extract project ID from pathname: /dashboard/projects/123 -> 123
  const projectId = pathname?.split('/').pop() || '';
  
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated && projectId && projectId !== 'placeholder') {
      fetchProject();
    } else if (projectId === 'placeholder') {
      router.push('/dashboard/projects');
    }
  }, [authLoading, isAuthenticated, projectId]);

  const fetchProject = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const id = parseInt(projectId);
      if (isNaN(id)) {
        throw new Error('Invalid project ID');
      }
      const data = await api.getProject(id);
      setProject(data);
    } catch (err) {
      console.error('Error fetching project:', err);
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateFloorPlans = async () => {
    if (!project) return;
    
    setIsGenerating(true);
    try {
      await api.generateFloorPlans(project.id);
      await fetchProject();
    } catch (err) {
      console.error('Error generating floor plans:', err);
      setError(err instanceof Error ? err.message : 'Failed to start generation');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    
    setIsDeleting(true);
    try {
      await api.deleteProject(project.id);
      router.push('/dashboard');
    } catch (err) {
      console.error('Error deleting project:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">
            <Check className="w-4 h-4" /> Completed
          </span>
        );
      case 'generating':
        return (
          <span className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
            <Loader2 className="w-4 h-4 animate-spin" /> Generating
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-full text-sm font-medium">
            <AlertCircle className="w-4 h-4" /> Error
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-medium">
            <Clock className="w-4 h-4" /> Draft
          </span>
        );
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

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
              {getStatusBadge(project.status)}
            </div>
            <p className="text-gray-400 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Created {formatDate(project.created_at)}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
              title="Delete project"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-400 flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
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
          {/* Generate Card */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-blue-400" />
              AI Floor Plans
            </h2>

            {project.status === 'completed' ? (
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
                {/* Features */}
                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-gray-300 text-sm">
                    <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <Layers className="w-4 h-4 text-blue-400" />
                    </div>
                    <span>3 unique floor plan variants</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300 text-sm">
                    <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <Shield className="w-4 h-4 text-blue-400" />
                    </div>
                    <span>NCC compliant designs</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300 text-sm">
                    <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <Clock className="w-4 h-4 text-blue-400" />
                    </div>
                    <span>Ready in 2-5 minutes</span>
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

          {/* Project Info */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Project Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Project ID</span>
                <span className="text-white">#{project.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-white">{formatDate(project.created_at)}</span>
              </div>
              {project.updated_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Updated</span>
                  <span className="text-white">{formatDate(project.updated_at)}</span>
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
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
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
