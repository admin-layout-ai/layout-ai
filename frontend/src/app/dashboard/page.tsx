'use client';

import { useState, useEffect } from 'react';
import { 
  FolderOpen, 
  FileText, 
  DollarSign, 
  TrendingUp 
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface DashboardStats {
  total_projects: number;
  completed_projects: number;
  total_spent: number;
  plans_generated: number;
}

export default function DashboardOverview() {
  const [stats, setStats] = useState<DashboardStats>({
    total_projects: 0,
    completed_projects: 0,
    total_spent: 0,
    plans_generated: 0,
  });
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/?user_id=1`
      );
      const projects = await response.json();

      // Calculate statistics
      const completed = projects.filter(
        (p: any) => p.status === 'completed'
      ).length;
      
      setStats({
        total_projects: projects.length,
        completed_projects: completed,
        total_spent: 0, // TODO: Get from payments API
        plans_generated: completed * 3,
      });

      // Get 5 most recent projects
      setRecentProjects(projects.slice(0, 5));
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  const statCards = [
    { 
      icon: FolderOpen, 
      label: 'Total Projects', 
      value: stats.total_projects, 
      color: 'bg-blue-500' 
    },
    { 
      icon: FileText, 
      label: 'Completed', 
      value: stats.completed_projects, 
      color: 'bg-green-500' 
    },
    { 
      icon: TrendingUp, 
      label: 'Plans Generated', 
      value: stats.plans_generated, 
      color: 'bg-purple-500' 
    },
    { 
      icon: DollarSign, 
      label: 'Total Spent', 
      value: `$${stats.total_spent}`, 
      color: 'bg-orange-500' 
    },
  ];

  return (
    <div className="p-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Welcome back! Here's your overview
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          
          return (
            <div 
              key={index} 
              className="bg-white rounded-xl shadow-md p-6 border border-gray-200"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-gray-600">
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Projects Section */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Recent Projects
          </h2>
        </div>
        
        <div className="divide-y divide-gray-200">
          {recentProjects.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No projects yet. Create your first project to get started!
            </div>
          ) : (
            recentProjects.map((project: any) => (
              <div
                key={project.id}
                onClick={() => router.push(`/projects/${project.id}`)}
                className="p-6 hover:bg-gray-50 cursor-pointer transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {project.name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {project.bedrooms} bed • {project.bathrooms} bath • 
                      {' '}{new Date(project.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  
                  {/* Status Badge */}
                  <span className={`
                    px-3 py-1 rounded-full text-xs font-medium
                    ${project.status === 'completed' 
                      ? 'bg-green-100 text-green-800' 
                      : project.status === 'generating'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-yellow-100 text-yellow-800'
                    }
                  `}>
                    {project.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}