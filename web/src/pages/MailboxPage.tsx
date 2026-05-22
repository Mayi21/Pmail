/**
 * Mailbox Page - Display emails for a specific mailbox
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from '../utils/date';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import MobileMenu from '../components/MobileMenu';
import ConfirmDialog from '../components/ConfirmDialog';

interface Email {
  id: number;
  from_address: string;
  from_name?: string;
  subject: string;
  body_text?: string;
  body_html?: string;
  is_read: boolean;
  has_attachments: boolean;
  received_at: string;
  size_bytes: number;
}

interface EmailListResponse {
  emails: Email[];
  total: number;
  page: number;
  limit: number;
}

export default function MailboxPage() {
  const { t } = useTranslation();
  const { address } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedEmails, setSelectedEmails] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);

  // Fetch emails
  const { data, isLoading, error } = useQuery<EmailListResponse>({
    queryKey: ['emails', address, page, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });
      if (searchQuery) params.append('q', searchQuery);

      const response = await apiClient.get(`/api/emails/${address}?${params}`);
      // response already has success and data fields from the interceptor
      return response.data;
    },
    enabled: !!address,
  });

  // Mark email as read
  const markAsRead = useMutation({
    mutationFn: async (emailId: number) => {
      return apiClient.patch(`/api/email/${emailId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', address] });
    },
  });

  // Delete emails
  const deleteEmails = useMutation({
    mutationFn: async (emailIds: number[]) => {
      if (emailIds.length === 1) {
        return apiClient.delete(`/api/email/${emailIds[0]}`);
      }
      return apiClient.delete('/api/email/batch', {
        data: { ids: emailIds },
      });
    },
    onSuccess: (_, emailIds) => {
      queryClient.invalidateQueries({ queryKey: ['emails', address] });
      // Invalidate mailboxes query to update email counts in Dashboard
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      setSelectedEmails([]);
      toast.success(t('email.deleted', { count: emailIds.length }));
    },
  });

  // Handle delete with confirmation
  const handleDeleteSelected = () => {
    if (selectedEmails.length === 0) return;
    setShowBatchDeleteDialog(true);
  };

  // Confirm batch delete action
  const confirmBatchDelete = () => {
    deleteEmails.mutate(selectedEmails);
    setShowBatchDeleteDialog(false);
  };

  // Toggle email selection
  const toggleEmailSelection = (emailId: number) => {
    setSelectedEmails(prev =>
      prev.includes(emailId)
        ? prev.filter(id => id !== emailId)
        : [...prev, emailId]
    );
  };

  // Select all emails
  const selectAll = () => {
    if (data?.emails) {
      if (selectedEmails.length === data.emails.length) {
        setSelectedEmails([]);
      } else {
        setSelectedEmails(data.emails.map(e => e.id));
      }
    }
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle email click
  const handleEmailClick = (email: Email) => {
    if (!email.is_read) {
      markAsRead.mutate(email.id);
    }
    navigate(`/email/${email.id}`, { state: { email } });
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-neo-black mb-2">{t('toast.errorLoadingEmails')}</h2>
          <p className="text-neo-gray font-medium">{t('common.error')}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 btn-neo-primary"
          >
            {t('common.back')} {t('common.dashboard')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neo-warm-white bg-grain">
      {/* Header */}
      <header className="bg-white border-b-3 border-neo-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-3 py-1.5 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all"
              >
                ← {t('common.back')}
              </button>
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-neo-black">{t('mailbox.title')}</h1>
                <p className="text-xs text-neo-gray font-medium">{address}</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <LanguageSwitcher />
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['emails', address] })}
                className="px-3 py-1.5 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all"
              >
                🔄 {t('common.refresh')}
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-3 py-1.5 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all"
              >
                {t('common.dashboard')}
              </button>
            </div>
            <MobileMenu>
              <div className="px-3 py-2"><LanguageSwitcher /></div>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['emails', address] })}
                className="w-full text-left px-3 py-2 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo border-2 border-neo-black"
              >
                🔄 {t('common.refresh')}
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full text-left px-3 py-2 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo border-2 border-neo-black"
              >
                {t('common.dashboard')}
              </button>
            </MobileMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Toolbar */}
        <div className="bg-white border-3 border-neo-black rounded-neo-xl p-4 mb-6">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="flex items-center gap-3">
              {selectedEmails.length > 0 && (
                <>
                  <span className="text-sm text-neo-black font-bold">
                    {selectedEmails.length} {t('mailbox.selected')}
                  </span>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={deleteEmails.isPending}
                    className="px-3 py-1.5 bg-neo-magenta text-white text-sm font-bold rounded-neo-lg border-3 border-neo-black hover:bg-pink-500 active:translate-x-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('mailbox.deleteSelected')}
                  </button>
                  <button
                    onClick={() => setSelectedEmails([])}
                    className="text-sm text-neo-black font-bold hover:underline decoration-3 decoration-neo-black"
                  >
                    {t('mailbox.clearSelection')}
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('mailbox.searchEmails')}
                  className="input-neo pl-11 pr-10 py-3.5 text-sm w-full sm:w-48"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neo-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              {/* View Mode Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-4 py-2 text-sm font-bold rounded-neo-pill border-3 border-neo-black transition-all active:translate-x-0.5 active:translate-y-0.5 ${
                    viewMode === 'list'
                      ? 'bg-neo-yellow'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  {t('mailbox.list')}
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-4 py-2 text-sm font-bold rounded-neo-pill border-3 border-neo-black transition-all active:translate-x-0.5 active:translate-y-0.5 ${
                    viewMode === 'grid'
                      ? 'bg-neo-yellow'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  {t('mailbox.grid')}
                </button>
              </div>
            </div>
          </div>
            </div>

        {/* Email List/Grid */}
        {isLoading ? (
          <div className="bg-white border-3 border-neo-black rounded-neo-xl overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-4 border-b-3 border-neo-black last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="skeleton-neo w-5 h-5 rounded"></div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="skeleton-neo h-4 w-1/3"></div>
                      <div className="skeleton-neo h-3 w-16"></div>
                    </div>
                    <div className="skeleton-neo h-4 w-2/3 mb-1"></div>
                    <div className="skeleton-neo h-3 w-1/2"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (data?.emails?.length ?? 0) === 0 ? (
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
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <h3 className="mt-6 text-xl font-bold text-neo-black">{t('mailbox.noEmails')}</h3>
            <p className="mt-2 text-neo-gray font-medium">
              {t('mailbox.noEmailsDesc', { address })}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="bg-white border-3 border-neo-black rounded-neo-xl overflow-hidden">
            {/* Select All */}
            <div className="px-4 py-3 border-b-3 border-neo-black bg-white">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedEmails.length === (data?.emails?.length ?? 0)}
                  onChange={selectAll}
                  className="w-5 h-5 border-3 border-neo-black rounded-neo-xs accent-neo-cyan cursor-pointer hover:border-4 transition-all"
                />
                <span className="ml-3 text-sm text-neo-black font-bold">{t('mailbox.selectAll')}</span>
              </label>
            </div>

            {/* Email List */}
            <div className="divide-y-3 divide-neo-black">
              {data?.emails?.map((email, index) => (
                <div
                  key={email.id}
                  className={`px-4 py-4 hover:bg-neo-yellow hover:bg-opacity-10 cursor-pointer transition-colors animate-stagger-in ${
                    !email.is_read ? 'bg-neo-blue bg-opacity-10' : ''
                  }`}
                  style={{ animationDelay: `${index * 0.04}s` }}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedEmails.includes(email.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleEmailSelection(email.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 border-3 border-neo-black rounded-neo-xs accent-neo-cyan cursor-pointer hover:border-4 transition-all"
                    />
                    <div
                      className="flex-1 min-w-0"
                      onClick={() => handleEmailClick(email)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {!email.is_read && (
                            <span className="w-2.5 h-2.5 bg-neo-blue rounded-full"></span>
                          )}
                          <span className={`text-sm ${!email.is_read ? 'font-bold text-neo-black' : 'font-medium text-neo-black'}`}>
                            {email.from_name || email.from_address}
                          </span>
                          {email.has_attachments && (
                            <span className="text-neo-black">📎</span>
                          )}
                        </div>
                        <span className="text-xs text-neo-gray font-medium">
                          {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className={`text-sm truncate ${!email.is_read ? 'font-bold text-neo-black' : 'font-medium text-neo-black'}`}>
                        {email.subject || t('mailbox.noSubject')}
                      </div>
                      <div className="text-sm text-neo-gray truncate font-medium">
                        {email.body_text?.substring(0, 100) || t('mailbox.noContent')}
                      </div>
                      <div className="mt-1 text-xs text-neo-gray font-medium">
                        {formatSize(email.size_bytes)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Grid View
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {data?.emails?.map((email, index) => (
              <div
                key={email.id}
                onClick={() => handleEmailClick(email)}
                className={`bg-white border-3 border-neo-black rounded-neo-xl p-4 hover:translate-x-1 hover:translate-y-1 cursor-pointer transition-transform animate-stagger-in ${
                  !email.is_read ? 'border-neo-blue bg-blue-50' : ''
                }`}
                style={{ animationDelay: `${index * 0.06}s` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <input
                    type="checkbox"
                    checked={selectedEmails.includes(email.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleEmailSelection(email.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 w-5 h-5 border-3 border-neo-black rounded-neo-xs accent-neo-cyan cursor-pointer hover:border-4 transition-all"
                  />
                  {!email.is_read && (
                    <span className="badge-neo bg-neo-blue text-white text-xs">{t('mailbox.new')}</span>
                  )}
                </div>
                <div className="mb-3">
                  <p className="text-sm font-bold text-neo-black truncate">
                    {email.from_name || email.from_address}
                  </p>
                  <p className="text-xs text-neo-gray truncate font-medium">{email.from_address}</p>
                </div>
                <div className="mb-3">
                  <p className="text-sm font-bold text-neo-black truncate">
                    {email.subject || t('mailbox.noSubject')}
                  </p>
                  <p className="text-xs text-neo-gray line-clamp-2 mt-1 font-medium">
                    {email.body_text || t('mailbox.noContent')}
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs text-neo-gray font-medium">
                  <span>{formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}</span>
                  <span>{formatSize(email.size_bytes)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.total > data.limit && (
          <div className="flex justify-center items-center mt-6 gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border-3 border-neo-black rounded-neo-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-bold active:translate-x-0.5 active:translate-y-0.5 transition-all"
            >
              {t('common.previous')}
            </button>
            <span className="px-4 py-2 text-neo-black font-bold">
              {t('mailbox.page')} {page} {t('mailbox.of')} {Math.ceil(data.total / data.limit)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(data.total / data.limit)}
              className="px-4 py-2 border-3 border-neo-black rounded-neo-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-bold active:translate-x-0.5 active:translate-y-0.5 transition-all"
            >
              {t('common.next')}
            </button>
          </div>
        )}
      </main>

      {/* Batch Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showBatchDeleteDialog}
        title={t('common.confirm')}
        message={t('email.confirmDeleteMultiple', { count: selectedEmails.length })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={confirmBatchDelete}
        onCancel={() => setShowBatchDeleteDialog(false)}
        isLoading={deleteEmails.isPending}
      />
    </div>
  );
}
