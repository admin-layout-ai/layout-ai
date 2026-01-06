// frontend/app/dashboard/page.tsx
// Dashboard page - reads email from localStorage, shows welcome modal for profile completion

'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { 
  Plus, Home, FolderOpen, Clock, Bell, MapPin, CheckCircle, 
  Loader2, AlertCircle, User, Phone, Building2, HardHat,
  MapPinIcon, Sparkles, Save, Hash
} from 'lucide-react';
import { useState, useEffect } from 'react';
import api, { Project, User as ApiUser } from '@/lib/api';

interface DashboardStats {
  total: number;
  generated: number;
  plans: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<ApiUser | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    generated: 0,
    plans: 0
  });

  // Welcome modal state
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  
  // Welcome form fields
  const [formFullName, setFormFullName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formIsBuilder, setFormIsBuilder] = useState(false);
  const [formAbnAcn, setFormAbnAcn] = useState('');

  // Load user on mount
  useEffect(() => {
    initializeDashboard();
  }, []);

  const initializeDashboard = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        console.warn('No auth token found');
        router.push('/auth/signin');
        return;
      }

      // Get email from localStorage (set by complete-email page)
      const userInfo = localStorage.getItem('user_info');
      let email = '';
      let userName = '';
      
      if (userInfo) {
        try {
          const storedUser = JSON.parse(userInfo);
          email = storedUser.email || '';
          
          // Get name for pre-fill
          if (storedUser.name && storedUser.name !== 'User' && storedUser.name !== 'unknown') {
            userName = storedUser.name;
          } else if (storedUser.givenName || storedUser.familyName) {
            userName = `${storedUser.givenName || ''} ${storedUser.familyName || ''}`.trim();
          }
          
          console.log('User info from localStorage:', { email, userName });
        } catch (e) {
          console.error('Error parsing user info:', e);
        }
      }

      // If no email, redirect to complete-email page
      if (!email || email.length === 0) {
        console.log('No email in localStorage, redirecting to complete-email');
        router.push('/auth/complete-email');
        return;
      }

      setUserEmail(email);

      // Check if user exists in database by calling a simple endpoint
      // We'll try to get the user, and handle the response
      try {
        const userData = await api.getCurrentUser();
        console.log('Existing user found:', userData);
        setProfileData(userData);

        // Check if profile needs completion
        if (isProfileIncomplete(userData)) {
          console.log('Profile incomplete, showing welcome modal');
          prefillForm(userData, userName);
          setShowWelcomeModal(true);
        }

        // Load projects
        await loadDashboardData();

      } catch (error) {
        console.log('User not found or error, will show welcome modal:', error);
        
        // User doesn't exist - show welcome modal to create profile
        prefillForm(null, userName);
        setShowWelcomeModal(true);
        setLoading(false);
      }

    } catch (error) {
      console.error('Error initializing dashboard:', error);
      setLoading(false);
    }
  };

  const isProfileIncomplete = (userData: ApiUser): boolean => {
    const hasValidName = userData.full_name && 
      userData.full_name !== 'New User' && 
      userData.full_name !== 'unknown' &&
      !userData.full_name.startsWith('user_') &&
      userData.full_name.trim().length > 0;
    
    return !hasValidName;
  };

  const prefillForm = (userData: ApiUser | null, localName: string) => {
    if (userData) {
      if (userData.full_name && userData.full_name !== 'New User' && userData.full_name !== 'unknown') {
        setFormFullName(userData.full_name);
      }
      if (userData.phone) setFormPhone(userData.phone);
      if (userData.address) setFormAddress(userData.address);
      if (userData.company_name) setFormCompanyName(userData.company_name);
      if (userData.is_builder) setFormIsBuilder(userData.is_builder);
      if (userData.abn_acn) setFormAbnAcn(userData.abn_acn);
    }

    // Use local name if form name not set
    if (!formFullName && localName) {
      setFormFullName(localName);
    }
  };

  // Save profile - creates or updates user
  const handleSaveProfile = async () => {
    if (!formFullName.trim()) {
      setProfileError('Please enter your full name');
      return;
    }

    setIsSavingProfile(true);
    setProfileError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      // Try to update first, if fails then create
      const profilePayload = {
        full_name: formFullName.trim(),
        email: userEmail, // Pass email from localStorage
        phone: formPhone.trim() || null,
        address: formAddress.trim() || null,
        company_name: formIsBuilder ? (formCompanyName.trim() || null) : null,
        is_builder: formIsBuilder,
        abn_acn: formIsBuilder ? (formAbnAcn.replace(/\s/g, '').trim() || null) : null, // Remove spaces for storage
      };

      console.log('Saving profile with email:', userEmail);

      let updatedUser: ApiUser;

      if (profileData) {
        // User exists - update
        updatedUser = await api.updateUserProfile(profilePayload);
      } else {
        // User doesn't exist - create via POST
        const response = await fetch(`${apiUrl}/api/v1/users/me`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(profilePayload)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to create profile');
        }

        updatedUser = await response.json();
      }

      console.log('Profile saved:', updatedUser);
      setProfileData(updatedUser);

      // Update localStorage
      const userInfo = localStorage.getItem('user_info');
      if (userInfo) {
        const localUser = JSON.parse(userInfo);
        localUser.dbId = updatedUser.id;
        localUser.name = updatedUser.full_name;
        localUser.email = updatedUser.email;
        localStorage.setItem('user_info', JSON.stringify(localUser));
      }

      // Close modal and load data
      setShowWelcomeModal(false);
      await loadDashboardData();

    } catch (err) {
      console.error('Error saving profile:', err);
      setProfileError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      const response = await api.getProjects(1, 50);
      const projectList = response.projects || [];
      
      setProjects(projectList);
      
      const generatedCount = projectList.filter((p: Project) => 
        p.status === 'generated' || p.status === 'completed'
      ).length;
      
      setStats({
        total: projectList.length,
        generated: generatedCount,
        plans: generatedCount * 3
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = () => {
    router.push('/dashboard/projects/new');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getDisplayName = () => {
    if (profileData?.full_name && profileData.full_name !== 'New User' && profileData.full_name !== 'unknown') {
      return profileData.full_name.split(' ')[0];
    }
    if (user?.name && user.name !== 'User' && user.name !== 'unknown') {
      return user.name.split(' ')[0];
    }
    return 'there';
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'generated':
      case 'completed':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs">
            <CheckCircle className="w-3 h-3" /> Generated
          </span>
        );
      case 'generating':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs">
            <Loader2 className="w-3 h-3 animate-spin" /> Generating
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs">
            <AlertCircle className="w-3 h-3" /> Error
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs">
            <Clock className="w-3 h-3" /> Draft
          </span>
        );
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short'
    });
  };

  // Show loading
  if (loading && !showWelcomeModal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6 relative">
      
      {/* Welcome Modal Overlay */}
      {showWelcomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop with blur */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          
          {/* Modal */}
          <div className="relative bg-slate-800 rounded-2xl shadow-2xl border border-white/10 w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Complete Your Profile</h2>
              <p className="text-blue-100 text-sm">
                Just a few more details to get started with AI-powered floor plans
              </p>
              {userEmail && (
                <p className="text-blue-200 text-xs mt-2">
                  Email: {userEmail}
                </p>
              )}
            </div>

            {/* Form */}
            <div className="p-6 space-y-4">
              {profileError && (
                <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 text-sm">{profileError}</span>
                </div>
              )}

              {/* Full Name - Required */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <User className="w-4 h-4 inline mr-1.5" />
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <Phone className="w-4 h-4 inline mr-1.5" />
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="Enter your phone number"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Address - Simple input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <MapPinIcon className="w-4 h-4 inline mr-1.5" />
                  Address
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Enter your full address"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Is Builder Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <HardHat className="w-4 h-4 inline mr-1.5" />
                  Are you a licensed builder?
                </label>
                <div 
                  onClick={() => setFormIsBuilder(!formIsBuilder)}
                  className={`cursor-pointer flex items-center justify-between w-full rounded-lg border p-3 transition ${
                    formIsBuilder 
                      ? 'bg-blue-600/20 border-blue-500' 
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <span className={`text-sm ${formIsBuilder ? 'text-blue-400' : 'text-gray-400'}`}>
                    {formIsBuilder ? 'Yes, I am a licensed builder' : 'No, I am not a builder'}
                  </span>
                  <div className={`w-10 h-5 rounded-full transition-colors relative ${
                    formIsBuilder ? 'bg-blue-500' : 'bg-white/20'
                  }`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      formIsBuilder ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </div>
                </div>
              </div>

              {/* Builder Fields - Show if builder */}
              {formIsBuilder && (
                <>
                  {/* Company Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                      <Building2 className="w-4 h-4 inline mr-1.5" />
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={formCompanyName}
                      onChange={(e) => setFormCompanyName(e.target.value)}
                      placeholder="Enter your company name"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* ABN/ACN */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                      <Hash className="w-4 h-4 inline mr-1.5" />
                      ABN / ACN
                    </label>
                    <input
                      type="text"
                      value={formAbnAcn}
                      onChange={(e) => {
                        // Only allow numbers and format as user types
                        const value = e.target.value.replace(/[^\d]/g, '');
                        if (value.length <= 11) {
                          // Format: XX XXX XXX XXX (ABN) or XXX XXX XXX (ACN)
                          let formatted = '';
                          if (value.length <= 9) {
                            // ACN format: XXX XXX XXX
                            formatted = value.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
                          } else {
                            // ABN format: XX XXX XXX XXX
                            formatted = value.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4').trim();
                          }
                          setFormAbnAcn(formatted);
                        }
                      }}
                      placeholder="Enter ABN (11 digits) or ACN (9 digits)"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      ABN: 11 digits (XX XXX XXX XXX) | ACN: 9 digits (XXX XXX XXX)
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <button
                onClick={handleSaveProfile}
                disabled={isSavingProfile || !formFullName.trim()}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingProfile ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Get Started
                  </>
                )}
              </button>
              <p className="text-center text-gray-500 text-xs mt-3">
                You can update these details later in your profile settings
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Content - Blurred when modal is open */}
      <div className={showWelcomeModal ? 'filter blur-sm pointer-events-none' : ''}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <Home className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                {getGreeting()}, {getDisplayName()}!
              </h1>
              <p className="text-gray-400 text-sm">
                {stats.total} active project{stats.total !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-white/20 transition">
            <Bell className="w-5 h-5 text-gray-300" />
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 text-center">
            <p className="text-3xl font-bold text-white">{stats.total}</p>
            <p className="text-sm text-gray-400">Projects</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 text-center">
            <p className="text-3xl font-bold text-white">{stats.generated}</p>
            <p className="text-sm text-gray-400">Generated</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 text-center">
            <p className="text-3xl font-bold text-white">{stats.plans}</p>
            <p className="text-sm text-gray-400">Plans</p>
          </div>
        </div>

        {/* Create New Project Button */}
        <button
          onClick={handleCreateProject}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 mb-6 flex items-center justify-center gap-2 transition font-medium"
        >
          <Plus className="w-5 h-5" />
          Create New Project
        </button>

        {/* Recent Projects */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-gray-400 text-sm font-medium">Recent Projects</h2>
            {projects.length > 0 && (
              <button 
                onClick={() => router.push('/dashboard/projects')}
                className="text-blue-400 text-sm hover:text-blue-300 transition"
              >
                View all
              </button>
            )}
          </div>

          {projects.length === 0 ? (
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-8 border border-white/10 text-center">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Home className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-white font-medium mb-2">No projects yet</h3>
              <p className="text-gray-400 text-sm mb-4">
                Create your first floor plan project
              </p>
              <button
                onClick={handleCreateProject}
                className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm"
              >
                <Plus className="w-4 h-4" />
                Create Project
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.slice(0, 5).map((project) => (
                <button
                  key={project.id}
                  onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                  className="w-full bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-blue-500/50 hover:bg-white/10 transition text-left"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">{project.name}</span>
                    {getStatusBadge(project.status)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {(project.suburb || project.state) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {project.suburb ? `${project.suburb}, ${project.state}` : `${project.state} ${project.postcode}`}
                      </span>
                    )}
                    {project.created_at && (
                      <span>{formatDate(project.created_at)}</span>
                    )}
                    {project.land_area && (
                      <span>{project.land_area.toFixed(0)} m²</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-blue-500/50 hover:bg-white/10 transition text-left"
          >
            <FolderOpen className="w-5 h-5 text-purple-400 mb-2" />
            <p className="text-white text-sm font-medium">All Projects</p>
            <p className="text-gray-500 text-xs">{stats.total} total</p>
          </button>
          <button
            onClick={() => router.push('/dashboard/profile')}
            className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-blue-500/50 hover:bg-white/10 transition text-left"
          >
            <Clock className="w-5 h-5 text-green-400 mb-2" />
            <p className="text-white text-sm font-medium">Account</p>
            <p className="text-gray-500 text-xs">View profile</p>
          </button>
        </div>
      </div>
    </div>
  );
}
