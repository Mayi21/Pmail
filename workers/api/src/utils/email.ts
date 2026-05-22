/**
 * Email route helper utilities
 */

/**
 * Verify that a mailbox belongs to the given user.
 */
export async function verifyMailboxOwnership(
  address: string,
  userId: number,
  db: D1Database
): Promise<number | null> {
  const result = await db.prepare(`
    SELECT id FROM temp_emails
    WHERE address = ? AND user_id = ? AND deleted_at IS NULL
  `).bind(address, userId).first<{ id: number }>();

  return result?.id || null;
}

/**
 * Verify that an email belongs to the given user.
 */
export async function verifyEmailOwnership(
  emailId: number,
  userId: number,
  db: D1Database
): Promise<boolean> {
  const result = await db.prepare(`
    SELECT 1 FROM emails e
    JOIN temp_emails t ON e.temp_email_id = t.id
    WHERE e.id = ? AND t.user_id = ?
  `).bind(emailId, userId).first();

  return result !== null;
}

/**
 * Simple HTML sanitization used when returning email bodies.
 */
export function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove on* event handlers
  html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove javascript: protocol
  html = html.replace(/javascript:/gi, '');

  // Remove data: protocol for potentially dangerous content
  html = html.replace(/data:text\/html/gi, '');

  // Remove iframe tags
  html = html.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  // Remove object and embed tags
  html = html.replace(/<(object|embed)\b[^<]*(?:(?!<\/(object|embed)>)<[^<]*)*<\/(object|embed)>/gi, '');

  return html;
}
