// frontend/app/dashboard/layout.tsx
// Dashboard layout with dark theme sidebar - Mobile Responsive

'use client';

import { useState, useEffect } from 'react';
import { Home, FolderOpen, CreditCard, LogOut, LayoutDashboard, User, Layers, Building2, Menu, X } from 'lucide-react';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: FolderOpen, label: 'Projects', href: '/dashboard/projects' },
    { icon: Layers, label: 'Floor Plans', href: '/dashboard/plans' },
    { icon: Building2, label: 'Facades', href: '/dashboard/facades' },
    { icon: CreditCard, label: 'Billing', href: '/dashboard/billing' },
    { icon: User, label: 'User Profile', href: '/dashboard/profile' },
  ];

  const handleLogout = async () => {
    setIsMobileMenuOpen(false);
    await logout();
    router.push('/');
  };

  const handleNavigation = (href: string) => {
    router.push(href);
    setIsMobileMenuOpen(false);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-4 lg:p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Home className="w-7 h-7 lg:w-8 lg:h-8 text-blue-400" />
            <span className="text-lg lg:text-xl font-bold text-white">
              Layout<span className="text-blue-400">AI</span>
            </span>
          </div>
          {/* Close button for mobile */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-3 lg:p-4 border-b border-white/10">
        <button 
          onClick={() => handleNavigation('/dashboard/profile')}
          className="w-full flex items-center gap-3 hover:bg-white/5 rounded-lg p-2 -m-2 transition"
        >
          <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            {user?.profilePicture ? (
              <img 
                src={user.profilePicture} 
                alt={user.name || 'User'}
                className="w-9 h-9 lg:w-10 lg:h-10 rounded-full object-cover"
              />
            ) : (
              <span className="text-white font-semibold text-xs lg:text-sm">
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
      <nav className="flex-1 p-3 lg:p-4 overflow-y-auto">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || 
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));
            
            return (
              <li key={item.href}>
                <button
                  onClick={() => handleNavigation(item.href)}
                  className={`
                    w-full flex items-center gap-3 px-3 lg:px-4 py-2.5 lg:py-3 
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
      <div className="p-3 lg:p-4 border-t border-white/10">
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 lg:px-4 py-2.5 lg:py-3 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition text-sm"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900">
        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-white/10 safe-area-inset">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Home className="w-6 h-6 text-blue-400" />
              <span className="text-lg font-bold text-white">
                Layout<span className="text-blue-400">AI</span>
              </span>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div 
            className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Mobile Sidebar */}
        <div className={`
          lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[85vw]
          bg-slate-900 border-r border-white/10 
          flex flex-col transform transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <SidebarContent />
        </div>

        {/* Desktop Layout */}
        <div className="hidden lg:flex min-h-screen">
          {/* Desktop Sidebar */}
          <div className="w-64 bg-slate-900/50 backdrop-blur-sm border-r border-white/10 flex flex-col flex-shrink-0 sticky top-0 h-screen">
            <SidebarContent />
          </div>

          {/* Desktop Main Content */}
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </div>

        {/* Mobile Main Content */}
        <div className="lg:hidden pt-14 min-h-screen">
          {children}
        </div>
      </div>
    </ProtectedRoute>
  );
}
