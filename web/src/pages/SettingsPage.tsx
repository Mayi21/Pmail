/**
 * Settings Page - User profile, tier and preferences
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import apiClient from '../api/client';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from '../utils/date';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import MobileMenu from '../components/MobileMenu';
import NeoSelect from '../components/NeoSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import { TierBadge } from '../components/TierBadge';
import { QuotaProgressBar } from '../components/QuotaProgressBar';
import { TierExpirationCountdown } from '../components/TierExpirationCountdown';
import { RedeemCodeModal } from '../components/RedeemCodeModal';
import { useUserInfo } from '../hooks/useUserInfo';
import { forwardingAPI, ForwardingStatus } from '../api/forwarding';

interface UserSettings {
  default_mailbox_duration: number;
  timezone: string;
  notifications_enabled: boolean;
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'forwarding'>('profile');
  const [forwardingInput, setForwardingInput] = useState('');
  const [isEditingForwarding, setIsEditingForwarding] = useState(false);
  const [showDisableForwardingDialog, setShowDisableForwardingDialog] = useState(false);
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);

  // Fetch user info with tier and quota
  const { data: userInfo, isLoading: userInfoLoading } = useUserInfo();

  // Fetch user settings
  const { data: settings } = useQuery<UserSettings>({
    queryKey: ['userSettings'],
    queryFn: async () => {
      const response = await apiClient.get('/api/user/settings');
      return response.data;
    },
    enabled: activeTab === 'preferences',
    staleTime: 5 * 60 * 1000, // 5 minutes - consider data fresh for 5 min
    refetchOnMount: false, // Don't refetch on component mount
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  // Update settings
  const updateSettings = useMutation({
    mutationFn: async (data: Partial<UserSettings>) => {
      return apiClient.patch('/api/user/settings', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSettings'] });
      toast.success(t('settings.settingsUpdated'));
    },
  });

  // Fetch forwarding status
  const { data: forwardingData, isLoading: forwardingLoading } = useQuery<ForwardingStatus>({
    queryKey: ['forwarding'],
    queryFn: async () => {
      const response = await forwardingAPI.get();
      return response.data;
    },
    enabled: activeTab === 'forwarding',
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const setForwarding = useMutation({
    mutationFn: async (forward_to: string) => forwardingAPI.set(forward_to),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forwarding'] });
      setIsEditingForwarding(false);
      setForwardingInput('');
      toast.success(t('settings.forwarding.verificationSent'));
    },
  });

  const refreshForwarding = useMutation({
    mutationFn: async () => forwardingAPI.refresh(),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['forwarding'] });
      if (response.data.verified) {
        toast.success(t('settings.forwarding.verifiedSuccess'));
      } else {
        toast(t('settings.forwarding.stillPending'));
      }
    },
  });

  const toggleForwarding = useMutation({
    mutationFn: async (enabled: boolean) => forwardingAPI.toggle(enabled),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['forwarding'] });
      toast.success(
        response.data.forward_enabled
          ? t('settings.forwarding.resumed')
          : t('settings.forwarding.paused'),
      );
    },
  });

  const removeForwarding = useMutation({
    mutationFn: async () => forwardingAPI.remove(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forwarding'] });
      setShowDisableForwardingDialog(false);
      setIsEditingForwarding(false);
      setForwardingInput('');
      toast.success(t('settings.forwarding.disabled'));
    },
  });

  return (
    <div className="min-h-screen bg-neo-warm-white bg-grain">
      {/* Header */}
      <header className="bg-white border-b-3 border-neo-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-neo-black">{t('settings.title')}</h1>
            <div className="hidden md:flex items-center gap-3">
              <LanguageSwitcher />
              <button
                onClick={() => navigate('/dashboard')}
                className="px-3 py-1.5 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all"
              >
                {t('settings.backToDashboard')}
              </button>
            </div>
            <MobileMenu>
              <div className="px-3 py-2"><LanguageSwitcher /></div>
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full text-left px-3 py-2 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo border-2 border-neo-black"
              >
                {t('settings.backToDashboard')}
              </button>
            </MobileMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white border-3 border-neo-black rounded-neo-xl">
          {/* Tabs */}
          <div className="border-b-3 border-neo-black">
            <nav className="flex overflow-x-auto scrollbar-thin">
              <button
                onClick={() => setActiveTab('profile')}
                className={`relative px-4 sm:px-6 py-3 text-sm font-bold rounded-t-neo transition-all whitespace-nowrap ${
                  activeTab === 'profile'
                    ? 'bg-neo-yellow text-neo-black after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:bg-neo-black'
                    : 'text-neo-gray hover:bg-gray-50'
                }`}
              >
                {t('settings.profile')}
              </button>
              <button
                onClick={() => setActiveTab('preferences')}
                className={`relative px-4 sm:px-6 py-3 text-sm font-bold rounded-t-neo transition-all whitespace-nowrap ${
                  activeTab === 'preferences'
                    ? 'bg-neo-yellow text-neo-black after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:bg-neo-black'
                    : 'text-neo-gray hover:bg-gray-50'
                }`}
              >
                {t('settings.preferences')}
              </button>
              <button
                onClick={() => setActiveTab('forwarding')}
                className={`relative px-4 sm:px-6 py-3 text-sm font-bold rounded-t-neo transition-all whitespace-nowrap ${
                  activeTab === 'forwarding'
                    ? 'bg-neo-yellow text-neo-black after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:bg-neo-black'
                    : 'text-neo-gray hover:bg-gray-50'
                }`}
              >
                {t('settings.forwarding.tab')}
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-neo-black mb-4">{t('settings.profileInformation')}</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-neo-black mb-1">{t('settings.username')}</label>
                      <input
                        type="text"
                        value={user?.username || ''}
                        disabled
                        className="input-neo w-full disabled:bg-gray-100 disabled:text-neo-gray"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-neo-black mb-1">{t('settings.email')}</label>
                      <input
                        type="email"
                        value={user?.email || ''}
                        disabled
                        className="input-neo w-full disabled:bg-gray-100 disabled:text-neo-gray"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-neo-black mb-1">{t('settings.accountCreated')}</label>
                      <input
                        type="text"
                        value={user?.created_at ? format(new Date(user.created_at), 'PPP') : ''}
                        disabled
                        className="input-neo w-full disabled:bg-gray-100 disabled:text-neo-gray"
                      />
                    </div>
                  </div>
                </div>

                {/* Tier Information Section */}
                <div className="pt-6 border-t-3 border-neo-black">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-neo-black">{t('settings.tier_info')}</h3>
                    <button
                      onClick={() => setIsRedeemModalOpen(true)}
                      className="btn-neo-secondary text-sm"
                    >
                      {t('settings.redeem_code_button')}
                    </button>
                  </div>

                  {userInfoLoading ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border-2 border-neo-black rounded-lg bg-gray-50">
                        <div className="skeleton-neo h-4 w-24"></div>
                        <div className="skeleton-neo h-6 w-20 rounded-full"></div>
                      </div>
                      <div className="flex items-center justify-between p-4 border-2 border-neo-black rounded-lg bg-gray-50">
                        <div className="skeleton-neo h-4 w-24"></div>
                        <div className="skeleton-neo h-4 w-32"></div>
                      </div>
                      <div className="p-4 border-2 border-neo-black rounded-lg bg-gray-50">
                        <div className="skeleton-neo h-4 w-20 mb-4"></div>
                        <div className="space-y-4">
                          <div className="skeleton-neo h-2 w-full rounded-full"></div>
                          <div className="skeleton-neo h-2 w-full rounded-full"></div>
                        </div>
                      </div>
                    </div>
                  ) : userInfo?.data ? (
                    <div className="space-y-4">
                      {/* Current Tier */}
                      <div className="flex items-center justify-between p-4 border-2 border-neo-black rounded-lg bg-gray-50">
                        <span className="font-medium text-neo-black">{t('settings.current_tier')}</span>
                        <TierBadge
                          tierName={userInfo.data.tier.name}
                          displayName={userInfo.data.tier.display_name}
                          size="lg"
                        />
                      </div>

                      {/* Expiration Time */}
                      <div className="flex items-center justify-between p-4 border-2 border-neo-black rounded-lg bg-gray-50">
                        <span className="font-medium text-neo-black">{t('settings.expiration_time')}</span>
                        <TierExpirationCountdown
                          expiresAt={userInfo.data.tier.expires_at}
                          format="full"
                        />
                      </div>

                      {/* Quota Usage */}
                      <div className="p-4 border-2 border-neo-black rounded-lg bg-gray-50">
                        <h4 className="font-bold text-neo-black mb-4">{t('settings.quota_usage')}</h4>
                        <div className="space-y-4">
                          <QuotaProgressBar
                            type="permanent"
                            current={userInfo.data.quota.permanent.used}
                            max={userInfo.data.quota.permanent.limit}
                            showPercentage={true}
                          />
                          <QuotaProgressBar
                            type="temporary"
                            current={userInfo.data.quota.temporary.used}
                            max={userInfo.data.quota.temporary.limit}
                            showPercentage={true}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Password Change Section - Only for password-based accounts */}
                {!user?.oauth_provider && (
                  <div className="pt-6 border-t-3 border-neo-black">
                    <h3 className="text-lg font-bold text-neo-black mb-4">{t('settings.changePassword')}</h3>
                    <form className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-neo-black mb-1">{t('settings.currentPassword')}</label>
                        <input
                          type="password"
                          className="input-neo w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-neo-black mb-1">{t('settings.newPassword')}</label>
                        <input
                          type="password"
                          className="input-neo w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-neo-black mb-1">{t('settings.confirmPassword')}</label>
                        <input
                          type="password"
                          className="input-neo w-full"
                        />
                      </div>
                      <button
                        type="submit"
                        className="btn-neo-primary"
                      >
                        {t('settings.updatePassword')}
                      </button>
                    </form>
                  </div>
                )}

                {/* OAuth Account Notice */}
                {user?.oauth_provider && (
                  <div className="pt-6 border-t-3 border-neo-black">
                    <div className="bg-blue-50 border-3 border-blue-500 rounded-lg p-6">
                      <div className="flex items-start">
                        <svg className="w-6 h-6 text-blue-500 mr-3 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <h4 className="text-lg font-bold text-blue-900 mb-2">OAuth Account</h4>
                          <p className="text-sm text-blue-800">
                            You are logged in using {user.oauth_provider === 'linuxdo' ? 'Linux.do' : user.oauth_provider}.
                            Password management is not available for OAuth accounts. To log in, simply click "Login with {user.oauth_provider === 'linuxdo' ? 'Linux.do' : user.oauth_provider}" on the login page.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Preferences Tab */}
            {activeTab === 'preferences' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-neo-black mb-4">{t('settings.emailPreferences')}</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-neo-black mb-1">
                        {t('settings.defaultDuration')}
                      </label>
                      <NeoSelect
                        value={settings?.default_mailbox_duration || 3600}
                        onChange={(value) =>
                          updateSettings.mutate({ default_mailbox_duration: Number(value) })
                        }
                        options={[
                          { value: 600, label: t('settings.10minutes') },
                          { value: 1800, label: t('settings.30minutes') },
                          { value: 3600, label: t('settings.1hour') },
                          { value: 7200, label: t('settings.2hours') },
                          { value: 21600, label: t('settings.6hours') },
                          { value: 43200, label: t('settings.12hours') },
                          { value: 86400, label: t('settings.24hours') },
                          { value: 0, label: t('settings.neverExpires') },
                        ]}
                        className="w-full"
                      />
                    </div>

                    </div>
                </div>

                <div className="pt-6 border-t-3 border-neo-black">
                  <h3 className="text-lg font-bold text-neo-black mb-4">{t('settings.notifications')}</h3>
                  <div className="space-y-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings?.notifications_enabled || false}
                        onChange={(e) =>
                          updateSettings.mutate({ notifications_enabled: e.target.checked })
                        }
                        className="w-5 h-5 border-3 border-neo-black rounded-neo-xs accent-neo-cyan hover:border-4 transition-all"
                      />
                      <span className="ml-3 text-sm font-bold text-neo-black">
                        {t('settings.enableNotifications')}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-6 border-t-3 border-neo-black">
                  <h3 className="text-lg font-bold text-neo-black mb-4">{t('settings.timezone')}</h3>
                  <NeoSelect
                    value={settings?.timezone || 'UTC'}
                    onChange={(value) => updateSettings.mutate({ timezone: String(value) })}
                    options={[
                      { value: 'UTC', label: t('settings.timezones.utc') },
                      { value: 'America/New_York', label: t('settings.timezones.eastern') },
                      { value: 'America/Chicago', label: t('settings.timezones.central') },
                      { value: 'America/Denver', label: t('settings.timezones.mountain') },
                      { value: 'America/Los_Angeles', label: t('settings.timezones.pacific') },
                      { value: 'Europe/London', label: t('settings.timezones.london') },
                      { value: 'Europe/Paris', label: t('settings.timezones.paris') },
                      { value: 'Asia/Tokyo', label: t('settings.timezones.tokyo') },
                      { value: 'Asia/Shanghai', label: t('settings.timezones.shanghai') },
                    ]}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* Forwarding Tab */}
            {activeTab === 'forwarding' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-neo-black mb-1">{t('settings.forwarding.title')}</h3>
                  <p className="text-sm text-neo-gray">{t('settings.forwarding.description')}</p>
                </div>

                <div className="bg-blue-50 border-3 border-blue-500 rounded-lg p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-blue-900">{t('settings.forwarding.spamHint')}</p>
                </div>

                {forwardingLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-neo-spin rounded-full h-8 w-8 border-4 border-neo-black border-t-neo-cyan"></div>
                  </div>
                ) : (
                  <div className="border-3 border-neo-black rounded-neo-xl p-5 bg-white space-y-4">
                    {forwardingData?.forward_last_error && (
                      <div className="bg-red-50 border-3 border-red-500 rounded-lg p-3 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <p className="text-sm text-red-900">
                            <span className="font-bold">{t('settings.forwarding.lastErrorLabel')}: </span>
                            {forwardingData.forward_last_error}
                          </p>
                        </div>
                        <button
                          onClick={() => refreshForwarding.mutate()}
                          disabled={refreshForwarding.isPending}
                          className="btn-neo-ghost text-xs whitespace-nowrap disabled:opacity-50"
                        >
                          {t('settings.forwarding.clearError')}
                        </button>
                      </div>
                    )}

                    {(!forwardingData?.forward_to || isEditingForwarding) ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (forwardingInput.trim()) {
                            setForwarding.mutate(forwardingInput.trim());
                          }
                        }}
                        className="space-y-3"
                      >
                        <label className="block text-sm font-bold text-neo-black">
                          {t('settings.forwarding.targetLabel')}
                        </label>
                        <input
                          type="email"
                          required
                          value={forwardingInput}
                          onChange={(e) => setForwardingInput(e.target.value)}
                          placeholder={t('settings.forwarding.targetPlaceholder')}
                          className="input-neo w-full"
                        />
                        <div className="flex gap-3">
                          <button
                            type="submit"
                            disabled={!forwardingInput.trim() || setForwarding.isPending}
                            className="btn-neo-primary disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {setForwarding.isPending
                              ? t('settings.forwarding.submitting')
                              : t('settings.forwarding.setAddress')}
                          </button>
                          {forwardingData?.forward_to && isEditingForwarding && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingForwarding(false);
                                setForwardingInput('');
                              }}
                              className="btn-neo-ghost"
                            >
                              {t('settings.cancel')}
                            </button>
                          )}
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono text-sm font-bold text-neo-black break-all">
                            {forwardingData.forward_to}
                          </span>
                          {!forwardingData.forward_verified ? (
                            <span className="badge-neo bg-neo-yellow text-neo-black text-xs">
                              {t('settings.forwarding.statusPending')}
                            </span>
                          ) : forwardingData.forward_enabled ? (
                            <span className="badge-neo bg-neo-green text-neo-black text-xs">
                              {t('settings.forwarding.statusActive')}
                            </span>
                          ) : (
                            <span className="badge-neo bg-gray-200 text-neo-gray text-xs">
                              {t('settings.forwarding.statusPaused')}
                            </span>
                          )}
                        </div>

                        {!forwardingData.forward_verified ? (
                          <div className="space-y-3">
                            <p className="text-sm text-neo-gray">
                              {t('settings.forwarding.pendingHint', { email: forwardingData.forward_to })}
                            </p>
                            <div className="flex flex-wrap gap-3">
                              <button
                                onClick={() => refreshForwarding.mutate()}
                                disabled={refreshForwarding.isPending}
                                className="btn-neo-primary disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {refreshForwarding.isPending
                                  ? t('settings.forwarding.checking')
                                  : t('settings.forwarding.iClickedLink')}
                              </button>
                              <button
                                onClick={() => {
                                  setForwardingInput(forwardingData.forward_to || '');
                                  setIsEditingForwarding(true);
                                }}
                                className="btn-neo-secondary"
                              >
                                {t('settings.forwarding.changeAddress')}
                              </button>
                              <button
                                onClick={() => removeForwarding.mutate()}
                                disabled={removeForwarding.isPending}
                                className="btn-neo-ghost disabled:opacity-50"
                              >
                                {t('settings.cancel')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {forwardingData.forward_verified_at && (
                              <p className="text-xs text-neo-gray">
                                {t('settings.forwarding.verifiedAt', {
                                  time: formatDistanceToNow(new Date(forwardingData.forward_verified_at), { addSuffix: true }),
                                })}
                              </p>
                            )}

                            <label className="flex items-center justify-between p-3 border-2 border-neo-black rounded-lg bg-gray-50 cursor-pointer">
                              <span className="text-sm font-bold text-neo-black">
                                {t('settings.forwarding.enableToggle')}
                              </span>
                              <input
                                type="checkbox"
                                checked={forwardingData.forward_enabled}
                                onChange={(e) => toggleForwarding.mutate(e.target.checked)}
                                disabled={toggleForwarding.isPending}
                                className="w-5 h-5 border-3 border-neo-black rounded-neo-xs accent-neo-cyan hover:border-4 transition-all disabled:opacity-50"
                              />
                            </label>

                            <div className="flex flex-wrap gap-3">
                              <button
                                onClick={() => {
                                  setForwardingInput(forwardingData.forward_to || '');
                                  setIsEditingForwarding(true);
                                }}
                                className="btn-neo-secondary"
                              >
                                {t('settings.forwarding.changeAddress')}
                              </button>
                              <button
                                onClick={() => setShowDisableForwardingDialog(true)}
                                className="btn-neo-danger"
                              >
                                {t('settings.forwarding.disable')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Redeem Code Modal */}
      <RedeemCodeModal
        isOpen={isRedeemModalOpen}
        onClose={() => setIsRedeemModalOpen(false)}
      />

      {/* Disable Forwarding Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDisableForwardingDialog}
        title={t('settings.forwarding.disableConfirmTitle')}
        message={t('settings.forwarding.disableConfirmMessage')}
        confirmText={t('settings.forwarding.disable')}
        cancelText={t('common.cancel')}
        onConfirm={() => removeForwarding.mutate()}
        onCancel={() => setShowDisableForwardingDialog(false)}
        isLoading={removeForwarding.isPending}
      />
    </div>
  );
}