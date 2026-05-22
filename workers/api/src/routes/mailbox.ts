/**
 * Mailbox Management Routes
 * Task IDs: MAIL-001, MAIL-002, MAIL-003, MAIL-004, MAIL-005
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { jwtAuth, auth, requirePermission } from '../middleware/auth';
import { canCreateMailbox, updateUserMailboxStats } from '../services/quotaService';
import type { Env } from '../index';
import { ErrorCode } from '../types';

const app = new Hono<{ Bindings: Env }>();

// Validation schemas
const createMailboxSchema = z.object({
  prefix: z.string().min(1).max(10).regex(/^[a-z0-9]+$/).optional(),
  expires_in: z.number().min(0).max(86400).optional(), // 0 = never expire, 600-86400 = 10 mins to 24 hours
  domain: z.string().min(1).max(253).optional(), // Optional domain selection
});

/**
 * Generate random email address
 */
function generateRandomAddress(domain: string, prefix?: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let random = prefix || '';

  const targetLength = 8 + Math.floor(Math.random() * 9); // 8-16 characters
  while (random.length < targetLength) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${random}@${domain}`;
}

/**
 * POST /api/mailbox/create-guest
 * Create a new temporary mailbox for guest users (no auth required)
 * Limited to shorter expiration and includes basic rate limiting
 */
app.post('/create-guest', async (c) => {
  try {
    // Guest mailboxes have shorter TTL (1-2 hours)
    const guestTTL = parseInt(c.env.GUEST_MAILBOX_TTL) || 7200; // Default: 2 hours

    // Generate unique address
    let address: string = '';
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      address = generateRandomAddress(c.env.DOMAIN);

      // Check if address exists
      const existing = await c.env.DB.prepare(`
        SELECT id FROM temp_emails WHERE address = ?
      `).bind(address).first();

      if (!existing) {
        break;
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      return c.json({
        success: false,
        error: 'Unable to generate unique address. Please try again.',
        error_code: ErrorCode.INTERNAL_ERROR,
      }, 500);
    }

    // Create mailbox for guest (user_id is NULL)
    const result = await c.env.DB.prepare(`
      INSERT INTO temp_emails (user_id, address, expires_at)
      VALUES (NULL, ?, datetime('now', '+' || ? || ' seconds'))
    `).bind(address, guestTTL).run();

    const mailboxId = result.meta.last_row_id;

    // Cache validation
    await c.env.CACHE?.put(`email_valid:${address}`, 'valid', {
      expirationTtl: guestTTL,
    });

    // Get the created mailbox
    const createdMailbox = await c.env.DB.prepare(`
      SELECT address, created_at, expires_at
      FROM temp_emails
      WHERE id = ?
    `).bind(mailboxId).first<{address: string; created_at: string; expires_at: string}>();

    return c.json({
      success: true,
      data: {
        id: mailboxId,
        address: createdMailbox?.address || address,
        created_at: createdMailbox?.created_at || '',
        expires_at: createdMailbox?.expires_at || '',
        is_guest: true,
      },
    });
  } catch (error: any) {
    console.error('Guest mailbox creation error:', error);
    return c.json({
      success: false,
      error: 'Failed to create guest mailbox',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * POST /api/mailbox/create
 * Create a new temporary mailbox
 */
app.post('/create', jwtAuth, async (c) => {
  try {
    const userId = c.get('user_id');
    const body = await c.req.json().catch(() => ({}));
    const validated = createMailboxSchema.parse(body);

    // Determine which domain to use
    let domainToUse = c.env.DOMAIN; // Default fallback

    if (validated.domain) {
      // User specified a domain - verify it's valid and active
      const domainCheck = await c.env.DB.prepare(`
        SELECT domain FROM domains WHERE domain = ? AND is_active = 1
      `).bind(validated.domain.toLowerCase()).first<{ domain: string }>();

      if (!domainCheck) {
        return c.json({
          success: false,
          error: 'Invalid or inactive domain',
          error_code: ErrorCode.VALIDATION_ERROR,
        }, 400);
      }
      domainToUse = domainCheck.domain;
    } else {
      // No domain specified - use default from database or env
      const defaultDomain = await c.env.DB.prepare(`
        SELECT domain FROM domains WHERE is_active = 1 AND is_default = 1 LIMIT 1
      `).first<{ domain: string }>();

      if (defaultDomain) {
        domainToUse = defaultDomain.domain;
      } else {
        // Fallback: try first active domain
        const firstDomain = await c.env.DB.prepare(`
          SELECT domain FROM domains WHERE is_active = 1 ORDER BY sort_order ASC LIMIT 1
        `).first<{ domain: string }>();

        if (firstDomain) {
          domainToUse = firstDomain.domain;
        }
        // else: use c.env.DOMAIN as final fallback
      }
    }

    // Generate unique address with retry logic
    let address: string = '';
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      address = generateRandomAddress(domainToUse, validated.prefix);

      // Check if address exists
      const existing = await c.env.DB.prepare(`
        SELECT id FROM temp_emails WHERE address = ?
      `).bind(address).first();

      if (!existing) {
        break;
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      return c.json({
        success: false,
        error: 'Unable to generate unique address. Please try again.',
        error_code: ErrorCode.INTERNAL_ERROR,
      }, 500);
    }

    // Calculate expiration time
    const expiresIn = validated.expires_in ?? (parseInt(c.env.DEFAULT_MAILBOX_TTL) || 3600);
    const isPermanent = expiresIn === 0;

    // Check user quota before creating mailbox
    const quotaCheck = await canCreateMailbox(userId, isPermanent, c.env.DB);

    if (!quotaCheck.allowed) {
      return c.json({
        success: false,
        error: quotaCheck.reason === 'QUOTA_EXCEEDED'
          ? `Mailbox quota exceeded. You have ${quotaCheck.current}/${quotaCheck.limit} ${isPermanent ? 'permanent' : 'temporary'} mailboxes.`
          : quotaCheck.reason === 'TIER_EXPIRED'
          ? 'Your tier has expired. Please upgrade to continue creating mailboxes.'
          : quotaCheck.reason === 'TIER_NOT_FOUND'
          ? 'Unable to determine your tier. Please contact support.'
          : 'Unable to create mailbox.',
        error_code: quotaCheck.reason === 'QUOTA_EXCEEDED' ? ErrorCode.QUOTA_EXCEEDED
          : quotaCheck.reason === 'TIER_EXPIRED' ? ErrorCode.TIER_EXPIRED
          : quotaCheck.reason === 'TIER_NOT_FOUND' ? ErrorCode.TIER_NOT_FOUND
          : ErrorCode.INTERNAL_ERROR,
        details: {
          current: quotaCheck.current,
          limit: quotaCheck.limit,
          tier: quotaCheck.tierName,
        },
      }, quotaCheck.reason === 'QUOTA_EXCEEDED' || quotaCheck.reason === 'TIER_EXPIRED' ? 403 : 500);
    }

    // Create mailbox with SQLite datetime format
    // If expires_in is 0, set expires_at to NULL (permanent mailbox)
    let result;
    if (expiresIn === 0) {
      result = await c.env.DB.prepare(`
        INSERT INTO temp_emails (user_id, address, expires_at)
        VALUES (?, ?, NULL)
      `).bind(userId, address).run();
    } else {
      result = await c.env.DB.prepare(`
        INSERT INTO temp_emails (user_id, address, expires_at)
        VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))
      `).bind(userId, address, expiresIn).run();
    }

    const mailboxId = result.meta.last_row_id;

    // Update user statistics with quota service
    await updateUserMailboxStats(userId, isPermanent, true, c.env.DB);

    // Cache validation
    await c.env.CACHE?.put(`email_valid:${address}`, 'valid', {
      expirationTtl: expiresIn === 0 ? 86400 * 7 : expiresIn, // For permanent mailbox, cache for 7 days
    });

    // Log creation
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
      VALUES (?, 'CREATE_MAILBOX', 'temp_email', ?)
    `).bind(userId, mailboxId).run();

    // Get the created mailbox with correct format
    const createdMailbox = await c.env.DB.prepare(`
      SELECT address, created_at, expires_at
      FROM temp_emails
      WHERE id = ?
    `).bind(mailboxId).first<{address: string; created_at: string; expires_at: string}>();

    return c.json({
      success: true,
      data: {
        id: mailboxId,
        address: createdMailbox?.address || address,
        created_at: createdMailbox?.created_at || '',
        expires_at: createdMailbox?.expires_at || '',
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Invalid request data',
        error_code: ErrorCode.VALIDATION_ERROR,
        details: error.errors,
      }, 400);
    }
    throw error;
  }
});

/**
 * GET /api/mailbox/list
 * Get user's mailbox list
 */
app.get('/list', jwtAuth, async (c) => {
  const userId = c.get('user_id');

  const mailboxes = await c.env.DB.prepare(`
    SELECT
      t.id,
      t.address,
      t.created_at,
      t.expires_at,
      COUNT(DISTINCT e.id) as email_count,
      SUM(CASE WHEN e.is_read = 0 THEN 1 ELSE 0 END) as unread_count,
      CASE
        WHEN t.expires_at IS NULL THEN 0
        WHEN t.expires_at <= datetime('now') THEN 1
        ELSE 0
      END as is_expired
    FROM temp_emails t
    LEFT JOIN emails e ON e.temp_email_id = t.id AND e.deleted_at IS NULL
    WHERE t.user_id = ? AND t.deleted_at IS NULL
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `).bind(userId).all();

  return c.json({
    success: true,
    data: mailboxes.results.map(mailbox => ({
      ...mailbox,
      email_count: mailbox.email_count || 0,
      unread_count: mailbox.unread_count || 0,
      is_expired: Boolean(mailbox.is_expired),
    })),
  });
});

/**
 * DELETE /api/mailbox/:address
 * Delete a temporary mailbox
 */
app.delete('/:address', jwtAuth, async (c) => {
  const userId = c.get('user_id');
  const address = c.req.param('address');

  // Get mailbox with expires_at to determine type
  const mailbox = await c.env.DB.prepare(`
    SELECT id, expires_at FROM temp_emails
    WHERE address = ? AND user_id = ? AND deleted_at IS NULL
  `).bind(address, userId).first<{id: number; expires_at: string | null}>();

  if (!mailbox) {
    return c.json({
      success: false,
      error: 'Mailbox not found or access denied',
      error_code: ErrorCode.MAILBOX_NOT_FOUND,
    }, 404);
  }

  // Determine if permanent or temporary
  const isPermanent = mailbox.expires_at === null;

  // Soft delete mailbox
  await c.env.DB.prepare(`
    UPDATE temp_emails SET deleted_at = datetime('now')
    WHERE id = ?
  `).bind(mailbox.id).run();

  // Update cache
  await c.env.CACHE?.delete(`email_valid:${address}`);

  // Update user statistics with correct mailbox type
  await updateUserMailboxStats(userId, isPermanent, false, c.env.DB);

  // Log deletion
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
    VALUES (?, 'DELETE_MAILBOX', 'temp_email', ?)
  `).bind(userId, mailbox.id).run();

  return c.json({
    success: true,
    message: 'Mailbox deleted successfully',
  });
});

/**
 * POST /v1/mailbox
 * Create mailbox via API key (North-facing API)
 * Requires: write permission
 */
app.post('/v1/mailbox', auth, requirePermission('write'), async (c) => {
  try {
    const userId = c.get('user_id');
    const body = await c.req.json().catch(() => ({}));
    const validated = createMailboxSchema.parse(body);

    
    // Generate unique address with retry logic
    let address: string = '';
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      address = generateRandomAddress(c.env.DOMAIN, validated.prefix);

      // Check if address exists
      const existing = await c.env.DB.prepare(`
        SELECT id FROM temp_emails WHERE address = ?
      `).bind(address).first();

      if (!existing) {
        break;
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      return c.json({
        success: false,
        error: 'Unable to generate unique address. Please try again.',
        error_code: ErrorCode.INTERNAL_ERROR,
      }, 500);
    }

    // Calculate expiration time
    const expiresIn = validated.expires_in ?? (parseInt(c.env.DEFAULT_MAILBOX_TTL) || 3600);
    const isPermanent = expiresIn === 0;

    // Check user quota before creating mailbox
    const quotaCheck = await canCreateMailbox(userId, isPermanent, c.env.DB);

    if (!quotaCheck.allowed) {
      return c.json({
        success: false,
        error: quotaCheck.reason === 'QUOTA_EXCEEDED'
          ? `Mailbox quota exceeded. You have ${quotaCheck.current}/${quotaCheck.limit} ${isPermanent ? 'permanent' : 'temporary'} mailboxes.`
          : quotaCheck.reason === 'TIER_EXPIRED'
          ? 'Your tier has expired. Please upgrade to continue creating mailboxes.'
          : quotaCheck.reason === 'TIER_NOT_FOUND'
          ? 'Unable to determine your tier. Please contact support.'
          : 'Unable to create mailbox.',
        error_code: quotaCheck.reason === 'QUOTA_EXCEEDED' ? ErrorCode.QUOTA_EXCEEDED
          : quotaCheck.reason === 'TIER_EXPIRED' ? ErrorCode.TIER_EXPIRED
          : quotaCheck.reason === 'TIER_NOT_FOUND' ? ErrorCode.TIER_NOT_FOUND
          : ErrorCode.INTERNAL_ERROR,
        details: {
          current: quotaCheck.current,
          limit: quotaCheck.limit,
          tier: quotaCheck.tierName,
        },
      }, quotaCheck.reason === 'QUOTA_EXCEEDED' || quotaCheck.reason === 'TIER_EXPIRED' ? 403 : 500);
    }

    // Create mailbox with SQLite datetime format
    // If expires_in is 0, set expires_at to NULL (permanent mailbox)
    let result;
    if (expiresIn === 0) {
      result = await c.env.DB.prepare(`
        INSERT INTO temp_emails (user_id, address, expires_at)
        VALUES (?, ?, NULL)
      `).bind(userId, address).run();
    } else {
      result = await c.env.DB.prepare(`
        INSERT INTO temp_emails (user_id, address, expires_at)
        VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))
      `).bind(userId, address, expiresIn).run();
    }

    const mailboxId = result.meta.last_row_id;

    // Update user statistics with quota service
    await updateUserMailboxStats(userId, isPermanent, true, c.env.DB);

    // Cache validation
    await c.env.CACHE?.put(`email_valid:${address}`, 'valid', {
      expirationTtl: expiresIn === 0 ? 86400 * 7 : expiresIn, // For permanent mailbox, cache for 7 days
    });

    // Log creation
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
      VALUES (?, 'CREATE_MAILBOX', 'temp_email', ?)
    `).bind(userId, mailboxId).run();

    // Get the created mailbox with correct format
    const createdMailbox = await c.env.DB.prepare(`
      SELECT address, created_at, expires_at
      FROM temp_emails
      WHERE id = ?
    `).bind(mailboxId).first<{address: string; created_at: string; expires_at: string}>();

    return c.json({
      success: true,
      data: {
        id: mailboxId,
        address: createdMailbox?.address || address,
        created_at: createdMailbox?.created_at || '',
        expires_at: createdMailbox?.expires_at || '',
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Invalid request data',
        error_code: ErrorCode.VALIDATION_ERROR,
        details: error.errors,
      }, 400);
    }
    throw error;
  }
});

/**
 * GET /v1/mailboxes
 * Get mailboxes via API key (North-facing API)
 * Requires: read permission
 */
app.get('/v1/mailboxes', auth, requirePermission('read'), async (c) => {
  const userId = c.get('user_id');

  const mailboxes = await c.env.DB.prepare(`
    SELECT
      address,
      created_at,
      expires_at,
      (SELECT COUNT(*) FROM emails WHERE temp_email_id = t.id AND deleted_at IS NULL) as email_count,
      (SELECT COUNT(*) FROM emails WHERE temp_email_id = t.id AND is_read = 0 AND deleted_at IS NULL) as unread_count
    FROM temp_emails t
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
  `).bind(userId).all();

  return c.json({
    success: true,
    data: mailboxes.results,
  });
});

/**
 * DELETE /v1/mailbox/:address
 * Delete mailbox via API key
 * Requires: write permission
 */
app.delete('/v1/mailbox/:address', auth, requirePermission('write'), async (c) => {
  const userId = c.get('user_id');
  const address = c.req.param('address');

  // Get mailbox with expires_at to determine type
  const mailbox = await c.env.DB.prepare(`
    SELECT id, expires_at FROM temp_emails
    WHERE address = ? AND user_id = ? AND deleted_at IS NULL
  `).bind(address, userId).first<{id: number; expires_at: string | null}>();

  if (!mailbox) {
    return c.json({
      success: false,
      error: 'Mailbox not found or access denied',
      error_code: ErrorCode.MAILBOX_NOT_FOUND,
    }, 404);
  }

  // Determine if permanent or temporary
  const isPermanent = mailbox.expires_at === null;

  // Soft delete mailbox
  await c.env.DB.prepare(`
    UPDATE temp_emails SET deleted_at = datetime('now')
    WHERE id = ?
  `).bind(mailbox.id).run();

  // Update cache
  await c.env.CACHE?.delete(`email_valid:${address}`);

  // Update user statistics with correct mailbox type
  await updateUserMailboxStats(userId, isPermanent, false, c.env.DB);

  // Log deletion
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
    VALUES (?, 'DELETE_MAILBOX', 'temp_email', ?)
  `).bind(userId, mailbox.id).run();

  return c.json({
    success: true,
    message: 'Mailbox deleted successfully',
  });
});

export default app;