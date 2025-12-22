// frontend/app/dashboard/projects/page.tsx
// Projects page with dark theme

'use client';

import { useState, useEffect } from 'react';
import { Plus, FileText, Eye, Trash2, Home, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface Project {
  id: number;
  name: string;
  status: string;
  bedrooms: number;
  bathrooms: number;
  created_at: string;
  land_width: number;
  land_depth: number;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const { user, getAccessToken } = useAuth();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      if (!process.env.NEXT_PUBLIC_API_URL) {
        setLoading(false);
        return;
      }
      
      const token = await getAccessToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const createProject = () => {
    router.push('/dashboard/projects/new');
  };

  const deleteProject = async (projectId: number) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      const token = await getAccessToken();
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}`,
        { 
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      setProjects(projects.filter(p => p.id !== projectId));
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-blue-500';
      default:
        return 'bg-yellow-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      default:
        return 'Draft';
    }
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-gray-400 text-sm mt-1">{projects.length} total projects</p>
        </div>
        <button 
          onClick={createProject} 
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 text-sm"
        />
      </div>

      {filteredProjects.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-12 border border-white/10 text-center">
          <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-10 h-10 text-gray-500" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {searchQuery ? 'No projects found' : 'No projects yet'}
          </h3>
          <p className="text-gray-400 mb-6">
            {searchQuery ? 'Try a different search term' : 'Create your first floor plan project'}
          </p>
          {!searchQuery && (
            <button 
              onClick={createProject} 
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 transition"
            >
              <Plus className="w-5 h-5" />
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <div 
              key={project.id} 
              className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden hover:border-blue-500/50 transition"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                      <Home className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{project.name}</h3>
                      <p className="text-gray-500 text-xs">
                        {new Date(project.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className={`${getStatusColor(project.status)} text-white text-xs px-2 py-1 rounded-full`}>
                    {getStatusLabel(project.status)}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-gray-400 mb-4">
                  <div className="flex items-center gap-2">
                    <span>📐</span>
                    <span>{project.land_width}m × {project.land_depth}m</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🛏️</span>
                    <span>{project.bedrooms || 0} Bedrooms</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🚿</span>
                    <span>{project.bathrooms || 0} Bathrooms</span>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 px-5 py-3 flex gap-2 border-t border-white/10">
                <button 
                  onClick={() => router.push(`/dashboard/projects/${project.id}`)} 
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center justify-center gap-2 transition"
                >
                  <Eye className="w-4 h-4" />
                  View
                </button>
                <button 
                  onClick={() => deleteProject(project.id)}
                  className="p-2 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/20 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
