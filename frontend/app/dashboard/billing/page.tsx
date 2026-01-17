'use client';

// frontend/app/dashboard/billing/page.tsx
// Billing and subscription management page

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CreditCard, 
  Loader2,
  AlertCircle,
  Check,
  Crown,
  Zap,
  Building,
  Calendar,
  Download,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Shield,
  Clock,
  FileText,
  Plus
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Subscription plans
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    description: 'Perfect for trying out Layout AI',
    icon: Zap,
    color: 'from-gray-500 to-gray-600',
    features: [
      '3 floor plan generations per month',
      'Basic room layouts',
      'Standard support',
      'PNG exports only',
    ],
    limitations: [
      'No facade designs',
      'No priority generation',
      'Watermarked exports',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    period: 'month',
    description: 'For individual builders and designers',
    icon: Crown,
    color: 'from-blue-500 to-blue-600',
    popular: true,
    features: [
      '50 floor plan generations per month',
      'Advanced room layouts',
      'Facade design generation',
      'Priority support',
      'PNG, PDF, DWG exports',
      'No watermarks',
      'Council compliance reports',
    ],
    limitations: [],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    period: 'month',
    description: 'For building companies and teams',
    icon: Building,
    color: 'from-purple-500 to-purple-600',
    features: [
      'Unlimited floor plan generations',
      'All Pro features included',
      'Custom branding on exports',
      'API access',
      'Dedicated account manager',
      'Custom integrations',
      'Team collaboration',
      'Advanced analytics',
    ],
    limitations: [],
  },
];

// Mock invoice data
const MOCK_INVOICES = [
  { id: 'INV-2026-001', date: '2026-01-01', amount: 49, status: 'paid', plan: 'Pro' },
  { id: 'INV-2025-012', date: '2025-12-01', amount: 49, status: 'paid', plan: 'Pro' },
  { id: 'INV-2025-011', date: '2025-11-01', amount: 49, status: 'paid', plan: 'Pro' },
];

interface UserSubscription {
  plan: string;
  status: 'active' | 'cancelled' | 'past_due';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface UsageStats {
  plansGenerated: number;
  plansLimit: number;
  facadesGenerated: number;
  facadesLimit: number;
  storageUsed: number;
  storageLimit: number;
}

export default function BillingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadBillingData();
    }
  }, [authLoading, isAuthenticated]);

  const loadBillingData = async () => {
    setIsLoading(true);
    
    try {
      // Mock data - replace with actual API calls
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setSubscription({
        plan: 'free',
        status: 'active',
        currentPeriodEnd: '2026-02-17',
        cancelAtPeriodEnd: false,
      });
      
      setUsage({
        plansGenerated: 1,
        plansLimit: 3,
        facadesGenerated: 0,
        facadesLimit: 0,
        storageUsed: 15,
        storageLimit: 100,
      });
      
    } catch (err) {
      console.error('Error loading billing data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async (planId: string) => {
    setSelectedPlan(planId);
    setIsUpgrading(true);
    
    // Simulate upgrade process
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // In production, this would redirect to Stripe checkout
    alert(`Upgrade to ${planId} plan - Stripe integration coming soon!`);
    
    setIsUpgrading(false);
    setSelectedPlan(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === 0) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  // Loading state
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
        <div className="mb-8 animate-pulse">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-7 h-7 bg-white/10 rounded"></div>
            <div className="h-8 w-48 bg-white/10 rounded"></div>
          </div>
          <div className="h-4 w-64 bg-white/10 rounded mt-2"></div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-6 border border-white/10 h-64"></div>
          ))}
        </div>
        
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading billing information...</p>
          </div>
        </div>
      </div>
    );
  }

  const currentPlan = PLANS.find(p => p.id === subscription?.plan) || PLANS[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <CreditCard className="w-7 h-7 text-blue-400" />
          Billing & Subscription
        </h1>
        <p className="text-gray-400 mt-1">
          Manage your subscription plan and billing information
        </p>
      </div>

      {/* Current Plan & Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Current Plan Card */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-gray-400 text-sm mb-1">Current Plan</p>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${currentPlan.color} flex items-center justify-center`}>
                  <currentPlan.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{currentPlan.name}</h3>
                  <p className="text-gray-400 text-sm">{currentPlan.description}</p>
                </div>
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              subscription?.status === 'active' 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-yellow-500/20 text-yellow-400'
            }`}>
              {subscription?.status === 'active' ? '● Active' : '● ' + subscription?.status}
            </div>
          </div>
          
          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-4xl font-bold text-white">${currentPlan.price}</span>
            {currentPlan.price > 0 && (
              <span className="text-gray-400">/{currentPlan.period}</span>
            )}
          </div>
          
          {subscription?.currentPeriodEnd && currentPlan.price > 0 && (
            <p className="text-gray-400 text-sm flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4" />
              {subscription.cancelAtPeriodEnd 
                ? `Cancels on ${formatDate(subscription.currentPeriodEnd)}`
                : `Renews on ${formatDate(subscription.currentPeriodEnd)}`
              }
            </p>
          )}
          
          <div className="pt-4 border-t border-white/10">
            <p className="text-sm text-gray-400 mb-3">Plan includes:</p>
            <ul className="space-y-2">
              {currentPlan.features.slice(0, 4).map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Usage Card */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            This Month's Usage
          </h3>
          
          <div className="space-y-6">
            {/* Floor Plans Usage */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Floor Plans Generated</span>
                <span className="text-white font-medium">
                  {usage?.plansGenerated || 0} / {usage?.plansLimit || 0}
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${getUsageColor(getUsagePercentage(usage?.plansGenerated || 0, usage?.plansLimit || 1))} transition-all`}
                  style={{ width: `${getUsagePercentage(usage?.plansGenerated || 0, usage?.plansLimit || 1)}%` }}
                />
              </div>
            </div>
            
            {/* Facades Usage */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Facade Designs Generated</span>
                <span className="text-white font-medium">
                  {usage?.facadesGenerated || 0} / {usage?.facadesLimit === 0 ? '—' : usage?.facadesLimit}
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                {usage?.facadesLimit === 0 ? (
                  <div className="h-full bg-gray-600 w-full" />
                ) : (
                  <div 
                    className={`h-full ${getUsageColor(getUsagePercentage(usage?.facadesGenerated || 0, usage?.facadesLimit || 1))} transition-all`}
                    style={{ width: `${getUsagePercentage(usage?.facadesGenerated || 0, usage?.facadesLimit || 1)}%` }}
                  />
                )}
              </div>
              {usage?.facadesLimit === 0 && (
                <p className="text-xs text-gray-500 mt-1">Upgrade to Pro for facade designs</p>
              )}
            </div>
            
            {/* Storage Usage */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Storage Used</span>
                <span className="text-white font-medium">
                  {usage?.storageUsed || 0} MB / {usage?.storageLimit || 0} MB
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${getUsageColor(getUsagePercentage(usage?.storageUsed || 0, usage?.storageLimit || 1))} transition-all`}
                  style={{ width: `${getUsagePercentage(usage?.storageUsed || 0, usage?.storageLimit || 1)}%` }}
                />
              </div>
            </div>
          </div>
          
          {currentPlan.id === 'free' && (
            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium text-sm">Need more generations?</p>
                  <p className="text-gray-400 text-sm mt-1">Upgrade to Pro for 50 floor plans per month plus facade designs.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upgrade Plans */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-400" />
          Available Plans
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isCurrentPlan = plan.id === subscription?.plan;
            
            return (
              <div 
                key={plan.id}
                className={`bg-white/5 rounded-xl p-6 border transition relative ${
                  plan.popular 
                    ? 'border-blue-500/50 ring-1 ring-blue-500/20' 
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
                    Most Popular
                  </div>
                )}
                
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                
                <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                <p className="text-gray-400 text-sm mb-4">{plan.description}</p>
                
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-bold text-white">${plan.price}</span>
                  {plan.price > 0 && (
                    <span className="text-gray-400">/{plan.period}</span>
                  )}
                </div>
                
                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>
                
                <button
                  onClick={() => !isCurrentPlan && handleUpgrade(plan.id)}
                  disabled={isCurrentPlan || (isUpgrading && selectedPlan === plan.id)}
                  className={`w-full py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                    isCurrentPlan
                      ? 'bg-white/10 text-gray-400 cursor-not-allowed'
                      : plan.popular
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {isUpgrading && selectedPlan === plan.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : isCurrentPlan ? (
                    'Current Plan'
                  ) : (
                    <>
                      {plan.price > (currentPlan?.price || 0) ? 'Upgrade' : 'Downgrade'} to {plan.name}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Method & Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Method */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Payment Method
          </h3>
          
          {currentPlan.price === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 mb-4">No payment method required for Free plan</p>
              <button
                onClick={() => handleUpgrade('pro')}
                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
              >
                Add payment method to upgrade →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="w-12 h-8 bg-gradient-to-r from-blue-600 to-blue-400 rounded flex items-center justify-center">
                  <span className="text-white text-xs font-bold">VISA</span>
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">•••• •••• •••• 4242</p>
                  <p className="text-gray-400 text-sm">Expires 12/2027</p>
                </div>
                <button className="text-blue-400 hover:text-blue-300 text-sm">
                  Edit
                </button>
              </div>
              
              <button className="w-full py-2 border border-dashed border-white/20 rounded-lg text-gray-400 hover:text-white hover:border-white/40 transition flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />
                Add new payment method
              </button>
            </div>
          )}
        </div>

        {/* Billing History */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Billing History
          </h3>
          
          {MOCK_INVOICES.length === 0 || currentPlan.price === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No invoices yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {MOCK_INVOICES.map((invoice) => (
                <div 
                  key={invoice.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center">
                      <FileText className="w-4 h-4 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{invoice.id}</p>
                      <p className="text-gray-400 text-xs">{formatDate(invoice.date)} • {invoice.plan}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-white font-medium">${invoice.amount}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      invoice.status === 'paid' 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {invoice.status}
                    </span>
                    <button className="text-gray-400 hover:text-white transition">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              
              <button className="w-full py-2 text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center justify-center gap-1">
                View all invoices
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Help Section */}
      <div className="mt-8 bg-white/5 rounded-xl p-6 border border-white/10">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-white font-medium mb-1">Need help with billing?</h3>
            <p className="text-gray-400 text-sm mb-3">
              If you have any questions about your subscription or billing, our support team is here to help.
            </p>
            <a 
              href="mailto:support@layout-ai.com.au"
              className="text-blue-400 hover:text-blue-300 text-sm font-medium inline-flex items-center gap-1"
            >
              Contact Support
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
