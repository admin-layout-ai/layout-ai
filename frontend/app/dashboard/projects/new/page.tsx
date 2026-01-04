// frontend/app/dashboard/projects/new/page.tsx
// New project creation wizard - 3 steps only, questionnaire handles review & submit

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Upload, MapPin, Home, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Questionnaire from '@/components/Questionnaire';
import api from '@/lib/api';

type Step = 'details' | 'upload' | 'questionnaire';

interface ProjectData {
  name: string;
  land_width: string;
  land_depth: string;
  address: string;
  council: string;
  contourFile: File | null;
  surveyFile: File | null;
}

interface QuestionnaireData {
  bedrooms: number;
  bathrooms: number;
  living_areas: number;
  garage_spaces: number;
  storeys: number;
  style: string;
  open_plan: boolean;
  outdoor_entertainment: boolean;
  home_office: boolean;
}

export default function NewProjectPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  
  const [currentStep, setCurrentStep] = useState<Step>('details');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [projectData, setProjectData] = useState<ProjectData>({
    name: '',
    land_width: '',
    land_depth: '',
    address: '',
    council: '',
    contourFile: null,
    surveyFile: null,
  });

  // Only 3 steps now
  const steps: { id: Step; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'upload', label: 'Files' },
    { id: 'questionnaire', label: 'Requirements' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  const goToNextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const goToPrevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  const isStep1Valid = () => {
    return projectData.name.trim().length > 0 && 
           parseFloat(projectData.land_width) > 0 && 
           parseFloat(projectData.land_depth) > 0;
  };

  // Called when questionnaire is completed (user clicks "Generate Floor Plans")
  const handleQuestionnaireComplete = async (questionnaireData: QuestionnaireData) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const landWidth = parseFloat(projectData.land_width);
      const landDepth = parseFloat(projectData.land_depth);
      
      // Create project with field names matching the DATABASE columns
      const project = await api.createProject({
        name: projectData.name,
        
        // Land details - matches database columns exactly
        land_width: landWidth,
        land_depth: landDepth,
        land_area: landWidth * landDepth,
        
        // Building requirements - matches database columns exactly
        bedrooms: questionnaireData.bedrooms,
        bathrooms: questionnaireData.bathrooms,
        living_areas: questionnaireData.living_areas,
        garage_spaces: questionnaireData.garage_spaces,
        storeys: questionnaireData.storeys,
        
        // Style preferences - matches database columns exactly
        style: questionnaireData.style,
        open_plan: questionnaireData.open_plan,
        outdoor_entertainment: questionnaireData.outdoor_entertainment,
        home_office: questionnaireData.home_office,
        
        // Location
        council: projectData.council || undefined,
      });
      
      console.log('Project created:', project);
      router.push(`/dashboard/projects?success=created&id=${project.id}`);
      
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err instanceof Error ? err.message : 'Failed to create project. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Project details to pass to Questionnaire for the review step
  const projectDetailsForReview = {
    name: projectData.name,
    land_width: parseFloat(projectData.land_width) || 0,
    land_depth: parseFloat(projectData.land_depth) || 0,
    address: projectData.address || undefined,
    council: projectData.council || undefined,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
      {/* Header */}
      <div className="mb-8">
        <button 
          onClick={() => router.push('/dashboard/projects')} 
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-5 h-5" /> Back to Projects
        </button>
        <h1 className="text-2xl font-bold text-white">Create New Project</h1>
      </div>

      {/* Step Indicator - Now only 3 steps */}
      <div className="mb-8 flex items-center justify-between max-w-2xl">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div 
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition ${
                index <= currentStepIndex 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white/10 text-gray-400'
              }`}
            >
              {index < currentStepIndex ? <Check className="w-5 h-5" /> : index + 1}
            </div>
            {index < steps.length - 1 && (
              <div className={`w-16 h-1 mx-2 rounded transition ${
                index < currentStepIndex ? 'bg-blue-600' : 'bg-white/10'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-2xl mb-6 bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="max-w-2xl">
        {/* Step 1: Project Details */}
        {currentStep === 'details' && (
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <Home className="w-5 h-5 text-blue-400" /> Project Details
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Project Name *</label>
                <input 
                  type="text" 
                  value={projectData.name} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, name: e.target.value }))} 
                  placeholder="e.g., Smith Family Home" 
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Land Width (m) *</label>
                  <input 
                    type="number" 
                    value={projectData.land_width} 
                    onChange={(e) => setProjectData(prev => ({ ...prev, land_width: e.target.value }))} 
                    placeholder="15" 
                    min="1"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Land Depth (m) *</label>
                  <input 
                    type="number" 
                    value={projectData.land_depth} 
                    onChange={(e) => setProjectData(prev => ({ ...prev, land_depth: e.target.value }))} 
                    placeholder="30" 
                    min="1"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" 
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  <MapPin className="w-4 h-4 inline mr-1" /> Address (optional)
                </label>
                <input 
                  type="text" 
                  value={projectData.address} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, address: e.target.value }))} 
                  placeholder="123 Main St, Sydney NSW" 
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" 
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-300 mb-2">Local Council (optional)</label>
                <input 
                  type="text" 
                  value={projectData.council} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, council: e.target.value }))} 
                  placeholder="e.g., City of Sydney" 
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" 
                />
              </div>
            </div>
            
            <div className="flex justify-end mt-6">
              <button 
                onClick={goToNextStep} 
                disabled={!isStep1Valid()} 
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: File Upload */}
        {currentStep === 'upload' && (
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-400" /> Upload Files (Optional)
            </h2>
            
            <p className="text-gray-400 mb-6">
              Upload contour plans or survey reports to help generate more accurate floor plans.
            </p>
            
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/20 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition">
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-gray-400 text-sm">Click to upload files</span>
              <span className="text-gray-500 text-xs mt-1">PDF, DWG, DXF, PNG, JPG</span>
              <input type="file" className="hidden" accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg" />
            </label>
            
            <div className="flex justify-between mt-6">
              <button 
                onClick={goToPrevStep} 
                className="bg-white/10 text-white px-6 py-3 rounded-lg hover:bg-white/20 flex items-center gap-2 transition"
              >
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
              <button 
                onClick={goToNextStep} 
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Questionnaire (includes Review) */}
        {currentStep === 'questionnaire' && (
          <div className="bg-white rounded-xl shadow-xl overflow-hidden">
            <Questionnaire 
              onComplete={handleQuestionnaireComplete}
              onCancel={goToPrevStep}
              projectDetails={projectDetailsForReview}
              isSubmitting={isSubmitting}
            />
          </div>
        )}
      </div>
    </div>
  );
}
