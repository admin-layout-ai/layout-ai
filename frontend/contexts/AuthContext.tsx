// frontend/contexts/AuthContext.tsx
// FIXED: Improved error handling, token validation, and type safety

'use client';

import { 
  createContext, 
  useContext, 
  useState, 
  useEffect, 
  ReactNode, 
  useCallback,
  useMemo 
} from 'react';
import type { User, AuthContextType } from '@/lib/types';

// Create context with undefined default
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token validation helper
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000; // Convert to milliseconds
    // Add 30 second buffer to account for clock skew
    return Date.now() >= (exp - 30000);
  } catch {
    return true; // If we can't parse the token, consider it expired
  }
}

// Parse user from token
function parseUserFromToken(token: string): User | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    return {
      id: payload.sub || payload.oid || '',
      email: payload.email || payload.emails?.[0] || payload.preferred_username || '',
      name: payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim() || 'User',
      givenName: payload.given_name || payload.givenName || '',
      familyName: payload.family_name || payload.familyName || payload.surname || '',
      profilePicture: payload.picture || undefined,
      identityProvider: payload.idp || undefined,
    };
  } catch {
    return null;
  }
}

// Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check auth status from localStorage
  const checkAuthStatus = useCallback((): boolean => {
    try {
      const token = localStorage.getItem('auth_token');
      const userInfo = localStorage.getItem('user_info');
      
      if (!token) {
        setUser(null);
        return false;
      }

      // Check if token is expired
      if (isTokenExpired(token)) {
        console.log('Token expired, clearing auth');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_info');
        setUser(null);
        return false;
      }

      // Parse user info
      if (userInfo) {
        try {
          const parsedUser = JSON.parse(userInfo);
          setUser(parsedUser);
          return true;
        } catch {
          // If stored user info is invalid, try to parse from token
          const tokenUser = parseUserFromToken(token);
          if (tokenUser) {
            setUser(tokenUser);
            localStorage.setItem('user_info', JSON.stringify(tokenUser));
            return true;
          }
        }
      } else {
        // No stored user info, parse from token
        const tokenUser = parseUserFromToken(token);
        if (tokenUser) {
          setUser(tokenUser);
          localStorage.setItem('user_info', JSON.stringify(tokenUser));
          return true;
        }
      }

      setUser(null);
      return false;
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
      if (event.key === 'auth_token' || event.key === 'user_info') {
        console.log('Auth storage changed, syncing...');
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

  // Periodically check token validity (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      const token = localStorage.getItem('auth_token');
      if (token && isTokenExpired(token)) {
        console.log('Token expired during session, logging out');
        logout();
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const login = useCallback(async () => {
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
  }, []);

  const logout = useCallback(async () => {
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
      const postLogoutRedirectUri = process.env.NEXT_PUBLIC_B2C_POST_LOGOUT_REDIRECT_URI || 
        (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      
      const logoutUrl = `https://${tenantName}.ciamlogin.com/${tenantName}.onmicrosoft.com/oauth2/v2.0/logout?` +
        `post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;
      
      window.location.href = logoutUrl;
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, []);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
      throw new Error('No access token available. Please sign in.');
    }
    
    // Check if token is expired
    if (isTokenExpired(token)) {
      // Token expired, need to re-login
      await logout();
      throw new Error('Session expired. Please sign in again.');
    }
    
    return token;
  }, [logout]);

  // Update user data (useful for updating email after complete-profile)
  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(currentUser => {
      if (!currentUser) return null;
      
      const updatedUser = { ...currentUser, ...updates };
      localStorage.setItem('user_info', JSON.stringify(updatedUser));
      
      // Dispatch event for other components/tabs
      window.dispatchEvent(new Event('auth-updated'));
      
      return updatedUser;
    });
  }, []);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo<AuthContextType>(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    getAccessToken,
    updateUser,
  }), [user, isLoading, login, logout, getAccessToken, updateUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}
