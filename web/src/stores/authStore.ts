/**
 * Authentication Store
 * Zustand store for auth state management
 */

import { create } from 'zustand';
import { authAPI, User } from '../api/auth';
import { tokenManager } from '../api/client';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasInitialized: boolean;
  isGuestMode: boolean; // 游客模式标识

  // Actions
  login: (username: string, password: string, turnstileToken: string) => Promise<void>;
  register: (username: string, email: string, password: string, turnstileToken: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  enterGuestMode: () => void; // 进入游客模式
  exitGuestMode: () => void; // 退出游客模式
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  hasInitialized: false,
  isGuestMode: false,

  enterGuestMode: () => {
    set({
      isGuestMode: true,
      isAuthenticated: false,
      user: null,
      hasInitialized: true,
    });
  },

  exitGuestMode: () => {
    set({
      isGuestMode: false,
      hasInitialized: false,
    });
  },

  login: async (username: string, password: string, turnstileToken: string) => {
    set({ isLoading: true });
    try {
      const response = await authAPI.login({ username, password, turnstileToken });
      tokenManager.setToken(response.data.token);
      set({
        user: response.data.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (username: string, email: string, password: string, turnstileToken: string) => {
    set({ isLoading: true });
    try {
      await authAPI.register({ username, email, password, turnstileToken });
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    tokenManager.removeToken();
    set({
      user: null,
      isAuthenticated: false,
      hasInitialized: true,
    });
  },

  checkAuth: async () => {
    const token = tokenManager.getToken();
    if (!token) {
      set({ isAuthenticated: false, user: null, hasInitialized: true });
      return;
    }

    set({ isLoading: true });
    try {
      const response = await authAPI.me();
      set({
        user: response.data,
        isAuthenticated: true,
        isLoading: false,
        hasInitialized: true,
      });
    } catch {
      tokenManager.removeToken();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        hasInitialized: true,
      });
    }
  },
}));
