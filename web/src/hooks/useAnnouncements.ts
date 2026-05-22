/**
 * 公告相关 Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';

// 类型定义
export interface Announcement {
  id: number;
  title: string;
  content: string;
  content_type: 'markdown' | 'plain';
  is_pinned: number;
  priority: number;
  is_active: number;
  created_by: number;
  creator_username?: string;
  read_count?: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface UnreadAnnouncementsResponse {
  success: boolean;
  data: {
    announcements: Announcement[];
    count: number;
  };
}

interface AnnouncementListResponse {
  success: boolean;
  data: {
    announcements: Announcement[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      total_pages: number;
      has_more: boolean;
    };
  };
}

interface CreateAnnouncementRequest {
  title: string;
  content: string;
  content_type?: 'markdown' | 'plain';
  is_pinned?: boolean;
  priority?: number;
}

interface UpdateAnnouncementRequest {
  title?: string;
  content?: string;
  content_type?: 'markdown' | 'plain';
  is_pinned?: boolean;
  priority?: number;
}

/**
 * 获取未读公告 (用户端)
 */
export function useUnreadAnnouncements(enabled: boolean = true) {
  return useQuery<Announcement[]>({
    queryKey: ['announcements', 'unread'],
    queryFn: async () => {
      const response: UnreadAnnouncementsResponse = await apiClient.get('/api/announcements/unread');
      return response.data.announcements;
    },
    enabled,
    refetchInterval: 5 * 60 * 1000, // 每 5 分钟刷新一次
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * 标记公告为已读
 */
export function useMarkAnnouncementRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (announcementId: number) => {
      return apiClient.post(`/api/announcements/${announcementId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements', 'unread'] });
    },
  });
}

/**
 * 获取公告列表 (管理端)
 */
export function useAdminAnnouncementList(
  page: number = 1,
  limit: number = 20,
  options?: { is_active?: boolean; include_deleted?: boolean }
) {
  return useQuery<AnnouncementListResponse['data']>({
    queryKey: ['admin', 'announcements', 'list', page, limit, options],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (options?.is_active !== undefined) {
        params.set('is_active', String(options.is_active));
      }
      if (options?.include_deleted) {
        params.set('include_deleted', 'true');
      }
      const response: AnnouncementListResponse = await apiClient.get(
        `/api/admin/announcements/list?${params.toString()}`
      );
      return response.data;
    },
  });
}

/**
 * 获取公告详情 (管理端)
 */
export function useAdminAnnouncementDetail(id: number) {
  return useQuery<Announcement>({
    queryKey: ['admin', 'announcements', 'detail', id],
    queryFn: async () => {
      const response = await apiClient.get(`/api/admin/announcements/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * 创建公告 (管理端)
 */
export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAnnouncementRequest) => {
      return apiClient.post('/api/admin/announcements', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
  });
}

/**
 * 更新公告 (管理端)
 */
export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateAnnouncementRequest }) => {
      return apiClient.patch(`/api/admin/announcements/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
  });
}

/**
 * 切换公告状态 (管理端)
 */
export function useToggleAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      return apiClient.patch(`/api/admin/announcements/${id}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
  });
}

/**
 * 删除公告 (管理端)
 */
export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      return apiClient.delete(`/api/admin/announcements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
  });
}
