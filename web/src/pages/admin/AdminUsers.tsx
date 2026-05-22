/**
 * Admin Users Page
 * User management with search, filter, and actions
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import UserTable from '@/components/admin/UserTable';
import NeoSelect from '@/components/NeoSelect';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'user' | 'admin';
  tier_id: number;
  tier_name: string;
  tier_display_name: string;
  tier_expires_at: string | null;
  created_at: string;
  total_mailboxes: number;
  total_emails: number;
}

interface UsersResponse {
  success: boolean;
  data: {
    users: User[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      total_pages: number;
      has_more: boolean;
    };
  };
}

interface TierConfig {
  id: number;
  tier_name: string;
  display_name: string;
}

export default function AdminUsers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [upgradeTierId, setUpgradeTierId] = useState<number>(2);
  const [durationType, setDurationType] = useState<'permanent' | 'days' | 'months'>('months');
  const [durationValue, setDurationValue] = useState<number>(1);

  // Fetch users
  const { data: usersData, isLoading } = useQuery<UsersResponse>({
    queryKey: ['admin', 'users', page, search, tierFilter, roleFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (search) params.append('search', search);
      if (tierFilter) params.append('tier_id', tierFilter);
      if (roleFilter) params.append('role', roleFilter);

      const response = await apiClient.get(`/api/admin/users?${params}`);
      return response as unknown as UsersResponse;  // apiClient interceptor 已提取 response.data
    },
  });

  // Fetch tier configs for upgrade modal
  const { data: tiersData } = useQuery<{ success: boolean; data: { tiers: TierConfig[] } }>({
    queryKey: ['admin', 'tiers'],
    queryFn: async () => {
      const response = await apiClient.get('/api/admin/tiers/list');
      return response as unknown as { success: boolean; data: { tiers: TierConfig[] } };
    },
  });

  // Upgrade tier mutation
  const upgradeMutation = useMutation({
    mutationFn: async ({ userId, tierId, type, value }: {
      userId: number;
      tierId: number;
      type: string;
      value: number;
    }) => {
      return apiClient.patch(`/api/admin/users/${userId}/tier`, {
        tier_id: tierId,
        duration_type: type,
        duration_value: value,
      });
    },
    onSuccess: () => {
      toast.success(t('admin.users.userUpgraded'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setShowUpgradeModal(false);
      setSelectedUserId(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.users.failedToUpgrade'));
    },
  });

  // Change role mutation
  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: 'user' | 'admin' }) => {
      return apiClient.patch(`/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      toast.success(t('admin.users.userRoleUpdated'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.users.failedToChangeRole'));
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiClient.delete(`/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      toast.success(t('admin.users.userDeleted'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.users.failedToDelete'));
    },
  });

  const handleUpgradeTier = (userId: number) => {
    setSelectedUserId(userId);
    setShowUpgradeModal(true);
  };

  const handleSubmitUpgrade = () => {
    if (!selectedUserId) return;

    upgradeMutation.mutate({
      userId: selectedUserId,
      tierId: upgradeTierId,
      type: durationType,
      value: durationType === 'permanent' ? 0 : durationValue,
    });
  };

  return (
    <div className="min-h-screen bg-yellow-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-black">{t('admin.users.title')}</h1>
            <Link
              to="/admin"
              className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold
                       hover:shadow-neo transition-all"
            >
              ← {t('admin.users.backToDashboard')}
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border-4 border-neo-black rounded-lg p-6 mb-6 shadow-neo-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold mb-2">{t('admin.users.search')}</label>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('admin.users.searchPlaceholder')}
                className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                         focus:outline-none focus:ring-4 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">{t('admin.users.filterByRole')}</label>
              <NeoSelect
                value={roleFilter}
                onChange={(value) => {
                  setRoleFilter(value as string);
                  setPage(1);
                }}
                options={[
                  { value: '', label: t('admin.users.allRoles') },
                  { value: 'user', label: t('admin.users.user') },
                  { value: 'admin', label: t('admin.users.admin') },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">{t('admin.users.filterByTier')}</label>
              <NeoSelect
                value={tierFilter}
                onChange={(value) => {
                  setTierFilter(value as string);
                  setPage(1);
                }}
                options={[
                  { value: '', label: t('admin.users.allTiers') },
                  ...(tiersData?.data?.tiers?.map((tier) => ({
                    value: tier.id.toString(),
                    label: t(`tierNames.${tier.tier_name}`, { defaultValue: tier.display_name }),
                  })) || []),
                ]}
              />
            </div>
          </div>
        </div>

        {/* Results Count */}
        {usersData && (
          <div className="mb-4 flex items-center justify-between">
            <p className="font-bold">
              {t('admin.users.showing', { count: usersData.data.users.length, total: usersData.data.pagination.total })}
            </p>
            <p className="text-sm text-gray-600">
              {t('admin.users.page', { current: usersData.data.pagination.page, total: usersData.data.pagination.total_pages })}
            </p>
          </div>
        )}

        {/* User Table */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-neo-black"></div>
            <p className="mt-4 text-lg font-bold">{t('admin.users.loadingUsers')}</p>
          </div>
        ) : usersData?.data?.users && usersData.data.users.length > 0 ? (
          <>
            <UserTable
              users={usersData.data.users}
              onUpgradeTier={handleUpgradeTier}
              onChangeRole={(userId, role) => changeRoleMutation.mutate({ userId, role })}
              onDeleteUser={(userId) => deleteMutation.mutate(userId)}
            />

            {/* Pagination */}
            {usersData.data.pagination.total_pages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold
                           disabled:opacity-50 disabled:cursor-not-allowed
                           hover:shadow-neo transition-all"
                >
                  ← {t('admin.users.previous')}
                </button>
                <span className="px-4 py-2 font-bold">
                  {t('admin.users.page', { current: page, total: usersData.data.pagination.total_pages })}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(usersData.data.pagination.total_pages, p + 1))}
                  disabled={page === usersData.data.pagination.total_pages}
                  className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold
                           disabled:opacity-50 disabled:cursor-not-allowed
                           hover:shadow-neo transition-all"
                >
                  {t('admin.users.next')} →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 bg-white border-4 border-neo-black rounded-lg">
            <p className="text-2xl font-bold">{t('admin.users.noUsers')}</p>
            <p className="text-gray-600 mt-2">{t('admin.users.adjustFilters')}</p>
          </div>
        )}

        {/* Upgrade Modal */}
        {showUpgradeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white border-4 border-neo-black rounded-lg p-8 max-w-md w-full shadow-neo-lg">
              <h2 className="text-2xl font-black mb-4">{t('admin.users.upgradeTier')}</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-2">{t('admin.users.selectTier')}</label>
                  <NeoSelect
                    value={upgradeTierId}
                    onChange={(value) => setUpgradeTierId(Number(value))}
                    options={
                      tiersData?.data?.tiers?.map((tier) => ({
                        value: tier.id,
                        label: t(`tierNames.${tier.tier_name}`, { defaultValue: tier.display_name }),
                      })) || []
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">{t('admin.users.durationType')}</label>
                  <NeoSelect
                    value={durationType}
                    onChange={(value) => setDurationType(value as 'permanent' | 'days' | 'months')}
                    options={[
                      { value: 'permanent', label: t('admin.users.permanent') },
                      { value: 'days', label: t('admin.users.days') },
                      { value: 'months', label: t('admin.users.months') },
                    ]}
                  />
                </div>

                {durationType !== 'permanent' && (
                  <div>
                    <label className="block text-sm font-bold mb-2">
                      {t('admin.users.durationValue', { type: durationType })}
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={durationValue}
                      onChange={(e) => setDurationValue(Number(e.target.value))}
                      className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                               focus:outline-none focus:ring-4 focus:ring-blue-300"
                    />
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-4">
                <button
                  onClick={() => {
                    setShowUpgradeModal(false);
                    setSelectedUserId(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 border-4 border-neo-black rounded-lg font-bold
                           hover:shadow-neo transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSubmitUpgrade}
                  disabled={upgradeMutation.isPending}
                  className="flex-1 px-4 py-2 bg-green-300 border-4 border-neo-black rounded-lg font-bold
                           hover:shadow-neo transition-all
                           disabled:opacity-50"
                >
                  {upgradeMutation.isPending ? t('admin.users.upgrading') : t('admin.users.upgrade')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
