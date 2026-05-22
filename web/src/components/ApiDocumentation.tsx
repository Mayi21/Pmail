import React from 'react';
import { useTranslation } from 'react-i18next';
import { ApiEndpointCard } from './ApiEndpointCard';
import { apiEndpointGroups } from '../data/api-endpoints';

export const ApiDocumentation: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <svg className="w-8 h-8 text-neo-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <h2 className="text-3xl font-black text-neo-black">{t('apiDocs.title')}</h2>
        </div>
        <p className="text-gray-700 text-lg">{t('apiDocs.subtitle')}</p>
      </div>

      {/* API Key Notice */}
      <div className="card-neo mb-8 bg-neo-yellow border-neo-black p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6 text-neo-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-2">{t('apiDocs.notice.title')}</h3>
            <p className="text-gray-800 mb-3">{t('apiDocs.notice.description')}</p>
            <p className="text-sm text-gray-700">
              {t('apiDocs.notice.hint')}{' '}
              <span className="font-mono bg-white px-2 py-1 rounded border-2 border-neo-black">
                X-API-Key: YOUR_API_KEY
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Authentication Section */}
      <div className="card-neo mb-8 p-6">
        <h3 className="font-bold text-xl mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('apiDocs.authentication.title')}
        </h3>
        <div className="space-y-3 text-gray-700">
          <p>{t('apiDocs.authentication.description')}</p>
          <div className="bg-gray-50 p-4 rounded-neo-lg border-2 border-gray-300">
            <p className="font-semibold mb-2">{t('apiDocs.authentication.baseUrl')}</p>
            <code className="text-sm font-mono bg-white px-3 py-2 rounded border-2 border-neo-black block">
              https://api.your-domain.com
            </code>
          </div>
          <div className="bg-gray-50 p-4 rounded-neo-lg border-2 border-gray-300">
            <p className="font-semibold mb-2">{t('apiDocs.authentication.headerFormat')}</p>
            <code className="text-sm font-mono bg-white px-3 py-2 rounded border-2 border-neo-black block">
              X-API-Key: your_api_key_here
            </code>
          </div>
        </div>
      </div>

      {/* Rate Limiting Section */}
      <div className="card-neo mb-8 bg-neo-yellow border-neo-black p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6 text-neo-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-xl mb-3 flex items-center gap-2">
              {t('apiDocs.rateLimit.title')}
            </h3>
            <p className="text-gray-800 mb-4">{t('apiDocs.rateLimit.description')}</p>

            <div className="bg-white p-4 rounded-neo-lg border-2 border-neo-black mb-4">
              <p className="font-semibold mb-2">{t('apiDocs.rateLimit.currentLimit')}</p>
              <div className="flex items-center gap-2">
                <span className="inline-block bg-neo-magenta text-white px-3 py-1 rounded-neo border-2 border-neo-black font-bold">
                  {t('apiDocs.rateLimit.perMinute')}
                </span>
                <span className="text-sm text-gray-600">({t('apiDocs.rateLimit.basedOn')})</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-neo-lg border-2 border-neo-black mb-4">
              <p className="font-semibold mb-3">{t('apiDocs.rateLimit.headers')}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-neo-black">
                      <th className="text-left py-2 px-3 font-bold">{t('apiDocs.rateLimit.headerName')}</th>
                      <th className="text-left py-2 px-3 font-bold">{t('apiDocs.rateLimit.headerDescription')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-200">
                      <td className="py-2 px-3 font-mono text-xs">X-RateLimit-Limit</td>
                      <td className="py-2 px-3 text-gray-700">{t('apiDocs.rateLimit.limitDesc')}</td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="py-2 px-3 font-mono text-xs">X-RateLimit-Remaining</td>
                      <td className="py-2 px-3 text-gray-700">{t('apiDocs.rateLimit.remainingDesc')}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono text-xs">X-RateLimit-Reset</td>
                      <td className="py-2 px-3 text-gray-700">{t('apiDocs.rateLimit.resetDesc')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-neo-lg border-2 border-gray-300">
              <p className="font-semibold mb-2">{t('apiDocs.rateLimit.errorExample')}</p>
              <pre className="text-xs font-mono bg-white p-3 rounded border-2 border-neo-black overflow-x-auto">
{`{
  "success": false,
  "error": "Too many requests",
  "error_code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 60
}`}
              </pre>
            </div>

            <div className="mt-4 p-3 bg-white rounded-neo border-2 border-neo-black">
              <p className="text-sm text-gray-700">
                <span className="font-bold text-neo-magenta">💡 {t('apiDocs.rateLimit.tip')}</span> {t('apiDocs.rateLimit.tipText')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* API Endpoints by Group */}
      {apiEndpointGroups.map((group, groupIdx) => (
        <div key={groupIdx} className="mb-10">
          {/* Group Header */}
          <div className="mb-6">
            <h3 className="text-2xl font-black text-neo-black mb-2">{t(group.title)}</h3>
            <p className="text-gray-600">{t(group.description)}</p>
          </div>

          {/* Group Endpoints */}
          <div className="space-y-4">
            {group.endpoints.map((endpoint) => (
              <ApiEndpointCard key={endpoint.id} endpoint={endpoint} />
            ))}
          </div>
        </div>
      ))}

      {/* Footer Note */}
      <div className="mt-12 p-6 bg-neo-warm-white rounded-neo-lg border-3 border-neo-black">
        <h4 className="font-bold text-lg mb-3">{t('apiDocs.footer.title')}</h4>
        <ul className="space-y-2 text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-neo-magenta font-bold">•</span>
            <span>{t('apiDocs.footer.rateLimit')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-neo-magenta font-bold">•</span>
            <span>{t('apiDocs.footer.errorHandling')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-neo-magenta font-bold">•</span>
            <span>{t('apiDocs.footer.support')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
