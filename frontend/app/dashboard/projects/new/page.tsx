// frontend/app/dashboard/projects/new/page.tsx
// New project creation wizard - compact layout with multiple fields per row

'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Upload, Home, Check, Info, X, FileText, BookOpen } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Questionnaire from '@/components/Questionnaire';
import api from '@/lib/api';
import { AUSTRALIAN_STATES, lookupCouncil } from '@/lib/australianCouncils';

type Step = 'details' | 'upload' | 'questionnaire';

interface ProjectData {
  name: string;
  lot_dp: string;
  street_address: string;
  suburb: string;
  state: string;
  postcode: string;
  council: string;
  land_width: string;
  land_depth: string;
  contourFile: File | null;
  developerGuidelinesFile: File | null;
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
  const { user } = useAuth();
  const contourFileInputRef = useRef<HTMLInputElement>(null);
  const guidelinesFileInputRef = useRef<HTMLInputElement>(null);
  
  const [currentStep, setCurrentStep] = useState<Step>('details');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  
  const [projectData, setProjectData] = useState<ProjectData>({
    name: '',
    lot_dp: '',
    street_address: '',
    suburb: '',
    state: '',
    postcode: '',
    council: '',
    land_width: '',
    land_depth: '',
    contourFile: null,
    developerGuidelinesFile: null,
  });

  const [questionnaireData, setQuestionnaireData] = useState<QuestionnaireData | null>(null);

  const steps: { id: Step; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'upload', label: 'Files' },
    { id: 'questionnaire', label: 'Requirements' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  const handlePostcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    let council = '';
    if (value.length === 4 && projectData.state) {
      council = lookupCouncil(projectData.state, value);
    }
    setProjectData(prev => ({ ...prev, postcode: value, council }));
    setPostcodeError(value.length === 4 || value.length === 0 ? null : 'Postcode must be 4 digits');
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newState = e.target.value;
    let council = '';
    if (projectData.postcode.length === 4 && newState) {
      council = lookupCouncil(newState, projectData.postcode);
    }
    setProjectData(prev => ({ ...prev, state: newState, council }));
  };

  const handleContourFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        return;
      }
      setProjectData(prev => ({ ...prev, contourFile: file }));
      setError(null);
    }
  };

  const handleGuidelinesFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        return;
      }
      setProjectData(prev => ({ ...prev, developerGuidelinesFile: file }));
      setError(null);
    }
  };

  const handleRemoveContourFile = () => {
    setProjectData(prev => ({ ...prev, contourFile: null }));
    if (contourFileInputRef.current) {
      contourFileInputRef.current.value = '';
    }
  };

  const handleRemoveGuidelinesFile = () => {
    setProjectData(prev => ({ ...prev, developerGuidelinesFile: null }));
    if (guidelinesFileInputRef.current) {
      guidelinesFileInputRef.current.value = '';
    }
  };

  const isStep1Valid = () => {
    return (
      projectData.name.trim() !== '' &&
      projectData.suburb.trim() !== '' &&
      projectData.state !== '' &&
      projectData.postcode.length === 4 &&
      !postcodeError &&
      parseFloat(projectData.land_width) > 0 &&
      parseFloat(projectData.land_depth) > 0
    );
  };

  const goToNextStep = () => {
    if (currentStep === 'details') setCurrentStep('upload');
    else if (currentStep === 'upload') setCurrentStep('questionnaire');
  };

  const goToPrevStep = () => {
    if (currentStep === 'questionnaire') setCurrentStep('upload');
    else if (currentStep === 'upload') setCurrentStep('details');
  };

  const handleSaveProject = async (qData: QuestionnaireData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const landWidth = parseFloat(projectData.land_width);
      const landDepth = parseFloat(projectData.land_depth);
      const userName = user?.name || user?.email || 'unknown';
      
      // Upload contour file if present
      let contourPlanUrl: string | undefined;
      if (projectData.contourFile) {
        try {
          contourPlanUrl = await api.uploadContourFile(
            projectData.contourFile,
            userName,
            projectData.name
          );
        } catch (uploadErr) {
          console.error('Error uploading contour file:', uploadErr);
        }
      }

      // Upload developer guidelines file if present
      let developerGuidelinesUrl: string | undefined;
      if (projectData.developerGuidelinesFile) {
        try {
          developerGuidelinesUrl = await api.uploadDeveloperGuidelines(
            projectData.developerGuidelinesFile,
            userName,
            projectData.name
          );
        } catch (uploadErr) {
          console.error('Error uploading developer guidelines:', uploadErr);
        }
      }
      
      const project = await api.createProject({
        name: projectData.name,
        lot_dp: projectData.lot_dp || undefined,
        street_address: projectData.street_address || undefined,
        suburb: projectData.suburb,
        state: projectData.state,
        postcode: projectData.postcode,
        council: projectData.council || undefined,
        land_width: landWidth,
        land_depth: landDepth,
        land_area: landWidth * landDepth,
        contour_plan_url: contourPlanUrl,
        developer_guidelines_url: developerGuidelinesUrl,
        bedrooms: qData.bedrooms,
        bathrooms: qData.bathrooms,
        living_areas: qData.living_areas,
        garage_spaces: qData.garage_spaces,
        storeys: qData.storeys,
        style: qData.style,
        open_plan: qData.open_plan,
        outdoor_entertainment: qData.outdoor_entertainment,
        home_office: qData.home_office,
      });
      
      router.push(`/dashboard/projects/${project.id}`);
      
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err instanceof Error ? err.message : 'Failed to save project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const projectDetailsForReview = {
    name: projectData.name,
    land_width: parseFloat(projectData.land_width) || 0,
    land_depth: parseFloat(projectData.land_depth) || 0,
    lot_dp: projectData.lot_dp || undefined,
    street_address: projectData.street_address || undefined,
    suburb: projectData.suburb,
    state: projectData.state,
    postcode: projectData.postcode,
    council: projectData.council || undefined,
    contourFileName: projectData.contourFile?.name,
    developerGuidelinesFileName: projectData.developerGuidelinesFile?.name,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button 
            onClick={() => router.push('/dashboard/projects')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Projects
          </button>
          <h1 className="text-2xl font-bold text-white">Create New Project</h1>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center gap-2 ${index <= currentStepIndex ? 'text-blue-400' : 'text-gray-500'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index < currentStepIndex ? 'bg-blue-600 text-white' : 
                  index === currentStepIndex ? 'bg-blue-600 text-white' : 
                  'bg-white/10 text-gray-400'
                }`}>
                  {index < currentStepIndex ? <Check className="w-4 h-4" /> : index + 1}
                </div>
                <span className="hidden sm:inline">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-16 h-0.5 mx-2 ${index < currentStepIndex ? 'bg-blue-600' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Step 1: Project Details */}
        {currentStep === 'details' && (
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Home className="w-5 h-5 text-blue-400" /> Project Details
            </h2>

            {/* Row 1: Project Name & Lot/DP */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Project Name <span className="text-red-400">*</span>
                </label>
                <input 
                  type="text" 
                  value={projectData.name} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Smith Family Home" 
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Lot/DP Number <span className="text-gray-500 text-xs">(Optional)</span>
                </label>
                <input 
                  type="text" 
                  value={projectData.lot_dp} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, lot_dp: e.target.value }))}
                  placeholder="e.g., Lot 42 DP 123456" 
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Row 2: Street Address & Suburb */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Street Address <span className="text-gray-500 text-xs">(Optional)</span>
                </label>
                <input 
                  type="text" 
                  value={projectData.street_address} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, street_address: e.target.value }))}
                  placeholder="e.g., 38 Lacunar Street" 
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Suburb <span className="text-red-400">*</span>
                </label>
                <input 
                  type="text" 
                  value={projectData.suburb} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, suburb: e.target.value }))}
                  placeholder="e.g., Box Hill" 
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Row 3: State, Postcode, Land Width, Land Depth */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  State <span className="text-red-400">*</span>
                </label>
                <select
                  value={projectData.state}
                  onChange={handleStateChange}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:border-blue-500 focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="" className="bg-slate-800">Select</option>
                  {AUSTRALIAN_STATES.map((state) => (
                    <option key={state.value} value={state.value} className="bg-slate-800">
                      {state.value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Postcode <span className="text-red-400">*</span>
                </label>
                <input 
                  type="text" 
                  value={projectData.postcode} 
                  onChange={handlePostcodeChange}
                  placeholder="2765" 
                  maxLength={4}
                  className={`w-full px-3 py-2.5 bg-white/5 border rounded-lg text-white placeholder-gray-500 focus:outline-none ${
                    postcodeError ? 'border-red-500' : 'border-white/10 focus:border-blue-500'
                  }`}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Width (m) <span className="text-red-400">*</span>
                </label>
                <input 
                  type="number" 
                  value={projectData.land_width} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, land_width: e.target.value }))} 
                  placeholder="15" 
                  min="1"
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Depth (m) <span className="text-red-400">*</span>
                </label>
                <input 
                  type="number" 
                  value={projectData.land_depth} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, land_depth: e.target.value }))} 
                  placeholder="30" 
                  min="1"
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" 
                />
              </div>
            </div>

            {/* Info Row: Council & Area */}
            <div className="flex flex-wrap gap-3 mb-4">
              {postcodeError && (
                <div className="text-red-400 text-xs">{postcodeError}</div>
              )}
              {projectData.council && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                  <span className="text-green-400 text-sm flex items-center gap-1">
                    <Check className="w-4 h-4" /> Council: <strong>{projectData.council}</strong>
                  </span>
                </div>
              )}
              {projectData.land_width && projectData.land_depth && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                  <span className="text-blue-400 text-sm">
                    Area: <strong>{(parseFloat(projectData.land_width) * parseFloat(projectData.land_depth)).toFixed(0)} m²</strong>
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex justify-end">
              <button 
                onClick={goToNextStep} 
                disabled={!isStep1Valid()} 
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: File Upload */}
        {currentStep === 'upload' && (
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-2">Upload Files (Optional)</h2>
            <p className="text-gray-400 mb-6 text-sm">
              Upload supporting documents to help generate more accurate floor plans.
            </p>

            {/* Contour Plan Upload */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-400" /> Contour Plan / Survey Report
              </h3>
              
              {!projectData.contourFile ? (
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-white/20 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition">
                  <Upload className="w-6 h-6 text-gray-400 mb-1" />
                  <span className="text-gray-300 text-sm font-medium">Click to upload contour plan</span>
                  <span className="text-gray-500 text-xs mt-1">PDF, PNG, JPG, DWG, DXF (max 50MB)</span>
                  <input 
                    ref={contourFileInputRef}
                    type="file" 
                    className="hidden" 
                    accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf"
                    onChange={handleContourFileSelect}
                  />
                </label>
              ) : (
                <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-green-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">{projectData.contourFile.name}</p>
                        <p className="text-gray-400 text-xs">{(projectData.contourFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button onClick={handleRemoveContourFile} className="p-2 hover:bg-white/10 rounded-lg transition">
                      <X className="w-5 h-5 text-gray-400 hover:text-red-400" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Developer Guidelines Upload */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-purple-400" /> Developer Guidelines
              </h3>
              <p className="text-gray-400 mb-3 text-xs">
                Upload the developer&apos;s design guidelines or architectural requirements for this estate/subdivision.
              </p>
              
              {!projectData.developerGuidelinesFile ? (
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-white/20 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition">
                  <BookOpen className="w-6 h-6 text-gray-400 mb-1" />
                  <span className="text-gray-300 text-sm font-medium">Click to upload developer guidelines</span>
                  <span className="text-gray-500 text-xs mt-1">PDF (max 50MB)</span>
                  <input 
                    ref={guidelinesFileInputRef}
                    type="file" 
                    className="hidden" 
                    accept=".pdf"
                    onChange={handleGuidelinesFileSelect}
                  />
                </label>
              ) : (
                <div className="border border-purple-500/30 bg-purple-500/10 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">{projectData.developerGuidelinesFile.name}</p>
                        <p className="text-gray-400 text-xs">{(projectData.developerGuidelinesFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button onClick={handleRemoveGuidelinesFile} className="p-2 hover:bg-white/10 rounded-lg transition">
                      <X className="w-5 h-5 text-gray-400 hover:text-red-400" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-between mt-6">
              <button onClick={goToPrevStep} className="bg-white/10 text-white px-6 py-2.5 rounded-lg hover:bg-white/20 flex items-center gap-2 transition">
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
              <button onClick={goToNextStep} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition">
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Questionnaire */}
        {currentStep === 'questionnaire' && (
          <div className="bg-white rounded-xl shadow-xl overflow-hidden">
            <Questionnaire 
              onComplete={handleSaveProject}
              onCancel={goToPrevStep}
              projectDetails={projectDetailsForReview}
              isSubmitting={isSubmitting}
              submitButtonText="Save Requirements"
            />
          </div>
        )}
      </div>
    </div>
  );
}
