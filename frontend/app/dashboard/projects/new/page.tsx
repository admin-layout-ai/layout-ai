// frontend/app/dashboard/projects/new/page.tsx
// New project creation wizard - saves all requirements to backend

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Upload, MapPin, Home, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Questionnaire from '@/components/Questionnaire';
import api from '@/lib/api';

type Step = 'details' | 'upload' | 'questionnaire' | 'review';

interface ProjectData {
  name: string;
  land_width: string;
  land_depth: string;
  address: string;
  council: string;
  contourFile: File | null;
  surveyFile: File | null;
}

// Must match the Questionnaire component's QuestionnaireData type exactly
interface QuestionnaireData {
  bedrooms: number;
  bathrooms: number;
  living_areas: number;
  garage_spaces: number;
  storeys: number;  // 1 or 2 (number, not string)
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
  
  const [questionnaireData, setQuestionnaireData] = useState<QuestionnaireData | null>(null);

  const steps: { id: Step; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'upload', label: 'Files' },
    { id: 'questionnaire', label: 'Requirements' },
    { id: 'review', label: 'Review' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  const handleQuestionnaireComplete = (data: QuestionnaireData) => {
    setQuestionnaireData(data);
    setCurrentStep('review');
  };

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

  // Build features array from questionnaire boolean values
  const getFeatures = (data: QuestionnaireData): string[] => {
    const features: string[] = [];
    if (data.open_plan) features.push('Open Plan');
    if (data.home_office) features.push('Home Office');
    if (data.outdoor_entertainment) features.push('Outdoor Entertainment');
    return features;
  };

  const handleSubmit = async () => {
    if (!questionnaireData) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Calculate land size in square meters
      const landWidth = parseFloat(projectData.land_width);
      const landDepth = parseFloat(projectData.land_depth);
      const landSize = landWidth * landDepth;
      
      // Determine building type from storeys (1 = single, 2 = double)
      const buildingType = questionnaireData.storeys === 2 ? 'double_storey' : 'single_storey';
      
      // Build features array
      const features = getFeatures(questionnaireData);
      
      // Create project with all data
      const project = await api.createProject({
        name: projectData.name,
        description: projectData.address ? `Project at ${projectData.address}` : undefined,
        
        // Land information
        land_size: landSize,
        land_dimensions: {
          width: landWidth,
          depth: landDepth,
        },
        
        // Building requirements
        building_type: buildingType,
        num_bedrooms: questionnaireData.bedrooms,
        num_bathrooms: questionnaireData.bathrooms,
        num_living_areas: questionnaireData.living_areas,
        num_garages: questionnaireData.garage_spaces,
        
        // Style and features
        style: questionnaireData.style,
        features: features,
        
        // Full questionnaire data for reference
        questionnaire_data: {
          // Land details
          land_width: landWidth,
          land_depth: landDepth,
          land_size: landSize,
          address: projectData.address || null,
          council: projectData.council || null,
          
          // Building requirements
          bedrooms: questionnaireData.bedrooms,
          bathrooms: questionnaireData.bathrooms,
          living_areas: questionnaireData.living_areas,
          garage_spaces: questionnaireData.garage_spaces,
          storeys: questionnaireData.storeys,
          building_type: buildingType,
          
          // Style preferences
          style: questionnaireData.style,
          
          // Features
          open_plan: questionnaireData.open_plan,
          outdoor_entertainment: questionnaireData.outdoor_entertainment,
          home_office: questionnaireData.home_office,
          features: features,
        },
      });
      
      console.log('Project created:', project);
      
      // Redirect to project page or projects list
      router.push(`/dashboard/projects?success=created&id=${project.id}`);
      
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err instanceof Error ? err.message : 'Failed to create project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to get display text for storeys
  const getStoreysDisplay = (storeys: number) => {
    return storeys === 2 ? 'Double' : 'Single';
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

      {/* Step Indicator */}
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
              <div className={`w-12 h-1 mx-2 rounded transition ${
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

        {/* Step 3: Questionnaire */}
        {currentStep === 'questionnaire' && (
          <div className="bg-white rounded-xl shadow-xl overflow-hidden">
            <Questionnaire 
              onComplete={handleQuestionnaireComplete} 
              onCancel={goToPrevStep} 
            />
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 'review' && questionnaireData && (
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                Review Your Requirements
              </h2>
              <span className="text-sm text-gray-400">Step 3 of 3</span>
            </div>
            
            <p className="text-gray-400 mb-6">
              Confirm your selections before generating floor plans
            </p>
            
            {/* Project Summary */}
            <div className="bg-white/5 rounded-lg p-5 mb-4">
              <h3 className="font-semibold text-white mb-3">Project Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Name</span>
                  <p className="text-white font-medium">{projectData.name}</p>
                </div>
                <div>
                  <span className="text-gray-400">Land Size</span>
                  <p className="text-white font-medium">
                    {projectData.land_width}m × {projectData.land_depth}m 
                    ({(parseFloat(projectData.land_width) * parseFloat(projectData.land_depth)).toFixed(0)} m²)
                  </p>
                </div>
                {projectData.address && (
                  <div className="col-span-2">
                    <span className="text-gray-400">Address</span>
                    <p className="text-white font-medium">{projectData.address}</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Requirements Summary */}
            <div className="bg-white/5 rounded-lg p-5 mb-4">
              <h3 className="font-semibold text-white mb-4">Summary</h3>
              <div className="grid grid-cols-2 gap-y-4 text-sm">
                <div className="flex justify-between pr-4 border-r border-white/10">
                  <span className="text-gray-400">Bedrooms</span>
                  <span className="text-white font-semibold">{questionnaireData.bedrooms}</span>
                </div>
                <div className="flex justify-between pl-4">
                  <span className="text-gray-400">Bathrooms</span>
                  <span className="text-white font-semibold">{questionnaireData.bathrooms}</span>
                </div>
                <div className="flex justify-between pr-4 border-r border-white/10">
                  <span className="text-gray-400">Living Areas</span>
                  <span className="text-white font-semibold">{questionnaireData.living_areas}</span>
                </div>
                <div className="flex justify-between pl-4">
                  <span className="text-gray-400">Garage</span>
                  <span className="text-white font-semibold">{questionnaireData.garage_spaces} car</span>
                </div>
                <div className="flex justify-between pr-4 border-r border-white/10">
                  <span className="text-gray-400">Storeys</span>
                  <span className="text-white font-semibold">{getStoreysDisplay(questionnaireData.storeys)}</span>
                </div>
                <div className="flex justify-between pl-4">
                  <span className="text-gray-400">Style</span>
                  <span className="text-white font-semibold capitalize">{questionnaireData.style}</span>
                </div>
              </div>
              
              {/* Features */}
              {(questionnaireData.open_plan || questionnaireData.home_office || questionnaireData.outdoor_entertainment) && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <span className="text-gray-400 text-sm">Features:</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {questionnaireData.open_plan && (
                      <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm flex items-center gap-1">
                        <Check className="w-3 h-3" /> Open Plan
                      </span>
                    )}
                    {questionnaireData.home_office && (
                      <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm flex items-center gap-1">
                        <Check className="w-3 h-3" /> Home Office
                      </span>
                    )}
                    {questionnaireData.outdoor_entertainment && (
                      <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm flex items-center gap-1">
                        <Check className="w-3 h-3" /> Outdoor Entertainment
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="flex justify-between mt-6">
              <button 
                onClick={goToPrevStep} 
                disabled={isSubmitting}
                className="bg-white/10 text-white px-6 py-3 rounded-lg hover:bg-white/20 flex items-center gap-2 transition disabled:opacity-50"
              >
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
              <button 
                onClick={handleSubmit} 
                disabled={isSubmitting} 
                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold transition"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>Generate Floor Plans</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
