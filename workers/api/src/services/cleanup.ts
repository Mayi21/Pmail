/**
 * Cleanup Service
 * Handles automatic deletion of expired data
 * Task ID: MAIL-006
 */

import type { Env } from '../index';

/**
 * Clean up expired temporary emails and related data
 */
export async function cleanupExpiredData(env: Env): Promise<void> {
  console.log('Starting cleanup of expired data...');

  try {
    // Clean up guest mailboxes first (more aggressive cleanup)
    await cleanupExpiredGuestMailboxes(env);

    // Get expired temp emails (registered users)
    const expiredEmails = await env.DB.prepare(`
      SELECT id, address, user_id FROM temp_emails
      WHERE expires_at < datetime('now')
      AND deleted_at IS NULL
      AND user_id IS NOT NULL
      LIMIT 100
    `).all<{id: number, address: string, user_id: number}>();

    console.log(`Found ${expiredEmails.results.length} expired temp emails to clean up`);

    for (const tempEmail of expiredEmails.results) {
      await cleanupPMail(tempEmail, env);
    }

    // Clean up old audit logs (keep 30 days)
    await env.DB.prepare(`
      DELETE FROM audit_logs
      WHERE created_at < datetime('now', '-30 days')
    `).run();

    // Clean up old rate limit entries from D1
    await cleanupExpiredRateLimits(env);

    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

/**
 * Clean up a specific temp email and all related data
 */
async function cleanupPMail(
  tempEmail: {id: number, address: string, user_id: number},
  env: Env
): Promise<void> {
  try {
    // Start transaction
    const batch = [];

    // Get all attachments for this temp email
    const attachments = await env.DB.prepare(`
      SELECT a.r2_key
      FROM attachments a
      JOIN emails e ON a.email_id = e.id
      WHERE e.temp_email_id = ?
    `).bind(tempEmail.id).all<{r2_key: string}>();

    // Delete attachments from R2
    for (const attachment of attachments.results) {
      try {
        await env.R2.delete(attachment.r2_key);
        console.log(`Deleted attachment: ${attachment.r2_key}`);
      } catch (error) {
        console.error(`Failed to delete attachment ${attachment.r2_key}:`, error);
      }
    }

    // Soft delete the temp email (cascade will handle related records)
    await env.DB.prepare(`
      UPDATE temp_emails
      SET deleted_at = datetime('now')
      WHERE id = ?
    `).bind(tempEmail.id).run();

    // Remove from email validation cache
    await env.CACHE?.delete(`email_valid:${tempEmail.address}`).catch(() => {});

    // Update user statistics
    await updateUserStatistics(tempEmail.user_id, env);

    // Log the cleanup
    await env.DB.prepare(`
      INSERT INTO audit_logs (
        user_id, action, entity_type, entity_id, created_at
      ) VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      tempEmail.user_id,
      'AUTO_CLEANUP',
      'temp_email',
      tempEmail.id
    ).run();

    console.log(`Cleaned up temp email: ${tempEmail.address}`);
  } catch (error) {
    console.error(`Error cleaning up temp email ${tempEmail.address}:`, error);
  }
}

/**
 * Update user statistics after cleanup
 */
async function updateUserStatistics(userId: number, env: Env): Promise<void> {
  try {
    // Count active mailboxes
    const activeCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM temp_emails
      WHERE user_id = ? AND (expires_at > datetime('now') OR expires_at IS NULL)
      AND deleted_at IS NULL
    `).bind(userId).first<{count: number}>();

    // Count total and unread emails
    const emailStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN e.is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM emails e
      JOIN temp_emails t ON e.temp_email_id = t.id
      WHERE t.user_id = ? AND t.deleted_at IS NULL
    `).bind(userId).first<{total: number, unread: number}>();

    // Update statistics
    await env.DB.prepare(`
      INSERT INTO user_statistics (
        user_id, active_mailboxes, total_emails, unread_emails, updated_at
      ) VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        active_mailboxes = ?,
        total_emails = ?,
        unread_emails = ?,
        updated_at = datetime('now')
    `).bind(
      userId,
      activeCount?.count || 0,
      emailStats?.total || 0,
      emailStats?.unread || 0,
      activeCount?.count || 0,
      emailStats?.total || 0,
      emailStats?.unread || 0
    ).run();
  } catch (error) {
    console.error('Error updating user statistics:', error);
  }
}

/**
 * Clean up expired rate limit entries from D1
 */
async function cleanupExpiredRateLimits(env: Env): Promise<void> {
  try {
    // Delete expired rate limit entries from D1
    const result = await env.DB.prepare(`
      DELETE FROM rate_limits
      WHERE expires_at < datetime('now')
    `).run();

    if (result.meta.changes > 0) {
      console.log(`Cleaned up ${result.meta.changes} expired rate limit entries`);
    }
  } catch (error) {
    // Table might not exist yet, ignore error
    console.warn('Rate limits table not available for cleanup:', error);
  }
}

/**
 * Clean up expired guest mailboxes
 * Guest mailboxes are cleaned up more aggressively than registered user mailboxes
 */
async function cleanupExpiredGuestMailboxes(env: Env): Promise<void> {
  console.log('Starting cleanup of expired guest mailboxes...');

  try {
    // Get retention period from env (default 24 hours)
    const retentionSeconds = parseInt(env.GUEST_CLEANUP_RETENTION || '86400');

    // Get expired guest mailboxes that have passed the retention period
    const expiredGuests = await env.DB.prepare(`
      SELECT id, address FROM temp_emails
      WHERE user_id IS NULL
      AND expires_at < datetime('now', '-' || ? || ' seconds')
      AND deleted_at IS NULL
      LIMIT 100
    `).bind(retentionSeconds).all<{id: number, address: string}>();

    console.log(`Found ${expiredGuests.results.length} expired guest mailboxes to clean up`);

    for (const guestMailbox of expiredGuests.results) {
      await cleanupGuestMailbox(guestMailbox, env);
    }

    console.log('Guest mailbox cleanup completed');
  } catch (error) {
    console.error('Error cleaning up guest mailboxes:', error);
  }
}

/**
 * Clean up a specific guest mailbox and all related data
 */
async function cleanupGuestMailbox(
  guestMailbox: {id: number, address: string},
  env: Env
): Promise<void> {
  try {
    // Get all emails and attachments for this guest mailbox
    const emails = await env.DB.prepare(`
      SELECT id FROM emails WHERE temp_email_id = ?
    `).bind(guestMailbox.id).all<{id: number}>();

    console.log(`Cleaning ${emails.results.length} emails for guest mailbox ${guestMailbox.address}`);

    // Get all attachments
    const attachments = await env.DB.prepare(`
      SELECT a.r2_key
      FROM attachments a
      JOIN emails e ON a.email_id = e.id
      WHERE e.temp_email_id = ?
    `).bind(guestMailbox.id).all<{r2_key: string}>();

    // Delete attachments from R2
    for (const attachment of attachments.results) {
      try {
        await env.R2.delete(attachment.r2_key);
        console.log(`Deleted attachment: ${attachment.r2_key}`);
      } catch (error) {
        console.error(`Failed to delete attachment ${attachment.r2_key}:`, error);
      }
    }

    // Delete attachments records
    await env.DB.prepare(`
      DELETE FROM attachments
      WHERE email_id IN (
        SELECT id FROM emails WHERE temp_email_id = ?
      )
    `).bind(guestMailbox.id).run();

    // Delete emails
    await env.DB.prepare(`
      DELETE FROM emails WHERE temp_email_id = ?
    `).bind(guestMailbox.id).run();

    // Delete the guest mailbox
    await env.DB.prepare(`
      DELETE FROM temp_emails WHERE id = ?
    `).bind(guestMailbox.id).run();

    // Remove from email validation cache
    await env.CACHE?.delete(`email_valid:${guestMailbox.address}`).catch(() => {});

    console.log(`Successfully cleaned up guest mailbox: ${guestMailbox.address}`);
  } catch (error) {
    console.error(`Error cleaning up guest mailbox ${guestMailbox.address}:`, error);
  }
}