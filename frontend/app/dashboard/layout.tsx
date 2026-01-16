// frontend/app/dashboard/layout.tsx
// Dashboard layout with dark theme sidebar

'use client';

import { Home, FolderOpen, CreditCard, Settings, LogOut, LayoutDashboard, User, Layers } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

export default function DashboardLayout({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: FolderOpen, label: 'Projects', href: '/dashboard/projects' },
    { icon: Layers, label: 'Plans', href: '/dashboard/plans' },
    { icon: CreditCard, label: 'Billing', href: '/dashboard/billing' },
    { icon: User, label: 'User Profile', href: '/dashboard/profile' },
    { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
  ];

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex">
        {/* Sidebar */}
        <div className="w-64 bg-slate-900/50 backdrop-blur-sm border-r border-white/10 flex flex-col">
          {/* Logo */}
          <div className="p-6 border-b border-white/10">
            <a href="/" className="flex items-center gap-2">
              <Home className="w-8 h-8 text-blue-400" />
              <span className="text-xl font-bold text-white">
                Layout<span className="text-blue-400">AI</span>
              </span>
            </a>
          </div>

          {/* User Profile */}
          <div className="p-4 border-b border-white/10">
            <button 
              onClick={() => router.push('/dashboard/profile')}
              className="w-full flex items-center gap-3 hover:bg-white/5 rounded-lg p-2 -m-2 transition"
            >
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                {user?.profilePicture ? (
                  <img 
                    src={user.profilePicture} 
                    alt={user.name || 'User'}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-white font-semibold text-sm">
                    {getInitials(user?.name || 'U')}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {user?.email || ''}
                </p>
              </div>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4">
            <ul className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || 
                  (item.href !== '/dashboard' && pathname?.startsWith(item.href));
                
                return (
                  <li key={item.href}>
                    <button
                      onClick={() => router.push(item.href)}
                      className={`
                        w-full flex items-center gap-3 px-4 py-3 
                        rounded-lg transition text-sm
                        ${isActive
                          ? 'bg-blue-600 text-white font-medium'
                          : 'text-gray-300 hover:bg-white/10 hover:text-white'
                        }
                      `}
                    >
                      <Icon className="w-5 h-5" />
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-white/10">
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition text-sm"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </ProtectedRoute>
  );
}
