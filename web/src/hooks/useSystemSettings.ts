/**
 * useSystemSettings Hook
 * 用于获取公开的系统配置
 */
import { useQuery } from '@tanstack/react-query';
import { settingsAPI } from '../api/settings';

/**
 * 获取系统配置的 Hook
 */
export function useSystemSettings() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['system', 'settings', 'public'],
    queryFn: async () => {
      const response = await settingsAPI.getPublicSettings();
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 分钟缓存
    retry: 2,
  });

  // 辅助函数：获取布尔值配置
  const getBoolean = (key: string, defaultValue: boolean = true): boolean => {
    if (!data || !data[key]) return defaultValue;
    return data[key] === 'true' || data[key] === '1';
  };

  return {
    settings: data,
    isLoading,
    error,
    // 便捷访问常用配置
    isRegistrationEnabled: getBoolean('registration_enabled', true),
    isPasswordLoginEnabled: getBoolean('password_login_enabled', true),
    getBoolean,
  };
}
