/**
 * 公开域名路由
 * 获取可用域名列表（无需认证）
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import { ErrorCode } from '../types';

const app = new Hono<{ Bindings: Env }>();

interface PublicDomain {
  id: number;
  domain: string;
  display_name: string | null;
  is_default: number;
}

/**
 * GET /api/domains
 * 获取所有启用的域名列表（公开 API）
 */
app.get('/', async (c) => {
  try {
    // 直接从数据库查询
    const domains = await c.env.DB.prepare(`
      SELECT id, domain, display_name, is_default
      FROM domains
      WHERE is_active = 1
      ORDER BY sort_order ASC, created_at ASC
    `).all<PublicDomain>();

    const domainList = domains.results || [];

    // 如果数据库中没有域名，返回环境变量中的默认域名
    if (domainList.length === 0 && c.env.DOMAIN) {
      const fallbackDomain = {
        id: 0,
        domain: c.env.DOMAIN,
        display_name: c.env.DOMAIN,
        is_default: 1,
      };

      return c.json({
        success: true,
        data: {
          domains: [fallbackDomain],
        },
      });
    }

    return c.json({
      success: true,
      data: {
        domains: domainList,
      },
    });
  } catch (error: any) {
    console.error('Error fetching public domains:', error);

    // 发生错误时，返回环境变量中的域名作为降级
    if (c.env.DOMAIN) {
      return c.json({
        success: true,
        data: {
          domains: [{
            id: 0,
            domain: c.env.DOMAIN,
            display_name: c.env.DOMAIN,
            is_default: 1,
          }],
        },
      });
    }

    return c.json({
      success: false,
      error: 'Failed to fetch domains',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/domains/default
 * 获取默认域名
 */
app.get('/default', async (c) => {
  try {
    // 查询默认域名
    const domain = await c.env.DB.prepare(`
      SELECT domain, display_name
      FROM domains
      WHERE is_active = 1 AND is_default = 1
      LIMIT 1
    `).first<{ domain: string; display_name: string | null }>();

    if (domain) {
      return c.json({
        success: true,
        data: {
          domain: domain.domain,
          display_name: domain.display_name || domain.domain,
        },
      });
    }

    // 如果没有设置默认域名，返回第一个启用的域名
    const firstDomain = await c.env.DB.prepare(`
      SELECT domain, display_name
      FROM domains
      WHERE is_active = 1
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 1
    `).first<{ domain: string; display_name: string | null }>();

    if (firstDomain) {
      return c.json({
        success: true,
        data: {
          domain: firstDomain.domain,
          display_name: firstDomain.display_name || firstDomain.domain,
        },
      });
    }

    // 降级到环境变量
    if (c.env.DOMAIN) {
      return c.json({
        success: true,
        data: {
          domain: c.env.DOMAIN,
          display_name: c.env.DOMAIN,
        },
      });
    }

    return c.json({
      success: false,
      error: 'No domain configured',
      error_code: ErrorCode.NOT_FOUND,
    }, 404);
  } catch (error: any) {
    console.error('Error fetching default domain:', error);

    // 降级到环境变量
    if (c.env.DOMAIN) {
      return c.json({
        success: true,
        data: {
          domain: c.env.DOMAIN,
          display_name: c.env.DOMAIN,
        },
      });
    }

    return c.json({
      success: false,
      error: 'Failed to fetch default domain',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

export default app;
