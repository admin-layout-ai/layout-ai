'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Plus, Home, FolderOpen, Clock, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const { user, getAccessToken } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      if (!user) {
        setLoading(false);
        return;
      }
      
      // Check if API URL is configured
      if (!process.env.NEXT_PUBLIC_API_URL) {
        console.warn('API URL not configured, skipping project load');
        setLoading(false);
        return;
      }
      
      const token = await getAccessToken();
      const data = await api.listProjects(parseInt(user.id), token);
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
      // Set empty projects array on error so UI still works
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = () => {
    router.push('/dashboard/projects/new');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="p-8">
      
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {getGreeting()}, {user?.name || 'there'}! 👋
        </h1>
        <p className="text-gray-600">
          Welcome to your LayoutAI dashboard. Create your first floor plan or continue working on existing projects.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        
        {/* Create New Project Card */}
        <button
          onClick={handleCreateProject}
          className="group relative bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-left hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
        >
          <div className="absolute top-6 right-6 w-12 h-12 bg-white/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <Plus className="w-6 h-6 text-white" />
          </div>
          
          <div className="text-white mb-4">
            <Home className="w-8 h-8 mb-3 opacity-90" />
            <h3 className="text-xl font-bold mb-1">Create New Project</h3>
            <p className="text-blue-100 text-sm">
              Start designing your dream home with AI
            </p>
          </div>
          
          <div className="flex items-center text-white font-medium text-sm group-hover:gap-2 transition-all">
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        {/* Recent Projects Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Recent Projects</h3>
              <p className="text-sm text-gray-500">{projects.length} total</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            View all <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Stats Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Account Status</h3>
              <p className="text-sm text-gray-500">Free Trial</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard/billing')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            View plans <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* Recent Projects List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Home className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No projects yet
          </h3>
          <p className="text-gray-600 mb-6">
            Create your first floor plan project to get started with AI-powered design
          </p>
          <button
            onClick={handleCreateProject}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium"
          >
            <Plus className="w-5 h-5" />
            Create Your First Project
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Recent Projects</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {projects.slice(0, 5).map((project: any) => (
              <button
                key={project.id}
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                className="w-full p-6 hover:bg-gray-50 transition text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Home className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{project.name}</h3>
                      <p className="text-sm text-gray-500">
                        {project.bedrooms && `${project.bedrooms} bed`}
                        {project.bathrooms && ` • ${project.bathrooms} bath`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      project.status === 'completed' 
                        ? 'bg-green-100 text-green-700'
                        : project.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {project.status.replace('_', ' ')}
                    </span>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </button>
            ))}
          </div>
          {projects.length > 5 && (
            <div className="p-6 border-t border-gray-200 text-center">
              <button
                onClick={() => router.push('/dashboard/projects')}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                View all {projects.length} projects
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
