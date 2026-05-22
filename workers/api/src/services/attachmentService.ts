/**
 * Attachment Service
 * Handles attachment operations with R2 storage
 */

import { Context } from 'hono';

export interface AttachmentMetadata {
  id: number;
  email_id: number;
  filename: string;
  r2_key: string;
  size: number;
  content_type: string;
  checksum?: string;
  status: 'active' | 'deleted' | 'too_large';
  created_at: string;
}

export interface AttachmentDownloadInfo {
  url: string;
  expires_at: string;
  filename: string;
  content_type: string;
  size: number;
}

export class AttachmentService {
  private db: D1Database;
  private r2: R2Bucket;
  private kv: KVNamespace;

  constructor(db: D1Database, r2: R2Bucket, kv: KVNamespace) {
    this.db = db;
    this.r2 = r2;
    this.kv = kv;
  }

  /**
   * Get attachment metadata
   */
  async getAttachment(attachmentId: number, userId: number): Promise<AttachmentMetadata | null> {
    const result = await this.db.prepare(`
      SELECT a.*
      FROM attachments a
      JOIN emails e ON a.email_id = e.id
      JOIN temp_emails te ON e.temp_email_id = te.id
      WHERE a.id = ? AND te.user_id = ? AND a.status = 'active'
    `).bind(attachmentId, userId).first<AttachmentMetadata>();

    return result || null;
  }

  /**
   * Get attachments for an email
   */
  async getEmailAttachments(emailId: number, userId: number): Promise<AttachmentMetadata[]> {
    const results = await this.db.prepare(`
      SELECT a.*
      FROM attachments a
      JOIN emails e ON a.email_id = e.id
      JOIN temp_emails te ON e.temp_email_id = te.id
      WHERE a.email_id = ? AND te.user_id = ?
      ORDER BY a.created_at
    `).bind(emailId, userId).all<AttachmentMetadata>();

    return results.results || [];
  }

  /**
   * Generate signed download URL
   */
  async generateDownloadUrl(
    attachmentId: number,
    userId: number,
    expiresIn: number = 3600
  ): Promise<AttachmentDownloadInfo | null> {
    // Get attachment metadata
    const attachment = await this.getAttachment(attachmentId, userId);
    if (!attachment) {
      return null;
    }

    // Check cache for existing URL
    const cacheKey = `attachment_url:${attachmentId}`;
    const cached = await this.kv.get(cacheKey, 'json') as AttachmentDownloadInfo | null;

    if (cached && new Date(cached.expires_at) > new Date()) {
      return cached;
    }

    // Generate signed URL
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // For R2, we'll use a signed URL approach
    // In production, you might use Cloudflare R2's built-in signed URLs
    const signedUrl = await this.createSignedUrl(attachment.r2_key, expiresIn);

    const downloadInfo: AttachmentDownloadInfo = {
      url: signedUrl,
      expires_at: expiresAt.toISOString(),
      filename: attachment.filename,
      content_type: attachment.content_type,
      size: attachment.size,
    };

    // Cache the URL (expire slightly before actual expiry)
    await this.kv.put(
      cacheKey,
      JSON.stringify(downloadInfo),
      { expirationTtl: expiresIn - 60 }
    );

    // Log download attempt
    await this.logDownload(attachmentId, userId);

    return downloadInfo;
  }

  /**
   * Stream attachment directly
   */
  async streamAttachment(
    attachmentId: number,
    userId: number,
    c: Context
  ): Promise<Response | null> {
    const attachment = await this.getAttachment(attachmentId, userId);
    if (!attachment) {
      return null;
    }

    // Get object from R2
    const object = await this.r2.get(attachment.r2_key);
    if (!object) {
      // Mark as missing in database
      await this.db.prepare(`
        UPDATE attachments SET status = 'deleted' WHERE id = ?
      `).bind(attachmentId).run();
      return null;
    }

    // Set appropriate headers
    const headers = new Headers({
      'Content-Type': attachment.content_type,
      'Content-Disposition': `attachment; filename="${attachment.filename}"`,
      'Content-Length': attachment.size.toString(),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });

    // Add security headers for certain file types
    if (this.isPotentiallyDangerous(attachment.content_type)) {
      headers.set('Content-Security-Policy', "default-src 'none'");
      headers.set('X-Download-Options', 'noopen');
    }

    // Log download
    await this.logDownload(attachmentId, userId);

    // Return streamed response
    return new Response(object.body, {
      status: 200,
      headers,
    });
  }

  /**
   * Delete attachment
   */
  async deleteAttachment(attachmentId: number, userId: number): Promise<boolean> {
    const attachment = await this.getAttachment(attachmentId, userId);
    if (!attachment) {
      return false;
    }

    // Check if other emails use this attachment (deduplication)
    const otherUses = await this.db.prepare(`
      SELECT COUNT(*) as count
      FROM attachments
      WHERE checksum = ? AND id != ? AND status = 'active'
    `).bind(attachment.checksum || '', attachmentId).first<{count: number}>();

    // Only delete from R2 if no other references
    if (!otherUses || otherUses.count === 0) {
      try {
        await this.r2.delete(attachment.r2_key);
      } catch (error) {
        console.error('Failed to delete from R2:', error);
      }
    }

    // Mark as deleted in database
    await this.db.prepare(`
      UPDATE attachments
      SET status = 'deleted', deleted_at = datetime('now')
      WHERE id = ?
    `).bind(attachmentId).run();

    // Update user storage
    await this.updateUserStorage(userId);

    return true;
  }

  /**
   * Get attachment preview (for images)
   */
  async getPreview(
    attachmentId: number,
    userId: number,
    width: number = 200,
    height: number = 200
  ): Promise<Response | null> {
    const attachment = await this.getAttachment(attachmentId, userId);
    if (!attachment || !this.isImage(attachment.content_type)) {
      return null;
    }

    // Check if preview exists in cache
    const cacheKey = `preview:${attachmentId}:${width}x${height}`;
    const cached = await this.kv.get(cacheKey, 'arrayBuffer');

    if (cached) {
      return new Response(cached, {
        headers: {
          'Content-Type': attachment.content_type,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // For now, return the original image
    // In production, you might want to use Cloudflare Image Resizing
    const object = await this.r2.get(attachment.r2_key);
    if (!object) {
      return null;
    }

    const buffer = await object.arrayBuffer();

    // Cache the preview
    await this.kv.put(cacheKey, buffer, {
      expirationTtl: 86400, // 24 hours
    });

    return new Response(buffer, {
      headers: {
        'Content-Type': attachment.content_type,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  /**
   * Scan attachment for viruses (placeholder)
   */
  async scanAttachment(attachmentId: number): Promise<{safe: boolean; threats?: string[]}> {
    // Placeholder for virus scanning integration
    // In production, integrate with a service like VirusTotal API

    const attachment = await this.db.prepare(`
      SELECT * FROM attachments WHERE id = ?
    `).bind(attachmentId).first<AttachmentMetadata>();

    if (!attachment) {
      return { safe: false, threats: ['Attachment not found'] };
    }

    // Check file extension
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js'];
    const extension = attachment.filename.toLowerCase().substring(attachment.filename.lastIndexOf('.'));

    if (dangerousExtensions.includes(extension)) {
      return { safe: false, threats: [`Potentially dangerous file type: ${extension}`] };
    }

    // In real implementation, send to virus scanning API
    return { safe: true };
  }

  /**
   * Get user storage statistics
   */
  async getUserStorageStats(userId: number): Promise<{
    used: number;
    limit: number;
    count: number;
    percentage: number;
  }> {
    const stats = await this.db.prepare(`
      SELECT
        COALESCE(SUM(a.size), 0) as used,
        COUNT(DISTINCT a.id) as count,
        COALESCE(u.storage_quota, 104857600) as limit
      FROM users u
      LEFT JOIN temp_emails te ON te.user_id = u.id
      LEFT JOIN emails e ON e.temp_email_id = te.id
      LEFT JOIN attachments a ON a.email_id = e.id AND a.status = 'active'
      WHERE u.id = ?
      GROUP BY u.id
    `).bind(userId).first<{used: number; count: number; limit: number}>();

    if (!stats) {
      return { used: 0, limit: 104857600, count: 0, percentage: 0 };
    }

    return {
      used: stats.used,
      limit: stats.limit,
      count: stats.count,
      percentage: Math.round((stats.used / stats.limit) * 100),
    };
  }

  /**
   * Clean up expired attachments
   */
  async cleanupExpiredAttachments(daysToKeep: number = 30): Promise<number> {
    // Find attachments to delete
    const toDelete = await this.db.prepare(`
      SELECT DISTINCT a.id, a.r2_key, a.checksum
      FROM attachments a
      JOIN emails e ON a.email_id = e.id
      JOIN temp_emails te ON e.temp_email_id = te.id
      WHERE te.deleted_at < datetime('now', '-' || ? || ' days')
        OR te.expires_at < datetime('now', '-' || ? || ' days')
    `).bind(daysToKeep, daysToKeep).all<{id: number; r2_key: string; checksum: string}>();

    let deleted = 0;

    for (const attachment of toDelete.results || []) {
      // Check if other emails use this attachment
      const otherUses = await this.db.prepare(`
        SELECT COUNT(*) as count
        FROM attachments a
        JOIN emails e ON a.email_id = e.id
        JOIN temp_emails te ON e.temp_email_id = te.id
        WHERE a.checksum = ? AND a.id != ?
          AND te.deleted_at IS NULL
          AND te.expires_at > datetime('now')
          AND a.status = 'active'
      `).bind(attachment.checksum, attachment.id).first<{count: number}>();

      if (!otherUses || otherUses.count === 0) {
        try {
          await this.r2.delete(attachment.r2_key);
        } catch (error) {
          console.error(`Failed to delete ${attachment.r2_key}:`, error);
        }
      }

      // Mark as deleted in database
      await this.db.prepare(`
        UPDATE attachments
        SET status = 'deleted', deleted_at = datetime('now')
        WHERE id = ?
      `).bind(attachment.id).run();

      deleted++;
    }

    return deleted;
  }

  // Private helper methods

  private async createSignedUrl(r2Key: string, expiresIn: number): Promise<string> {
    // In production, use R2's signed URL feature
    // This is a placeholder implementation
    const baseUrl = 'https://your-r2-bucket.r2.cloudflarestorage.com';
    const timestamp = Date.now();
    const expires = timestamp + (expiresIn * 1000);

    // Generate signature (simplified - use proper signing in production)
    const signature = await this.generateSignature(`${r2Key}:${expires}`);

    return `${baseUrl}/${r2Key}?expires=${expires}&signature=${signature}`;
  }

  private async generateSignature(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private isPotentiallyDangerous(contentType: string): boolean {
    const dangerous = [
      'application/x-executable',
      'application/x-msdownload',
      'application/x-sh',
      'application/x-batch',
    ];
    return dangerous.includes(contentType);
  }

  private isImage(contentType: string): boolean {
    return contentType.startsWith('image/');
  }

  private async logDownload(attachmentId: number, userId: number): Promise<void> {
    await this.db.prepare(`
      INSERT INTO attachment_downloads (
        attachment_id, user_id, downloaded_at
      ) VALUES (?, ?, datetime('now'))
    `).bind(attachmentId, userId).run();
  }

  private async updateUserStorage(userId: number): Promise<void> {
    const usage = await this.db.prepare(`
      SELECT COALESCE(SUM(a.size), 0) as storage_used
      FROM temp_emails te
      LEFT JOIN emails e ON e.temp_email_id = te.id
      LEFT JOIN attachments a ON a.email_id = e.id AND a.status = 'active'
      WHERE te.user_id = ? AND te.deleted_at IS NULL
    `).bind(userId).first<{storage_used: number}>();

    await this.db.prepare(`
      UPDATE users
      SET storage_used = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(usage?.storage_used || 0, userId).run();
  }
}