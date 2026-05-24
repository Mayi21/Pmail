/**
 * Rate Limiting Middleware (Optimized for KV Free Tier)
 * Implements tiered rate limiting based on endpoint type
 * Uses in-memory cache for minute limits and D1 for daily limits
 * Task ID: SEC-003-OPT
 */

import { Context, Next } from 'hono';
import type { Env } from '../index';
import { ErrorCode } from '../types';
import { preserveCorsHeaders } from './error';

interface RateLimitConfig {
  rpm: number;  // Requests per minute
  rpd?: number; // Requests per day
  key: (c: Context) => string; // Function to generate rate limit key
}

interface RateLimitEntry {
  count: number;
  expiresAt: number;
}

/**
 * In-memory cache for rate limiting
 * Persists across requests within the same Worker instance
 * Automatically cleans up expired entries
 */
class MemoryRateLimitCache {
  private cache: Map<string, RateLimitEntry> = new Map();
  private lastCleanup: number = Date.now();
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute
  private readonly MAX_CACHE_SIZE = 10000; // Prevent memory overflow

  get(key: string): number {
    this.cleanupIfNeeded();

    const entry = this.cache.get(key);
    if (!entry) return 0;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return 0;
    }

    return entry.count;
  }

  increment(key: string, ttlSeconds: number): number {
    this.cleanupIfNeeded();

    const now = Date.now();
    const entry = this.cache.get(key);

    if (!entry || now > entry.expiresAt) {
      // Create new entry
      const newEntry: RateLimitEntry = {
        count: 1,
        expiresAt: now + (ttlSeconds * 1000),
      };
      this.cache.set(key, newEntry);
      return 1;
    }

    // Increment existing entry
    entry.count++;
    return entry.count;
  }

  private cleanupIfNeeded(): void {
    const now = Date.now();

    // Only cleanup every CLEANUP_INTERVAL
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL) {
      return;
    }

    this.lastCleanup = now;

    // Remove expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }

    // If cache is too large, remove oldest entries (simple FIFO)
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const entriesToRemove = this.cache.size - this.MAX_CACHE_SIZE;
      let removed = 0;
      for (const key of this.cache.keys()) {
        this.cache.delete(key);
        removed++;
        if (removed >= entriesToRemove) break;
      }
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      lastCleanup: new Date(this.lastCleanup).toISOString(),
    };
  }
}

// Global memory cache (persists across requests in same Worker instance)
const memoryCache = new MemoryRateLimitCache();

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Authentication endpoints: 5 rpm
  '/api/auth/login': { rpm: 5, key: (c) => `auth:${getClientIP(c)}` },
  '/api/auth/register': { rpm: 3, rpd: 10, key: (c) => `register:${getClientIP(c)}` },

  // Guest mailbox creation: 1 rpm, 100 rpd per IP
  '/api/mailbox/create-guest': { rpm: 1, rpd: 100, key: (c) => `guest:${getClientIP(c)}` },

  // Mailbox creation: 10 rpm per user
  '/api/mailbox/create': { rpm: 10, rpd: 50, key: (c) => `create:${c.get('user_id') || getClientIP(c)}` },

  // Query endpoints: 30 rpm per user
  '/api/emails': { rpm: 30, key: (c) => `query:${c.get('user_id') || getClientIP(c)}` },
  '/api/email': { rpm: 30, key: (c) => `query:${c.get('user_id') || getClientIP(c)}` },
};

/**
 * Get client IP address
 */
function getClientIP(c: Context): string {
  return c.req.header('CF-Connecting-IP') ||
         c.req.header('X-Forwarded-For')?.split(',')[0] ||
         'unknown';
}

/**
 * Optimized rate limiting middleware
 * Uses in-memory cache for minute limits (no KV writes!)
 * Uses D1 for daily limits (if needed)
 */
export function rateLimiter() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const path = c.req.path;
    const method = c.req.method;

    // Skip rate limiting for OPTIONS requests
    if (method === 'OPTIONS') {
      return next();
    }

    // Find matching rate limit rule
    let config: RateLimitConfig | undefined;

    for (const [pattern, limit] of Object.entries(RATE_LIMITS)) {
      if (path.startsWith(pattern)) {
        config = limit;
        break;
      }
    }

    // Default rate limit if no specific rule matches
    if (!config) {
      config = { rpm: 60, key: (c) => `default:${getClientIP(c)}` };
    }

    const rateLimitKey = config.key(c);
    const now = Date.now();
    const minute = Math.floor(now / 60000);

    // === Per-minute limit (using memory cache ONLY - no KV) ===
    const minuteKey = `${rateLimitKey}:${minute}`;
    const currentMinuteCount = memoryCache.get(minuteKey);

    if (currentMinuteCount >= config.rpm) {
      const retryAfter = 60 - (now % 60000) / 1000;
      preserveCorsHeaders(c);
      return c.json({
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        error_code: ErrorCode.RATE_LIMIT_EXCEEDED,
        retry_after: Math.ceil(retryAfter),
      }, 429);
    }

    // Increment minute counter in memory (no KV writes!)
    const newMinuteCount = memoryCache.increment(minuteKey, 60);

    // === Per-day limit (using D1 database for persistence) ===
    if (config.rpd) {
      const day = Math.floor(now / 86400000);
      const dayKey = `${rateLimitKey}:${day}`;

      try {
        // Check daily limit from D1
        const result = await c.env.DB.prepare(`
          SELECT count FROM rate_limits
          WHERE key = ? AND expires_at > datetime('now')
          LIMIT 1
        `).bind(dayKey).first<{ count: number }>();

        const currentDayCount = result?.count || 0;

        if (currentDayCount >= config.rpd) {
          preserveCorsHeaders(c);
          return c.json({
            success: false,
            error: 'Daily limit exceeded. Please try again tomorrow.',
            error_code: ErrorCode.RATE_LIMIT_EXCEEDED,
          }, 429);
        }

        // Increment daily counter in D1 (upsert)
        // Note: This runs in background to not block response
        c.executionCtx.waitUntil(
          c.env.DB.prepare(`
            INSERT INTO rate_limits (key, count, expires_at)
            VALUES (?, 1, datetime('now', '+1 day'))
            ON CONFLICT(key) DO UPDATE SET
              count = count + 1
          `).bind(dayKey).run()
        );
      } catch (error) {
        // If rate_limits table doesn't exist yet, log warning but continue
        console.warn('Rate limits D1 table not available:', error);
      }
    }

    // Add rate limit headers
    c.header('X-RateLimit-Limit', String(config.rpm));
    c.header('X-RateLimit-Remaining', String(config.rpm - newMinuteCount));
    c.header('X-RateLimit-Reset', String(minute + 1));

    await next();
  };
}

/**
 * Get rate limit cache statistics (for debugging)
 */
export function getRateLimitStats() {
  return memoryCache.getStats();
}