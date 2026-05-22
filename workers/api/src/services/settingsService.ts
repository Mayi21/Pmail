/**
 * System Settings Service with KV Cache
 * 系统配置服务（带 KV 缓存优化）
 */

import type { Env } from '../index';

const CACHE_TTL = 300; // 5 分钟
const CACHE_PREFIX = 'setting:';

interface SystemSetting {
  id: number;
  setting_key: string;
  setting_value: string;
  setting_type: string;
  category: string;
  display_name: string;
  description: string | null;
  is_public: number;
  created_at: string;
  updated_at: string;
}

/**
 * 获取系统配置（带缓存）
 */
export async function getSystemSetting(
  env: Env,
  key: string
): Promise<string | null> {
  const cacheKey = `${CACHE_PREFIX}${key}`;

  // 1. 尝试从 KV 缓存读取
  const cached = await env.CACHE.get(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // 2. 从数据库读取
  const result = await env.DB.prepare(`
    SELECT setting_value FROM system_settings WHERE setting_key = ?
  `).bind(key).first<{ setting_value: string }>();

  if (result) {
    // 3. 写入缓存
    await env.CACHE.put(cacheKey, result.setting_value, {
      expirationTtl: CACHE_TTL,
    });
    return result.setting_value;
  }

  return null;
}

/**
 * 获取布尔类型配置
 */
export async function getBooleanSetting(
  env: Env,
  key: string,
  defaultValue: boolean = false
): Promise<boolean> {
  const value = await getSystemSetting(env, key);
  if (value === null) return defaultValue;
  return value === 'true' || value === '1';
}

/**
 * 获取所有系统配置
 */
export async function getAllSystemSettings(
  env: Env,
  includePrivate: boolean = true
): Promise<SystemSetting[]> {
  const query = includePrivate
    ? `SELECT * FROM system_settings ORDER BY category, setting_key`
    : `SELECT * FROM system_settings WHERE is_public = 1 ORDER BY category, setting_key`;

  const result = await env.DB.prepare(query).all<SystemSetting>();
  return result.results || [];
}

/**
 * 更新系统配置并清除缓存
 */
export async function updateSystemSetting(
  env: Env,
  key: string,
  value: string
): Promise<void> {
  // 1. 更新数据库
  await env.DB.prepare(`
    UPDATE system_settings
    SET setting_value = ?, updated_at = datetime('now')
    WHERE setting_key = ?
  `).bind(value, key).run();

  // 2. 清除缓存
  const cacheKey = `${CACHE_PREFIX}${key}`;
  await env.CACHE.delete(cacheKey);
}

/**
 * 批量更新配置
 */
export async function batchUpdateSettings(
  env: Env,
  updates: Record<string, string>
): Promise<void> {
  const keys = Object.keys(updates);

  // 1. 批量更新数据库
  for (const key of keys) {
    await env.DB.prepare(`
      UPDATE system_settings
      SET setting_value = ?, updated_at = datetime('now')
      WHERE setting_key = ?
    `).bind(updates[key], key).run();
  }

  // 2. 批量清除缓存
  await Promise.all(
    keys.map(key => env.CACHE.delete(`${CACHE_PREFIX}${key}`))
  );
}
