import apiClient from './client';

export interface ForwardingStatus {
  forward_to: string | null;
  forward_verified: boolean;
  forward_verified_at: string | null;
  forward_enabled: boolean;
  forward_last_error: string | null;
}

export interface ForwardingStatusResponse {
  success: boolean;
  data: ForwardingStatus;
}

export interface ForwardingSetResponse {
  success: boolean;
  data: {
    pending_verification: boolean;
    target: string;
  };
}

export interface ForwardingRefreshResponse {
  success: boolean;
  data: {
    verified: boolean;
    verified_at: string | null;
  };
}

export interface ForwardingToggleResponse {
  success: boolean;
  data: {
    forward_enabled: boolean;
  };
}

export interface ForwardingDeleteResponse {
  success: boolean;
}

export const forwardingAPI = {
  get: async (): Promise<ForwardingStatusResponse> => {
    return apiClient.get('/api/user/forwarding') as Promise<ForwardingStatusResponse>;
  },
  set: async (forward_to: string): Promise<ForwardingSetResponse> => {
    return apiClient.put('/api/user/forwarding', { forward_to }) as Promise<ForwardingSetResponse>;
  },
  refresh: async (): Promise<ForwardingRefreshResponse> => {
    return apiClient.post('/api/user/forwarding/refresh') as Promise<ForwardingRefreshResponse>;
  },
  toggle: async (enabled: boolean): Promise<ForwardingToggleResponse> => {
    return apiClient.patch('/api/user/forwarding/toggle', { enabled }) as Promise<ForwardingToggleResponse>;
  },
  remove: async (): Promise<ForwardingDeleteResponse> => {
    return apiClient.delete('/api/user/forwarding') as Promise<ForwardingDeleteResponse>;
  },
};
