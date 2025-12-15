'use client';

import { useState, useEffect } from 'react';
import { Plus, FileText, Download, Trash2, Eye, Edit, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLoading } from '@/hooks/useLoading';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const router = useRouter();
  
  // NEW: Use the loading hook
  const { loading, error, withLoading } = useLoading();

  useEffect(() => {
    loadProjects();
  }, []);

  // UPDATED: Use withLoading wrapper
  const loadProjects = async () => {
    const data = await withLoading(async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/?user_id=1`
      );
      if (!response.ok) throw new Error('Failed to load projects');
      return response.json();
    });
    
    if (data) setProjects(data);
  };

  const createProject = async () => {
    const name = prompt('Enter project name:');
    if (!name) return;

    const data = await withLoading(async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/?user_id=1`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, land_width: 15, land_depth: 30 })
        }
      );
      if (!response.ok) throw new Error('Failed to create project');
      return response.json();
    });

    if (data) {
      router.push(`/projects/${data.id}`);
    }
  };

  const deleteProject = async (projectId: number) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;

    await withLoading(async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}?user_id=1`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error('Failed to delete project');
    });

    // Remove from local state
    setProjects(projects.filter(p => p.id !== projectId));
  };

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || project.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // NEW: Show loading state
  if (loading) {
    return (
      <div className="p-8">
        <LoadingSpinner message="Loading projects..." />
      </div>
    );
  }

  // NEW: Show error state
  if (error) {
    return (
      <div className="p-8">
        <ErrorMessage message={error} />
        <button 
          onClick={loadProjects}
          className="mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  // Rest of your component remains the same...
  return (
    <div className="p-8">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-600 mt-1">{projects.length} total projects</p>
        </div>
        <button 
          onClick={createProject} 
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition"
        >
          <Plus className="w-5 h-5" />
          New Project
        </button>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-6 flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="questionnaire">Questionnaire</option>
          <option value="generating">Generating</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border-2 border-dashed border-gray-300">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">
            {searchTerm || filterStatus !== 'all' ? 'No matching projects' : 'No projects yet'}
          </h3>
          <p className="text-gray-600 mb-6">
            {searchTerm || filterStatus !== 'all' 
              ? 'Try adjusting your filters' 
              : 'Create your first floor plan project'}
          </p>
          {!searchTerm && filterStatus === 'all' && (
            <button onClick={createProject} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={deleteProject}
              onView={(id) => router.push(`/projects/${id}`)}
              onEdit={(id) => router.push(`/projects/${id}/edit`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ProjectCard component (same as before)
function ProjectCard({ project, onDelete, onView, onEdit }: { 
  project: Project;
  onDelete: (id: number) => void;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
}) {
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'generating': return 'bg-blue-100 text-blue-800';
      case 'questionnaire': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition border border-gray-200 overflow-hidden">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{project.name}</h3>
            <p className="text-sm text-gray-500">{new Date(project.created_at).toLocaleDateString()}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(project.status)}`}>
            {project.status}
          </span>
        </div>

        <div className="space-y-2 mb-4 text-sm text-gray-600">
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

      <div className="bg-gray-50 px-6 py-4 flex gap-2 border-t border-gray-200">
        <button 
          onClick={() => onView(project.id)} 
          className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center justify-center gap-2"
        >
          <Eye className="w-4 h-4" />
          View
        </button>
        <button 
          onClick={() => onEdit(project.id)}
          className="p-2 border border-gray-300 rounded-lg hover:bg-gray-100"
          title="Edit"
        >
          <Edit className="w-4 h-4 text-gray-600" />
        </button>
        {project.status === 'completed' && (
          <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-100" title="Download">
            <Download className="w-4 h-4 text-gray-600" />
          </button>
        )}
        <button 
          onClick={() => onDelete(project.id)}
          className="p-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}