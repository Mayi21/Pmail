/**
 * Validation utilities
 */

import { z } from 'zod';

// Email validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Password requirements regex
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

// Username requirements
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

/**
 * Common validation schemas
 */
export const schemas = {
  email: z.string().email().regex(EMAIL_REGEX, 'Invalid email format'),

  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(64, 'Password must be at most 64 characters')
    .regex(PASSWORD_REGEX, 'Password must contain uppercase, lowercase, and number'),

  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(USERNAME_REGEX, 'Username can only contain letters, numbers, and underscore'),

  tempEmailAddress: z.string()
    .regex(/^[a-z0-9]{8,16}@.+$/, 'Invalid temporary email format'),
};

/**
 * Sanitize user input
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>'"]/g, '') // Remove potentially dangerous characters
    .substring(0, 1000); // Limit length
}

/**
 * Validate pagination parameters
 */
export function validatePagination(page?: string | number, limit?: string | number) {
  const pageNum = typeof page === 'string' ? parseInt(page) : page;
  const limitNum = typeof limit === 'string' ? parseInt(limit) : limit;

  return {
    page: Math.max(1, pageNum || 1),
    limit: Math.min(100, Math.max(1, limitNum || 20)),
  };
}

/**
 * Validate date range
 */
export function validateDateRange(from?: string, to?: string) {
  const now = new Date();
  const maxPast = new Date();
  maxPast.setDate(maxPast.getDate() - 30); // Max 30 days in the past

  let dateFrom = from ? new Date(from) : maxPast;
  let dateTo = to ? new Date(to) : now;

  // Ensure dates are valid
  if (isNaN(dateFrom.getTime())) dateFrom = maxPast;
  if (isNaN(dateTo.getTime())) dateTo = now;

  // Ensure from is before to
  if (dateFrom > dateTo) {
    [dateFrom, dateTo] = [dateTo, dateFrom];
  }

  // Ensure dates are within reasonable range
  if (dateFrom < maxPast) dateFrom = maxPast;
  if (dateTo > now) dateTo = now;

  return {
    from: dateFrom.toISOString(),
    to: dateTo.toISOString(),
  };
}

/**
 * Validate domain
 */
export function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;
  return domainRegex.test(domain);
}

/**
 * Generate random string
 */
export function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}