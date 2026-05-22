/**
 * 兑换码服务
 * 处理兑换码验证和等级升级逻辑
 */

import { D1Database } from '@cloudflare/workers-types';
import { RedemptionCode, ErrorCode } from '../types';

/**
 * 兑换结果接口
 */
export interface RedemptionResult {
  success: boolean;
  message?: string;
  error?: string;
  error_code?: string;
  tier_name?: string;
  expires_at?: string | null;
}

/**
 * 计算等级过期时间
 * @param durationType 时效类型：permanent, days, months
 * @param durationValue 时效数值
 * @param currentExpiry 当前过期时间（用于延长）
 * @returns 新的过期时间或 null（永久）
 */
export function calculateTierExpiration(
  durationType: 'permanent' | 'days' | 'months',
  durationValue: number | null,
  currentExpiry?: string | null
): string | null {
  if (durationType === 'permanent') {
    return null; // 永久等级
  }

  const now = new Date();

  // 如果用户当前等级还未过期，从当前过期时间开始延长
  // 否则从现在开始计算
  const startDate = currentExpiry && new Date(currentExpiry) > now
    ? new Date(currentExpiry)
    : now;

  if (durationType === 'days' && durationValue) {
    startDate.setDate(startDate.getDate() + durationValue);
    return startDate.toISOString();
  } else if (durationType === 'months' && durationValue) {
    startDate.setMonth(startDate.getMonth() + durationValue);
    return startDate.toISOString();
  }

  return null;
}

/**
 * 兑换码兑换
 * @param userId 用户ID
 * @param code 兑换码
 * @param clientIP 客户端IP（用于审计）
 * @param db 数据库连接
 * @returns 兑换结果
 */
export async function redeemCode(
  userId: number,
  code: string,
  clientIP: string,
  db: D1Database
): Promise<RedemptionResult> {
  try {
    // 1. 验证兑换码是否存在且激活（先不检查 tier 状态）
    const redemptionCode = await db.prepare(`
      SELECT
        rc.*,
        tc.tier_name,
        tc.display_name as tier_display_name,
        tc.is_active as tier_is_active
      FROM redemption_codes rc
      JOIN tier_configs tc ON rc.tier_id = tc.id
      WHERE rc.code = ?
        AND rc.is_active = 1
    `).bind(code.toUpperCase()).first<RedemptionCode & {
      tier_name: string;
      tier_display_name: string;
      tier_is_active: number;
    }>();

    if (!redemptionCode) {
      return {
        success: false,
        error: 'Invalid redemption code',
        error_code: ErrorCode.REDEMPTION_CODE_INVALID,
      };
    }

    // 2. 检查关联的等级是否已激活
    if (redemptionCode.tier_is_active !== 1) {
      return {
        success: false,
        error: 'Redemption code\'s tier is inactive',
        error_code: ErrorCode.REDEMPTION_TIER_INACTIVE,
      };
    }

    // 3. 检查兑换码是否过期
    if (redemptionCode.expires_at) {
      const expiresAt = new Date(redemptionCode.expires_at);
      if (expiresAt <= new Date()) {
        return {
          success: false,
          error: 'Redemption code has expired',
          error_code: ErrorCode.REDEMPTION_CODE_EXPIRED,
        };
      }
    }

    // 4. 检查使用次数限制
    if (redemptionCode.max_uses !== -1 && redemptionCode.used_count >= redemptionCode.max_uses) {
      return {
        success: false,
        error: 'Redemption code has been fully used',
        error_code: ErrorCode.REDEMPTION_CODE_EXHAUSTED,
      };
    }

    // 5. 检查用户是否已使用过此兑换码
    const existingRedemption = await db.prepare(`
      SELECT id FROM redemption_history
      WHERE user_id = ? AND code_id = ?
    `).bind(userId, redemptionCode.id).first();

    if (existingRedemption) {
      return {
        success: false,
        error: 'You have already used this redemption code',
        error_code: ErrorCode.REDEMPTION_CODE_USED,
      };
    }

    // 6. 获取用户当前等级信息
    const currentUser = await db.prepare(`
      SELECT tier_id, tier_expires_at
      FROM users
      WHERE id = ? AND deleted_at IS NULL
    `).bind(userId).first<{
      tier_id: number;
      tier_expires_at: string | null;
    }>();

    if (!currentUser) {
      return {
        success: false,
        error: 'User not found',
        error_code: ErrorCode.USER_NOT_FOUND,
      };
    }

    // 7. 计算新的等级过期时间
    const newExpiresAt = calculateTierExpiration(
      redemptionCode.duration_type as 'permanent' | 'days' | 'months',
      redemptionCode.duration_value ?? null,
      currentUser.tier_id === redemptionCode.tier_id ? currentUser.tier_expires_at : null
    );

    // 8. 开始事务（使用 batch 模拟）
    const batch = [];

    // 更新用户等级
    batch.push(db.prepare(`
      UPDATE users
      SET
        tier_id = ?,
        tier_upgraded_at = datetime('now'),
        tier_expires_at = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(redemptionCode.tier_id, newExpiresAt, userId));

    // 增加兑换码使用次数
    batch.push(db.prepare(`
      UPDATE redemption_codes
      SET used_count = used_count + 1
      WHERE id = ?
    `).bind(redemptionCode.id));

    // 记录兑换历史
    batch.push(db.prepare(`
      INSERT INTO redemption_history (
        user_id,
        code_id,
        tier_id,
        tier_expires_at,
        redeemed_at,
        ip_address
      ) VALUES (?, ?, ?, ?, datetime('now'), ?)
    `).bind(
      userId,
      redemptionCode.id,
      redemptionCode.tier_id,
      newExpiresAt,
      clientIP
    ));

    // 记录审计日志
    batch.push(db.prepare(`
      INSERT INTO audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        ip_address,
        details
      ) VALUES (?, 'REDEEM_CODE', 'redemption_code', ?, ?, ?)
    `).bind(
      userId,
      redemptionCode.id,
      clientIP,
      JSON.stringify({
        code: code,
        tier_name: redemptionCode.tier_name,
        duration_type: redemptionCode.duration_type,
        duration_value: redemptionCode.duration_value,
        expires_at: newExpiresAt,
      })
    ));

    // 执行批量操作
    await db.batch(batch);

    return {
      success: true,
      message: `Successfully upgraded to ${redemptionCode.tier_display_name}`,
      tier_name: redemptionCode.tier_name,
      expires_at: newExpiresAt,
    };

  } catch (error: any) {
    console.error('Redemption error:', error);
    return {
      success: false,
      error: 'Failed to redeem code',
      error_code: ErrorCode.INTERNAL_ERROR,
    };
  }
}

/**
 * 获取用户兑换历史
 * @param userId 用户ID
 * @param db 数据库连接
 * @param limit 返回数量限制
 * @returns 兑换历史列表
 */
export async function getUserRedemptionHistory(
  userId: number,
  db: D1Database,
  limit: number = 50
): Promise<any[]> {
  try {
    const history = await db.prepare(`
      SELECT
        rh.id,
        rh.redeemed_at,
        rh.tier_expires_at,
        rc.code,
        rc.duration_type,
        rc.duration_value,
        tc.tier_name,
        tc.display_name as tier_display_name
      FROM redemption_history rh
      JOIN redemption_codes rc ON rh.code_id = rc.id
      JOIN tier_configs tc ON rh.tier_id = tc.id
      WHERE rh.user_id = ?
      ORDER BY rh.redeemed_at DESC
      LIMIT ?
    `).bind(userId, limit).all();

    return history.results || [];
  } catch (error: any) {
    console.error('Error getting redemption history:', error);
    return [];
  }
}