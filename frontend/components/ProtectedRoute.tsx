// frontend/components/ProtectedRoute.tsx
// FIXED: Improved loading states and redirect handling

'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

export function ProtectedRoute({ 
  children, 
  fallback,
  redirectTo = '/auth/signin' 
}: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // Only redirect after initial loading is complete
    if (!isLoading && !isAuthenticated && !isRedirecting) {
      setIsRedirecting(true);
      
      // Store the intended destination for redirect after login
      if (pathname && pathname !== redirectTo) {
        sessionStorage.setItem('auth_redirect', pathname);
      }
      
      router.push(redirectTo);
    }
  }, [isLoading, isAuthenticated, isRedirecting, router, redirectTo, pathname]);

  // Show loading state while checking authentication
  if (isLoading) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center">
        <div className="text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <Home className="w-10 h-10 text-blue-400" />
            <span className="text-2xl font-bold text-white">
              Layout<span className="text-blue-400">AI</span>
            </span>
          </div>
          
          {/* Loading Spinner */}
          <div className="relative">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/20 border-t-blue-500 mx-auto"></div>
          </div>
          
          <p className="text-gray-400 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  // Show nothing while redirecting
  if (!isAuthenticated || isRedirecting) {
    return null;
  }

  // User is authenticated, render children
  return <>{children}</>;
}

// Higher-order component version for class components or other use cases
export function withProtectedRoute<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: { redirectTo?: string; fallback?: React.ReactNode }
): React.FC<P> {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedRoute 
        redirectTo={options?.redirectTo} 
        fallback={options?.fallback}
      >
        <WrappedComponent {...props} />
      </ProtectedRoute>
    );
  };
}
