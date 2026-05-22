/**
 * 等级过期服务
 * 处理用户等级自动降级
 */

import { D1Database } from '@cloudflare/workers-types';

/**
 * 过期用户信息接口
 */
interface ExpiredUser {
  id: number;
  username: string;
  email: string;
  tier_id: number;
  tier_name: string;
  tier_expires_at: string;
}

/**
 * 检查并处理过期的用户等级
 * @param db 数据库连接
 * @returns 处理结果统计
 */
export async function checkExpiredTiers(db: D1Database): Promise<{
  processed: number;
  downgraded: number;
  errors: number;
}> {
  const stats = {
    processed: 0,
    downgraded: 0,
    errors: 0,
  };

  try {
    // 1. 查找所有过期的用户
    const expiredUsers = await db.prepare(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.tier_id,
        u.tier_expires_at,
        tc.tier_name
      FROM users u
      JOIN tier_configs tc ON u.tier_id = tc.id
      WHERE u.tier_expires_at IS NOT NULL
        AND u.tier_expires_at <= datetime('now')
        AND u.deleted_at IS NULL
        AND u.tier_id != 1  -- 不是基础等级
      LIMIT 100  -- 批量处理，避免一次处理太多
    `).all<ExpiredUser>();

    if (!expiredUsers.results || expiredUsers.results.length === 0) {
      console.log('No expired users found');
      return stats;
    }

    console.log(`Found ${expiredUsers.results.length} expired users to process`);

    // 2. 批量处理过期用户
    const batch = [];
    const auditBatch = [];

    for (const user of expiredUsers.results) {
      stats.processed++;

      try {
        // 降级到基础等级 (tier_id = 1)
        batch.push(db.prepare(`
          UPDATE users
          SET
            tier_id = 1,
            tier_expires_at = NULL,
            tier_upgraded_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ?
        `).bind(user.id));

        // 记录审计日志
        auditBatch.push(db.prepare(`
          INSERT INTO audit_logs (
            user_id,
            action,
            entity_type,
            entity_id,
            details
          ) VALUES (?, 'TIER_EXPIRED_DOWNGRADE', 'user', ?, ?)
        `).bind(
          user.id,
          user.id,
          JSON.stringify({
            previous_tier_id: user.tier_id,
            previous_tier_name: user.tier_name,
            expired_at: user.tier_expires_at,
            downgraded_to: 'basic',
          })
        ));

        stats.downgraded++;
      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error);
        stats.errors++;
      }
    }

    // 3. 执行批量更新
    if (batch.length > 0) {
      try {
        // 分批执行，避免单个事务太大
        const batchSize = 25;
        for (let i = 0; i < batch.length; i += batchSize) {
          const currentBatch = batch.slice(i, i + batchSize);
          await db.batch(currentBatch);
        }

        // 执行审计日志批量插入
        for (let i = 0; i < auditBatch.length; i += batchSize) {
          const currentBatch = auditBatch.slice(i, i + batchSize);
          await db.batch(currentBatch);
        }

        console.log(`Successfully downgraded ${stats.downgraded} users`);
      } catch (error) {
        console.error('Error executing batch update:', error);
        stats.errors = batch.length;
        stats.downgraded = 0;
      }
    }

    // 4. 发送通知（可选，未来功能）
    // TODO: 如果配置了通知服务，向用户发送等级过期通知

    return stats;
  } catch (error) {
    console.error('Error in checkExpiredTiers:', error);
    throw error;
  }
}

/**
 * 获取即将过期的用户列表（提前预警）
 * @param db 数据库连接
 * @param days 提前天数
 * @returns 即将过期的用户列表
 */
export async function getExpiringUsers(
  db: D1Database,
  days: number = 7
): Promise<ExpiredUser[]> {
  try {
    const result = await db.prepare(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.tier_id,
        u.tier_expires_at,
        tc.tier_name
      FROM users u
      JOIN tier_configs tc ON u.tier_id = tc.id
      WHERE u.tier_expires_at IS NOT NULL
        AND u.tier_expires_at > datetime('now')
        AND u.tier_expires_at <= datetime('now', '+' || ? || ' days')
        AND u.deleted_at IS NULL
        AND u.tier_id != 1  -- 不是基础等级
      ORDER BY u.tier_expires_at ASC
    `).bind(days).all<ExpiredUser>();

    return result.results || [];
  } catch (error) {
    console.error('Error getting expiring users:', error);
    return [];
  }
}

/**
 * 手动降级指定用户
 * @param userId 用户ID
 * @param db 数据库连接
 * @returns 是否成功
 */
export async function downgradeUser(
  userId: number,
  db: D1Database
): Promise<boolean> {
  try {
    // 获取用户当前信息
    const user = await db.prepare(`
      SELECT
        u.id,
        u.tier_id,
        tc.tier_name
      FROM users u
      JOIN tier_configs tc ON u.tier_id = tc.id
      WHERE u.id = ? AND u.deleted_at IS NULL
    `).bind(userId).first<{
      id: number;
      tier_id: number;
      tier_name: string;
    }>();

    if (!user || user.tier_id === 1) {
      return false; // 用户不存在或已经是基础等级
    }

    // 降级到基础等级
    await db.prepare(`
      UPDATE users
      SET
        tier_id = 1,
        tier_expires_at = NULL,
        tier_upgraded_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(userId).run();

    // 记录审计日志
    await db.prepare(`
      INSERT INTO audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        details
      ) VALUES (?, 'MANUAL_TIER_DOWNGRADE', 'user', ?, ?)
    `).bind(
      userId,
      userId,
      JSON.stringify({
        previous_tier_id: user.tier_id,
        previous_tier_name: user.tier_name,
        downgraded_to: 'basic',
      })
    ).run();

    return true;
  } catch (error) {
    console.error('Error downgrading user:', error);
    return false;
  }
}

/**
 * 获取等级过期统计
 * @param db 数据库连接
 * @returns 统计数据
 */
export async function getTierExpirationStats(db: D1Database): Promise<{
  expired_today: number;
  expiring_7d: number;
  expiring_30d: number;
  total_temporary: number;
}> {
  try {
    const stats = await db.prepare(`
      SELECT
        SUM(CASE
          WHEN tier_expires_at IS NOT NULL AND tier_expires_at <= datetime('now')
          THEN 1 ELSE 0
        END) as expired_today,
        SUM(CASE
          WHEN tier_expires_at IS NOT NULL
            AND tier_expires_at > datetime('now')
            AND tier_expires_at <= datetime('now', '+7 days')
          THEN 1 ELSE 0
        END) as expiring_7d,
        SUM(CASE
          WHEN tier_expires_at IS NOT NULL
            AND tier_expires_at > datetime('now')
            AND tier_expires_at <= datetime('now', '+30 days')
          THEN 1 ELSE 0
        END) as expiring_30d,
        SUM(CASE
          WHEN tier_expires_at IS NOT NULL
          THEN 1 ELSE 0
        END) as total_temporary
      FROM users
      WHERE deleted_at IS NULL AND tier_id != 1
    `).first<{
      expired_today: number;
      expiring_7d: number;
      expiring_30d: number;
      total_temporary: number;
    }>();

    return stats || {
      expired_today: 0,
      expiring_7d: 0,
      expiring_30d: 0,
      total_temporary: 0,
    };
  } catch (error) {
    console.error('Error getting tier expiration stats:', error);
    return {
      expired_today: 0,
      expiring_7d: 0,
      expiring_30d: 0,
      total_temporary: 0,
    };
  }
}