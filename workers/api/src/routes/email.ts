/**
 * Email Item Routes
 * Handles operations on individual emails.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { jwtAuth } from '../middleware/auth';
import type { Env } from '../index';
import { ErrorCode } from '../types';
import { sanitizeHtml, verifyEmailOwnership } from '../utils/email';
import { decryptEmailContent, isEncryptedContent } from '../utils/crypto';

const app = new Hono<{ Bindings: Env }>();

const batchDeleteSchema = z.object({
  ids: z.array(z.number()).min(1).max(100),
});

/**
 * Helper function to decrypt email content fields
 */
async function decryptEmailFields(email: any, encryptionKey: string | undefined): Promise<any> {
  if (!email || !encryptionKey) {
    return email;
  }

  try {
    // Decrypt body_text if encrypted
    if (email.body_text && isEncryptedContent(email.body_text as string)) {
      email.body_text = await decryptEmailContent(email.body_text as string, encryptionKey);
    }

    // Decrypt body_html if encrypted
    if (email.body_html && isEncryptedContent(email.body_html as string)) {
      email.body_html = await decryptEmailContent(email.body_html as string, encryptionKey);
    }

    // Decrypt raw_content if encrypted
    if (email.raw_content && isEncryptedContent(email.raw_content as string)) {
      email.raw_content = await decryptEmailContent(email.raw_content as string, encryptionKey);
    }
  } catch (error) {
    console.error('Failed to decrypt email content:', error);
    // Return email as-is if decryption fails
  }

  return email;
}

/**
 * GET /api/email/guest/:id
 * Get email details for guest (no auth required)
 * Only works for emails in guest mailboxes
 */
app.get('/guest/:id', async (c) => {
  const emailId = parseInt(c.req.param('id'));

  // Verify this email belongs to a guest mailbox (user_id is NULL)
  const email = await c.env.DB.prepare(`
    SELECT
      e.id,
      e.from_email AS from_address,
      e.from_name,
      e.to_email AS to_address,
      e.subject,
      e.body_text,
      e.body_html,
      e.headers,
      e.received_at,
      e.is_read,
      e.size_bytes,
      e.raw_content
    FROM emails e
    JOIN temp_emails t ON e.temp_email_id = t.id
    WHERE e.id = ? AND t.user_id IS NULL AND e.deleted_at IS NULL
  `).bind(emailId).first();

  if (!email) {
    return c.json({
      success: false,
      error: 'Email not found',
      error_code: ErrorCode.EMAIL_NOT_FOUND,
    }, 404);
  }

  // Decrypt email content if encrypted
  await decryptEmailFields(email, c.env.DATABASE_ENCRYPTION_KEY);

  if (email.body_html) {
    email.body_html = sanitizeHtml(email.body_html as string);
  }

  const attachments = await c.env.DB.prepare(`
    SELECT id, filename, size, content_type, status
    FROM attachments WHERE email_id = ?
  `).bind(emailId).all();

  // Mark as read (guest emails)
  if (!email.is_read) {
    await c.env.DB.prepare(`
      UPDATE emails SET is_read = 1 WHERE id = ?
    `).bind(emailId).run();
  }

  return c.json({
    success: true,
    data: {
      ...email,
      attachments: attachments.results,
    },
  });
});

/**
 * GET /api/email/:id
 * Get email details
 */
app.get('/:id', jwtAuth, async (c) => {
  const userId = c.get('user_id');
  const emailId = parseInt(c.req.param('id'));

  if (!await verifyEmailOwnership(emailId, userId, c.env.DB)) {
    return c.json({
      success: false,
      error: 'Email not found or access denied',
      error_code: ErrorCode.EMAIL_NOT_FOUND,
    }, 404);
  }

  const email = await c.env.DB.prepare(`
    SELECT
      e.id,
      e.from_email AS from_address,
      e.from_name,
      e.to_email AS to_address,
      e.subject,
      e.body_text,
      e.body_html,
      e.headers,
      e.received_at,
      e.is_read,
      e.size_bytes,
      e.raw_content
    FROM emails e
    JOIN temp_emails t ON e.temp_email_id = t.id
    WHERE e.id = ?
  `).bind(emailId).first();

  if (!email) {
    return c.json({
      success: false,
      error: 'Email not found',
      error_code: ErrorCode.EMAIL_NOT_FOUND,
    }, 404);
  }

  // Decrypt email content if encrypted
  await decryptEmailFields(email, c.env.DATABASE_ENCRYPTION_KEY);

  if (email.body_html) {
    email.body_html = sanitizeHtml(email.body_html as string);
  }

  const attachments = await c.env.DB.prepare(`
    SELECT id, filename, size, content_type, status
    FROM attachments WHERE email_id = ?
  `).bind(emailId).all();

  if (!email.is_read) {
    await c.env.DB.prepare(`
      UPDATE emails SET is_read = 1 WHERE id = ?
    `).bind(emailId).run();

    await c.env.DB.prepare(`
      UPDATE user_statistics
      SET unread_emails = CASE
        WHEN unread_emails > 0 THEN unread_emails - 1
        ELSE 0
      END
      WHERE user_id = ?
    `).bind(userId).run();
  }

  return c.json({
    success: true,
    data: {
      ...email,
      attachments: attachments.results,
    },
  });
});

/**
 * DELETE /api/email/:id
 * Delete an email
 */
app.delete('/:id', jwtAuth, async (c) => {
  const userId = c.get('user_id');
  const emailId = parseInt(c.req.param('id'));

  if (!await verifyEmailOwnership(emailId, userId, c.env.DB)) {
    return c.json({
      success: false,
      error: 'Email not found or access denied',
      error_code: ErrorCode.EMAIL_NOT_FOUND,
    }, 404);
  }

  // Get email info before deletion
  const email = await c.env.DB.prepare(`
    SELECT is_read FROM emails WHERE id = ?
  `).bind(emailId).first<{is_read: number}>();

  // Soft delete the email
  await c.env.DB.prepare(`
    UPDATE emails SET deleted_at = datetime('now') WHERE id = ?
  `).bind(emailId).run();

  // Update user statistics
  await c.env.DB.prepare(`
    UPDATE user_statistics
    SET total_emails = CASE
      WHEN total_emails > 0 THEN total_emails - 1
      ELSE 0
    END,
    unread_emails = CASE
      WHEN ? = 0 AND unread_emails > 0 THEN unread_emails - 1
      ELSE unread_emails
    END,
    updated_at = datetime('now')
    WHERE user_id = ?
  `).bind(email?.is_read ?? 1, userId).run();

  // Log deletion
  if (c.env.ENABLE_AUDIT_LOG === 'true') {
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
      VALUES (?, 'DELETE_EMAIL', 'email', ?)
    `).bind(userId, emailId).run();
  }

  return c.json({
    success: true,
    message: 'Email deleted successfully',
  });
});

/**
 * DELETE /api/email/batch
 * Batch delete emails
 */
app.delete('/batch', jwtAuth, async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();
  const { ids } = batchDeleteSchema.parse(body);

  if (ids.length === 0) {
    return c.json({
      success: true,
      message: 'No emails selected for deletion',
      deleted: 0,
      failed: [],
    });
  }

  // Get owned emails with their read status
  const ownedEmails = await c.env.DB.prepare(`
    SELECT e.id, e.is_read FROM emails e
    JOIN temp_emails t ON e.temp_email_id = t.id
    WHERE e.id IN (${ids.map(() => '?').join(',')})
    AND t.user_id = ?
    AND e.deleted_at IS NULL
  `).bind(...ids, userId).all<{id: number; is_read: number}>();

  const ownedIds = ownedEmails.results.map(e => e.id);
  const failedIds = ids.filter(id => !ownedIds.includes(id));

  if (ownedIds.length > 0) {
    // Count unread emails
    const unreadCount = ownedEmails.results.filter(e => e.is_read === 0).length;

    // Soft delete the emails
    await c.env.DB.prepare(`
      UPDATE emails SET deleted_at = datetime('now')
      WHERE id IN (${ownedIds.map(() => '?').join(',')})
    `).bind(...ownedIds).run();

    // Update user statistics
    await c.env.DB.prepare(`
      UPDATE user_statistics
      SET total_emails = CASE
        WHEN total_emails >= ? THEN total_emails - ?
        ELSE 0
      END,
      unread_emails = CASE
        WHEN unread_emails >= ? THEN unread_emails - ?
        ELSE 0
      END,
      updated_at = datetime('now')
      WHERE user_id = ?
    `).bind(
      ownedIds.length, ownedIds.length,
      unreadCount, unreadCount,
      userId
    ).run();

    // Log deletion
    if (c.env.ENABLE_AUDIT_LOG === 'true') {
      await c.env.DB.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, details)
        VALUES (?, 'DELETE_EMAIL_BATCH', 'email', ?)
      `).bind(userId, JSON.stringify({ count: ownedIds.length, ids: ownedIds })).run();
    }
  }

  return c.json({
    success: true,
    message: `Deleted ${ownedIds.length} emails`,
    deleted: ownedIds.length,
    failed: failedIds,
  });
});

/**
 * GET /api/email/:id/raw
 * Get raw email headers/content
 */
app.get('/:id/raw', jwtAuth, async (c) => {
  const userId = c.get('user_id');
  const emailId = parseInt(c.req.param('id'));

  if (!await verifyEmailOwnership(emailId, userId, c.env.DB)) {
    return c.json({
      success: false,
      error: 'Email not found or access denied',
      error_code: ErrorCode.EMAIL_NOT_FOUND,
    }, 404);
  }

  const email = await c.env.DB.prepare(`
    SELECT headers, raw_content FROM emails WHERE id = ?
  `).bind(emailId).first();

  // Decrypt raw_content if encrypted
  await decryptEmailFields(email, c.env.DATABASE_ENCRYPTION_KEY);

  return c.json({
    success: true,
    data: {
      headers: email?.headers ? JSON.parse(email.headers as string) : {},
      raw_content: email?.raw_content || null,
    },
  });
});

/**
 * PATCH /api/email/:id/read
 * Mark email as read
 */
app.patch('/:id/read', jwtAuth, async (c) => {
  const userId = c.get('user_id');
  const emailId = parseInt(c.req.param('id'));

  if (!await verifyEmailOwnership(emailId, userId, c.env.DB)) {
    return c.json({
      success: false,
      error: 'Email not found or access denied',
      error_code: ErrorCode.EMAIL_NOT_FOUND,
    }, 404);
  }

  await c.env.DB.prepare(`
    UPDATE emails SET is_read = 1 WHERE id = ? AND is_read = 0
  `).bind(emailId).run();

  return c.json({
    success: true,
    message: 'Email marked as read',
  });
});

export default app;
