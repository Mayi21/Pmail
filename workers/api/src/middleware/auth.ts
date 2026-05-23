/**
 * Authentication Middleware
 * Handles JWT authentication
 * Task ID: AUTH-004
 */

import { Context, Next } from 'hono';
import { verifyToken } from '../services/jwt';
import type { Env } from '../index';
import { ErrorCode } from '../types';
import { preserveCorsHeaders } from './error';

export interface AuthContext {
  user_id: number;
  username?: string;
  auth_type: 'jwt';
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
    const payload = await verifyToken(c.env, token);

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
