/**
 * Admin Settings Page
 * 系统设置管理页面
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import SettingSwitch from '@/components/admin/SettingSwitch';

interface SystemSetting {
  id: number;
  setting_key: string;
  setting_value: string;
  setting_type: string;
  category: string;
  display_name: string;
  description: string | null;
  is_public: number;
}

export default function AdminSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // 获取所有设置
  const { data: settingsData, isLoading } = useQuery<{
    success: boolean;
    data: { settings: SystemSetting[] };
  }>({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const response = await apiClient.get('/api/admin/settings');
      return response as any;
    },
  });

  // 更新设置 mutation
  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      return apiClient.patch(`/api/admin/settings/${key}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success(t('admin.settings.saved'));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.settings.failedToSave'));
    },
  });

  // 按分类分组
  const groupedSettings = settingsData?.data.settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<string, SystemSetting[]>) || {};

  const handleToggle = (key: string, currentValue: string) => {
    const newValue = currentValue === 'true' ? 'false' : 'true';
    updateMutation.mutate({ key, value: newValue });
  };

  const categoryNames: Record<string, string> = {
    auth: t('admin.settings.authSettings'),
    oauth: t('admin.settings.oauthSettings'),
    system: t('admin.settings.systemSettings'),
  };

  return (
    <div className="min-h-screen bg-yellow-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-black">{t('admin.settings.title')}</h1>
            <Link
              to="/admin"
              className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold
                       hover:shadow-neo transition-all"
            >
              ← {t('admin.settings.back')}
            </Link>
          </div>
          <p className="text-gray-700">{t('admin.settings.description')}</p>
        </div>

        {/* Settings Sections */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-neo-black"></div>
            <p className="mt-4 text-lg font-bold">{t('admin.settings.loading')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedSettings).map(([category, settings]) => (
              <div
                key={category}
                className="bg-white border-4 border-neo-black rounded-lg p-6 shadow-neo-lg"
              >
                <h2 className="text-2xl font-black mb-4">{categoryNames[category] || category}</h2>
                <div className="space-y-4">
                  {settings
                    .filter(s => s.setting_type === 'boolean')
                    .map(setting => (
                      <SettingSwitch
                        key={setting.setting_key}
                        label={setting.display_name}
                        description={setting.description || undefined}
                        checked={setting.setting_value === 'true'}
                        onChange={() => handleToggle(setting.setting_key, setting.setting_value)}
                        disabled={updateMutation.isPending}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
