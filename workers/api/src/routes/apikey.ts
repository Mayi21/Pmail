/**
 * API Key Management Routes (Multi-Keys Support)
 * Task IDs: API-001, API-002, API-003, API-004, API-005
 * Updated: 2025-01-22 - Added multi-key support with permissions
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { jwtAuth } from '../middleware/auth';
import type { Env } from '../index';
import { ErrorCode } from '../types';

const app = new Hono<{ Bindings: Env }>();

// Validation schemas
const generateKeySchema = z.object({
  name: z.string().min(1).max(100),
  expires_in: z.number().min(0).max(315360000).optional().default(0), // 0 = never expires, max 10 years
  permissions: z.array(z.enum(['read', 'write'])).min(1),
});

const updateKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
});

/**
 * Generate a secure API key
 */
function generateApiKey(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);

  // Convert to base64url
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Hash API key using SHA-256
 */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * GET /api/apikey/list
 * List all API keys for the current user
 */
app.get('/list', jwtAuth, async (c) => {
  const userId = c.get('user_id');

  const keys = await c.env.DB.prepare(`
    SELECT
      id,
      name,
      key_hash,
      created_at,
      last_used_at,
      expires_at,
      is_active,
      permissions
    FROM api_keys
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).bind(userId).all();

  // Format response
  const formattedKeys = keys.results.map((key: any) => {
    // Create key preview from hash
    const keyPrefix = key.key_hash.substring(0, 8);
    const keySuffix = key.key_hash.substring(key.key_hash.length - 4);

    return {
      id: key.id,
      name: key.name,
      key_preview: `${keyPrefix}...${keySuffix}`,
      created_at: key.created_at,
      last_used_at: key.last_used_at,
      expires_at: key.expires_at,
      is_active: Boolean(key.is_active),
      permissions: key.permissions ? key.permissions.split(',') : [],
    };
  });

  return c.json({
    success: true,
    data: formattedKeys,
  });
});

/**
 * POST /api/apikey/generate
 * Generate a new API key (supports multiple keys per user)
 */
app.post('/generate', jwtAuth, async (c) => {
  try {
    const userId = c.get('user_id');
    const body = await c.req.json().catch(() => ({}));
    const validated = generateKeySchema.parse(body);

    // Check key limit
    const count = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM api_keys WHERE user_id = ?
    `).bind(userId).first<{ total: number }>();

    const maxKeys = parseInt(c.env.MAX_API_KEYS_PER_USER || '10');
    if (count && count.total >= maxKeys) {
      return c.json({
        success: false,
        error: `Maximum API keys limit reached (${maxKeys})`,
        error_code: 'MAX_API_KEYS',
      }, 400);
    }

    // Generate new API key
    const apiKey = `tek_${generateApiKey()}`; // tek = temp email key
    const keyHash = await hashApiKey(apiKey);

    // Calculate expiration
    const expiresAt = validated.expires_in && validated.expires_in > 0
      ? `datetime('now', '+${validated.expires_in} seconds')`
      : 'NULL';

    // Store hashed key with new fields
    const result = await c.env.DB.prepare(`
      INSERT INTO api_keys (user_id, name, key_hash, permissions, expires_at, created_at)
      VALUES (?, ?, ?, ?, ${expiresAt}, datetime('now'))
    `).bind(
      userId,
      validated.name,
      keyHash,
      validated.permissions.join(',')
    ).run();

    // Log key generation
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
      VALUES (?, 'GENERATE_API_KEY', 'api_key', ?)
    `).bind(userId, result.meta.last_row_id).run();

    return c.json({
      success: true,
      data: {
        key: apiKey,
        created_at: new Date().toISOString(),
      },
      message: 'Please save this API key securely. It will not be shown again.',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Validation error',
        error_code: ErrorCode.VALIDATION_ERROR,
        details: error.errors,
      }, 400);
    }
    throw error;
  }
});

/**
 * GET /api/apikey/info
 * Get current API key information (backward compatibility - returns first key)
 */
app.get('/info', jwtAuth, async (c) => {
  const userId = c.get('user_id');

  const keyInfo = await c.env.DB.prepare(`
    SELECT
      key_hash,
      name,
      created_at,
      last_used_at
    FROM api_keys
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(userId).first();

  if (!keyInfo) {
    return c.json({
      success: true,
      data: {
        exists: false,
      },
    });
  }

  // Show partial key hash for identification
  const keyPrefix = (keyInfo.key_hash as string).substring(0, 8);
  const keySuffix = (keyInfo.key_hash as string).substring((keyInfo.key_hash as string).length - 4);

  return c.json({
    success: true,
    data: {
      exists: true,
      key_prefix: `${keyPrefix}...${keySuffix}`,
      name: keyInfo.name,
      created_at: keyInfo.created_at,
      last_used_at: keyInfo.last_used_at,
    },
  });
});

/**
 * DELETE /api/apikey/:id
 * Delete a specific API key by ID
 */
app.delete('/:id', jwtAuth, async (c) => {
  const userId = c.get('user_id');
  const keyId = parseInt(c.req.param('id'));

  if (isNaN(keyId)) {
    return c.json({
      success: false,
      error: 'Invalid key ID',
      error_code: ErrorCode.VALIDATION_ERROR,
    }, 400);
  }

  // Check if key exists and belongs to user
  const existing = await c.env.DB.prepare(`
    SELECT id FROM api_keys WHERE id = ? AND user_id = ?
  `).bind(keyId, userId).first();

  if (!existing) {
    return c.json({
      success: false,
      error: 'API key not found',
      error_code: ErrorCode.NOT_FOUND,
    }, 404);
  }

  // Delete key
  await c.env.DB.prepare(`
    DELETE FROM api_keys WHERE id = ?
  `).bind(keyId).run();

  // Log deletion
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
    VALUES (?, 'DELETE_API_KEY', 'api_key', ?)
  `).bind(userId, keyId).run();

  return c.json({
    success: true,
    message: 'API key deleted successfully',
  });
});

/**
 * PATCH /api/apikey/:id
 * Update API key information (name, is_active)
 */
app.patch('/:id', jwtAuth, async (c) => {
  try {
    const userId = c.get('user_id');
    const keyId = parseInt(c.req.param('id'));

    if (isNaN(keyId)) {
      return c.json({
        success: false,
        error: 'Invalid key ID',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const validated = updateKeySchema.parse(body);

    // Check if key exists and belongs to user
    const existing = await c.env.DB.prepare(`
      SELECT id FROM api_keys WHERE id = ? AND user_id = ?
    `).bind(keyId, userId).first();

    if (!existing) {
      return c.json({
        success: false,
        error: 'API key not found',
        error_code: ErrorCode.NOT_FOUND,
      }, 404);
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];

    if (validated.name !== undefined) {
      updates.push('name = ?');
      params.push(validated.name);
    }

    if (validated.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(validated.is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return c.json({
        success: false,
        error: 'No fields to update',
        error_code: ErrorCode.VALIDATION_ERROR,
      }, 400);
    }

    // Add key ID to params
    params.push(keyId);

    // Update key
    await c.env.DB.prepare(`
      UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?
    `).bind(...params).run();

    // Log update
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
      VALUES (?, 'UPDATE_API_KEY', 'api_key', ?)
    `).bind(userId, keyId).run();

    return c.json({
      success: true,
      message: 'API key updated successfully',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Validation error',
        error_code: ErrorCode.VALIDATION_ERROR,
        details: error.errors,
      }, 400);
    }
    throw error;
  }
});

/**
 * POST /api/apikey/validate
 * Validate an API key (internal use)
 * Updated to check expires_at and is_active
 */
app.post('/validate', async (c) => {
  try {
    const { key } = await c.req.json();

    if (!key || typeof key !== 'string') {
      return c.json({
        success: false,
        valid: false,
      });
    }

    const keyHash = await hashApiKey(key);

    // Look up the key with validation checks
    const result = await c.env.DB.prepare(`
      SELECT id, user_id, permissions, is_active, expires_at
      FROM api_keys
      WHERE key_hash = ?
    `).bind(keyHash).first<{
      id: number;
      user_id: number;
      permissions: string;
      is_active: number;
      expires_at: string | null;
    }>();

    if (!result) {
      return c.json({
        success: true,
        valid: false,
      });
    }

    // Check if key is active
    if (!result.is_active) {
      return c.json({
        success: true,
        valid: false,
        reason: 'Key is disabled',
      });
    }

    // Check if key is expired
    if (result.expires_at) {
      const now = new Date();
      const expiresAt = new Date(result.expires_at);
      if (now > expiresAt) {
        return c.json({
          success: true,
          valid: false,
          reason: 'Key is expired',
        });
      }
    }

    // Update last used timestamp
    await c.env.DB.prepare(`
      UPDATE api_keys SET last_used_at = datetime('now')
      WHERE id = ?
    `).bind(result.id).run();

    return c.json({
      success: true,
      valid: true,
      user_id: result.user_id,
      permissions: result.permissions.split(','),
    });
  } catch (error) {
    return c.json({
      success: false,
      valid: false,
    });
  }
});

export default app;
