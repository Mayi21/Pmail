import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-neo-warm-white flex items-center justify-center p-6">
      <div className="bg-white border-3 border-neo-black rounded-neo-xl p-16 text-center max-w-md">
        <div className="text-8xl font-bold text-neo-black mb-6 heading-neo-display">404</div>
        <h1 className="text-3xl font-bold text-neo-black mb-4 heading-neo">{t('notFound.title')}</h1>
        <p className="text-neo-gray font-medium mb-8">{t('notFound.message')}</p>
        <a
          href="/dashboard"
          className="btn-neo-primary inline-block"
        >
          {t('notFound.goToDashboard')}
        </a>
      </div>
    </div>
  );
}
