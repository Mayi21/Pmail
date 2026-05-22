import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../index';
import { ErrorCode } from '../types';
import { jwtAuth } from '../middleware/auth';
import { ForwardingService } from '../services/forwardingService';

// @ts-ignore - Hono type compatibility
const app = new Hono<{ Bindings: Env }>();

const putSchema = z.object({
  forward_to: z.string().email().max(254),
});

const toggleSchema = z.object({
  enabled: z.boolean(),
});

interface ForwardingRow {
  forward_to: string | null;
  forward_verified: number;
  forward_verified_at: string | null;
  forward_cf_address_tag: string | null;
  forward_enabled: number;
  forward_last_error: string | null;
}

async function loadForwarding(env: Env, userId: number): Promise<ForwardingRow | null> {
  return env.DB.prepare(
    `SELECT forward_to, forward_verified, forward_verified_at,
            forward_cf_address_tag, forward_enabled, forward_last_error
     FROM user_settings WHERE user_id = ?`,
  ).bind(userId).first<ForwardingRow>();
}

async function logAudit(
  env: Env,
  userId: number,
  action: string,
  details: Record<string, unknown>,
  ip: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (user_id, action, entity_type, ip_address, details)
     VALUES (?, ?, 'forwarding', ?, ?)`,
  ).bind(userId, action, ip, JSON.stringify(details)).run();
}

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header('CF-Connecting-IP')
    || c.req.header('X-Forwarded-For')
    || c.req.header('X-Real-IP')
    || '';
}

app.get('/', jwtAuth, async (c) => {
  const userId = c.get('user_id') as number;
  const row = await loadForwarding(c.env, userId);

  return c.json({
    success: true,
    data: {
      forward_to: row?.forward_to ?? null,
      forward_verified: Boolean(row?.forward_verified),
      forward_verified_at: row?.forward_verified_at ?? null,
      forward_enabled: row ? Boolean(row.forward_enabled) : true,
      forward_last_error: row?.forward_last_error ?? null,
    },
  });
});

app.put('/', jwtAuth, async (c) => {
  const userId = c.get('user_id') as number;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({
      success: false,
      error: 'Invalid JSON body',
      error_code: ErrorCode.VALIDATION_ERROR,
    }, 400);
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: 'Validation failed',
      error_code: ErrorCode.VALIDATION_ERROR,
      details: parsed.error.errors,
    }, 400);
  }

  const target = parsed.data.forward_to.toLowerCase();
  const domain = target.split('@')[1];

  const ownDomain = await c.env.DB.prepare(
    `SELECT 1 FROM domains WHERE LOWER(domain) = ? AND is_active = 1 LIMIT 1`,
  ).bind(domain).first();
  if (ownDomain || domain === c.env.DOMAIN?.toLowerCase()) {
    return c.json({
      success: false,
      error: 'Forwarding target cannot use a domain managed by this service',
      error_code: 'FORWARDING_LOOP_FORBIDDEN',
    }, 400);
  }

  let service: ForwardingService;
  try {
    service = new ForwardingService(c.env);
  } catch {
    return c.json({
      success: false,
      error: 'Forwarding is not configured on this server',
      error_code: 'FORWARDING_NOT_CONFIGURED',
    }, 500);
  }

  const existing = await loadForwarding(c.env, userId);
  if (existing?.forward_cf_address_tag && existing.forward_to?.toLowerCase() !== target) {
    try {
      await service.deleteDestinationAddress(existing.forward_cf_address_tag);
    } catch (err) {
      console.warn('Failed to delete previous CF destination address:', err);
    }
  }

  let created;
  try {
    created = await service.createDestinationAddress(target);
  } catch (err: any) {
    return c.json({
      success: false,
      error: err?.message ?? 'Failed to create destination address',
      error_code: 'FORWARDING_CF_ERROR',
    }, 502);
  }

  const verified = created.verified ? 1 : 0;
  const verifiedAt = created.verified;

  await c.env.DB.prepare(
    `INSERT INTO user_settings (
       user_id, forward_to, forward_cf_address_tag,
       forward_verified, forward_verified_at,
       forward_enabled, forward_last_error, updated_at
     ) VALUES (?, ?, ?, ?, ?, 1, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       forward_to = excluded.forward_to,
       forward_cf_address_tag = excluded.forward_cf_address_tag,
       forward_verified = excluded.forward_verified,
       forward_verified_at = excluded.forward_verified_at,
       forward_enabled = 1,
       forward_last_error = NULL,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(userId, target, created.tag, verified, verifiedAt).run();

  await logAudit(c.env, userId, 'FORWARDING_SET', { forward_to: target, tag: created.tag }, clientIp(c));

  return c.json({
    success: true,
    data: {
      pending_verification: !created.verified,
      target,
    },
  });
});

app.post('/refresh', jwtAuth, async (c) => {
  const userId = c.get('user_id') as number;
  const row = await loadForwarding(c.env, userId);

  if (!row?.forward_cf_address_tag) {
    return c.json({
      success: false,
      error: 'No forwarding target configured',
      error_code: 'FORWARDING_NOT_SET',
    }, 400);
  }

  let service: ForwardingService;
  try {
    service = new ForwardingService(c.env);
  } catch {
    return c.json({
      success: false,
      error: 'Forwarding is not configured on this server',
      error_code: 'FORWARDING_NOT_CONFIGURED',
    }, 500);
  }

  let address;
  try {
    address = await service.getDestinationAddress(row.forward_cf_address_tag);
  } catch (err: any) {
    return c.json({
      success: false,
      error: err?.message ?? 'Failed to refresh status',
      error_code: 'FORWARDING_CF_ERROR',
    }, 502);
  }

  const verified = address.verified ? 1 : 0;
  await c.env.DB.prepare(
    `UPDATE user_settings
     SET forward_verified = ?, forward_verified_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
  ).bind(verified, address.verified, userId).run();

  return c.json({
    success: true,
    data: {
      verified: Boolean(verified),
      verified_at: address.verified,
    },
  });
});

app.patch('/toggle', jwtAuth, async (c) => {
  const userId = c.get('user_id') as number;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({
      success: false,
      error: 'Invalid JSON body',
      error_code: ErrorCode.VALIDATION_ERROR,
    }, 400);
  }

  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: 'Validation failed',
      error_code: ErrorCode.VALIDATION_ERROR,
      details: parsed.error.errors,
    }, 400);
  }

  const row = await loadForwarding(c.env, userId);
  if (!row?.forward_to) {
    return c.json({
      success: false,
      error: 'No forwarding target configured',
      error_code: 'FORWARDING_NOT_SET',
    }, 400);
  }

  const enabled = parsed.data.enabled ? 1 : 0;
  await c.env.DB.prepare(
    `UPDATE user_settings
     SET forward_enabled = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
  ).bind(enabled, userId).run();

  await logAudit(c.env, userId, 'FORWARDING_TOGGLE', { enabled: Boolean(enabled) }, clientIp(c));

  return c.json({
    success: true,
    data: { forward_enabled: Boolean(enabled) },
  });
});

app.delete('/', jwtAuth, async (c) => {
  const userId = c.get('user_id') as number;
  const row = await loadForwarding(c.env, userId);

  if (row?.forward_cf_address_tag) {
    try {
      const service = new ForwardingService(c.env);
      await service.deleteDestinationAddress(row.forward_cf_address_tag);
    } catch (err) {
      console.warn('Failed to delete CF destination address on forwarding removal:', err);
    }
  }

  await c.env.DB.prepare(
    `UPDATE user_settings
     SET forward_to = NULL,
         forward_cf_address_tag = NULL,
         forward_verified = 0,
         forward_verified_at = NULL,
         forward_last_error = NULL,
         forward_enabled = 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
  ).bind(userId).run();

  await logAudit(c.env, userId, 'FORWARDING_REMOVE', { previous_target: row?.forward_to ?? null }, clientIp(c));

  return c.json({ success: true });
});

export default app;
