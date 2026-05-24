/**
 * Authentication API
 */

import apiClient from './client';
import { z } from 'zod';
import i18n from '../i18n';

// Types
export interface User {
  id: number;
  username: string;
  email: string;
  avatar_url?: string | null;
  created_at?: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    token: string;
    user: User;
  };
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  data: {
    user_id: number;
    username: string;
    email: string;
  };
}

// Validation schemas
export const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
      i18n.t('validation.passwordRequirements')),
});

// API calls
export const authAPI = {
  login: async (data: z.infer<typeof loginSchema>): Promise<LoginResponse> => {
    return apiClient.post('/api/auth/login', data);
  },

  register: async (data: z.infer<typeof registerSchema>): Promise<RegisterResponse> => {
    return apiClient.post('/api/auth/register', data);
  },

  me: async (): Promise<any> => {
    return apiClient.get('/api/auth/me');
  },
};
