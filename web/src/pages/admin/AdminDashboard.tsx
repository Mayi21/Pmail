/**
 * Admin Dashboard Page
 * Displays system statistics overview
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import apiClient from '@/api/client';
import StatisticsCard from '@/components/admin/StatisticsCard';

interface SystemStatistics {
  users: {
    total: number;
    admins: number;
    new_7d: number;
    new_30d: number;
  };
  tiers: {
    distribution: Array<{
      name: string;
      display_name: string;
      users: {
        total: number;
        permanent: number;
        active_temporary: number;
        expired: number;
      };
    }>;
  };
  mailboxes: {
    total: number;
    active: number;
    permanent: number;
    temporary: number;
    expired: number;
    guest: number;
  };
  emails: {
    total: number;
    unread: number;
    last_24h: number;
    last_7d: number;
  };
  redemption: {
    codes: {
      total: number;
      active: number;
      unlimited: number;
      expired: number;
    };
    activity: {
      total_redemptions: number;
      last_24h: number;
    };
  };
  api_keys: {
    total: number;
    active: number;
    users_with_keys: number;
  };
  storage: {
    attachments: number;
    total_size_mb: string;
    avg_size_kb: string;
  };
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery<{ success: boolean; data: SystemStatistics }>({
    queryKey: ['admin', 'statistics'],
    queryFn: async () => {
      const response = await apiClient.get('/api/admin/statistics');
      return response as unknown as { success: boolean; data: SystemStatistics };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-yellow-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-neo-black"></div>
            <p className="mt-4 text-lg font-bold">{t('common.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  const statistics = stats?.data;

  // Safety check: ensure statistics data is loaded
  if (!statistics) {
    return (
      <div className="min-h-screen bg-yellow-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <p className="text-lg font-bold text-red-600">{t('admin.dashboard.failedToLoad')}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold
                       hover:shadow-neo transition-all"
            >
              🔄 {t('admin.dashboard.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-yellow-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-black">{t('admin.dashboard.title')}</h1>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold
                       hover:shadow-neo transition-all"
            >
              ← {t('admin.dashboard.backToUserView')}
            </button>
          </div>
          <p className="text-lg text-black/70">{t('admin.dashboard.subtitle')}</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <Link
            to="/admin/users"
            className="bg-blue-200 border-4 border-neo-black rounded-lg p-4 font-bold text-center
                     hover:shadow-neo transition-all"
          >
            👥 {t('admin.dashboard.manageUsers')}
          </Link>
          <Link
            to="/admin/tiers"
            className="bg-green-200 border-4 border-neo-black rounded-lg p-4 font-bold text-center
                     hover:shadow-neo transition-all"
          >
            🏆 {t('admin.dashboard.manageTiers')}
          </Link>
          <Link
            to="/admin/domains"
            className="bg-indigo-200 border-4 border-neo-black rounded-lg p-4 font-bold text-center
                     hover:shadow-neo transition-all"
          >
            🌐 {t('admin.dashboard.manageDomains')}
          </Link>
          <Link
            to="/admin/redemption"
            className="bg-purple-200 border-4 border-neo-black rounded-lg p-4 font-bold text-center
                     hover:shadow-neo transition-all"
          >
            🎟️ {t('admin.dashboard.redemptionCodes')}
          </Link>
          <Link
            to="/admin/settings"
            className="bg-cyan-200 border-4 border-neo-black rounded-lg p-4 font-bold text-center
                     hover:shadow-neo transition-all"
          >
            ⚙️ {t('admin.dashboard.systemSettings')}
          </Link>
          <Link
            to="/admin/backup"
            className="bg-pink-200 border-4 border-neo-black rounded-lg p-4 font-bold text-center
                     hover:shadow-neo transition-all"
          >
            💾 {t('admin.dashboard.manageBackup')}
          </Link>
          <Link
            to="/admin/announcements"
            className="bg-yellow-200 border-4 border-neo-black rounded-lg p-4 font-bold text-center
                     hover:shadow-neo transition-all"
          >
            📢 {t('admin.dashboard.manageAnnouncements')}
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="bg-orange-200 border-4 border-neo-black rounded-lg p-4 font-bold text-center
                     hover:shadow-neo transition-all"
          >
            🔄 {t('admin.dashboard.refreshData')}
          </button>
        </div>

        {/* Statistics Grid */}
        {statistics && (
          <div className="space-y-8">
            {/* User Statistics */}
            <div>
              <h2 className="text-2xl font-black mb-4">👥 {t('admin.dashboard.userStats')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatisticsCard
                  title={t('admin.dashboard.totalUsers')}
                  value={statistics.users.total}
                  color="blue"
                  icon={<span className="text-2xl">👤</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.administrators')}
                  value={statistics.users.admins}
                  color="purple"
                  icon={<span className="text-2xl">👑</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.newUsers7d')}
                  value={statistics.users.new_7d}
                  color="green"
                  icon={<span className="text-2xl">🆕</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.newUsers30d')}
                  value={statistics.users.new_30d}
                  color="orange"
                  icon={<span className="text-2xl">📈</span>}
                />
              </div>
            </div>

            {/* Tier Distribution */}
            <div>
              <h2 className="text-2xl font-black mb-4">🏆 {t('admin.dashboard.tierDistribution')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {statistics.tiers.distribution.map((tier) => (
                  <div
                    key={tier.name}
                    className="bg-white border-4 border-neo-black rounded-lg p-4
                             shadow-neo"
                  >
                    <h3 className="font-black text-lg mb-2">{t(`tierNames.${tier.name}`, { defaultValue: tier.display_name })}</h3>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-bold">{t('admin.dashboard.total')}:</span> {tier.users.total}</p>
                      <p><span className="font-bold">{t('admin.dashboard.permanent')}:</span> {tier.users.permanent}</p>
                      <p><span className="font-bold">{t('admin.dashboard.activeTemp')}:</span> {tier.users.active_temporary}</p>
                      <p><span className="font-bold">{t('admin.dashboard.expired')}:</span> {tier.users.expired}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mailbox Statistics */}
            <div>
              <h2 className="text-2xl font-black mb-4">📬 {t('admin.dashboard.mailboxStats')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatisticsCard
                  title={t('admin.dashboard.totalMailboxes')}
                  value={statistics.mailboxes.total}
                  color="blue"
                  icon={<span className="text-2xl">📬</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.activeMailboxes')}
                  value={statistics.mailboxes.active}
                  color="green"
                  icon={<span className="text-2xl">✉️</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.permanent')}
                  value={statistics.mailboxes.permanent}
                  color="purple"
                  icon={<span className="text-2xl">📌</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.temporary')}
                  value={statistics.mailboxes.temporary}
                  color="pink"
                  icon={<span className="text-2xl">⏱️</span>}
                />
              </div>
            </div>

            {/* Email Statistics */}
            <div>
              <h2 className="text-2xl font-black mb-4">📧 {t('admin.dashboard.emailStats')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatisticsCard
                  title={t('admin.dashboard.totalEmails')}
                  value={statistics.emails.total}
                  color="blue"
                  icon={<span className="text-2xl">📧</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.last24h')}
                  value={statistics.emails.last_24h}
                  color="green"
                  icon={<span className="text-2xl">🕐</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.last7d')}
                  value={statistics.emails.last_7d}
                  color="purple"
                  icon={<span className="text-2xl">📅</span>}
                />
              </div>
            </div>

            {/* Redemption Code Statistics */}
            <div>
              <h2 className="text-2xl font-black mb-4">🎟️ {t('admin.dashboard.redemptionStats')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatisticsCard
                  title={t('admin.dashboard.totalCodes')}
                  value={statistics.redemption.codes.total}
                  color="blue"
                  icon={<span className="text-2xl">🎟️</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.activeCodes')}
                  value={statistics.redemption.codes.active}
                  color="green"
                  icon={<span className="text-2xl">✅</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.unlimited')}
                  value={statistics.redemption.codes.unlimited}
                  color="purple"
                  icon={<span className="text-2xl">♾️</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.totalRedemptions')}
                  value={statistics.redemption.activity.total_redemptions}
                  color="orange"
                  icon={<span className="text-2xl">🎁</span>}
                />
              </div>
            </div>

            {/* Storage Statistics */}
            <div>
              <h2 className="text-2xl font-black mb-4">💾 {t('admin.dashboard.storageStats')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatisticsCard
                  title={t('admin.dashboard.totalStorageMb')}
                  value={statistics.storage.total_size_mb}
                  color="blue"
                  icon={<span className="text-2xl">💾</span>}
                />
                <StatisticsCard
                  title={t('admin.dashboard.attachments')}
                  value={statistics.storage.attachments}
                  color="green"
                  icon={<span className="text-2xl">📎</span>}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
