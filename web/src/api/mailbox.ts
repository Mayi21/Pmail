/**
 * Mailbox API client
 */

import apiClient from './client';
import { z } from 'zod';

// Validation schemas
export const createMailboxSchema = z.object({
  prefix: z.string().max(10).regex(/^[a-z0-9]+$/).optional(),
  expires_in: z.number().min(60).max(86400),
});

export const mailboxSchema = z.object({
  id: z.number(),
  address: z.string().email(),
  created_at: z.string(),
  expires_at: z.string(),
  email_count: z.number(),
  unread_count: z.number(),
  is_expired: z.boolean(),
});

// Types
export type CreateMailboxData = z.infer<typeof createMailboxSchema>;
export type Mailbox = z.infer<typeof mailboxSchema>;

// API functions
export const mailboxAPI = {
  // Create a new mailbox
  create: (data: CreateMailboxData) => {
    return apiClient.post<Mailbox>('/mailbox/create', data);
  },

  // Get list of mailboxes
  list: () => {
    return apiClient.get<Mailbox[]>('/mailbox/list');
  },

  // Get mailbox details
  get: (address: string) => {
    return apiClient.get<Mailbox>(`/mailbox/${address}`);
  },

  // Delete a mailbox
  delete: (address: string) => {
    return apiClient.delete(`/mailbox/${address}`);
  },

  // Check if address is available
  checkAvailability: (address: string) => {
    return apiClient.get<{ available: boolean }>(`/mailbox/check/${address}`);
  },

  // Extend mailbox expiry
  extend: (address: string, duration: number) => {
    return apiClient.patch<Mailbox>(`/mailbox/${address}/extend`, { duration });
  },
};
