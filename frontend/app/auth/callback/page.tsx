// frontend/app/auth/callback/page.tsx
// Auth callback handler - FIXED: Better error handling and redirect logic

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, AlertCircle } from 'lucide-react';

export default function CallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Processing...');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      setStatus('Verifying credentials...');
      
      // Get the hash fragment from URL
      const hash = window.location.hash.substring(1);
      
      if (!hash) {
        // Check for error in query params (some OAuth providers use this)
        const urlParams = new URLSearchParams(window.location.search);
        const errorParam = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');
        
        if (errorParam) {
          throw new Error(errorDescription || `Authentication error: ${errorParam}`);
        }
        
        throw new Error('No authentication response received');
      }

      const params = new URLSearchParams(hash);
      
      // Check for error in hash fragment
      const errorParam = params.get('error');
      if (errorParam) {
        const errorDescription = params.get('error_description');
        throw new Error(errorDescription || `Authentication error: ${errorParam}`);
      }

      const idToken = params.get('id_token');
      const accessToken = params.get('access_token');

      if (!idToken) {
        throw new Error('No ID token received from authentication provider');
      }

      setStatus('Processing user information...');

      // Decode the token payload
      const tokenParts = idToken.split('.');
      if (tokenParts.length !== 3) {
        throw new Error('Invalid token format');
      }

      let payload;
      try {
        payload = JSON.parse(atob(tokenParts[1]));
      } catch {
        throw new Error('Failed to decode authentication token');
      }

      console.log('Token payload:', payload);

      // Extract email from various possible claims
      const email = payload.email || 
                   payload.mail ||
                   payload.emails?.[0] || 
                   payload.preferred_username || 
                   payload.upn ||
                   null;

      // Extract names
      const givenName = payload.given_name || payload.givenName || '';
      const familyName = payload.family_name || payload.familyName || payload.surname || '';
      
      let fullName = '';
      if (givenName && familyName) {
        fullName = `${givenName} ${familyName}`;
      } else if (givenName) {
        fullName = givenName;
      } else if (familyName) {
        fullName = familyName;
      } else if (payload.name) {
        fullName = payload.name;
      } else {
        fullName = 'User';
      }

      const userId = payload.sub || payload.oid;
      
      if (!userId) {
        throw new Error('No user identifier in token');
      }

      // Check if this user has already provided email before
      const existingUsers = JSON.parse(localStorage.getItem('user_emails') || '{}');
      const savedEmail = existingUsers[userId];

      const user = {
        id: userId,
        email: email || savedEmail || '',
        name: fullName,
        givenName: givenName,
        familyName: familyName,
        profilePicture: payload.picture || null,
        identityProvider: payload.idp || 'local',
      };

      console.log('User:', user);

      // Store authentication data
      localStorage.setItem('auth_token', accessToken || idToken);
      localStorage.setItem('user_info', JSON.stringify(user));

      // Dispatch event for other tabs/components
      window.dispatchEvent(new Event('auth-updated'));

      setStatus('Redirecting...');

      // Check for stored redirect path
      const storedRedirect = sessionStorage.getItem('auth_redirect');
      sessionStorage.removeItem('auth_redirect');

      // Determine where to redirect
      if (!user.email) {
        // If no email, redirect to collect it (only once per user)
        router.push('/auth/complete-profile');
      } else if (storedRedirect && storedRedirect !== '/auth/signin' && storedRedirect !== '/auth/signup') {
        // Redirect to originally requested page
        router.push(storedRedirect);
      } else {
        // Default to dashboard
        router.push('/dashboard');
      }
    } catch (err) {
      console.error('Error processing callback:', err);
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMessage);
    }
  };

  const handleRetry = () => {
    router.push('/auth/signin');
  };

  const handleGoHome = () => {
    router.push('/');
  };

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center p-6">
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 max-w-md w-full text-center">
          {/* Error Icon */}
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>

          {/* Error Message */}
          <h1 className="text-xl font-bold text-white mb-3">
            Sign In Failed
          </h1>
          <p className="text-gray-400 mb-6 text-sm">
            {error}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleRetry}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Try Again
            </button>
            <button
              onClick={handleGoHome}
              className="w-full bg-white/10 text-white py-3 rounded-lg hover:bg-white/20 transition font-medium"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
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
        <div className="relative mb-6">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/20 border-t-blue-500 mx-auto"></div>
        </div>

        <p className="text-white font-medium mb-2">Signing you in</p>
        <p className="text-gray-400 text-sm">{status}</p>
      </div>
    </div>
  );
}
