/**
 * Email API client
 */

import apiClient from './client';
import { z } from 'zod';

// Validation schemas
export const attachmentSchema = z.object({
  id: z.number(),
  filename: z.string(),
  content_type: z.string(),
  size_bytes: z.number(),
});

export const emailSchema = z.object({
  id: z.number(),
  mailbox_id: z.number(),
  from_address: z.string(),
  from_name: z.string().optional(),
  to_address: z.string(),
  subject: z.string(),
  body_text: z.string().optional(),
  body_html: z.string().optional(),
  headers: z.record(z.string()),
  is_read: z.boolean(),
  has_attachments: z.boolean(),
  received_at: z.string(),
  size_bytes: z.number(),
  attachments: z.array(attachmentSchema).optional(),
});

export const emailListResponseSchema = z.object({
  emails: z.array(emailSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

// Types
export type Email = z.infer<typeof emailSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type EmailListResponse = z.infer<typeof emailListResponseSchema>;

// API functions
export const emailAPI = {
  // Get list of emails for a mailbox
  list: (address: string, params?: {
    page?: number;
    limit?: number;
    search?: string;
    unread_only?: boolean;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.search) searchParams.append('search', params.search);
    if (params?.unread_only) searchParams.append('unread_only', 'true');

    return apiClient.get<EmailListResponse>(`/emails/${address}?${searchParams}`);
  },

  // Get email details
  get: (id: number) => {
    return apiClient.get<Email>(`/email/${id}`);
  },

  // Mark email as read
  markAsRead: (id: number) => {
    return apiClient.patch(`/email/${id}/read`);
  },

  // Mark email as unread
  markAsUnread: (id: number) => {
    return apiClient.patch(`/email/${id}/unread`);
  },

  // Delete email
  delete: (id: number) => {
    return apiClient.delete(`/email/${id}`);
  },

  // Bulk delete emails
  bulkDelete: (emailIds: number[]) => {
    return apiClient.delete('/email/batch', {
      data: { ids: emailIds },
    });
  },

  // Bulk mark as read
  bulkMarkAsRead: (emailIds: number[]) => {
    return apiClient.post('/email/bulk-read', { email_ids: emailIds });
  },

  // Get raw email content
  getRaw: (id: number) => {
    return apiClient.get<{ raw_content: string }>(`/email/${id}/raw`);
  },

  // Search emails across all mailboxes
  search: (query: string, params?: {
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
    subject?: string;
    date_from?: string;
    date_to?: string;
  }) => {
    const searchParams = new URLSearchParams({ q: query });
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.from) searchParams.append('from', params.from);
    if (params?.to) searchParams.append('to', params.to);
    if (params?.subject) searchParams.append('subject', params.subject);
    if (params?.date_from) searchParams.append('date_from', params.date_from);
    if (params?.date_to) searchParams.append('date_to', params.date_to);

    return apiClient.get<EmailListResponse>(`/email/search?${searchParams}`);
  },

  // Download attachment
  downloadAttachment: (attachmentId: number) => {
    return apiClient.get(`/attachment/${attachmentId}/download`, {
      responseType: 'blob',
    });
  },

  // Get attachment info
  getAttachment: (attachmentId: number) => {
    return apiClient.get<Attachment>(`/attachment/${attachmentId}`);
  },
};
