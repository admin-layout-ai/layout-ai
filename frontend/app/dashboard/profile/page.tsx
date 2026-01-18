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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 sm:gap-3">
          <UserIcon className="w-6 h-6 sm:w-7 sm:h-7 text-blue-400" />
          User Profile
        </h1>
        <p className="text-gray-400 mt-1 text-sm">
          Manage your personal and business information
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="mb-4 sm:mb-6 bg-green-500/20 border border-green-500/30 rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0" />
          <span className="text-green-400 text-sm">{success}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 sm:mb-6 bg-red-500/20 border border-red-500/30 rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 flex-shrink-0" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Main Content - Two Column Layout */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        {/* Left Column - Profile Info, Personal Details & Account Info */}
        <div className="flex-1 space-y-4 sm:space-y-6">
          {/* Profile Card */}
          <div className="bg-white/5 rounded-xl p-4 sm:p-6 border border-white/10">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center overflow-hidden border-2 border-blue-500/30 p-1 flex-shrink-0">
                {builderLogoUrl && isBuilder ? (
                  <img src={builderLogoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <UserIcon className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400" />
                )}
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-lg sm:text-xl font-semibold text-white">{profile?.full_name || 'User'}</h2>
                <p className="text-gray-400 text-sm">{profile?.email}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                  <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium capitalize ${getSubscriptionBadge(profile?.subscription_tier || 'free')}`}>
                    {profile?.subscription_tier || 'Free'} Plan
                  </span>
                  {isBuilder && (
                    <span className="px-2 sm:px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
                      <HardHat className="w-3 h-3 inline mr-1" />
                      Licensed Builder
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Personal Details Card */}
          <div className="bg-white/5 rounded-xl p-4 sm:p-6 border border-white/10">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
              <UserIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
              Personal Details
            </h3>
            
            <div className="space-y-4">
              {/* Full Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-400 mb-1.5 sm:mb-2">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-400 mb-1.5 sm:mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition text-sm"
                  />
                </div>
              </div>

              {/* Email & Address - Same Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Email (Read-only) */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-400 mb-1.5 sm:mb-2">
                    Email Address
                    <span className="ml-2 text-xs text-gray-500">(Cannot be changed)</span>
                  </label>
                  <input
                    type="email"
                    value={profile?.email || ''}
                    disabled
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-gray-500 cursor-not-allowed text-sm"
                  />
                </div>

                {/* Address with Autocomplete */}
                <div className="relative" ref={addressInputRef}>
                  <label className="block text-xs sm:text-sm font-medium text-gray-400 mb-1.5 sm:mb-2">Address</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => handleAddressChange(e.target.value)}
                      onFocus={() => address.length >= 2 && setShowAddressSuggestions(true)}
                      placeholder="Start typing your address"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 pr-10 transition text-sm"
                    />
                    {isLoadingAddress ? (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                    ) : (
                      <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    )}
                  </div>
                  
                  {/* Address Suggestions Dropdown */}
                  {showAddressSuggestions && addressSuggestions.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-white/20 rounded-lg shadow-2xl max-h-48 overflow-auto">
                      {addressSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.place_id}
                          onClick={() => selectAddress(suggestion)}
                          className="w-full px-4 py-2.5 text-left text-white hover:bg-blue-600/30 transition flex items-center gap-2 border-b border-white/5 last:border-0"
                        >
                          <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          <span className="text-sm">{suggestion.description}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Account Information Card */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              Account Information
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-gray-400 text-xs mb-1">Status</p>
                <p className={`font-medium ${profile?.is_active ? 'text-green-400' : 'text-red-400'}`}>
                  {profile?.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-gray-400 text-xs mb-1">Plan</p>
                <p className="text-white font-medium capitalize">{profile?.subscription_tier || 'Free'}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-gray-400 text-xs mb-1">Member Since</p>
                <p className="text-white text-sm">{formatDate(profile?.created_at)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-gray-400 text-xs mb-1">Last Updated</p>
                <p className="text-white text-sm">{formatDate(profile?.updated_at)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Business Details */}
        <div className="lg:w-96 space-y-6">
          {/* Builder Toggle Card */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <HardHat className="w-5 h-5 text-blue-400" />
              Builder Status
            </h3>
            
            <div 
              onClick={() => setIsBuilder(!isBuilder)}
              className={`relative cursor-pointer rounded-lg border p-4 transition-colors ${
                isBuilder 
                  ? 'bg-blue-600/20 border-blue-500/50' 
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-medium ${isBuilder ? 'text-blue-400' : 'text-gray-300'}`}>
                    {isBuilder ? 'Licensed Builder' : 'Not a Builder'}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">
                    {isBuilder ? 'Your logo will appear on generated plans' : 'Toggle to add builder details'}
                  </p>
                </div>
                <div className={`w-12 h-6 rounded-full transition-colors relative ${
                  isBuilder ? 'bg-blue-500' : 'bg-white/20'
                }`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    isBuilder ? 'translate-x-7' : 'translate-x-1'
                  }`} />
                </div>
              </div>
            </div>
          </div>

          {/* Business Details Card - Only show when builder */}
          {isBuilder && (
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                Business Details
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Company Name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Company name"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">ABN / ACN</label>
                  <input
                    type="text"
                    value={abnAcn}
                    onChange={handleAbnAcnChange}
                    placeholder="ABN or ACN"
                    maxLength={14}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono transition"
                  />
                </div>

                {/* Builder Logo Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Company Logo</label>
                  
                  {builderLogoUrl ? (
                    <div className="flex items-center gap-4 p-3 bg-white/5 rounded-lg border border-white/10">
                      <div className="w-16 h-16 bg-white rounded-lg overflow-hidden flex-shrink-0 p-1">
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
                          <X className="w-3 h-3" /> Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-white/20 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 hover:border-blue-500/50 transition"
                    >
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
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
              </div>
            </div>
          )}

          {/* Company Name for non-builders */}
          {!isBuilder && (
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                Company <span className="text-gray-500 text-sm font-normal">(Optional)</span>
              </h3>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company name"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          )}
        </div>
      </div>

      {/* Save Button - Bottom Center */}
      <div className="mt-8 flex justify-center">
        <button
          onClick={handleSave}
          disabled={isSaving || isUploadingLogo}
          className="px-12 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
  );
}
