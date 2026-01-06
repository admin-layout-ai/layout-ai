'use client';

// frontend/app/dashboard/profile/page.tsx
// User Profile page - landscape layout with address autocomplete and builder fields

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
  Search
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api, { User } from '@/lib/api';

interface AddressSuggestion {
  place_id: string;
  description: string;
}

// Australian address API (using addressfinder.com.au style or fallback)
const AUSTRALIAN_STREETS = [
  'George Street', 'Pitt Street', 'King Street', 'Elizabeth Street', 'Market Street',
  'Collins Street', 'Bourke Street', 'Flinders Street', 'Swanston Street', 'Spencer Street',
  'Queen Street', 'Adelaide Street', 'Ann Street', 'Edward Street', 'Albert Street',
  'Hay Street', 'Murray Street', 'Wellington Street', 'St Georges Terrace', 'Barrack Street',
  'Rundle Street', 'Hindley Street', 'Grenfell Street', 'Currie Street', 'Grote Street'
];

const AUSTRALIAN_SUBURBS: Record<string, { state: string; postcode: string }[]> = {
  'sydney': [{ state: 'NSW', postcode: '2000' }],
  'melbourne': [{ state: 'VIC', postcode: '3000' }],
  'brisbane': [{ state: 'QLD', postcode: '4000' }],
  'perth': [{ state: 'WA', postcode: '6000' }],
  'adelaide': [{ state: 'SA', postcode: '5000' }],
  'hobart': [{ state: 'TAS', postcode: '7000' }],
  'darwin': [{ state: 'NT', postcode: '0800' }],
  'canberra': [{ state: 'ACT', postcode: '2600' }],
  'parramatta': [{ state: 'NSW', postcode: '2150' }],
  'newcastle': [{ state: 'NSW', postcode: '2300' }],
  'wollongong': [{ state: 'NSW', postcode: '2500' }],
  'geelong': [{ state: 'VIC', postcode: '3220' }],
  'gold coast': [{ state: 'QLD', postcode: '4217' }],
  'sunshine coast': [{ state: 'QLD', postcode: '4556' }],
  'townsville': [{ state: 'QLD', postcode: '4810' }],
  'cairns': [{ state: 'QLD', postcode: '4870' }],
  'toowoomba': [{ state: 'QLD', postcode: '4350' }],
  'ballarat': [{ state: 'VIC', postcode: '3350' }],
  'bendigo': [{ state: 'VIC', postcode: '3550' }],
  'mandurah': [{ state: 'WA', postcode: '6210' }],
  'launceston': [{ state: 'TAS', postcode: '7250' }],
  'mackay': [{ state: 'QLD', postcode: '4740' }],
  'rockhampton': [{ state: 'QLD', postcode: '4700' }],
  'bunbury': [{ state: 'WA', postcode: '6230' }],
};

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
  const addressInputRef = useRef<HTMLDivElement>(null);

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

  // Generate Australian address suggestions
  const generateAddressSuggestions = (query: string): AddressSuggestion[] => {
    if (query.length < 2) return [];
    
    const lowerQuery = query.toLowerCase();
    const suggestions: AddressSuggestion[] = [];
    
    // Check if query contains a number (street number)
    const streetNumberMatch = query.match(/^(\d+)\s*/);
    const streetNumber = streetNumberMatch ? streetNumberMatch[1] : '';
    const searchQuery = streetNumberMatch ? query.substring(streetNumberMatch[0].length).toLowerCase() : lowerQuery;
    
    // Search through suburbs
    Object.entries(AUSTRALIAN_SUBURBS).forEach(([suburb, locations]) => {
      if (suburb.includes(searchQuery) || searchQuery.includes(suburb.substring(0, 3))) {
        locations.forEach(loc => {
          // Generate a few street addresses for this suburb
          AUSTRALIAN_STREETS.slice(0, 3).forEach((street, idx) => {
            const num = streetNumber || String((idx + 1) * 10 + Math.floor(Math.random() * 50));
            const fullAddress = `${num} ${street}, ${suburb.charAt(0).toUpperCase() + suburb.slice(1)} ${loc.state} ${loc.postcode}`;
            suggestions.push({
              place_id: `${suburb}-${idx}`,
              description: fullAddress
            });
          });
        });
      }
    });
    
    // Also match street names
    AUSTRALIAN_STREETS.forEach((street, idx) => {
      if (street.toLowerCase().includes(searchQuery)) {
        const num = streetNumber || String((idx + 1) * 10);
        // Pick a random suburb
        const suburbs = Object.entries(AUSTRALIAN_SUBURBS);
        const [suburb, locations] = suburbs[idx % suburbs.length];
        const loc = locations[0];
        const fullAddress = `${num} ${street}, ${suburb.charAt(0).toUpperCase() + suburb.slice(1)} ${loc.state} ${loc.postcode}`;
        suggestions.push({
          place_id: `street-${idx}`,
          description: fullAddress
        });
      }
    });
    
    // Remove duplicates and limit
    const uniqueSuggestions = suggestions.filter((s, i, arr) => 
      arr.findIndex(x => x.description === s.description) === i
    );
    
    return uniqueSuggestions.slice(0, 6);
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    
    if (value.length < 2) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    setIsLoadingAddress(true);
    
    // Use local suggestion generator (works without external API)
    const suggestions = generateAddressSuggestions(value);
    setAddressSuggestions(suggestions);
    setShowAddressSuggestions(suggestions.length > 0);
    setIsLoadingAddress(false);
  };

  const selectAddress = (suggestion: AddressSuggestion) => {
    setAddress(suggestion.description);
    setShowAddressSuggestions(false);
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('Logo must be less than 5MB');
        return;
      }
      setLogoFile(file);
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
    const digitsOnly = value.replace(/\s/g, '');
    return digitsOnly.length === 11 || digitsOnly.length === 9;
  };

  const formatAbnAcn = (value: string): string => {
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length <= 9) {
      return digitsOnly.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3').trim();
    } else {
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

    if (isBuilder && abnAcn && !validateAbnAcn(abnAcn)) {
      setError('Please enter a valid ABN (11 digits) or ACN (9 digits)');
      setIsSaving(false);
      return;
    }
    
    try {
      let logoUrl = builderLogoUrl;
      if (logoFile && isBuilder) {
        setIsUploadingLogo(true);
        try {
          logoUrl = await api.uploadBuilderLogo(logoFile, fullName || 'builder');
        } catch (uploadErr) {
          console.error('Error uploading logo:', uploadErr);
        }
        setIsUploadingLogo(false);
      }

      const updateData: Record<string, unknown> = {
        full_name: fullName || null,
        company_name: companyName || null,
        phone: phone || null,
        address: address || null,
        is_builder: isBuilder,
      };

      if (isBuilder) {
        updateData.abn_acn = abnAcn || null;
        updateData.builder_logo_url = logoUrl || null;
      } else {
        updateData.abn_acn = null;
        updateData.builder_logo_url = null;
      }

      console.log('Saving profile with data:', updateData);
      const updatedProfile = await api.updateUserProfile(updateData);
      
      setProfile(updatedProfile);
      setSuccess('Profile updated successfully!');
      
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
      <div className="mb-6">
        <button 
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-5 h-5" /> Back to Dashboard
        </button>
        
        <h1 className="text-2xl font-bold text-white">User Profile</h1>
        <p className="text-gray-400">Manage your personal information</p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="mb-6 bg-green-500/20 border border-green-500/30 rounded-lg p-4 flex items-center gap-3 max-w-6xl">
          <Check className="w-5 h-5 text-green-400" />
          <span className="text-green-400">{success}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-lg p-4 flex items-center gap-3 max-w-6xl">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
        </div>
      )}

      {/* Profile Card - Landscape Layout - Wider */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden max-w-6xl">
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
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white">{profile?.full_name || 'User'}</h2>
              <p className="text-blue-200">{profile?.email}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${getSubscriptionBadge(profile?.subscription_tier || 'free')}`}>
              {profile?.subscription_tier || 'Free'} Plan
            </span>
          </div>
        </div>

        {/* Form Content - Two Column Layout - More Compact */}
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Column - Personal Details */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white border-b border-white/10 pb-2">Personal Details</h3>
              
              {/* Full Name & Phone - Same Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    <UserIcon className="w-4 h-4 inline mr-1" />
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              {/* Email (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  <Mail className="w-4 h-4 inline mr-1" />
                  Email Address
                  <span className="ml-1 text-xs text-gray-500">(Cannot be changed)</span>
                </label>
                <input
                  type="email"
                  value={profile?.email || ''}
                  disabled
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-400 cursor-not-allowed text-sm"
                />
              </div>

              {/* Address with Autocomplete */}
              <div className="relative" ref={addressInputRef}>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  <MapPin className="w-4 h-4 inline mr-1" />
                  Address
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    onFocus={() => address.length >= 2 && setShowAddressSuggestions(true)}
                    placeholder="Start typing your address"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10 text-sm"
                  />
                  {isLoadingAddress ? (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                  ) : (
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  )}
                </div>
                
                {/* Address Suggestions Dropdown */}
                {showAddressSuggestions && addressSuggestions.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-white/20 rounded-lg shadow-2xl max-h-48 overflow-auto">
                    {addressSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.place_id}
                        onClick={() => selectAddress(suggestion)}
                        className="w-full px-3 py-2 text-left text-white hover:bg-blue-600/30 transition flex items-center gap-2 border-b border-white/5 last:border-0"
                      >
                        <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <span className="text-sm">{suggestion.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Builder Details */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white border-b border-white/10 pb-2">Business Details</h3>
              
              {/* Is Builder Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  <HardHat className="w-4 h-4 inline mr-1" />
                  Are you a licensed builder?
                </label>
                <div 
                  onClick={() => setIsBuilder(!isBuilder)}
                  className={`relative inline-flex h-10 w-full cursor-pointer items-center rounded-lg border transition-colors ${
                    isBuilder 
                      ? 'bg-blue-600/20 border-blue-500' 
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between w-full px-3">
                    <span className={`text-sm ${isBuilder ? 'text-blue-400' : 'text-gray-400'}`}>
                      {isBuilder ? 'Yes, I am a licensed builder' : 'No, I am not a builder'}
                    </span>
                    <div className={`w-10 h-5 rounded-full transition-colors relative ${
                      isBuilder ? 'bg-blue-500' : 'bg-white/20'
                    }`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        isBuilder ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Company Name & ABN - Same Row when builder */}
              {isBuilder ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      <Building2 className="w-4 h-4 inline mr-1" />
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Company name"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      <FileText className="w-4 h-4 inline mr-1" />
                      ABN / ACN
                    </label>
                    <input
                      type="text"
                      value={abnAcn}
                      onChange={handleAbnAcnChange}
                      placeholder="ABN or ACN"
                      maxLength={14}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    <Building2 className="w-4 h-4 inline mr-1" />
                    Company Name <span className="text-gray-500 text-xs">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Company name"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              )}

              {/* Builder-specific fields */}
              {isBuilder && (
                <>
                  {/* Builder Logo Upload - Compact */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      <Upload className="w-4 h-4 inline mr-1" />
                      Company Logo
                    </label>
                    
                    {builderLogoUrl ? (
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                          <img 
                            src={builderLogoUrl} 
                            alt="Company Logo" 
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
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
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/20 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition"
                      >
                        <Upload className="w-6 h-6 text-gray-400 mb-1" />
                        <span className="text-gray-300 text-sm">Click to upload</span>
                        <span className="text-gray-500 text-xs">PNG, JPG (max 5MB)</span>
                      </div>
                    )}
                    
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      className="hidden" 
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleLogoSelect}
                    />
                  </div>
                </>
              )}

              {/* Account Info - More Compact */}
              <div className="bg-white/5 rounded-lg p-3">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Account Information</h4>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-gray-500">Status</p>
                    <p className={`font-medium ${profile?.is_active ? 'text-green-400' : 'text-red-400'}`}>
                      {profile?.is_active ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Plan</p>
                    <p className="text-white font-medium capitalize">{profile?.subscription_tier || 'Free'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Member Since</p>
                    <p className="text-white">{formatDate(profile?.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Updated</p>
                    <p className="text-white">{formatDate(profile?.updated_at)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button - Full Width - More Compact */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <button
              onClick={handleSave}
              disabled={isSaving || isUploadingLogo}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
      </div>
    </div>
  );
}
