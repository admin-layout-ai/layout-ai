// frontend/app/components/AuthModal.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'signin' | 'signup';
  onSwitchMode: (mode: 'signin' | 'signup') => void;
}

export default function AuthModal({ isOpen, onClose, mode, onSwitchMode }: AuthModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Build auth URL using environment variables
  const getAuthUrl = (domainHint?: string) => {
    const clientId = process.env.NEXT_PUBLIC_B2C_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_B2C_REDIRECT_URI;
    const tenantName = process.env.NEXT_PUBLIC_B2C_TENANT_NAME;

    const isSignUp = mode === 'signup';

    let url =
      `https://${tenantName}.ciamlogin.com/${tenantName}.onmicrosoft.com/oauth2/v2.0/authorize?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri || '')}` +
      `&response_type=${isSignUp ? 'id_token' : 'id_token%20token'}` +
      `&scope=${encodeURIComponent('openid profile email')}` +
      `&response_mode=fragment` +
      `&nonce=${Date.now()}` +
      `&prompt=${isSignUp ? 'create' : 'login'}`;

    if (domainHint) {
      url += `&domain_hint=${domainHint}`;
    }
    return url;
  };

  const handleGoogle = () => {
    window.location.href = getAuthUrl('google.com');
  };

  const handleEmail = () => {
    window.location.href = getAuthUrl();
  };

  const isSignUp = mode === 'signup';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 pt-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-sm text-gray-500">
              {isSignUp
                ? 'Start designing your dream home with AI'
                : 'Sign in to continue to LayoutAI'}
            </p>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            {/* Google */}
            <button
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 hover:border-blue-500 transition-all duration-200"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="font-medium text-sm">
                {isSignUp ? 'Sign up with Google' : 'Continue with Google'}
              </span>
            </button>

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-white text-gray-500">or</span>
              </div>
            </div>

            {/* Email */}
            <button
              onClick={handleEmail}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 hover:border-blue-500 transition-all duration-200"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="font-medium text-sm">
                {isSignUp ? 'Sign up with Email' : 'Continue with Email'}
              </span>
            </button>
          </div>

          {/* Terms (sign-up only) */}
          {isSignUp && (
            <p className="mt-4 text-center text-xs text-gray-500">
              By signing up, you agree to our{' '}
              <a href="/terms" className="text-blue-600 hover:underline">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>
            </p>
          )}

          {/* Switch mode */}
          <div className="mt-5 pt-4 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-600">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => onSwitchMode(isSignUp ? 'signin' : 'signup')}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
