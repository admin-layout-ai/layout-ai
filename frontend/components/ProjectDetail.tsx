// frontend/components/ProjectDetail.tsx
// Component for viewing individual project details

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, FileText, AlertCircle, Download, Eye, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Project {
  id: number;
  name: string;
  status: string;
  bedrooms?: number;
  bathrooms?: number;
  living_areas?: number;
  garage_spaces?: number;
  storeys?: number;
  land_width?: number;
  land_depth?: number;
  style?: string;
  open_plan?: boolean;
  outdoor_entertainment?: boolean;
  home_office?: boolean;
  created_at: string;
  updated_at?: string;
}

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
}

export default function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const router = useRouter();
  const { getAccessToken } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    try {
      setError(null);
      setLoading(true);
      
      const token = await getAccessToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      
      if (!apiUrl) {
        setError('API configuration error');
        setLoading(false);
        return;
      }
      
      const response = await fetch(`${apiUrl}/api/v1/projects/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setProject(data);
      } else if (response.status === 404) {
        setError('Project not found');
      } else if (response.status === 401) {
        setError('Session expired. Please sign in again.');
        router.push('/auth/signin');
      } else if (response.status === 403) {
        setError('You do not have permission to view this project');
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.detail || 'Failed to load project');
      }
    } catch (err) {
      console.error('Error loading project:', err);
      setError('Failed to load project. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlans = () => {
    // Navigate to payment/pricing page
    router.push(`/dashboard/projects?id=${projectId}&action=generate`);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', label: 'Completed' };
      case 'in_progress':
        return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: 'In Progress' };
      case 'generating':
        return { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', label: 'Generating' };
      default:
        return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'Draft' };
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading project...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Projects
        </button>
        
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-8 max-w-md mx-auto text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button 
              onClick={loadProject} 
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            <button 
              onClick={onBack} 
              className="bg-white/10 text-white px-6 py-2 rounded-lg hover:bg-white/20 transition"
            >
              Back to Projects
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No project found
  if (!project) {
    return (
      <div className="p-6">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Projects
        </button>
        
        <div className="text-center py-12">
          <p className="text-xl text-gray-400 mb-4">Project not found</p>
          <button 
            onClick={onBack} 
            className="text-blue-400 hover:text-blue-300 transition"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(project.status);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Projects
        </button>
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{project.name}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border} border`}>
                {statusConfig.label}
              </span>
            </div>
            <p className="text-gray-400">
              {project.land_width && project.land_depth 
                ? `${project.land_width}m × ${project.land_depth}m • ` 
                : ''}
              Created {new Date(project.created_at).toLocaleDateString('en-AU')}
            </p>
          </div>
          
          {project.status === 'draft' && (
            <button
              onClick={handleGeneratePlans}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition font-medium"
            >
              <CreditCard className="w-5 h-5" />
              Generate Plans
            </button>
          )}
          
          {project.status === 'completed' && (
            <div className="flex gap-2">
              <button
                onClick={() => alert('Download feature coming soon!')}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 transition"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={() => alert('Preview feature coming soon!')}
                className="bg-white/10 text-white px-4 py-2 rounded-lg hover:bg-white/20 flex items-center gap-2 transition"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Project Details Card */}
        <div className="lg:col-span-2 bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
          <h2 className="text-lg font-semibold text-white mb-6">Project Details</h2>
          
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <span className="text-gray-400 text-sm block mb-1">Land Dimensions</span>
                <span className="text-white font-medium">
                  {project.land_width && project.land_depth 
                    ? `${project.land_width}m × ${project.land_depth}m`
                    : 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 text-sm block mb-1">Bedrooms</span>
                <span className="text-white font-medium">
                  {project.bedrooms || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 text-sm block mb-1">Bathrooms</span>
                <span className="text-white font-medium">
                  {project.bathrooms || 'Not specified'}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-gray-400 text-sm block mb-1">Living Areas</span>
                <span className="text-white font-medium">
                  {project.living_areas || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 text-sm block mb-1">Design Style</span>
                <span className="text-white font-medium capitalize">
                  {project.style || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 text-sm block mb-1">Storeys</span>
                <span className="text-white font-medium">
                  {project.storeys || 'Not specified'}
                </span>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <span className="text-gray-400 text-sm block mb-3">Features</span>
            <div className="flex flex-wrap gap-2">
              {project.open_plan && (
                <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                  Open Plan Living
                </span>
              )}
              {project.home_office && (
                <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">
                  Home Office
                </span>
              )}
              {project.outdoor_entertainment && (
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                  Outdoor Entertainment
                </span>
              )}
              {!project.open_plan && !project.home_office && !project.outdoor_entertainment && (
                <span className="text-gray-500 text-sm">No additional features specified</span>
              )}
            </div>
          </div>
        </div>

        {/* Status Card */}
        <div className="space-y-6">
          {/* Next Steps Card */}
          {project.status === 'draft' && (
            <div className="bg-blue-500/10 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <div className="flex items-start gap-3">
                <FileText className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-white mb-2">Ready to generate?</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Click &quot;Generate Plans&quot; to choose a pricing plan and create your AI-powered floor plan options.
                  </p>
                  <button
                    onClick={handleGeneratePlans}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium transition w-full"
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </div>
          )}

          {project.status === 'generating' && (
            <div className="bg-purple-500/10 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
              <div className="flex items-start gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400 flex-shrink-0"></div>
                <div>
                  <h3 className="font-semibold text-white mb-2">Generating Plans</h3>
                  <p className="text-gray-400 text-sm">
                    Our AI is creating your floor plan options. This usually takes 2-3 minutes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {project.status === 'completed' && (
            <div className="bg-green-500/10 backdrop-blur-sm rounded-xl p-6 border border-green-500/20">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-2">Plans Ready!</h3>
                  <p className="text-gray-400 text-sm">
                    Your floor plans have been generated. Download them or view the preview.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Timeline Card */}
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <h3 className="text-sm font-medium text-gray-400 mb-4">Project Timeline</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-white text-sm">Project Created</p>
                  <p className="text-gray-500 text-xs">
                    {new Date(project.created_at).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
              
              {project.updated_at && project.updated_at !== project.created_at && (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-white text-sm">Last Updated</p>
                    <p className="text-gray-500 text-xs">
                      {new Date(project.updated_at).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
