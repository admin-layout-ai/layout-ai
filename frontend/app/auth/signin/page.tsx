'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Home } from 'lucide-react';

export default function SignInPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userInfo = localStorage.getItem('user_info');
    
    if (token && userInfo) {
      router.push('/dashboard');
    }
  }, [router]);

  const getAuthUrl = (domainHint?: string) => {
    const clientId = process.env.NEXT_PUBLIC_B2C_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_B2C_REDIRECT_URI;
    const tenantName = process.env.NEXT_PUBLIC_B2C_TENANT_NAME;
    
    let url = `https://${tenantName}.ciamlogin.com/${tenantName}.onmicrosoft.com/oauth2/v2.0/authorize?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri || '')}` +
      `&response_type=id_token%20token` +
      `&scope=${encodeURIComponent('openid profile email')}` +
      `&response_mode=fragment` +
      `&nonce=${Date.now()}` +
      `&prompt=login`;
    
    if (domainHint) {
      url += `&domain_hint=${domainHint}`;
    }
    
    return url;
  };

  const handleGoogleSignIn = () => {
    window.location.href = getAuthUrl('google.com');
  };

  const handleEmailSignIn = () => {
    window.location.href = getAuthUrl();
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-gradient-to-r from-slate-800 via-slate-900 to-blue-900">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            <a href="/" className="flex items-center space-x-2">
              <Home className="w-6 h-6 text-blue-400" />
              <span className="text-lg font-bold text-white">
                Layout<span className="text-blue-400">AI</span>
              </span>
            </a>
            <a href="/" className="text-gray-300 hover:text-white transition text-sm">
              ← Back to Home
            </a>
          </div>
        </nav>
      </header>

      <div className="pt-16 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-sm mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h1>
            <p className="text-sm text-gray-600">Sign in to continue to LayoutAI</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg">
            <div className="space-y-3">
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 hover:border-blue-500 transition-all duration-200"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="font-medium text-sm">Continue with Google</span>
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-white text-gray-500">or</span>
                </div>
              </div>

              <button
                onClick={handleEmailSignIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 hover:border-blue-500 transition-all duration-200"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="font-medium text-sm">Continue with Email</span>
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-600">
                Don&apos;t have an account?{' '}
                <a href="/auth/signup" className="font-medium text-blue-600 hover:text-blue-700">
                  Sign up
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}