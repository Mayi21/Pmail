/**
 * Test Setup and Utilities
 */

import { vi } from 'vitest';

// Mock Cloudflare environment
export const mockEnv = {
  DB: {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    })),
    exec: vi.fn(),
  },
  R2: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  },
  CACHE: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  },
  // Environment variables
  DOMAIN: 'test.example.com',
  FRONTEND_URL: 'https://test.example.com',
  ALLOWED_ORIGINS: 'https://test.example.com',
  JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long-for-vitest',
  ENABLE_AUDIT_LOG: 'true',
  MAX_MAILBOXES_PER_USER: '10',
  DEFAULT_MAILBOX_TTL: '3600',
  MAX_MAILBOX_TTL: '86400',
  SENDGRID_API_KEY: undefined,
};

// Mock ExecutionContext
export const mockContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
};

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Helper to create mock Request
export function createMockRequest(
  url: string,
  options?: RequestInit
): Request {
  return new Request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

// Helper to parse JSON response
export async function parseJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}