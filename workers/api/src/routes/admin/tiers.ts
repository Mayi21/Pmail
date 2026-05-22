/**
 * 等级配置管理路由
 * 管理员管理等级配置的 API 端点
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { jwtAuth, requireAdmin } from '../../middleware/auth';
import { getAllActiveTierConfigs } from '../../services/quotaService';
import type { Env } from '../../index';
import { ErrorCode } from '../../types';

const app = new Hono<{ Bindings: Env }>();

// 应用中间件
app.use('*', jwtAuth);
app.use('*', requireAdmin);

// 验证模式
const createTierSchema = z.object({
  tier_name: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/),
  display_name: z.string().min(1).max(100),
  sort_order: z.number().min(0).max(1000),
  permanent_mailbox_quota: z.number().min(0).max(10000),
  temporary_mailbox_quota: z.number().min(-1).max(10000), // -1 表示无限
  description: z.string().max(500).optional(),
  is_active: z.boolean().optional().default(true),
});

const updateTierSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  sort_order: z.number().min(0).max(1000).optional(),
  permanent_mailbox_quota: z.number().min(0).max(10000).optional(),
  temporary_mailbox_quota: z.number().min(-1).max(10000).optional(),
  description: z.string().max(500).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/tiers/list
 * 获取所有等级配置
 */
app.get('/list', async (c) => {
  try {
    const tiers = await c.env.DB.prepare(`
      SELECT
        tc.*,
        COUNT(u.id) as user_count,
        SUM(CASE WHEN u.tier_expires_at IS NULL THEN 1 ELSE 0 END) as permanent_users,
        SUM(CASE WHEN u.tier_expires_at IS NOT NULL THEN 1 ELSE 0 END) as temporary_users
      FROM tier_configs tc
      LEFT JOIN users u ON tc.id = u.tier_id AND u.deleted_at IS NULL
      GROUP BY tc.id
      ORDER BY tc.sort_order ASC
    `).all();

    return c.json({
      success: true,
      data: {
        tiers: tiers.results || [],
      },
    });
  } catch (error: any) {
    console.error('Error fetching tiers:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch tiers',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/admin/tiers/:id
 * 获取单个等级配置详情
 */
app.get('/:id', async (c) => {
  try {
    const tierId = parseInt(c.req.param('id'));

    const tier = await c.env.DB.prepare(`
      SELECT
        tc.*,
        COUNT(u.id) as user_count,
        SUM(CASE WHEN u.tier_expires_at IS NULL THEN 1 ELSE 0 END) as permanent_users,
        SUM(CASE WHEN u.tier_expires_at IS NOT NULL THEN 1 ELSE 0 END) as temporary_users
      FROM tier_configs tc
      LEFT JOIN users u ON tc.id = u.tier_id AND u.deleted_at IS NULL
      WHERE tc.id = ?
      GROUP BY tc.id
    `).bind(tierId).first();

    if (!tier) {
      return c.json({
        success: false,
        error: 'Tier not found',
        error_code: ErrorCode.TIER_NOT_FOUND,
      }, 404);
    }

    return c.json({
      success: true,
      data: tier,
    });
  } catch (error: any) {
    console.error('Error fetching tier:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch tier',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * POST /api/admin/tiers/create
 * 创建新等级
 */
app.post('/create', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createTierSchema.parse(body);
    const adminId = c.get('user_id');

    // 检查等级名称是否已存在
    const existing = await c.env.DB.prepare(`
      SELECT id FROM tier_configs
      WHERE tier_name = ?
    `).bind(validated.tier_name).first();

    if (existing) {
      return c.json({
        success: false,
        error: 'Tier name already exists',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    // 创建等级
    const result = await c.env.DB.prepare(`
      INSERT INTO tier_configs (
        tier_name,
        display_name,
        sort_order,
        permanent_mailbox_quota,
        temporary_mailbox_quota,
        description,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      validated.tier_name,
      validated.display_name,
      validated.sort_order,
      validated.permanent_mailbox_quota,
      validated.temporary_mailbox_quota,
      validated.description || null,
      validated.is_active ? 1 : 0
    ).run();

    const tierId = result.meta.last_row_id;

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_CREATE_TIER', 'tier_config', ?, ?)
    `).bind(
      adminId,
      tierId,
      JSON.stringify(validated)
    ).run();

    return c.json({
      success: true,
      message: 'Tier created successfully',
      data: {
        id: tierId,
        ...validated,
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

    console.error('Error creating tier:', error);
    return c.json({
      success: false,
      error: 'Failed to create tier',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * PATCH /api/admin/tiers/:id/update
 * 更新等级配置
 */
app.patch('/:id/update', async (c) => {
  try {
    const tierId = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const validated = updateTierSchema.parse(body);
    const adminId = c.get('user_id');

    // 检查等级是否存在
    const tier = await c.env.DB.prepare(`
      SELECT id, tier_name FROM tier_configs
      WHERE id = ?
    `).bind(tierId).first();

    if (!tier) {
      return c.json({
        success: false,
        error: 'Tier not found',
        error_code: ErrorCode.TIER_NOT_FOUND,
      }, 404);
    }

    // 防止修改基础等级（basic）的关键配置
    if (tier.tier_name === 'basic' && (
      validated.permanent_mailbox_quota !== undefined ||
      validated.temporary_mailbox_quota !== undefined
    )) {
      return c.json({
        success: false,
        error: 'Cannot modify quota for basic tier',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    // 构建更新语句
    const updates: string[] = [];
    const values: any[] = [];

    if (validated.display_name !== undefined) {
      updates.push('display_name = ?');
      values.push(validated.display_name);
    }
    if (validated.sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(validated.sort_order);
    }
    if (validated.permanent_mailbox_quota !== undefined) {
      updates.push('permanent_mailbox_quota = ?');
      values.push(validated.permanent_mailbox_quota);
    }
    if (validated.temporary_mailbox_quota !== undefined) {
      updates.push('temporary_mailbox_quota = ?');
      values.push(validated.temporary_mailbox_quota);
    }
    if (validated.description !== undefined) {
      updates.push('description = ?');
      values.push(validated.description);
    }
    if (validated.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(validated.is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return c.json({
        success: false,
        error: 'No fields to update',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    updates.push('updated_at = datetime("now")');
    values.push(tierId);

    // 更新等级
    await c.env.DB.prepare(`
      UPDATE tier_configs
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...values).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_UPDATE_TIER', 'tier_config', ?, ?)
    `).bind(
      adminId,
      tierId,
      JSON.stringify(validated)
    ).run();

    return c.json({
      success: true,
      message: 'Tier updated successfully',
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

    console.error('Error updating tier:', error);
    return c.json({
      success: false,
      error: 'Failed to update tier',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * PATCH /api/admin/tiers/:id/toggle
 * 启用/禁用等级
 */
app.patch('/:id/toggle', async (c) => {
  try {
    const tierId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');

    // 检查等级是否存在
    const tier = await c.env.DB.prepare(`
      SELECT id, tier_name, is_active FROM tier_configs
      WHERE id = ?
    `).bind(tierId).first<{ id: number; tier_name: string; is_active: number }>();

    if (!tier) {
      return c.json({
        success: false,
        error: 'Tier not found',
        error_code: ErrorCode.TIER_NOT_FOUND,
      }, 404);
    }

    // 防止禁用基础等级
    if (tier.tier_name === 'basic' && tier.is_active === 1) {
      return c.json({
        success: false,
        error: 'Cannot disable basic tier',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    const newStatus = tier.is_active === 1 ? 0 : 1;

    // 更新状态
    await c.env.DB.prepare(`
      UPDATE tier_configs
      SET is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(newStatus, tierId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_TOGGLE_TIER', 'tier_config', ?, ?)
    `).bind(
      adminId,
      tierId,
      JSON.stringify({ is_active: newStatus })
    ).run();

    return c.json({
      success: true,
      message: `Tier ${newStatus === 1 ? 'enabled' : 'disabled'} successfully`,
      data: {
        is_active: newStatus === 1,
      },
    });
  } catch (error: any) {
    console.error('Error toggling tier:', error);
    return c.json({
      success: false,
      error: 'Failed to toggle tier',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * DELETE /api/admin/tiers/:id
 * 删除等级（仅当没有用户使用时）
 */
app.delete('/:id', async (c) => {
  try {
    const tierId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');

    // 检查等级是否存在
    const tier = await c.env.DB.prepare(`
      SELECT
        tc.id,
        tc.tier_name,
        COUNT(u.id) as user_count
      FROM tier_configs tc
      LEFT JOIN users u ON tc.id = u.tier_id AND u.deleted_at IS NULL
      WHERE tc.id = ?
      GROUP BY tc.id
    `).bind(tierId).first<{ id: number; tier_name: string; user_count: number }>();

    if (!tier) {
      return c.json({
        success: false,
        error: 'Tier not found',
        error_code: ErrorCode.TIER_NOT_FOUND,
      }, 404);
    }

    // 防止删除基础等级
    if (tier.tier_name === 'basic') {
      return c.json({
        success: false,
        error: 'Cannot delete basic tier',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    // 检查是否有用户使用
    if (tier.user_count > 0) {
      return c.json({
        success: false,
        error: `Cannot delete tier with ${tier.user_count} active users`,
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    // 删除等级
    await c.env.DB.prepare(`
      DELETE FROM tier_configs WHERE id = ?
    `).bind(tierId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_DELETE_TIER', 'tier_config', ?, ?)
    `).bind(
      adminId,
      tierId,
      JSON.stringify({ tier_name: tier.tier_name })
    ).run();

    return c.json({
      success: true,
      message: 'Tier deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting tier:', error);
    return c.json({
      success: false,
      error: 'Failed to delete tier',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

export default app;