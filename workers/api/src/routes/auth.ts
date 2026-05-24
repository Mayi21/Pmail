/**
 * Authentication Routes
 * Task IDs: AUTH-002, AUTH-003, AUTH-005, AUTH-006, AUTH-007, SEC-004
 */

import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { signToken } from '../services/jwt';
import { getBooleanSetting } from '../services/settingsService';
import {
  checkLockStatus,
  recordLoginFailure,
  clearLoginFailures,
  getClientIP,
} from '../services/loginLockout';
import type { Env } from '../index';
import { ErrorCode } from '../types';
import { jwtAuth } from '../middleware/auth';

const app = new Hono<{ Bindings: Env }>();

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(64)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
      'Password must contain uppercase, lowercase, and number'),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

/**
 * POST /api/auth/register
 * Register a new user
 */
app.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const validated = registerSchema.parse(body);

    // Check if registration is enabled
    const registrationEnabled = await getBooleanSetting(c.env, 'registration_enabled', true);
    if (!registrationEnabled) {
      return c.json({
        success: false,
        error: 'Registration is currently disabled by the administrator',
        error_code: 'REGISTRATION_DISABLED',
      }, 403);
    }

    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';

    // Check if user already exists
    const existingUser = await c.env.DB.prepare(`
      SELECT id FROM users WHERE username = ? OR email = ?
    `).bind(validated.username, validated.email).first();

    if (existingUser) {
      return c.json({
        success: false,
        error: 'Username or email already exists',
        error_code: ErrorCode.USER_ALREADY_EXISTS,
      }, 400);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(validated.password, 10);

    // Insert user with default tier (tier_id = 1 for basic)
    const result = await c.env.DB.prepare(`
      INSERT INTO users (username, email, password_hash, tier_id, role)
      VALUES (?, ?, ?, 1, 'user')
    `).bind(validated.username, validated.email, passwordHash).run();

    const userId = result.meta.last_row_id;

    // Initialize user statistics with tier-specific fields
    await c.env.DB.prepare(`
      INSERT INTO user_statistics (
        user_id,
        total_mailboxes,
        active_mailboxes,
        permanent_mailboxes,
        temporary_mailboxes,
        total_emails,
        unread_emails
      )
      VALUES (?, 0, 0, 0, 0, 0, 0)
    `).bind(userId).run();

    // Log registration
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent)
      VALUES (?, 'REGISTER', 'user', ?, ?, ?)
    `).bind(
      userId,
      userId,
      clientIP,
      c.req.header('User-Agent')
    ).run();

    return c.json({
      success: true,
      message: 'Registration successful',
      data: {
        user_id: userId,
        username: validated.username,
        email: validated.email,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Validation error',
        error_code: ErrorCode.VALIDATION_ERROR,
        details: error.errors,
      }, 400);
    }
    throw error;
  }
});

/**
 * POST /api/auth/login
 * User login with brute force protection
 */
app.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const validated = loginSchema.parse(body);
    const clientIP = getClientIP(c.req.raw);

    // 1. Check if IP is locked
    const ipLockStatus = await checkLockStatus(c.env.DB, clientIP, 'ip');
    if (ipLockStatus.locked) {
      return c.json({
        success: false,
        error: `Too many failed attempts from this IP. Please try again in ${ipLockStatus.minutes_remaining} minutes`,
        error_code: ErrorCode.RATE_LIMIT_EXCEEDED,
        minutes_remaining: ipLockStatus.minutes_remaining,
        locked_until: ipLockStatus.locked_until,
      }, 429);
    }

    // 2. Check if username is locked
    const userLockStatus = await checkLockStatus(c.env.DB, validated.username, 'username');
    if (userLockStatus.locked) {
      return c.json({
        success: false,
        error: `Account temporarily locked due to multiple failed login attempts. Please try again in ${userLockStatus.minutes_remaining} minutes`,
        error_code: ErrorCode.RATE_LIMIT_EXCEEDED,
        minutes_remaining: userLockStatus.minutes_remaining,
        locked_until: userLockStatus.locked_until,
      }, 429);
    }

    // 3. Get user and verify credentials
    const user = await c.env.DB.prepare(`
      SELECT id, username, email, password_hash
      FROM users WHERE username = ?
    `).bind(validated.username).first<{
      id: number;
      username: string;
      email: string;
      password_hash: string;
    }>();

    if (!user) {
      // Record failure for both IP and username (防止用户枚举)
      await recordLoginFailure(c.env.DB, clientIP, 'ip');
      await recordLoginFailure(c.env.DB, validated.username, 'username');
      return c.json({
        success: false,
        error: 'Invalid username or password',
        error_code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      }, 401);
    }

    // Check if password login is enabled
    const passwordLoginEnabled = await getBooleanSetting(c.env, 'password_login_enabled', true);
    if (!passwordLoginEnabled) {
      return c.json({
        success: false,
        error: 'Password login is currently disabled by the administrator',
        error_code: 'PASSWORD_LOGIN_DISABLED',
      }, 403);
    }

    // 4. Verify password
    const validPassword = await bcrypt.compare(validated.password, user.password_hash);
    if (!validPassword) {
      // Record failure for both IP and username
      await recordLoginFailure(c.env.DB, clientIP, 'ip');
      await recordLoginFailure(c.env.DB, validated.username, 'username');
      return c.json({
        success: false,
        error: 'Invalid username or password',
        error_code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      }, 401);
    }

    // 5. Login successful - clear failure records
    await clearLoginFailures(c.env.DB, clientIP, 'ip');
    await clearLoginFailures(c.env.DB, validated.username, 'username');

    // 6. Generate JWT token
    const token = await signToken(c.env, {
      sub: String(user.id),
      username: user.username,
    });

    // 7. Log successful login
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, ip_address, user_agent)
      VALUES (?, 'LOGIN', 'user', ?, ?)
    `).bind(
      user.id,
      clientIP,
      c.req.header('User-Agent')
    ).run();

    return c.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Validation error',
        error_code: ErrorCode.VALIDATION_ERROR,
        details: error.errors,
      }, 400);
    }
    throw error;
  }
});

/**
 * GET /api/auth/me
 * Get current user information
 */
app.get('/me', jwtAuth, async (c) => {
  const userId = c.get('user_id');

  // Get user info
  const user = await c.env.DB.prepare(`
    SELECT id, username, email, avatar_url, created_at
    FROM users WHERE id = ?
  `).bind(userId).first();

  if (!user) {
    return c.json({
      success: false,
      error: 'User not found',
      error_code: ErrorCode.USER_NOT_FOUND,
    }, 404);
  }

  // Get user statistics
  const stats = await c.env.DB.prepare(`
    SELECT total_mailboxes, active_mailboxes, total_emails, unread_emails
    FROM user_statistics WHERE user_id = ?
  `).bind(userId).first();

  return c.json({
    success: true,
    data: {
      ...user,
      stats: stats || {
        total_mailboxes: 0,
        active_mailboxes: 0,
        total_emails: 0,
        unread_emails: 0,
      },
    },
  });
});

export default app;
