/**
 * User Information Routes
 * Provides user profile, tier, and quota information
 */

import { Hono } from 'hono';
import { jwtAuth } from '../middleware/auth';
import { getUserTierConfig, getUserMailboxStats } from '../services/quotaService';
import type { Env } from '../index';
import { ErrorCode, TierConfig, UserStatistics } from '../types';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/user/me
 * Get current user information with tier and quota details
 */
app.get('/me', jwtAuth, async (c) => {
  try {
    const userId = c.get('user_id');

    // Get user basic information
    const user = await c.env.DB.prepare(`
      SELECT
        id,
        username,
        email,
        avatar_url,
        tier_id,
        role,
        tier_upgraded_at,
        tier_expires_at,
        created_at,
        updated_at
      FROM users
      WHERE id = ? AND deleted_at IS NULL
    `).bind(userId).first<{
      id: number;
      username: string;
      email: string;
      avatar_url: string | null;
      tier_id: number;
      role: string;
      tier_upgraded_at: string | null;
      tier_expires_at: string | null;
      created_at: string;
      updated_at: string;
    }>();

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found',
        error_code: ErrorCode.USER_NOT_FOUND,
      }, 404);
    }

    // Get tier configuration
    const tierConfig = await getUserTierConfig(userId, c.env.DB);

    if (!tierConfig) {
      console.error(`Tier config not found for user ${userId}, tier_id: ${user.tier_id}`);
      // Return user info without tier details
      return c.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            avatar_url: user.avatar_url,
            role: user.role,
            created_at: user.created_at,
            updated_at: user.updated_at,
          },
          tier: null,
          quota: null,
          error: 'Tier configuration not found. Please contact support.',
        },
      });
    }

    // Get mailbox statistics
    const mailboxStats = await getUserMailboxStats(userId, c.env.DB);

    // Get email statistics
    const emailStats = await c.env.DB.prepare(`
      SELECT
        COUNT(DISTINCT e.id) as total_emails,
        SUM(CASE WHEN e.is_read = 0 THEN 1 ELSE 0 END) as unread_emails
      FROM temp_emails t
      LEFT JOIN emails e ON e.temp_email_id = t.id AND e.deleted_at IS NULL
      WHERE t.user_id = ? AND t.deleted_at IS NULL
    `).bind(userId).first<{
      total_emails: number;
      unread_emails: number;
    }>();

    // Check if tier is expired
    const isExpired = user.tier_expires_at ? new Date(user.tier_expires_at) <= new Date() : false;

    // Calculate remaining quota
    const permanentRemaining = tierConfig.permanent_mailbox_quota - mailboxStats.permanent_mailboxes;
    const temporaryRemaining = tierConfig.temporary_mailbox_quota === -1
      ? -1
      : tierConfig.temporary_mailbox_quota - mailboxStats.temporary_mailboxes;

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar_url: user.avatar_url,
          role: user.role,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
        tier: {
          id: tierConfig.id,
          name: tierConfig.tier_name,
          display_name: tierConfig.display_name,
          description: tierConfig.description,
          upgraded_at: user.tier_upgraded_at,
          expires_at: user.tier_expires_at,
          is_expired: isExpired,
        },
        quota: {
          permanent: {
            used: mailboxStats.permanent_mailboxes,
            limit: tierConfig.permanent_mailbox_quota,
            remaining: permanentRemaining,
          },
          temporary: {
            used: mailboxStats.temporary_mailboxes,
            limit: tierConfig.temporary_mailbox_quota,
            remaining: temporaryRemaining,
            unlimited: tierConfig.temporary_mailbox_quota === -1,
          },
          total: {
            mailboxes: mailboxStats.total_mailboxes,
            emails: emailStats?.total_emails || 0,
            unread_emails: emailStats?.unread_emails || 0,
          },
        },
      },
    });
  } catch (error: any) {
    console.error('Error getting user info:', error);
    return c.json({
      success: false,
      error: 'Failed to get user information',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/user/quota
 * Get only quota information (lightweight endpoint)
 */
app.get('/quota', jwtAuth, async (c) => {
  try {
    const userId = c.get('user_id');

    const tierConfig = await getUserTierConfig(userId, c.env.DB);
    if (!tierConfig) {
      return c.json({
        success: false,
        error: 'Tier configuration not found',
        error_code: ErrorCode.TIER_NOT_FOUND,
      }, 404);
    }

    const mailboxStats = await getUserMailboxStats(userId, c.env.DB);

    return c.json({
      success: true,
      data: {
        tier_name: tierConfig.tier_name,
        permanent: {
          used: mailboxStats.permanent_mailboxes,
          limit: tierConfig.permanent_mailbox_quota,
          available: tierConfig.permanent_mailbox_quota - mailboxStats.permanent_mailboxes,
        },
        temporary: {
          used: mailboxStats.temporary_mailboxes,
          limit: tierConfig.temporary_mailbox_quota,
          available: tierConfig.temporary_mailbox_quota === -1
            ? -1
            : tierConfig.temporary_mailbox_quota - mailboxStats.temporary_mailboxes,
          unlimited: tierConfig.temporary_mailbox_quota === -1,
        },
      },
    });
  } catch (error: any) {
    console.error('Error getting user quota:', error);
    return c.json({
      success: false,
      error: 'Failed to get quota information',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/user/statistics
 * Get detailed user statistics
 */
app.get('/statistics', jwtAuth, async (c) => {
  try {
    const userId = c.get('user_id');

    // Get comprehensive statistics
    const stats = await c.env.DB.prepare(`
      SELECT
        us.*,
        u.tier_id,
        tc.tier_name,
        tc.display_name as tier_display_name
      FROM user_statistics us
      JOIN users u ON us.user_id = u.id
      JOIN tier_configs tc ON u.tier_id = tc.id
      WHERE us.user_id = ? AND u.deleted_at IS NULL
    `).bind(userId).first<UserStatistics & {
      tier_id: number;
      tier_name: string;
      tier_display_name: string;
    }>();

    if (!stats) {
      // Create initial statistics if not exists
      await c.env.DB.prepare(`
        INSERT INTO user_statistics (
          user_id,
          total_mailboxes,
          active_mailboxes,
          permanent_mailboxes,
          temporary_mailboxes,
          total_emails,
          unread_emails,
          created_at,
          updated_at
        ) VALUES (?, 0, 0, 0, 0, 0, 0, datetime('now'), datetime('now'))
      `).bind(userId).run();

      return c.json({
        success: true,
        data: {
          user_id: userId,
          total_mailboxes: 0,
          active_mailboxes: 0,
          permanent_mailboxes: 0,
          temporary_mailboxes: 0,
          total_emails: 0,
          unread_emails: 0,
          last_activity: null,
        },
      });
    }

    return c.json({
      success: true,
      data: {
        user_id: stats.user_id,
        tier: {
          id: stats.tier_id,
          name: stats.tier_name,
          display_name: stats.tier_display_name,
        },
        mailboxes: {
          total: stats.total_mailboxes,
          active: stats.active_mailboxes,
          permanent: stats.permanent_mailboxes,
          temporary: stats.temporary_mailboxes,
        },
        emails: {
          total: stats.total_emails,
          unread: stats.unread_emails,
        },
        last_activity: stats.last_activity,
        created_at: stats.created_at,
        updated_at: stats.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Error getting user statistics:', error);
    return c.json({
      success: false,
      error: 'Failed to get user statistics',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

export default app;