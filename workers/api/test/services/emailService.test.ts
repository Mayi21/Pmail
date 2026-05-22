/**
 * Email Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../../src/services/emailService';
import { mockEnv } from '../setup';

global.fetch = vi.fn();

function envWithSendGrid() {
  return { ...mockEnv, SENDGRID_API_KEY: 'test-sendgrid-key' };
}

function mockSendGridOk() {
  (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 202 });
}

function getSendGridBody(): any {
  const call = (global.fetch as any).mock.calls.at(-1);
  return JSON.parse(call[1].body);
}

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    emailService = new EmailService(envWithSendGrid());
    vi.clearAllMocks();
  });

  describe('sendEmail', () => {
    it('should send email via SendGrid when API key is configured', async () => {
      mockSendGridOk();

      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test Email',
        text: 'This is a test email',
        html: '<p>This is a test email</p>',
      });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-sendgrid-key',
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should fall back to console (returning true) when no SendGrid key is set', async () => {
      const dev = new EmailService(mockEnv);
      const result = await dev.sendEmail({
        to: 'test@example.com',
        subject: 'Test Email',
        text: 'This is a test email',
      });

      expect(result).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return false when SendGrid responds with non-ok', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test Email',
        text: 'This will fail',
      });

      expect(result).toBe(false);
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email with correct template', async () => {
      mockSendGridOk();

      const result = await emailService.sendPasswordResetEmail(
        'test@example.com',
        'testuser',
        'reset-token-123'
      );

      expect(result).toBe(true);

      const body = getSendGridBody();
      expect(body.personalizations[0].to[0].email).toBe('test@example.com');
      expect(body.subject).toBe('Reset Your PMail Password');

      const htmlPart = body.content.find((c: any) => c.type === 'text/html').value;
      const textPart = body.content.find((c: any) => c.type === 'text/plain').value;
      expect(htmlPart).toContain('reset-token-123');
      expect(textPart).toContain('reset-token-123');
    });

    it('should include username in password reset email', async () => {
      mockSendGridOk();

      await emailService.sendPasswordResetEmail(
        'test@example.com',
        'testuser',
        'reset-token-123'
      );

      const body = getSendGridBody();
      const htmlPart = body.content.find((c: any) => c.type === 'text/html').value;
      const textPart = body.content.find((c: any) => c.type === 'text/plain').value;
      expect(htmlPart).toContain('testuser');
      expect(textPart).toContain('testuser');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email with correct template', async () => {
      mockSendGridOk();

      const result = await emailService.sendWelcomeEmail(
        'test@example.com',
        'newuser'
      );

      expect(result).toBe(true);

      const body = getSendGridBody();
      expect(body.personalizations[0].to[0].email).toBe('test@example.com');
      expect(body.subject).toBe('Welcome to PMail!');

      const htmlPart = body.content.find((c: any) => c.type === 'text/html').value;
      const textPart = body.content.find((c: any) => c.type === 'text/plain').value;
      expect(htmlPart).toContain('newuser');
      expect(textPart).toContain('newuser');
    });
  });

  describe('sendMailboxExpiringEmail', () => {
    it('should send mailbox expiring notification with correct data', async () => {
      mockSendGridOk();

      const result = await emailService.sendMailboxExpiringEmail(
        'test@example.com',
        'testuser',
        123,
        'temp123@test.com',
        2
      );

      expect(result).toBe(true);

      const body = getSendGridBody();
      expect(body.personalizations[0].to[0].email).toBe('test@example.com');
      expect(body.subject).toBe('Your PMail Mailbox is Expiring Soon');

      const htmlPart = body.content.find((c: any) => c.type === 'text/html').value;
      const textPart = body.content.find((c: any) => c.type === 'text/plain').value;
      expect(htmlPart).toContain('temp123@test.com');
      expect(textPart).toContain('2 hours');
    });

    it('should include mailbox link in expiring notification', async () => {
      mockSendGridOk();

      await emailService.sendMailboxExpiringEmail(
        'test@example.com',
        'testuser',
        456,
        'temp456@test.com',
        1
      );

      const body = getSendGridBody();
      const htmlPart = body.content.find((c: any) => c.type === 'text/html').value;
      expect(htmlPart).toContain('/mailbox/456');
    });
  });

  describe('Template Generation', () => {
    it('should generate both HTML and text content for templates', async () => {
      mockSendGridOk();

      await emailService.sendPasswordResetEmail(
        'test@example.com',
        'testuser',
        'token123'
      );

      const body = getSendGridBody();
      const htmlPart = body.content.find((c: any) => c.type === 'text/html').value;
      const textPart = body.content.find((c: any) => c.type === 'text/plain').value;

      expect(htmlPart).toBeTruthy();
      expect(textPart).toBeTruthy();
      expect(htmlPart).toContain('<!DOCTYPE html>');
      expect(htmlPart).toContain('<html>');
      expect(htmlPart).toContain('<body>');
      expect(textPart).not.toMatch(/<[a-zA-Z]/);
    });
  });
});
