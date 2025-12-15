'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, FileText } from 'lucide-react';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id;

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}?user_id=1`
      );
      if (response.ok) {
        const data = await response.json();
        setProject(data);
      }
    } catch (error) {
      console.error('Error loading project:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-600 mb-4">Project not found</p>
          <button 
            onClick={() => router.push('/dashboard/projects')} 
            className="text-blue-600 hover:underline"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <button 
            onClick={() => router.push('/dashboard/projects')} 
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Projects
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
              <p className="text-gray-600 mt-1">
                {project.land_width}m × {project.land_depth}m
              </p>
            </div>
            
            <button
              onClick={() => alert('Payment feature - coming soon!')}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <CreditCard className="w-5 h-5" />
              Generate Plans
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl p-8 shadow-md">
          <h2 className="text-xl font-bold mb-6">Project Details</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <span className="text-gray-600 text-sm">Status</span>
                <div className="mt-1">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    project.status === 'completed' ? 'bg-green-100 text-green-800' :
                    project.status === 'generating' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {project.status}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Created</span>
                <div className="mt-1 font-semibold">
                  {new Date(project.created_at).toLocaleDateString()}
                </div>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Land Dimensions</span>
                <div className="mt-1 font-semibold">
                  {project.land_width}m × {project.land_depth}m
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-gray-600 text-sm">Bedrooms</span>
                <div className="mt-1 font-semibold">
                  {project.bedrooms || 'Not set'}
                </div>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Bathrooms</span>
                <div className="mt-1 font-semibold">
                  {project.bathrooms || 'Not set'}
                </div>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Style</span>
                <div className="mt-1 font-semibold capitalize">
                  {project.style || 'Not set'}
                </div>
              </div>
            </div>
          </div>

          {project.status === 'draft' && (
            <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <FileText className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">Ready to generate floor plans?</h3>
                  <p className="text-blue-700 text-sm mb-4">
                    Click "Generate Plans" to choose a pricing plan and create your floor plan options.
                  </p>
                  <button
                    onClick={() => alert('Payment modal would open here')}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}