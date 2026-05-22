/**
 * Authentication Middleware
 * Handles JWT and API Key authentication
 * Task ID: AUTH-004
 */

import { Context, Next } from 'hono';
import { JWTKeyManager } from '../services/jwtKeyManager';
import type { Env } from '../index';
import { ErrorCode } from '../types';
import { preserveCorsHeaders } from './error';

export interface AuthContext {
  user_id: number;
  username?: string;
  auth_type: 'jwt' | 'api_key';
  permissions?: string[]; // API key permissions
}

/**
 * JWT Authentication Middleware
 */
export async function jwtAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    preserveCorsHeaders(c);
    return c.json({
      success: false,
      error: 'Missing or invalid authorization header',
      error_code: ErrorCode.AUTH_UNAUTHORIZED,
    }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const keyManager = new JWTKeyManager(c.env);
    const payload = await keyManager.verifyToken(token);

    // Set user context
    c.set('user_id', parseInt(payload.sub));
    c.set('username', payload.username);
    c.set('auth_type', 'jwt');

    await next();
  } catch (error: any) {
    preserveCorsHeaders(c);
    
    if (error.message === 'Token has expired' || error.code === 'ERR_JWT_EXPIRED') {
      return c.json({
        success: false,
        error: 'Token has expired',
        error_code: ErrorCode.AUTH_TOKEN_EXPIRED,
      }, 401);
    }

    return c.json({
      success: false,
      error: 'Invalid token',
      error_code: ErrorCode.AUTH_TOKEN_INVALID,
    }, 401);
  }
}

/**
 * API Key Authentication Middleware
 * Updated to support multi-key, permissions, expiration, and is_active checks
 */
export async function apiKeyAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const apiKey = c.req.header('X-API-Key');

  if (!apiKey) {
    preserveCorsHeaders(c);
    return c.json({
      success: false,
      error: 'Missing API key',
      error_code: ErrorCode.AUTH_UNAUTHORIZED,
    }, 401);
  }

  try {
    // Hash the API key
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Look up the API key with all validation fields
    const result = await c.env.DB.prepare(`
      SELECT id, user_id, permissions, is_active, expires_at
      FROM api_keys
      WHERE key_hash = ?
      LIMIT 1
    `).bind(keyHash).first<{
      id: number;
      user_id: number;
      permissions: string;
      is_active: number;
      expires_at: string | null;
    }>();

    if (!result) {
      preserveCorsHeaders(c);
      return c.json({
        success: false,
        error: 'Invalid API key',
        error_code: ErrorCode.AUTH_TOKEN_INVALID,
      }, 401);
    }

    // Check if key is active
    if (!result.is_active) {
      preserveCorsHeaders(c);
      return c.json({
        success: false,
        error: 'API key is disabled',
        error_code: ErrorCode.AUTH_TOKEN_INVALID,
      }, 401);
    }

    // Check if key is expired
    if (result.expires_at) {
      const now = new Date();
      const expiresAt = new Date(result.expires_at);
      if (now > expiresAt) {
        preserveCorsHeaders(c);
        return c.json({
          success: false,
          error: 'API key has expired',
          error_code: ErrorCode.AUTH_TOKEN_EXPIRED,
        }, 401);
      }
    }

    // Update last used timestamp
    await c.env.DB.prepare(`
      UPDATE api_keys
      SET last_used_at = datetime('now')
      WHERE id = ?
    `).bind(result.id).run();

    // Set user context with permissions
    c.set('user_id', result.user_id);
    c.set('auth_type', 'api_key');
    c.set('permissions', result.permissions.split(','));

    await next();
  } catch (error) {
    console.error('API key auth error:', error);
    preserveCorsHeaders(c);
    return c.json({
      success: false,
      error: 'Authentication failed',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
}

/**
 * Combined auth middleware (accepts either JWT or API key)
 */
export async function auth(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  const apiKey = c.req.header('X-API-Key');

  if (apiKey) {
    return apiKeyAuth(c, next);
  } else if (authHeader) {
    return jwtAuth(c, next);
  } else {
    preserveCorsHeaders(c);
    return c.json({
      success: false,
      error: 'Authentication required',
      error_code: ErrorCode.AUTH_UNAUTHORIZED,
    }, 401);
  }
}

/**
 * Optional auth middleware (allows unauthenticated requests)
 */
export async function optionalAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  const apiKey = c.req.header('X-API-Key');

  if (authHeader || apiKey) {
    return auth(c, next);
  }

  // Continue without authentication
  await next();
}

/**
 * Permission check middleware factory
 * Creates a middleware that requires specific permission(s)
 * Only applies to API key authentication (JWT has all permissions)
 *
 * Usage:
 * app.post('/v1/mailbox', auth, requirePermission('write'), async (c) => {...})
 * app.get('/v1/emails', auth, requirePermission('read'), async (c) => {...})
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const authType = c.get('auth_type');

    // JWT users have all permissions
    if (authType === 'jwt') {
      await next();
      return;
    }

    // API key users need permission check
    if (authType === 'api_key') {
      const permissions = c.get('permissions') || [];

      // Check if user has all required permissions
      const hasPermission = requiredPermissions.every(required =>
        permissions.includes(required)
      );

      if (!hasPermission) {
        preserveCorsHeaders(c);
        return c.json({
          success: false,
          error: `This API key does not have the required permission(s): ${requiredPermissions.join(', ')}`,
          error_code: 'PERMISSION_DENIED',
        }, 403);
      }

      await next();
      return;
    }

    // No auth type set (shouldn't happen after auth middleware)
    preserveCorsHeaders(c);
    return c.json({
      success: false,
      error: 'Authentication required',
      error_code: ErrorCode.AUTH_UNAUTHORIZED,
    }, 401);
  };
}

/**
 * Admin-only middleware
 * Requires JWT authentication and admin role
 *
 * Usage:
 * app.get('/api/admin/users', jwtAuth, requireAdmin, async (c) => {...})
 */
export async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next) {
  const userId = c.get('user_id');
  const authType = c.get('auth_type');

  // Only JWT authentication is allowed for admin routes
  if (authType !== 'jwt') {
    preserveCorsHeaders(c);
    return c.json({
      success: false,
      error: 'Admin access requires JWT authentication',
      error_code: ErrorCode.AUTH_UNAUTHORIZED,
    }, 401);
  }

  // Check if user has admin role
  const user = await c.env.DB.prepare(`
    SELECT role FROM users
    WHERE id = ? AND deleted_at IS NULL
  `).bind(userId).first<{ role: string }>();

  if (!user || user.role !== 'admin') {
    preserveCorsHeaders(c);
    return c.json({
      success: false,
      error: 'Admin access required',
      error_code: ErrorCode.ADMIN_REQUIRED,
    }, 403);
  }

  await next();
}