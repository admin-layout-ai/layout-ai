// frontend/lib/api.ts
// API Client with user sync and authentication

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Project {
  id: number;
  name: string;
  status: string;
  bedrooms?: number;
  bathrooms?: number;
  created_at: string;
}

export interface QuestionnaireData {
  bedrooms: number;
  bathrooms: number;
  living_areas: number;
  garage_spaces: number;
  storeys: number;
  style: string;
  open_plan: boolean;
  outdoor_entertainment: boolean;
  home_office: boolean;
  budget_min?: number;
  budget_max?: number;
}

export interface UserProfile {
  id: number;
  b2c_id: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  phone_number?: string;
  identity_provider?: string;
  company_name?: string;
  company_abn?: string;
  address?: string;
  created_at?: string;
  last_login?: string;
}

export interface DashboardData {
  user: {
    id: string;
    email?: string;
    name?: string;
  };
  stats: {
    total_projects: number;
    completed_projects: number;
    plans_generated: number;
    total_spent: number;
  };
  recent_projects: Project[];
}

class APIClient {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  // Helper method to get auth headers
  private async getAuthHeaders(token?: string): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  // ==========================================================================
  // USER ENDPOINTS
  // ==========================================================================

  /**
   * Get or create user profile
   * This should be called on first dashboard load to sync user with backend
   */
  async syncUser(token: string): Promise<UserProfile> {
    const response = await fetch(`${this.baseUrl}/api/v1/users/me`, {
      method: 'GET',
      headers: await this.getAuthHeaders(token),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to sync user: ${error}`);
    }
    
    return response.json();
  }

  /**
   * Update user profile
   */
  async updateUserProfile(token: string, data: Partial<UserProfile>): Promise<UserProfile> {
    const response = await fetch(`${this.baseUrl}/api/v1/users/me`, {
      method: 'PUT',
      headers: await this.getAuthHeaders(token),
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update user: ${error}`);
    }
    
    return response.json();
  }

  /**
   * Get dashboard data (user info, stats, recent projects)
   */
  async getDashboardData(token: string): Promise<DashboardData> {
    const response = await fetch(`${this.baseUrl}/api/v1/users/me/dashboard`, {
      method: 'GET',
      headers: await this.getAuthHeaders(token),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get dashboard data: ${error}`);
    }
    
    return response.json();
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(token: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/users/me/preferences`, {
      method: 'GET',
      headers: await this.getAuthHeaders(token),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get preferences: ${error}`);
    }
    
    return response.json();
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(token: string, preferences: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/users/me/preferences`, {
      method: 'PUT',
      headers: await this.getAuthHeaders(token),
      body: JSON.stringify(preferences),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update preferences: ${error}`);
    }
    
    return response.json();
  }

  // ==========================================================================
  // PROJECT ENDPOINTS
  // ==========================================================================
  
  async createProject(name: string, userId: number, token?: string): Promise<Project> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/?user_id=${userId}`, {
      method: 'POST',
      headers: await this.getAuthHeaders(token),
      body: JSON.stringify({ name })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create project: ${error}`);
    }
    return response.json();
  }
  
  async listProjects(userId: number, token?: string): Promise<Project[]> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/projects/?user_id=${userId}`,
      {
        headers: await this.getAuthHeaders(token),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch projects: ${error}`);
    }
    return response.json();
  }

  /**
   * List projects for authenticated user (uses token to identify user)
   */
  async listMyProjects(token: string): Promise<Project[]> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/projects/`,
      {
        headers: await this.getAuthHeaders(token),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch projects: ${error}`);
    }
    return response.json();
  }
  
  async getProject(projectId: number, userId: number, token?: string): Promise<Project> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/projects/${projectId}?user_id=${userId}`,
      {
        headers: await this.getAuthHeaders(token),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch project: ${error}`);
    }
    return response.json();
  }
  
  async submitQuestionnaire(
    projectId: number,
    userId: number,
    data: QuestionnaireData,
    token?: string
  ): Promise<Project> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/projects/${projectId}/questionnaire?user_id=${userId}`,
      {
        method: 'POST',
        headers: await this.getAuthHeaders(token),
        body: JSON.stringify(data)
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to submit questionnaire: ${error}`);
    }
    return response.json();
  }

  async deleteProject(projectId: number, token: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/projects/${projectId}`,
      {
        method: 'DELETE',
        headers: await this.getAuthHeaders(token),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete project: ${error}`);
    }
  }
}

export const api = new APIClient(API_URL);
