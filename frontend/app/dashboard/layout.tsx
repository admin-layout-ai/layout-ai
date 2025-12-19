'use client';

import { Home, FolderOpen, CreditCard, Settings, LogOut } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { UserProfile } from '@/components/UserProfile';
import { useAuth } from '@/contexts/AuthContext';

export default function DashboardLayout({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = useAuth();

  const menuItems = [
    { icon: Home, label: 'Dashboard', href: '/dashboard' },
    { icon: FolderOpen, label: 'Projects', href: '/dashboard/projects' },
    { icon: CreditCard, label: 'Billing', href: '/dashboard/billing' },
    { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
  ];

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 flex">
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Home className="w-8 h-8 text-blue-600" />
              <span className="text-xl font-bold">
                Layout<span className="text-blue-600">AI</span>
              </span>
            </div>
          </div>

          <div className="p-4 border-b border-gray-200">
            <UserProfile />
          </div>

          <nav className="flex-1 p-4">
            <ul className="space-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                
                return (
                  <li key={item.href}>
                    <button
                      onClick={() => router.push(item.href)}
                      className={`
                        w-full flex items-center gap-3 px-4 py-3 
                        rounded-lg transition
                        ${isActive
                          ? 'bg-blue-50 text-blue-600 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
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

          <div className="p-4 border-t border-gray-200">
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </ProtectedRoute>
  );
}
