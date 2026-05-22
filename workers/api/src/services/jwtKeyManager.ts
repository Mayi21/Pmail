/**
 * JWT Key Manager (Optimized for KV Free Tier)
 * Implements key rotation and multi-version key management
 * Uses in-memory cache to reduce KV reads
 * Task ID: AUTH-001-OPT
 */

import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../index';

interface JWTKey {
  kid: string;
  secret: string;
  status: 'active' | 'retired' | 'deleted';
  createdAt: string;
  expiresAt?: string;
  retiredAt?: string;
}

interface CachedKey {
  key: JWTKey;
  cachedAt: number;
}

export class JWTKeyManager {
  private kv: KVNamespace;
  private rotationDays: number;
  private gracePeriodDays: number;

  // Static memory cache shared across all instances
  private static keyCache: Map<string, CachedKey> = new Map();
  private static readonly CACHE_TTL = 300000; // 5 minutes

  constructor(env: Env) {
    this.kv = env.JWT_KEYS;
    this.rotationDays = parseInt(env.KEY_ROTATION_DAYS) || 30;
    this.gracePeriodDays = parseInt(env.KEY_GRACE_PERIOD_DAYS) || 7;
  }

  /**
   * Generate a new cryptographic key
   */
  private async generateSecureSecret(): Promise<string> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
  }

  /**
   * Generate a new JWT key
   */
  async generateKey(): Promise<JWTKey> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.rotationDays * 86400000);

    return {
      kid: `key-${Date.now()}`,
      secret: await this.generateSecureSecret(),
      status: 'active',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Get a key by its ID (with memory cache)
   */
  async getKey(kid: string): Promise<JWTKey | null> {
    // Check memory cache first
    const cached = JWTKeyManager.keyCache.get(kid);
    if (cached) {
      const now = Date.now();
      if (now - cached.cachedAt < JWTKeyManager.CACHE_TTL) {
        // Cache hit - return cached key
        return cached.key;
      } else {
        // Cache expired - remove from cache
        JWTKeyManager.keyCache.delete(kid);
      }
    }

    // Cache miss - fetch from KV
    const keyData = await this.kv.get(kid);
    if (!keyData) return null;

    const key = JSON.parse(keyData);

    // Store in cache
    JWTKeyManager.keyCache.set(kid, {
      key,
      cachedAt: Date.now(),
    });

    return key;
  }

  /**
   * Save a key to KV storage (and update cache)
   */
  async saveKey(key: JWTKey): Promise<void> {
    await this.kv.put(key.kid, JSON.stringify(key), {
      expirationTtl: (this.rotationDays + this.gracePeriodDays) * 86400,
    });

    // Update cache after saving
    JWTKeyManager.keyCache.set(key.kid, {
      key,
      cachedAt: Date.now(),
    });
  }

  /**
   * Get all keys with a specific status
   */
  async getKeysByStatus(status: string): Promise<JWTKey[]> {
    const activeKeysData = await this.kv.get('active-keys');
    if (!activeKeysData) return [];

    const keyIds = JSON.parse(activeKeysData) as string[];
    const keys: JWTKey[] = [];

    for (const kid of keyIds) {
      const key = await this.getKey(kid);
      if (key && key.status === status) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Get the current active key for signing
   */
  async getActiveKey(): Promise<JWTKey | null> {
    const activeKeys = await this.getKeysByStatus('active');
    if (activeKeys.length === 0) {
      // Generate initial key if none exists
      const newKey = await this.generateKey();
      await this.saveKey(newKey);
      await this.kv.put('active-keys', JSON.stringify([newKey.kid]));
      return newKey;
    }
    return activeKeys[0];
  }

  /**
   * Sign a JWT token
   */
  async signToken(payload: any, expiresIn = '7d'): Promise<string> {
    const activeKey = await this.getActiveKey();
    if (!activeKey) {
      throw new Error('No active key available');
    }

    const secret = new TextEncoder().encode(activeKey.secret);
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256', kid: activeKey.kid })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(secret);

    return jwt;
  }

  /**
   * Verify a JWT token
   */
  async verifyToken(token: string): Promise<any> {
    // Decode header to get kid
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const header = JSON.parse(atob(parts[0]));
    const kid = header.kid;

    if (!kid) {
      throw new Error('Token missing key ID');
    }

    // Get the key
    const key = await this.getKey(kid);
    if (!key) {
      throw new Error('Unknown key');
    }

    if (key.status === 'deleted') {
      throw new Error('Key has been deleted');
    }

    // Verify the token
    const secret = new TextEncoder().encode(key.secret);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  }

  /**
   * Rotate JWT keys
   */
  async rotateKeys(): Promise<void> {
    console.log('Starting JWT key rotation...');

    // Get current active keys
    const activeKeys = await this.getKeysByStatus('active');

    // Retire active keys
    for (const key of activeKeys) {
      key.status = 'retired';
      key.retiredAt = new Date().toISOString();
      await this.saveKey(key);
    }

    // Generate new active key
    const newKey = await this.generateKey();
    await this.saveKey(newKey);

    // Update active keys list
    await this.kv.put('active-keys', JSON.stringify([newKey.kid]));

    // Clean up expired retired keys
    await this.cleanupExpiredKeys();

    console.log('JWT key rotation completed');
  }

  /**
   * Clean up expired keys
   */
  private async cleanupExpiredKeys(): Promise<void> {
    const retiredKeys = await this.getKeysByStatus('retired');
    const now = Date.now();

    for (const key of retiredKeys) {
      if (key.retiredAt) {
        const retiredTime = new Date(key.retiredAt).getTime();
        const gracePeriodMs = this.gracePeriodDays * 86400000;

        if (now - retiredTime > gracePeriodMs) {
          key.status = 'deleted';
          await this.kv.delete(key.kid);
          // Remove from cache
          JWTKeyManager.keyCache.delete(key.kid);
          console.log(`Deleted expired key: ${key.kid}`);
        }
      }
    }
  }

  /**
   * Clear the key cache (useful for testing or after key rotation)
   */
  static clearCache(): void {
    JWTKeyManager.keyCache.clear();
  }

  /**
   * Get cache statistics (for debugging)
   */
  static getCacheStats() {
    return {
      size: JWTKeyManager.keyCache.size,
      keys: Array.from(JWTKeyManager.keyCache.keys()),
    };
  }
}

/**
 * Scheduled task to rotate JWT keys
 */
export async function rotateJWTKeys(env: Env): Promise<void> {
  const keyManager = new JWTKeyManager(env);
  await keyManager.rotateKeys();
}