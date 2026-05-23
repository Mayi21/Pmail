/**
 * Health Check Routes
 * Provides system health and status information
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import { getRateLimitStats } from '../middleware/rateLimit';

const app = new Hono<{ Bindings: Env }>();

/**
 * Basic health check
 */
app.get('/', async (c) => {
  const startTime = Date.now();

  return c.json({
    status: 'healthy',
    service: 'pmail-api',
    timestamp: new Date().toISOString(),
    version: '1.0.0-kv-optimized',
    response_time: Date.now() - startTime,
  });
});

/**
 * Detailed health check with dependency status
 */
app.get('/detailed', async (c) => {
  const checks: Record<string, any> = {};

  // Check database
  try {
    const dbStart = Date.now();
    const result = await c.env.DB.prepare('SELECT 1 as test').first();
    checks.database = {
      status: result ? 'ok' : 'error',
      response_time: Date.now() - dbStart,
    };
  } catch (error: any) {
    checks.database = {
      status: 'error',
      error: error.message,
    };
  }

  // Check KV namespaces
  try {
    const kvStart = Date.now();
    await c.env.CACHE.get('health_check_test');
    checks.kv_cache = {
      status: 'ok',
      response_time: Date.now() - kvStart,
    };
  } catch (error: any) {
    checks.kv_cache = {
      status: 'error',
      error: error.message,
    };
  }

  // Check R2
  try {
    const r2Start = Date.now();
    await c.env.R2.list({ limit: 1 });
    checks.r2_storage = {
      status: 'ok',
      response_time: Date.now() - r2Start,
    };
  } catch (error: any) {
    checks.r2_storage = {
      status: 'error',
      error: error.message,
    };
  }

  // Overall health
  const allHealthy = Object.values(checks).every(
    (check: any) => check.status === 'ok'
  );

  return c.json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }, allHealthy ? 200 : 503);
});

/**
 * Readiness check for deployment
 */
app.get('/ready', async (c) => {
  try {
    // Check if database is accessible
    await c.env.DB.prepare('SELECT 1').first();

    return c.json({
      ready: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      ready: false,
      timestamp: new Date().toISOString(),
    }, 503);
  }
});

/**
 * Cache statistics (for debugging KV optimization)
 */
app.get('/cache-stats', async (c) => {
  return c.json({
    rate_limit_cache: getRateLimitStats(),
    timestamp: new Date().toISOString(),
    note: 'Cache reduces KV reads on free tier',
  });
});

export default app;