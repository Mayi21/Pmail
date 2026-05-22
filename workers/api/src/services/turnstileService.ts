/**
 * Turnstile Verification Service
 * Handles Cloudflare Turnstile CAPTCHA verification
 */

import type { Env } from '../index';

/**
 * Turnstile verification response from Cloudflare API
 */
interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

/**
 * Service for verifying Turnstile tokens
 */
export class TurnstileService {
  private readonly verifyEndpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Verify a Turnstile token
   * @param token - The Turnstile response token from the client
   * @param remoteIp - Optional: The IP address of the user
   * @returns true if verification succeeds, false otherwise
   */
  async verifyToken(token: string, remoteIp?: string): Promise<boolean> {
    try {
      // Validate token presence
      if (!token || token.trim() === '') {
        console.error('Turnstile: Empty token provided');
        return false;
      }

      // Validate secret key is configured
      if (!this.env.TURNSTILE_SECRET_KEY) {
        console.error('Turnstile: TURNSTILE_SECRET_KEY not configured');
        return false;
      }

      // Prepare request body
      const body = new FormData();
      body.append('secret', this.env.TURNSTILE_SECRET_KEY);
      body.append('response', token);

      if (remoteIp) {
        body.append('remoteip', remoteIp);
      }

      // Call Cloudflare Turnstile verification API
      const response = await fetch(this.verifyEndpoint, {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        console.error(`Turnstile API error: ${response.status} ${response.statusText}`);
        return false;
      }

      const result: TurnstileResponse = await response.json();

      // Log verification result (for debugging)
      console.log('Turnstile verification result:', {
        success: result.success,
        hostname: result.hostname,
        challenge_ts: result.challenge_ts,
        errors: result['error-codes'],
      });

      // Check for errors
      if (result['error-codes'] && result['error-codes'].length > 0) {
        console.error('Turnstile verification errors:', result['error-codes']);
      }

      return result.success;
    } catch (error) {
      console.error('Turnstile verification exception:', error);
      return false;
    }
  }

  /**
   * Get a human-readable error message for common Turnstile error codes
   * @param errorCodes - Error codes from Turnstile API
   * @returns Human-readable error message
   */
  getErrorMessage(errorCodes?: string[]): string {
    if (!errorCodes || errorCodes.length === 0) {
      return 'Verification failed';
    }

    const errorMap: Record<string, string> = {
      'missing-input-secret': 'Server configuration error',
      'invalid-input-secret': 'Server configuration error',
      'missing-input-response': 'Verification token missing',
      'invalid-input-response': 'Verification failed, please try again',
      'bad-request': 'Invalid request',
      'timeout-or-duplicate': 'Verification expired or already used',
      'internal-error': 'Verification service error',
    };

    // Return the first matched error message
    for (const code of errorCodes) {
      if (errorMap[code]) {
        return errorMap[code];
      }
    }

    return 'Verification failed';
  }
}
