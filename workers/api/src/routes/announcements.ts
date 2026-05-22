/**
 * 公告路由（用户端）
 * 用户获取未读公告和标记已读的 API 端点
 */

import { Hono } from 'hono';
import { jwtAuth } from '../middleware/auth';
import type { Env } from '../index';
import { ErrorCode } from '../types';

const app = new Hono<{ Bindings: Env }>();

// 应用中间件 - 需要登录
app.use('*', jwtAuth);

/**
 * GET /api/announcements/unread
 * 获取未读的活跃公告
 */
app.get('/unread', async (c) => {
  try {
    const userId = c.get('user_id');

    const announcements = await c.env.DB.prepare(`
      SELECT a.id, a.title, a.content, a.content_type, a.is_pinned, a.priority, a.created_at
      FROM announcements a
      WHERE a.is_active = 1
        AND a.deleted_at IS NULL
        AND a.id NOT IN (
          SELECT announcement_id FROM announcement_reads WHERE user_id = ?
        )
      ORDER BY a.is_pinned DESC, a.priority DESC, a.created_at DESC
      LIMIT 10
    `).bind(userId).all();

    return c.json({
      success: true,
      data: {
        announcements: announcements.results || [],
        count: announcements.results?.length || 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching unread announcements:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch announcements',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * POST /api/announcements/:id/read
 * 标记公告为已读
 */
app.post('/:id/read', async (c) => {
  try {
    const userId = c.get('user_id');
    const announcementId = parseInt(c.req.param('id'));

    // 检查公告是否存在且活跃
    const announcement = await c.env.DB.prepare(`
      SELECT id FROM announcements
      WHERE id = ? AND is_active = 1 AND deleted_at IS NULL
    `).bind(announcementId).first();

    if (!announcement) {
      return c.json({
        success: false,
        error: 'Announcement not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    // 检查是否已读
    const existing = await c.env.DB.prepare(`
      SELECT id FROM announcement_reads
      WHERE user_id = ? AND announcement_id = ?
    `).bind(userId, announcementId).first();

    if (existing) {
      return c.json({
        success: true,
        message: 'Already marked as read',
      });
    }

    // 标记已读
    await c.env.DB.prepare(`
      INSERT INTO announcement_reads (user_id, announcement_id)
      VALUES (?, ?)
    `).bind(userId, announcementId).run();

    return c.json({
      success: true,
      message: 'Announcement marked as read',
    });
  } catch (error: any) {
    console.error('Error marking announcement as read:', error);
    return c.json({
      success: false,
      error: 'Failed to mark as read',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

export default app;
