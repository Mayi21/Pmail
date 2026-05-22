/**
 * Cache Service
 * Implements multi-layer caching strategy using KV and in-memory cache
 */

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  staleWhileRevalidate?: boolean; // Return stale data while fetching fresh
  tags?: string[]; // Cache tags for invalidation
}

export interface CacheEntry<T> {
  data: T;
  expires: number;
  tags?: string[];
  etag?: string;
}

export class CacheService {
  private kv: KVNamespace;
  private memoryCache: Map<string, CacheEntry<any>>;
  private readonly defaultTTL = 300; // 5 minutes
  private readonly maxMemoryCacheSize = 100;

  constructor(kv: KVNamespace) {
    this.kv = kv;
    this.memoryCache = new Map();
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry) {
      if (memoryEntry.expires > Date.now()) {
        console.log(`Cache hit (memory): ${key}`);
        return memoryEntry.data as T;
      } else if (options?.staleWhileRevalidate) {
        // Return stale data and trigger background refresh
        this.refreshInBackground(key);
        return memoryEntry.data as T;
      }
      // Remove expired entry
      this.memoryCache.delete(key);
    }

    // Check KV cache
    const kvEntry = await this.kv.get<CacheEntry<T>>(key, 'json');
    if (kvEntry) {
      if (kvEntry.expires > Date.now()) {
        console.log(`Cache hit (KV): ${key}`);
        // Store in memory cache
        this.setMemoryCache(key, kvEntry);
        return kvEntry.data;
      } else if (options?.staleWhileRevalidate) {
        // Return stale data
        return kvEntry.data;
      }
    }

    console.log(`Cache miss: ${key}`);
    return null;
  }

  /**
   * Set value in cache
   */
  async set<T>(
    key: string,
    value: T,
    options?: CacheOptions
  ): Promise<void> {
    const ttl = options?.ttl || this.defaultTTL;
    const expires = Date.now() + (ttl * 1000);

    const entry: CacheEntry<T> = {
      data: value,
      expires,
      tags: options?.tags,
      etag: await this.generateETag(value),
    };

    // Store in both memory and KV cache
    this.setMemoryCache(key, entry);

    // Store in KV with expiration
    await this.kv.put(key, JSON.stringify(entry), {
      expirationTtl: ttl,
    });

    // Update tag index
    if (options?.tags) {
      await this.updateTagIndex(key, options.tags);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);
    await this.kv.delete(key);
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      const keysStr = await this.kv.get(tagKey);

      if (keysStr) {
        const keys = JSON.parse(keysStr) as string[];

        // Delete all keys with this tag
        await Promise.all(keys.map(key => this.delete(key)));

        // Delete tag index
        await this.kv.delete(tagKey);
      }
    }
  }

  /**
   * Cache wrapper for functions
   */
  async remember<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn();
    await this.set(key, result, options);

    return result;
  }

  /**
   * Batch get multiple keys
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();

    // Check memory cache first
    const missingKeys: string[] = [];
    for (const key of keys) {
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && memoryEntry.expires > Date.now()) {
        results.set(key, memoryEntry.data);
      } else {
        missingKeys.push(key);
      }
    }

    // Fetch missing keys from KV
    if (missingKeys.length > 0) {
      const kvPromises = missingKeys.map(key =>
        this.kv.get<CacheEntry<T>>(key, 'json')
      );
      const kvResults = await Promise.all(kvPromises);

      missingKeys.forEach((key, index) => {
        const kvEntry = kvResults[index];
        if (kvEntry && kvEntry.expires > Date.now()) {
          results.set(key, kvEntry.data);
          this.setMemoryCache(key, kvEntry);
        } else {
          results.set(key, null);
        }
      });
    }

    return results;
  }

  /**
   * Cache warming - preload frequently accessed data
   */
  async warmCache(patterns: string[]): Promise<void> {
    for (const pattern of patterns) {
      const keys = await this.kv.list({ prefix: pattern });

      for (const key of keys.keys) {
        const entry = await this.kv.get<CacheEntry<any>>(key.name, 'json');
        if (entry && entry.expires > Date.now()) {
          this.setMemoryCache(key.name, entry);
        }
      }
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    memoryCacheSize: number;
    memoryCacheKeys: string[];
    kvCacheSize?: number;
  }> {
    const kvStats = await this.kv.list();

    return {
      memoryCacheSize: this.memoryCache.size,
      memoryCacheKeys: Array.from(this.memoryCache.keys()),
      kvCacheSize: kvStats.keys.length,
    };
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();

    // Clear KV cache (be careful with this in production)
    const allKeys = await this.kv.list();
    await Promise.all(
      allKeys.keys.map(key => this.kv.delete(key.name))
    );
  }

  // Private helper methods

  private setMemoryCache(key: string, entry: CacheEntry<any>): void {
    // Implement LRU eviction if cache is full
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      // Remove oldest entry (simple FIFO for now)
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }

    this.memoryCache.set(key, entry);
  }

  private async updateTagIndex(key: string, tags: string[]): Promise<void> {
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      const existingStr = await this.kv.get(tagKey);

      let keys: string[] = [];
      if (existingStr) {
        keys = JSON.parse(existingStr);
      }

      if (!keys.includes(key)) {
        keys.push(key);
        await this.kv.put(tagKey, JSON.stringify(keys));
      }
    }
  }

  private async generateETag(value: any): Promise<string> {
    const str = JSON.stringify(value);
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }

  private async refreshInBackground(key: string): Promise<void> {
    // This would trigger a background refresh
    // Implementation depends on your worker setup
    console.log(`Background refresh triggered for: ${key}`);
  }
}

/**
 * Specialized cache for different data types
 */
export class SpecializedCache {
  private cache: CacheService;

  constructor(kv: KVNamespace) {
    this.cache = new CacheService(kv);
  }

  /**
   * Cache user data
   */
  async getUser(userId: number, fetcher: () => Promise<any>): Promise<any> {
    const key = `user:${userId}`;
    return this.cache.remember(key, fetcher, {
      ttl: 600, // 10 minutes
      tags: ['users', `user:${userId}`],
    });
  }

  /**
   * Cache mailbox data
   */
  async getMailbox(address: string, fetcher: () => Promise<any>): Promise<any> {
    const key = `mailbox:${address}`;
    return this.cache.remember(key, fetcher, {
      ttl: 300, // 5 minutes
      tags: ['mailboxes', `mailbox:${address}`],
    });
  }

  /**
   * Cache email list
   */
  async getEmailList(
    mailboxId: number,
    page: number,
    fetcher: () => Promise<any>
  ): Promise<any> {
    const key = `emails:${mailboxId}:${page}`;
    return this.cache.remember(key, fetcher, {
      ttl: 60, // 1 minute
      tags: ['emails', `mailbox:${mailboxId}`],
      staleWhileRevalidate: true,
    });
  }

  /**
   * Cache API response
   */
  async getApiResponse(
    endpoint: string,
    params: Record<string, any>,
    fetcher: () => Promise<any>
  ): Promise<any> {
    const key = `api:${endpoint}:${JSON.stringify(params)}`;
    return this.cache.remember(key, fetcher, {
      ttl: 120, // 2 minutes
      tags: ['api', endpoint],
    });
  }

  /**
   * Invalidate user cache
   */
  async invalidateUser(userId: number): Promise<void> {
    await this.cache.invalidateByTags([`user:${userId}`]);
  }

  /**
   * Invalidate mailbox cache
   */
  async invalidateMailbox(address: string): Promise<void> {
    await this.cache.invalidateByTags([`mailbox:${address}`]);
  }

  /**
   * Invalidate email cache for a mailbox
   */
  async invalidateEmailList(mailboxId: number): Promise<void> {
    await this.cache.invalidateByTags([`mailbox:${mailboxId}`]);
  }
}

/**
 * Cache middleware for Hono
 */
export function cacheMiddleware(options?: CacheOptions) {
  return async (c: any, next: any) => {
    const cache = new CacheService(c.env.CACHE);

    // Skip cache for non-GET requests
    if (c.req.method !== 'GET') {
      return next();
    }

    // Generate cache key from URL and headers
    const url = new URL(c.req.url);
    const key = `http:${url.pathname}${url.search}`;

    // Check cache
    const cached = await cache.get(key, options);
    if (cached) {
      c.header('X-Cache', 'HIT');
      return c.json(cached);
    }

    // Continue with request
    await next();

    // Cache successful responses
    if (c.res.status === 200) {
      const body = await c.res.json();
      await cache.set(key, body, options);
      c.header('X-Cache', 'MISS');
    }
  };
}