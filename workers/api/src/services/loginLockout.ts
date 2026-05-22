/**
 * Login Failure Lockout Service
 * Prevents brute force attacks by tracking login failures and locking accounts/IPs
 * Task ID: SEC-004
 */

import type { D1Database } from '@cloudflare/workers-types';

// Lockout configuration (宽松策略)
const LOCKOUT_CONFIG = {
  IP: {
    MAX_ATTEMPTS: 5,      // Maximum failed attempts before lockout
    LOCK_MINUTES: 15,     // Lockout duration in minutes
  },
  USERNAME: {
    MAX_ATTEMPTS: 5,
    LOCK_MINUTES: 30,
  },
};

export type LockType = 'ip' | 'username';

export interface LockStatus {
  locked: boolean;
  locked_until?: string;
  minutes_remaining?: number;
  failure_count?: number;
}

/**
 * Check if identifier (IP or username) is currently locked
 */
export async function checkLockStatus(
  db: D1Database,
  identifier: string,
  type: LockType
): Promise<LockStatus> {
  try {
    const record = await db.prepare(`
      SELECT failure_count, locked_until
      FROM login_failures
      WHERE identifier = ? AND type = ?
    `).bind(identifier, type).first<{
      failure_count: number;
      locked_until: string | null;
    }>();

    if (!record) {
      return { locked: false, failure_count: 0 };
    }

    // Check if currently locked
    if (record.locked_until) {
      const lockedUntil = new Date(record.locked_until).getTime();
      const now = Date.now();

      if (lockedUntil > now) {
        const minutesRemaining = Math.ceil((lockedUntil - now) / 60000);
        return {
          locked: true,
          locked_until: record.locked_until,
          minutes_remaining: minutesRemaining,
          failure_count: record.failure_count,
        };
      } else {
        // Lock has expired, clear it
        await clearLockStatus(db, identifier, type);
        return { locked: false, failure_count: 0 };
      }
    }

    return {
      locked: false,
      failure_count: record.failure_count,
    };
  } catch (error) {
    console.error(`Error checking lock status for ${type}:${identifier}:`, error);
    // On error, allow login attempt (fail open)
    return { locked: false };
  }
}

/**
 * Record a failed login attempt
 * Increments failure count and locks if threshold exceeded
 */
export async function recordLoginFailure(
  db: D1Database,
  identifier: string,
  type: LockType
): Promise<void> {
  try {
    const config = type === 'ip' ? LOCKOUT_CONFIG.IP : LOCKOUT_CONFIG.USERNAME;

    // Get current failure record
    const existing = await db.prepare(`
      SELECT id, failure_count, locked_until
      FROM login_failures
      WHERE identifier = ? AND type = ?
    `).bind(identifier, type).first<{
      id: number;
      failure_count: number;
      locked_until: string | null;
    }>();

    if (existing) {
      // Check if lock has expired
      if (existing.locked_until) {
        const lockedUntil = new Date(existing.locked_until).getTime();
        if (lockedUntil < Date.now()) {
          // Lock expired, reset count
          await db.prepare(`
            UPDATE login_failures
            SET failure_count = 1,
                locked_until = NULL,
                last_attempt = datetime('now')
            WHERE id = ?
          `).bind(existing.id).run();
          return;
        }
      }

      // Increment failure count
      const newCount = existing.failure_count + 1;

      if (newCount >= config.MAX_ATTEMPTS) {
        // Lock the identifier
        await db.prepare(`
          UPDATE login_failures
          SET failure_count = ?,
              locked_until = datetime('now', '+' || ? || ' minutes'),
              last_attempt = datetime('now')
          WHERE id = ?
        `).bind(newCount, config.LOCK_MINUTES, existing.id).run();

        console.log(`Locked ${type}:${identifier} for ${config.LOCK_MINUTES} minutes after ${newCount} failures`);
      } else {
        // Just increment count
        await db.prepare(`
          UPDATE login_failures
          SET failure_count = ?,
              last_attempt = datetime('now')
          WHERE id = ?
        `).bind(newCount, existing.id).run();
      }
    } else {
      // First failure, create new record
      await db.prepare(`
        INSERT INTO login_failures (identifier, type, failure_count, last_attempt)
        VALUES (?, ?, 1, datetime('now'))
      `).bind(identifier, type).run();
    }
  } catch (error) {
    console.error(`Error recording login failure for ${type}:${identifier}:`, error);
    // Continue without blocking login
  }
}

/**
 * Clear login failure record (called on successful login)
 */
export async function clearLoginFailures(
  db: D1Database,
  identifier: string,
  type: LockType
): Promise<void> {
  try {
    await db.prepare(`
      DELETE FROM login_failures
      WHERE identifier = ? AND type = ?
    `).bind(identifier, type).run();
  } catch (error) {
    console.error(`Error clearing login failures for ${type}:${identifier}:`, error);
  }
}

/**
 * Clear lock status (internal helper)
 */
async function clearLockStatus(
  db: D1Database,
  identifier: string,
  type: LockType
): Promise<void> {
  try {
    await db.prepare(`
      UPDATE login_failures
      SET locked_until = NULL,
          failure_count = 0
      WHERE identifier = ? AND type = ?
    `).bind(identifier, type).run();
  } catch (error) {
    console.error(`Error clearing lock status for ${type}:${identifier}:`, error);
  }
}

/**
 * Get client IP address from request
 */
export function getClientIP(request: Request): string {
  const cfConnectingIP = request.headers.get('CF-Connecting-IP');
  const xForwardedFor = request.headers.get('X-Forwarded-For');
  const xRealIP = request.headers.get('X-Real-IP');

  return cfConnectingIP ||
         xForwardedFor?.split(',')[0].trim() ||
         xRealIP ||
         'unknown';
}

/**
 * Clean up old login failure records (optional maintenance task)
 * Call this periodically to prevent table from growing too large
 */
export async function cleanupOldFailures(db: D1Database): Promise<void> {
  try {
    // Delete records older than 7 days
    await db.prepare(`
      DELETE FROM login_failures
      WHERE last_attempt < datetime('now', '-7 days')
    `).run();
  } catch (error) {
    console.error('Error cleaning up old login failures:', error);
  }
}
