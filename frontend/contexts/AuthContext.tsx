// frontend/contexts/AuthContext.tsx
// Updated with cross-tab session sync and better user data handling

'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

// User interface
interface User {
  id: string;
  name?: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  profilePicture?: string;
  identityProvider?: string;
}

// Auth context interface
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string>;
  updateUser: (updates: Partial<User>) => void;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check auth status from localStorage
  const checkAuthStatus = useCallback(() => {
    try {
      const token = localStorage.getItem('auth_token');
      const userInfo = localStorage.getItem('user_info');
      
      if (token && userInfo) {
        const parsedUser = JSON.parse(userInfo);
        setUser(parsedUser);
        return true;
      } else {
        setUser(null);
        return false;
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
      return false;
    }
  }, []);

  // Check if user is already logged in on mount
  useEffect(() => {
    checkAuthStatus();
    setIsLoading(false);
  }, [checkAuthStatus]);

  // Listen for storage changes (for cross-tab sync)
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      // If auth_token or user_info changed in another tab
      if (event.key === 'auth_token' || event.key === 'user_info') {
        console.log('Storage changed in another tab, syncing...');
        checkAuthStatus();
      }
      
      // If token was removed (logout in another tab)
      if (event.key === 'auth_token' && !event.newValue) {
        console.log('Logged out in another tab');
        setUser(null);
      }
    };

    // Listen for storage events from other tabs
    window.addEventListener('storage', handleStorageChange);

    // Also listen for custom events within same tab
    const handleCustomStorageEvent = () => {
      checkAuthStatus();
    };
    window.addEventListener('auth-updated', handleCustomStorageEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-updated', handleCustomStorageEvent);
    };
  }, [checkAuthStatus]);

  // Periodically check token validity (optional - every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        try {
          // Check if token is expired
          const payload = JSON.parse(atob(token.split('.')[1]));
          const exp = payload.exp * 1000; // Convert to milliseconds
          
          if (Date.now() >= exp) {
            console.log('Token expired, logging out');
            logout();
          }
        } catch (e) {
          // Invalid token format
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(interval);
  }, []);

  const login = async () => {
    try {
      setIsLoading(true);
      
      const clientId = process.env.NEXT_PUBLIC_B2C_CLIENT_ID || 'b25e167b-e52c-4cb0-b5c8-5ed9feab3b38';
      const redirectUri = process.env.NEXT_PUBLIC_B2C_REDIRECT_URI || 'http://localhost:3000/auth/callback';
      const tenantName = process.env.NEXT_PUBLIC_B2C_TENANT_NAME || 'layoutaib2c';
      
      const authUrl = `https://${tenantName}.ciamlogin.com/${tenantName}.onmicrosoft.com/oauth2/v2.0/authorize?` +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=id_token%20token` +
        `&scope=${encodeURIComponent('openid profile email User.Read')}` +
        `&response_mode=fragment` +
        `&nonce=${Date.now()}` +
        `&prompt=login`;
      
      window.location.href = authUrl;
    } catch (error) {
      console.error('Login failed:', error);
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Clear local storage
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_info');
      
      // Clear user state
      setUser(null);
      
      // Dispatch event for other components
      window.dispatchEvent(new Event('auth-updated'));
      
      // Redirect to Azure AD B2C logout
      const tenantName = process.env.NEXT_PUBLIC_B2C_TENANT_NAME || 'layoutaib2c';
      const postLogoutRedirectUri = process.env.NEXT_PUBLIC_B2C_POST_LOGOUT_REDIRECT_URI || 'http://localhost:3000';
      
      const logoutUrl = `https://${tenantName}.ciamlogin.com/${tenantName}.onmicrosoft.com/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;
      
      window.location.href = logoutUrl;
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getAccessToken = async (): Promise<string> => {
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
      throw new Error('No access token available');
    }
    
    // Check if token is expired
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const exp = payload.exp * 1000;
      
      if (Date.now() >= exp) {
        // Token expired, need to re-login
        await logout();
        throw new Error('Token expired');
      }
    } catch (e) {
      // If we can't parse the token, just return it
    }
    
    return token;
  };

  // Update user data (useful for updating email after complete-profile)
  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      localStorage.setItem('user_info', JSON.stringify(updatedUser));
      
      // Dispatch event for other components/tabs
      window.dispatchEvent(new Event('auth-updated'));
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    getAccessToken,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}
