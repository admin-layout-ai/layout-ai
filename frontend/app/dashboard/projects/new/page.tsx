// frontend/app/dashboard/projects/new/page.tsx
// New project creation wizard with file upload

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Upload, MapPin, Home, FileText, X, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Questionnaire from '@/components/Questionnaire';

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
  const { getAccessToken } = useAuth();
  
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

  const handleSubmit = async () => {
    if (!questionnaireData) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const token = await getAccessToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      
      const createResponse = await fetch(`${apiUrl}/api/v1/projects/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: projectData.name,
          land_width: parseFloat(projectData.land_width),
          land_depth: parseFloat(projectData.land_depth),
          address: projectData.address || null,
          council: projectData.council || null,
        })
      });
      
      if (!createResponse.ok) {
        throw new Error('Failed to create project');
      }
      
      const project = await createResponse.json();
      
      await fetch(`${apiUrl}/api/v1/projects/${project.id}/questionnaire`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(questionnaireData)
      });
      
      router.push(`/dashboard/projects?id=${project.id}&success=created`);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
      <div className="mb-8">
        <button onClick={() => router.push('/dashboard/projects')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4">
          <ArrowLeft className="w-5 h-5" /> Back to Projects
        </button>
        <h1 className="text-2xl font-bold text-white">Create New Project</h1>
      </div>

      <div className="mb-8 flex items-center justify-between max-w-2xl">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${index <= currentStepIndex ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-400'}`}>
              {index < currentStepIndex ? <Check className="w-5 h-5" /> : index + 1}
            </div>
            {index < steps.length - 1 && <div className={`w-12 h-1 mx-2 rounded ${index < currentStepIndex ? 'bg-blue-600' : 'bg-white/10'}`} />}
          </div>
        ))}
      </div>

      {error && <div className="max-w-2xl mb-6 bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div>}

      <div className="max-w-2xl">
        {currentStep === 'details' && (
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2"><Home className="w-5 h-5 text-blue-400" /> Project Details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Project Name *</label>
                <input type="text" value={projectData.name} onChange={(e) => setProjectData(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Smith Family Home" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Land Width (m) *</label>
                  <input type="number" value={projectData.land_width} onChange={(e) => setProjectData(prev => ({ ...prev, land_width: e.target.value }))} placeholder="15" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Land Depth (m) *</label>
                  <input type="number" value={projectData.land_depth} onChange={(e) => setProjectData(prev => ({ ...prev, land_depth: e.target.value }))} placeholder="30" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2"><MapPin className="w-4 h-4 inline mr-1" /> Address (optional)</label>
                <input type="text" value={projectData.address} onChange={(e) => setProjectData(prev => ({ ...prev, address: e.target.value }))} placeholder="123 Main St, Sydney NSW" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500" />
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={goToNextStep} disabled={!isStep1Valid()} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">Continue <ArrowRight className="w-5 h-5" /></button>
            </div>
          </div>
        )}

        {currentStep === 'upload' && (
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2"><Upload className="w-5 h-5 text-blue-400" /> Upload Files (Optional)</h2>
            <p className="text-gray-400 mb-6">Upload contour plans or survey reports to help generate more accurate floor plans.</p>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/20 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10">
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-gray-400 text-sm">Click to upload files</span>
              <input type="file" className="hidden" accept=".pdf,.dwg,.dxf,.png,.jpg" />
            </label>
            <div className="flex justify-between mt-6">
              <button onClick={goToPrevStep} className="bg-white/10 text-white px-6 py-3 rounded-lg hover:bg-white/20 flex items-center gap-2"><ArrowLeft className="w-5 h-5" /> Back</button>
              <button onClick={goToNextStep} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2">Continue <ArrowRight className="w-5 h-5" /></button>
            </div>
          </div>
        )}

        {currentStep === 'questionnaire' && (
          <div className="bg-white rounded-xl shadow-xl">
            <Questionnaire onComplete={handleQuestionnaireComplete} onCancel={goToPrevStep} />
          </div>
        )}

        {currentStep === 'review' && questionnaireData && (
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2"><Check className="w-5 h-5 text-green-400" /> Review & Create</h2>
            <div className="space-y-4">
              <div className="bg-white/5 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-2">Project: {projectData.name}</h3>
                <p className="text-gray-400 text-sm">Land: {projectData.land_width}m × {projectData.land_depth}m</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-2">Requirements</h3>
                <p className="text-gray-400 text-sm">{questionnaireData.bedrooms} bed, {questionnaireData.bathrooms} bath, {questionnaireData.storeys} storey {questionnaireData.style}</p>
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={goToPrevStep} className="bg-white/10 text-white px-6 py-3 rounded-lg hover:bg-white/20 flex items-center gap-2"><ArrowLeft className="w-5 h-5" /> Back</button>
              <button onClick={handleSubmit} disabled={isSubmitting} className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-semibold">
                {isSubmitting ? 'Creating...' : 'Create Project'} <Check className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
