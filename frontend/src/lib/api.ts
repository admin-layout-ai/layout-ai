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
  
  async createProject(name: string, userId: number): Promise<Project> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/?user_id=${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    
    if (!response.ok) throw new Error('Failed to create project');
    return response.json();
  }
  
  async listProjects(userId: number): Promise<Project[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/?user_id=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch projects');
    return response.json();
  }
  
  async getProject(projectId: number, userId: number): Promise<Project> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/${projectId}?user_id=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch project');
    return response.json();
  }
  
  async submitQuestionnaire(
    projectId: number,
    userId: number,
    data: QuestionnaireData
  ): Promise<Project> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/projects/${projectId}/questionnaire?user_id=${userId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }
    );
    
    if (!response.ok) throw new Error('Failed to submit questionnaire');
    return response.json();
  }
}

export const api = new APIClient(API_URL);