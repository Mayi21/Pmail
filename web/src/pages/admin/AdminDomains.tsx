/**
 * Admin Domains Page
 * Domain configuration management (CRUD)
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import DomainForm from '@/components/admin/DomainForm';
import ConfirmDialog from '@/components/ConfirmDialog';

interface DomainConfig {
  id: number;
  domain: string;
  display_name: string;
  sort_order: number;
  description: string;
  is_active: boolean;
  is_default: boolean;
  mx_verified: boolean;
  mailbox_count: number;
  created_at: string;
}

export default function AdminDomains() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDomain, setEditingDomain] = useState<DomainConfig | null>(null);

  // State for delete confirmation
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<DomainConfig | null>(null);

  // Fetch domains
  const { data: domainsData, isLoading } = useQuery<{ success: boolean; data: { domains: DomainConfig[] } }>({
    queryKey: ['admin', 'domains'],
    queryFn: async () => {
      const response = await apiClient.get('/api/admin/domains/list');
      return response as unknown as { success: boolean; data: { domains: DomainConfig[] } };
    },
  });

  // Create domain mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<DomainConfig>) => {
      return apiClient.post('/api/admin/domains/create', data);
    },
    onSuccess: () => {
      toast.success(t('admin.domains.domainCreated'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
      setShowCreateModal(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.domains.failedToCreate'));
    },
  });

  // Update domain mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<DomainConfig> }) => {
      return apiClient.patch(`/api/admin/domains/${id}/update`, data);
    },
    onSuccess: () => {
      toast.success(t('admin.domains.domainUpdated'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
      setEditingDomain(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.domains.failedToUpdate'));
    },
  });

  // Toggle domain mutation
  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiClient.patch(`/api/admin/domains/${id}/toggle`);
    },
    onSuccess: () => {
      toast.success(t('admin.domains.domainToggled'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.domains.failedToToggle'));
    },
  });

  // Set default domain mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiClient.patch(`/api/admin/domains/${id}/set-default`);
    },
    onSuccess: () => {
      toast.success(t('admin.domains.defaultSet'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.domains.failedToSetDefault'));
    },
  });

  // Delete domain mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiClient.delete(`/api/admin/domains/${id}`);
    },
    onSuccess: () => {
      toast.success(t('admin.domains.domainDeleted'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.domains.failedToDelete'));
    },
  });

  const handleDelete = (domain: DomainConfig) => {
    if (domain.is_default) {
      toast.error(t('admin.domains.cannotDeleteDefault'));
      return;
    }

    if (domain.mailbox_count > 0) {
      toast.error(t('admin.domains.cannotDeleteWithMailboxes', { count: domain.mailbox_count }));
      return;
    }

    setDomainToDelete(domain);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (domainToDelete) {
      deleteMutation.mutate(domainToDelete.id);
    }
    setShowDeleteDialog(false);
    setDomainToDelete(null);
  };

  return (
    <div className="min-h-screen bg-yellow-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-black">{t('admin.domains.title')}</h1>
            <div className="flex gap-4">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-green-300 border-4 border-neo-black rounded-lg font-bold
                         hover:shadow-neo transition-all"
              >
                + {t('admin.domains.addDomain')}
              </button>
              <Link
                to="/admin"
                className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold
                         hover:shadow-neo transition-all"
              >
                ← {t('common.back')}
              </Link>
            </div>
          </div>
          <p className="text-gray-600">{t('admin.domains.subtitle')}</p>
        </div>

        {/* Domains List */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-neo-black"></div>
            <p className="mt-4 text-lg font-bold">{t('common.loading')}</p>
          </div>
        ) : domainsData?.data.domains && domainsData.data.domains.length > 0 ? (
          <div className="grid grid-cols-1 gap-6">
            {domainsData.data.domains
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((domain) => (
                <div
                  key={domain.id}
                  className={`
                    bg-white border-4 border-neo-black rounded-lg p-6
                    shadow-neo-lg
                    ${!domain.is_active ? 'opacity-60' : ''}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3">
                        <h3 className="text-2xl font-black">{domain.domain}</h3>
                        {domain.is_default && (
                          <span className="px-3 py-1 bg-yellow-300 border-2 border-neo-black rounded font-bold text-sm">
                            {t('admin.domains.default')}
                          </span>
                        )}
                        {!domain.is_active && (
                          <span className="px-3 py-1 bg-red-300 border-2 border-neo-black rounded font-bold text-sm">
                            {t('admin.domains.inactive')}
                          </span>
                        )}
                      </div>
                      {domain.display_name && domain.display_name !== domain.domain && (
                        <p className="text-gray-600 mb-2">{domain.display_name}</p>
                      )}
                      {domain.description && (
                        <p className="text-gray-500 text-sm mb-4">{domain.description}</p>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm font-bold text-gray-600">{t('admin.domains.sortOrder')}</p>
                          <p className="text-xl font-black">{domain.sort_order}</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-600">{t('admin.domains.mailboxes')}</p>
                          <p className="text-xl font-black">{domain.mailbox_count}</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-600">{t('admin.domains.createdAt')}</p>
                          <p className="text-sm font-bold">
                            {new Date(domain.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="ml-6 flex flex-col gap-2">
                      <button
                        onClick={() => setEditingDomain(domain)}
                        className="px-4 py-2 bg-blue-300 border-2 border-neo-black rounded font-bold text-sm
                                 hover:shadow-neo-sm transition-all"
                      >
                        {t('common.edit')}
                      </button>
                      {!domain.is_default && (
                        <button
                          onClick={() => setDefaultMutation.mutate(domain.id)}
                          disabled={!domain.is_active}
                          className="px-4 py-2 bg-yellow-300 border-2 border-neo-black rounded font-bold text-sm
                                   hover:shadow-neo-sm transition-all
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('admin.domains.setDefault')}
                        </button>
                      )}
                      <button
                        onClick={() => toggleMutation.mutate(domain.id)}
                        disabled={domain.is_default && domain.is_active}
                        className="px-4 py-2 bg-orange-300 border-2 border-neo-black rounded font-bold text-sm
                                 hover:shadow-neo-sm transition-all
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {domain.is_active ? t('admin.domains.disable') : t('admin.domains.enable')}
                      </button>
                      <button
                        onClick={() => handleDelete(domain)}
                        disabled={domain.is_default || domain.mailbox_count > 0}
                        className="px-4 py-2 bg-red-300 border-2 border-neo-black rounded font-bold text-sm
                                 hover:shadow-neo-sm transition-all
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white border-4 border-neo-black rounded-lg">
            <p className="text-2xl font-bold mb-4">{t('admin.domains.noDomains')}</p>
            <p className="text-gray-600 mb-6">{t('admin.domains.noDomainsDesc')}</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-green-300 border-4 border-neo-black rounded-lg font-bold
                       hover:shadow-neo transition-all"
            >
              + {t('admin.domains.addFirstDomain')}
            </button>
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white border-4 border-neo-black rounded-lg p-8 max-w-3xl w-full my-8 shadow-neo-lg">
              <h2 className="text-2xl font-black mb-6">{t('admin.domains.addNewDomain')}</h2>
              <DomainForm
                onSubmit={(data) => createMutation.mutate(data)}
                onCancel={() => setShowCreateModal(false)}
                isSubmitting={createMutation.isPending}
              />
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingDomain && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white border-4 border-neo-black rounded-lg p-8 max-w-3xl w-full my-8 shadow-neo-lg">
              <h2 className="text-2xl font-black mb-6">
                {t('admin.domains.editDomain', { domain: editingDomain.domain })}
              </h2>
              <DomainForm
                domain={editingDomain}
                onSubmit={(data) => updateMutation.mutate({ id: editingDomain.id, data })}
                onCancel={() => setEditingDomain(null)}
                isSubmitting={updateMutation.isPending}
                isEdit
              />
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showDeleteDialog}
          title={t('common.confirm')}
          message={
            domainToDelete
              ? t('admin.domains.confirmDelete', { domain: domainToDelete.domain })
              : ''
          }
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteDialog(false);
            setDomainToDelete(null);
          }}
          isLoading={deleteMutation.isPending}
        />
      </div>
    </div>
  );
}
