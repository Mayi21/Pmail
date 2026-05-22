/**
 * Database Backup Management Routes
 * 管理员数据库备份管理 API 端点
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { jwtAuth, requireAdmin } from '../../middleware/auth';
import type { Env } from '../../index';
import { ErrorCode } from '../../types';
import { performDatabaseBackup, listBackups } from '../../services/databaseBackup';

const app = new Hono<{ Bindings: Env }>();

// 应用中间件 - 所有备份管理端点都需要管理员权限
app.use('*', jwtAuth);
app.use('*', requireAdmin);

// 验证模式
const listBackupsSchema = z.object({
  limit: z.string().optional().transform(val => Math.min(parseInt(val || '50'), 200)),
});

/**
 * POST /api/admin/backup/trigger
 * 手动触发数据库备份
 */
app.post('/trigger', async (c) => {
  try {
    console.log('Admin manually triggered database backup');

    // 执行备份
    const result = await performDatabaseBackup(c.env);

    if (result.success) {
      return c.json({
        success: true,
        message: 'Database backup completed successfully',
        data: {
          backup_key: result.backupKey,
          metadata: result.metadata,
        },
      }, 200);
    } else {
      return c.json({
        success: false,
        error: 'Backup failed',
        error_code: ErrorCode.INTERNAL_ERROR,
        details: result.error,
      }, 500);
    }
  } catch (error) {
    console.error('Error triggering backup:', error);
    return c.json({
      success: false,
      error: 'Failed to trigger backup',
      error_code: ErrorCode.INTERNAL_ERROR,
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/admin/backup/list
 * 获取备份文件列表
 */
app.get('/list', async (c) => {
  try {
    const query = listBackupsSchema.parse(c.req.query());

    // 获取备份列表
    const backupKeys = await listBackups(c.env, query.limit);

    if (!backupKeys || backupKeys.length === 0) {
      return c.json({
        success: true,
        data: {
          backups: [],
          total: 0,
        },
      });
    }

    // 获取每个备份的元数据
    const backupsWithMetadata = await Promise.all(
      backupKeys.map(async (key) => {
        try {
          // 从 R2 获取对象元数据
          const object = await c.env.R2.head(key);

          if (!object) {
            return null;
          }

          return {
            key,
            size: object.size,
            uploaded: object.uploaded.toISOString(),
            metadata: object.customMetadata || {},
          };
        } catch (error) {
          console.error(`Failed to get metadata for ${key}:`, error);
          return null;
        }
      })
    );

    // 过滤掉失败的项
    const validBackups = backupsWithMetadata.filter(b => b !== null);

    return c.json({
      success: true,
      data: {
        backups: validBackups,
        total: validBackups.length,
      },
    });
  } catch (error) {
    console.error('Error listing backups:', error);
    return c.json({
      success: false,
      error: 'Failed to list backups',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/admin/backup/latest
 * 获取最新备份的元数据
 */
app.get('/latest', async (c) => {
  try {
    // 获取 latest.json 的元数据
    const latestObject = await c.env.R2.head('backups/latest.json');

    if (!latestObject) {
      return c.json({
        success: false,
        error: 'No backup found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        size: latestObject.customMetadata?.sizeBytes
          ? parseInt(latestObject.customMetadata.sizeBytes)
          : latestObject.size,
        uploaded: latestObject.uploaded.toISOString(),
        metadata: latestObject.customMetadata || {},
      },
    });
  } catch (error) {
    console.error('Error getting latest backup:', error);
    return c.json({
      success: false,
      error: 'Failed to get latest backup',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * GET /api/admin/backup/:key/download
 * 下载指定的备份文件
 * 注意：key 需要进行 URL 编码，例如 backups/2025/01/backup_2025-01-11_02-00-00.json
 */
app.get('/:encodedKey/download', async (c) => {
  try {
    const encodedKey = c.req.param('encodedKey');
    const backupKey = decodeURIComponent(encodedKey);

    // 安全检查：确保 key 以 backups/ 开头
    if (!backupKey.startsWith('backups/')) {
      return c.json({
        success: false,
        error: 'Invalid backup key',
        error_code: ErrorCode.INVALID_REQUEST,
      }, 400);
    }

    // 从 R2 获取备份文件
    const object = await c.env.R2.get(backupKey);

    if (!object) {
      return c.json({
        success: false,
        error: 'Backup not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    // 返回文件流
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Content-Disposition', `attachment; filename="${backupKey.split('/').pop()}"`);

    return new Response(object.body, {
      headers,
    });
  } catch (error) {
    console.error('Error downloading backup:', error);
    return c.json({
      success: false,
      error: 'Failed to download backup',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * DELETE /api/admin/backup/:encodedKey
 * 删除指定的备份文件
 */
app.delete('/:encodedKey', async (c) => {
  try {
    const encodedKey = c.req.param('encodedKey');
    const backupKey = decodeURIComponent(encodedKey);

    // 安全检查：确保 key 以 backups/ 开头，且不是 latest.json
    if (!backupKey.startsWith('backups/') || backupKey === 'backups/latest.json') {
      return c.json({
        success: false,
        error: 'Invalid backup key or cannot delete latest backup',
        error_code: ErrorCode.INVALID_REQUEST,
      }, 400);
    }

    if (!backupKey.startsWith('backups/')) {
      throw new Error('Refusing to delete non-backup object');
    }

    await c.env.R2.delete(backupKey);

    // 记录到审计日志
    try {
      await c.env.DB.prepare(`
        INSERT INTO audit_logs (
          user_id, action, entity_type, entity_id, details, created_at
        ) VALUES (?, 'DELETE_BACKUP', 'backup', NULL, ?, datetime('now'))
      `).bind(
        c.get('userId'),
        JSON.stringify({ backup_key: backupKey })
      ).run();
    } catch (error) {
      console.warn('Failed to log backup deletion:', error);
    }

    return c.json({
      success: true,
      message: 'Backup deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting backup:', error);
    return c.json({
      success: false,
      error: 'Failed to delete backup',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

export default app;
