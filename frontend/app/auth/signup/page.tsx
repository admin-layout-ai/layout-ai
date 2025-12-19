'use client';

import { Home } from 'lucide-react';

export default function SignUpPage() {
  const handleGoogleSignUp = () => {
    // HARDCODED - Sign up flow with Google
    window.location.href = 'https://layoutaib2c.ciamlogin.com/layoutaib2c.onmicrosoft.com/oauth2/v2.0/authorize?client_id=b25e167b-e52c-4cb0-b5c8-5ed9feab3b38&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback&response_type=id_token&scope=openid%20profile%20email&nonce=defaultNonce&prompt=create&domain_hint=google.com';
  };

  const handleEmailSignUp = () => {
    // HARDCODED - Sign up flow with Email
    window.location.href = 'https://layoutaib2c.ciamlogin.com/layoutaib2c.onmicrosoft.com/oauth2/v2.0/authorize?client_id=b25e167b-e52c-4cb0-b5c8-5ed9feab3b38&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback&response_type=id_token&scope=openid%20profile%20email&nonce=defaultNonce&prompt=create';
  };

  return (
    <div className="min-h-screen bg-white">
      
      {/* Navigation Bar - matching main page */}
      <header className="fixed top-0 w-full bg-white/95 backdrop-blur-sm border-b border-gray-200 z-50">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Home className="w-8 h-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">
                Layout<span className="text-blue-600">AI</span>
              </span>
            </div>
            <a href="/" className="text-gray-700 hover:text-blue-600 transition text-sm">
              ← Back to home
            </a>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <div className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-gray-900 mb-3">
              Create your account
            </h1>
            <p className="text-lg text-gray-600">
              Start designing your dream home with AI
            </p>
          </div>

          {/* Sign-up Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
            
            {/* Sign-up Buttons */}
            <div className="space-y-4">
              
              {/* Google Button */}
              <button
                onClick={handleGoogleSignUp}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 border-2 border-gray-300 rounded-xl text-gray-700 bg-white hover:bg-gray-50 hover:border-blue-600 transition-all duration-200 group"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="font-semibold text-lg">Sign up with Google</span>
              </button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500 font-medium">or</span>
                </div>
              </div>

              {/* Email Button */}
              <button
                onClick={handleEmailSignUp}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 border-2 border-gray-300 rounded-xl text-gray-700 bg-white hover:bg-gray-50 hover:border-blue-600 transition-all duration-200 group"
              >
                <svg className="w-6 h-6 text-gray-600 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="font-semibold text-lg">Sign up with Email</span>
              </button>
            </div>

            {/* Terms */}
            <p className="mt-6 text-center text-sm text-gray-500">
              By signing up, you agree to our{' '}
              <a href="#" className="text-blue-600 hover:underline">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>
            </p>

            {/* Sign-in Link */}
            <div className="mt-6 pt-6 border-t border-gray-200 text-center">
              <p className="text-gray-600">
                Already have an account?{' '}
                <a 
                  href="/auth/signin" 
                  className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Sign in
                </a>
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
