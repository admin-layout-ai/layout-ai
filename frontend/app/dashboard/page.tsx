// frontend/app/dashboard/page.tsx
// Dashboard page - calls backend to create/sync user on first login

'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Plus, Home, FolderOpen, Clock, Bell } from 'lucide-react';
import { useState, useEffect } from 'react';

interface DashboardStats {
  total: number;
  completed: number;
  plans: number;
}

interface Project {
  id: number;
  name: string;
  status: string;
  bedrooms?: number;
  bathrooms?: number;
  created_at?: string;
}

export default function DashboardPage() {
  const { user, getAccessToken } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSynced, setUserSynced] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    completed: 0,
    plans: 0
  });

  // Sync user with backend on first load
  useEffect(() => {
    syncUserWithBackend();
  }, []);

  // Load projects after user is synced
  useEffect(() => {
    if (userSynced) {
      loadDashboardData();
    }
  }, [userSynced]);

  const syncUserWithBackend = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        console.warn('No auth token found');
        setLoading(false);
        return;
      }

      // Check if API URL is configured
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) {
        console.warn('API URL not configured, skipping user sync');
        setUserSynced(true);
        setLoading(false);
        return;
      }

      // Call GET /api/v1/users/me to create or sync user
      const response = await fetch(`${apiUrl}/api/v1/users/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const userData = await response.json();
        console.log('User synced with backend:', userData);
        
        // Update local storage with synced user data
        const currentUserInfo = localStorage.getItem('user_info');
        if (currentUserInfo) {
          const localUser = JSON.parse(currentUserInfo);
          // Merge backend data with local data
          const mergedUser = {
            ...localUser,
            dbId: userData.id,  // Store the database ID
            email: userData.email || localUser.email,
            name: userData.name || localUser.name,
          };
          localStorage.setItem('user_info', JSON.stringify(mergedUser));
        }
        
        setUserSynced(true);
      } else if (response.status === 401) {
        console.error('Unauthorized - token may be expired');
        // Redirect to login
        router.push('/auth/signin');
      } else {
        console.error('Failed to sync user:', response.status);
        setUserSynced(true); // Continue anyway
      }
    } catch (error) {
      console.error('Error syncing user with backend:', error);
      setUserSynced(true); // Continue anyway to show dashboard
    }
  };

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      if (!apiUrl || !token) {
        setLoading(false);
        return;
      }

      // Call dashboard endpoint to get stats and recent projects
      const response = await fetch(`${apiUrl}/api/v1/users/me/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats({
          total: data.stats?.total_projects || 0,
          completed: data.stats?.completed_projects || 0,
          plans: data.stats?.plans_generated || 0
        });
        setProjects(data.recent_projects || []);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
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

  // Get display name with proper fallbacks
  const getDisplayName = () => {
    if (user?.name && user.name !== 'User' && user.name !== 'unknown') {
      return user.name.split(' ')[0]; // First name only
    }
    if (user?.givenName) {
      return user.givenName;
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'there';
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
            <Home className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              {getGreeting()}, {getDisplayName()}!
            </h1>
            <p className="text-gray-400 text-sm">
              {stats.total} active project{stats.total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-white/20 transition">
          <Bell className="w-5 h-5 text-gray-300" />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 text-center">
          <p className="text-3xl font-bold text-white">{stats.total}</p>
          <p className="text-sm text-gray-400">Projects</p>
        </div>
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 text-center">
          <p className="text-3xl font-bold text-white">{stats.completed}</p>
          <p className="text-sm text-gray-400">Completed</p>
        </div>
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 text-center">
          <p className="text-3xl font-bold text-white">{stats.plans}</p>
          <p className="text-sm text-gray-400">Plans</p>
        </div>
      </div>

      {/* Create New Project Button */}
      <button
        onClick={handleCreateProject}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 mb-6 flex items-center justify-center gap-2 transition font-medium"
      >
        <Plus className="w-5 h-5" />
        Create New Project
      </button>

      {/* Recent Projects */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-gray-400 text-sm font-medium">Recent Projects</h2>
          {projects.length > 0 && (
            <button 
              onClick={() => router.push('/dashboard/projects')}
              className="text-blue-400 text-sm hover:text-blue-300 transition"
            >
              View all
            </button>
          )}
        </div>

        {loading ? (
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-8 border border-white/10 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
            <p className="text-gray-400 text-sm">Loading...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-8 border border-white/10 text-center">
            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Home className="w-8 h-8 text-gray-500" />
            </div>
            <h3 className="text-white font-medium mb-2">No projects yet</h3>
            <p className="text-gray-400 text-sm mb-4">
              Create your first floor plan project
            </p>
            <button
              onClick={handleCreateProject}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm"
            >
              <Plus className="w-4 h-4" />
              Create Project
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.slice(0, 5).map((project) => (
              <button
                key={project.id}
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                className="w-full bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-blue-500/50 hover:bg-white/10 transition flex items-center justify-between text-left"
              >
                <span className="text-white font-medium">{project.name}</span>
                <span className={`${getStatusColor(project.status)} text-white text-xs px-3 py-1 rounded-full`}>
                  {getStatusLabel(project.status)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <button
          onClick={() => router.push('/dashboard/projects')}
          className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-blue-500/50 hover:bg-white/10 transition text-left"
        >
          <FolderOpen className="w-5 h-5 text-purple-400 mb-2" />
          <p className="text-white text-sm font-medium">All Projects</p>
          <p className="text-gray-500 text-xs">{stats.total} total</p>
        </button>
        <button
          onClick={() => router.push('/dashboard/billing')}
          className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-blue-500/50 hover:bg-white/10 transition text-left"
        >
          <Clock className="w-5 h-5 text-green-400 mb-2" />
          <p className="text-white text-sm font-medium">Account</p>
          <p className="text-gray-500 text-xs">View plans</p>
        </button>
      </div>
    </div>
  );
}
