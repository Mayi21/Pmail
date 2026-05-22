/**
 * Dashboard Page Component
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import apiClient from '../api/client';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import MobileMenu from '../components/MobileMenu';
import NeoSelect from '../components/NeoSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import { useUserInfo } from '../hooks/useUserInfo';

interface Mailbox {
  id: number;
  address: string;
  created_at: string;
  expires_at: string | null; // null for permanent mailboxes
  email_count: number;
  unread_count: number;
  is_expired: boolean;
}

interface Domain {
  id: number;
  domain: string;
  display_name: string | null;
  is_default: number;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();
  const { data: userInfo, isLoading: isUserInfoLoading } = useUserInfo();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createOptions, setCreateOptions] = useState({
    prefix: '',
    expires_in: 3600, // 1 hour
    domain: '', // Will be set to default domain
  });
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showDeleteMailboxDialog, setShowDeleteMailboxDialog] = useState(false);
  const [mailboxToDelete, setMailboxToDelete] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Update countdown every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every 60 seconds

    return () => clearInterval(timer);
  }, []);

  // Fetch mailboxes
  const { data: mailboxes, isLoading } = useQuery<Mailbox[]>({
    queryKey: ['mailboxes'],
    queryFn: async () => {
      const response = await apiClient.get('/api/mailbox/list');
      return response.data;
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch available domains
  const { data: domainsData } = useQuery<{ success: boolean; data: { domains: Domain[] } }>({
    queryKey: ['domains'],
    queryFn: async () => {
      const response = await apiClient.get('/api/domains');
      return response as unknown as { success: boolean; data: { domains: Domain[] } };
    },
  });

  // Set default domain when domains are loaded
  useEffect(() => {
    if (domainsData?.data?.domains && createOptions.domain === '') {
      const defaultDomain = domainsData.data.domains.find(d => d.is_default === 1);
      if (defaultDomain) {
        setCreateOptions(prev => ({ ...prev, domain: defaultDomain.domain }));
      } else if (domainsData.data.domains.length > 0) {
        setCreateOptions(prev => ({ ...prev, domain: domainsData.data.domains[0].domain }));
      }
    }
  }, [domainsData, createOptions.domain]);

  // Create mailbox mutation
  const createMailbox = useMutation({
    mutationFn: async (options: typeof createOptions) => {
      // Prepare payload - only include fields with values
      const payload: any = { expires_in: options.expires_in };
      if (options.prefix && options.prefix.trim()) {
        payload.prefix = options.prefix.trim();
      }
      if (options.domain) {
        payload.domain = options.domain;
      }
      return apiClient.post('/api/mailbox/create', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
      toast.success(t('createMailbox.created'));
      setShowCreateModal(false);
      // Reset options but keep the default domain
      const defaultDomain = domainsData?.data?.domains?.find(d => d.is_default === 1)?.domain || '';
      setCreateOptions({ prefix: '', expires_in: 3600, domain: defaultDomain });
    },
  });

  // Delete mailbox mutation
  const deleteMailbox = useMutation({
    mutationFn: async (address: string) => {
      return apiClient.delete(`/api/mailbox/${address}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
      toast.success(t('createMailbox.deleted'));
    },
  });

  // Handle delete mailbox with confirmation
  const handleDeleteMailbox = (address: string) => {
    setMailboxToDelete(address);
    setShowDeleteMailboxDialog(true);
  };

  // Confirm delete mailbox action
  const confirmDeleteMailbox = () => {
    if (mailboxToDelete) {
      deleteMailbox.mutate(mailboxToDelete);
    }
    setShowDeleteMailboxDialog(false);
    setMailboxToDelete(null);
  };

  // Copy to clipboard
  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success(t('toast.copiedToClipboard'));
  };

  // Calculate time remaining
  const getTimeRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return t('dashboard.neverExpires'); // Permanent mailbox

    // Use currentTime state to ensure countdown updates when state changes
    const now = currentTime;
    // Convert SQLite format (YYYY-MM-DD HH:MM:SS) to ISO format (YYYY-MM-DDTHH:MM:SSZ)
    // This ensures consistent parsing across all browsers
    const isoFormat = expiresAt.includes('T') ? expiresAt : expiresAt.replace(' ', 'T') + 'Z';
    const expires = new Date(isoFormat).getTime();
    const diff = expires - now;

    if (diff <= 0) return t('dashboard.expired');

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m ${t('dashboard.remaining')}`;
    return `${minutes}m ${t('dashboard.remaining')}`;
  };

  return (
    <div className="min-h-screen bg-neo-warm-white bg-grain">
      {/* Header */}
      <header className="bg-white border-b-3 border-neo-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-neo-black">{t('app.title')}</h1>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <span className="text-neo-black font-medium"><span role="img" aria-label="User">👤</span> {user?.username}</span>
              <LanguageSwitcher />
              {!isUserInfoLoading && userInfo?.data?.user?.role === 'admin' && (
                <button
                  onClick={() => navigate('/admin')}
                  className="px-3 py-1.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all"
                >
                  👑 Admin
                </button>
              )}
              <button
                onClick={() => navigate('/settings')}
                className="px-3 py-1.5 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all"
              >
                ⚙️ {t('common.settings')}
              </button>
              <button
                onClick={() => {
                  useAuthStore.getState().logout();
                  navigate('/login');
                }}
                className="px-3 py-1.5 text-sm font-bold text-white bg-neo-magenta hover:bg-pink-500 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all"
              >
                {t('common.logout')}
              </button>
            </div>
            <MobileMenu>
              <span className="px-3 py-2 text-neo-black font-medium text-sm"><span role="img" aria-label="User">👤</span> {user?.username}</span>
              <div className="px-3 py-2"><LanguageSwitcher /></div>
              {!isUserInfoLoading && userInfo?.data?.user?.role === 'admin' && (
                <button
                  onClick={() => navigate('/admin')}
                  className="w-full text-left px-3 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-neo border-2 border-neo-black"
                >
                  👑 Admin
                </button>
              )}
              <button
                onClick={() => navigate('/settings')}
                className="w-full text-left px-3 py-2 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo border-2 border-neo-black"
              >
                ⚙️ {t('common.settings')}
              </button>
              <button
                onClick={() => {
                  useAuthStore.getState().logout();
                  navigate('/login');
                }}
                className="w-full text-left px-3 py-2 text-sm font-bold text-white bg-neo-magenta hover:bg-pink-500 rounded-neo border-2 border-neo-black"
              >
                {t('common.logout')}
              </button>
            </MobileMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title and Action */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-neo-black heading-neo">{t('dashboard.title')}</h2>
            <p className="text-neo-gray mt-2 font-medium">{t('dashboard.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['mailboxes'] })}
              className="btn-neo-ghost"
            >
              🔄 {t('common.refresh')}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-neo-primary"
            >
              + {t('dashboard.createNew')}
            </button>
          </div>
        </div>

        {/* Mailboxes Grid */}
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border-3 border-neo-black rounded-neo-xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="skeleton-neo h-4 w-3/4 mb-2"></div>
                    <div className="skeleton-neo h-3 w-1/2"></div>
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="skeleton-neo h-3 w-full"></div>
                  <div className="skeleton-neo h-3 w-2/3"></div>
                </div>
                <div className="flex gap-2">
                  <div className="skeleton-neo h-9 flex-1"></div>
                  <div className="skeleton-neo h-9 flex-1"></div>
                  <div className="skeleton-neo h-9 w-16"></div>
                </div>
              </div>
            ))}
          </div>
        ) : mailboxes?.length === 0 ? (
          <div className="bg-white border-3 border-neo-black rounded-neo-xl p-16 text-center">
            <svg
              className="mx-auto h-16 w-16 text-neo-gray"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
              />
            </svg>
            <h3 className="mt-6 text-xl font-bold text-neo-black">{t('dashboard.noMailboxes')}</h3>
            <p className="mt-2 text-neo-gray font-medium">{t('dashboard.noMailboxesDesc')}</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {mailboxes?.map((mailbox, index) => (
              <div
                key={mailbox.id}
                className={`card-neo animate-stagger-in ${mailbox.is_expired ? 'opacity-60' : ''}`}
                style={{ animationDelay: `${index * 0.06}s` }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-neo-black break-all">
                      {mailbox.address}
                    </h3>
                    <p className="text-xs text-neo-gray mt-1 font-medium">
                      {t('dashboard.created')} {(() => {
                        const isoFormat = mailbox.created_at.includes('T') ? mailbox.created_at : mailbox.created_at.replace(' ', 'T') + 'Z';
                        return new Date(isoFormat).toLocaleString();
                      })()}
                    </p>
                  </div>
                  {mailbox.is_expired && (
                    <span className="badge-neo bg-neo-red text-white ml-2 text-xs">
                      {t('dashboard.expired')}
                    </span>
                  )}
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-neo-black font-bold">{t('dashboard.status')}:</span>
                    <span className={`font-bold ${
                      !mailbox.expires_at ? 'text-neo-green' :
                      mailbox.is_expired ? 'text-neo-red' : 'text-neo-green'
                    }`}>
                      {getTimeRemaining(mailbox.expires_at)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neo-black font-bold">{t('dashboard.emails')}:</span>
                    <span className="font-medium tabular-nums-neo">
                      {mailbox.email_count} {t('dashboard.total')}
                      {mailbox.unread_count > 0 && (
                        <span className="ml-2 text-neo-blue font-bold">
                          ({mailbox.unread_count} {t('dashboard.unread')})
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => copyAddress(mailbox.address)}
                    className="flex-1 px-3 py-2 bg-white text-neo-black text-sm font-bold rounded-neo-lg border-3 border-neo-black hover:bg-gray-50 active:translate-x-0.5 active:translate-y-0.5 transition-all"
                  >
                    {t('common.copy')}
                  </button>
                  <button
                    onClick={() => navigate(`/mailbox/${mailbox.address}`)}
                    className="flex-1 px-3 py-2 bg-neo-cyan text-neo-black text-sm font-bold rounded-neo-lg border-3 border-neo-black hover:bg-cyan-500 active:translate-x-0.5 active:translate-y-0.5 transition-all"
                  >
                    {t('common.view')}
                  </button>
                  <button
                    onClick={() => handleDeleteMailbox(mailbox.address)}
                    disabled={deleteMailbox.isPending}
                    className="px-3 py-2 bg-neo-magenta text-white text-sm font-bold rounded-neo-lg border-3 border-neo-black hover:bg-pink-500 active:translate-x-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Mailbox Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-neo-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-3 border-neo-black rounded-neo-xl p-8 w-full max-w-md relative">
            {/* Close Button */}
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center border-3 border-neo-black rounded-full hover:bg-gray-100 font-bold text-xl active:translate-x-0.5 active:translate-y-0.5 transition-all"
              aria-label={t('common.close')}
            >
              ×
            </button>

            <h3 className="text-2xl font-bold text-neo-black mb-6">{t('createMailbox.title')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-neo-black mb-2">
                  {t('createMailbox.prefix')}
                </label>
                <input
                  type="text"
                  value={createOptions.prefix}
                  onChange={(e) => setCreateOptions({ ...createOptions, prefix: e.target.value })}
                  className="input-neo w-full"
                  placeholder={t('createMailbox.prefixPlaceholder')}
                  maxLength={10}
                  pattern="[a-z0-9]*"
                />
                <p className="text-xs text-neo-gray mt-1 font-medium">
                  {t('createMailbox.prefixHint')}
                </p>
              </div>

              {/* Domain Selection - only show if multiple domains available */}
              {domainsData?.data?.domains && domainsData.data.domains.length > 1 && (
                <div>
                  <label className="block text-sm font-bold text-neo-black mb-2">
                    {t('createMailbox.domain')}
                  </label>
                  <NeoSelect
                    value={createOptions.domain}
                    onChange={(value) => setCreateOptions({ ...createOptions, domain: String(value) })}
                    options={domainsData.data.domains.map(d => ({
                      value: d.domain,
                      label: d.display_name || d.domain,
                    }))}
                    className="w-full"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-neo-black mb-2">
                  {t('createMailbox.expiresIn')}
                </label>
                <NeoSelect
                  value={createOptions.expires_in}
                  onChange={(value) => setCreateOptions({ ...createOptions, expires_in: Number(value) })}
                  options={[
                    { value: 600, label: t('createMailbox.expiryOptions.10min') },
                    { value: 1800, label: t('createMailbox.expiryOptions.30min') },
                    { value: 3600, label: t('createMailbox.expiryOptions.1hour') },
                    { value: 7200, label: t('createMailbox.expiryOptions.2hours') },
                    { value: 21600, label: t('createMailbox.expiryOptions.6hours') },
                    { value: 43200, label: t('createMailbox.expiryOptions.12hours') },
                    { value: 86400, label: t('createMailbox.expiryOptions.24hours') },
                    { value: 0, label: t('createMailbox.expiryOptions.never') },
                  ]}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-neo-ghost flex-1"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => createMailbox.mutate(createOptions)}
                disabled={createMailbox.isPending}
                className="btn-neo-secondary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createMailbox.isPending ? t('createMailbox.creating') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Mailbox Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteMailboxDialog}
        title={t('common.confirm')}
        message={t('createMailbox.confirmDelete')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={confirmDeleteMailbox}
        onCancel={() => {
          setShowDeleteMailboxDialog(false);
          setMailboxToDelete(null);
        }}
        isLoading={deleteMailbox.isPending}
      />
    </div>
  );
}
