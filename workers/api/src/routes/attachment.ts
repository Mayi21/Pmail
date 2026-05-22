/**
 * Attachment Routes
 * Handles attachment download and management
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { AttachmentService } from '../services/attachmentService';

const app = new Hono();

// Validation schemas
const attachmentIdSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

const previewSchema = z.object({
  width: z.string().regex(/^\d+$/).transform(Number).optional(),
  height: z.string().regex(/^\d+$/).transform(Number).optional(),
});

/**
 * GET /attachment/:id
 * Get attachment metadata
 */
app.get('/:id', async (c) => {
  try {
    const { id } = attachmentIdSchema.parse(c.req.param());
    const userId = c.get('userId') as number;

    const service = new AttachmentService(
      c.env.DB,
      c.env.R2,
      c.env.CACHE
    );

    const attachment = await service.getAttachment(id, userId);

    if (!attachment) {
      return c.json({ error: 'Attachment not found' }, 404);
    }

    return c.json(attachment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    console.error('Get attachment error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /attachment/:id/download
 * Download attachment
 */
app.get('/:id/download', async (c) => {
  try {
    const { id } = attachmentIdSchema.parse(c.req.param());
    const userId = c.get('userId') as number;

    const service = new AttachmentService(
      c.env.DB,
      c.env.R2,
      c.env.CACHE
    );

    // Stream attachment directly
    const response = await service.streamAttachment(id, userId, c);

    if (!response) {
      return c.json({ error: 'Attachment not found' }, 404);
    }

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    console.error('Download attachment error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /attachment/:id/url
 * Get signed download URL
 */
app.get('/:id/url', async (c) => {
  try {
    const { id } = attachmentIdSchema.parse(c.req.param());
    const userId = c.get('userId') as number;
    const expiresIn = parseInt(c.req.query('expires_in') || '3600');

    if (expiresIn < 60 || expiresIn > 86400) {
      return c.json({ error: 'Invalid expiration time (60-86400 seconds)' }, 400);
    }

    const service = new AttachmentService(
      c.env.DB,
      c.env.R2,
      c.env.CACHE
    );

    const downloadInfo = await service.generateDownloadUrl(id, userId, expiresIn);

    if (!downloadInfo) {
      return c.json({ error: 'Attachment not found' }, 404);
    }

    return c.json(downloadInfo);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    console.error('Generate URL error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /attachment/:id/preview
 * Get attachment preview (for images)
 */
app.get('/:id/preview', async (c) => {
  try {
    const { id } = attachmentIdSchema.parse(c.req.param());
    const { width, height } = previewSchema.parse(c.req.query());
    const userId = c.get('userId') as number;

    const service = new AttachmentService(
      c.env.DB,
      c.env.R2,
      c.env.CACHE
    );

    const response = await service.getPreview(id, userId, width, height);

    if (!response) {
      return c.json({ error: 'Preview not available' }, 404);
    }

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    console.error('Preview error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /attachment/:id/scan
 * Scan attachment for viruses
 */
app.post('/:id/scan', async (c) => {
  try {
    const { id } = attachmentIdSchema.parse(c.req.param());
    const userId = c.get('userId') as number;

    const service = new AttachmentService(
      c.env.DB,
      c.env.R2,
      c.env.CACHE
    );

    // Verify user owns this attachment
    const attachment = await service.getAttachment(id, userId);
    if (!attachment) {
      return c.json({ error: 'Attachment not found' }, 404);
    }

    const scanResult = await service.scanAttachment(id);

    return c.json(scanResult);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    console.error('Scan error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * DELETE /attachment/:id
 * Delete attachment
 */
app.delete('/:id', async (c) => {
  try {
    const { id } = attachmentIdSchema.parse(c.req.param());
    const userId = c.get('userId') as number;

    const service = new AttachmentService(
      c.env.DB,
      c.env.R2,
      c.env.CACHE
    );

    const deleted = await service.deleteAttachment(id, userId);

    if (!deleted) {
      return c.json({ error: 'Attachment not found' }, 404);
    }

    return c.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    console.error('Delete attachment error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /attachment/email/:emailId
 * Get all attachments for an email
 */
app.get('/email/:emailId', async (c) => {
  try {
    const emailId = parseInt(c.req.param('emailId'));
    const userId = c.get('userId') as number;

    if (isNaN(emailId)) {
      return c.json({ error: 'Invalid email ID' }, 400);
    }

    const service = new AttachmentService(
      c.env.DB,
      c.env.R2,
      c.env.CACHE
    );

    const attachments = await service.getEmailAttachments(emailId, userId);

    return c.json({
      attachments,
      count: attachments.length,
    });
  } catch (error) {
    console.error('Get email attachments error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /attachment/storage/stats
 * Get user storage statistics
 */
app.get('/storage/stats', async (c) => {
  try {
    const userId = c.get('userId') as number;

    const service = new AttachmentService(
      c.env.DB,
      c.env.R2,
      c.env.CACHE
    );

    const stats = await service.getUserStorageStats(userId);

    return c.json(stats);
  } catch (error) {
    console.error('Get storage stats error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /attachment/cleanup
 * Clean up expired attachments (admin only)
 */
app.post('/cleanup', async (c) => {
  try {
    // Check if user is admin
    const isAdmin = c.get('isAdmin') as boolean;
    if (!isAdmin) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const daysToKeep = parseInt(c.req.query('days') || '30');

    const service = new AttachmentService(
      c.env.DB,
      c.env.R2,
      c.env.CACHE
    );

    const deleted = await service.cleanupExpiredAttachments(daysToKeep);

    return c.json({
      message: 'Cleanup completed',
      deleted_count: deleted,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;