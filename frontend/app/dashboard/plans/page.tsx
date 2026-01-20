'use client';

// frontend/app/dashboard/plans/page.tsx
// Handles LIST VIEW and DETAIL VIEW using state-based navigation
// - List: Shows all plans in a list
// - Detail: Click a plan to view details (no URL change)

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Layers, 
  Search, 
  Eye,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  MapPin,
  Bed,
  Bath,
  Home,
  ChevronRight,
  X,
  ImageIcon,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Info,
  FileText,
  Ruler,
  Clock,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api, { Project, FloorPlan } from '@/lib/api';

// Variant information
const VARIANT_INFO: Record<number, { name: string; icon: string; color: string; description: string }> = {
  1: { name: 'Optimal Layout', icon: '⚡', color: 'bg-yellow-500/20 text-yellow-400', description: 'Balanced, efficient design' },
  2: { name: 'Spacious Living', icon: '🏠', color: 'bg-blue-500/20 text-blue-400', description: 'Emphasis on living areas' },
  3: { name: 'Master Retreat', icon: '👑', color: 'bg-purple-500/20 text-purple-400', description: 'Enhanced master suite' },
};

interface FloorPlanWithProject extends FloorPlan {
  project?: Project;
}

interface ValidationSummary {
  total_errors?: number;
  total_warnings?: number;
  layout_valid?: boolean;
  dimensions_valid?: boolean;
  coverage_percent?: number;
  council_compliant?: boolean;
  ncc_compliant?: boolean;
  bedroom_count?: number;
  bathroom_count?: number;
  is_tile_layout?: boolean;
  building_envelope?: {
    width: number;
    depth: number;
    area: number;
  };
}

interface ValidationData {
  overall_compliant?: boolean;
  all_errors?: string[];
  all_warnings?: string[];
  summary?: ValidationSummary;
  council_validation?: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    council?: string;
  };
  ncc_validation?: {
    compliant: boolean;
    errors: string[];
    warnings: string[];
  };
  layout_validation?: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

interface LayoutData {
  rooms?: Array<{
    type: string;
    name?: string;
    width: number;
    depth: number;
    area?: number;
  }>;
  summary?: {
    total_area?: number;
    living_area?: number;
  };
  building_envelope?: {
    width?: number;
    depth?: number;
  };
  validation?: ValidationData;
}

export default function PlansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Get project filter from URL query param
  const projectParam = searchParams.get('project');
  const initialProjectFilter = projectParam ? parseInt(projectParam) : 'all';
  
  // Gallery view state
  const [plans, setPlans] = useState<FloorPlanWithProject[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<number | 'all'>(initialProjectFilter);
  const [selectedVariantFilter, setSelectedVariantFilter] = useState<number | 'all'>('all');
  
  // Detail view state - when selectedPlan is set, show detail view
  const [selectedPlan, setSelectedPlan] = useState<FloorPlanWithProject | null>(null);
  const [layoutData, setLayoutData] = useState<LayoutData | null>(null);
  const [scale, setScale] = useState(1);
  const [showDetails, setShowDetails] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [removingItems, setRemovingItems] = useState<Set<string>>(new Set()); // Track items being animated out
  const [fixingError, setFixingError] = useState<string | null>(null); // Track which error is being fixed
  const [fixingMessage, setFixingMessage] = useState<string>(''); // AI message during fix
  const [fixingSuccess, setFixingSuccess] = useState<boolean | null>(null); // Success/failure state

  // AI messages for the fixing overlay
  const AI_FIXING_MESSAGES = [
    "Analyzing floor plan layout...",
    "Calculating optimal room dimensions...",
    "Adjusting building envelope...",
    "Optimizing space utilization...",
    "Ensuring NCC compliance...",
    "Validating council requirements...",
    "Refining room proportions...",
    "Generating corrected layout...",
    "Almost there, finalizing changes...",
  ];
  
  // Lightbox state (for gallery quick view)
  const [lightboxPlan, setLightboxPlan] = useState<FloorPlanWithProject | null>(null);

  // Sync project filter with URL param when it changes
  useEffect(() => {
    const projectParam = searchParams.get('project');
    if (projectParam) {
      const projectId = parseInt(projectParam);
      if (!isNaN(projectId)) {
        setSelectedProjectFilter(projectId);
      }
    }
  }, [searchParams]);

  // Load all plans on mount
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadAllPlans();
    }
  }, [authLoading, isAuthenticated]);

  // Parse layout data when plan is selected
  useEffect(() => {
    if (selectedPlan?.layout_data) {
      try {
        const parsed = JSON.parse(selectedPlan.layout_data);
        setLayoutData(parsed);
      } catch (e) {
        console.error('Error parsing layout data:', e);
        setLayoutData(null);
      }
    } else {
      setLayoutData(null);
    }
    // Reset image state when plan changes
    setImageLoaded(false);
    setImageError(false);
    setScale(1);
  }, [selectedPlan]);

  const loadAllPlans = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch all projects
      const projectsResponse = await api.getProjects();
      const allProjects = projectsResponse.projects || [];
      setProjects(allProjects);
      
      // Fetch floor plans for projects with status 'generated'
      const generatedProjects = allProjects.filter(p => p.status === 'generated');
      
      const allPlans: FloorPlanWithProject[] = [];
      
      for (const project of generatedProjects) {
        try {
          const projectPlans = await api.getFloorPlans(project.id);
          const plansWithProject = projectPlans.map(plan => ({
            ...plan,
            project
          }));
          allPlans.push(...plansWithProject);
        } catch (err) {
          console.error(`Error fetching plans for project ${project.id}:`, err);
        }
      }
      
      // Sort by creation date (newest first)
      allPlans.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
      
      setPlans(allPlans);
    } catch (err) {
      console.error('Error loading plans:', err);
      setError(err instanceof Error ? err.message : 'Failed to load floor plans');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle ignoring an error or warning - animate out then remove
  const handleIgnoreItem = async (itemType: 'error' | 'warning', itemText: string) => {
    if (!selectedPlan || !layoutData) return;
    
    // Step 1: Mark item for removal (triggers fade-out animation)
    setRemovingItems(prev => new Set(prev).add(itemText));
    
    // Step 2: Wait for animation to complete (300ms)
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Step 3: Actually remove the item from data
    const updatedLayoutData = { ...layoutData };
    
    if (updatedLayoutData.validation) {
      if (itemType === 'error' && updatedLayoutData.validation.all_errors) {
        updatedLayoutData.validation.all_errors = updatedLayoutData.validation.all_errors.filter(
          e => e !== itemText
        );
        if (updatedLayoutData.validation.summary) {
          updatedLayoutData.validation.summary.total_errors = updatedLayoutData.validation.all_errors.length;
        }
      } else if (itemType === 'warning' && updatedLayoutData.validation.all_warnings) {
        updatedLayoutData.validation.all_warnings = updatedLayoutData.validation.all_warnings.filter(
          w => w !== itemText
        );
        if (updatedLayoutData.validation.summary) {
          updatedLayoutData.validation.summary.total_warnings = updatedLayoutData.validation.all_warnings.length;
        }
      }
    }
    
    // Update layoutData (this updates the validation panel)
    setLayoutData(updatedLayoutData);
    
    // Clear from removing set
    setRemovingItems(prev => {
      const next = new Set(prev);
      next.delete(itemText);
      return next;
    });
    
    // Update plans array for persistence
    const updatedLayoutDataString = JSON.stringify(updatedLayoutData);
    setPlans(prevPlans => 
      prevPlans.map(p => 
        p.id === selectedPlan.id 
          ? { ...p, layout_data: updatedLayoutDataString }
          : p
      )
    );
    
    // Background API call - fire and forget with silent error handling
    const token = localStorage.getItem('auth_token') || localStorage.getItem('access_token');
    
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/plans/${selectedPlan.project_id}/plans/${selectedPlan.id}/layout-data`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      body: JSON.stringify({
        layout_data: updatedLayoutDataString
      }),
    }).catch(err => {
      // Silent error - just log to console
      console.error(`Failed to persist ignored ${itemType}:`, err);
    });
  };

  // Handle fixing an error or warning using AI (background task with polling)
  const handleFixItem = async (itemType: 'error' | 'warning', itemText: string) => {
    if (!selectedPlan || !layoutData) return;
    
    // Set fixing state
    setFixingError(itemText);
    setFixingSuccess(null);
    setFixingMessage(AI_FIXING_MESSAGES[0]);
    
    // Rotate through AI messages every 3 seconds
    let messageIndex = 0;
    const messageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % AI_FIXING_MESSAGES.length;
      setFixingMessage(AI_FIXING_MESSAGES[messageIndex]);
    }, 3000);
    
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('access_token');
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      // Step 1: Trigger the fix (returns immediately)
      const triggerResponse = await fetch(
        `${API_URL}/api/v1/plans/${selectedPlan.project_id}/plans/${selectedPlan.id}/fix-error`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
          body: JSON.stringify({
            error_text: itemText,
            error_type: itemType
          }),
        }
      );
      
      if (!triggerResponse.ok) {
        const errorData = await triggerResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to start fix');
      }
      
      // Step 2: Poll for completion
      const pollForCompletion = async (): Promise<any> => {
        const statusResponse = await fetch(
          `${API_URL}/api/v1/plans/${selectedPlan.project_id}/plans/${selectedPlan.id}/fix-status`,
          {
            headers: {
              ...(token && { 'Authorization': `Bearer ${token}` }),
            },
          }
        );
        
        if (!statusResponse.ok) {
          throw new Error('Failed to check fix status');
        }
        
        const status = await statusResponse.json();
        
        if (status.status === 'fixing') {
          // Still in progress, wait and poll again
          await new Promise(resolve => setTimeout(resolve, 2000));
          return pollForCompletion();
        } else if (status.status === 'error') {
          throw new Error(status.error || 'Fix failed');
        } else if (status.status === 'completed') {
          return status;
        }
        
        throw new Error('Unknown status');
      };
      
      const result = await pollForCompletion();
      
      // Show success
      setFixingSuccess(true);
      
      // Update the plan with new data including compliance
      if (result.preview_image_url) {
        if (result.layout_data) {
          const newLayoutData = JSON.parse(result.layout_data);
          setLayoutData(newLayoutData);
        }
        
        // Include all updated fields from the fix result
        const updatedPlan = {
          ...selectedPlan,
          preview_image_url: result.preview_image_url,
          layout_data: result.layout_data,
          compliance_data: result.compliance_data,
          is_compliant: result.is_compliant,
          updated_at: new Date().toISOString()
        };
        
        setPlans(prevPlans =>
          prevPlans.map(p =>
            p.id === selectedPlan.id ? updatedPlan : p
          )
        );
        
        setImageLoaded(false);
        setImageError(false);
        setSelectedPlan(updatedPlan);
        
        // Log if the fix was successful
        if (result.fix_resolved) {
          console.log('Fix successfully resolved the error');
        }
      }
      
      // Brief pause to show success
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (err) {
      console.error(`Error fixing ${itemType}:`, err);
      setFixingSuccess(false);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } finally {
      clearInterval(messageInterval);
      setFixingError(null);
      setFixingMessage('');
      setFixingSuccess(null);
    }
  };

  // Filter plans for gallery view
  const filteredPlans = plans.filter(plan => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesProject = plan.project?.name?.toLowerCase().includes(query);
      const matchesType = plan.plan_type?.toLowerCase().includes(query);
      const matchesLocation = plan.project?.suburb?.toLowerCase().includes(query);
      if (!matchesProject && !matchesType && !matchesLocation) return false;
    }
    
    if (selectedProjectFilter !== 'all' && plan.project_id !== selectedProjectFilter) {
      return false;
    }
    
    if (selectedVariantFilter !== 'all' && plan.variant_number !== selectedVariantFilter) {
      return false;
    }
    
    return true;
  });

  const formatDate = (dateString: string | undefined, includeTime = false) => {
    if (!dateString) return '—';
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(includeTime && { hour: '2-digit', minute: '2-digit' })
    };
    return new Date(dateString).toLocaleDateString('en-AU', options);
  };

  const handleViewPlan = (plan: FloorPlanWithProject) => {
    setSelectedPlan(plan);
  };

  const handleBackToGallery = () => {
    setSelectedPlan(null);
    setLayoutData(null);
  };

  const handleDownload = async (plan: FloorPlanWithProject, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!plan.preview_image_url) return;
    
    setDownloading(true);
    try {
      const response = await fetch(plan.preview_image_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `floor_plan_${plan.project?.name || plan.project_id}_v${plan.variant_number || 1}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  // =========================================================================
  // DETAIL VIEW - When a plan is selected
  // =========================================================================
  if (selectedPlan) {
    const variant = VARIANT_INFO[selectedPlan.variant_number || 1] || VARIANT_INFO[1];
    
    return (
      <div className="min-h-screen lg:h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 overflow-auto lg:overflow-hidden flex flex-col relative">
        {/* Simple AI Fixing Overlay */}
        {fixingError && (
          <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-2xl border border-white/10 p-8 max-w-md w-full text-center shadow-2xl">
              
              {/* Simple spinner */}
              <div className="relative w-16 h-16 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-blue-500/20" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
                {fixingSuccess === true ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  </div>
                ) : fixingSuccess === false ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-400" />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-blue-400" />
                  </div>
                )}
              </div>
              
              {/* Title */}
              <h3 className="text-lg font-semibold text-white mb-2">
                {fixingSuccess === true ? 'Fixed!' : 
                 fixingSuccess === false ? 'Fix Failed' : 
                 'AI is fixing...'}
              </h3>
              
              {/* Message */}
              <p className="text-gray-400 text-sm mb-4">
                {fixingSuccess === true ? 'Your floor plan has been updated.' :
                 fixingSuccess === false ? 'Please try again.' :
                 fixingMessage}
              </p>
              
              {/* Error being fixed */}
              <div className="bg-white/5 rounded-lg p-3 text-left">
                <p className="text-xs text-gray-500 mb-1">Issue:</p>
                <p className={`text-sm ${fixingSuccess === true ? 'text-green-400 line-through' : 'text-gray-300'}`}>
                  {fixingError}
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Header */}
        <div className="bg-slate-800/50 border-b border-white/10 z-10 backdrop-blur-sm flex-shrink-0">
          <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <button 
                onClick={handleBackToGallery}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-white truncate">{selectedPlan.project?.name || 'Floor Plan'}</h1>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                  <span className="text-gray-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {selectedPlan.project?.suburb}, {selectedPlan.project?.state}
                  </span>
                  <span className={variant.color.replace('bg-', 'text-').split(' ')[1]}>
                    {variant.icon} {variant.name}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 justify-end">
              {/* Zoom Controls */}
              <div className="hidden sm:flex items-center gap-1 bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}
                  className="p-2 text-gray-400 hover:text-white transition"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-white text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
                <button
                  onClick={() => setScale(s => Math.min(s + 0.25, 3))}
                  className="p-2 text-gray-400 hover:text-white transition"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setScale(1)}
                  className="p-2 text-gray-400 hover:text-white transition"
                  title="Reset zoom"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
              
              {/* Toggle Details */}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className={`p-2 rounded-lg transition ${showDetails ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                title="Toggle details panel"
              >
                <Info className="w-5 h-5" />
              </button>
              
              {/* Download */}
              {selectedPlan.preview_image_url && (
                <button
                  onClick={() => handleDownload(selectedPlan)}
                  disabled={downloading}
                  className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 text-sm"
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Download</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-auto lg:overflow-hidden">
          {/* Left Section: Floor Plan (60%) + Errors Panel (40%) */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-visible lg:overflow-hidden">
            {/* Floor Plan Image - Portrait orientation, trimmed whitespace */}
            <div className="w-full lg:w-[60%] p-3 sm:p-4 lg:p-6 flex items-center justify-center overflow-visible lg:overflow-hidden min-h-[300px] sm:min-h-[400px]">
              {selectedPlan.preview_image_url ? (
                <div className="bg-white rounded-xl shadow-xl flex items-center justify-center p-2 overflow-hidden h-full w-full">
                  <img
                    src={`${selectedPlan.preview_image_url}?t=${selectedPlan.updated_at || Date.now()}`}
                    alt="Floor Plan"
                    className="max-h-full max-w-full object-contain transition-transform"
                    style={{ transform: `scale(${scale})` }}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageError(true)}
                  />
                  
                  {!imageLoaded && !imageError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                      <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white/5 rounded-xl p-10 sm:p-20 text-center">
                  <Layers className="w-12 h-12 sm:w-16 sm:h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-sm">No image available for this floor plan</p>
                </div>
              )}
            </div>

            {/* Errors & Warnings Panel - 40% */}
            <div className="w-full lg:w-[40%] p-3 sm:p-4 lg:p-6 border-t lg:border-t-0 lg:border-l border-white/10 overflow-y-auto">
              <div className="space-y-4">
                <h3 className="text-white font-semibold flex items-center gap-2 text-sm sm:text-base">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
                  Validation Results
                </h3>

                {/* Validation Summary - Now at the top */}
                {layoutData?.validation?.summary && (
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <h4 className="text-white font-medium text-sm mb-3">Summary</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Council</span>
                        <span className={layoutData.validation.summary.council_compliant ? 'text-green-400' : 'text-red-400'}>
                          {layoutData.validation.summary.council_compliant ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">NCC</span>
                        <span className={layoutData.validation.summary.ncc_compliant ? 'text-green-400' : 'text-red-400'}>
                          {layoutData.validation.summary.ncc_compliant ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Layout</span>
                        <span className={layoutData.validation.summary.layout_valid ? 'text-green-400' : 'text-red-400'}>
                          {layoutData.validation.summary.layout_valid ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Coverage</span>
                        <span className="text-white">{layoutData.validation.summary.coverage_percent}%</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Errors Section */}
                {(() => {
                  const errors = layoutData?.validation?.all_errors || [];
                  
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        <span className="text-red-400 font-medium">Errors ({errors.length})</span>
                      </div>
                      {errors.length > 0 ? (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(239, 68, 68, 0.3) transparent' }}>
                          {errors.map((error, index) => {
                            // Parse category from error message (e.g., "Council: ..." or "NCC: ...")
                            const [category, ...messageParts] = error.split(': ');
                            const message = messageParts.join(': ') || category;
                            const hasCategory = messageParts.length > 0;
                            const isRemoving = removingItems.has(error);
                            
                            return (
                              <div 
                                key={error} 
                                className={`bg-red-500/10 rounded-xl p-3 border border-red-500/30 group/item relative overflow-hidden cursor-pointer hover:border-red-500/60 transition-all duration-300 ${isRemoving ? 'opacity-0 scale-95 -translate-x-4' : 'opacity-100 scale-100 translate-x-0'}`}
                              >
                                {/* Content - blurs on hover */}
                                <div className="text-sm text-gray-300 group-hover/item:blur-[2px] group-hover/item:opacity-40 transition-all duration-200">
                                  {hasCategory && (
                                    <span className="text-red-400/70 text-xs font-medium mr-1.5">[{category}]</span>
                                  )}
                                  <span>{message}</span>
                                </div>
                                
                                {/* Hover overlay with buttons */}
                                <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-0 group-hover/item:opacity-100 transition-all duration-200">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleFixItem('error', error);
                                    }}
                                    disabled={fixingError !== null}
                                    className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Sparkles className="w-4 h-4" />
                                    AI Fix
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleIgnoreItem('error', error);
                                    }}
                                    className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-transform hover:scale-105"
                                  >
                                    <X className="w-4 h-4" />
                                    Ignore
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="bg-green-500/10 rounded-xl p-3 border border-green-500/30">
                          <p className="text-green-400 text-sm">No errors detected ✓</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Warnings Section */}
                {(() => {
                  const warnings = layoutData?.validation?.all_warnings || [];
                  
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        <span className="text-yellow-400 font-medium">Warnings ({warnings.length})</span>
                      </div>
                      {warnings.length > 0 ? (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(234, 179, 8, 0.3) transparent' }}>
                          {warnings.map((warning, index) => {
                            // Parse category from warning message
                            const [category, ...messageParts] = warning.split(': ');
                            const message = messageParts.join(': ') || category;
                            const hasCategory = messageParts.length > 0;
                            const isRemoving = removingItems.has(warning);
                            
                            return (
                              <div 
                                key={warning} 
                                className={`bg-yellow-500/10 rounded-xl p-3 border border-yellow-500/30 group/item relative overflow-hidden cursor-pointer hover:border-yellow-500/60 transition-all duration-300 ${isRemoving ? 'opacity-0 scale-95 -translate-x-4' : 'opacity-100 scale-100 translate-x-0'}`}
                              >
                                {/* Content - blurs on hover */}
                                <div className="text-sm text-gray-300 group-hover/item:blur-[2px] group-hover/item:opacity-40 transition-all duration-200">
                                  {hasCategory && (
                                    <span className="text-yellow-400/70 text-xs font-medium mr-1.5">[{category}]</span>
                                  )}
                                  <span>{message}</span>
                                </div>
                                
                                {/* Hover overlay with buttons */}
                                <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-0 group-hover/item:opacity-100 transition-all duration-200">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleFixItem('warning', warning);
                                    }}
                                    disabled={fixingError !== null}
                                    className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Sparkles className="w-4 h-4" />
                                    AI Fix
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleIgnoreItem('warning', warning);
                                    }}
                                    className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-transform hover:scale-105"
                                  >
                                    <X className="w-4 h-4" />
                                    Ignore
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="bg-green-500/10 rounded-xl p-3 border border-green-500/30">
                          <p className="text-green-400 text-sm">No warnings detected ✓</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Details Sidebar - Fixed width */}
          {showDetails && (
            <div className="lg:w-80 p-4 lg:p-6 lg:border-l border-white/10 overflow-y-auto bg-slate-900/50">
              <div className="space-y-6">
                {/* Variant Info */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{variant.icon}</span>
                    <div>
                      <h3 className="text-white font-semibold">{variant.name}</h3>
                      <p className="text-gray-400 text-sm">{variant.description}</p>
                    </div>
                  </div>
                </div>

                {/* Plan Summary */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                    <Home className="w-5 h-5 text-blue-400" />
                    Plan Summary
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-white/5 rounded-lg">
                      <p className="text-2xl font-bold text-white">
                        {selectedPlan.total_area ? Math.round(selectedPlan.total_area) : '—'}
                      </p>
                      <p className="text-gray-400 text-xs">Total Area (m²)</p>
                    </div>
                    {selectedPlan.living_area && (
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <p className="text-2xl font-bold text-white">{Math.round(selectedPlan.living_area)}</p>
                        <p className="text-gray-400 text-xs">Living Area (m²)</p>
                      </div>
                    )}
                    {selectedPlan.project?.bedrooms && (
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <Bed className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                        <p className="text-xl font-bold text-white">{selectedPlan.project.bedrooms}</p>
                        <p className="text-gray-400 text-xs">Bedrooms</p>
                      </div>
                    )}
                    {selectedPlan.project?.bathrooms && (
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <Bath className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                        <p className="text-xl font-bold text-white">{selectedPlan.project.bathrooms}</p>
                        <p className="text-gray-400 text-xs">Bathrooms</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Building Envelope */}
                {layoutData?.building_envelope && (
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Ruler className="w-5 h-5 text-blue-400" />
                      Building Envelope
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Width</span>
                        <span className="text-white">{layoutData.building_envelope.width?.toFixed(1)}m</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Depth</span>
                        <span className="text-white">{layoutData.building_envelope.depth?.toFixed(1)}m</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generation Info */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-400" />
                    Generation Info
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Created</span>
                      <span className="text-white">{formatDate(selectedPlan.created_at, true)}</span>
                    </div>
                    {selectedPlan.generation_time_seconds && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Generation Time</span>
                        <span className="text-white">{selectedPlan.generation_time_seconds.toFixed(1)}s</span>
                      </div>
                    )}
                    {selectedPlan.ai_model_version && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">AI Model</span>
                        <span className="text-white text-xs">{selectedPlan.ai_model_version}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Back to Project */}
                <button
                  onClick={() => router.push(`/dashboard/projects/${selectedPlan.project_id}`)}
                  className="w-full bg-white/5 text-white py-3 rounded-lg hover:bg-white/10 transition flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5" />
                  View Project Details
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // GALLERY VIEW - List of all plans (/dashboard/plans)
  // =========================================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 sm:gap-3">
          <Layers className="w-6 h-6 sm:w-7 sm:h-7 text-blue-400" />
          Generated Floor Plans
        </h1>
        <p className="text-gray-400 mt-1 text-sm">
          View and download all your AI-generated floor plans
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white/5 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 border border-white/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search by project name, location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
          
          <div className="flex gap-2 sm:gap-4">
            {/* Project Filter */}
            <select
              value={selectedProjectFilter}
              onChange={(e) => setSelectedProjectFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm"
            >
              <option value="all" className="bg-slate-800">All Projects</option>
              {projects.filter(p => p.status === 'generated').map(project => (
                <option key={project.id} value={project.id} className="bg-slate-800">{project.name}</option>
              ))}
            </select>
            
            {/* Variant Filter */}
            <select
              value={selectedVariantFilter}
              onChange={(e) => setSelectedVariantFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm"
            >
              <option value="all" className="bg-slate-800">All Variants</option>
              <option value={1} className="bg-slate-800">⚡ Optimal</option>
              <option value={2} className="bg-slate-800">🏠 Spacious</option>
              <option value={3} className="bg-slate-800">👑 Master</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="bg-white/5 rounded-xl p-3 sm:p-4 border border-white/10">
          <p className="text-gray-400 text-xs sm:text-sm">Total Plans</p>
          <p className="text-xl sm:text-2xl font-bold text-white">{plans.length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 sm:p-4 border border-white/10">
          <p className="text-gray-400 text-xs sm:text-sm">Projects</p>
          <p className="text-xl sm:text-2xl font-bold text-white">{projects.filter(p => p.status === 'generated').length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 sm:p-4 border border-white/10">
          <p className="text-gray-400 text-xs sm:text-sm">Compliant</p>
          <p className="text-xl sm:text-2xl font-bold text-green-400">{plans.filter(p => p.is_compliant).length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 sm:p-4 border border-white/10">
          <p className="text-gray-400 text-xs sm:text-sm">Showing</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-400">{filteredPlans.length}</p>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading floor plans...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-white font-medium mb-2">Error Loading Plans</p>
          <p className="text-gray-400 text-sm">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredPlans.length === 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
          <Layers className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No Floor Plans Found</h3>
          <p className="text-gray-400 mb-6">
            {plans.length === 0 
              ? "You haven't generated any floor plans yet. Create a project and generate plans to see them here."
              : "No plans match your current filters. Try adjusting your search."
            }
          </p>
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition"
          >
            Go to Projects
          </button>
        </div>
      )}

      {/* Plans List */}
      {!isLoading && !error && filteredPlans.length > 0 && (
        <div className="flex flex-col gap-2">
          {filteredPlans.map((plan) => {
            const variant = VARIANT_INFO[plan.variant_number || 1] || VARIANT_INFO[1];
            
            return (
              <div
                key={plan.id}
                className="bg-white/5 rounded-lg border border-white/10 overflow-hidden hover:border-blue-500/50 transition cursor-pointer flex items-center gap-4 p-4"
                onClick={() => handleViewPlan(plan)}
              >
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-white truncate text-sm">
                      {plan.project?.name || `Project ${plan.project_id}`}
                    </h3>
                    {/* Variant Badge */}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${variant.color} flex-shrink-0`}>
                      {variant.icon} {variant.name}
                    </span>
                  </div>
                  
                  <p className="text-gray-400 text-xs flex items-center gap-1 mb-2">
                    <MapPin className="w-3 h-3" />
                    {plan.project?.suburb}, {plan.project?.state}
                  </p>
                  
                  {/* Stats Row */}
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    {plan.total_area && (
                      <span className="flex items-center gap-1">
                        <Home className="w-3.5 h-3.5" />
                        {Math.round(plan.total_area)}m²
                      </span>
                    )}
                    {plan.project?.bedrooms && (
                      <span className="flex items-center gap-1">
                        <Bed className="w-3.5 h-3.5" />
                        {plan.project.bedrooms} Beds
                      </span>
                    )}
                    {plan.project?.bathrooms && (
                      <span className="flex items-center gap-1">
                        <Bath className="w-3.5 h-3.5" />
                        {plan.project.bathrooms} Baths
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Compliance Status */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  <div className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                    plan.is_compliant 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-orange-500/20 text-orange-400'
                  }`}>
                    {plan.is_compliant ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        Compliant
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        Needs Review
                      </>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightboxPlan && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxPlan(null)}
        >
          <button 
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white"
            onClick={() => setLightboxPlan(null)}
          >
            <X className="w-8 h-8" />
          </button>
          
          <div className="max-w-5xl max-h-[90vh] overflow-auto">
            {lightboxPlan.preview_image_url ? (
              <img
                src={lightboxPlan.preview_image_url}
                alt={lightboxPlan.plan_type || 'Floor Plan'}
                className="max-w-full h-auto bg-white rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="bg-slate-800 rounded-lg p-20 text-center">
                <ImageIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No image available</p>
              </div>
            )}
          </div>
          
          {/* Plan Info */}
          <div 
            className="absolute bottom-4 left-4 right-4 bg-black/70 rounded-lg p-4 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">{lightboxPlan.project?.name}</h3>
                <p className="text-gray-400 text-sm">
                  {VARIANT_INFO[lightboxPlan.variant_number || 1]?.icon} {VARIANT_INFO[lightboxPlan.variant_number || 1]?.name}
                  {lightboxPlan.total_area && ` • ${Math.round(lightboxPlan.total_area)}m²`}
                </p>
              </div>
              <div className="flex gap-2">
                {lightboxPlan.preview_image_url && (
                  <button
                    onClick={(e) => handleDownload(lightboxPlan, e)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                )}
                <button
                  onClick={() => {
                    setLightboxPlan(null);
                    handleViewPlan(lightboxPlan);
                  }}
                  className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition flex items-center gap-2"
                >
                  View Details
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
