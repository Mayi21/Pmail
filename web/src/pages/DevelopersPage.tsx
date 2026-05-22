/**
 * Developers Page - AI-Friendly API Documentation
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.your-domain.com';

// Copy to clipboard helper
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="btn-neo-ghost px-3 py-1 text-sm flex items-center gap-2"
    >
      {copied ? (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          已复制
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          复制
        </>
      )}
    </button>
  );
}

// Code block component
function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="relative">
      <pre className="bg-gray-900 text-green-400 p-4 rounded-neo-lg overflow-x-auto text-sm font-mono border-3 border-neo-black">
        <code>{code}</code>
      </pre>
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <span className="text-xs text-gray-500 font-bold">{language}</span>
        <CopyButton text={code} />
      </div>
    </div>
  );
}

// JSON block with syntax highlighting (simple version)
function JsonBlock({ json }: { json: object }) {
  return (
    <div className="relative">
      <pre className="bg-gray-50 p-4 rounded-neo-lg overflow-x-auto text-sm font-mono border-3 border-neo-black">
        <code>{JSON.stringify(json, null, 2)}</code>
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton text={JSON.stringify(json, null, 2)} />
      </div>
    </div>
  );
}

// Method badge
function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-neo-cyan text-neo-black',
    POST: 'bg-neo-yellow text-neo-black',
    DELETE: 'bg-neo-magenta text-white',
    PATCH: 'bg-neo-yellow text-neo-black',
    PUT: 'bg-neo-cyan text-neo-black',
  };

  return (
    <span className={`badge-neo px-3 py-1 text-xs font-bold ${colors[method] || 'bg-gray-200'}`}>
      {method}
    </span>
  );
}

// Endpoint card
function EndpointCard({
  method,
  path,
  description,
  requestParams,
  requestExample,
  responseExample,
  curlExample,
  jsExample,
}: {
  method: string;
  path: string;
  description: string;
  requestParams?: object;
  requestExample?: object;
  responseExample: object;
  curlExample: string;
  jsExample: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="card-neo overflow-hidden">
      {/* Header */}
      <div
        className="p-4 bg-neo-warm-white cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MethodBadge method={method} />
            <code className="text-sm font-mono font-bold text-neo-black">{path}</code>
          </div>
          <svg
            className={`w-5 h-5 text-neo-black transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <p className="mt-2 text-sm text-neo-black">{description}</p>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-6">
          {/* Request Parameters */}
          {requestParams && (
            <div>
              <h4 className="text-sm font-bold text-neo-black mb-2">请求参数 (JSON)</h4>
              <JsonBlock json={requestParams} />
            </div>
          )}

          {/* Request Example */}
          {requestExample && (
            <div>
              <h4 className="text-sm font-bold text-neo-black mb-2">请求示例</h4>
              <JsonBlock json={requestExample} />
            </div>
          )}

          {/* Response Example */}
          <div>
            <h4 className="text-sm font-bold text-neo-black mb-2">响应示例</h4>
            <JsonBlock json={responseExample} />
          </div>

          {/* cURL Example */}
          <div>
            <h4 className="text-sm font-bold text-neo-black mb-2">cURL 示例</h4>
            <CodeBlock code={curlExample} language="bash" />
          </div>

          {/* JavaScript Example */}
          <div>
            <h4 className="text-sm font-bold text-neo-black mb-2">JavaScript 示例</h4>
            <CodeBlock code={jsExample} language="javascript" />
          </div>
        </div>
      )}
    </div>
  );
}

// Error code table row
function ErrorRow({ code, message }: { code: string; message: string }) {
  return (
    <tr className="border-b-2 border-neo-black">
      <td className="py-2 px-3 font-mono font-bold text-neo-red">{code}</td>
      <td className="py-2 px-3 text-sm">{message}</td>
    </tr>
  );
}

export default function DevelopersPage() {
  const endpoints = [
    {
      method: 'POST',
      path: '/v1/mailbox',
      description: '创建一个新的临时邮箱',
      requestParams: {
        prefix: 'string (可选) 邮箱前缀，1-10个字母或数字',
        expires_in: 'number (必填) 过期时间(秒)，最小60，最大86400',
      },
      requestExample: {
        prefix: 'test',
        expires_in: 3600,
      },
      responseExample: {
        success: true,
        data: {
          id: 1,
          address: 'test@example.your-domain.com',
          created_at: '2024-01-01T00:00:00Z',
          expires_at: '2024-01-01T01:00:00Z',
          email_count: 0,
          unread_count: 0,
          is_expired: false,
        },
      },
      curlExample: `curl -X POST "${BASE_URL}/v1/mailbox" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{"prefix": "test", "expires_in": 3600}'`,
      jsExample: `const response = await fetch('${BASE_URL}/v1/mailbox', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'YOUR_API_KEY'
  },
  body: JSON.stringify({
    prefix: 'test',
    expires_in: 3600
  })
});
const data = await response.json();
console.log(data.address); // test@example.your-domain.com`,
    },
    {
      method: 'GET',
      path: '/v1/mailboxes',
      description: '获取当前用户的所有邮箱列表',
      responseExample: {
        success: true,
        data: [
          {
            id: 1,
            address: 'test@example.your-domain.com',
            created_at: '2024-01-01T00:00:00Z',
            expires_at: '2024-01-01T01:00:00Z',
            email_count: 5,
            unread_count: 2,
            is_expired: false,
          },
        ],
      },
      curlExample: `curl -X GET "${BASE_URL}/v1/mailboxes" \\
  -H "X-API-Key: YOUR_API_KEY"`,
      jsExample: `const response = await fetch('${BASE_URL}/v1/mailboxes', {
  method: 'GET',
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
});
const data = await response.json();
console.log(data.data); // Array of mailboxes`,
    },
    {
      method: 'DELETE',
      path: '/v1/mailbox/{address}',
      description: '删除指定的邮箱',
      responseExample: {
        success: true,
        message: 'Mailbox deleted successfully',
      },
      curlExample: `curl -X DELETE "${BASE_URL}/v1/mailbox/test@example.your-domain.com" \\
  -H "X-API-Key: YOUR_API_KEY"`,
      jsExample: `const response = await fetch('${BASE_URL}/v1/mailbox/test@example.your-domain.com', {
  method: 'DELETE',
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
});
const data = await response.json();
console.log(data.success); // true`,
    },
    {
      method: 'GET',
      path: '/v1/mailbox/{address}/emails',
      description: '获取指定邮箱中的邮件列表',
      requestParams: {
        page: 'number (可选) 页码，默认1',
        limit: 'number (可选) 每页数量，默认20',
        search: 'string (可选) 搜索关键词',
        unread_only: 'boolean (可选) 仅显示未读邮件',
      },
      requestExample: {
        page: 1,
        limit: 20,
      },
      responseExample: {
        success: true,
        data: {
          emails: [
            {
              id: 1,
              mailbox_id: 1,
              from_address: 'sender@example.com',
              from_name: 'Sender',
              to_address: 'test@example.your-domain.com',
              subject: 'Test Email',
              is_read: false,
              has_attachments: false,
              received_at: '2024-01-01T00:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        },
      },
      curlExample: `curl -X GET "${BASE_URL}/v1/mailbox/test@example.your-domain.com/emails?page=1&limit=20" \\
  -H "X-API-Key: YOUR_API_KEY"`,
      jsExample: `const response = await fetch('${BASE_URL}/v1/mailbox/test@example.your-domain.com/emails?page=1&limit=20', {
  method: 'GET',
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
});
const data = await response.json();
console.log(data.data.emails); // Array of emails`,
    },
    {
      method: 'GET',
      path: '/v1/email/{id}',
      description: '获取邮件详情，包括正文和附件信息',
      responseExample: {
        success: true,
        data: {
          id: 1,
          mailbox_id: 1,
          from_address: 'sender@example.com',
          from_name: 'Sender',
          to_address: 'test@example.your-domain.com',
          subject: 'Test Email',
          body_text: 'This is the email body text.',
          body_html: '<p>This is the email body HTML.</p>',
          headers: {
            'Message-ID': '<abc123@example.com>',
            'Content-Type': 'text/html; charset=UTF-8',
          },
          is_read: true,
          has_attachments: true,
          received_at: '2024-01-01T00:00:00Z',
          size_bytes: 1234,
          attachments: [
            {
              id: 1,
              filename: 'document.pdf',
              content_type: 'application/pdf',
              size_bytes: 5678,
            },
          ],
        },
      },
      curlExample: `curl -X GET "${BASE_URL}/v1/email/1" \\
  -H "X-API-Key: YOUR_API_KEY"`,
      jsExample: `const response = await fetch('${BASE_URL}/v1/email/1', {
  method: 'GET',
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
});
const data = await response.json();
console.log(data.data.body_html); // Email HTML content`,
    },
  ];

  const errorCodes = [
    { code: '400', message: '请求参数错误或缺少必填参数' },
    { code: '401', message: 'API Key 无效或未提供' },
    { code: '403', message: '没有权限访问该资源' },
    { code: '404', message: '请求的资源不存在' },
    { code: '429', message: '请求过于频繁，已被限流' },
    { code: '500', message: '服务器内部错误' },
  ];

  return (
    <div className="min-h-screen bg-neo-warm-white">
      {/* Header */}
      <header className="bg-white border-b-3 border-neo-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-neo-black heading-neo">API 文档</h1>
            <Link
              to="/"
              className="px-3 py-1.5 text-sm font-bold text-neo-black hover:bg-gray-50 rounded-neo-lg border-3 border-neo-black active:translate-x-0.5 active:translate-y-0.5 transition-all inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              返回首页
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-neo-gray text-lg mb-8">AI-Friendly PMail API 参考文档</p>
        {/* API Overview */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-neo-black mb-4 flex items-center gap-2">
            <span className="w-8 h-8 inline-flex items-center justify-center bg-neo-yellow border-3 border-neo-black rounded-neo-sm text-lg">1</span>
            API 概览
          </h2>

          <div className="bg-white border-3 border-neo-black rounded-neo-xl p-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-neo-warm-white p-4 rounded-neo-md border-2 border-neo-black">
                <h4 className="text-sm font-bold text-neo-black mb-1">Base URL</h4>
                <code className="text-sm font-mono text-neo-blue break-all">{BASE_URL}</code>
              </div>
              <div className="bg-neo-warm-white p-4 rounded-neo-md border-2 border-neo-black">
                <h4 className="text-sm font-bold text-neo-black mb-1">认证方式</h4>
                <code className="text-sm font-mono text-neo-blue">X-API-Key 请求头</code>
              </div>
            </div>

            <div className="bg-neo-warm-white p-4 rounded-neo-md border-2 border-neo-black">
              <h4 className="text-sm font-bold text-neo-black mb-2">通用请求头</h4>
              <div className="space-y-2 font-mono text-sm">
                <div>
                  <span className="text-neo-magenta font-bold">Content-Type:</span>{' '}
                  <span className="text-neo-black">application/json</span>
                </div>
                <div>
                  <span className="text-neo-magenta font-bold">X-API-Key:</span>{' '}
                  <span className="text-neo-black">YOUR_API_KEY</span>
                </div>
              </div>
            </div>

            <div className="bg-neo-warm-white p-4 rounded-neo-md border-2 border-neo-black">
              <h4 className="text-sm font-bold text-neo-black mb-2">通用响应格式</h4>
              <JsonBlock
                json={{
                  success: true,
                  data: { /* ... */ },
                  message: 'Optional message',
                }}
              />
            </div>
          </div>
        </section>

        {/* Endpoints */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-neo-black mb-4 flex items-center gap-2">
            <span className="w-8 h-8 inline-flex items-center justify-center bg-neo-yellow border-3 border-neo-black rounded-neo-sm text-lg">2</span>
            端点列表
          </h2>

          <div className="space-y-4">
            {endpoints.map((endpoint, index) => (
              <EndpointCard key={index} {...endpoint} />
            ))}
          </div>
        </section>

        {/* Error Codes */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-neo-black mb-4 flex items-center gap-2">
            <span className="w-8 h-8 inline-flex items-center justify-center bg-neo-yellow border-3 border-neo-black rounded-neo-sm text-lg">3</span>
            错误码速查
          </h2>

          <div className="bg-white border-3 border-neo-black rounded-neo-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-neo-warm-white">
                <tr className="border-b-3 border-neo-black">
                  <th className="py-3 px-3 text-left text-sm font-bold text-neo-black">错误码</th>
                  <th className="py-3 px-3 text-left text-sm font-bold text-neo-black">说明</th>
                </tr>
              </thead>
              <tbody>
                {errorCodes.map((error) => (
                  <ErrorRow key={error.code} code={error.code} message={error.message} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center text-sm text-neo-gray">
          <p>PMail API 文档 · 最后更新：2024年</p>
          <p className="mt-1">
            访问{' '}
            <Link to="/dashboard" className="text-neo-blue font-bold hover:underline">
              控制台
            </Link>{' '}
            获取您的 API Key
          </p>
        </div>
      </div>
    </div>
  );
}
