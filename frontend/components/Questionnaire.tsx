// frontend/components/Questionnaire.tsx
// Questionnaire with compact multi-column layout

'use client';

import { useState } from 'react';
import { Home, Bath, Sofa, Car, Building2, ArrowLeft, ArrowRight, Check, MapPin, FileText } from 'lucide-react';

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

interface ProjectDetails {
  name: string;
  land_width: number;
  land_depth: number;
  lot_dp?: string;
  street_address?: string;
  suburb: string;
  state: string;
  postcode: string;
  council?: string;
  contourFileName?: string;
}

interface QuestionnaireProps {
  onComplete: (data: QuestionnaireData) => void;
  onCancel?: () => void;
  projectDetails?: ProjectDetails;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function Questionnaire({ 
  onComplete, 
  onCancel, 
  projectDetails, 
  isSubmitting = false,
  submitButtonText = "Generate Floor Plans"
}: QuestionnaireProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<QuestionnaireData>({
    bedrooms: 3,
    bathrooms: 2,
    living_areas: 1,
    garage_spaces: 2,
    storeys: 1,
    style: 'modern',
    open_plan: true,
    outdoor_entertainment: false,
    home_office: false,
  });

  const totalSteps = 3;

  const handleNext = () => {
    if (step < totalSteps) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else if (onCancel) onCancel();
  };

  const handleSubmit = () => {
    onComplete(formData);
  };

  const SelectButton = ({ selected, onClick, children, compact = false }: { selected: boolean; onClick: () => void; children: React.ReactNode; compact?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      className={`${compact ? 'px-3 py-2 text-sm' : 'px-4 py-2.5'} rounded-lg border-2 font-medium transition-all ${
        selected 
          ? 'border-blue-600 bg-blue-50 text-blue-700' 
          : 'border-gray-200 text-gray-600 hover:border-blue-400'
      }`}
    >
      {children}
    </button>
  );

  const ToggleSwitch = ({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (checked: boolean) => void; description?: string }) => (
    <label className="flex items-center justify-between p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 transition">
      <div>
        <span className="font-medium text-gray-900 text-sm">{label}</span>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="relative">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
        <div className={`w-10 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
      </div>
    </label>
  );

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-2 flex-1 mx-1 rounded-full transition-colors ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Step {step} of {totalSteps}</span>
          <span className="text-gray-400">
            {step === 1 && 'Basic Requirements'}
            {step === 2 && 'Preferences'}
            {step === 3 && 'Review'}
          </span>
        </div>
      </div>

      {/* Step 1: Basic Requirements - Grid Layout */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Basic Requirements</h2>
            <p className="text-gray-600 text-sm">Tell us about your ideal home layout</p>
          </div>
          
          {/* Row 1: Bedrooms & Bathrooms */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Home className="w-4 h-4 text-blue-600" /> Bedrooms
              </label>
              <div className="flex gap-2">
                {[2, 3, 4, 5, 6].map((num) => (
                  <SelectButton key={num} selected={formData.bedrooms === num} onClick={() => setFormData({ ...formData, bedrooms: num })} compact>
                    {num}
                  </SelectButton>
                ))}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Bath className="w-4 h-4 text-blue-600" /> Bathrooms
              </label>
              <div className="flex gap-2 flex-wrap">
                {[1, 1.5, 2, 2.5, 3, 3.5].map((num) => (
                  <SelectButton key={num} selected={formData.bathrooms === num} onClick={() => setFormData({ ...formData, bathrooms: num })} compact>
                    {num}
                  </SelectButton>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Living Areas & Garage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Sofa className="w-4 h-4 text-blue-600" /> Living Areas
              </label>
              <div className="flex gap-2">
                {[1, 2, 3].map((num) => (
                  <SelectButton key={num} selected={formData.living_areas === num} onClick={() => setFormData({ ...formData, living_areas: num })} compact>
                    {num}
                  </SelectButton>
                ))}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Car className="w-4 h-4 text-blue-600" /> Garage Spaces
              </label>
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((num) => (
                  <SelectButton key={num} selected={formData.garage_spaces === num} onClick={() => setFormData({ ...formData, garage_spaces: num })} compact>
                    {num === 0 ? 'None' : num}
                  </SelectButton>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: Storeys */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Building2 className="w-4 h-4 text-blue-600" /> Number of Storeys
            </label>
            <div className="flex gap-2">
              {[1, 2].map((num) => (
                <SelectButton key={num} selected={formData.storeys === num} onClick={() => setFormData({ ...formData, storeys: num })}>
                  {num === 1 ? 'Single Storey' : 'Double Storey'}
                </SelectButton>
              ))}
            </div>
          </div>

          <div className="flex gap-4 pt-2">
            {onCancel && (
              <button type="button" onClick={onCancel} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium">
                <ArrowLeft className="w-4 h-4 inline mr-2" /> Back
              </button>
            )}
            <button type="button" onClick={handleNext} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2">
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preferences - Grid Layout */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Design Preferences</h2>
            <p className="text-gray-600 text-sm">Customize your home style and features</p>
          </div>
          
          {/* Design Style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Design Style</label>
            <select
              value={formData.style}
              onChange={(e) => setFormData({ ...formData, style: e.target.value })}
              className="w-full md:w-1/2 px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900"
            >
              <option value="modern">Modern</option>
              <option value="contemporary">Contemporary</option>
              <option value="traditional">Traditional</option>
              <option value="hamptons">Hamptons</option>
              <option value="farmhouse">Farmhouse</option>
              <option value="minimalist">Minimalist</option>
            </select>
          </div>

          {/* Toggle Options - Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ToggleSwitch 
              label="Open Plan Living" 
              checked={formData.open_plan} 
              onChange={(checked) => setFormData({ ...formData, open_plan: checked })}
              description="Kitchen flows to living"
            />
            <ToggleSwitch 
              label="Outdoor Entertainment" 
              checked={formData.outdoor_entertainment} 
              onChange={(checked) => setFormData({ ...formData, outdoor_entertainment: checked })}
              description="Alfresco/covered patio"
            />
            <ToggleSwitch 
              label="Home Office" 
              checked={formData.home_office} 
              onChange={(checked) => setFormData({ ...formData, home_office: checked })}
              description="Dedicated workspace"
            />
          </div>

          <div className="flex gap-4 pt-2">
            <button type="button" onClick={handleBack} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium">
              <ArrowLeft className="w-4 h-4 inline mr-2" /> Back
            </button>
            <button type="button" onClick={handleNext} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2">
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review - Compact Grid */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Review Your Project</h2>
            <p className="text-gray-600 text-sm">Confirm your selections before saving</p>
          </div>

          {/* Project Details Summary */}
          {projectDetails && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" /> Project Details
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-gray-500">Project</p>
                  <p className="font-medium text-gray-900">{projectDetails.name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Location</p>
                  <p className="font-medium text-gray-900">{projectDetails.suburb}, {projectDetails.state}</p>
                </div>
                <div>
                  <p className="text-gray-500">Land Size</p>
                  <p className="font-medium text-gray-900">{projectDetails.land_width}m × {projectDetails.land_depth}m</p>
                </div>
                {projectDetails.council && (
                  <div>
                    <p className="text-gray-500">Council</p>
                    <p className="font-medium text-gray-900">{projectDetails.council}</p>
                  </div>
                )}
              </div>
              {projectDetails.contourFileName && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <FileText className="w-4 h-4" /> {projectDetails.contourFileName}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Requirements Summary - Grid */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Home className="w-4 h-4 text-blue-600" /> Building Requirements
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-gray-500 text-xs">Bedrooms</p>
                <p className="font-bold text-lg text-blue-600">{formData.bedrooms}</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-gray-500 text-xs">Bathrooms</p>
                <p className="font-bold text-lg text-blue-600">{formData.bathrooms}</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-gray-500 text-xs">Living</p>
                <p className="font-bold text-lg text-blue-600">{formData.living_areas}</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-gray-500 text-xs">Garage</p>
                <p className="font-bold text-lg text-blue-600">{formData.garage_spaces}</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-gray-500 text-xs">Storeys</p>
                <p className="font-bold text-lg text-blue-600">{formData.storeys}</p>
              </div>
            </div>
            
            {/* Preferences Row */}
            <div className="mt-3 pt-3 border-t border-blue-100 flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-white rounded text-xs font-medium text-gray-700 capitalize">{formData.style}</span>
              {formData.open_plan && <span className="px-2 py-1 bg-green-100 rounded text-xs font-medium text-green-700">Open Plan</span>}
              {formData.outdoor_entertainment && <span className="px-2 py-1 bg-green-100 rounded text-xs font-medium text-green-700">Outdoor Entertainment</span>}
              {formData.home_office && <span className="px-2 py-1 bg-green-100 rounded text-xs font-medium text-green-700">Home Office</span>}
            </div>
          </div>

          <div className="flex gap-4 pt-2">
            <button type="button" onClick={handleBack} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium">
              <ArrowLeft className="w-4 h-4 inline mr-2" /> Back
            </button>
            <button 
              type="button" 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> {submitButtonText}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
