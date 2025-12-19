'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// User interface - adjust based on your needs
interface User {
  id: string;
  name?: string;
  email?: string;
  profilePicture?: string;
}

// Auth context interface
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string>;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is already logged in on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // TODO: Implement actual auth check with MSAL or your auth library
      // For now, this is a placeholder
      
      // Example: Check if we have a token in localStorage
      const token = localStorage.getItem('auth_token');
      const userInfo = localStorage.getItem('user_info');
      
      if (token && userInfo) {
        setUser(JSON.parse(userInfo));
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async () => {
    try {
      setIsLoading(true);
      
      // TODO: Implement actual Azure AD B2C login
      // For now, redirect to the authorization URL
      const clientId = process.env.NEXT_PUBLIC_B2C_CLIENT_ID;
      const redirectUri = process.env.NEXT_PUBLIC_B2C_REDIRECT_URI || 'http://localhost:3000/auth/callback';
      const tenantName = process.env.NEXT_PUBLIC_B2C_TENANT_NAME || 'layoutaib2c';
      
      const authUrl = `https://${tenantName}.ciamlogin.com/${tenantName}.onmicrosoft.com/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=id_token&scope=openid%20profile%20email&nonce=defaultNonce&prompt=login`;
      
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
      
      // TODO: Implement actual Azure AD B2C logout
      const tenantName = process.env.NEXT_PUBLIC_B2C_TENANT_NAME || 'layoutaib2c';
      const postLogoutRedirectUri = process.env.NEXT_PUBLIC_B2C_POST_LOGOUT_REDIRECT_URI || 'http://localhost:3000';
      
      const logoutUrl = `https://${tenantName}.ciamlogin.com/${tenantName}.onmicrosoft.com/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;
      
      window.location.href = logoutUrl;
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getAccessToken = async (): Promise<string> => {
    // TODO: Implement actual token retrieval
    // For now, return token from localStorage
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
      throw new Error('No access token available');
    }
    
    return token;
  };

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    getAccessToken,
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
