'use client';

import { useState } from 'react';
import { Home, Bath, Sofa, Car, Building2 } from 'lucide-react';

interface QuestionnaireProps {
  onComplete: (data: any) => void;
}

export default function Questionnaire({ onComplete }: QuestionnaireProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
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

  const handleSubmit = () => {
    onComplete(formData);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 flex-1 mx-1 rounded ${
                s <= step ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-gray-600">Step {step} of 3</p>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold mb-6">Basic Requirements</h2>
          
          {/* Bedrooms */}
          <div>
            <label className="block text-sm font-medium mb-2">
              <Home className="inline w-4 h-4 mr-2" />
              How many bedrooms?
            </label>
            <div className="flex gap-2">
              {[2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  onClick={() => setFormData({ ...formData, bedrooms: num })}
                  className={`flex-1 py-3 rounded-lg border-2 ${
                    formData.bedrooms === num
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Bathrooms */}
          <div>
            <label className="block text-sm font-medium mb-2">
              <Bath className="inline w-4 h-4 mr-2" />
              How many bathrooms?
            </label>
            <div className="flex gap-2">
              {[1, 1.5, 2, 2.5, 3].map((num) => (
                <button
                  key={num}
                  onClick={() => setFormData({ ...formData, bathrooms: num })}
                  className={`flex-1 py-3 rounded-lg border-2 ${
                    formData.bathrooms === num
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Living Areas */}
          <div>
            <label className="block text-sm font-medium mb-2">
              <Sofa className="inline w-4 h-4 mr-2" />
              Living areas
            </label>
            <div className="flex gap-2">
              {[1, 2, 3].map((num) => (
                <button
                  key={num}
                  onClick={() => setFormData({ ...formData, living_areas: num })}
                  className={`flex-1 py-3 rounded-lg border-2 ${
                    formData.living_areas === num
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700"
          >
            Continue
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold mb-6">Preferences</h2>
          
          {/* Style */}
          <div>
            <label className="block text-sm font-medium mb-2">Design Style</label>
            <select
              value={formData.style}
              onChange={(e) => setFormData({ ...formData, style: e.target.value })}
              className="w-full p-3 border-2 border-gray-200 rounded-lg"
            >
              <option value="modern">Modern</option>
              <option value="traditional">Traditional</option>
              <option value="coastal">Coastal</option>
              <option value="hamptons">Hamptons</option>
            </select>
          </div>

          {/* Toggles */}
          <div className="space-y-4">
            <label className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg cursor-pointer">
              <span>Open plan living</span>
              <input
                type="checkbox"
                checked={formData.home_office}
                onChange={(e) => setFormData({ ...formData, home_office: e.target.checked })}
                className="w-5 h-5"
              />
            </label>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep(1)}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold mb-6">Review & Generate</h2>
          
          <div className="bg-gray-50 p-6 rounded-lg space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Bedrooms:</span>
              <span className="font-semibold">{formData.bedrooms}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Bathrooms:</span>
              <span className="font-semibold">{formData.bathrooms}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Living Areas:</span>
              <span className="font-semibold">{formData.living_areas}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Style:</span>
              <span className="font-semibold capitalize">{formData.style}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Open Plan:</span>
              <span className="font-semibold">{formData.open_plan ? 'Yes' : 'No'}</span>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep(2)}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700"
            >
              Generate Floor Plans
            </button>
          </div>
        </div>
      )}
    </div>
  );
}