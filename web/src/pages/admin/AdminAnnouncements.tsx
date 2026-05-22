/**
 * Admin Announcements Page
 * 公告管理页面 - 管理员创建、编辑、删除公告
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import {
  useAdminAnnouncementList,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useToggleAnnouncement,
  useDeleteAnnouncement,
  Announcement,
} from '@/hooks/useAnnouncements';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function AdminAnnouncements() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [announcementToDelete, setAnnouncementToDelete] = useState<Announcement | null>(null);

  // 表单状态
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    content_type: 'markdown' as 'markdown' | 'plain',
    is_pinned: false,
    priority: 0,
  });

  // 查询和操作
  const { data, isLoading } = useAdminAnnouncementList(page, 20);
  const createMutation = useCreateAnnouncement();
  const updateMutation = useUpdateAnnouncement();
  const toggleMutation = useToggleAnnouncement();
  const deleteMutation = useDeleteAnnouncement();

  // 重置表单
  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      content_type: 'markdown',
      is_pinned: false,
      priority: 0,
    });
    setShowPreview(false);
  };

  // 打开创建模态框
  const handleOpenCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  // 打开编辑模态框
  const handleOpenEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      content_type: announcement.content_type,
      is_pinned: announcement.is_pinned === 1,
      priority: announcement.priority,
    });
    setShowPreview(false);
    setShowEditModal(true);
  };

  // 创建公告
  const handleCreate = () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error(t('admin.announcements.validation.required'));
      return;
    }

    createMutation.mutate(formData, {
      onSuccess: () => {
        toast.success(t('admin.announcements.created'));
        setShowCreateModal(false);
        resetForm();
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || t('admin.announcements.failedToCreate'));
      },
    });
  };

  // 更新公告
  const handleUpdate = () => {
    if (!editingAnnouncement) return;
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error(t('admin.announcements.validation.required'));
      return;
    }

    updateMutation.mutate(
      { id: editingAnnouncement.id, data: formData },
      {
        onSuccess: () => {
          toast.success(t('admin.announcements.updated'));
          setShowEditModal(false);
          setEditingAnnouncement(null);
          resetForm();
        },
        onError: (error: any) => {
          toast.error(error.response?.data?.error || t('admin.announcements.failedToUpdate'));
        },
      }
    );
  };

  // 切换状态
  const handleToggle = (id: number) => {
    toggleMutation.mutate(id, {
      onSuccess: () => {
        toast.success(t('admin.announcements.toggled'));
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || t('admin.announcements.failedToToggle'));
      },
    });
  };

  // 删除公告
  const handleDelete = (announcement: Announcement) => {
    setAnnouncementToDelete(announcement);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (!announcementToDelete) return;

    deleteMutation.mutate(announcementToDelete.id, {
      onSuccess: () => {
        toast.success(t('admin.announcements.deleted'));
        setShowDeleteDialog(false);
        setAnnouncementToDelete(null);
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || t('admin.announcements.failedToDelete'));
      },
    });
  };

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 表单渲染
  const renderForm = (isEdit: boolean) => (
    <div className="space-y-4">
      {/* 标题 */}
      <div>
        <label className="block text-sm font-bold mb-2">
          {t('admin.announcements.form.title')} *
        </label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder={t('admin.announcements.form.titlePlaceholder')}
          className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-yellow-300"
          maxLength={200}
        />
      </div>

      {/* 内容类型 */}
      <div>
        <label className="block text-sm font-bold mb-2">
          {t('admin.announcements.form.contentType')}
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="content_type"
              value="markdown"
              checked={formData.content_type === 'markdown'}
              onChange={() => setFormData({ ...formData, content_type: 'markdown' })}
              className="w-4 h-4"
            />
            <span className="font-medium">Markdown</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="content_type"
              value="plain"
              checked={formData.content_type === 'plain'}
              onChange={() => setFormData({ ...formData, content_type: 'plain' })}
              className="w-4 h-4"
            />
            <span className="font-medium">{t('admin.announcements.form.plainText')}</span>
          </label>
        </div>
      </div>

      {/* 内容 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-bold">
            {t('admin.announcements.form.content')} *
          </label>
          {formData.content_type === 'markdown' && (
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-sm font-bold text-blue-600 hover:underline"
            >
              {showPreview ? t('admin.announcements.form.edit') : t('admin.announcements.form.preview')}
            </button>
          )}
        </div>
        {showPreview ? (
          <div className="w-full min-h-[200px] px-4 py-3 border-4 border-neo-black rounded-lg bg-gray-50 prose prose-sm max-w-none">
            <ReactMarkdown>{formData.content}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            placeholder={t('admin.announcements.form.contentPlaceholder')}
            className="w-full min-h-[200px] px-4 py-2 border-4 border-neo-black rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-y"
            maxLength={10000}
          />
        )}
      </div>

      {/* 置顶和优先级 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_pinned}
              onChange={(e) => setFormData({ ...formData, is_pinned: e.target.checked })}
              className="w-5 h-5 border-2 border-neo-black rounded"
            />
            <span className="font-bold">{t('admin.announcements.form.isPinned')}</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-bold mb-2">
            {t('admin.announcements.form.priority')}
          </label>
          <input
            type="number"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
            min={0}
            max={1000}
            className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-yellow-300"
          />
          <p className="text-xs text-gray-500 mt-1">{t('admin.announcements.form.priorityHint')}</p>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-4 pt-4">
        <button
          type="button"
          onClick={() => {
            if (isEdit) {
              setShowEditModal(false);
              setEditingAnnouncement(null);
            } else {
              setShowCreateModal(false);
            }
            resetForm();
          }}
          className="flex-1 px-4 py-3 bg-white border-4 border-neo-black rounded-lg font-bold hover:shadow-neo transition-all"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={isEdit ? handleUpdate : handleCreate}
          disabled={isEdit ? updateMutation.isPending : createMutation.isPending}
          className="flex-1 px-4 py-3 bg-green-300 border-4 border-neo-black rounded-lg font-bold hover:shadow-neo transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(isEdit ? updateMutation.isPending : createMutation.isPending) ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-neo-black border-t-transparent rounded-full animate-spin" />
              {t('common.saving')}
            </span>
          ) : (
            t('common.save')
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-yellow-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-black">{t('admin.announcements.title')}</h1>
            <div className="flex gap-4">
              <button
                onClick={handleOpenCreate}
                className="px-4 py-2 bg-green-300 border-4 border-neo-black rounded-lg font-bold hover:shadow-neo transition-all"
              >
                + {t('admin.announcements.createNew')}
              </button>
              <Link
                to="/admin"
                className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold hover:shadow-neo transition-all"
              >
                ← {t('admin.announcements.back')}
              </Link>
            </div>
          </div>
        </div>

        {/* Announcements List */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-neo-black"></div>
            <p className="mt-4 text-lg font-bold">{t('admin.announcements.loading')}</p>
          </div>
        ) : data?.announcements && data.announcements.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-4">
              {data.announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className={`bg-white border-4 border-neo-black rounded-lg p-6 shadow-neo ${
                    announcement.is_active !== 1 ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-black">{announcement.title}</h3>
                        {announcement.is_pinned === 1 && (
                          <span className="px-2 py-1 bg-yellow-300 border-2 border-neo-black rounded font-bold text-xs">
                            📌 {t('admin.announcements.pinned')}
                          </span>
                        )}
                        {announcement.is_active !== 1 && (
                          <span className="px-2 py-1 bg-red-300 border-2 border-neo-black rounded font-bold text-xs">
                            {t('admin.announcements.inactive')}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {announcement.content_type === 'markdown' ? (
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown>
                              {announcement.content.substring(0, 200) + (announcement.content.length > 200 ? '...' : '')}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p>
                            {announcement.content.substring(0, 200)}
                            {announcement.content.length > 200 ? '...' : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-6 text-xs text-gray-500">
                        <span>
                          <strong>{t('admin.announcements.priority')}:</strong> {announcement.priority}
                        </span>
                        <span>
                          <strong>{t('admin.announcements.readCount')}:</strong> {announcement.read_count || 0}
                        </span>
                        <span>
                          <strong>{t('admin.announcements.createdAt')}:</strong> {formatDate(announcement.created_at)}
                        </span>
                        {announcement.creator_username && (
                          <span>
                            <strong>{t('admin.announcements.createdBy')}:</strong> {announcement.creator_username}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-6 flex gap-2">
                      <button
                        onClick={() => handleOpenEdit(announcement)}
                        className="px-3 py-2 bg-blue-300 border-2 border-neo-black rounded font-bold text-sm hover:shadow-neo-sm transition-all"
                        title={t('common.edit')}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleToggle(announcement.id)}
                        className="px-3 py-2 bg-orange-300 border-2 border-neo-black rounded font-bold text-sm hover:shadow-neo-sm transition-all"
                        title={announcement.is_active === 1 ? t('admin.announcements.disable') : t('admin.announcements.enable')}
                      >
                        {announcement.is_active === 1 ? '🔴' : '🟢'}
                      </button>
                      <button
                        onClick={() => handleDelete(announcement)}
                        className="px-3 py-2 bg-red-300 border-2 border-neo-black rounded font-bold text-sm hover:shadow-neo-sm transition-all"
                        title={t('common.delete')}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {data.pagination.total_pages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-neo transition-all"
                >
                  ← {t('common.previous')}
                </button>
                <span className="px-4 py-2 font-bold">
                  {page} / {data.pagination.total_pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(data.pagination.total_pages, p + 1))}
                  disabled={page === data.pagination.total_pages}
                  className="px-4 py-2 bg-white border-4 border-neo-black rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-neo transition-all"
                >
                  {t('common.next')} →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 bg-white border-4 border-neo-black rounded-lg">
            <p className="text-2xl font-bold">{t('admin.announcements.noAnnouncements')}</p>
            <p className="text-gray-600 mt-2">{t('admin.announcements.createFirst')}</p>
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white border-4 border-neo-black rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-neo-lg">
              <h2 className="text-xl font-black mb-4">{t('admin.announcements.createNew')}</h2>
              {renderForm(false)}
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && editingAnnouncement && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white border-4 border-neo-black rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-neo-lg">
              <h2 className="text-xl font-black mb-4">{t('admin.announcements.edit')}</h2>
              {renderForm(true)}
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showDeleteDialog}
          title={t('admin.announcements.confirmDeleteTitle')}
          message={
            announcementToDelete
              ? t('admin.announcements.confirmDeleteMessage', { title: announcementToDelete.title })
              : ''
          }
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteDialog(false);
            setAnnouncementToDelete(null);
          }}
          isLoading={deleteMutation.isPending}
        />
      </div>
    </div>
  );
}
