/**
 * Mailbox Email Routes
 * Handles email listing/searching under a specific mailbox address.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { jwtAuth } from '../middleware/auth';
import type { Env } from '../index';
import { ErrorCode } from '../types';
import { verifyMailboxOwnership } from '../utils/email';
import { decryptEmailContent, isEncryptedContent } from '../utils/crypto';

const app = new Hono<{ Bindings: Env }>();

/**
 * Helper function to decrypt and preview email content
 * Decrypts if needed, then returns first 100 characters
 */
async function decryptAndPreview(content: string | null, encryptionKey: string | undefined): Promise<string> {
  if (!content) return '';

  try {
    // Check if content is encrypted
    if (encryptionKey && isEncryptedContent(content)) {
      const decrypted = await decryptEmailContent(content, encryptionKey);
      return decrypted ? decrypted.substring(0, 100) : '';
    }
    // If not encrypted, just return preview
    return content.substring(0, 100);
  } catch (error) {
    console.error('Failed to decrypt email preview:', error);
    return ''; // Return empty on error
  }
}

// Shared pagination/search schemas
const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const searchSchema = z.object({
  q: z.string().min(1),
  scope: z.enum(['all', 'subject', 'from', 'body']).default('all'),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

/**
 * GET /api/emails/guest/:address
 * Get emails for a guest mailbox (no auth required)
 * Only works for guest mailboxes (user_id is NULL)
 */
app.get('/guest/:address', async (c) => {
  const address = c.req.param('address');
  const { page, limit } = paginationSchema.parse(c.req.query());

  // Verify this is a guest mailbox (user_id is NULL)
  const mailbox = await c.env.DB.prepare(`
    SELECT id FROM temp_emails
    WHERE address = ? AND user_id IS NULL AND deleted_at IS NULL
  `).bind(address).first<{id: number}>();

  if (!mailbox) {
    return c.json({
      success: false,
      error: 'Guest mailbox not found',
      error_code: ErrorCode.MAILBOX_NOT_FOUND,
    }, 404);
  }

  const offset = (page - 1) * limit;
  const emails = await c.env.DB.prepare(`
    SELECT
      id,
      from_email AS from_address,
      from_name,
      to_email AS to_address,
      subject,
      body_text,
      body_html,
      received_at,
      is_read,
      size_bytes,
      (SELECT COUNT(*) FROM attachments WHERE email_id = e.id) as attachment_count
    FROM emails e
    WHERE temp_email_id = ? AND deleted_at IS NULL
    ORDER BY received_at DESC
    LIMIT ? OFFSET ?
  `).bind(mailbox.id, limit, offset).all();

  const countResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as total FROM emails
    WHERE temp_email_id = ? AND deleted_at IS NULL
  `).bind(mailbox.id).first<{ total: number }>();

  // Process emails: decrypt and create preview
  const processedEmails = await Promise.all(
    emails.results.map(async (email: any) => {
      const bodyPreview = await decryptAndPreview(
        email.body_text || email.body_html,
        c.env.DATABASE_ENCRYPTION_KEY
      );

      return {
        id: email.id,
        from_address: email.from_address,
        from_name: email.from_name,
        to_address: email.to_address,
        subject: email.subject,
        body_text: bodyPreview,
        received_at: email.received_at,
        is_read: email.is_read,
        size_bytes: email.size_bytes,
        has_attachments: (email.attachment_count as number) > 0,
      };
    })
  );

  return c.json({
    success: true,
    data: {
      emails: processedEmails,
      total: countResult?.total || 0,
      page,
      limit,
    },
  });
});

/**
 * GET /api/emails/:address
 * Get emails for a specific mailbox
 */
app.get('/:address', jwtAuth, async (c) => {
  const userId = c.get('user_id');
  const address = c.req.param('address');
  const { page, limit } = paginationSchema.parse(c.req.query());

  const tempEmailId = await verifyMailboxOwnership(address, userId, c.env.DB);
  if (!tempEmailId) {
    return c.json({
      success: false,
      error: 'Mailbox not found or access denied',
      error_code: ErrorCode.PERMISSION_DENIED,
    }, 403);
  }

  const offset = (page - 1) * limit;
  const emails = await c.env.DB.prepare(`
    SELECT
      id,
      from_email AS from_address,
      from_name,
      to_email AS to_address,
      subject,
      body_text,
      body_html,
      received_at,
      is_read,
      size_bytes,
      (SELECT COUNT(*) FROM attachments WHERE email_id = e.id) as attachment_count
    FROM emails e
    WHERE temp_email_id = ? AND deleted_at IS NULL
    ORDER BY received_at DESC
    LIMIT ? OFFSET ?
  `).bind(tempEmailId, limit, offset).all();

  const countResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as total FROM emails
    WHERE temp_email_id = ? AND deleted_at IS NULL
  `).bind(tempEmailId).first<{ total: number }>();

  // Process emails: decrypt and create preview
  const processedEmails = await Promise.all(
    emails.results.map(async (email: any) => {
      const bodyPreview = await decryptAndPreview(
        email.body_text || email.body_html,
        c.env.DATABASE_ENCRYPTION_KEY
      );

      return {
        id: email.id,
        from_address: email.from_address,
        from_name: email.from_name,
        to_address: email.to_address,
        subject: email.subject,
        body_text: bodyPreview,
        received_at: email.received_at,
        is_read: email.is_read,
        size_bytes: email.size_bytes,
        has_attachments: (email.attachment_count as number) > 0,
      };
    })
  );

  return c.json({
    success: true,
    data: {
      emails: processedEmails,
      total: countResult?.total || 0,
      page,
      limit,
    },
  });
});

/**
 * GET /api/emails/:address/search
 * Search emails in a mailbox
 */
app.get('/:address/search', jwtAuth, async (c) => {
  const userId = c.get('user_id');
  const address = c.req.param('address');
  const searchParams = searchSchema.parse(c.req.query());
  const { page, limit } = paginationSchema.parse(c.req.query());

  const tempEmailId = await verifyMailboxOwnership(address, userId, c.env.DB);
  if (!tempEmailId) {
    return c.json({
      success: false,
      error: 'Mailbox not found or access denied',
      error_code: ErrorCode.PERMISSION_DENIED,
    }, 403);
  }

  let query = `
    SELECT id,
           from_email AS from_address,
           from_name,
           to_email AS to_address,
           subject,
           SUBSTR(COALESCE(body_text, body_html), 1, 100) as body_text,
           body_html,
           received_at,
           is_read,
           size_bytes,
           (SELECT COUNT(*) FROM attachments WHERE email_id = emails.id) as attachment_count
    FROM emails
    WHERE temp_email_id = ? AND deleted_at IS NULL
  `;
  const params: any[] = [tempEmailId];

  const keyword = `%${searchParams.q}%`;
  switch (searchParams.scope) {
    case 'subject':
      query += ` AND subject LIKE ?`;
      params.push(keyword);
      break;
    case 'from':
      query += ` AND from_email LIKE ?`;
      params.push(keyword);
      break;
    case 'body':
      query += ` AND (body_text LIKE ? OR body_html LIKE ?)`;
      params.push(keyword, keyword);
      break;
    default:
      query += ` AND (subject LIKE ? OR from_email LIKE ? OR body_text LIKE ? OR body_html LIKE ?)`;
      params.push(keyword, keyword, keyword, keyword);
  }

  if (searchParams.date_from) {
    query += ` AND received_at >= ?`;
    params.push(searchParams.date_from);
  }
  if (searchParams.date_to) {
    query += ` AND received_at <= ?`;
    params.push(searchParams.date_to);
  }

  const offset = (page - 1) * limit;
  query += ` ORDER BY received_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const emails = await c.env.DB.prepare(query).bind(...params).all();

  let countQuery = query.replace(
    /SELECT.*FROM/,
    'SELECT COUNT(*) as total FROM'
  ).replace(/ORDER BY.*$/, '');
  const countParams = params.slice(0, -2);
  const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

  return c.json({
    success: true,
    data: {
      emails: emails.results.map(email => ({
        ...email,
        has_attachments: (email.attachment_count as number) > 0,
      })),
      total: countResult?.total || 0,
      search_params: {
        keyword: searchParams.q,
        scope: searchParams.scope,
        date_range: searchParams.date_from || searchParams.date_to ? {
          from: searchParams.date_from,
          to: searchParams.date_to,
        } : null,
      },
    },
  });
});

export default app;
