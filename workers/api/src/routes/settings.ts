/**
 * Public Settings Routes
 * 公开的系统配置路由（无需认证）
 */
import { Hono } from 'hono';
import type { Env } from '../index';
import { getAllSystemSettings } from '../services/settingsService';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/settings/public
 * 获取公开的系统配置（is_public = 1）
 * 无需认证，任何人可访问
 */
app.get('/public', async (c) => {
  try {
    // 只获取公开配置
    const settings = await getAllSystemSettings(c.env, false);

    // 转换为 key-value 对象
    const publicSettings: Record<string, string> = {};
    settings.forEach(setting => {
      publicSettings[setting.setting_key] = setting.setting_value;
    });

    return c.json({
      success: true,
      data: publicSettings,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to fetch public settings',
    }, 500);
  }
});

export default app;
