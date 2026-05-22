/**
 * OAuth Service for Linux.do Integration
 * Handles OAuth 2.0 Authorization Code Grant flow
 */

// OAuth user information interface
export interface OAuthUserInfo {
  id: string;
  username: string;
  email: string;
  avatar_url?: string;
}

// Linux.do OAuth endpoints
const LINUXDO_OAUTH_ENDPOINTS = {
  authorize: 'https://connect.linux.do/oauth2/authorize',
  token: 'https://connect.linux.do/oauth2/token',
  userInfo: 'https://connect.linux.do/api/user',
};

/**
 * Linux.do OAuth Service
 */
export class LinuxdoOAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private cache: KVNamespace;

  constructor(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    cache: KVNamespace
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.cache = cache;
  }

  /**
   * Generate authorization URL for Linux.do
   * @returns Authorization URL and state parameter
   */
  async getAuthorizationUrl(): Promise<{ authorization_url: string; state: string }> {
    // Generate random state (32 characters for CSRF protection)
    const state = this.generateRandomString(32);

    await this.cache.put(`oauth:${state}`, 'valid', { expirationTtl: 60 });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state: state,
      scope: 'read', // Request read permission
    });

    const authorizationUrl = `${LINUXDO_OAUTH_ENDPOINTS.authorize}?${params.toString()}`;

    return {
      authorization_url: authorizationUrl,
      state,
    };
  }

  /**
   * Verify state parameter (CSRF protection)
   * @param state State parameter from callback
   * @returns True if valid, false otherwise
   */
  async verifyState(state: string): Promise<boolean> {
    const key = `oauth:${state}`;
    const value = await this.cache.get(key);

    if (value === null) {
      return false;
    }

    await this.cache.delete(key);
    return true;
  }

  /**
   * Exchange authorization code for access token
   * @param code Authorization code from callback
   * @returns Access token
   */
  async exchangeCodeForToken(code: string): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
    });

    const response = await fetch(LINUXDO_OAUTH_ENDPOINTS.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange code for token: ${response.status} ${errorText}`);
    }

    const data = await response.json<{ access_token: string }>();
    return data.access_token;
  }

  /**
   * Get user information from Linux.do
   * @param accessToken Access token
   * @returns User information
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const response = await fetch(LINUXDO_OAUTH_ENDPOINTS.userInfo, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get user info: ${response.status} ${errorText}`);
    }

    const data = await response.json<any>();

    // Map Linux.do user data to our interface
    // Note: Actual field names may vary, adjust based on testing
    return {
      id: String(data.id),
      username: data.username || data.name,
      email: data.email,
      avatar_url: data.avatar_url || data.avatar_template,
    };
  }

  /**
   * Generate random username for OAuth users
   * Format: oauth_xxxxxxxx (8 random characters)
   * @returns Random username
   */
  generateRandomUsername(): string {
    const randomPart = this.generateRandomString(8);
    return `oauth_${randomPart}`;
  }

  /**
   * Generate random string using Web Crypto API
   * @param length Length of random string
   * @returns Random string (alphanumeric)
   */
  private generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);

    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[randomValues[i] % charset.length];
    }

    return result;
  }
}
