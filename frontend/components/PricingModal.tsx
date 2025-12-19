'use client';

import { useState } from 'react';
import { X, Check, Loader2, CreditCard } from 'lucide-react';

interface PricingModalProps {
  projectId: number;
  onClose: () => void;
}

export default function PricingModal({ projectId, onClose }: PricingModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      price: 99,
      description: 'Perfect for simple projects',
      features: [
        '1 floor plan design',
        '2 revision rounds',
        'PDF export',
        'Basic compliance check',
        '48-hour delivery'
      ],
      popular: false
    },
    {
      id: 'standard',
      name: 'Standard',
      price: 199,
      description: 'Most popular for builders',
      features: [
        '3 floor plan options',
        '5 revision rounds',
        'PDF + DXF export',
        'Facade design included',
        'Full compliance report',
        '24-hour delivery'
      ],
      popular: true
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 399,
      description: 'Complete design package',
      features: [
        '5 floor plan options',
        'Unlimited revisions',
        'All file formats (PDF, DXF, 3D)',
        '3D renders included',
        'Material schedules',
        'Priority support',
        '12-hour delivery'
      ],
      popular: false
    }
  ];

  const handlePurchase = async (planType: string) => {
    setLoading(planType);
    setError(null);
    
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/create-checkout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            plan_type: planType,
            user_id: 1 // TODO: Get from auth context
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create checkout');
      }

      const { checkout_url } = await response.json();
      
      // Redirect to Stripe Checkout
      window.location.href = checkout_url;
      
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Failed to initiate payment. Please try again.');
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Choose Your Plan</h2>
            <p className="text-gray-600 mt-1">Select a plan to generate your floor plans</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            disabled={loading !== null}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 p-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative border-2 rounded-xl p-6 transition-all ${
                plan.popular
                  ? 'border-blue-600 shadow-xl scale-105'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
              }`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg">
                    ⭐ Most Popular
                  </span>
                </div>
              )}

              {/* Plan Header */}
              <div className="text-center mb-6 mt-2">
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-gray-600 text-sm mb-4">{plan.description}</p>
                <div className="mb-1">
                  <span className="text-5xl font-bold text-gray-900">${plan.price}</span>
                </div>
                <div className="text-sm text-gray-500">per project</div>
              </div>

              {/* Features List */}
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <button
                onClick={() => handlePurchase(plan.id)}
                disabled={loading !== null}
                className={`w-full py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
                  plan.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading === plan.id ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    <span>Select {plan.name}</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex items-center justify-center gap-6 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              <span>Secure payment via Stripe</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              <span>30-day money-back guarantee</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              <span>Australian building code compliant</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}