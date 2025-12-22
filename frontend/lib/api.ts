// frontend/lib/api.ts
// API Client - FIXED: Better error handling, proper typing, and auth integration

import type { 
  Project, 
  ProjectCreateRequest,
  UserProfile, 
  DashboardData, 
  QuestionnaireData,
  PaymentSession,
  ApiError 
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Custom error class for API errors
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public detail?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Helper to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    let detail: string | undefined;

    try {
      const errorData: ApiError = await response.json();
      errorMessage = errorData.detail || errorMessage;
      detail = errorData.detail;
    } catch {
      // If we can't parse the error, use the status text
      errorMessage = response.statusText || errorMessage;
    }

    throw new APIError(errorMessage, response.status, detail);
  }

  // Handle empty responses (e.g., 204 No Content)
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

class APIClient {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  // Helper method to get auth headers
  private getAuthHeaders(token?: string): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  // ============================================================================
  // USER ENDPOINTS
  // ============================================================================

  /**
   * Get or create user profile
   * This should be called on first dashboard load to sync user with backend
   */
  async syncUser(token: string): Promise<UserProfile> {
    const response = await fetch(`${this.baseUrl}/api/v1/users/me`, {
      method: 'GET',
      headers: this.getAuthHeaders(token),
    });
    
    return handleResponse<UserProfile>(response);
  }

  /**
   * Update user profile
   */
  async updateUserProfile(token: string, data: Partial<UserProfile>): Promise<UserProfile> {
    const response = await fetch(`${this.baseUrl}/api/v1/users/me`, {
      method: 'PUT',
      headers: this.getAuthHeaders(token),
      body: JSON.stringify(data),
    });
    
    return handleResponse<UserProfile>(response);
  }

  /**
   * Get dashboard data (user info, stats, recent projects)
   */
  async getDashboardData(token: string): Promise<DashboardData> {
    const response = await fetch(`${this.baseUrl}/api/v1/users/me/dashboard`, {
      method: 'GET',
      headers: this.getAuthHeaders(token),
    });
    
    return handleResponse<DashboardData>(response);
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(token: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/api/v1/users/me/preferences`, {
      method: 'GET',
      headers: this.getAuthHeaders(token),
    });
    
    return handleResponse<Record<string, unknown>>(response);
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(token: string, preferences: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/api/v1/users/me/preferences`, {
      method: 'PUT',
      headers: this.getAuthHeaders(token),
      body: JSON.stringify(preferences),
    });
    
    return handleResponse<Record<string, unknown>>(response);
  }

  // ============================================================================
  // PROJECT ENDPOINTS
  // ============================================================================
  
  /**
   * Create a new project
   */
  async createProject(token: string, data: ProjectCreateRequest): Promise<Project> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/`, {
      method: 'POST',
      headers: this.getAuthHeaders(token),
      body: JSON.stringify(data),
    });
    
    return handleResponse<Project>(response);
  }
  
  /**
   * List all projects for the authenticated user
   */
  async listProjects(token: string): Promise<Project[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/`, {
      method: 'GET',
      headers: this.getAuthHeaders(token),
    });
    
    return handleResponse<Project[]>(response);
  }
  
  /**
   * Get a single project by ID
   */
  async getProject(token: string, projectId: number): Promise<Project> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/${projectId}`, {
      method: 'GET',
      headers: this.getAuthHeaders(token),
    });
    
    return handleResponse<Project>(response);
  }

  /**
   * Update a project
   */
  async updateProject(token: string, projectId: number, data: Partial<Project>): Promise<Project> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/${projectId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(token),
      body: JSON.stringify(data),
    });
    
    return handleResponse<Project>(response);
  }
  
  /**
   * Submit questionnaire data for a project
   */
  async submitQuestionnaire(
    token: string,
    projectId: number,
    data: QuestionnaireData
  ): Promise<Project> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/${projectId}/questionnaire`, {
      method: 'POST',
      headers: this.getAuthHeaders(token),
      body: JSON.stringify(data),
    });
    
    return handleResponse<Project>(response);
  }

  /**
   * Delete a project
   */
  async deleteProject(token: string, projectId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/${projectId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(token),
    });
    
    return handleResponse<void>(response);
  }

  // ============================================================================
  // PAYMENT ENDPOINTS
  // ============================================================================

  /**
   * Create a Stripe checkout session
   */
  async createCheckoutSession(
    token: string,
    projectId: number,
    planType: string
  ): Promise<PaymentSession> {
    const response = await fetch(`${this.baseUrl}/api/v1/payments/create-checkout`, {
      method: 'POST',
      headers: this.getAuthHeaders(token),
      body: JSON.stringify({
        project_id: projectId,
        plan_type: planType,
      }),
    });
    
    return handleResponse<PaymentSession>(response);
  }

  /**
   * Verify payment status
   */
  async verifyPayment(token: string, sessionId: string): Promise<{ status: string; project_id: number }> {
    const response = await fetch(`${this.baseUrl}/api/v1/payments/verify/${sessionId}`, {
      method: 'GET',
      headers: this.getAuthHeaders(token),
    });
    
    return handleResponse<{ status: string; project_id: number }>(response);
  }

  // ============================================================================
  // FLOOR PLAN ENDPOINTS
  // ============================================================================

  /**
   * Get floor plan options for a project
   */
  async getFloorPlanOptions(token: string, projectId: number): Promise<unknown[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/${projectId}/floor-plans`, {
      method: 'GET',
      headers: this.getAuthHeaders(token),
    });
    
    return handleResponse<unknown[]>(response);
  }

  /**
   * Select a floor plan option
   */
  async selectFloorPlan(token: string, projectId: number, floorPlanId: number): Promise<Project> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/${projectId}/floor-plans/${floorPlanId}/select`, {
      method: 'POST',
      headers: this.getAuthHeaders(token),
    });
    
    return handleResponse<Project>(response);
  }

  /**
   * Download floor plan in specified format
   */
  async downloadFloorPlan(
    token: string,
    projectId: number,
    format: 'pdf' | 'dxf' | 'png'
  ): Promise<Blob> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/projects/${projectId}/download?format=${format}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new APIError('Failed to download file', response.status);
    }
    
    return response.blob();
  }

  // ============================================================================
  // FEEDBACK ENDPOINTS
  // ============================================================================

  /**
   * Submit user feedback
   */
  async submitFeedback(
    token: string,
    data: { type: string; message: string; rating?: number }
  ): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/v1/feedback`, {
      method: 'POST',
      headers: this.getAuthHeaders(token),
      body: JSON.stringify(data),
    });
    
    return handleResponse<{ success: boolean }>(response);
  }
}

// Export singleton instance
export const api = new APIClient(API_URL);

// Export the class for testing or custom instances
export { APIClient };
