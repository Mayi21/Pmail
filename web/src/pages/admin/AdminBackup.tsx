/**
 * Admin Backup Management Page
 * 管理员数据库备份管理页面
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import ConfirmDialog from '@/components/ConfirmDialog';

interface BackupMetadata {
  timestamp?: string;
  totalRecords?: string;
  tables?: string;
  version?: string;
}

interface Backup {
  key: string;
  size: number;
  uploaded: string;
  metadata: BackupMetadata;
}

interface LatestBackup {
  size: number;
  uploaded: string;
  metadata: BackupMetadata;
}

export default function AdminBackup() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [backupToDelete, setBackupToDelete] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // 获取备份列表
  const { data: backupsData, isLoading: backupsLoading } = useQuery<{
    success: boolean;
    data: { backups: Backup[]; total: number };
  }>({
    queryKey: ['admin', 'backups'],
    queryFn: async () => {
      const response = await apiClient.get('/api/admin/backup/list');
      return response as any;
    },
    refetchInterval: 30000, // 每30秒刷新
  });

  // 获取最新备份信息
  const { data: latestBackupData } = useQuery<{
    success: boolean;
    data: LatestBackup;
  }>({
    queryKey: ['admin', 'backup', 'latest'],
    queryFn: async () => {
      const response = await apiClient.get('/api/admin/backup/latest');
      return response as any;
    },
    refetchInterval: 30000,
  });

  // 触发备份 mutation
  const triggerBackupMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post('/api/admin/backup/trigger');
    },
    onSuccess: () => {
      toast.success(t('admin.backup.backupTriggeredSuccess'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'backup', 'latest'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.backup.backupTriggeredError'));
    },
  });

  // 删除备份 mutation
  const deleteBackupMutation = useMutation({
    mutationFn: async (backupKey: string) => {
      const encodedKey = encodeURIComponent(backupKey);
      return apiClient.delete(`/api/admin/backup/${encodedKey}`);
    },
    onSuccess: () => {
      toast.success(t('admin.backup.backupDeletedSuccess'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
      setShowDeleteDialog(false);
      setBackupToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('admin.backup.backupDeletedError'));
    },
  });

  const handleTriggerBackup = () => {
    triggerBackupMutation.mutate();
  };

  const handleDownloadBackup = (backupKey: string) => {
    const encodedKey = encodeURIComponent(backupKey);
    const downloadUrl = `${apiClient.defaults.baseURL}/api/admin/backup/${encodedKey}/download`;

    // 使用当前的认证token
    const token = localStorage.getItem('token');

    fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
      .then(response => response.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = backupKey.split('/').pop() || 'backup.json';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success(t('admin.backup.downloadStarted'));
      })
      .catch(() => {
        toast.error(t('admin.backup.downloadError'));
      });
  };

  const handleDeleteBackup = (backupKey: string) => {
    setBackupToDelete(backupKey);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (backupToDelete) {
      deleteBackupMutation.mutate(backupToDelete);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const backups = backupsData?.data?.backups || [];
  const latestBackup = latestBackupData?.data;

  return (
    <div className="min-h-screen bg-yellow-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-black">{t('admin.backup.title')}</h1>
            <Link
              to="/admin"
              className="px-6 py-3 bg-white border-3 border-neo-black rounded-xl font-bold hover:bg-gray-50 transition-colors shadow-neo"
            >
              ← {t('admin.common.backToDashboard')}
            </Link>
          </div>
          <p className="text-gray-700">{t('admin.backup.description')}</p>
        </div>

        {/* 触发备份按钮 */}
        <div className="mb-8">
          <button
            onClick={handleTriggerBackup}
            disabled={triggerBackupMutation.isPending}
            className="px-8 py-4 bg-black text-white border-3 border-neo-black rounded-xl font-bold hover:bg-gray-800 transition-colors shadow-neo-lg hover:shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {triggerBackupMutation.isPending
              ? t('admin.backup.triggering')
              : t('admin.backup.triggerBackup')}
          </button>
        </div>

        {/* 最新备份信息卡片 */}
        {latestBackup && (
          <div className="bg-white border-3 border-neo-black rounded-xl p-6 mb-8 shadow-neo-lg">
            <h2 className="text-2xl font-black mb-4">{t('admin.backup.latestBackup')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">{t('admin.backup.uploadTime')}</p>
                <p className="font-bold">{formatDate(latestBackup.uploaded)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">{t('admin.backup.fileSize')}</p>
                <p className="font-bold">{formatFileSize(latestBackup.size)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">{t('admin.backup.totalRecords')}</p>
                <p className="font-bold">{latestBackup.metadata?.totalRecords || 'N/A'}</p>
              </div>
            </div>
          </div>
        )}

        {/* 备份列表 */}
        <div className="bg-white border-3 border-neo-black rounded-xl p-6 shadow-neo-lg">
          <h2 className="text-2xl font-black mb-6">{t('admin.backup.backupHistory')}</h2>

          {backupsLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-neo-black"></div>
              <p className="mt-4 text-lg font-bold">{t('common.loading')}</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">{t('admin.backup.noBackups')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-3 border-neo-black">
                    <th className="text-left py-3 px-4 font-black">{t('admin.backup.fileName')}</th>
                    <th className="text-left py-3 px-4 font-black">{t('admin.backup.uploadTime')}</th>
                    <th className="text-left py-3 px-4 font-black">{t('admin.backup.fileSize')}</th>
                    <th className="text-left py-3 px-4 font-black">{t('admin.backup.records')}</th>
                    <th className="text-left py-3 px-4 font-black">{t('admin.backup.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup, index) => (
                    <tr
                      key={backup.key}
                      className={`border-b border-gray-200 ${
                        index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-sm">
                        {backup.key.split('/').pop()}
                      </td>
                      <td className="py-3 px-4">{formatDate(backup.uploaded)}</td>
                      <td className="py-3 px-4">{formatFileSize(backup.size)}</td>
                      <td className="py-3 px-4">{backup.metadata?.totalRecords || 'N/A'}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDownloadBackup(backup.key)}
                            className="px-3 py-1 bg-blue-500 text-white border-2 border-neo-black rounded-lg font-bold text-sm hover:bg-blue-600 transition-colors shadow-neo-sm"
                          >
                            {t('admin.backup.download')}
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(backup.key)}
                            className="px-3 py-1 bg-red-500 text-white border-2 border-neo-black rounded-lg font-bold text-sm hover:bg-red-600 transition-colors shadow-neo-sm"
                          >
                            {t('admin.backup.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title={t('admin.backup.deleteConfirmTitle')}
        message={t('admin.backup.deleteConfirmMessage')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        confirmButtonClass="bg-red-500 hover:bg-red-600"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteDialog(false);
          setBackupToDelete(null);
        }}
      />
    </div>
  );
}
