/**
 * 用户管理路由
 * 管理员管理用户的 API 端点
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { jwtAuth, requireAdmin } from '../../middleware/auth';
import type { Env } from '../../index';
import { ErrorCode } from '../../types';

const app = new Hono<{ Bindings: Env }>();

// 应用中间件
app.use('*', jwtAuth);
app.use('*', requireAdmin);

// 验证模式
const userQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => Math.min(parseInt(val || '20'), 100)),
  search: z.string().optional(),
  tier_id: z.string().optional().transform(val => val ? parseInt(val) : undefined),
  role: z.enum(['user', 'admin']).optional(),
  sort: z.enum(['created_desc', 'created_asc', 'username', 'email']).optional().default('created_desc'),
});

const updateUserTierSchema = z.object({
  tier_id: z.number().min(1),
  duration_type: z.enum(['permanent', 'days', 'months']).optional(),
  duration_value: z.number().min(1).optional(),
});

const updateUserRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

/**
 * GET /api/admin/users
 * 获取用户列表（分页、搜索、筛选）
 */
app.get('/', async (c) => {
  try {
    const query = userQuerySchema.parse(c.req.query());

    // 构建查询条件
    const conditions = ['u.deleted_at IS NULL'];
    const params: any[] = [];

    if (query.search) {
      conditions.push('(u.username LIKE ? OR u.email LIKE ?)');
      params.push(`%${query.search}%`, `%${query.search}%`);
    }

    if (query.tier_id !== undefined) {
      conditions.push('u.tier_id = ?');
      params.push(query.tier_id);
    }

    if (query.role) {
      conditions.push('u.role = ?');
      params.push(query.role);
    }

    const whereClause = conditions.join(' AND ');

    // 排序
    const orderBy = {
      created_desc: 'u.created_at DESC',
      created_asc: 'u.created_at ASC',
      username: 'u.username ASC',
      email: 'u.email ASC',
    }[query.sort || 'created_desc'];

    // 计算分页
    const offset = (query.page - 1) * query.limit;

    // 获取总数
    const countResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM users u
      WHERE ${whereClause}
    `).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    // 获取用户列表
    const users = await c.env.DB.prepare(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.tier_id,
        u.role,
        u.tier_upgraded_at,
        u.tier_expires_at,
        u.created_at,
        u.updated_at,
        tc.tier_name,
        tc.display_name as tier_display_name,
        us.total_mailboxes,
        us.permanent_mailboxes,
        us.temporary_mailboxes,
        us.total_emails,
        us.last_activity
      FROM users u
      LEFT JOIN tier_configs tc ON u.tier_id = tc.id
      LEFT JOIN user_statistics us ON u.id = us.user_id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).bind(...params, query.limit, offset).all();

    return c.json({
      success: true,
      data: {
        users: users.results || [],
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          total_pages: Math.ceil(total / query.limit),
          has_more: offset + query.limit < total,
        },
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Invalid query parameters',
        error_code: ErrorCode.VALIDATION_ERROR,
        details: error.errors,
      }, 400);
    }

    console.error('Error fetching users:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch users',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/admin/users/:id
 * 获取单个用户详情
 */
app.get('/:id', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));

    const user = await c.env.DB.prepare(`
      SELECT
        u.*,
        tc.tier_name,
        tc.display_name as tier_display_name,
        tc.permanent_mailbox_quota,
        tc.temporary_mailbox_quota,
        us.total_mailboxes,
        us.active_mailboxes,
        us.permanent_mailboxes,
        us.temporary_mailboxes,
        us.total_emails,
        us.unread_emails,
        us.last_activity
      FROM users u
      LEFT JOIN tier_configs tc ON u.tier_id = tc.id
      LEFT JOIN user_statistics us ON u.id = us.user_id
      WHERE u.id = ? AND u.deleted_at IS NULL
    `).bind(userId).first();

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found',
        error_code: ErrorCode.USER_NOT_FOUND,
      }, 404);
    }

    // 获取用户的邮箱列表
    const mailboxes = await c.env.DB.prepare(`
      SELECT
        id,
        address,
        expires_at,
        created_at
      FROM temp_emails
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(userId).all();

    // 获取用户的兑换历史
    const redemptions = await c.env.DB.prepare(`
      SELECT
        rh.redeemed_at,
        rc.code,
        tc.tier_name,
        tc.display_name
      FROM redemption_history rh
      JOIN redemption_codes rc ON rh.code_id = rc.id
      JOIN tier_configs tc ON rh.tier_id = tc.id
      WHERE rh.user_id = ?
      ORDER BY rh.redeemed_at DESC
      LIMIT 10
    `).bind(userId).all();

    // 删除密码哈希
    const { password_hash, ...userWithoutPassword } = user;

    return c.json({
      success: true,
      data: {
        user: userWithoutPassword,
        recent_mailboxes: mailboxes.results || [],
        recent_redemptions: redemptions.results || [],
      },
    });
  } catch (error: any) {
    console.error('Error fetching user:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch user',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * PATCH /api/admin/users/:id/tier
 * 更新用户等级
 */
app.patch('/:id/tier', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');
    const body = await c.req.json();
    const validated = updateUserTierSchema.parse(body);

    // 验证等级是否存在
    const tier = await c.env.DB.prepare(`
      SELECT id, tier_name, display_name
      FROM tier_configs
      WHERE id = ? AND is_active = 1
    `).bind(validated.tier_id).first();

    if (!tier) {
      return c.json({
        success: false,
        error: 'Invalid tier ID',
        error_code: ErrorCode.TIER_NOT_FOUND,
      }, 404);
    }

    // 计算过期时间
    let expiresAt = null;
    if (validated.duration_type && validated.duration_type !== 'permanent' && validated.duration_value) {
      const date = new Date();
      if (validated.duration_type === 'days') {
        date.setDate(date.getDate() + validated.duration_value);
      } else if (validated.duration_type === 'months') {
        date.setMonth(date.getMonth() + validated.duration_value);
      }
      expiresAt = date.toISOString();
    }

    // 更新用户等级
    await c.env.DB.prepare(`
      UPDATE users
      SET
        tier_id = ?,
        tier_upgraded_at = datetime('now'),
        tier_expires_at = ?,
        updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).bind(validated.tier_id, expiresAt, userId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_UPDATE_USER_TIER', 'user', ?, ?)
    `).bind(
      adminId,
      userId,
      JSON.stringify({
        tier_id: validated.tier_id,
        tier_name: tier.tier_name,
        expires_at: expiresAt,
        admin_id: adminId,
      })
    ).run();

    return c.json({
      success: true,
      message: 'User tier updated successfully',
      data: {
        tier_id: validated.tier_id,
        tier_name: tier.tier_name,
        tier_display_name: tier.display_name,
        expires_at: expiresAt,
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

    console.error('Error updating user tier:', error);
    return c.json({
      success: false,
      error: 'Failed to update user tier',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * PATCH /api/admin/users/:id/role
 * 更新用户角色
 */
app.patch('/:id/role', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');
    const body = await c.req.json();
    const validated = updateUserRoleSchema.parse(body);

    // 防止管理员降级自己
    if (userId === adminId && validated.role === 'user') {
      return c.json({
        success: false,
        error: 'Cannot demote yourself',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    // 更新用户角色
    await c.env.DB.prepare(`
      UPDATE users
      SET
        role = ?,
        updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).bind(validated.role, userId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_UPDATE_USER_ROLE', 'user', ?, ?)
    `).bind(
      adminId,
      userId,
      JSON.stringify({
        role: validated.role,
        admin_id: adminId,
      })
    ).run();

    return c.json({
      success: true,
      message: 'User role updated successfully',
      data: {
        role: validated.role,
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

    console.error('Error updating user role:', error);
    return c.json({
      success: false,
      error: 'Failed to update user role',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * DELETE /api/admin/users/:id
 * 软删除用户
 */
app.delete('/:id', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');

    // 防止管理员删除自己
    if (userId === adminId) {
      return c.json({
        success: false,
        error: 'Cannot delete yourself',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    // 软删除用户
    await c.env.DB.prepare(`
      UPDATE users
      SET deleted_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).bind(userId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_DELETE_USER', 'user', ?, ?)
    `).bind(
      adminId,
      userId,
      JSON.stringify({ admin_id: adminId })
    ).run();

    return c.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return c.json({
      success: false,
      error: 'Failed to delete user',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

export default app;