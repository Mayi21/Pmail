/**
 * API Client
 * Axios instance and interceptors configuration
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import i18n from '../i18n';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
export const tokenManager = {
  getToken: (): string | null => {
    return localStorage.getItem('auth_token');
  },
  setToken: (token: string): void => {
    localStorage.setItem('auth_token', token);
  },
  removeToken: (): void => {
    localStorage.removeItem('auth_token');
  },
};

// Request interceptor
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenManager.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      const requestUrl = error.config?.url || '';

      // Check if this is a login or register request
      const isAuthRequest = requestUrl.includes('/api/auth/login') ||
                           requestUrl.includes('/api/auth/register');

      // Check if this is a redemption request
      const isRedemptionRequest = requestUrl.includes('/api/redemption');

      // Handle authentication errors
      if (status === 401) {
        // For login/register, let the component handle the error
        if (!isAuthRequest) {
          tokenManager.removeToken();
          window.location.href = '/login';
          toast.error(i18n.t('error.sessionExpired'));
        }
      } else if (status === 429) {
        // For login, let LoginPage handle lockout errors with specific details
        if (!isAuthRequest) {
          toast.error(i18n.t('error.tooManyRequests'));
        }
      } else if (status === 500) {
        toast.error(i18n.t('error.serverError'));
      } else if (data?.error) {
        // For auth and redemption requests, let the component handle specific errors
        if (!isAuthRequest && !isRedemptionRequest) {
          toast.error(data.error);
        }
      }
    } else if (error.request) {
      toast.error(i18n.t('error.networkError'));
    } else {
      toast.error(i18n.t('error.unexpected'));
    }

    return Promise.reject(error);
  }
);

export default apiClient;