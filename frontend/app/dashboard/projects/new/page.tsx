// frontend/app/dashboard/projects/new/page.tsx
// New project creation wizard with location fields

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Upload, Home, Check, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Questionnaire from '@/components/Questionnaire';
import api from '@/lib/api';

type Step = 'details' | 'upload' | 'questionnaire';

// Australian states
const AUSTRALIAN_STATES = [
  { value: 'NSW', label: 'New South Wales' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'SA', label: 'South Australia' },
  { value: 'WA', label: 'Western Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'ACT', label: 'Australian Capital Territory' },
  { value: 'NT', label: 'Northern Territory' },
];

interface ProjectData {
  name: string;
  lot_dp: string;
  street_address: string;
  state: string;
  postcode: string;
  land_width: string;
  land_depth: string;
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
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  
  const [projectData, setProjectData] = useState<ProjectData>({
    name: '',
    lot_dp: '',
    street_address: '',
    state: '',
    postcode: '',
    land_width: '',
    land_depth: '',
    contourFile: null,
    surveyFile: null,
  });

  const steps: { id: Step; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'upload', label: 'Files' },
    { id: 'questionnaire', label: 'Requirements' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  // Validate Australian postcode (4 digits)
  const validatePostcode = (postcode: string): boolean => {
    return /^\d{4}$/.test(postcode);
  };

  const handlePostcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4); // Only digits, max 4
    setProjectData(prev => ({ ...prev, postcode: value }));
    
    if (value.length === 4) {
      setPostcodeError(null);
    } else if (value.length > 0) {
      setPostcodeError('Postcode must be 4 digits');
    }
  };

  const goToNextStep = () => {
    if (currentStep === 'details') {
      // Validate mandatory fields
      if (!projectData.state) {
        setError('Please select a state');
        return;
      }
      if (!validatePostcode(projectData.postcode)) {
        setPostcodeError('Please enter a valid 4-digit Australian postcode');
        return;
      }
    }
    
    setError(null);
    setPostcodeError(null);
    
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
    return (
      projectData.name.trim().length > 0 &&
      projectData.state.length > 0 &&
      validatePostcode(projectData.postcode) &&
      parseFloat(projectData.land_width) > 0 &&
      parseFloat(projectData.land_depth) > 0
    );
  };

  const handleQuestionnaireComplete = async (questionnaireData: QuestionnaireData) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const landWidth = parseFloat(projectData.land_width);
      const landDepth = parseFloat(projectData.land_depth);
      
      const project = await api.createProject({
        name: projectData.name,
        
        // Location details
        lot_dp: projectData.lot_dp || undefined,
        street_address: projectData.street_address || undefined,
        state: projectData.state,
        postcode: projectData.postcode,
        
        // Land details
        land_width: landWidth,
        land_depth: landDepth,
        land_area: landWidth * landDepth,
        
        // Building requirements
        bedrooms: questionnaireData.bedrooms,
        bathrooms: questionnaireData.bathrooms,
        living_areas: questionnaireData.living_areas,
        garage_spaces: questionnaireData.garage_spaces,
        storeys: questionnaireData.storeys,
        
        // Style preferences
        style: questionnaireData.style,
        open_plan: questionnaireData.open_plan,
        outdoor_entertainment: questionnaireData.outdoor_entertainment,
        home_office: questionnaireData.home_office,
      });
      
      console.log('Project created:', project);
      router.push(`/dashboard/projects?success=created&id=${project.id}`);
      
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err instanceof Error ? err.message : 'Failed to create project. Please try again.');
      setIsSubmitting(false);
    }
  };

  const projectDetailsForReview = {
    name: projectData.name,
    land_width: parseFloat(projectData.land_width) || 0,
    land_depth: parseFloat(projectData.land_depth) || 0,
    lot_dp: projectData.lot_dp || undefined,
    street_address: projectData.street_address || undefined,
    state: projectData.state,
    postcode: projectData.postcode,
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
            
            <div className="space-y-5">
              {/* Project Name */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Project Name <span className="text-red-400">*</span>
                </label>
                <input 
                  type="text" 
                  value={projectData.name} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, name: e.target.value }))} 
                  placeholder="e.g., Smith Family Home" 
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" 
                />
              </div>

              {/* Lot/DP (Optional) */}
              <div>
                <label className="block text-sm text-gray-300 mb-2 flex items-center gap-1">
                  Lot#/DP <span className="text-gray-500">(Optional)</span>
                  <Info className="w-4 h-4 text-gray-500" />
                </label>
                <input 
                  type="text" 
                  value={projectData.lot_dp} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, lot_dp: e.target.value }))}
                  placeholder="e.g., 1142/DP214682" 
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-gray-500 text-xs mt-1">
                  Land title reference from your property documents
                </p>
              </div>

              {/* Street Address (Optional) */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Street Address <span className="text-gray-500">(Optional)</span>
                </label>
                <input 
                  type="text" 
                  value={projectData.street_address} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, street_address: e.target.value }))}
                  placeholder="e.g., 123 Main Street, Suburb" 
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* State and Postcode Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* State (Mandatory) */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    State <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={projectData.state}
                    onChange={(e) => setProjectData(prev => ({ ...prev, state: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-blue-500 focus:outline-none appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-slate-800">Select State</option>
                    {AUSTRALIAN_STATES.map((state) => (
                      <option key={state.value} value={state.value} className="bg-slate-800">
                        {state.value} - {state.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Postcode (Mandatory) */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    Postcode <span className="text-red-400">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={projectData.postcode} 
                    onChange={handlePostcodeChange}
                    placeholder="e.g., 2000" 
                    maxLength={4}
                    className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white placeholder-gray-500 focus:outline-none ${
                      postcodeError ? 'border-red-500' : 'border-white/10 focus:border-blue-500'
                    }`}
                  />
                  {postcodeError && (
                    <p className="text-red-400 text-xs mt-1">{postcodeError}</p>
                  )}
                </div>
              </div>
              
              {/* Land Dimensions */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    Land Width (m) <span className="text-red-400">*</span>
                  </label>
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
                  <label className="block text-sm text-gray-300 mb-2">
                    Land Depth (m) <span className="text-red-400">*</span>
                  </label>
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

              {/* Land Area Display */}
              {projectData.land_width && projectData.land_depth && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <span className="text-blue-400 text-sm">
                    Total Land Area: <strong>{(parseFloat(projectData.land_width) * parseFloat(projectData.land_depth)).toFixed(0)} m²</strong>
                  </span>
                </div>
              )}
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
              projectDetails={projectDetailsForReview}
              isSubmitting={isSubmitting}
            />
          </div>
        )}
      </div>
    </div>
  );
}
