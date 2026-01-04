// frontend/components/Questionnaire.tsx
// Combined review: Shows project details + questionnaire summary, saves to backend on submit

'use client';

import { useState } from 'react';
import { Home, Bath, Sofa, Car, Building2, ArrowLeft, ArrowRight, Check } from 'lucide-react';

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
  address?: string;
  council?: string;
}

interface QuestionnaireProps {
  onComplete: (data: QuestionnaireData) => void;
  onCancel?: () => void;
  projectDetails?: ProjectDetails;  // Optional project details to show on review
  isSubmitting?: boolean;  // Loading state for submit button
}

export default function Questionnaire({ onComplete, onCancel, projectDetails, isSubmitting = false }: QuestionnaireProps) {
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
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else if (onCancel) {
      onCancel();
    }
  };

  const handleSubmit = () => {
    onComplete(formData);
  };

  // Selection button component
  const SelectButton = ({ 
    selected, 
    onClick, 
    children 
  }: { 
    selected: boolean; 
    onClick: () => void; 
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
        selected
          ? 'border-blue-600 bg-blue-50 text-blue-700'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  );

  // Toggle switch component
  const ToggleSwitch = ({
    label,
    checked,
    onChange,
    description,
  }: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    description?: string;
  }) => (
    <label className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 transition group">
      <div>
        <span className="font-medium text-gray-900">{label}</span>
        {description && (
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div className={`w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}>
          <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </div>
      </div>
    </label>
  );

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 flex-1 mx-1 rounded-full transition-colors ${
                s <= step ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
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

      {/* Step 1: Basic Requirements */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Basic Requirements</h2>
            <p className="text-gray-600">Tell us about your ideal home layout</p>
          </div>
          
          {/* Bedrooms */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Home className="w-4 h-4 text-blue-600" />
              How many bedrooms?
            </label>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map((num) => (
                <SelectButton
                  key={num}
                  selected={formData.bedrooms === num}
                  onClick={() => setFormData({ ...formData, bedrooms: num })}
                >
                  {num}
                </SelectButton>
              ))}
            </div>
          </div>

          {/* Bathrooms */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Bath className="w-4 h-4 text-blue-600" />
              How many bathrooms?
            </label>
            <div className="flex gap-2">
              {[1, 1.5, 2, 2.5, 3, 3.5].map((num) => (
                <SelectButton
                  key={num}
                  selected={formData.bathrooms === num}
                  onClick={() => setFormData({ ...formData, bathrooms: num })}
                >
                  {num}
                </SelectButton>
              ))}
            </div>
          </div>

          {/* Living Areas */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Sofa className="w-4 h-4 text-blue-600" />
              Living areas
            </label>
            <div className="flex gap-2">
              {[1, 2, 3].map((num) => (
                <SelectButton
                  key={num}
                  selected={formData.living_areas === num}
                  onClick={() => setFormData({ ...formData, living_areas: num })}
                >
                  {num}
                </SelectButton>
              ))}
            </div>
          </div>

          {/* Garage */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Car className="w-4 h-4 text-blue-600" />
              Garage spaces
            </label>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((num) => (
                <SelectButton
                  key={num}
                  selected={formData.garage_spaces === num}
                  onClick={() => setFormData({ ...formData, garage_spaces: num })}
                >
                  {num === 0 ? 'None' : num}
                </SelectButton>
              ))}
            </div>
          </div>

          {/* Storeys */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Building2 className="w-4 h-4 text-blue-600" />
              Number of storeys
            </label>
            <div className="flex gap-2">
              {[1, 2].map((num) => (
                <SelectButton
                  key={num}
                  selected={formData.storeys === num}
                  onClick={() => setFormData({ ...formData, storeys: num })}
                >
                  {num === 1 ? 'Single Storey' : 'Double Storey'}
                </SelectButton>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-4 pt-4">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition font-medium"
              >
                <ArrowLeft className="w-4 h-4 inline mr-2" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preferences */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Design Preferences</h2>
            <p className="text-gray-600">Customize your home style and features</p>
          </div>
          
          {/* Design Style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Design Style
            </label>
            <select
              value={formData.style}
              onChange={(e) => setFormData({ ...formData, style: e.target.value })}
              className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-0 transition bg-white"
            >
              <option value="modern">Modern</option>
              <option value="traditional">Traditional</option>
              <option value="coastal">Coastal</option>
              <option value="hamptons">Hamptons</option>
              <option value="contemporary">Contemporary</option>
              <option value="minimalist">Minimalist</option>
            </select>
          </div>

          {/* Feature Toggles */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Features
            </label>
            
            <ToggleSwitch
              label="Open plan living"
              description="Combined kitchen, dining and living area"
              checked={formData.open_plan}
              onChange={(checked) => setFormData({ ...formData, open_plan: checked })}
            />

            <ToggleSwitch
              label="Home office"
              description="Dedicated workspace or study"
              checked={formData.home_office}
              onChange={(checked) => setFormData({ ...formData, home_office: checked })}
            />

            <ToggleSwitch
              label="Outdoor entertainment"
              description="Alfresco, patio or deck area"
              checked={formData.outdoor_entertainment}
              onChange={(checked) => setFormData({ ...formData, outdoor_entertainment: checked })}
            />
          </div>

          {/* Navigation */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition font-medium flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review - Shows BOTH project details and questionnaire summary */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Review Your Requirements</h2>
            <p className="text-gray-600">Confirm your selections before generating floor plans</p>
          </div>
          
          {/* Project Details Section - Only show if projectDetails is provided */}
          {projectDetails && (
            <div className="bg-gray-50 rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">Project Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Name</span>
                  <p className="font-medium text-gray-900">{projectDetails.name}</p>
                </div>
                <div>
                  <span className="text-gray-500">Land Size</span>
                  <p className="font-medium text-gray-900">
                    {projectDetails.land_width}m × {projectDetails.land_depth}m 
                    ({(projectDetails.land_width * projectDetails.land_depth).toFixed(0)} m²)
                  </p>
                </div>
                {projectDetails.address && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Address</span>
                    <p className="font-medium text-gray-900">{projectDetails.address}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Requirements Summary */}
          <div className="bg-gray-50 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Summary</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Bedrooms</span>
                <span className="font-semibold text-gray-900">{formData.bedrooms}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Bathrooms</span>
                <span className="font-semibold text-gray-900">{formData.bathrooms}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Living Areas</span>
                <span className="font-semibold text-gray-900">{formData.living_areas}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Garage</span>
                <span className="font-semibold text-gray-900">
                  {formData.garage_spaces === 0 ? 'None' : `${formData.garage_spaces} car`}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Storeys</span>
                <span className="font-semibold text-gray-900">
                  {formData.storeys === 1 ? 'Single' : 'Double'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Style</span>
                <span className="font-semibold text-gray-900 capitalize">{formData.style}</span>
              </div>
            </div>

            {/* Features */}
            <div className="pt-2">
              <span className="text-gray-600 text-sm">Features:</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.open_plan && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                    <Check className="w-3 h-3" />
                    Open Plan
                  </span>
                )}
                {formData.home_office && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                    <Check className="w-3 h-3" />
                    Home Office
                  </span>
                )}
                {formData.outdoor_entertainment && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                    <Check className="w-3 h-3" />
                    Outdoor Entertainment
                  </span>
                )}
                {!formData.open_plan && !formData.home_office && !formData.outdoor_entertainment && (
                  <span className="text-gray-500 text-sm">No additional features selected</span>
                )}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={handleBack}
              disabled={isSubmitting}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                'Generate Floor Plans'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
