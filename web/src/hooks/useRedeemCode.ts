import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';

interface RedeemCodeRequest {
  code: string;
}

interface RedeemCodeResponse {
  success: boolean;
  message: string;
  data: {
    tier: {
      id: number;
      name: string;
      display_name: string;
      expires_at: string | null;
    };
    quota: {
      permanent_mailboxes: number;
      temporary_mailboxes: number | 'unlimited';
    };
  };
}

export function useRedeemCode() {
  const queryClient = useQueryClient();

  return useMutation<RedeemCodeResponse, Error, RedeemCodeRequest>({
    mutationFn: async ({ code }) => {
      const response = await apiClient.post('/api/redemption/redeem', { code });
      return response.data;
    },
    onSuccess: () => {
      // 立即使 user info 缓存失效，触发重新获取
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
    },
  });
}
