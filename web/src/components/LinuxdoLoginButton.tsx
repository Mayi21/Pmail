import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { authAPI } from '../api/auth';
import { useSystemSettings } from '../hooks/useSystemSettings';

export default function LinuxdoLoginButton() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const { isOAuthEnabled, isLoading: settingsLoading } = useSystemSettings();

  // 如果 OAuth 被禁用，不渲染按钮
  if (settingsLoading) {
    // 配置加载中，暂时不显示按钮
    return null;
  }

  if (!isOAuthEnabled) {
    // OAuth 被禁用，不显示按钮
    return null;
  }

  const handleClick = async () => {
    setLoading(true);
    try {
      const response = await authAPI.getLinuxdoAuthUrl();

      if (response.success && response.data?.authorization_url) {
        // Redirect to Linux.do authorization page
        window.location.href = response.data.authorization_url;
      } else {
        toast.error(response.error || t('auth.oauthDisabled'));
        setLoading(false);
      }
    } catch (error: any) {
      console.error('Failed to initiate OAuth:', error);

      // 尝试从错误响应中提取具体错误信息
      const errorMessage = error.response?.data?.error || error.message || t('auth.oauthDisabled');
      toast.error(errorMessage);

      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? (
        <>
          <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2"></div>
          {t('common.loading')}
        </>
      ) : (
        <>
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
            <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>
          </svg>
          Login with Linux.do
        </>
      )}
    </button>
  );
}
