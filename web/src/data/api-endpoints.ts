import { ApiEndpointGroup } from '../types/api-docs';

/**
 * API Endpoints Configuration
 * Extracted from workers/api/openapi.yaml
 */

export const apiEndpointGroups: ApiEndpointGroup[] = [
  {
    title: 'apiDocs.groups.mailbox.title',
    description: 'apiDocs.groups.mailbox.description',
    endpoints: [
      {
        id: 'create-mailbox',
        method: 'POST',
        path: '/v1/mailbox',
        summary: 'apiDocs.endpoints.createMailbox.summary',
        description: 'apiDocs.endpoints.createMailbox.description',
        permissions: ['write'],
        requestBody: {
          contentType: 'application/json',
          schema: {
            prefix: 'string (optional)',
            expires_in: 'number (optional)',
          },
          example: {
            prefix: 'mytest',
            expires_in: 3600,
          },
        },
        responses: [
          {
            status: 200,
            description: 'apiDocs.endpoints.createMailbox.responses.200',
            example: {
              success: true,
              data: {
                id: 14,
                address: '1atr64cmly9e5k4z@your-domain.com',
                created_at: '2025-10-23 17:05:48',
                expires_at: '2025-10-23 18:05:48',
              },
            },
          },
        ],
        curlExample: `curl -X POST https://api.your-domain.com/v1/mailbox \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prefix": "mytest",
    "expires_in": 3600
  }'`,
        jsExample: `const response = await fetch('https://api.your-domain.com/v1/mailbox', {
  method: 'POST',
  headers: {
    'X-API-Key': 'YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prefix: 'mytest',
    expires_in: 3600
  })
});
const data = await response.json();`,
      },
      {
        id: 'list-mailboxes',
        method: 'GET',
        path: '/v1/mailboxes',
        summary: 'apiDocs.endpoints.listMailboxes.summary',
        description: 'apiDocs.endpoints.listMailboxes.description',
        permissions: ['read'],
        responses: [
          {
            status: 200,
            description: 'apiDocs.endpoints.listMailboxes.responses.200',
            example: {
              success: true,
              data: [
                {
                  address: '1atr64cmly9e5k4z@your-domain.com',
                  created_at: '2025-10-23 17:05:48',
                  expires_at: '2025-10-23 18:05:48',
                  email_count: 1,
                  unread_count: 0,
                },
              ],
            },
          },
        ],
        curlExample: `curl -X GET https://api.your-domain.com/v1/mailboxes \\
  -H "X-API-Key: YOUR_API_KEY"`,
        jsExample: `const response = await fetch('https://api.your-domain.com/v1/mailboxes', {
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
});
const data = await response.json();`,
      },
      {
        id: 'delete-mailbox',
        method: 'DELETE',
        path: '/v1/mailbox/{address}',
        summary: 'apiDocs.endpoints.deleteMailbox.summary',
        description: 'apiDocs.endpoints.deleteMailbox.description',
        permissions: ['write'],
        parameters: [
          {
            name: 'address',
            in: 'path',
            required: true,
            type: 'string',
            description: 'apiDocs.endpoints.deleteMailbox.parameters.address',
            example: '1atr64cmly9e5k4z@your-domain.com',
          },
        ],
        responses: [
          {
            status: 200,
            description: 'apiDocs.endpoints.deleteMailbox.responses.200',
            example: {
              success: true,
              message: 'Mailbox deleted successfully',
            },
          },
        ],
        curlExample: `curl -X DELETE https://api.your-domain.com/v1/mailbox/1atr64cmly9e5k4z@your-domain.com \\
  -H "X-API-Key: YOUR_API_KEY"`,
        jsExample: `const address = '1atr64cmly9e5k4z@your-domain.com';
const response = await fetch(\`https://api.your-domain.com/v1/mailbox/\${address}\`, {
  method: 'DELETE',
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
});
const data = await response.json();`,
      },
    ],
  },
  {
    title: 'apiDocs.groups.email.title',
    description: 'apiDocs.groups.email.description',
    endpoints: [
      {
        id: 'list-emails',
        method: 'GET',
        path: '/v1/mailbox/{address}/emails',
        summary: 'apiDocs.endpoints.listEmails.summary',
        description: 'apiDocs.endpoints.listEmails.description',
        permissions: ['read'],
        parameters: [
          {
            name: 'address',
            in: 'path',
            required: true,
            type: 'string',
            description: 'apiDocs.endpoints.listEmails.parameters.address',
            example: '1atr64cmly9e5k4z@your-domain.com',
          },
          {
            name: 'page',
            in: 'query',
            required: false,
            type: 'number',
            description: 'apiDocs.endpoints.listEmails.parameters.page',
            example: '1',
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            type: 'number',
            description: 'apiDocs.endpoints.listEmails.parameters.limit',
            example: '20',
          },
        ],
        responses: [
          {
            status: 200,
            description: 'apiDocs.endpoints.listEmails.responses.200',
            example: {
              success: true,
              data: {
                emails: [
                  {
                    id: 13,
                    from_address: 'test@example.com',
                    from_name: 'Test User',
                    to_address: '1atr64cmly9e5k4z@your-domain.com',
                    subject: 'Test Email',
                    body_text: 'This is a test email...',
                    body_html: '<div>This is a test email...</div>',
                    received_at: '2025-10-23 17:06:36',
                    is_read: 0,
                    size_bytes: 5697,
                    attachment_count: 0,
                    has_attachments: false,
                  },
                ],
                total: 1,
                page: 1,
                limit: 20,
              },
            },
          },
        ],
        curlExample: `curl -X GET "https://api.your-domain.com/v1/mailbox/1atr64cmly9e5k4z@your-domain.com/emails?page=1&limit=20" \\
  -H "X-API-Key: YOUR_API_KEY"`,
        jsExample: `const address = '1atr64cmly9e5k4z@your-domain.com';
const page = 1;
const limit = 20;
const response = await fetch(\`https://api.your-domain.com/v1/mailbox/\${address}/emails?page=\${page}&limit=\${limit}\`, {
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
});
const data = await response.json();`,
      },
      {
        id: 'get-email-detail',
        method: 'GET',
        path: '/v1/email/{id}',
        summary: 'apiDocs.endpoints.getEmailDetail.summary',
        description: 'apiDocs.endpoints.getEmailDetail.description',
        permissions: ['read'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'number',
            description: 'apiDocs.endpoints.getEmailDetail.parameters.id',
            example: '13',
          },
        ],
        responses: [
          {
            status: 200,
            description: 'apiDocs.endpoints.getEmailDetail.responses.200',
            example: {
              success: true,
              data: {
                id: 13,
                from_address: 'sender@example.com',
                from_name: null,
                to_address: '1atr64cmly9e5k4z@your-domain.com',
                subject: '111',
                body_text: '1111\n\n',
                body_html: '<div dir="ltr">1111</div>\n\n',
                headers: '{"content-type":"multipart/alternative","date":"Fri, 24 Oct 2025 01:06:23 +0800"}',
                received_at: '2025-10-23 17:06:36',
                is_read: 0,
                size_bytes: 5697,
                raw_content: 'Received: from mail...',
                attachments: [],
              },
            },
          },
        ],
        curlExample: `curl -X GET https://api.your-domain.com/v1/email/13 \\
  -H "X-API-Key: YOUR_API_KEY"`,
        jsExample: `const emailId = 13;
const response = await fetch(\`https://api.your-domain.com/v1/email/\${emailId}\`, {
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
});
const data = await response.json();`,
      },
    ],
  },
];
