/**
 * 兑换码管理路由
 * 管理员管理兑换码的 API 端点
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
const generateCodeSchema = z.object({
  tier_id: z.number().min(1),
  duration_type: z.enum(['permanent', 'days', 'months']),
  duration_value: z.number().min(1).optional().nullable(),
  max_uses: z.number().min(-1).default(1), // -1 表示无限
  expires_at: z.string().optional().nullable(),
  note: z.string().max(500).optional(),
  code_prefix: z.string().max(10).optional(),
  batch_size: z.number().min(1).max(100).optional().default(1),
});

const listCodesSchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => Math.min(parseInt(val || '20'), 100)),
  tier_id: z.string().optional().transform(val => val ? parseInt(val) : undefined),
  is_active: z.string().optional().transform(val => val === 'true' ? 1 : val === 'false' ? 0 : undefined),
  search: z.string().optional(),
});

/**
 * 生成随机兑换码
 */
function generateRandomCode(prefix?: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments = 3;
  const segmentLength = 4;

  let code = prefix ? prefix.toUpperCase() + '-' : '';

  for (let i = 0; i < segments; i++) {
    if (i > 0) code += '-';
    for (let j = 0; j < segmentLength; j++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }

  return code;
}

/**
 * POST /api/admin/redemption/generate
 * 生成兑换码（支持批量）
 */
app.post('/generate', async (c) => {
  try {
    const body = await c.req.json();
    const validated = generateCodeSchema.parse(body);
    const adminId = c.get('user_id');

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

    // 验证时效参数
    if (validated.duration_type !== 'permanent' && !validated.duration_value) {
      return c.json({
        success: false,
        error: 'Duration value is required for non-permanent codes',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    const generatedCodes = [];
    const batch = [];

    // 生成兑换码
    for (let i = 0; i < validated.batch_size; i++) {
      let code = '';
      let attempts = 0;
      const maxAttempts = 10;

      // 生成唯一的兑换码
      while (attempts < maxAttempts) {
        code = generateRandomCode(validated.code_prefix);

        const existing = await c.env.DB.prepare(`
          SELECT id FROM redemption_codes WHERE code = ?
        `).bind(code).first();

        if (!existing) {
          break;
        }
        attempts++;
      }

      if (attempts >= maxAttempts) {
        continue; // 跳过这个兑换码
      }

      // 添加到批量插入
      batch.push(c.env.DB.prepare(`
        INSERT INTO redemption_codes (
          code,
          tier_id,
          duration_type,
          duration_value,
          max_uses,
          expires_at,
          created_by,
          note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        code,
        validated.tier_id,
        validated.duration_type,
        validated.duration_value,
        validated.max_uses,
        validated.expires_at,
        adminId,
        validated.note || null
      ));

      generatedCodes.push(code);
    }

    // 执行批量插入
    if (batch.length > 0) {
      await c.env.DB.batch(batch);
    }

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, details)
      VALUES (?, 'ADMIN_GENERATE_CODES', 'redemption_code', ?)
    `).bind(
      adminId,
      JSON.stringify({
        tier_id: validated.tier_id,
        tier_name: tier.tier_name,
        batch_size: validated.batch_size,
        codes: generatedCodes,
      })
    ).run();

    return c.json({
      success: true,
      message: `Generated ${generatedCodes.length} redemption codes`,
      data: {
        codes: generatedCodes,
        tier: {
          id: tier.id,
          name: tier.tier_name,
          display_name: tier.display_name,
        },
        duration: validated.duration_type === 'permanent'
          ? 'Permanent'
          : `${validated.duration_value} ${validated.duration_type}`,
        max_uses: validated.max_uses === -1 ? 'Unlimited' : validated.max_uses,
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

    console.error('Error generating codes:', error);
    return c.json({
      success: false,
      error: 'Failed to generate codes',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/admin/redemption/list
 * 获取兑换码列表
 */
app.get('/list', async (c) => {
  try {
    const query = listCodesSchema.parse(c.req.query());

    // 构建查询条件
    const conditions = [];
    const params: any[] = [];

    if (query.tier_id !== undefined) {
      conditions.push('rc.tier_id = ?');
      params.push(query.tier_id);
    }

    if (query.is_active !== undefined) {
      conditions.push('rc.is_active = ?');
      params.push(query.is_active);
    }

    if (query.search) {
      conditions.push('rc.code LIKE ?');
      params.push(`%${query.search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 计算分页
    const offset = (query.page - 1) * query.limit;

    // 获取总数
    const countResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM redemption_codes rc
      ${whereClause}
    `).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    // 获取兑换码列表
    const codes = await c.env.DB.prepare(`
      SELECT
        rc.*,
        tc.tier_name,
        tc.display_name as tier_display_name,
        u.username as creator_username
      FROM redemption_codes rc
      JOIN tier_configs tc ON rc.tier_id = tc.id
      LEFT JOIN users u ON rc.created_by = u.id
      ${whereClause}
      ORDER BY rc.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, query.limit, offset).all();

    // 获取使用统计
    const codeIds = codes.results?.map(c => c.id) || [];
    let usageStats = new Map();

    if (codeIds.length > 0) {
      const usage = await c.env.DB.prepare(`
        SELECT
          code_id,
          COUNT(*) as redemption_count,
          MAX(redeemed_at) as last_redeemed
        FROM redemption_history
        WHERE code_id IN (${codeIds.map(() => '?').join(',')})
        GROUP BY code_id
      `).bind(...codeIds).all();

      usage.results?.forEach(u => {
        usageStats.set(u.code_id, {
          redemption_count: u.redemption_count,
          last_redeemed: u.last_redeemed,
        });
      });
    }

    return c.json({
      success: true,
      data: {
        codes: (codes.results || []).map(code => ({
          ...code,
          usage: usageStats.get(code.id) || { redemption_count: 0, last_redeemed: null },
        })),
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

    console.error('Error fetching codes:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch codes',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/admin/redemption/:id
 * 获取兑换码详情
 */
app.get('/:id', async (c) => {
  try {
    const codeId = parseInt(c.req.param('id'));

    const code = await c.env.DB.prepare(`
      SELECT
        rc.*,
        tc.tier_name,
        tc.display_name as tier_display_name,
        u.username as creator_username
      FROM redemption_codes rc
      JOIN tier_configs tc ON rc.tier_id = tc.id
      LEFT JOIN users u ON rc.created_by = u.id
      WHERE rc.id = ?
    `).bind(codeId).first();

    if (!code) {
      return c.json({
        success: false,
        error: 'Code not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    // 获取兑换历史
    const history = await c.env.DB.prepare(`
      SELECT
        rh.*,
        u.username,
        u.email
      FROM redemption_history rh
      JOIN users u ON rh.user_id = u.id
      WHERE rh.code_id = ?
      ORDER BY rh.redeemed_at DESC
      LIMIT 50
    `).bind(codeId).all();

    return c.json({
      success: true,
      data: {
        code,
        redemption_history: history.results || [],
      },
    });
  } catch (error: any) {
    console.error('Error fetching code:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch code',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * PATCH /api/admin/redemption/:id/toggle
 * 启用/禁用兑换码
 */
app.patch('/:id/toggle', async (c) => {
  try {
    const codeId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');

    // 检查兑换码是否存在
    const code = await c.env.DB.prepare(`
      SELECT id, code, is_active
      FROM redemption_codes
      WHERE id = ?
    `).bind(codeId).first<{ id: number; code: string; is_active: number }>();

    if (!code) {
      return c.json({
        success: false,
        error: 'Code not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    const newStatus = code.is_active === 1 ? 0 : 1;

    // 更新状态
    await c.env.DB.prepare(`
      UPDATE redemption_codes
      SET is_active = ?
      WHERE id = ?
    `).bind(newStatus, codeId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_TOGGLE_CODE', 'redemption_code', ?, ?)
    `).bind(
      adminId,
      codeId,
      JSON.stringify({
        code: code.code,
        is_active: newStatus === 1,
      })
    ).run();

    return c.json({
      success: true,
      message: `Code ${newStatus === 1 ? 'enabled' : 'disabled'} successfully`,
      data: {
        is_active: newStatus === 1,
      },
    });
  } catch (error: any) {
    console.error('Error toggling code:', error);
    return c.json({
      success: false,
      error: 'Failed to toggle code',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * DELETE /api/admin/redemption/:id
 * 删除兑换码
 */
app.delete('/:id', async (c) => {
  try {
    const codeId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');

    // 检查兑换码是否存在
    const code = await c.env.DB.prepare(`
      SELECT id, code, used_count
      FROM redemption_codes
      WHERE id = ?
    `).bind(codeId).first<{ id: number; code: string; used_count: number }>();

    if (!code) {
      return c.json({
        success: false,
        error: 'Code not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    // 警告：如果已被使用
    if (code.used_count > 0) {
      const confirm = c.req.query('confirm');
      if (confirm !== 'true') {
        return c.json({
          success: false,
          error: `This code has been used ${code.used_count} times. Add ?confirm=true to delete anyway.`,
          error_code: ErrorCode.VALIDATION_ERROR,
          data: {
            used_count: code.used_count,
          },
        }, 400);
      }
    }

    // 删除兑换码（级联删除会处理历史记录）
    await c.env.DB.prepare(`
      DELETE FROM redemption_codes WHERE id = ?
    `).bind(codeId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_DELETE_CODE', 'redemption_code', ?, ?)
    `).bind(
      adminId,
      codeId,
      JSON.stringify({
        code: code.code,
        used_count: code.used_count,
      })
    ).run();

    return c.json({
      success: true,
      message: 'Code deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting code:', error);
    return c.json({
      success: false,
      error: 'Failed to delete code',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

export default app;