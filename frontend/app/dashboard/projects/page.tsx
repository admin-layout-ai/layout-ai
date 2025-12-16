'use client';

import { useState, useEffect } from 'react';
import { Plus, FileText, Eye, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/?user_id=1`);
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

  const createProject = async () => {
    const name = prompt('Enter project name:');
    if (!name) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/?user_id=1`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, land_width: 15, land_depth: 30 })
        }
      );
      
      if (response.ok) {
        const project = await response.json();
        router.push(`/projects/${project.id}`);
      }
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project');
    }
  };

  const deleteProject = async (projectId: number) => {
    if (!confirm('Delete this project?')) return;

    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}?user_id=1`,
        { method: 'DELETE' }
      );
      setProjects(projects.filter(p => p.id !== projectId));
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-600 mt-1">{projects.length} total projects</p>
        </div>
        <button 
          onClick={createProject} 
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border-2 border-dashed border-gray-300">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
          <p className="text-gray-600 mb-6">Create your first floor plan project</p>
          <button 
            onClick={createProject} 
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                    <p className="text-sm text-gray-500">{new Date(project.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    project.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {project.status}
                  </span>
                </div>

                <div className="space-y-2 mb-4 text-sm text-gray-600">
                  <div>📐 {project.land_width}m × {project.land_depth}m</div>
                  <div>🛏️ {project.bedrooms || 0} Bedrooms</div>
                  <div>🚿 {project.bathrooms || 0} Bathrooms</div>
                </div>
              </div>

              <div className="bg-gray-50 px-6 py-4 flex gap-2 border-t border-gray-200">
                <button 
                  onClick={() => router.push(`/projects/${project.id}`)} 
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  View
                </button>
                <button 
                  onClick={() => deleteProject(project.id)}
                  className="p-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
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