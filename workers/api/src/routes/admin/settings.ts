/**
 * Admin Settings Routes
 * 系统设置管理路由
 */
import { Hono } from 'hono';
import type { Env } from '../../index';
import { jwtAuth, requireAdmin } from '../../middleware/auth';
import {
  getAllSystemSettings,
  getSystemSetting,
  updateSystemSetting,
  batchUpdateSettings,
} from '../../services/settingsService';
// TODO: Implement audit logging
// import { createAuditLog } from '../../services/auditService';

const app = new Hono<{ Bindings: Env }>();

// 所有路由需要管理员权限
app.use('*', jwtAuth);
app.use('*', requireAdmin);

/**
 * GET /api/admin/settings
 * 获取所有系统配置
 */
app.get('/', async (c) => {
  try {
    const settings = await getAllSystemSettings(c.env, true);

    return c.json({
      success: true,
      data: { settings },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to fetch settings',
    }, 500);
  }
});

/**
 * GET /api/admin/settings/:key
 * 获取单个配置
 */
app.get('/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const value = await getSystemSetting(c.env, key);

    if (value === null) {
      return c.json({
        success: false,
        error: 'Setting not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: { key, value },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to fetch setting',
    }, 500);
  }
});

/**
 * PATCH /api/admin/settings/:key
 * 更新单个配置
 */
app.patch('/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const { value } = await c.req.json<{ value: string }>();

    if (value === undefined) {
      return c.json({
        success: false,
        error: 'Value is required',
      }, 400);
    }

    // 更新配置
    await updateSystemSetting(c.env, key, value);

    // TODO: Add audit logging
    // await createAuditLog(c.env, {
    //   userId: c.get('userId'),
    //   action: 'update_system_setting',
    //   resource: 'system_settings',
    //   resourceId: key,
    //   details: JSON.stringify({ key, newValue: value }),
    //   ipAddress: c.req.header('cf-connecting-ip'),
    //   userAgent: c.req.header('user-agent'),
    // });

    return c.json({
      success: true,
      data: { key, value },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to update setting',
    }, 500);
  }
});

/**
 * POST /api/admin/settings/batch
 * 批量更新配置
 */
app.post('/batch', async (c) => {
  try {
    const { settings } = await c.req.json<{ settings: Record<string, string> }>();

    if (!settings || Object.keys(settings).length === 0) {
      return c.json({
        success: false,
        error: 'Settings object is required',
      }, 400);
    }

    // 批量更新
    await batchUpdateSettings(c.env, settings);

    // TODO: Add audit logging
    // await createAuditLog(c.env, {
    //   userId: c.get('userId'),
    //   action: 'batch_update_settings',
    //   resource: 'system_settings',
    //   resourceId: 'batch',
    //   details: JSON.stringify({ count: Object.keys(settings).length, keys: Object.keys(settings) }),
    //   ipAddress: c.req.header('cf-connecting-ip'),
    //   userAgent: c.req.header('user-agent'),
    // });

    return c.json({
      success: true,
      data: { updated: Object.keys(settings).length },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to batch update settings',
    }, 500);
  }
});

export default app;
