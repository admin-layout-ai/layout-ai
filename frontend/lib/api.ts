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

class APIClient {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  // ========== NEW: Helper method to get auth headers ==========
  private async getAuthHeaders(token?: string): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    // Add authorization header if token is provided
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }
  
  // ========== UPDATED: All methods now accept token parameter ==========
  
  async createProject(name: string, userId: number, token?: string): Promise<Project> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/?user_id=${userId}`, {
      method: 'POST',
      headers: await this.getAuthHeaders(token),  // ← Added auth headers
      body: JSON.stringify({ name })
    });
    
    if (!response.ok) {
      // Better error handling
      const error = await response.text();
      throw new Error(`Failed to create project: ${error}`);
    }
    return response.json();
  }
  
  async listProjects(userId: number, token?: string): Promise<Project[]> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/projects/?user_id=${userId}`,
      {
        headers: await this.getAuthHeaders(token),  // ← Added auth headers
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
        headers: await this.getAuthHeaders(token),  // ← Added auth headers
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
    token?: string  // ← Added token parameter
  ): Promise<Project> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/projects/${projectId}/questionnaire?user_id=${userId}`,
      {
        method: 'POST',
        headers: await this.getAuthHeaders(token),  // ← Added auth headers
        body: JSON.stringify(data)
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to submit questionnaire: ${error}`);
    }
    return response.json();
  }
}

export const api = new APIClient(API_URL);