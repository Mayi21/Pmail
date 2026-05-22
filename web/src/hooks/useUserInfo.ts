import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/client';

export interface UserMeResponse {
  success: boolean;
  data: {
    user: {
      id: number;
      username: string;
      email: string;
      role: 'user' | 'admin';
      created_at: string;
      updated_at: string;
    };
    tier: {
      id: number;
      name: string;
      display_name: string;
      description: string;
      upgraded_at: string | null;
      expires_at: string | null;
      is_expired: boolean;
    };
    quota: {
      permanent: {
        used: number;
        limit: number;
        remaining: number;
      };
      temporary: {
        used: number;
        limit: number;
        remaining: number;
        unlimited: boolean;
      };
      total: {
        mailboxes: number;
        emails: number;
        unread_emails: number;
      };
    };
  };
}

export function useUserInfo() {
  return useQuery<UserMeResponse>({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const response = await apiClient.get('/api/user/me');
      // apiClient interceptor 已经提取了 response.data，所以这里返回的直接是 API 响应体
      return response as unknown as UserMeResponse;
    },
    staleTime: 5 * 60 * 1000, // 5分钟
    refetchInterval: 30 * 1000, // 每30秒轮询
    enabled: !!localStorage.getItem('auth_token'),
  });
}
