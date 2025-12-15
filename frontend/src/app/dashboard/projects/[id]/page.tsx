'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, CreditCard, FileText } from 'lucide-react';
import dynamic from 'next/dynamic';
import LoadingSpinner from '@/components/LoadingSpinner';

// Lazy load heavy components
const FloorPlanCanvas = dynamic(
  () => import('@/components/FloorPlanCanvas'),
  { 
    loading: () => <LoadingSpinner message="Loading floor plan visualization..." />,
    ssr: false  // Don't render on server (canvas requires browser)
  }
);

const PricingModal = dynamic(
  () => import('@/components/PricingModal'),
  {
    loading: () => <LoadingSpinner message="Loading pricing options..." />,
    ssr: false
  }
);

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = parseInt(params.id as string);

  const [project, setProject] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPricing, setShowPricing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);

  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  const loadProjectData = async () => {
    setLoading(true);
    try {
      // Load project and plans in parallel
      const [projectRes, plansRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}?user_id=1`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/plans/${projectId}/plans?user_id=1`)
      ]);

      if (projectRes.ok) {
        const projectData = await projectRes.json();
        setProject(projectData);
      }

      if (plansRes.ok) {
        const plansData = await plansRes.json();
        setPlans(plansData);
        if (plansData.length > 0) {
          setSelectedPlan(plansData[0]);
        }
      }
    } catch (error) {
      console.error('Error loading project data:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (planId: number) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/plans/${planId}/download/pdf?user_id=1`
      );
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `floor_plan_${planId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Loading project..." />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-600 mb-4">Project not found</p>
          <button 
            onClick={() => router.push('/dashboard/projects')} 
            className="text-blue-600 hover:underline"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <button 
            onClick={() => router.push('/dashboard/projects')} 
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Projects
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
              <p className="text-gray-600 mt-1">
                {project.land_width}m × {project.land_depth}m • 
                {' '}{project.bedrooms} bed • 
                {' '}{project.bathrooms} bath
              </p>
            </div>
            
            {plans.length === 0 && project.status !== 'completed' && (
              <button
                onClick={() => setShowPricing(true)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                Generate Plans
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {plans.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border-2 border-dashed border-gray-300">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No floor plans yet</h3>
            <p className="text-gray-600 mb-6">
              Purchase a plan to generate floor plan options for this project
            </p>
            <button
              onClick={() => setShowPricing(true)}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
            >
              Choose Plan
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Plan Variants List */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Floor Plan Options</h2>
              
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className={`
                    bg-white rounded-lg p-4 border-2 cursor-pointer transition
                    ${selectedPlan?.id === plan.id 
                      ? 'border-blue-600 shadow-md' 
                      : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Variant {plan.variant_number}</h3>
                    <span className="text-sm text-gray-500">{plan.total_area}m²</span>
                  </div>
                  
                  <button
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      downloadPDF(plan.id); 
                    }}
                    className="w-full mt-2 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 text-sm flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                </div>
              ))}
            </div>

            {/* Floor Plan Visualization - Lazy Loaded */}
            <div className="lg:col-span-2">
              {selectedPlan && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    Variant {selectedPlan.variant_number} - Floor Plan
                  </h2>
                  {/* This component is lazy loaded */}
                  <FloorPlanCanvas data={JSON.parse(selectedPlan.layout_data)} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pricing Modal - Lazy Loaded */}
      {showPricing && (
        <PricingModal 
          projectId={projectId} 
          onClose={() => setShowPricing(false)} 
        />
      )}
    </div>
  );
}