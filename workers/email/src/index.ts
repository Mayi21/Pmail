/**
 * PMail Email Worker
 * Handles incoming emails via Cloudflare Email Routing
 */

import type { ForwardableEmailMessage } from '@cloudflare/workers-types';
import PostalMime from 'postal-mime';

// Type definitions
export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  CACHE: KVNamespace; // For active domains cache and email validation cache

  // Environment variables
  DOMAIN: string; // Fallback domain
  MAX_EMAIL_SIZE: string;
  MAX_ATTACHMENTS: string;
  MAX_ATTACHMENT_SIZE: string;
}

interface ParsedEmail {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  headers: Record<string, string>;
  attachments: ParsedAttachment[];
}

interface ParsedAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
  size: number;
}

// Main email handler
export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    console.log(`Received email from ${message.from} to ${message.to}`);

    try {
      // Check email size
      const maxSize = parseInt(env.MAX_EMAIL_SIZE) || 26214400; // 25MB default
      if (message.rawSize > maxSize) {
        console.error(`Email too large: ${message.rawSize} bytes`);
        return;
      }

      // Extract the local part of the email address
      const toAddress = message.to.toLowerCase();
      const [localPart, domain] = toAddress.split('@');

      // Verify domain is active (check cache, then database, fallback to env)
      const isDomainValid = await verifyDomain(domain, env);
      if (!isDomainValid) {
        console.error(`Invalid or inactive domain: ${domain}`);
        return;
      }

      // Quick validation from KV cache
      const isValid = await quickValidateAddress(toAddress, env);
      if (!isValid) {
        console.log(`Invalid recipient: ${toAddress}`);
        return;
      }

      // Process synchronously
      await processEmailSync(message, env);

    } catch (error) {
      console.error('Error processing email:', error);
      throw error;
    }
  },
};

// Quick validation using KV cache
async function quickValidateAddress(address: string, env: Env): Promise<boolean> {
  // First check KV cache
  const cached = await env.CACHE.get(`email_valid:${address}`);
  if (cached === 'valid') {
    return true;
  }

  // Query database (skip KV for invalid cache or cache miss)
  const result = await env.DB.prepare(`
    SELECT id FROM temp_emails
    WHERE address = ? AND (expires_at > datetime('now') OR expires_at IS NULL)
    AND deleted_at IS NULL
    LIMIT 1
  `).bind(address).first();

  const isValid = result !== null;

  // Only cache valid addresses to reduce KV writes
  // Invalid addresses go directly to DB each time (prevents spam attack exhausting KV quota)
  if (isValid) {
    await env.CACHE.put(`email_valid:${address}`, 'valid', { expirationTtl: 3600 }); // 1 hour
  }

  return isValid;
}

// Process email synchronously
async function processEmailSync(message: ForwardableEmailMessage, env: Env): Promise<void> {
  // Convert stream to string first (stream can only be read once)
  const rawContent = await streamToString(message.raw as unknown as ReadableStream);

  // Parse email
  const parsedEmail = await parseEmailFromRaw(rawContent, message);

  // Debug logging
  console.log(`Email parsed - Subject: ${parsedEmail.subject || '(none)'}`);
  console.log(`  Text length: ${parsedEmail.text?.length || 0}`);
  console.log(`  HTML length: ${parsedEmail.html?.length || 0}`);
  console.log(`  Attachments: ${parsedEmail.attachments.length}`);
  console.log(`  Raw size: ${message.rawSize} bytes`);

  // Get temp_email_id and forward settings via LEFT JOIN
  const tempEmail = await env.DB.prepare(`
    SELECT te.id, te.user_id,
           us.forward_to, us.forward_verified, us.forward_enabled
    FROM temp_emails te
    LEFT JOIN user_settings us ON us.user_id = te.user_id
    WHERE te.address = ? AND (te.expires_at > datetime('now') OR te.expires_at IS NULL)
    AND te.deleted_at IS NULL
    LIMIT 1
  `).bind(message.to.toLowerCase()).first<{
    id: number;
    user_id: number | null;
    forward_to: string | null;
    forward_verified: number | null;
    forward_enabled: number | null;
  }>();

  if (!tempEmail) {
    console.error('Temp email not found or expired');
    return;
  }

  let bodyText = parsedEmail.text || null;
  let bodyHtml = parsedEmail.html || null;
  let rawContentToStore = rawContent;

  // Start transaction for email and attachments
  const emailResult = await env.DB.prepare(`
    INSERT INTO emails (
      temp_email_id, from_email, to_email, subject,
      body_text, body_html, headers, received_at,
      size_bytes, raw_content
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
  `).bind(
    tempEmail.id,
    parsedEmail.from,
    parsedEmail.to,
    parsedEmail.subject,
    bodyText,
    bodyHtml,
    JSON.stringify(parsedEmail.headers),
    message.rawSize,
    rawContentToStore
  ).run();

  const emailId = emailResult.meta.last_row_id;
  console.log(`Email saved with ID: ${emailId}`);

  // Process attachments
  if (parsedEmail.attachments.length > 0) {
    await processAttachments(emailId as number, parsedEmail.attachments, env);
  }

  // Update user statistics (optional)
  await updateUserStats(tempEmail.id, env);

  // Forward to user's verified external address (fire-and-forget on error to avoid Cloudflare retries)
  if (
    tempEmail.forward_to &&
    tempEmail.forward_verified === 1 &&
    tempEmail.forward_enabled === 1 &&
    tempEmail.user_id !== null
  ) {
    try {
      await message.forward(tempEmail.forward_to);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      env.DB.prepare(
        `UPDATE user_settings SET forward_last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`
      ).bind(errorMsg.slice(0, 500), tempEmail.user_id).run().catch(() => {});
    }
  }
}

// Parse email using postal-mime (from raw string)
async function parseEmailFromRaw(rawEmail: string, message: ForwardableEmailMessage): Promise<ParsedEmail> {
  const parser = new PostalMime();
  const parsed = await parser.parse(rawEmail);

  // Extract headers
  const headers: Record<string, string> = {};
  for (const [key, value] of message.headers) {
    headers[key] = value;
  }

  // Process attachments
  const attachments: ParsedAttachment[] = [];
  if (parsed.attachments) {
    for (const att of parsed.attachments) {
      attachments.push({
        filename: att.filename || 'unnamed',
        content: att.content,
        contentType: att.mimeType || 'application/octet-stream',
        size: att.content.byteLength,
      });
    }
  }

  return {
    from: message.from,
    to: message.to,
    subject: parsed.subject || '(no subject)',
    text: parsed.text,
    html: parsed.html,
    headers,
    attachments,
  };
}

// Process and store attachments
async function processAttachments(
  emailId: number,
  attachments: ParsedAttachment[],
  env: Env
): Promise<void> {
  const maxAttachments = parseInt(env.MAX_ATTACHMENTS) || 10;
  const maxAttachmentSize = parseInt(env.MAX_ATTACHMENT_SIZE) || 10485760; // 10MB

  // Limit number of attachments
  const attachmentsToProcess = attachments.slice(0, maxAttachments);

  for (const att of attachmentsToProcess) {
    // Check size
    if (att.size > maxAttachmentSize) {
      console.warn(`Attachment too large: ${att.filename} (${att.size} bytes)`);
      continue;
    }

    // Generate R2 key
    const r2Key = `attachments/${emailId}/${crypto.randomUUID()}-${att.filename}`;

    // Upload to R2
    await env.R2.put(r2Key, att.content, {
      customMetadata: {
        emailId: emailId.toString(),
        filename: att.filename,
        contentType: att.contentType,
      },
    });

    // Save to database
    await env.DB.prepare(`
      INSERT INTO attachments (
        email_id, filename, r2_key, size, content_type
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      emailId,
      att.filename,
      r2Key,
      att.size,
      att.contentType
    ).run();

    console.log(`Attachment saved: ${att.filename}`);
  }
}

// Update user statistics
async function updateUserStats(tempEmailId: number, env: Env): Promise<void> {
  // Get user_id from temp_email
  const result = await env.DB.prepare(`
    SELECT user_id FROM temp_emails WHERE id = ?
  `).bind(tempEmailId).first<{user_id: number}>();

  if (!result) return;

  // Update or insert user statistics
  await env.DB.prepare(`
    INSERT INTO user_statistics (user_id, total_emails, unread_emails, last_activity)
    VALUES (?, 1, 1, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      total_emails = total_emails + 1,
      unread_emails = unread_emails + 1,
      last_activity = datetime('now'),
      updated_at = datetime('now')
  `).bind(result.user_id).run();
}

// Utility function to convert stream to string
async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(combined);
}

// Verify if domain is active
async function verifyDomain(domain: string, env: Env): Promise<boolean> {
  // First check if domain matches the fallback env.DOMAIN
  if (domain === env.DOMAIN.toLowerCase()) {
    return true;
  }

  // Try to get active domains from KV cache
  if (env.CACHE) {
    try {
      const cached = await env.CACHE.get('active_domains');
      if (cached) {
        const activeDomains: string[] = JSON.parse(cached);
        if (activeDomains.includes(domain)) {
          return true;
        }
      }
    } catch (error) {
      console.error('Error reading domain cache:', error);
    }
  }

  // Query database for active domain
  try {
    const domainRecord = await env.DB.prepare(`
      SELECT id FROM domains WHERE domain = ? AND is_active = 1
    `).bind(domain).first();

    if (domainRecord) {
      return true;
    }
  } catch (error) {
    console.error('Error querying domain from database:', error);
  }

  return false;
}