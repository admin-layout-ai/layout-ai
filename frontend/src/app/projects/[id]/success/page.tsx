'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, Home, FileText, X } from 'lucide-react';

export default function PaymentSuccessPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.id;
  const sessionId = searchParams.get('session_id');

  const [verifying, setVerifying] = useState(true);
  const [payment, setPayment] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      verifyPayment();
    }
  }, [sessionId]);

  const verifyPayment = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/verify/${sessionId}?user_id=1`
      );

      if (!response.ok) {
        throw new Error('Failed to verify payment');
      }

      const data = await response.json();
      setPayment(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Verifying Payment...
          </h2>
          <p className="text-gray-600">Please wait while we confirm your payment</p>
        </div>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Payment Verification Failed
          </h2>
          <p className="text-gray-600 mb-6">
            {error || 'We could not verify your payment. Please contact support.'}
          </p>
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Success Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-8 text-center">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Payment Successful!
          </h1>
          <p className="text-green-50">
            Your floor plans are being generated
          </p>
        </div>

        {/* Payment Details */}
        <div className="p-8">
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Payment Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Plan Type:</span>
                <span className="font-semibold capitalize">{payment.plan_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Amount Paid:</span>
                <span className="font-semibold">${(payment.amount / 100).toFixed(2)} AUD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  {payment.status}
                </span>
              </div>
            </div>
          </div>

          {/* What's Next */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">What happens next?</h3>
            <ol className="space-y-3">
              <li className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <div>
                  <div className="font-medium">Floor plans are generating</div>
                  <div className="text-sm text-gray-600">
                    Our AI is creating multiple layout options for your project
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <div>
                  <div className="font-medium">Review your options</div>
                  <div className="text-sm text-gray-600">
                    You'll get {payment.plan_type === 'basic' ? '1' : payment.plan_type === 'standard' ? '3' : '5'} floor plan variants to choose from
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <div>
                  <div className="font-medium">Download your files</div>
                  <div className="text-sm text-gray-600">
                    Get PDF and DXF files ready for your builder
                  </div>
                </div>
              </li>
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/projects/${projectId}`)}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2"
            >
              <FileText className="w-5 h-5" />
              View Project
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 font-semibold flex items-center justify-center gap-2"
            >
              <Home className="w-5 h-5" />
              Dashboard
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-6 text-center border-t border-gray-200">
          <p className="text-sm text-gray-600">
            Need help? Contact us at <a href="mailto:support@layout-ai.com.au" className="text-blue-600 hover:underline">support@layout-ai.com.au</a>
          </p>
        </div>
      </div>
    </div>
  );
}