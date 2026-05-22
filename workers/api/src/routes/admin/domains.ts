/**
 * 域名管理路由
 * 管理员管理邮箱域名的 API 端点
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
const createDomainSchema = z.object({
  domain: z.string().min(1).max(253).regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/, 'Invalid domain format'),
  display_name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  is_active: z.boolean().optional().default(true),
  is_default: z.boolean().optional().default(false),
  sort_order: z.number().min(0).max(1000).optional().default(0),
});

const updateDomainSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  sort_order: z.number().min(0).max(1000).optional(),
});

interface Domain {
  id: number;
  domain: string;
  display_name: string | null;
  is_active: number;
  is_default: number;
  sort_order: number;
  description: string | null;
  mx_verified: number;
  created_at: string;
  updated_at: string;
  mailbox_count?: number;
}

/**
 * GET /api/admin/domains/list
 * 获取所有域名配置
 */
app.get('/list', async (c) => {
  try {
    const domains = await c.env.DB.prepare(`
      SELECT
        d.*,
        COUNT(DISTINCT te.id) as mailbox_count
      FROM domains d
      LEFT JOIN temp_emails te ON te.address LIKE '%@' || d.domain AND te.deleted_at IS NULL
      GROUP BY d.id
      ORDER BY d.sort_order ASC, d.created_at ASC
    `).all<Domain>();

    return c.json({
      success: true,
      data: {
        domains: domains.results || [],
      },
    });
  } catch (error: any) {
    console.error('Error fetching domains:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch domains',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/admin/domains/:id
 * 获取单个域名配置详情
 */
app.get('/:id', async (c) => {
  try {
    const domainId = parseInt(c.req.param('id'));

    const domain = await c.env.DB.prepare(`
      SELECT
        d.*,
        COUNT(DISTINCT te.id) as mailbox_count
      FROM domains d
      LEFT JOIN temp_emails te ON te.address LIKE '%@' || d.domain AND te.deleted_at IS NULL
      WHERE d.id = ?
      GROUP BY d.id
    `).bind(domainId).first<Domain>();

    if (!domain) {
      return c.json({
        success: false,
        error: 'Domain not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    return c.json({
      success: true,
      data: domain,
    });
  } catch (error: any) {
    console.error('Error fetching domain:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch domain',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * POST /api/admin/domains/create
 * 创建新域名
 */
app.post('/create', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createDomainSchema.parse(body);
    const adminId = c.get('user_id');

    // 域名转小写
    const domainLower = validated.domain.toLowerCase();

    // 检查域名是否已存在
    const existing = await c.env.DB.prepare(`
      SELECT id FROM domains WHERE domain = ?
    `).bind(domainLower).first();

    if (existing) {
      return c.json({
        success: false,
        error: 'Domain already exists',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    // 如果设置为默认域名，先取消其他默认
    if (validated.is_default) {
      await c.env.DB.prepare(`
        UPDATE domains SET is_default = 0 WHERE is_default = 1
      `).run();
    }

    // 创建域名
    const result = await c.env.DB.prepare(`
      INSERT INTO domains (
        domain,
        display_name,
        description,
        is_active,
        is_default,
        sort_order
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      domainLower,
      validated.display_name || domainLower,
      validated.description || null,
      validated.is_active ? 1 : 0,
      validated.is_default ? 1 : 0,
      validated.sort_order
    ).run();

    const domainId = result.meta.last_row_id;

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_CREATE_DOMAIN', 'domain', ?, ?)
    `).bind(
      adminId,
      domainId,
      JSON.stringify({ domain: domainLower, ...validated })
    ).run();

    // 同步到 KV 缓存
    await syncDomainsToKV(c.env);

    return c.json({
      success: true,
      message: 'Domain created successfully',
      data: {
        id: domainId,
        domain: domainLower,
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

    console.error('Error creating domain:', error);
    return c.json({
      success: false,
      error: 'Failed to create domain',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * PATCH /api/admin/domains/:id/update
 * 更新域名配置
 */
app.patch('/:id/update', async (c) => {
  try {
    const domainId = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const validated = updateDomainSchema.parse(body);
    const adminId = c.get('user_id');

    // 检查域名是否存在
    const domain = await c.env.DB.prepare(`
      SELECT id, domain FROM domains WHERE id = ?
    `).bind(domainId).first<{ id: number; domain: string }>();

    if (!domain) {
      return c.json({
        success: false,
        error: 'Domain not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    // 如果设置为默认域名，先取消其他默认
    if (validated.is_default === true) {
      await c.env.DB.prepare(`
        UPDATE domains SET is_default = 0 WHERE is_default = 1 AND id != ?
      `).bind(domainId).run();
    }

    // 构建更新语句
    const updates: string[] = [];
    const values: any[] = [];

    if (validated.display_name !== undefined) {
      updates.push('display_name = ?');
      values.push(validated.display_name);
    }
    if (validated.description !== undefined) {
      updates.push('description = ?');
      values.push(validated.description);
    }
    if (validated.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(validated.is_active ? 1 : 0);
    }
    if (validated.is_default !== undefined) {
      updates.push('is_default = ?');
      values.push(validated.is_default ? 1 : 0);
    }
    if (validated.sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(validated.sort_order);
    }

    if (updates.length === 0) {
      return c.json({
        success: false,
        error: 'No fields to update',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    values.push(domainId);

    // 更新域名
    await c.env.DB.prepare(`
      UPDATE domains
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...values).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_UPDATE_DOMAIN', 'domain', ?, ?)
    `).bind(
      adminId,
      domainId,
      JSON.stringify(validated)
    ).run();

    // 同步到 KV 缓存
    await syncDomainsToKV(c.env);

    return c.json({
      success: true,
      message: 'Domain updated successfully',
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

    console.error('Error updating domain:', error);
    return c.json({
      success: false,
      error: 'Failed to update domain',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * PATCH /api/admin/domains/:id/toggle
 * 启用/禁用域名
 */
app.patch('/:id/toggle', async (c) => {
  try {
    const domainId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');

    // 检查域名是否存在
    const domain = await c.env.DB.prepare(`
      SELECT id, domain, is_active, is_default FROM domains WHERE id = ?
    `).bind(domainId).first<{ id: number; domain: string; is_active: number; is_default: number }>();

    if (!domain) {
      return c.json({
        success: false,
        error: 'Domain not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    // 如果是默认域名且要禁用，不允许
    if (domain.is_default === 1 && domain.is_active === 1) {
      return c.json({
        success: false,
        error: 'Cannot disable the default domain. Please set another domain as default first.',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    const newStatus = domain.is_active === 1 ? 0 : 1;

    // 更新状态
    await c.env.DB.prepare(`
      UPDATE domains SET is_active = ? WHERE id = ?
    `).bind(newStatus, domainId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_TOGGLE_DOMAIN', 'domain', ?, ?)
    `).bind(
      adminId,
      domainId,
      JSON.stringify({ is_active: newStatus })
    ).run();

    // 同步到 KV 缓存
    await syncDomainsToKV(c.env);

    return c.json({
      success: true,
      message: `Domain ${newStatus === 1 ? 'enabled' : 'disabled'} successfully`,
      data: {
        is_active: newStatus === 1,
      },
    });
  } catch (error: any) {
    console.error('Error toggling domain:', error);
    return c.json({
      success: false,
      error: 'Failed to toggle domain',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * PATCH /api/admin/domains/:id/set-default
 * 设置默认域名
 */
app.patch('/:id/set-default', async (c) => {
  try {
    const domainId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');

    // 检查域名是否存在且启用
    const domain = await c.env.DB.prepare(`
      SELECT id, domain, is_active FROM domains WHERE id = ?
    `).bind(domainId).first<{ id: number; domain: string; is_active: number }>();

    if (!domain) {
      return c.json({
        success: false,
        error: 'Domain not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    if (domain.is_active !== 1) {
      return c.json({
        success: false,
        error: 'Cannot set disabled domain as default',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    // 取消其他默认域名
    await c.env.DB.prepare(`
      UPDATE domains SET is_default = 0 WHERE is_default = 1
    `).run();

    // 设置新默认域名
    await c.env.DB.prepare(`
      UPDATE domains SET is_default = 1 WHERE id = ?
    `).bind(domainId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_SET_DEFAULT_DOMAIN', 'domain', ?, ?)
    `).bind(
      adminId,
      domainId,
      JSON.stringify({ domain: domain.domain })
    ).run();

    // 同步到 KV 缓存
    await syncDomainsToKV(c.env);

    return c.json({
      success: true,
      message: 'Default domain set successfully',
    });
  } catch (error: any) {
    console.error('Error setting default domain:', error);
    return c.json({
      success: false,
      error: 'Failed to set default domain',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * DELETE /api/admin/domains/:id
 * 删除域名（仅当没有邮箱使用时）
 */
app.delete('/:id', async (c) => {
  try {
    const domainId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');

    // 检查域名是否存在
    const domain = await c.env.DB.prepare(`
      SELECT
        d.id,
        d.domain,
        d.is_default,
        COUNT(DISTINCT te.id) as mailbox_count
      FROM domains d
      LEFT JOIN temp_emails te ON te.address LIKE '%@' || d.domain AND te.deleted_at IS NULL
      WHERE d.id = ?
      GROUP BY d.id
    `).bind(domainId).first<{ id: number; domain: string; is_default: number; mailbox_count: number }>();

    if (!domain) {
      return c.json({
        success: false,
        error: 'Domain not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    // 防止删除默认域名
    if (domain.is_default === 1) {
      return c.json({
        success: false,
        error: 'Cannot delete the default domain. Please set another domain as default first.',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    // 检查是否有邮箱使用
    if (domain.mailbox_count > 0) {
      return c.json({
        success: false,
        error: `Cannot delete domain with ${domain.mailbox_count} active mailboxes`,
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    // 删除域名
    await c.env.DB.prepare(`
      DELETE FROM domains WHERE id = ?
    `).bind(domainId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_DELETE_DOMAIN', 'domain', ?, ?)
    `).bind(
      adminId,
      domainId,
      JSON.stringify({ domain: domain.domain })
    ).run();

    // 同步到 KV 缓存
    await syncDomainsToKV(c.env);

    return c.json({
      success: true,
      message: 'Domain deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting domain:', error);
    return c.json({
      success: false,
      error: 'Failed to delete domain',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * 同步域名列表到 KV 缓存
 * Email Worker 可以从 KV 读取，无需查询数据库
 */
async function syncDomainsToKV(env: Env): Promise<void> {
  try {
    const domains = await env.DB.prepare(`
      SELECT domain FROM domains WHERE is_active = 1
    `).all<{ domain: string }>();

    const domainList = (domains.results || []).map(d => d.domain);

    // 存储到 CACHE KV
    await env.CACHE.put('active_domains', JSON.stringify(domainList), {
      expirationTtl: 86400, // 24 小时过期，但每次更新都会刷新
    });

    console.log(`Synced ${domainList.length} domains to KV cache`);
  } catch (error) {
    console.error('Error syncing domains to KV:', error);
  }
}

export default app;
