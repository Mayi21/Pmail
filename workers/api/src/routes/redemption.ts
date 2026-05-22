/**
 * 兑换码路由
 * 处理用户兑换码相关的 API 端点
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { jwtAuth } from '../middleware/auth';
import { redeemCode, getUserRedemptionHistory } from '../services/redemptionService';
import type { Env } from '../index';
import { ErrorCode } from '../types';

const app = new Hono<{ Bindings: Env }>();

// 验证模式
const redeemSchema = z.object({
  code: z.string().min(1).max(50).transform(val => val.toUpperCase()),
});

/**
 * POST /api/redemption/redeem
 * 兑换代码
 */
app.post('/redeem', jwtAuth, async (c) => {
  try {
    const userId = c.get('user_id');
    const body = await c.req.json();
    const validated = redeemSchema.parse(body);

    // 获取客户端 IP
    const clientIP = c.req.header('CF-Connecting-IP')
      || c.req.header('X-Forwarded-For')
      || c.req.header('X-Real-IP')
      || '';

    // 执行兑换
    const result = await redeemCode(userId, validated.code, clientIP, c.env.DB);

    if (!result.success) {
      return c.json({
        success: false,
        error: result.error,
        error_code: result.error_code,
      }, result.error_code === ErrorCode.REDEMPTION_CODE_INVALID ? 404
        : result.error_code === ErrorCode.REDEMPTION_CODE_EXPIRED ? 410
        : result.error_code === ErrorCode.REDEMPTION_CODE_USED ? 409
        : result.error_code === ErrorCode.REDEMPTION_TIER_INACTIVE ? 422
        : 400);
    }

    // 获取更新后的用户信息
    const updatedUser = await c.env.DB.prepare(`
      SELECT
        u.tier_id,
        u.tier_expires_at,
        tc.tier_name,
        tc.display_name,
        tc.permanent_mailbox_quota,
        tc.temporary_mailbox_quota
      FROM users u
      JOIN tier_configs tc ON u.tier_id = tc.id
      WHERE u.id = ? AND u.deleted_at IS NULL
    `).bind(userId).first<{
      tier_id: number;
      tier_expires_at: string | null;
      tier_name: string;
      display_name: string;
      permanent_mailbox_quota: number;
      temporary_mailbox_quota: number;
    }>();

    return c.json({
      success: true,
      message: result.message,
      data: {
        tier: {
          id: updatedUser?.tier_id,
          name: updatedUser?.tier_name,
          display_name: updatedUser?.display_name,
          expires_at: result.expires_at,
        },
        quota: {
          permanent_mailboxes: updatedUser?.permanent_mailbox_quota,
          temporary_mailboxes: updatedUser?.temporary_mailbox_quota === -1
            ? 'unlimited'
            : updatedUser?.temporary_mailbox_quota,
        },
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Invalid request data',
        error_code: ErrorCode.VALIDATION_ERROR,
        details: error.errors,
      }, 400);
    }

    console.error('Redemption error:', error);
    return c.json({
      success: false,
      error: 'Failed to redeem code',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/redemption/history
 * 获取用户兑换历史
 */
app.get('/history', jwtAuth, async (c) => {
  try {
    const userId = c.get('user_id');
    const limit = parseInt(c.req.query('limit') || '50');

    const history = await getUserRedemptionHistory(userId, c.env.DB, Math.min(limit, 100));

    return c.json({
      success: true,
      data: history.map(item => ({
        id: item.id,
        code: item.code,
        tier_name: item.tier_name,
        tier_display_name: item.tier_display_name,
        duration: item.duration_type === 'permanent'
          ? 'Permanent'
          : item.duration_type === 'days'
          ? `${item.duration_value} days`
          : `${item.duration_value} months`,
        expires_at: item.tier_expires_at,
        redeemed_at: item.redeemed_at,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching redemption history:', error);
    return c.json({
      success: false,
      error: 'Failed to get redemption history',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * POST /api/redemption/check
 * 检查兑换码是否有效（不实际兑换）
 */
app.post('/check', jwtAuth, async (c) => {
  try {
    const userId = c.get('user_id');
    const body = await c.req.json();
    const validated = redeemSchema.parse(body);

    // 检查兑换码是否存在且激活（先不检查 tier 状态）
    const redemptionCode = await c.env.DB.prepare(`
      SELECT
        rc.id,
        rc.code,
        rc.tier_id,
        rc.duration_type,
        rc.duration_value,
        rc.max_uses,
        rc.used_count,
        rc.expires_at,
        rc.is_active,
        tc.tier_name,
        tc.display_name,
        tc.permanent_mailbox_quota,
        tc.temporary_mailbox_quota,
        tc.is_active as tier_is_active
      FROM redemption_codes rc
      JOIN tier_configs tc ON rc.tier_id = tc.id
      WHERE rc.code = ?
        AND rc.is_active = 1
    `).bind(validated.code).first<any>();

    if (!redemptionCode) {
      return c.json({
        success: false,
        error: 'Invalid redemption code',
        error_code: ErrorCode.REDEMPTION_CODE_INVALID,
      }, 404);
    }

    // 检查关联的等级是否已激活
    if (redemptionCode.tier_is_active !== 1) {
      return c.json({
        success: false,
        error: 'Redemption code\'s tier is inactive',
        error_code: ErrorCode.REDEMPTION_TIER_INACTIVE,
      }, 422);
    }

    // 检查是否过期
    if (redemptionCode.expires_at) {
      const expiresAt = new Date(redemptionCode.expires_at);
      if (expiresAt <= new Date()) {
        return c.json({
          success: false,
          error: 'Redemption code has expired',
          error_code: ErrorCode.REDEMPTION_CODE_EXPIRED,
        }, 410);
      }
    }

    // 检查使用次数
    if (redemptionCode.max_uses !== -1 && redemptionCode.used_count >= redemptionCode.max_uses) {
      return c.json({
        success: false,
        error: 'Redemption code has been fully used',
        error_code: ErrorCode.REDEMPTION_CODE_EXHAUSTED,
      }, 410);
    }

    // 检查用户是否已使用
    const used = await c.env.DB.prepare(`
      SELECT id FROM redemption_history
      WHERE user_id = ? AND code_id = ?
    `).bind(userId, redemptionCode.id).first();

    if (used) {
      return c.json({
        success: false,
        error: 'You have already used this redemption code',
        error_code: ErrorCode.REDEMPTION_CODE_USED,
      }, 409);
    }

    return c.json({
      success: true,
      data: {
        valid: true,
        tier: {
          name: redemptionCode.tier_name,
          display_name: redemptionCode.display_name,
        },
        duration: redemptionCode.duration_type === 'permanent'
          ? 'Permanent'
          : redemptionCode.duration_type === 'days'
          ? `${redemptionCode.duration_value} days`
          : `${redemptionCode.duration_value} months`,
        quota: {
          permanent_mailboxes: redemptionCode.permanent_mailbox_quota,
          temporary_mailboxes: redemptionCode.temporary_mailbox_quota === -1
            ? 'unlimited'
            : redemptionCode.temporary_mailbox_quota,
        },
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Invalid request data',
        error_code: ErrorCode.VALIDATION_ERROR,
        details: error.errors,
      }, 400);
    }

    console.error('Code check error:', error);
    return c.json({
      success: false,
      error: 'Failed to check code',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

export default app;