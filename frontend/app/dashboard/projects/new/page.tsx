// frontend/app/dashboard/projects/new/page.tsx
// New project creation wizard - 4 steps with AI generation page

'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Upload, Home, Check, Info, X, FileText, Sparkles, Cpu, Layers, Wand2, Clock, Shield, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Questionnaire from '@/components/Questionnaire';
import api from '@/lib/api';
import { AUSTRALIAN_STATES, lookupCouncil, isValidAustralianPostcode } from '@/lib/australianCouncils';

type Step = 'details' | 'upload' | 'questionnaire' | 'generate';

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

interface CreatedProject {
  id: number;
  name: string;
}

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [currentStep, setCurrentStep] = useState<Step>('details');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<CreatedProject | null>(null);
  
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
  });

  const [questionnaireData, setQuestionnaireData] = useState<QuestionnaireData | null>(null);

  const steps: { id: Step; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'upload', label: 'Files' },
    { id: 'questionnaire', label: 'Requirements' },
    { id: 'generate', label: 'Generate' },
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
    const state = e.target.value;
    let council = '';
    if (state && projectData.postcode.length === 4) {
      council = lookupCouncil(state, projectData.postcode);
    }
    setProjectData(prev => ({ ...prev, state, council }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.dwg', '.dxf'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
        setError('Please upload a PDF, PNG, JPG, DWG, or DXF file');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        return;
      }
      setProjectData(prev => ({ ...prev, contourFile: file }));
      setError(null);
    }
  };

  const handleRemoveFile = () => {
    setProjectData(prev => ({ ...prev, contourFile: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const goToNextStep = () => {
    if (currentStep === 'details') {
      if (!projectData.state) { setError('Please select a state'); return; }
      if (!projectData.suburb.trim()) { setError('Please enter a suburb'); return; }
      if (!isValidAustralianPostcode(projectData.postcode)) { setPostcodeError('Please enter a valid 4-digit postcode'); return; }
    }
    setError(null);
    setPostcodeError(null);
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) setCurrentStep(steps[nextIndex].id);
  };

  const goToPrevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) setCurrentStep(steps[prevIndex].id);
  };

  const isStep1Valid = () => {
    return (
      projectData.name.trim().length > 0 &&
      projectData.suburb.trim().length > 0 &&
      projectData.state.length > 0 &&
      isValidAustralianPostcode(projectData.postcode) &&
      parseFloat(projectData.land_width) > 0 &&
      parseFloat(projectData.land_depth) > 0
    );
  };

  // Save project (Step 3) - doesn't generate yet
  const handleSaveProject = async (qData: QuestionnaireData) => {
    setIsSubmitting(true);
    setError(null);
    setQuestionnaireData(qData);
    
    try {
      const landWidth = parseFloat(projectData.land_width);
      const landDepth = parseFloat(projectData.land_depth);
      
      let contourPlanUrl: string | undefined;
      if (projectData.contourFile && user) {
        try {
          contourPlanUrl = await api.uploadContourFile(
            projectData.contourFile,
            user?.name || user?.email || 'unknown',
            projectData.name
          );
        } catch (uploadErr) {
          console.error('Error uploading contour file:', uploadErr);
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
      
      setCreatedProject({ id: project.id, name: project.name });
      setCurrentStep('generate');
      
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err instanceof Error ? err.message : 'Failed to save project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate floor plans (Step 4)
  const handleGenerateFloorPlans = async () => {
    if (!createdProject) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      await api.generateFloorPlans(createdProject.id);
      router.push(`/dashboard/projects/${createdProject.id}?generating=true`);
    } catch (err) {
      console.error('Error generating floor plans:', err);
      setError(err instanceof Error ? err.message : 'Failed to start generation. Please try again.');
      setIsGenerating(false);
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

      {/* Step Indicator - Now 4 steps */}
      <div className="mb-8 flex items-center justify-between max-w-3xl">
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
              <div className={`w-12 md:w-20 h-1 mx-1 md:mx-2 rounded transition ${
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

              {/* Lot/DP */}
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
              </div>

              {/* Street Address */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Street Address <span className="text-gray-500">(Optional)</span>
                </label>
                <input 
                  type="text" 
                  value={projectData.street_address} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, street_address: e.target.value }))}
                  placeholder="e.g., 38 Lacunar Street" 
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Suburb (Mandatory) */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Suburb <span className="text-red-400">*</span>
                </label>
                <input 
                  type="text" 
                  value={projectData.suburb} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, suburb: e.target.value }))}
                  placeholder="e.g., Box Hill" 
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* State and Postcode */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    State <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={projectData.state}
                    onChange={handleStateChange}
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
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    Postcode <span className="text-red-400">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={projectData.postcode} 
                    onChange={handlePostcodeChange}
                    placeholder="e.g., 2765" 
                    maxLength={4}
                    className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white placeholder-gray-500 focus:outline-none ${
                      postcodeError ? 'border-red-500' : 'border-white/10 focus:border-blue-500'
                    }`}
                  />
                  {postcodeError && <p className="text-red-400 text-xs mt-1">{postcodeError}</p>}
                </div>
              </div>

              {/* Council */}
              {projectData.council && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                  <span className="text-green-400 text-sm flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Council: <strong>{projectData.council}</strong>
                  </span>
                </div>
              )}
              
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
              <Upload className="w-5 h-5 text-blue-400" /> Upload Contour Plan (Optional)
            </h2>
            
            <p className="text-gray-400 mb-6">
              Upload a contour plan or survey report to help generate more accurate floor plans.
            </p>
            
            {!projectData.contourFile ? (
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-white/20 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition">
                <Upload className="w-10 h-10 text-gray-400 mb-3" />
                <span className="text-gray-300 text-sm font-medium">Click to upload contour plan</span>
                <span className="text-gray-500 text-xs mt-2">PDF, PNG, JPG, DWG, DXF (max 50MB)</span>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="hidden" 
                  accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf"
                  onChange={handleFileSelect}
                />
              </label>
            ) : (
              <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-4">
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
                  <button onClick={handleRemoveFile} className="p-2 hover:bg-white/10 rounded-lg transition">
                    <X className="w-5 h-5 text-gray-400 hover:text-red-400" />
                  </button>
                </div>
              </div>
            )}
            
            <div className="flex justify-between mt-6">
              <button onClick={goToPrevStep} className="bg-white/10 text-white px-6 py-3 rounded-lg hover:bg-white/20 flex items-center gap-2 transition">
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
              <button onClick={goToNextStep} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition">
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Questionnaire - Now saves project instead of generating */}
        {currentStep === 'questionnaire' && (
          <div className="bg-white rounded-xl shadow-xl overflow-hidden">
            <Questionnaire 
              onComplete={handleSaveProject}
              onCancel={goToPrevStep}
              projectDetails={projectDetailsForReview}
              isSubmitting={isSubmitting}
              submitButtonText="Save Project"
            />
          </div>
        )}

        {/* Step 4: AI Generation Page */}
        {currentStep === 'generate' && createdProject && (
          <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 rounded-xl p-8 border border-blue-500/20">
            {/* Success Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Project Saved Successfully!</h2>
              <p className="text-gray-400">"{createdProject.name}" is ready for AI floor plan generation</p>
            </div>

            {/* AI Features Showcase */}
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Cpu className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-white font-semibold mb-1">AI-Powered</h3>
                <p className="text-gray-400 text-sm">Advanced algorithms analyze your requirements</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Layers className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-white font-semibold mb-1">Multiple Variants</h3>
                <p className="text-gray-400 text-sm">Get 3 unique floor plan options</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-white font-semibold mb-1">NCC Compliant</h3>
                <p className="text-gray-400 text-sm">Meets Australian building standards</p>
              </div>
            </div>

            {/* Animated Preview */}
            <div className="relative bg-slate-800/50 rounded-xl p-6 mb-8 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 animate-pulse" />
              <div className="relative flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="w-24 h-24 bg-white/10 rounded-lg flex items-center justify-center mb-2 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '2s' }}>
                    <Home className="w-12 h-12 text-blue-400" />
                  </div>
                  <span className="text-gray-400 text-xs">Your Requirements</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-yellow-400 animate-pulse" />
                  <ArrowRight className="w-6 h-6 text-gray-400" />
                  <Sparkles className="w-6 h-6 text-yellow-400 animate-pulse" style={{ animationDelay: '500ms' }} />
                </div>
                <div className="text-center">
                  <div className="w-24 h-24 bg-white/10 rounded-lg flex items-center justify-center mb-2 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '2s' }}>
                    <Wand2 className="w-12 h-12 text-purple-400" />
                  </div>
                  <span className="text-gray-400 text-xs">AI Magic</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-yellow-400 animate-pulse" style={{ animationDelay: '250ms' }} />
                  <ArrowRight className="w-6 h-6 text-gray-400" />
                  <Sparkles className="w-6 h-6 text-yellow-400 animate-pulse" style={{ animationDelay: '750ms' }} />
                </div>
                <div className="text-center">
                  <div className="w-24 h-24 bg-white/10 rounded-lg flex items-center justify-center mb-2 animate-bounce" style={{ animationDelay: '600ms', animationDuration: '2s' }}>
                    <Layers className="w-12 h-12 text-green-400" />
                  </div>
                  <span className="text-gray-400 text-xs">Floor Plans</span>
                </div>
              </div>
            </div>

            {/* What to Expect */}
            <div className="bg-white/5 rounded-lg p-4 mb-8">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                What to Expect
              </h3>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>3 unique floor plan variations tailored to your land and requirements</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Optimized room layouts based on your bedroom, bathroom, and living area preferences</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Compliance checks for Australian building codes and council requirements</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Generation typically takes 2-5 minutes depending on complexity</span>
                </li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => router.push('/dashboard/projects')}
                className="flex-1 bg-white/10 text-white px-6 py-4 rounded-lg hover:bg-white/20 transition font-medium"
              >
                Generate Later
              </button>
              <button 
                onClick={handleGenerateFloorPlans}
                disabled={isGenerating}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-lg hover:from-blue-700 hover:to-purple-700 transition font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Starting Generation...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Floor Plans Now
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
