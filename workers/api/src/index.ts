/**
 * PMail API Worker
 * Main entry point for the API service
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { errorHandler } from './middleware/error';
import { rateLimiter } from './middleware/rateLimit';

// Import routes
import authRoutes from './routes/auth';
import mailboxRoutes from './routes/mailbox';
import emailRoutes from './routes/email';
import mailboxEmailRoutes from './routes/mailboxEmails';
import attachmentRoutes from './routes/attachment';
import healthRoutes from './routes/health';
import userRoutes from './routes/user';
import userSettingsRoutes from './routes/userSettings';
import forwardingRoutes from './routes/forwarding';
import redemptionRoutes from './routes/redemption';
import settingsRoutes from './routes/settings';
import announcementsRoutes from './routes/announcements';

// Import admin routes
import adminStatisticsRoutes from './routes/admin/statistics';
import adminUsersRoutes from './routes/admin/users';
import adminTiersRoutes from './routes/admin/tiers';
import adminRedemptionRoutes from './routes/admin/redemption';
import adminSettingsRoutes from './routes/admin/settings';
import adminBackupRoutes from './routes/admin/backup';
import adminAnnouncementsRoutes from './routes/admin/announcements';
import adminDomainsRoutes from './routes/admin/domains';

// Import public routes
import domainsRoutes from './routes/domains';

// Import scheduled tasks
import { cleanupExpiredData } from './services/cleanup';
import { checkExpiredTiers } from './services/tierExpirationService';
import { cleanupOldBackups, performDatabaseBackup } from './services/databaseBackup';

// Type definitions
export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  CACHE: KVNamespace;

  // Environment variables
  DOMAIN: string;
  FRONTEND_URL: string;
  ALLOWED_ORIGINS: string;
  JWT_SECRET: string;  // JWT 签名密钥（wrangler secret）
  ENABLE_AUDIT_LOG: string;
  MAX_MAILBOXES_PER_USER: string;
  DEFAULT_MAILBOX_TTL: string;
  MAX_MAILBOX_TTL: string;

  // Turnstile (secret key)
  TURNSTILE_SECRET_KEY: string;

  // Guest mode settings
  GUEST_MAILBOX_TTL: string;
  GUEST_CLEANUP_RETENTION: string;

  // SendGrid (for transactional emails)
  SENDGRID_API_KEY?: string;

  // Cloudflare API (for email forwarding destination management)
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;

  // Backup settings
  BACKUP_ENABLED: string;
  BACKUP_RETENTION_DAYS: string;
}

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());

// CORS configuration - handle preflight and regular requests
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];

  // Debug logging
  console.log('CORS check:', {
    origin,
    allowedOrigins,
    method: c.req.method,
    path: c.req.path,
  });

  // Check if origin is allowed
  const isAllowed = allowedOrigins.includes(origin || '') ||
    allowedOrigins.includes('*') ||
    // Allow Cloudflare Pages preview domains
    (origin && /^https:\/\/[a-z0-9]+\.temp-email[a-z0-9-]*\.pages\.dev$/.test(origin));

  // Handle preflight requests
  if (c.req.method === 'OPTIONS') {
    // Build headers object
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };
    
    if (isAllowed && origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    
    return new Response(null, { status: 204, headers });
  }

  // Set CORS headers for allowed origins on regular requests
  if (isAllowed && origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
  }

  await next();
});

// Security headers middleware
app.use('*', async (c, next) => {
  await next();

  // Add security response headers
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Permissions Policy (restrict browser features)
  c.header('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
});

// Rate limiting
app.use('*', rateLimiter());

// Error handling
app.onError(errorHandler);

// Mount routes
app.route('/health', healthRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/mailbox', mailboxRoutes);
app.route('/api/emails', mailboxEmailRoutes);
app.route('/api/email', emailRoutes);
app.route('/api/attachment', attachmentRoutes);
app.route('/api/user', userRoutes);
app.route('/api/user/settings', userSettingsRoutes);
app.route('/api/user/forwarding', forwardingRoutes);
app.route('/api/redemption', redemptionRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/announcements', announcementsRoutes);

// Mount admin routes
app.route('/api/admin/statistics', adminStatisticsRoutes);
app.route('/api/admin/users', adminUsersRoutes);
app.route('/api/admin/tiers', adminTiersRoutes);
app.route('/api/admin/redemption', adminRedemptionRoutes);
app.route('/api/admin/settings', adminSettingsRoutes);
app.route('/api/admin/backup', adminBackupRoutes);
app.route('/api/admin/domains', adminDomainsRoutes);

// Mount public routes
app.route('/api/domains', domainsRoutes);
app.route('/api/admin/announcements', adminAnnouncementsRoutes);

// Default 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Endpoint not found',
    error_code: 'NOT_FOUND',
  }, 404);
});

// Export handlers
export default {
  // HTTP request handler
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  // Scheduled tasks handler (Cron triggers)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cronType = event.cron;

    switch (cronType) {
      case '0 * * * *': // Every hour - cleanup expired data and check tier expiration
        console.log('Running hourly cleanup and tier expiration check...');
        await cleanupExpiredData(env);

        try {
          const expirationResult = await checkExpiredTiers(env.DB);
          console.log(`Tier expiration check completed: ${JSON.stringify(expirationResult)}`);
        } catch (error) {
          console.error('Error checking expired tiers:', error);
        }
        break;

      case '0 2 * * *': // Daily at 02:00 UTC - DB backup; JWT rotation when day-of-month matches rotation cadence
        console.log('Running daily database backup...');
        try {
          const backupResult = await performDatabaseBackup(env);
          if (backupResult.success) {
            console.log(`✓ Backup completed successfully: ${backupResult.backupKey}`);
            console.log(`  Total records: ${backupResult.metadata?.totalRecords}`);
            console.log(`  Tables: ${backupResult.metadata?.tables.length}`);

            const retentionDays = Number.parseInt(env.BACKUP_RETENTION_DAYS, 10);
            if (Number.isNaN(retentionDays)) {
              console.error(`Invalid BACKUP_RETENTION_DAYS value: ${env.BACKUP_RETENTION_DAYS}`);
            } else if (retentionDays > 0) {
              try {
                const deletedCount = await cleanupOldBackups(env, retentionDays);
                console.log(`✓ Backup cleanup completed: deleted ${deletedCount} old backups`);
              } catch (error) {
                console.error('Error during backup cleanup:', error);
              }
            } else {
              console.log('Backup retention cleanup skipped: retention disabled');
            }
          } else {
            console.error(`✗ Backup failed: ${backupResult.error}`);
          }
        } catch (error) {
          console.error('Error during database backup:', error);
        }

        break;

      default:
        console.log(`Unknown cron trigger: ${cronType}`);
    }
  },
};
