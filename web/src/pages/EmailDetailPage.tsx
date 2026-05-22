/**
 * Email Detail Page - Display full email content
 */

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import toast from 'react-hot-toast';
import { format } from '../utils/date';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import MobileMenu from '../components/MobileMenu';
import ConfirmDialog from '../components/ConfirmDialog';

interface Attachment {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
}

interface EmailDetail {
  id: number;
  mailbox_id: number;
  from_address: string;
  from_name?: string;
  to_address: string;
  subject: string;
  body_text?: string;
  body_html?: string;
  headers: Record<string, string>;
  is_read: boolean;
  received_at: string;
  size_bytes: number;
  attachments: Attachment[];
}

export default function EmailDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showRaw, setShowRaw] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch email details - always fetch full content from API
  const { data: email, isLoading } = useQuery<EmailDetail>({
    queryKey: ['email', id],
    queryFn: async () => {
      const response = await apiClient.get(`/api/email/${id}`);
      return {
        ...response.data,
        attachments: response.data.attachments ?? [],
      };
    },
    enabled: !!id,
  });

  // Delete email
  const deleteEmail = useMutation({
    mutationFn: async () => {
      return apiClient.delete(`/api/email/${id}`);
    },
    onSuccess: () => {
      // Invalidate mailboxes query to update email counts in Dashboard
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      toast.success(t('email.deletedSingle'));
      navigate(-1);
    },
  });

  // Handle delete with confirmation
  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  // Confirm delete action
  const confirmDelete = () => {
    deleteEmail.mutate();
    setShowDeleteDialog(false);
  };

  // Download attachment
  const downloadAttachment = async (attachmentId: number, filename: string) => {
    try {
      const response = await apiClient.get(`/api/attachment/${attachmentId}/download`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(t('email.attachmentDownloaded'));
    } catch (error) {
      toast.error(t('email.attachmentDownloadFailed'));
    }
  };

  // View raw email
  const viewRawEmail = async () => {
    try {
      const response = await apiClient.get(`/api/email/${id}/raw`);
      const blob = new Blob([response.data.raw_content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(t('email.rawEmailFailed'));
    }
  };

  // Format file size
  const formatSize = (bytes: number | null | undefined) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Sanitize HTML content for safe display
  const sanitizedHtml = useMemo(() => {
    if (!email?.body_html) return '';

    // Configure DOMPurify for email content
    const config = {
      ALLOWED_TAGS: [
        'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo',
        'blockquote', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
        'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em',
        'fieldset', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'header', 'hr', 'i', 'img', 'ins', 'kbd', 'label', 'legend', 'li', 'main', 'map',
        'mark', 'nav', 'noscript', 'ol', 'optgroup', 'option', 'p', 'picture', 'pre',
        'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'section', 'select', 'small',
        'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody',
        'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'track', 'u',
        'ul', 'var', 'video', 'wbr'
      ],
      ALLOWED_ATTR: [
        'align', 'alt', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'class', 'color',
        'cols', 'colspan', 'coords', 'datetime', 'dir', 'height', 'href', 'id', 'lang',
        'name', 'rel', 'rowspan', 'scope', 'size', 'span', 'src', 'start', 'style', 'target',
        'title', 'type', 'valign', 'value', 'width'
      ],
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      ADD_TAGS: ['style'],
      ADD_ATTR: ['target'],
      KEEP_CONTENT: true,
      FORCE_BODY: true,
    };

    const clean = DOMPurify.sanitize(email.body_html, config);
    return `<head><base target="_blank"></head>${clean}`;
  }, [email?.body_html]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-neo-spin rounded-full h-12 w-12 border-4 border-neo-black border-t-neo-cyan"></div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-neo-black mb-2">{t('email.emailNotFound')}</h2>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 btn-neo-primary"
          >
            {t('email.goBack')}
          </button>
        </div>
      </div>
    );
  }

  const attachments = email.attachments ?? [];

  return (
    <div className="min-h-screen bg-neo-warm-white bg-grain">
      {/* Header */}
      <header className="bg-white border-b-3 border-neo-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <button
              onClick={() => navigate(-1)}
              className="px-3 py-1.5 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all"
            >
              ← {t('email.backToMailbox')}
            </button>
            <div className="hidden md:flex items-center gap-3">
              <LanguageSwitcher />
              <button
                onClick={viewRawEmail}
                className="px-3 py-1.5 text-sm font-bold text-neo-black bg-white hover:bg-gray-50 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all"
              >
                {t('email.viewRaw')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteEmail.isPending}
                className="px-3 py-1.5 text-sm font-bold text-white bg-neo-magenta hover:bg-pink-500 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.delete')}
              </button>
            </div>
            <MobileMenu>
              <div className="px-3 py-2"><LanguageSwitcher /></div>
              <button
                onClick={viewRawEmail}
                className="w-full text-left px-3 py-2 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo border-2 border-neo-black"
              >
                {t('email.viewRaw')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteEmail.isPending}
                className="w-full text-left px-3 py-2 text-sm font-bold text-white bg-neo-magenta hover:bg-pink-500 rounded-neo border-2 border-neo-black disabled:opacity-50"
              >
                {t('common.delete')}
              </button>
            </MobileMenu>
          </div>
        </div>
      </header>

      {/* Email Content */}
      <main id="main-content" className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white border-3 border-neo-black rounded-neo-xl">
          {/* Email Header */}
          <div className="p-4 sm:p-6 border-b-3 border-neo-black">
            <h1 className="text-2xl sm:text-3xl font-bold text-neo-black heading-neo mb-6">
              {email.subject || t('email.noSubject')}
            </h1>

            <div className="space-y-3 text-sm">
              <div className="flex">
                <span className="w-24 text-neo-black font-bold">{t('email.from')}:</span>
                <span className="text-neo-black font-medium">
                  {email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}
                </span>
              </div>
              <div className="flex">
                <span className="w-24 text-neo-black font-bold">{t('email.to')}:</span>
                <span className="text-neo-black font-medium">{email.to_address}</span>
              </div>
              <div className="flex">
                <span className="w-24 text-neo-black font-bold">{t('email.date')}:</span>
                <span className="text-neo-black font-medium">
                  {format(new Date(email.received_at), 'PPpp')}
                </span>
              </div>
              <div className="flex">
                <span className="w-24 text-neo-black font-bold">{t('email.size')}:</span>
                <span className="text-neo-black font-medium tabular-nums-neo">{formatSize(email.size_bytes)}</span>
              </div>
            </div>

            {/* Show/Hide Headers */}
            <button
              onClick={() => setShowHeaders(!showHeaders)}
              className="mt-4 px-3 py-1.5 text-sm font-bold text-neo-black bg-white hover:bg-gray-50 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all"
            >
              {showHeaders ? t('email.hideHeaders') : t('email.showHeaders')}
            </button>

            {showHeaders && (
              <div className="mt-4 p-4 bg-white border-3 border-neo-black rounded-neo text-xs font-mono">
                {Object.entries(email.headers).map(([key, value]) => (
                  <div key={key} className="break-all">
                    <span className="font-bold">{key}:</span> {value}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Email Body */}
          <div className="p-6">
            {email.body_html && !showRaw ? (
              <div className="prose max-w-none">
                <iframe
                srcDoc={sanitizedHtml}
                  className="w-full border-0"
                  style={{ minHeight: '400px' }}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  title="Email content"
                  onLoad={(e) => {
                    const iframe = e.target as HTMLIFrameElement;
                    const doc = iframe.contentDocument;
                    if (doc) {
                      // Inject base styles for better email rendering
                      const style = doc.createElement('style');
                      style.textContent = `
                        body {
                          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                          line-height: 1.6;
                          color: #333;
                          padding: 1rem;
                          margin: 0;
                        }
                        img { max-width: 100%; height: auto; }
                        a { color: #0066cc; }
                      `;
                      doc.head.appendChild(style);
                      // Force all links to open in new tab
                      const links = doc.querySelectorAll('a[href]');
                      links.forEach((link) => {
                        link.setAttribute('target', '_blank');
                        link.setAttribute('rel', 'noopener noreferrer');
                      });
                      // Adjust iframe height to content
                      iframe.style.height = doc.body.scrollHeight + 20 + 'px';
                    }
                  }}
                />
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-neo-black">
                {email.body_text || t('email.noTextContent')}
              </div>
            )}

            {/* Toggle Plain/HTML */}
            {email.body_html && (
              <div className="mt-4 pt-4 border-t-3 border-neo-black">
                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="px-3 py-1.5 text-sm font-bold text-neo-black bg-white hover:bg-gray-50 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all"
                >
                  {showRaw ? t('email.showHtml') : t('email.showPlainText')}
                </button>
              </div>
            )}
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="p-6 border-t-3 border-neo-black">
              <h3 className="text-xl font-bold text-neo-black mb-4">
                {t('email.attachments')} ({attachments.length})
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between p-4 border-3 border-neo-black rounded-neo-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center min-w-0 gap-3">
                      <svg
                        className="w-8 h-8 text-neo-black flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-neo-black truncate">
                          {attachment.filename}
                        </p>
                        <p className="text-xs text-neo-gray font-medium tabular-nums-neo">
                          {attachment.content_type} • {formatSize(attachment.size_bytes)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadAttachment(attachment.id, attachment.filename)}
                      className="ml-3 px-3 py-2 bg-neo-cyan text-neo-black text-sm font-bold rounded-neo-lg border-3 border-neo-black hover:bg-cyan-500 active:translate-x-0.5 active:translate-y-0.5 transition-all"
                    >
                      {t('email.download')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-6 flex flex-col sm:flex-row justify-between gap-3">
          <button
            onClick={() => navigate(-1)}
            className="btn-neo-ghost"
          >
            {t('email.backToMailbox')}
          </button>
          <div className="flex gap-3">
            <button
              onClick={viewRawEmail}
              className="btn-neo-ghost"
            >
              {t('email.downloadOriginal')}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteEmail.isPending}
              className="btn-neo-danger disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('email.deleteEmail')}
            </button>
          </div>
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title={t('common.confirm')}
        message={t('email.confirmDelete')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
        isLoading={deleteEmail.isPending}
      />
    </div>
  );
}
