/**
 * Settings API
 * 系统配置 API
 */
import apiClient from './client';

export interface PublicSettings {
  registration_enabled?: string;
  password_login_enabled?: string;
  [key: string]: string | undefined;
}

export interface PublicSettingsResponse {
  success: boolean;
  data: PublicSettings;
  error?: string;
}

export const settingsAPI = {
  /**
   * 获取公开的系统配置
   */
  getPublicSettings: async (): Promise<PublicSettingsResponse> => {
    return apiClient.get('/api/settings/public') as Promise<PublicSettingsResponse>;
  },
};
