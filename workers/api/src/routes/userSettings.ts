/**
 * User Settings Routes
 * Handles user preferences and settings management
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../index';
import { ErrorCode } from '../types';
import { jwtAuth } from '../middleware/auth';

// @ts-ignore - Hono type compatibility
const app = new Hono<{ Bindings: Env }>();

// Validation schemas
const updateSettingsSchema = z.object({
  default_mailbox_duration: z.number().int().min(600).max(86400).optional(),
  timezone: z.string().optional(),
  notifications_enabled: z.boolean().optional(),
  webhook_enabled: z.boolean().optional(),
  webhook_url: z.string().url().optional(),
  webhook_secret: z.string().optional(),
});

/**
 * GET /api/user/settings
 * Get user settings
 */
app.get('/', jwtAuth, async (c) => {
  try {
    // @ts-ignore - Context variables set by jwtAuth middleware
    const userId = c.get('user_id') as number;

    // Get user settings from database
    const settings = await c.env.DB.prepare(`
      SELECT
        default_mailbox_duration,
        timezone,
        notifications_enabled,
        webhook_enabled,
        webhook_url,
        webhook_secret
      FROM user_settings
      WHERE user_id = ?
    `).bind(userId).first();

    // If no settings exist, create default settings
    if (!settings) {
      await c.env.DB.prepare(`
        INSERT INTO user_settings (
          user_id,
          default_mailbox_duration,
          timezone,
          notifications_enabled
        ) VALUES (?, 3600, 'UTC', 0)
      `).bind(userId).run();

      return c.json({
        success: true,
        data: {
          default_mailbox_duration: 3600,
          timezone: 'UTC',
          notifications_enabled: false,
          webhook_enabled: false,
          webhook_url: null,
          webhook_secret: null,
        },
      });
    }

    return c.json({
      success: true,
      data: {
        default_mailbox_duration: settings.default_mailbox_duration,
        timezone: settings.timezone,
        notifications_enabled: Boolean(settings.notifications_enabled),
        webhook_enabled: Boolean(settings.webhook_enabled),
        webhook_url: settings.webhook_url,
        webhook_secret: settings.webhook_secret,
      },
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return c.json({
      success: false,
      error: 'Failed to get settings',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

/**
 * PATCH /api/user/settings
 * Update user settings (partial update)
 */
app.patch('/', jwtAuth, async (c) => {
  try {
    // @ts-ignore - Context variables set by jwtAuth middleware
    const userId = c.get('user_id') as number;
    const body = await c.req.json();
    const validated = updateSettingsSchema.parse(body);

    // Check if settings exist
    const existing = await c.env.DB.prepare(`
      SELECT user_id FROM user_settings WHERE user_id = ?
    `).bind(userId).first();

    if (!existing) {
      // Create default settings first
      await c.env.DB.prepare(`
        INSERT INTO user_settings (
          user_id,
          default_mailbox_duration,
          timezone,
          notifications_enabled
        ) VALUES (?, 3600, 'UTC', 0)
      `).bind(userId).run();
    }

    // Build dynamic UPDATE query
    const updates: string[] = [];
    const values: any[] = [];

    if (validated.default_mailbox_duration !== undefined) {
      updates.push('default_mailbox_duration = ?');
      values.push(validated.default_mailbox_duration);
    }
    if (validated.timezone !== undefined) {
      updates.push('timezone = ?');
      values.push(validated.timezone);
    }
    if (validated.notifications_enabled !== undefined) {
      updates.push('notifications_enabled = ?');
      values.push(validated.notifications_enabled ? 1 : 0);
    }
    if (validated.webhook_enabled !== undefined) {
      updates.push('webhook_enabled = ?');
      values.push(validated.webhook_enabled ? 1 : 0);
    }
    if (validated.webhook_url !== undefined) {
      updates.push('webhook_url = ?');
      values.push(validated.webhook_url);
    }
    if (validated.webhook_secret !== undefined) {
      updates.push('webhook_secret = ?');
      values.push(validated.webhook_secret);
    }

    // Always update updated_at
    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 1) {
      // Only updated_at, no actual changes
      return c.json({
        success: true,
        message: 'No changes to update',
      });
    }

    // Execute update
    values.push(userId);
    await c.env.DB.prepare(`
      UPDATE user_settings
      SET ${updates.join(', ')}
      WHERE user_id = ?
    `).bind(...values).run();

    // Get updated settings
    const updated = await c.env.DB.prepare(`
      SELECT
        default_mailbox_duration,
        timezone,
        notifications_enabled,
        webhook_enabled,
        webhook_url,
        webhook_secret
      FROM user_settings
      WHERE user_id = ?
    `).bind(userId).first();

    return c.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        default_mailbox_duration: updated?.default_mailbox_duration,
        timezone: updated?.timezone,
        notifications_enabled: Boolean(updated?.notifications_enabled),
        webhook_enabled: Boolean(updated?.webhook_enabled),
        webhook_url: updated?.webhook_url,
        webhook_secret: updated?.webhook_secret,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Validation failed',
        error_code: ErrorCode.VALIDATION_ERROR,
        details: error.errors,
      }, 400);
    }

    console.error('Update settings error:', error);
    return c.json({
      success: false,
      error: 'Failed to update settings',
      error_code: ErrorCode.INTERNAL_ERROR,
    }, 500);
  }
});

export default app;
