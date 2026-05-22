/**
 * AnnouncementDialog Component
 * 公告弹窗组件 - 展示未读公告给已登录用户
 */

import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { useUnreadAnnouncements, useMarkAnnouncementRead } from '@/hooks/useAnnouncements';
import { useAuthStore } from '@/stores/authStore';

export default function AnnouncementDialog() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { data: announcements = [], isLoading } = useUnreadAnnouncements(isAuthenticated);
  const markRead = useMarkAnnouncementRead();

  const [currentIndex, setCurrentIndex] = useState(0);

  // 当前显示的公告
  const currentAnnouncement = useMemo(() => {
    return announcements[currentIndex] || null;
  }, [announcements, currentIndex]);

  // 处理确认阅读
  const handleConfirm = () => {
    if (!currentAnnouncement) return;

    markRead.mutate(currentAnnouncement.id, {
      onSuccess: () => {
        // 移动到下一条公告
        if (currentIndex < announcements.length - 1) {
          setCurrentIndex(prev => prev + 1);
        }
      },
    });
  };

  // 当公告列表更新时重置索引
  useEffect(() => {
    setCurrentIndex(0);
  }, [announcements.length]);

  // 阻止背景滚动
  useEffect(() => {
    if (currentAnnouncement) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [currentAnnouncement]);

  // 不显示的情况
  if (!isAuthenticated || isLoading || !currentAnnouncement) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-neo-black bg-opacity-40 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="relative bg-white border-3 border-neo-black rounded-neo-xl shadow-neo max-w-lg w-full animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b-3 border-neo-black bg-neo-yellow rounded-t-neo-lg">
          <div className="flex items-center justify-between">
            <h3
              id="announcement-title"
              className="text-xl font-bold text-neo-black heading-neo flex items-center gap-2"
            >
              <span className="text-2xl" role="img" aria-label="Announcement">📢</span>
              {currentAnnouncement.title}
            </h3>
            {currentAnnouncement.is_pinned === 1 && (
              <span className="px-2 py-1 text-xs font-bold bg-neo-magenta text-white rounded-neo border-2 border-neo-black">
                {t('announcement.pinned')}
              </span>
            )}
          </div>
          {announcements.length > 1 && (
            <p className="text-sm text-neo-black mt-2 opacity-70">
              {t('announcement.progress', {
                current: currentIndex + 1,
                total: announcements.length,
              })}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
          {currentAnnouncement.content_type === 'markdown' ? (
            <div className="prose prose-sm max-w-none prose-headings:text-neo-black prose-p:text-gray-700 prose-a:text-neo-cyan prose-strong:text-neo-black">
              <ReactMarkdown>{currentAnnouncement.content}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-gray-700 whitespace-pre-wrap">
              {currentAnnouncement.content}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t-3 border-neo-black bg-gray-50 rounded-b-neo-lg">
          <button
            onClick={handleConfirm}
            disabled={markRead.isPending}
            className="w-full px-4 py-3 text-sm font-bold text-white bg-neo-cyan hover:bg-cyan-500 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-neo-sm"
            type="button"
          >
            {markRead.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('common.loading')}
              </span>
            ) : (
              t('announcement.confirmRead')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
