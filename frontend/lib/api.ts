// ===========================================================================
// ADD THESE TO frontend/lib/api.ts
// ===========================================================================

// 1. ADD this interface for user check response:

export interface UserCheckResponse {
  exists: boolean;
  user: User | null;
}

// 2. ADD this interface for creating a new user:

export interface UserCreateData {
  full_name: string;
  company_name?: string | null;
  phone?: string | null;
  address?: string | null;
  is_builder?: boolean;
  abn_acn?: string | null;
}

// 3. ADD these methods to the ApiClient class:

  /**
   * Check if user exists in database WITHOUT auto-creating.
   * Returns { exists: boolean, user: User | null }
   */
  async checkUserExists(): Promise<UserCheckResponse> {
    return this.request<UserCheckResponse>('/api/v1/users/me/check');
  }

  /**
   * Create a new user (called after welcome form submission).
   */
  async createUser(data: UserCreateData): Promise<User> {
    return this.request<User>('/api/v1/users/me', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
