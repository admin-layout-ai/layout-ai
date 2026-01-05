'use client';

// frontend/app/dashboard/profile/page.tsx
// User Profile page - allows editing personal details with address autocomplete and builder fields

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  User as UserIcon, 
  Mail, 
  Phone, 
  Building2, 
  HardHat,
  Save,
  Loader2,
  Check,
  AlertCircle,
  ArrowLeft,
  MapPin,
  Upload,
  X,
  FileText,
  Calendar
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api, { User } from '@/lib/api';

interface AddressSuggestion {
  place_id: string;
  description: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading, isAuthenticated } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Editable fields
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isBuilder, setIsBuilder] = useState(false);
  const [abnAcn, setAbnAcn] = useState('');
  const [builderLogoUrl, setBuilderLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  
  // Address autocomplete
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchProfile();
    }
  }, [authLoading, isAuthenticated]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addressInputRef.current && !addressInputRef.current.contains(e.target as Node)) {
        setShowAddressSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchProfile = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await api.getCurrentUser();
      setProfile(data);
      
      // Initialize form fields
      setFullName(data.full_name || '');
      setCompanyName(data.company_name || '');
      setPhone(data.phone || '');
      setAddress(data.address || '');
      setIsBuilder(data.is_builder || false);
      setAbnAcn(data.abn_acn || '');
      setBuilderLogoUrl(data.builder_logo_url || null);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  // Address autocomplete using Google Places API (or fallback)
  const handleAddressChange = async (value: string) => {
    setAddress(value);
    
    if (value.length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    setIsLoadingAddress(true);
    
    try {
      // Try to use Google Places API if available
      if (typeof google !== 'undefined' && google.maps && google.maps.places) {
        const service = new google.maps.places.AutocompleteService();
        service.getPlacePredictions(
          {
            input: value,
            componentRestrictions: { country: 'au' },
            types: ['address'],
          },
          (predictions, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
              setAddressSuggestions(
                predictions.map((p) => ({
                  place_id: p.place_id,
                  description: p.description,
                }))
              );
              setShowAddressSuggestions(true);
            } else {
              setAddressSuggestions([]);
            }
            setIsLoadingAddress(false);
          }
        );
      } else {
        // Fallback: Show some sample Australian addresses based on input
        const sampleAddresses = generateSampleAddresses(value);
        setAddressSuggestions(sampleAddresses);
        setShowAddressSuggestions(sampleAddresses.length > 0);
        setIsLoadingAddress(false);
      }
    } catch (err) {
      console.error('Address autocomplete error:', err);
      setIsLoadingAddress(false);
    }
  };

  // Generate sample addresses for fallback (when Google API isn't available)
  const generateSampleAddresses = (query: string): AddressSuggestion[] => {
    const lowerQuery = query.toLowerCase();
    const samples = [
      { place_id: '1', description: '123 George Street, Sydney NSW 2000' },
      { place_id: '2', description: '456 Collins Street, Melbourne VIC 3000' },
      { place_id: '3', description: '789 Queen Street, Brisbane QLD 4000' },
      { place_id: '4', description: '321 Hay Street, Perth WA 6000' },
      { place_id: '5', description: '654 King William Street, Adelaide SA 5000' },
      { place_id: '6', description: '987 Liverpool Street, Hobart TAS 7000' },
      { place_id: '7', description: '147 Northbourne Avenue, Canberra ACT 2600' },
      { place_id: '8', description: '258 Smith Street, Darwin NT 0800' },
    ];
    
    return samples.filter(s => 
      s.description.toLowerCase().includes(lowerQuery)
    ).slice(0, 5);
  };

  const selectAddress = (suggestion: AddressSuggestion) => {
    setAddress(suggestion.description);
    setShowAddressSuggestions(false);
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Logo must be less than 5MB');
        return;
      }
      setLogoFile(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setBuilderLogoUrl(previewUrl);
      setError(null);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setBuilderLogoUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validateAbnAcn = (value: string): boolean => {
    // ABN is 11 digits, ACN is 9 digits
    const digitsOnly = value.replace(/\s/g, '');
    return digitsOnly.length === 11 || digitsOnly.length === 9;
  };

  const formatAbnAcn = (value: string): string => {
    // Format as XX XXX XXX XXX (ABN) or XXX XXX XXX (ACN)
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length <= 9) {
      // ACN format: XXX XXX XXX
      return digitsOnly.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3').trim();
    } else {
      // ABN format: XX XXX XXX XXX
      return digitsOnly.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4').trim();
    }
  };

  const handleAbnAcnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatAbnAcn(e.target.value);
    setAbnAcn(formatted);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    // Validate builder fields if isBuilder is true
    if (isBuilder && abnAcn && !validateAbnAcn(abnAcn)) {
      setError('Please enter a valid ABN (11 digits) or ACN (9 digits)');
      setIsSaving(false);
      return;
    }
    
    try {
      // Upload logo if there's a new file
      let logoUrl = builderLogoUrl;
      if (logoFile && isBuilder) {
        setIsUploadingLogo(true);
        try {
          // Upload logo using the files API
          logoUrl = await api.uploadBuilderLogo(logoFile, fullName || 'builder');
        } catch (uploadErr) {
          console.error('Error uploading logo:', uploadErr);
          // Continue without logo
        }
        setIsUploadingLogo(false);
      }

      const updateData: any = {
        full_name: fullName,
        company_name: companyName || null,
        phone: phone || null,
        address: address || null,
        is_builder: isBuilder,
      };

      // Only include builder fields if isBuilder is true
      if (isBuilder) {
        updateData.abn_acn = abnAcn || null;
        updateData.builder_logo_url = logoUrl || null;
      } else {
        // Clear builder fields if not a builder
        updateData.abn_acn = null;
        updateData.builder_logo_url = null;
      }

      const updatedProfile = await api.updateUserProfile(updateData);
      
      setProfile(updatedProfile);
      setSuccess('Profile updated successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
      setIsUploadingLogo(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const getSubscriptionBadge = (tier: string) => {
    const colors: Record<string, string> = {
      free: 'bg-gray-500/20 text-gray-400',
      basic: 'bg-blue-500/20 text-blue-400',
      professional: 'bg-purple-500/20 text-purple-400',
      enterprise: 'bg-yellow-500/20 text-yellow-400',
    };
    return colors[tier] || colors.free;
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-center max-w-md mx-auto">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error Loading Profile</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={fetchProfile}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
      {/* Header */}
      <div className="mb-8">
        <button 
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-5 h-5" /> Back to Dashboard
        </button>
        
        <h1 className="text-2xl font-bold text-white">User Profile</h1>
        <p className="text-gray-400">Manage your personal information</p>
      </div>

      <div className="max-w-2xl">
        {/* Success Message */}
        {success && (
          <div className="mb-6 bg-green-500/20 border border-green-500/30 rounded-lg p-4 flex items-center gap-3">
            <Check className="w-5 h-5 text-green-400" />
            <span className="text-green-400">{success}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          {/* Profile Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center overflow-hidden">
                {builderLogoUrl && isBuilder ? (
                  <img src={builderLogoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-8 h-8 text-white" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{profile?.full_name || 'User'}</h2>
                <p className="text-blue-200">{profile?.email}</p>
              </div>
              <div className="ml-auto">
                <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${getSubscriptionBadge(profile?.subscription_tier || 'free')}`}>
                  {profile?.subscription_tier || 'Free'} Plan
                </span>
              </div>
            </div>
          </div>

          {/* Editable Fields */}
          <div className="p-6 space-y-6">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <UserIcon className="w-4 h-4 inline mr-2" />
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Email (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <Mail className="w-4 h-4 inline mr-2" />
                Email Address
                <span className="ml-2 text-xs text-gray-500">(Cannot be changed)</span>
              </label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-gray-400 cursor-not-allowed"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <Phone className="w-4 h-4 inline mr-2" />
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter your phone number"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Address with Autocomplete */}
            <div className="relative" ref={addressInputRef}>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <MapPin className="w-4 h-4 inline mr-2" />
                Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
                onFocus={() => address.length >= 3 && setShowAddressSuggestions(true)}
                placeholder="Start typing your address..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {isLoadingAddress && (
                <div className="absolute right-3 top-11">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                </div>
              )}
              
              {/* Address Suggestions Dropdown */}
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-white/10 rounded-lg shadow-xl max-h-60 overflow-auto">
                  {addressSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.place_id}
                      onClick={() => selectAddress(suggestion)}
                      className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition flex items-center gap-2"
                    >
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm">{suggestion.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Is Builder Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <HardHat className="w-4 h-4 inline mr-2" />
                Are you a licensed builder?
              </label>
              <div 
                onClick={() => setIsBuilder(!isBuilder)}
                className={`relative inline-flex h-12 w-full max-w-md cursor-pointer items-center rounded-lg border transition-colors ${
                  isBuilder 
                    ? 'bg-blue-600/20 border-blue-500' 
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center justify-between w-full px-4">
                  <span className={`text-sm ${isBuilder ? 'text-blue-400' : 'text-gray-400'}`}>
                    {isBuilder ? 'Yes, I am a licensed builder' : 'No, I am not a builder'}
                  </span>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                    isBuilder ? 'bg-blue-500' : 'bg-white/10'
                  }`}>
                    {isBuilder && <Check className="w-4 h-4 text-white" />}
                  </div>
                </div>
              </div>
            </div>

            {/* Builder-specific fields - Only show if isBuilder is true */}
            {isBuilder && (
              <div className="space-y-6 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <HardHat className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-semibold text-white">Builder Details</h3>
                </div>

                {/* Company Name (for builders) */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    <Building2 className="w-4 h-4 inline mr-2" />
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Enter your company name"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* ABN/ACN */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    <FileText className="w-4 h-4 inline mr-2" />
                    ABN / ACN
                  </label>
                  <input
                    type="text"
                    value={abnAcn}
                    onChange={handleAbnAcnChange}
                    placeholder="XX XXX XXX XXX (ABN) or XXX XXX XXX (ACN)"
                    maxLength={14}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter your 11-digit ABN or 9-digit ACN
                  </p>
                </div>

                {/* Builder Logo Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    <Upload className="w-4 h-4 inline mr-2" />
                    Company Logo
                  </label>
                  
                  {builderLogoUrl ? (
                    <div className="flex items-center gap-4">
                      <div className="w-24 h-24 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                        <img 
                          src={builderLogoUrl} 
                          alt="Company Logo" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-blue-400 hover:text-blue-300 text-sm transition"
                        >
                          Change Logo
                        </button>
                        <button
                          onClick={removeLogo}
                          className="text-red-400 hover:text-red-300 text-sm transition flex items-center gap-1"
                        >
                          <X className="w-4 h-4" /> Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/20 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition">
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-gray-300 text-sm">Click to upload logo</span>
                      <span className="text-gray-500 text-xs mt-1">PNG, JPG (max 5MB)</span>
                    </label>
                  )}
                  
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    className="hidden" 
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleLogoSelect}
                  />
                </div>
              </div>
            )}

            {/* Non-builder Company Name */}
            {!isBuilder && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <Building2 className="w-4 h-4 inline mr-2" />
                  Company Name <span className="text-gray-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Enter your company name"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {/* Save Button */}
            <div className="pt-4">
              <button
                onClick={handleSave}
                disabled={isSaving || isUploadingLogo}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving || isUploadingLogo ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {isUploadingLogo ? 'Uploading Logo...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Account Info Footer */}
          <div className="border-t border-white/10 p-6 bg-white/5">
            <h3 className="text-sm font-medium text-gray-400 mb-4">Account Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Account Status</p>
                <p className={`font-medium ${profile?.is_active ? 'text-green-400' : 'text-red-400'}`}>
                  {profile?.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Subscription</p>
                <p className="text-white font-medium capitalize">{profile?.subscription_tier || 'Free'}</p>
              </div>
              <div>
                <p className="text-gray-500">Member Since</p>
                <p className="text-white">{formatDate(profile?.created_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Last Updated</p>
                <p className="text-white">{formatDate(profile?.updated_at)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Declare google maps types (optional - for TypeScript)
declare global {
  interface Window {
    google: any;
  }
}
declare const google: any;
