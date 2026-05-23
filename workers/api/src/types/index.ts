/**
 * Type definitions for the PMail API
 */

// User types
export interface User {
  id: number;
  username: string;
  email: string;
  password_hash?: string; // Excluded from API responses
  avatar_url?: string | null; // User avatar URL
  tier_id: number;
  role: 'user' | 'admin';
  tier_upgraded_at?: string | null;
  tier_expires_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Tier Configuration types
export interface TierConfig {
  id: number;
  tier_name: string;
  display_name: string;
  sort_order: number;
  permanent_mailbox_quota: number;
  temporary_mailbox_quota: number;
  is_active: number;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

// User Statistics types
export interface UserStatistics {
  user_id: number;
  total_mailboxes: number;
  active_mailboxes: number;
  permanent_mailboxes: number;
  temporary_mailboxes: number;
  total_emails: number;
  unread_emails: number;
  last_activity?: string | null;
  created_at: string;
  updated_at: string;
}

// Redemption Code types
export interface RedemptionCode {
  id: number;
  code: string;
  tier_id: number;
  duration_type: 'permanent' | 'days' | 'months';
  duration_value?: number | null;
  max_uses: number;
  used_count: number;
  is_active: number;
  created_by?: number | null;
  created_at: string;
  expires_at?: string | null;
  note?: string | null;
}

// Redemption History types
export interface RedemptionHistory {
  id: number;
  user_id: number;
  code_id: number;
  tier_id: number;
  tier_expires_at?: string | null;
  redeemed_at: string;
  ip_address?: string | null;
}

// Temporary email types
export interface PMail {
  id: number;
  user_id: number;
  address: string;
  expires_at: string;
  created_at: string;
  deleted_at?: string | null;
}

// Email types
export interface Email {
  id: number;
  temp_email_id: number;
  from_email: string;
  subject: string;
  body_text?: string;
  body_html?: string;
  headers?: Record<string, string>;
  received_at: string;
  is_read: boolean;
  deleted_at?: string | null;
}

// Attachment types
export interface Attachment {
  id: number;
  email_id: number;
  filename: string;
  r2_key: string;
  size: number;
  content_type?: string;
  created_at: string;
}

// JWT Token payload
export interface JWTPayload {
  sub: string; // user_id
  username: string;
  iat: number;
  exp: number;
}

// Request context
export interface RequestContext {
  user_id?: number;
  username?: string;
  auth_type?: 'jwt';
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  error_code?: string;
  message?: string;
}

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Search params
export interface SearchParams {
  q: string;
  scope?: 'all' | 'subject' | 'from' | 'body';
  date_from?: string;
  date_to?: string;
}

// Error codes
export enum ErrorCode {
  // Authentication
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED',

  // User
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',

  // Tier & Quota
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  TIER_NOT_FOUND = 'TIER_NOT_FOUND',
  TIER_EXPIRED = 'TIER_EXPIRED',
  TIER_UPGRADE_REQUIRED = 'TIER_UPGRADE_REQUIRED',

  // Mailbox
  MAILBOX_LIMIT_EXCEEDED = 'MAILBOX_LIMIT_EXCEEDED',
  MAILBOX_NOT_FOUND = 'MAILBOX_NOT_FOUND',
  MAILBOX_EXPIRED = 'MAILBOX_EXPIRED',

  // Email
  EMAIL_NOT_FOUND = 'EMAIL_NOT_FOUND',

  // Redemption
  REDEMPTION_CODE_INVALID = 'REDEMPTION_CODE_INVALID',
  REDEMPTION_CODE_EXPIRED = 'REDEMPTION_CODE_EXPIRED',
  REDEMPTION_CODE_USED = 'REDEMPTION_CODE_USED',
  REDEMPTION_CODE_EXHAUSTED = 'REDEMPTION_CODE_EXHAUSTED',
  REDEMPTION_TIER_INACTIVE = 'REDEMPTION_TIER_INACTIVE',

  // Permissions
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ADMIN_REQUIRED = 'ADMIN_REQUIRED',

  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // System
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',
}

// Validation schemas (using Zod)
export { z } from 'zod';