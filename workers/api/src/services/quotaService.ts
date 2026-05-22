/**
 * 配额服务
 * 处理用户等级配置和邮箱配额检查
 */

import { D1Database } from '@cloudflare/workers-types';

/**
 * 等级配置接口
 */
export interface TierConfig {
  id: number;
  tier_name: string;
  display_name: string;
  sort_order: number;
  permanent_mailbox_quota: number;
  temporary_mailbox_quota: number;
  is_active: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 用户邮箱统计接口
 */
export interface UserMailboxStats {
  permanent_mailboxes: number;
  temporary_mailboxes: number;
  total_mailboxes: number;
}

/**
 * 配额检查结果接口
 */
export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
  tierName?: string;
}

/**
 * 获取用户的等级配置
 */
export async function getUserTierConfig(userId: number, db: D1Database): Promise<TierConfig | null> {
  try {
    const result = await db.prepare(`
      SELECT tc.*
      FROM users u
      JOIN tier_configs tc ON u.tier_id = tc.id
      WHERE u.id = ? AND u.deleted_at IS NULL AND tc.is_active = 1
    `).bind(userId).first<TierConfig>();

    return result;
  } catch (error) {
    console.error('Error getting user tier config:', error);
    return null;
  }
}

/**
 * 获取用户的邮箱使用统计
 */
export async function getUserMailboxStats(userId: number, db: D1Database): Promise<UserMailboxStats> {
  try {
    // 首先尝试从 user_statistics 表获取
    const stats = await db.prepare(`
      SELECT
        permanent_mailboxes,
        temporary_mailboxes,
        total_mailboxes
      FROM user_statistics
      WHERE user_id = ?
    `).bind(userId).first<UserMailboxStats>();

    if (stats) {
      return stats;
    }

    // 如果没有统计记录，实时计算并创建记录
    const calculated = await db.prepare(`
      SELECT
        COUNT(CASE WHEN expires_at IS NULL THEN 1 END) as permanent_mailboxes,
        COUNT(CASE WHEN expires_at IS NOT NULL THEN 1 END) as temporary_mailboxes,
        COUNT(*) as total_mailboxes
      FROM temp_emails
      WHERE user_id = ? AND deleted_at IS NULL
    `).bind(userId).first<UserMailboxStats>();

    // 创建或更新 user_statistics 记录
    if (calculated) {
      await db.prepare(`
        INSERT INTO user_statistics (
          user_id,
          permanent_mailboxes,
          temporary_mailboxes,
          total_mailboxes,
          active_mailboxes,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          permanent_mailboxes = excluded.permanent_mailboxes,
          temporary_mailboxes = excluded.temporary_mailboxes,
          total_mailboxes = excluded.total_mailboxes,
          updated_at = datetime('now')
      `).bind(
        userId,
        calculated.permanent_mailboxes,
        calculated.temporary_mailboxes,
        calculated.total_mailboxes,
        calculated.total_mailboxes // active_mailboxes 设为总数
      ).run();
    }

    return calculated || { permanent_mailboxes: 0, temporary_mailboxes: 0, total_mailboxes: 0 };
  } catch (error) {
    console.error('Error getting user mailbox stats:', error);
    return { permanent_mailboxes: 0, temporary_mailboxes: 0, total_mailboxes: 0 };
  }
}

/**
 * 检查用户是否可以创建新邮箱
 */
export async function canCreateMailbox(
  userId: number,
  isPermanent: boolean,
  db: D1Database
): Promise<QuotaCheckResult> {
  try {
    // 获取用户等级配置
    const tierConfig = await getUserTierConfig(userId, db);
    if (!tierConfig) {
      return {
        allowed: false,
        reason: 'TIER_NOT_FOUND',
        tierName: 'unknown'
      };
    }

    // 获取用户邮箱统计
    const stats = await getUserMailboxStats(userId, db);

    // 检查配额
    if (isPermanent) {
      const current = stats.permanent_mailboxes;
      const limit = tierConfig.permanent_mailbox_quota;

      if (current >= limit) {
        return {
          allowed: false,
          reason: 'QUOTA_EXCEEDED',
          current,
          limit,
          tierName: tierConfig.tier_name
        };
      }
    } else {
      // 临时邮箱检查
      const current = stats.temporary_mailboxes;
      const limit = tierConfig.temporary_mailbox_quota;

      // -1 表示无限制
      if (limit !== -1 && current >= limit) {
        return {
          allowed: false,
          reason: 'QUOTA_EXCEEDED',
          current,
          limit,
          tierName: tierConfig.tier_name
        };
      }
    }

    // 检查用户等级是否过期
    const userExpired = await db.prepare(`
      SELECT tier_expires_at
      FROM users
      WHERE id = ? AND deleted_at IS NULL
    `).bind(userId).first<{ tier_expires_at: string | null }>();

    if (userExpired?.tier_expires_at) {
      const expiresAt = new Date(userExpired.tier_expires_at);
      const now = new Date();

      if (expiresAt <= now) {
        return {
          allowed: false,
          reason: 'TIER_EXPIRED',
          tierName: tierConfig.tier_name
        };
      }
    }

    return {
      allowed: true,
      current: isPermanent ? stats.permanent_mailboxes : stats.temporary_mailboxes,
      limit: isPermanent ? tierConfig.permanent_mailbox_quota : tierConfig.temporary_mailbox_quota,
      tierName: tierConfig.tier_name
    };
  } catch (error) {
    console.error('Error checking mailbox quota:', error);
    return {
      allowed: false,
      reason: 'INTERNAL_ERROR'
    };
  }
}

/**
 * 根据ID获取等级配置
 */
export async function getTierConfigById(tierId: number, db: D1Database): Promise<TierConfig | null> {
  try {
    const result = await db.prepare(`
      SELECT * FROM tier_configs
      WHERE id = ? AND is_active = 1
    `).bind(tierId).first<TierConfig>();

    return result;
  } catch (error) {
    console.error('Error getting tier config by id:', error);
    return null;
  }
}

/**
 * 获取所有活跃的等级配置
 */
export async function getAllActiveTierConfigs(db: D1Database): Promise<TierConfig[]> {
  try {
    const result = await db.prepare(`
      SELECT * FROM tier_configs
      WHERE is_active = 1
      ORDER BY sort_order ASC
    `).all<TierConfig>();

    return result.results || [];
  } catch (error) {
    console.error('Error getting all tier configs:', error);
    return [];
  }
}

/**
 * 更新用户邮箱统计（创建邮箱后调用）
 */
export async function updateUserMailboxStats(
  userId: number,
  isPermanent: boolean,
  increment: boolean,
  db: D1Database
): Promise<void> {
  try {
    const field = isPermanent ? 'permanent_mailboxes' : 'temporary_mailboxes';
    const operation = increment ? '+' : '-';

    await db.prepare(`
      UPDATE user_statistics
      SET
        ${field} = ${field} ${operation} 1,
        total_mailboxes = total_mailboxes ${operation} 1,
        active_mailboxes = active_mailboxes ${operation} 1,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).bind(userId).run();

    // 如果更新影响0行，说明记录不存在，需要创建
    const exists = await db.prepare(`
      SELECT user_id FROM user_statistics WHERE user_id = ?
    `).bind(userId).first();

    if (!exists) {
      // 重新计算并创建记录
      await getUserMailboxStats(userId, db);
    }
  } catch (error) {
    console.error('Error updating user mailbox stats:', error);
  }
}