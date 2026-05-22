/**
 * 公告管理路由
 * 管理员管理公告的 API 端点
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
const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  content_type: z.enum(['markdown', 'plain']).default('markdown'),
  is_pinned: z.boolean().optional().default(false),
  priority: z.number().min(0).max(1000).optional().default(0),
});

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
  content_type: z.enum(['markdown', 'plain']).optional(),
  is_pinned: z.boolean().optional(),
  priority: z.number().min(0).max(1000).optional(),
});

const listAnnouncementsSchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => Math.min(parseInt(val || '20'), 100)),
  is_active: z.string().optional().transform(val => val === 'true' ? 1 : val === 'false' ? 0 : undefined),
  include_deleted: z.string().optional().transform(val => val === 'true'),
});

/**
 * POST /api/admin/announcements
 * 创建公告
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createAnnouncementSchema.parse(body);
    const adminId = c.get('user_id');

    const result = await c.env.DB.prepare(`
      INSERT INTO announcements (
        title,
        content,
        content_type,
        is_pinned,
        priority,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      validated.title,
      validated.content,
      validated.content_type,
      validated.is_pinned ? 1 : 0,
      validated.priority,
      adminId
    ).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_CREATE_ANNOUNCEMENT', 'announcement', ?, ?)
    `).bind(
      adminId,
      result.meta.last_row_id,
      JSON.stringify({
        title: validated.title,
        is_pinned: validated.is_pinned,
        priority: validated.priority,
      })
    ).run();

    return c.json({
      success: true,
      message: 'Announcement created successfully',
      data: {
        id: result.meta.last_row_id,
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

    console.error('Error creating announcement:', error);
    return c.json({
      success: false,
      error: 'Failed to create announcement',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/admin/announcements/list
 * 获取公告列表
 */
app.get('/list', async (c) => {
  try {
    const query = listAnnouncementsSchema.parse(c.req.query());

    // 构建查询条件
    const conditions = [];
    const params: any[] = [];

    if (!query.include_deleted) {
      conditions.push('a.deleted_at IS NULL');
    }

    if (query.is_active !== undefined) {
      conditions.push('a.is_active = ?');
      params.push(query.is_active);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 计算分页
    const offset = (query.page - 1) * query.limit;

    // 获取总数
    const countResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM announcements a
      ${whereClause}
    `).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    // 获取公告列表
    const announcements = await c.env.DB.prepare(`
      SELECT
        a.*,
        u.username as creator_username,
        (SELECT COUNT(*) FROM announcement_reads ar WHERE ar.announcement_id = a.id) as read_count
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      ${whereClause}
      ORDER BY a.is_pinned DESC, a.priority DESC, a.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, query.limit, offset).all();

    return c.json({
      success: true,
      data: {
        announcements: announcements.results || [],
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

    console.error('Error fetching announcements:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch announcements',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/admin/announcements/:id
 * 获取公告详情
 */
app.get('/:id', async (c) => {
  try {
    const announcementId = parseInt(c.req.param('id'));

    const announcement = await c.env.DB.prepare(`
      SELECT
        a.*,
        u.username as creator_username,
        (SELECT COUNT(*) FROM announcement_reads ar WHERE ar.announcement_id = a.id) as read_count
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.id = ?
    `).bind(announcementId).first();

    if (!announcement) {
      return c.json({
        success: false,
        error: 'Announcement not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    return c.json({
      success: true,
      data: announcement,
    });
  } catch (error: any) {
    console.error('Error fetching announcement:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch announcement',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * PATCH /api/admin/announcements/:id
 * 更新公告
 */
app.patch('/:id', async (c) => {
  try {
    const announcementId = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const validated = updateAnnouncementSchema.parse(body);
    const adminId = c.get('user_id');

    // 检查公告是否存在
    const existing = await c.env.DB.prepare(`
      SELECT id, title FROM announcements WHERE id = ? AND deleted_at IS NULL
    `).bind(announcementId).first();

    if (!existing) {
      return c.json({
        success: false,
        error: 'Announcement not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    // 构建更新语句
    const updates: string[] = [];
    const values: any[] = [];

    if (validated.title !== undefined) {
      updates.push('title = ?');
      values.push(validated.title);
    }
    if (validated.content !== undefined) {
      updates.push('content = ?');
      values.push(validated.content);
    }
    if (validated.content_type !== undefined) {
      updates.push('content_type = ?');
      values.push(validated.content_type);
    }
    if (validated.is_pinned !== undefined) {
      updates.push('is_pinned = ?');
      values.push(validated.is_pinned ? 1 : 0);
    }
    if (validated.priority !== undefined) {
      updates.push('priority = ?');
      values.push(validated.priority);
    }

    if (updates.length === 0) {
      return c.json({
        success: false,
        error: 'No fields to update',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    updates.push('updated_at = datetime(\'now\')');
    values.push(announcementId);

    await c.env.DB.prepare(`
      UPDATE announcements
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...values).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_UPDATE_ANNOUNCEMENT', 'announcement', ?, ?)
    `).bind(
      adminId,
      announcementId,
      JSON.stringify(validated)
    ).run();

    return c.json({
      success: true,
      message: 'Announcement updated successfully',
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

    console.error('Error updating announcement:', error);
    return c.json({
      success: false,
      error: 'Failed to update announcement',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * PATCH /api/admin/announcements/:id/toggle
 * 启用/禁用公告
 */
app.patch('/:id/toggle', async (c) => {
  try {
    const announcementId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');

    // 检查公告是否存在
    const announcement = await c.env.DB.prepare(`
      SELECT id, title, is_active
      FROM announcements
      WHERE id = ? AND deleted_at IS NULL
    `).bind(announcementId).first<{ id: number; title: string; is_active: number }>();

    if (!announcement) {
      return c.json({
        success: false,
        error: 'Announcement not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    const newStatus = announcement.is_active === 1 ? 0 : 1;

    // 更新状态
    await c.env.DB.prepare(`
      UPDATE announcements
      SET is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(newStatus, announcementId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_TOGGLE_ANNOUNCEMENT', 'announcement', ?, ?)
    `).bind(
      adminId,
      announcementId,
      JSON.stringify({
        title: announcement.title,
        is_active: newStatus === 1,
      })
    ).run();

    return c.json({
      success: true,
      message: `Announcement ${newStatus === 1 ? 'enabled' : 'disabled'} successfully`,
      data: {
        is_active: newStatus === 1,
      },
    });
  } catch (error: any) {
    console.error('Error toggling announcement:', error);
    return c.json({
      success: false,
      error: 'Failed to toggle announcement',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * DELETE /api/admin/announcements/:id
 * 删除公告（软删除）
 */
app.delete('/:id', async (c) => {
  try {
    const announcementId = parseInt(c.req.param('id'));
    const adminId = c.get('user_id');

    // 检查公告是否存在
    const announcement = await c.env.DB.prepare(`
      SELECT id, title
      FROM announcements
      WHERE id = ? AND deleted_at IS NULL
    `).bind(announcementId).first<{ id: number; title: string }>();

    if (!announcement) {
      return c.json({
        success: false,
        error: 'Announcement not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    // 软删除
    await c.env.DB.prepare(`
      UPDATE announcements
      SET deleted_at = datetime('now'), is_active = 0
      WHERE id = ?
    `).bind(announcementId).run();

    // 记录审计日志
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ADMIN_DELETE_ANNOUNCEMENT', 'announcement', ?, ?)
    `).bind(
      adminId,
      announcementId,
      JSON.stringify({
        title: announcement.title,
      })
    ).run();

    return c.json({
      success: true,
      message: 'Announcement deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting announcement:', error);
    return c.json({
      success: false,
      error: 'Failed to delete announcement',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

export default app;
