/**
 * Email Sending Service
 * Handles sending transactional emails (password reset, notifications, etc.)
 */

import type { Env } from '../index';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailOptions {
  to: string;
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  template?: 'password_reset' | 'welcome' | 'mailbox_expiring';
  variables?: Record<string, any>;
}

export class EmailService {
  private env: Env;
  private fromAddress: string;
  private fromName: string;

  constructor(env: Env) {
    this.env = env;
    this.fromAddress = `noreply@${env.DOMAIN}`;
    this.fromName = 'PMail';
  }

  /**
   * Send an email
   */
  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    try {
      // Generate email content from template if specified
      let emailContent: EmailTemplate;
      if (options.template) {
        emailContent = this.getTemplate(options.template, options.variables);
      } else {
        emailContent = {
          subject: options.subject,
          html: options.html || '',
          text: options.text || '',
        };
      }

      if (this.env.SENDGRID_API_KEY) {
        return await this.sendViaSendGrid(options.to, emailContent);
      }

      // Development mode: Log to console
      console.log('Email would be sent:', {
        to: options.to,
        subject: emailContent.subject,
        preview: emailContent.text.substring(0, 200),
      });

      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Send email via SendGrid API
   */
  private async sendViaSendGrid(to: string, content: EmailTemplate): Promise<boolean> {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: to }],
          }],
          from: {
            email: this.fromAddress,
            name: this.fromName,
          },
          subject: content.subject,
          content: [
            { type: 'text/plain', value: content.text },
            { type: 'text/html', value: content.html },
          ],
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('SendGrid API error:', error);
      return false;
    }
  }

  /**
   * Get email template with variables replaced
   */
  private getTemplate(templateName: string, variables?: Record<string, any>): EmailTemplate {
    const vars = variables || {};
    const baseUrl = `https://${this.env.FRONTEND_URL || this.env.DOMAIN}`;

    switch (templateName) {
      case 'password_reset':
        return {
          subject: 'Reset Your PMail Password',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Password Reset Request</h1>
                </div>
                <div class="content">
                  <p>Hi ${vars.username || 'there'},</p>

                  <p>We received a request to reset your password for your PMail account. If you didn't make this request, you can safely ignore this email.</p>

                  <p>To reset your password, click the button below:</p>

                  <div style="text-align: center;">
                    <a href="${baseUrl}/reset-password?token=${vars.token}" class="button">Reset Password</a>
                  </div>

                  <p>Or copy and paste this link into your browser:</p>
                  <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 3px;">
                    ${baseUrl}/reset-password?token=${vars.token}
                  </p>

                  <p><strong>This link will expire in 1 hour for security reasons.</strong></p>

                  <div class="footer">
                    <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
                    <p>&copy; ${new Date().getFullYear()} PMail. All rights reserved.</p>
                  </div>
                </div>
              </div>
            </body>
            </html>
          `,
          text: `
Hi ${vars.username || 'there'},

We received a request to reset your password for your PMail account. If you didn't make this request, you can safely ignore this email.

To reset your password, visit the following link:
${baseUrl}/reset-password?token=${vars.token}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, please ignore this email or contact support if you have concerns.

© ${new Date().getFullYear()} PMail. All rights reserved.
          `.trim(),
        };

      case 'welcome':
        return {
          subject: 'Welcome to PMail!',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .feature { margin: 15px 0; padding-left: 25px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Welcome to PMail!</h1>
                </div>
                <div class="content">
                  <p>Hi ${vars.username},</p>

                  <p>Thank you for joining PMail! Your account has been successfully created.</p>

                  <h3>What you can do now:</h3>
                  <div class="feature">✉️ Create temporary email addresses instantly</div>
                  <div class="feature">📥 Receive emails without revealing your real address</div>
                  <div class="feature">⏰ Set custom expiration times for your mailboxes</div>
                  <div class="feature">🔐 Secure your privacy online</div>

                  <div style="text-align: center;">
                    <a href="${baseUrl}/dashboard" class="button">Go to Dashboard</a>
                  </div>

                  <p>If you have any questions, feel free to contact our support team.</p>

                  <p>Best regards,<br>The PMail Team</p>
                </div>
              </div>
            </body>
            </html>
          `,
          text: `
Hi ${vars.username},

Thank you for joining PMail! Your account has been successfully created.

What you can do now:
- Create temporary email addresses instantly
- Receive emails without revealing your real address
- Set custom expiration times for your mailboxes
- Secure your privacy online

Visit your dashboard: ${baseUrl}/dashboard

If you have any questions, feel free to contact our support team.

Best regards,
The PMail Team
          `.trim(),
        };

      case 'mailbox_expiring':
        return {
          subject: 'Your PMail Mailbox is Expiring Soon',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #F59E0B; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .warning { background: #FEF3C7; border: 1px solid #F59E0B; padding: 15px; border-radius: 5px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>⚠️ Mailbox Expiring Soon</h1>
                </div>
                <div class="content">
                  <p>Hi ${vars.username},</p>

                  <div class="warning">
                    Your temporary mailbox <strong>${vars.address}</strong> will expire in <strong>${vars.hours_remaining} hours</strong>.
                  </div>

                  <p>After expiration:</p>
                  <ul>
                    <li>The mailbox will no longer receive new emails</li>
                    <li>Existing emails will be deleted</li>
                    <li>The address will become available for others to use</li>
                  </ul>

                  <p>If you need to keep this mailbox active, you can extend its expiration time from your dashboard.</p>

                  <div style="text-align: center;">
                    <a href="${baseUrl}/mailbox/${vars.mailbox_id}" class="button">Extend Mailbox</a>
                  </div>

                  <p>Thank you for using PMail!</p>
                </div>
              </div>
            </body>
            </html>
          `,
          text: `
Hi ${vars.username},

⚠️ Your temporary mailbox ${vars.address} will expire in ${vars.hours_remaining} hours.

After expiration:
- The mailbox will no longer receive new emails
- Existing emails will be deleted
- The address will become available for others to use

If you need to keep this mailbox active, you can extend its expiration time from your dashboard:
${baseUrl}/mailbox/${vars.mailbox_id}

Thank you for using PMail!
          `.trim(),
        };

      default:
        return {
          subject: 'PMail Notification',
          html: '<p>This is a notification from PMail.</p>',
          text: 'This is a notification from PMail.',
        };
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, username: string, token: string): Promise<boolean> {
    return await this.sendEmail({
      to: email,
      template: 'password_reset',
      variables: {
        username,
        token,
      },
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, username: string): Promise<boolean> {
    return await this.sendEmail({
      to: email,
      template: 'welcome',
      variables: {
        username,
      },
    });
  }

  /**
   * Send mailbox expiring notification
   */
  async sendMailboxExpiringEmail(
    email: string,
    username: string,
    mailboxId: number,
    address: string,
    hoursRemaining: number
  ): Promise<boolean> {
    return await this.sendEmail({
      to: email,
      template: 'mailbox_expiring',
      variables: {
        username,
        mailbox_id: mailboxId,
        address,
        hours_remaining: hoursRemaining,
      },
    });
  }
}