/**
 * Admin Tiers Page
 * Tier configuration management (CRUD)
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import TierForm from '@/components/admin/TierForm';
import { TierBadge } from '@/components/TierBadge';
import ConfirmDialog from '@/components/ConfirmDialog';

interface TierConfig {
  id: number;
  tier_name: string;
  display_name: string;
  sort_order: number;
  permanent_mailbox_quota: number;
  temporary_mailbox_quota: number;
  description: string;
  is_active: boolean;
  user_count: number;
}

export default function AdminTiers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTier, setEditingTier] = useState<TierConfig | null>(null);

  // State for delete tier confirmation
  const [showDeleteTierDialog, setShowDeleteTierDialog] = useState(false);
  const [tierToDelete, setTierToDelete] = useState<TierConfig | null>(null);

  // Fetch tiers
  const { data: tiersData, isLoading } = useQuery<{ success: boolean; data: { tiers: TierConfig[] } }>({
    queryKey: ['admin', 'tiers'],
    queryFn: async () => {
      const response = await apiClient.get('/api/admin/tiers/list');
      return response as unknown as { success: boolean; data: { tiers: TierConfig[] } };
    },
  });

  // Create tier mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<TierConfig>) => {
      return apiClient.post('/api/admin/tiers/create', data);
    },
    onSuccess: () => {
      toast.success(t('admin.tiers.tierCreated'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'tiers'] });
      setShowCreateModal(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.tiers.failedToCreate'));
    },
  });

  // Update tier mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TierConfig> }) => {
      return apiClient.patch(`/api/admin/tiers/${id}/update`, data);
    },
    onSuccess: () => {
      toast.success(t('admin.tiers.tierUpdated'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'tiers'] });
      setEditingTier(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.tiers.failedToUpdate'));
    },
  });

  // Toggle tier mutation
  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiClient.patch(`/api/admin/tiers/${id}/toggle`);
    },
    onSuccess: () => {
      toast.success(t('admin.tiers.tierToggled'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'tiers'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.tiers.failedToToggle'));
    },
  });

  // Delete tier mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiClient.delete(`/api/admin/tiers/${id}`);
    },
    onSuccess: () => {
      toast.success(t('admin.tiers.tierDeleted'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'tiers'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.tiers.failedToDelete'));
    },
  });

  const handleDelete = (tier: TierConfig) => {
    if (tier.tier_name === 'basic') {
      toast.error(t('admin.tiers.cannotDeleteBasic'));
      return;
    }

    if (tier.user_count > 0) {
      toast.error(t('admin.tiers.cannotDeleteWithUsers', { count: tier.user_count }));
      return;
    }

    setTierToDelete(tier);
    setShowDeleteTierDialog(true);
  };

  const confirmDeleteTier = () => {
    if (tierToDelete) {
      deleteMutation.mutate(tierToDelete.id);
    }
    setShowDeleteTierDialog(false);
    setTierToDelete(null);
  };

  return (
    <div className="min-h-screen bg-yellow-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-black">{t('admin.tiers.title')}</h1>
            <div className="flex gap-4">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-green-300 border-4 border-neo-black rounded-lg font-bold
                         hover:shadow-neo transition-all"
              >
                + {t('admin.tiers.createNew')}
              </button>
              <Link
                to="/admin"
                className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold
                         hover:shadow-neo transition-all"
              >
                ← {t('admin.tiers.back')}
              </Link>
            </div>
          </div>
        </div>

        {/* Tiers List */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-neo-black"></div>
            <p className="mt-4 text-lg font-bold">{t('admin.tiers.loadingTiers')}</p>
          </div>
        ) : tiersData?.data.tiers && tiersData.data.tiers.length > 0 ? (
          <div className="grid grid-cols-1 gap-6">
            {tiersData.data.tiers
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((tier) => (
                <div
                  key={tier.id}
                  className={`
                    bg-white border-4 border-neo-black rounded-lg p-6
                    shadow-neo-lg
                    ${!tier.is_active ? 'opacity-60' : ''}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3">
                        <TierBadge
                          tierName={tier.tier_name}
                          displayName={tier.display_name}
                          size="md"
                        />
                        {!tier.is_active && (
                          <span className="px-3 py-1 bg-red-300 border-2 border-neo-black rounded font-bold text-sm">
                            {t('admin.tiers.inactive')}
                          </span>
                        )}
                        {tier.tier_name === 'basic' && (
                          <span className="px-3 py-1 bg-blue-300 border-2 border-neo-black rounded font-bold text-sm">
                            {t('admin.tiers.default')}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-700 mb-4">{tier.description || t('admin.tiers.noDescription')}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm font-bold text-gray-600">{t('admin.tiers.sortOrder')}</p>
                          <p className="text-xl font-black">{tier.sort_order}</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-600">{t('admin.tiers.permanentMailboxes')}</p>
                          <p className="text-xl font-black">{tier.permanent_mailbox_quota}</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-600">{t('admin.tiers.temporaryMailboxes')}</p>
                          <p className="text-xl font-black">
                            {tier.temporary_mailbox_quota === -1
                              ? '∞'
                              : tier.temporary_mailbox_quota}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-600">{t('admin.tiers.activeUsers')}</p>
                          <p className="text-xl font-black">{tier.user_count}</p>
                        </div>
                      </div>
                    </div>
                    <div className="ml-6 flex flex-col gap-2">
                      <button
                        onClick={() => setEditingTier(tier)}
                        className="px-4 py-2 bg-blue-300 border-2 border-neo-black rounded font-bold text-sm
                                 hover:shadow-neo-sm transition-all"
                      >
                        ✏️ {t('admin.tiers.edit')}
                      </button>
                      <button
                        onClick={() => toggleMutation.mutate(tier.id)}
                        disabled={tier.tier_name === 'basic'}
                        className="px-4 py-2 bg-orange-300 border-2 border-neo-black rounded font-bold text-sm
                                 hover:shadow-neo-sm transition-all
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {tier.is_active ? `🔴 ${t('admin.tiers.disable')}` : `🟢 ${t('admin.tiers.enable')}`}
                      </button>
                      <button
                        onClick={() => handleDelete(tier)}
                        disabled={tier.tier_name === 'basic' || tier.user_count > 0}
                        className="px-4 py-2 bg-red-300 border-2 border-neo-black rounded font-bold text-sm
                                 hover:shadow-neo-sm transition-all
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        🗑️ {t('admin.tiers.delete')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white border-4 border-neo-black rounded-lg">
            <p className="text-2xl font-bold">{t('admin.tiers.noTiers')}</p>
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white border-4 border-neo-black rounded-lg p-8 max-w-3xl w-full my-8 shadow-neo-lg">
              <h2 className="text-2xl font-black mb-6">{t('admin.tiers.createNewTier')}</h2>
              <TierForm
                onSubmit={(data) => createMutation.mutate(data)}
                onCancel={() => setShowCreateModal(false)}
                isSubmitting={createMutation.isPending}
              />
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingTier && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white border-4 border-neo-black rounded-lg p-8 max-w-3xl w-full my-8 shadow-neo-lg">
              <h2 className="text-2xl font-black mb-6">{t('admin.tiers.editTier', { name: t(`tierNames.${editingTier.tier_name}`, { defaultValue: editingTier.display_name }) })}</h2>
              <TierForm
                tier={editingTier}
                onSubmit={(data) => updateMutation.mutate({ id: editingTier.id, data })}
                onCancel={() => setEditingTier(null)}
                isSubmitting={updateMutation.isPending}
                isEdit
              />
            </div>
          </div>
        )}

        {/* Delete Tier Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showDeleteTierDialog}
          title={t('common.confirm')}
          message={
            tierToDelete
              ? t('admin.tiers.confirmDelete', { name: t(`tierNames.${tierToDelete.tier_name}`, { defaultValue: tierToDelete.display_name }) })
              : ''
          }
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          onConfirm={confirmDeleteTier}
          onCancel={() => {
            setShowDeleteTierDialog(false);
            setTierToDelete(null);
          }}
          isLoading={deleteMutation.isPending}
        />
      </div>
    </div>
  );
}
