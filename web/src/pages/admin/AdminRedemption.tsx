/**
 * Admin Redemption Page
 * Redemption code management and generation
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import CodeGenerator, { GenerateCodeData } from '@/components/admin/CodeGenerator';
import { TierBadge } from '@/components/TierBadge';
import ConfirmDialog from '@/components/ConfirmDialog';
import NeoSelect from '@/components/NeoSelect';

interface RedemptionCode {
  id: number;
  code: string;
  tier_id: number;
  tier_name: string;
  tier_display_name: string;
  duration_type: string;
  duration_value: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
  note: string | null;
  created_at: string;
}

interface TierConfig {
  id: number;
  tier_name: string;
  display_name: string;
}

export default function AdminRedemption() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showCodesModal, setShowCodesModal] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [tierFilter, setTierFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('');

  // State for delete code confirmation
  const [showDeleteCodeDialog, setShowDeleteCodeDialog] = useState(false);
  const [codeToDelete, setCodeToDelete] = useState<{
    id: number;
    code: string;
  } | null>(null);

  // Fetch codes
  const { data: codesData, isLoading } = useQuery<{
    success: boolean;
    data: {
      codes: RedemptionCode[];
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    };
  }>({
    queryKey: ['admin', 'redemption', 'codes', page, tierFilter, activeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (tierFilter) params.append('tier_id', tierFilter);
      if (activeFilter) params.append('is_active', activeFilter);

      const response = await apiClient.get(`/api/admin/redemption/list?${params}`);
      return response as unknown as {
        success: boolean;
        data: {
          codes: RedemptionCode[];
          total: number;
          page: number;
          limit: number;
          total_pages: number;
        };
      };
    },
  });

  // Fetch tiers
  const { data: tiersData } = useQuery<{ success: boolean; data: { tiers: TierConfig[] } }>({
    queryKey: ['admin', 'tiers'],
    queryFn: async () => {
      const response = await apiClient.get('/api/admin/tiers/list');
      return response as unknown as { success: boolean; data: { tiers: TierConfig[] } };
    },
  });

  // Generate codes mutation
  const generateMutation = useMutation({
    mutationFn: async (data: GenerateCodeData) => {
      const response = await apiClient.post('/api/admin/redemption/generate', data);
      return response as unknown as { success: boolean; data: { codes: string[] } };
    },
    onSuccess: (response) => {
      toast.success(t('admin.redemption.generated', { count: response.data.codes.length }));
      setGeneratedCodes(response.data.codes);
      setShowGenerateModal(false);
      setShowCodesModal(true);
      queryClient.invalidateQueries({ queryKey: ['admin', 'redemption'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.redemption.failedToGenerate'));
    },
  });

  // Toggle code mutation
  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiClient.patch(`/api/admin/redemption/${id}/toggle`);
    },
    onSuccess: () => {
      toast.success(t('admin.redemption.codeToggled'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'redemption'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.redemption.failedToToggle'));
    },
  });

  // Delete code mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiClient.delete(`/api/admin/redemption/${id}?confirm=true`);
    },
    onSuccess: () => {
      toast.success(t('admin.redemption.codeDeleted'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'redemption'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.redemption.failedToDelete'));
    },
  });

  const copyAllCodes = () => {
    navigator.clipboard.writeText(generatedCodes.join('\n'));
    toast.success(t('admin.redemption.allCodesCopied'));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('admin.redemption.codeCopied'));
  };

  // Handle delete code request
  const handleDeleteCode = (code: RedemptionCode) => {
    setCodeToDelete({
      id: code.id,
      code: code.code,
    });
    setShowDeleteCodeDialog(true);
  };

  // Confirm delete code
  const confirmDeleteCode = () => {
    if (codeToDelete) {
      deleteMutation.mutate(codeToDelete.id);
    }
    setShowDeleteCodeDialog(false);
    setCodeToDelete(null);
  };

  return (
    <div className="min-h-screen bg-yellow-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-black">{t('admin.redemption.title')}</h1>
            <div className="flex gap-4">
              <button
                onClick={() => setShowGenerateModal(true)}
                className="px-4 py-2 bg-green-300 border-4 border-neo-black rounded-lg font-bold
                         hover:shadow-neo transition-all"
              >
                + {t('admin.redemption.generateCodes')}
              </button>
              <Link
                to="/admin"
                className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold
                         hover:shadow-neo transition-all"
              >
                ← {t('admin.redemption.back')}
              </Link>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border-4 border-neo-black rounded-lg p-6 mb-6 shadow-neo-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-2">{t('admin.redemption.filterByTier')}</label>
              <NeoSelect
                value={tierFilter}
                onChange={(value) => {
                  setTierFilter(value as string);
                  setPage(1);
                }}
                options={[
                  { value: '', label: t('admin.redemption.allTiers') },
                  ...(tiersData?.data?.tiers?.map((tier) => ({
                    value: tier.id.toString(),
                    label: t(`tierNames.${tier.tier_name}`, { defaultValue: tier.display_name }),
                  })) || []),
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">{t('admin.redemption.filterByStatus')}</label>
              <NeoSelect
                value={activeFilter}
                onChange={(value) => {
                  setActiveFilter(value as string);
                  setPage(1);
                }}
                options={[
                  { value: '', label: t('admin.redemption.allStatuses') },
                  { value: 'true', label: t('admin.redemption.activeOnly') },
                  { value: 'false', label: t('admin.redemption.inactiveOnly') },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Results Count */}
        {codesData && (
          <div className="mb-4">
            <p className="font-bold">
              {t('admin.redemption.showing', { count: codesData.data.codes.length, total: codesData.data.total })}
            </p>
          </div>
        )}

        {/* Codes List */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-neo-black"></div>
            <p className="mt-4 text-lg font-bold">{t('admin.redemption.loadingCodes')}</p>
          </div>
        ) : codesData?.data?.codes && codesData.data.codes.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-4">
              {codesData.data.codes.map((code) => (
                <div
                  key={code.id}
                  className={`
                    bg-white border-4 border-neo-black rounded-lg p-6
                    shadow-neo
                    ${!code.is_active ? 'opacity-60' : ''}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3">
                        <button
                          onClick={() => copyToClipboard(code.code)}
                          className="text-2xl font-black font-mono bg-gray-100 px-4 py-2 border-2 border-neo-black rounded
                                   hover:bg-yellow-100 transition-colors"
                        >
                          {code.code}
                        </button>
                        {!code.is_active && (
                          <span className="px-3 py-1 bg-red-300 border-2 border-neo-black rounded font-bold text-sm">
                            {t('admin.redemption.inactive')}
                          </span>
                        )}
                        {code.expires_at && new Date(code.expires_at) <= new Date() && (
                          <span className="px-3 py-1 bg-orange-300 border-2 border-neo-black rounded font-bold text-sm">
                            {t('admin.redemption.expired')}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
                        <div>
                          <p className="text-xs font-bold text-gray-600">{t('admin.redemption.tier')}</p>
                          <TierBadge
                            tierName={code.tier_name}
                            displayName={code.tier_display_name}
                            size="sm"
                          />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-600">{t('admin.redemption.duration')}</p>
                          <p className="text-sm font-bold">
                            {code.duration_type === 'permanent'
                              ? t('admin.redemption.permanent')
                              : `${code.duration_value} ${code.duration_type}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-600">{t('admin.redemption.uses')}</p>
                          <p className="text-sm font-bold">
                            {code.used_count} / {code.max_uses === -1 ? '∞' : code.max_uses}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-600">{t('admin.redemption.expires')}</p>
                          <p className="text-sm font-bold">
                            {code.expires_at ? formatDate(code.expires_at) : t('admin.redemption.never')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-600">{t('admin.redemption.created')}</p>
                          <p className="text-sm font-bold">{formatDate(code.created_at)}</p>
                        </div>
                      </div>
                      {code.note && (
                        <p className="text-sm text-gray-600 italic">{t('admin.redemption.note')}: {code.note}</p>
                      )}
                    </div>
                    <div className="ml-6 flex gap-2">
                      <button
                        onClick={() => toggleMutation.mutate(code.id)}
                        className="px-3 py-2 bg-orange-300 border-2 border-neo-black rounded font-bold text-sm
                                 hover:shadow-neo-sm transition-all"
                        title={code.is_active ? 'Disable' : 'Enable'}
                      >
                        {code.is_active ? '🔴' : '🟢'}
                      </button>
                      <button
                        onClick={() => handleDeleteCode(code)}
                        className="px-3 py-2 bg-red-300 border-2 border-neo-black rounded font-bold text-sm
                                 hover:shadow-neo-sm transition-all"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {codesData.data.total_pages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold
                           disabled:opacity-50 disabled:cursor-not-allowed
                           hover:shadow-neo transition-all"
                >
                  ← {t('admin.redemption.previous')}
                </button>
                <span className="px-4 py-2 font-bold">
                  {t('admin.redemption.page', { current: page, total: codesData.data.total_pages })}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(codesData.data.total_pages, p + 1))}
                  disabled={page === codesData.data.total_pages}
                  className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold
                           disabled:opacity-50 disabled:cursor-not-allowed
                           hover:shadow-neo transition-all"
                >
                  {t('admin.redemption.next')} →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 bg-white border-4 border-neo-black rounded-lg">
            <p className="text-2xl font-bold">{t('admin.redemption.noCodes')}</p>
            <p className="text-gray-600 mt-2">{t('admin.redemption.getStarted')}</p>
          </div>
        )}

        {/* Generate Modal */}
        {showGenerateModal && tiersData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white border-4 border-neo-black rounded-lg p-6 max-w-3xl w-full shadow-neo-lg">
              <h2 className="text-xl font-black mb-4">{t('admin.redemption.generateModal.title')}</h2>
              <CodeGenerator
                tiers={tiersData?.data?.tiers?.filter((t) => t.id > 1) || []}
                onGenerate={(data) => generateMutation.mutate(data)}
                onCancel={() => setShowGenerateModal(false)}
                isGenerating={generateMutation.isPending}
              />
            </div>
          </div>
        )}

        {/* Generated Codes Modal */}
        {showCodesModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white border-4 border-neo-black rounded-lg p-8 max-w-2xl w-full shadow-neo-lg">
              <h2 className="text-2xl font-black mb-4">✅ {t('admin.redemption.successModal.title')}</h2>
              <p className="mb-4 text-gray-700">
                {t('admin.redemption.successModal.warning', { count: generatedCodes.length })}
              </p>
              <div className="bg-gray-100 border-4 border-neo-black rounded-lg p-4 mb-4 max-h-96 overflow-y-auto">
                {generatedCodes.map((code, index) => (
                  <div
                    key={index}
                    className="font-mono text-lg font-bold py-2 border-b-2 border-gray-300 last:border-0"
                  >
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex gap-4">
                <button
                  onClick={copyAllCodes}
                  className="flex-1 px-6 py-3 bg-blue-300 border-4 border-neo-black rounded-lg font-bold
                           hover:shadow-neo transition-all"
                >
                  📋 {t('admin.redemption.successModal.copyAll')}
                </button>
                <button
                  onClick={() => {
                    setShowCodesModal(false);
                    setGeneratedCodes([]);
                  }}
                  className="flex-1 px-6 py-3 bg-green-300 border-4 border-neo-black rounded-lg font-bold
                           hover:shadow-neo transition-all"
                >
                  {t('admin.redemption.successModal.done')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Code Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showDeleteCodeDialog}
          title={t('admin.redemption.confirmDeleteTitle')}
          message={
            codeToDelete
              ? t('admin.redemption.confirmDeleteMessage', { code: codeToDelete.code })
              : ''
          }
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          onConfirm={confirmDeleteCode}
          onCancel={() => {
            setShowDeleteCodeDialog(false);
            setCodeToDelete(null);
          }}
          isLoading={deleteMutation.isPending}
        />
      </div>
    </div>
  );
}
