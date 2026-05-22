import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiEndpoint } from '../types/api-docs';

interface ApiEndpointCardProps {
  endpoint: ApiEndpoint;
}

export const ApiEndpointCard: React.FC<ApiEndpointCardProps> = ({ endpoint }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = async (code: string, type: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(type);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET':
        return 'bg-neo-cyan text-neo-black';
      case 'POST':
        return 'bg-neo-yellow text-neo-black';
      case 'DELETE':
        return 'bg-neo-magenta text-white';
      default:
        return 'bg-gray-200 text-neo-black';
    }
  };

  const getPermissionColor = (permission: string) => {
    return permission === 'read'
      ? 'bg-green-200 text-green-800 border-green-800'
      : 'bg-orange-200 text-orange-800 border-orange-800';
  };

  return (
    <div className="card-neo mb-4">
      {/* Card Header - Clickable */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors rounded-neo-lg"
      >
        <div className="flex items-center gap-3 flex-1">
          {/* HTTP Method Badge */}
          <span className={`badge-neo px-3 py-1 font-bold ${getMethodColor(endpoint.method)}`}>
            {endpoint.method}
          </span>

          {/* Endpoint Path */}
          <code className="font-mono text-sm font-semibold text-neo-black">
            {endpoint.path}
          </code>

          {/* Permission Badges */}
          <div className="flex gap-2">
            {endpoint.permissions.map((perm) => (
              <span
                key={perm}
                className={`badge-neo text-xs px-2 py-0.5 ${getPermissionColor(perm)}`}
              >
                {perm}
              </span>
            ))}
          </div>
        </div>

        {/* Expand Icon */}
        {isExpanded ? (
          <svg className="w-5 h-5 text-neo-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-neo-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Card Body - Expandable */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-6 border-t-3 border-neo-black mt-2 pt-4">
          {/* Summary */}
          <div>
            <h4 className="font-bold text-lg mb-2">{t(endpoint.summary)}</h4>
            <p className="text-gray-700">{t(endpoint.description)}</p>
          </div>

          {/* Parameters */}
          {endpoint.parameters && endpoint.parameters.length > 0 && (
            <div>
              <h5 className="font-bold text-md mb-3">{t('apiDocs.parameters')}</h5>
              <div className="overflow-x-auto">
                <table className="w-full border-3 border-neo-black">
                  <thead className="bg-neo-warm-white">
                    <tr>
                      <th className="border-3 border-neo-black px-3 py-2 text-left font-bold">
                        {t('apiDocs.paramName')}
                      </th>
                      <th className="border-3 border-neo-black px-3 py-2 text-left font-bold">
                        {t('apiDocs.paramIn')}
                      </th>
                      <th className="border-3 border-neo-black px-3 py-2 text-left font-bold">
                        {t('apiDocs.paramType')}
                      </th>
                      <th className="border-3 border-neo-black px-3 py-2 text-left font-bold">
                        {t('apiDocs.paramRequired')}
                      </th>
                      <th className="border-3 border-neo-black px-3 py-2 text-left font-bold">
                        {t('apiDocs.paramDescription')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoint.parameters.map((param, idx) => (
                      <tr key={idx} className="bg-white">
                        <td className="border-3 border-neo-black px-3 py-2 font-mono text-sm">
                          {param.name}
                        </td>
                        <td className="border-3 border-neo-black px-3 py-2">
                          <code className="text-sm">{param.in}</code>
                        </td>
                        <td className="border-3 border-neo-black px-3 py-2">
                          <code className="text-sm">{param.type}</code>
                        </td>
                        <td className="border-3 border-neo-black px-3 py-2">
                          {param.required ? (
                            <span className="text-red-600 font-bold">{t('apiDocs.yes')}</span>
                          ) : (
                            <span className="text-gray-500">{t('apiDocs.no')}</span>
                          )}
                        </td>
                        <td className="border-3 border-neo-black px-3 py-2">
                          {t(param.description)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Request Body */}
          {endpoint.requestBody && (
            <div>
              <h5 className="font-bold text-md mb-3">{t('apiDocs.requestBody')}</h5>
              <div className="bg-gray-900 text-green-400 p-4 rounded-neo-lg border-3 border-neo-black overflow-x-auto">
                <pre className="text-sm font-mono">
                  {JSON.stringify(endpoint.requestBody.example, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Code Examples */}
          <div>
            <h5 className="font-bold text-md mb-3">{t('apiDocs.examples')}</h5>

            {/* cURL Example */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">cURL</span>
                <button
                  onClick={() => handleCopy(endpoint.curlExample, 'curl')}
                  className="btn-neo-ghost px-3 py-1 text-sm flex items-center gap-2"
                >
                  {copiedCode === 'curl' ? (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {t('apiDocs.copied')}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {t('apiDocs.copy')}
                    </>
                  )}
                </button>
              </div>
              <div className="bg-gray-900 text-green-400 p-4 rounded-neo-lg border-3 border-neo-black overflow-x-auto">
                <pre className="text-sm font-mono whitespace-pre-wrap">{endpoint.curlExample}</pre>
              </div>
            </div>

            {/* JavaScript Example */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">JavaScript</span>
                <button
                  onClick={() => handleCopy(endpoint.jsExample, 'js')}
                  className="btn-neo-ghost px-3 py-1 text-sm flex items-center gap-2"
                >
                  {copiedCode === 'js' ? (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {t('apiDocs.copied')}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {t('apiDocs.copy')}
                    </>
                  )}
                </button>
              </div>
              <div className="bg-gray-900 text-green-400 p-4 rounded-neo-lg border-3 border-neo-black overflow-x-auto">
                <pre className="text-sm font-mono whitespace-pre-wrap">{endpoint.jsExample}</pre>
              </div>
            </div>
          </div>

          {/* Response Examples */}
          <div>
            <h5 className="font-bold text-md mb-3">{t('apiDocs.responses')}</h5>
            {endpoint.responses.map((response, idx) => (
              <div key={idx} className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`badge-neo px-2 py-1 font-bold ${
                      response.status === 200
                        ? 'bg-green-200 text-green-800 border-green-800'
                        : 'bg-red-200 text-red-800 border-red-800'
                    }`}
                  >
                    {response.status}
                  </span>
                  <span className="text-sm text-gray-700">{t(response.description)}</span>
                </div>
                <div className="bg-gray-900 text-green-400 p-4 rounded-neo-lg border-3 border-neo-black overflow-x-auto">
                  <pre className="text-sm font-mono">
                    {JSON.stringify(response.example, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
