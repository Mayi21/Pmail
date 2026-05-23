/**
 * Database Backup Service
 * Handles automatic daily backups of D1 database to R2 storage
 */

import type { Env } from '../index';

/**
 * Interface for backup metadata
 */
interface BackupMetadata {
  timestamp: string;
  date: string;
  version: string;
  tables: string[];
  totalRecords: number;
}

/**
 * Interface for backup result
 */
interface BackupResult {
  success: boolean;
  backupKey?: string;
  metadata?: BackupMetadata;
  error?: string;
}

/**
 * List of tables to backup
 */
const BACKUP_TABLES = [
  'tier_configs',
  'users',
  'temp_emails',
  'emails',
  'attachments',
  'rate_limits',
  'system_settings',
  'redemption_codes',
  'audit_logs',
  'user_statistics'
];

/**
 * Get chunk size for paginated queries.
 * Large tables (emails, audit_logs) use smaller chunks to limit memory.
 */
function getChunkSize(tableName: string): number {
  switch (tableName) {
    case 'emails':
    case 'audit_logs':
      return 50;
    default:
      return 200;
  }
}

/**
 * Query a chunk of rows from a table using LIMIT/OFFSET pagination.
 */
async function queryChunk(
  db: D1Database,
  tableName: string,
  limit: number,
  offset: number
): Promise<Record<string, unknown>[]> {
  const result = await db.prepare(
    `SELECT * FROM ${tableName} ORDER BY rowid LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  return (result.results || []) as Record<string, unknown>[];
}

/** Minimum part size for R2 multipart upload (5MB) */
const MIN_PART_SIZE = 5 * 1024 * 1024;

/**
 * Perform daily database backup
 * Uses R2 multipart upload and paginated queries to stay within memory limits.
 */
export async function performDatabaseBackup(env: Env): Promise<BackupResult> {
  console.log('Starting database backup...');

  try {
    // Check if backup is enabled
    const backupEnabled = env.BACKUP_ENABLED !== 'false';
    if (!backupEnabled) {
      console.log('Backup is disabled in configuration');
      return { success: false, error: 'Backup disabled' };
    }

    if (!env.R2) {
      console.error('R2 binding not found. Please configure R2 bucket in wrangler.toml');
      return { success: false, error: 'R2 not configured' };
    }

    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0]; // YYYY-MM-DD
    const timeStr = timestamp.split('T')[1].split('.')[0].replace(/:/g, '-'); // HH-MM-SS

    // Phase 1: Count records per table (lightweight queries)
    let totalRecords = 0;
    const successfulTables: string[] = [];
    const tableCounts: Record<string, number> = {};

    for (const tableName of BACKUP_TABLES) {
      try {
        const countResult = await env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM ${tableName}`
        ).first<{ cnt: number }>();
        const count = countResult?.cnt ?? 0;
        tableCounts[tableName] = count;
        totalRecords += count;
        successfulTables.push(tableName);
        console.log(`Counted ${count} records in ${tableName}`);
      } catch (error) {
        console.warn(`Failed to count table ${tableName}:`, error);
        tableCounts[tableName] = 0;
      }
    }

    // Create backup metadata
    const metadata: BackupMetadata = {
      timestamp,
      date: dateStr,
      version: '1.0',
      tables: successfulTables,
      totalRecords
    };

    // Generate R2 key
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(5, 7);
    const backupKey = `backups/${year}/${month}/backup_${dateStr}_${timeStr}.json`;

    // Phase 2: Create R2 multipart upload
    const multipartUpload = await env.R2.createMultipartUpload(backupKey, {
      httpMetadata: {
        contentType: 'application/json',
      },
      customMetadata: {
        timestamp,
        totalRecords: totalRecords.toString(),
        tables: successfulTables.join(','),
        version: '1.0'
      }
    });

    const encoder = new TextEncoder();
    const parts: R2UploadedPart[] = [];
    let partNumber = 1;
    let bytesWritten = 0;

    // Byte-level buffer for precise part sizing
    let pending: Uint8Array[] = [];
    let pendingSize = 0;

    function appendJson(text: string) {
      const encoded = encoder.encode(text);
      pending.push(encoded);
      pendingSize += encoded.byteLength;
    }

    async function flushParts(force = false) {
      while (pendingSize >= MIN_PART_SIZE || (force && pendingSize > 0)) {
        const targetSize = pendingSize >= MIN_PART_SIZE ? MIN_PART_SIZE : pendingSize;
        const partData = new Uint8Array(targetSize);
        let written = 0;
        while (written < targetSize) {
          const chunk = pending[0];
          const remaining = targetSize - written;
          if (chunk.byteLength <= remaining) {
            partData.set(chunk, written);
            written += chunk.byteLength;
            pending.shift();
            pendingSize -= chunk.byteLength;
          } else {
            partData.set(chunk.subarray(0, remaining), written);
            pending[0] = chunk.subarray(remaining);
            pendingSize -= remaining;
            written = targetSize;
          }
        }
        const part = await multipartUpload.uploadPart(partNumber, partData);
        parts.push(part);
        bytesWritten += targetSize;
        partNumber++;
      }
    }

    // Phase 3: Build JSON incrementally and upload parts
    try {
      appendJson(`{"metadata":${JSON.stringify(metadata)},"data":{`);

      for (let tableIdx = 0; tableIdx < successfulTables.length; tableIdx++) {
        const tableName = successfulTables[tableIdx];
        const count = tableCounts[tableName];
        const chunkSize = getChunkSize(tableName);

        const prefix = tableIdx > 0 ? ',' : '';
        appendJson(`${prefix}${JSON.stringify(tableName)}:[`);

        let offset = 0;
        let isFirstRow = true;

        while (offset < count) {
          const rows = await queryChunk(env.DB, tableName, chunkSize, offset);
          if (rows.length === 0) break;

          for (const row of rows) {
            const rowPrefix = isFirstRow ? '' : ',';
            appendJson(`${rowPrefix}${JSON.stringify(row)}`);
            isFirstRow = false;
          }

          offset += rows.length;
          await flushParts();
        }

        appendJson(']');
        console.log(`Processed ${count} records from ${tableName}`);
      }

      appendJson('}}');

      // Phase 4: Upload final part and complete
      await flushParts(true);
      await multipartUpload.complete(parts);
    } catch (error) {
      await multipartUpload.abort();
      throw error;
    }

    console.log(`Backup uploaded: ${backupKey} (${bytesWritten} bytes, ${totalRecords} records)`);

    // Phase 5: Save latest.json as metadata-only (< 1KB)
    const latestPayload = JSON.stringify({
      backupKey,
      metadata,
      sizeBytes: bytesWritten
    });

    await env.R2.put('backups/latest.json', latestPayload, {
      httpMetadata: {
        contentType: 'application/json',
      },
      customMetadata: {
        timestamp,
        totalRecords: totalRecords.toString(),
        tables: successfulTables.join(','),
        version: '1.0',
        sizeBytes: bytesWritten.toString(),
        backupKey
      }
    });

    console.log('Latest backup pointer updated');

    // Phase 6: Audit log
    try {
      await env.DB.prepare(`
        INSERT INTO audit_logs (
          user_id, action, entity_type, entity_id, details, created_at
        ) VALUES (NULL, 'DATABASE_BACKUP', 'system', NULL, ?, datetime('now'))
      `).bind(JSON.stringify({
        backup_key: backupKey,
        total_records: totalRecords,
        tables: successfulTables.length,
        size_bytes: bytesWritten
      })).run();
    } catch (error) {
      console.warn('Failed to log backup to audit_logs:', error);
    }

    return {
      success: true,
      backupKey,
      metadata
    };

  } catch (error) {
    console.error('Database backup failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * List all available backups from R2
 * @param env Environment bindings
 * @param limit Maximum number of backups to list
 */
export async function listBackups(env: Env, limit: number = 100): Promise<string[]> {
  try {
    if (!env.R2) {
      console.error('R2 binding not found');
      return [];
    }

    const allKeys: string[] = [];
    let cursor: string | undefined;
    let truncated = true;

    while (truncated) {
      const listed: R2Objects = await env.R2.list({
        prefix: 'backups/',
        cursor,
      });

      for (const obj of listed.objects) {
        if (obj.key.endsWith('.json') && obj.key !== 'backups/latest.json') {
          allKeys.push(obj.key);
        }
      }

      truncated = listed.truncated;
      cursor = listed.cursor;
    }

    return allKeys
      .sort()
      .reverse()
      .slice(0, limit);

  } catch (error) {
    console.error('Failed to list backups:', error);
    return [];
  }
}

/**
 * Get backup file from R2
 * @param env Environment bindings
 * @param backupKey R2 key of the backup file
 */
export async function getBackup(env: Env, backupKey: string): Promise<any | null> {
  try {
    if (!env.R2) {
      console.error('R2 binding not found');
      return null;
    }

    const object = await env.R2.get(backupKey);
    if (!object) {
      console.error(`Backup not found: ${backupKey}`);
      return null;
    }

    const backupJson = await object.text();
    return JSON.parse(backupJson);

  } catch (error) {
    console.error('Failed to retrieve backup:', error);
    return null;
  }
}

/**
 * Delete old backups (for cleanup if needed)
 * @param env Environment bindings
 * @param retentionDays Number of days to retain backups
 */
export async function cleanupOldBackups(env: Env, retentionDays: number): Promise<number> {
  try {
    if (!env.R2) {
      console.error('R2 binding not found');
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const listed = await env.R2.list({
      prefix: 'backups/'
    });

    let deletedCount = 0;

    for (const object of listed.objects) {
      if (object.key === 'backups/latest.json') {
        continue; // Never delete latest backup
      }

      if (object.uploaded && object.uploaded < cutoffDate) {
        await env.R2.delete(object.key);
        deletedCount++;
        console.log(`Deleted old backup: ${object.key}`);
      }
    }

    console.log(`Cleaned up ${deletedCount} old backups`);
    return deletedCount;

  } catch (error) {
    console.error('Failed to cleanup old backups:', error);
    return 0;
  }
}
