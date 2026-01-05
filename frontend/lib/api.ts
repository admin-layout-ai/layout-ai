// frontend/lib/api.ts
// API client for Layout AI backend

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// =============================================================================
// Types - Match database schema
// =============================================================================

export interface User {
  id: number;
  azure_ad_id: string;
  email: string;
  full_name: string;
  company_name?: string;
  phone?: string;
  is_active: boolean;
  is_builder: boolean;
  subscription_tier: string;
}

export interface Project {
  id: number;
  user_id: number;
  name: string;
  status?: string;
  
  // Land details
  land_width?: number;
  land_depth?: number;
  land_area?: number;
  land_slope?: string;
  orientation?: string;
  street_frontage?: string;
  contour_plan_url?: string;
  
  // Building requirements
  bedrooms?: number;
  bathrooms?: number;
  living_areas?: number;
  garage_spaces?: number;
  storeys?: number;
  
  // Style preferences
  style?: string;
  open_plan?: boolean;
  outdoor_entertainment?: boolean;
  home_office?: boolean;
  
  // Location details
  lot_dp?: string;
  street_address?: string;
  state?: string;
  postcode?: string;
  council?: string;
  bal_rating?: string;
  
  // Timestamps
  created_at: string;
  updated_at?: string;
}

export interface ProjectCreateData {
  name: string;
  
  // Land details
  land_width?: number;
  land_depth?: number;
  land_area?: number;
  land_slope?: string;
  orientation?: string;
  street_frontage?: string;
  contour_plan_url?: string;
  
  // Building requirements
  bedrooms?: number;
  bathrooms?: number;
  living_areas?: number;
  garage_spaces?: number;
  storeys?: number;
  
  // Style preferences
  style?: string;
  open_plan?: boolean;
  outdoor_entertainment?: boolean;
  home_office?: boolean;
  
  // Location details
  lot_dp?: string;
  street_address?: string;
  state: string;      // Mandatory
  postcode: string;   // Mandatory
  council?: string;
  bal_rating?: string;
}

export interface FloorPlan {
  id: number;
  project_id: number;
  variant_number: number;
  name?: string;
  description?: string;
  floor_plan_url?: string;
  pdf_url?: string;
  thumbnail_url?: string;
  total_area?: number;
  room_layout?: Record<string, any>;
  is_favorite: boolean;
  user_rating?: number;
  user_notes?: string;
  created_at: string;
}

export interface SubscriptionStatus {
  tier: string;
  project_count: number;
  project_limit: number;
  can_create_project: boolean;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
  page: number;
  page_size: number;
}

// =============================================================================
// API Client Class
// =============================================================================

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  private getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getAuthToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}${endpoint}`;
    console.log(`API Request: ${options.method || 'GET'} ${url}`);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        
        if (response.status === 401) {
          console.error('Unauthorized - token may be expired');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth-error', { detail: errorMessage }));
          }
        }
        
        throw new Error(errorMessage);
      }

      if (response.status === 204) {
        return {} as T;
      }

      return response.json();
    } catch (error) {
      console.error(`API Error for ${endpoint}:`, error);
      throw error;
    }
  }

  // User Endpoints
  async getCurrentUser(): Promise<User> {
    return this.request<User>('/api/v1/users/me');
  }

  async updateUser(data: Partial<User>): Promise<User> {
    return this.request<User>('/api/v1/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    return this.request<SubscriptionStatus>('/api/v1/users/me/subscription');
  }

  // Project Endpoints
  async createProject(data: ProjectCreateData): Promise<Project> {
    return this.request<Project>('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getProjects(page = 1, pageSize = 10, status?: string): Promise<ProjectListResponse> {
    let url = `/api/v1/projects?page=${page}&page_size=${pageSize}`;
    if (status) {
      url += `&status_filter=${status}`;
    }
    return this.request<ProjectListResponse>(url);
  }

  async getProject(projectId: number): Promise<Project> {
    return this.request<Project>(`/api/v1/projects/${projectId}`);
  }

  async updateProject(projectId: number, data: Partial<Project>): Promise<Project> {
    return this.request<Project>(`/api/v1/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(projectId: number): Promise<void> {
    return this.request<void>(`/api/v1/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  async generateFloorPlans(projectId: number): Promise<Project> {
    return this.request<Project>(`/api/v1/projects/${projectId}/generate`, {
      method: 'POST',
    });
  }

  // Floor Plan Endpoints
  async getFloorPlans(projectId: number): Promise<FloorPlan[]> {
    return this.request<FloorPlan[]>(`/api/v1/plans/project/${projectId}`);
  }

  async getFloorPlan(planId: number): Promise<FloorPlan> {
    return this.request<FloorPlan>(`/api/v1/plans/${planId}`);
  }

  async updateFloorPlan(planId: number, data: Partial<FloorPlan>): Promise<FloorPlan> {
    return this.request<FloorPlan>(`/api/v1/plans/${planId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async toggleFavorite(planId: number): Promise<FloorPlan> {
    return this.request<FloorPlan>(`/api/v1/plans/${planId}/favorite`, {
      method: 'POST',
    });
  }

  async ratePlan(planId: number, rating: number): Promise<FloorPlan> {
    return this.request<FloorPlan>(`/api/v1/plans/${planId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
  }

  // Payment Endpoints
  async createCheckoutSession(planName: string): Promise<{ checkout_url: string }> {
    return this.request<{ checkout_url: string }>('/api/v1/payments/create-checkout', {
      method: 'POST',
      body: JSON.stringify({ plan_name: planName }),
    });
  }

  async getPaymentHistory(): Promise<any[]> {
    return this.request<any[]>('/api/v1/payments/history');
  }
}

export const api = new ApiClient();
export default api;
