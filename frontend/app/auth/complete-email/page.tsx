// frontend/app/auth/complete-email/page.tsx
// Collect email address after signup (Azure B2C doesn't always provide it)

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Home, Mail, ArrowRight, Sparkles, AlertCircle, CheckCircle } from 'lucide-react';

export default function CompleteEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/auth/signin');
      return;
    }

    // Get user info from localStorage
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
      try {
        const user = JSON.parse(userInfo);
        
        // Get display name
        if (user.givenName) {
          setUserName(user.givenName);
        } else if (user.name && user.name !== 'User' && user.name !== 'unknown') {
          setUserName(user.name.split(' ')[0]);
        } else {
          setUserName('there');
        }
        
        setUserId(user.id);
        
        // If user already has valid email, skip to dashboard
        if (user.email && user.email.length > 0 && user.email.includes('@')) {
          console.log('User already has email, redirecting to dashboard');
          router.push('/dashboard');
          return;
        }
      } catch (e) {
        console.error('Error parsing user info:', e);
        router.push('/auth/signin');
      }
    } else {
      router.push('/auth/signin');
    }
  }, [router]);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError('Please enter your email address');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      // Update user info in localStorage with the email
      const userInfo = localStorage.getItem('user_info');
      if (userInfo) {
        const user = JSON.parse(userInfo);
        user.email = trimmedEmail;
        localStorage.setItem('user_info', JSON.stringify(user));
        console.log('Updated user email in localStorage:', trimmedEmail);
      }

      // Small delay for UX
      await new Promise(resolve => setTimeout(resolve, 500));

      // Redirect to dashboard - welcome modal will handle the rest
      router.push('/dashboard');
    } catch (err) {
      console.error('Error saving email:', err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            <a href="/" className="flex items-center space-x-2">
              <Home className="w-6 h-6 text-blue-400" />
              <span className="text-lg font-bold text-white">
                Layout<span className="text-blue-400">AI</span>
              </span>
            </a>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)] px-4 py-12">
        <div className="w-full max-w-md">
          
          {/* Success Icon */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/20 rounded-full mb-4 border border-green-500/30">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Account Created! 🎉
            </h1>
            <p className="text-gray-400">
              Welcome{userName !== 'there' ? `, ${userName}` : ''}! Just one more step...
            </p>
          </div>

          {/* Email Form Card */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8">
            
            {/* Why we need email */}
            <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
              <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-blue-300 text-sm font-medium mb-1">Why do we need your email?</p>
                <p className="text-blue-200/70 text-xs">
                  We'll send you project updates, generated floor plans, and important notifications about your designs.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  <Mail className="w-4 h-4 inline mr-1.5" />
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  autoFocus
                  autoComplete="email"
                />
                {error && (
                  <div className="mt-2 flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div>
                    <span>Continuing...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Dashboard</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-gray-500">
              We respect your privacy and won't spam you.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
