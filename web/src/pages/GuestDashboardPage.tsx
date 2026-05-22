/**
 * Guest Dashboard Page - No login required
 * Creates temporary mailbox and auto-refreshes emails
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from '../utils/date';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import MobileMenu from '../components/MobileMenu';
import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface Email {
  id: number;
  from_address: string;
  from_name?: string;
  to_address: string;
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

interface Mailbox {
  id: number;
  address: string;
  created_at: string;
  expires_at: string;
  is_guest: boolean;
}

export default function GuestDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { enterGuestMode } = useAuthStore();
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [isCreatingMailbox, setIsCreatingMailbox] = useState(false);
  const intervalRef = useRef<number | null>(null);

  // Enter guest mode on mount
  useEffect(() => {
    enterGuestMode();
    createGuestMailbox();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enterGuestMode]);

  // Create guest mailbox
  const createGuestMailbox = async () => {
    setIsCreatingMailbox(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/mailbox/create-guest`);
      if (response.data.success) {
        setMailbox(response.data.data);
        toast.success(t('guest.mailboxCreated'));
      }
    } catch (error: any) {
      console.error('Failed to create guest mailbox:', error);
      toast.error(t('guest.mailboxCreateFailed'));
    } finally {
      setIsCreatingMailbox(false);
    }
  };

  // Fetch emails for guest mailbox
  const { data: emailsData, refetch } = useQuery<EmailListResponse>({
    queryKey: ['guest-emails', mailbox?.address],
    queryFn: async () => {
      if (!mailbox) return { emails: [], total: 0, page: 1, limit: 20 };

      const response = await axios.get(
        `${API_BASE_URL}/api/emails/guest/${mailbox.address}?page=1&limit=20`
      );
      return response.data.data;
    },
    enabled: !!mailbox,
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  // Fetch email detail
  const fetchEmailDetail = async (emailId: number) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/email/guest/${emailId}`);
      if (response.data.success) {
        setSelectedEmail(response.data.data);
      }
    } catch (error) {
      toast.error(t('email.fetchFailed'));
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('common.copied'));
  };

  // Refresh page (create new mailbox)
  const refreshMailbox = () => {
    window.location.reload();
  };

  const emails = emailsData?.emails || [];
  const expiresAt = mailbox?.expires_at ? new Date(mailbox.expires_at) : null;

  return (
    <div className="min-h-screen bg-neo-warm-white bg-grain">
      {/* Header */}
      <header className="bg-white border-b-3 border-neo-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-neo-black">{t('app.title')}</h1>
              <span className="badge-neo bg-neo-cyan text-neo-black text-xs">
                <span role="img" aria-label="Guest mode">🎭</span> {t('guest.title')}
              </span>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <LanguageSwitcher />
              <button
                onClick={() => navigate('/register')}
                className="btn-neo-primary text-sm px-4 py-2"
              >
                {t('auth.register')}
              </button>
              <button
                onClick={() => navigate('/login')}
                className="btn-neo-ghost text-sm px-4 py-2"
              >
                {t('auth.login')}
              </button>
            </div>
            <MobileMenu>
              <div className="px-3 py-2"><LanguageSwitcher /></div>
              <button
                onClick={() => navigate('/register')}
                className="w-full text-left px-3 py-2 text-sm font-bold text-neo-black bg-neo-yellow hover:bg-yellow-500 rounded-neo border-2 border-neo-black"
              >
                {t('auth.register')}
              </button>
              <button
                onClick={() => navigate('/login')}
                className="w-full text-left px-3 py-2 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo border-2 border-neo-black"
              >
                {t('auth.login')}
              </button>
            </MobileMenu>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Warning Banner */}
        <div className="mb-6 card-neo bg-neo-yellow border-neo-black">
          <div className="flex items-start gap-4">
            <svg className="w-6 h-6 text-neo-black flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-bold text-neo-black">
                ⚠️ {t('guest.warning')}
              </p>
              <p className="text-sm text-neo-black mt-1">
                {t('guest.warningText')}
              </p>
            </div>
          </div>
        </div>

        {/* Mailbox Info */}
        {isCreatingMailbox ? (
          <div className="card-neo text-center py-16">
            <div className="animate-neo-spin rounded-full h-12 w-12 border-4 border-neo-black border-t-neo-cyan mx-auto"></div>
            <p className="mt-4 text-neo-gray font-medium">{t('guest.creating')}</p>
          </div>
        ) : mailbox ? (
          <div className="card-neo mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-neo-black heading-neo">
                <span role="img" aria-label="Email">📧</span> {t('guest.yourMailbox')}
              </h2>
              <button
                onClick={refreshMailbox}
                className="btn-neo-ghost text-sm px-3 py-2"
              >
                🔄 {t('guest.newMailbox')}
              </button>
            </div>

            <div className="bg-neo-warm-white border-3 border-neo-black rounded-neo-lg p-5">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs font-bold text-neo-gray mb-2">
                    {t('mailbox.address')}
                  </p>
                  <p className="text-xl font-bold font-mono text-neo-black break-all">
                    {mailbox.address}
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(mailbox.address)}
                  className="btn-neo-primary px-4 py-3 whitespace-nowrap"
                >
                  📋 {t('common.copy')}
                </button>
              </div>

              {expiresAt && (
                <div className="mt-4 pt-4 border-t-2 border-neo-black/10">
                  <p className="text-sm font-medium text-neo-gray">
                    ⏰ {t('mailbox.expiresIn')}: <span className="font-bold text-neo-red">{formatDistanceToNow(expiresAt)}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Email List & Detail */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Email List */}
          <div className="lg:col-span-1">
            <div className="card-neo">
              <div className="flex items-center justify-between mb-4 pb-4 border-b-3 border-neo-black">
                <h3 className="font-bold text-neo-black">
                  📬 {t('email.inbox')} ({emails.length})
                </h3>
                <button
                  onClick={() => refetch()}
                  className="text-neo-blue hover:text-neo-cyan text-sm font-bold transition-colors"
                >
                  🔄
                </button>
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {emails.length === 0 ? (
                  <div className="py-16 text-center">
                    <svg className="w-16 h-16 mx-auto text-neo-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
                    </svg>
                    <p className="mt-4 text-neo-gray font-medium text-sm">📭 {t('email.noEmails')}</p>
                    <p className="text-xs text-neo-gray mt-2">{t('guest.autoRefresh')}</p>
                  </div>
                ) : (
                  emails.map((email) => (
                    <div
                      key={email.id}
                      onClick={() => fetchEmailDetail(email.id)}
                      className={`relative p-4 rounded-neo-lg border-2 border-neo-black cursor-pointer transition-all hover:shadow-neo ${
                        selectedEmail?.id === email.id
                          ? 'bg-neo-cyan border-3'
                          : 'bg-white hover:translate-x-0.5 hover:translate-y-0.5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-neo-black truncate">
                            {email.from_name || email.from_address}
                          </p>
                          <p className="text-sm text-neo-gray truncate mt-1">
                            {email.subject || t('email.noSubject')}
                          </p>
                          <p className="text-xs text-neo-gray mt-1 font-medium">
                            {formatDistanceToNow(new Date(email.received_at))}
                          </p>
                        </div>
                        {!email.is_read && (
                          <span className="flex-shrink-0 h-2 w-2 bg-neo-blue rounded-full"></span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Email Detail */}
          <div className="lg:col-span-2">
            <div className="card-neo min-h-[300px] sm:min-h-[600px]">
              {selectedEmail ? (
                <div>
                  <div className="mb-6 pb-6 border-b-3 border-neo-black">
                    <h2 className="text-2xl font-bold text-neo-black mb-4">
                      {selectedEmail.subject || t('email.noSubject')}
                    </h2>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-neo-gray min-w-[60px]">{t('email.from')}:</span>
                        <div className="flex-1">
                          <span className="font-medium text-neo-black">
                            {selectedEmail.from_name || selectedEmail.from_address}
                          </span>
                          {selectedEmail.from_name && (
                            <span className="text-neo-gray ml-2">
                              &lt;{selectedEmail.from_address}&gt;
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neo-gray min-w-[60px]">{t('email.to')}:</span>
                        <span className="font-mono text-sm text-neo-black">{selectedEmail.to_address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neo-gray min-w-[60px]">{t('email.received')}:</span>
                        <span className="text-neo-black">{new Date(selectedEmail.received_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="prose max-w-none">
                    {selectedEmail.body_html ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                        className="email-content text-neo-black"
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm text-neo-black bg-neo-warm-white p-4 rounded-neo-lg border-2 border-neo-black/10 font-sans">
                        {selectedEmail.body_text}
                      </pre>
                    )}
                  </div>

                  {selectedEmail.has_attachments && (
                    <div className="mt-6 pt-6 border-t-3 border-neo-black">
                      <p className="text-sm font-bold text-neo-black">
                        📎 {t('email.hasAttachments')}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center py-24">
                  <div>
                    <svg className="w-20 h-20 mx-auto text-neo-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <p className="mt-4 text-neo-gray font-medium">{t('email.selectEmail')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CTA - Register */}
        <div className="mt-8 card-neo bg-gradient-to-r from-neo-magenta to-neo-blue text-white border-neo-black">
          <div className="text-center py-8">
            <h3 className="text-2xl sm:text-3xl font-bold mb-3 heading-neo"><span role="img" aria-label="Sparkles">✨</span> {t('guest.ctaTitle')}</h3>
            <p className="mb-8 text-white/90 text-lg font-medium max-w-2xl mx-auto">
              {t('guest.ctaText')}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={() => navigate('/register')}
                className="btn-neo bg-white text-neo-black hover:bg-neo-yellow px-6 sm:px-8 py-4 text-lg"
              >
                🚀 {t('auth.register')}
              </button>
              <button
                onClick={() => navigate('/login')}
                className="btn-neo bg-neo-black text-white hover:bg-neo-black/80 px-6 sm:px-8 py-4 text-lg"
              >
                {t('auth.login')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
