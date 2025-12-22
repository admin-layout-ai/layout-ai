// frontend/components/PaymentSuccess.tsx
// Component for showing payment success - used with query params

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowRight, Download, Eye, Home } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface PaymentSuccessProps {
  projectId: string;
  sessionId?: string;
  onViewProject: () => void;
}

export default function PaymentSuccess({ projectId, sessionId, onViewProject }: PaymentSuccessProps) {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      verifyPayment();
    } else {
      // No session ID, just show success (might be a test or direct navigation)
      setVerifying(false);
      setVerified(true);
    }
  }, [sessionId]);

  const verifyPayment = async () => {
    try {
      const token = await getAccessToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      
      const response = await fetch(`${apiUrl}/api/v1/payments/verify/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'succeeded' || data.status === 'complete') {
          setVerified(true);
        } else {
          setError('Payment is still processing. Please check back later.');
        }
      } else {
        setError('Could not verify payment status.');
      }
    } catch (err) {
      console.error('Error verifying payment:', err);
      setError('Could not verify payment. Please contact support if you were charged.');
    } finally {
      setVerifying(false);
    }
  };

  // Verifying state
  if (verifying) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-6">
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-3">Payment Verification</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={onViewProject}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium"
            >
              View Project
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-white/10 text-white px-6 py-3 rounded-lg hover:bg-white/20 transition"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-8 max-w-lg text-center">
        {/* Success Icon */}
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-400" />
        </div>

        {/* Success Message */}
        <h1 className="text-2xl font-bold text-white mb-3">
          Payment Successful!
        </h1>
        <p className="text-gray-400 mb-8">
          Thank you for your purchase. Your floor plans are being generated and will be ready shortly.
        </p>

        {/* What's Next Section */}
        <div className="bg-white/5 rounded-lg p-4 mb-8 text-left">
          <h3 className="font-semibold text-white mb-3">What happens next?</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5">✓</span>
              Our AI is now generating your custom floor plans
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5">✓</span>
              This typically takes 2-5 minutes
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5">✓</span>
              You'll receive multiple design options to choose from
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5">✓</span>
              Download your plans in PDF, DXF, or image format
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onViewProject}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
          >
            <Eye className="w-5 h-5" />
            View Project
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex-1 bg-white/10 text-white px-6 py-3 rounded-lg hover:bg-white/20 transition flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            Dashboard
          </button>
        </div>

        {/* Receipt Info */}
        <p className="text-gray-500 text-xs mt-6">
          A receipt has been sent to your email address.
        </p>
      </div>
    </div>
  );
}
