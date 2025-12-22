// frontend/lib/types.ts
// Shared TypeScript interfaces for Layout AI
// This file provides type safety across the application

// ============================================================================
// USER TYPES
// ============================================================================

export interface User {
  id: string;
  dbId?: number;
  name?: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  profilePicture?: string;
  identityProvider?: 'google' | 'microsoft' | 'email';
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

// ============================================================================
// PROJECT TYPES
// ============================================================================

export type ProjectStatus = 'draft' | 'in_progress' | 'generating' | 'completed' | 'failed';
export type DesignStyle = 'modern' | 'traditional' | 'coastal' | 'hamptons' | 'contemporary' | 'minimalist';

export interface Project {
  id: number;
  name: string;
  status: ProjectStatus;
  bedrooms?: number;
  bathrooms?: number;
  living_areas?: number;
  garage_spaces?: number;
  storeys?: number;
  land_width?: number;
  land_depth?: number;
  style?: DesignStyle;
  open_plan?: boolean;
  outdoor_entertainment?: boolean;
  home_office?: boolean;
  created_at: string;
  updated_at?: string;
  user_id?: number;
}

export interface ProjectCreateRequest {
  name: string;
  land_width?: number;
  land_depth?: number;
}

export interface ProjectUpdateRequest {
  name?: string;
  status?: ProjectStatus;
  bedrooms?: number;
  bathrooms?: number;
  living_areas?: number;
  garage_spaces?: number;
  storeys?: number;
  style?: DesignStyle;
  open_plan?: boolean;
  outdoor_entertainment?: boolean;
  home_office?: boolean;
}

// ============================================================================
// QUESTIONNAIRE TYPES
// ============================================================================

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

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export interface DashboardStats {
  total_projects: number;
  completed_projects: number;
  plans_generated: number;
  total_spent?: number;
}

export interface DashboardData {
  user: User;
  stats: DashboardStats;
  recent_projects: Project[];
}

// ============================================================================
// FLOOR PLAN TYPES
// ============================================================================

export type RoomType = 
  | 'bedroom' 
  | 'bathroom' 
  | 'kitchen' 
  | 'living' 
  | 'dining' 
  | 'garage' 
  | 'open_plan'
  | 'laundry'
  | 'office'
  | 'alfresco'
  | 'entry'
  | 'hallway'
  | 'ensuite'
  | 'wir'; // Walk-in robe

export interface Room {
  type: RoomType;
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  area: number;
}

export interface FloorPlanData {
  rooms: Room[];
  total_area: number;
  dimensions?: {
    width: number;
    depth: number;
  };
}

export interface FloorPlanOption {
  id: number;
  name: string;
  description?: string;
  floor_plan_data: FloorPlanData;
  thumbnail_url?: string;
  created_at: string;
}

// ============================================================================
// PAYMENT TYPES
// ============================================================================

export type PlanTier = 'basic' | 'standard' | 'premium';

export interface PricingPlan {
  id: PlanTier;
  name: string;
  price: number;
  description: string;
  features: string[];
  popular: boolean;
}

export interface PaymentSession {
  checkout_url: string;
  session_id: string;
}

export interface PaymentRecord {
  id: number;
  project_id: number;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  stripe_session_id?: string;
  created_at: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiError {
  detail: string;
  status_code?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// ============================================================================
// AUTH CONTEXT TYPES
// ============================================================================

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string>;
  updateUser: (updates: Partial<User>) => void;
}

// ============================================================================
// COMPONENT PROP TYPES
// ============================================================================

export interface QuestionnaireProps {
  onComplete: (data: QuestionnaireData) => void;
  onCancel?: () => void;
  initialData?: Partial<QuestionnaireData>;
}

export interface FloorPlanCanvasProps {
  data: FloorPlanData;
  onRoomClick?: (room: Room) => void;
  interactive?: boolean;
}

export interface PricingModalProps {
  projectId: number;
  onClose: () => void;
  onSuccess?: (sessionId: string) => void;
}

export interface ProjectCardProps {
  project: Project;
  onView?: (id: number) => void;
  onDelete?: (id: number) => void;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

// Make all properties optional recursively
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Extract the resolved type from a Promise
export type Awaited<T> = T extends Promise<infer U> ? U : T;
