/**
 * 管理统计路由
 * 提供系统级统计数据
 */

import { Hono } from 'hono';
import { jwtAuth, requireAdmin } from '../../middleware/auth';
import type { Env } from '../../index';
import { ErrorCode } from '../../types';

const app = new Hono<{ Bindings: Env }>();

// 应用中间件
app.use('*', jwtAuth);
app.use('*', requireAdmin);

/**
 * GET /api/admin/statistics
 * 获取系统统计数据
 */
app.get('/', async (c) => {
  try {
    // 用户统计
    const userStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count,
        SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as new_users_7d,
        SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) as new_users_30d
      FROM users
      WHERE deleted_at IS NULL
    `).first<{
      total_users: number;
      admin_count: number;
      new_users_7d: number;
      new_users_30d: number;
    }>();

    // 等级分布
    const tierDistribution = await c.env.DB.prepare(`
      SELECT
        tc.tier_name,
        tc.display_name,
        COUNT(u.id) as user_count,
        SUM(CASE WHEN u.tier_expires_at IS NULL THEN 1 ELSE 0 END) as permanent_count,
        SUM(CASE WHEN u.tier_expires_at IS NOT NULL AND u.tier_expires_at > datetime('now') THEN 1 ELSE 0 END) as active_temporary_count,
        SUM(CASE WHEN u.tier_expires_at IS NOT NULL AND u.tier_expires_at <= datetime('now') THEN 1 ELSE 0 END) as expired_count
      FROM tier_configs tc
      LEFT JOIN users u ON tc.id = u.tier_id AND u.deleted_at IS NULL
      WHERE tc.is_active = 1
      GROUP BY tc.id
      ORDER BY tc.sort_order ASC
    `).all<{
      tier_name: string;
      display_name: string;
      user_count: number;
      permanent_count: number;
      active_temporary_count: number;
      expired_count: number;
    }>();

    // 邮箱统计
    const mailboxStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_mailboxes,
        SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as active_mailboxes,
        SUM(CASE WHEN expires_at IS NULL AND deleted_at IS NULL THEN 1 ELSE 0 END) as permanent_mailboxes,
        SUM(CASE WHEN expires_at IS NOT NULL AND deleted_at IS NULL THEN 1 ELSE 0 END) as temporary_mailboxes,
        SUM(CASE WHEN expires_at <= datetime('now') AND deleted_at IS NULL THEN 1 ELSE 0 END) as expired_mailboxes,
        SUM(CASE WHEN user_id IS NULL AND deleted_at IS NULL THEN 1 ELSE 0 END) as guest_mailboxes
      FROM temp_emails
    `).first<{
      total_mailboxes: number;
      active_mailboxes: number;
      permanent_mailboxes: number;
      temporary_mailboxes: number;
      expired_mailboxes: number;
      guest_mailboxes: number;
    }>();

    // 邮件统计
    const emailStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_emails,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_emails,
        SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) as emails_24h,
        SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as emails_7d
      FROM emails
      WHERE deleted_at IS NULL
    `).first<{
      total_emails: number;
      unread_emails: number;
      emails_24h: number;
      emails_7d: number;
    }>();

    // 兑换码统计
    const redemptionStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_codes,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_codes,
        SUM(used_count) as total_redemptions,
        SUM(CASE WHEN max_uses = -1 THEN 1 ELSE 0 END) as unlimited_codes,
        SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= datetime('now') THEN 1 ELSE 0 END) as expired_codes
      FROM redemption_codes
    `).first<{
      total_codes: number;
      active_codes: number;
      total_redemptions: number;
      unlimited_codes: number;
      expired_codes: number;
    }>();

    // 最近兑换活动
    const recentRedemptions = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as redemptions_24h
      FROM redemption_history
      WHERE redeemed_at >= datetime('now', '-1 day')
    `).first<{ redemptions_24h: number }>();

    // 存储使用统计（附件）
    const storageStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_attachments,
        SUM(size) as total_size_bytes,
        AVG(size) as avg_size_bytes
      FROM attachments
      WHERE deleted_at IS NULL
    `).first<{
      total_attachments: number;
      total_size_bytes: number;
      avg_size_bytes: number;
    }>();

    return c.json({
      success: true,
      data: {
        users: {
          total: userStats?.total_users || 0,
          admins: userStats?.admin_count || 0,
          new_7d: userStats?.new_users_7d || 0,
          new_30d: userStats?.new_users_30d || 0,
        },
        tiers: {
          distribution: (tierDistribution?.results || []).map(tier => ({
            name: tier.tier_name,
            display_name: tier.display_name,
            users: {
              total: tier.user_count || 0,
              permanent: tier.permanent_count || 0,
              active_temporary: tier.active_temporary_count || 0,
              expired: tier.expired_count || 0,
            },
          })),
        },
        mailboxes: {
          total: mailboxStats?.total_mailboxes || 0,
          active: mailboxStats?.active_mailboxes || 0,
          permanent: mailboxStats?.permanent_mailboxes || 0,
          temporary: mailboxStats?.temporary_mailboxes || 0,
          expired: mailboxStats?.expired_mailboxes || 0,
          guest: mailboxStats?.guest_mailboxes || 0,
        },
        emails: {
          total: emailStats?.total_emails || 0,
          unread: emailStats?.unread_emails || 0,
          last_24h: emailStats?.emails_24h || 0,
          last_7d: emailStats?.emails_7d || 0,
        },
        redemption: {
          codes: {
            total: redemptionStats?.total_codes || 0,
            active: redemptionStats?.active_codes || 0,
            unlimited: redemptionStats?.unlimited_codes || 0,
            expired: redemptionStats?.expired_codes || 0,
          },
          activity: {
            total_redemptions: redemptionStats?.total_redemptions || 0,
            last_24h: recentRedemptions?.redemptions_24h || 0,
          },
        },
        storage: {
          attachments: storageStats?.total_attachments || 0,
          total_size_mb: ((storageStats?.total_size_bytes || 0) / 1024 / 1024).toFixed(2),
          avg_size_kb: ((storageStats?.avg_size_bytes || 0) / 1024).toFixed(2),
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching statistics:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch statistics',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

export default app;