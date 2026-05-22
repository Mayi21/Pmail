# PMail - 详细文档

本文档包含 PMail 项目的详细技术文档，包括数据库设计、完整 API 接口文档、架构原理、生产部署检查清单等。

> 项目概述和快速开始请参见 [README.md](./README.md)

---

## 目录

- [数据库设计](#-数据库设计)
- [API 接口文档](#-api-接口文档)
  - [北向 API（外部调用）](#-北向-api外部调用)
  - [内部 API（Web 前端）](#-内部-apiweb-前端)
- [Web 界面设计](#-web-界面设计)
- [工作流程与架构原理](#-工作流程与架构原理)
- [实现原理](#-实现原理)
- [安全特性与限制](#-安全特性与限制)
- [成本估算详情](#-成本估算详情)
- [使用示例](#-使用示例)
- [生产环境部署检查清单](#-生产环境部署检查清单)

---

## 🗄️ 数据库设计

### 用户表 (users)
- id: 主键
- username: 用户名（唯一）
- email: 邮箱（用于找回密码）
- password_hash: 密码哈希
- created_at: 创建时间

### 临时邮箱表 (temp_emails)
- id: 主键
- user_id: 用户ID（外键，可为 NULL 表示游客邮箱）
- address: 邮箱地址（如 abc123@yourdomain.com）
- expires_at: 过期时间
- created_at: 创建时间
- deleted_at: 软删除时间戳

### 邮件表 (emails)
- id: 主键
- temp_email_id: 临时邮箱ID（外键）
- from_email: 发件人
- subject: 主题
- body_text: 纯文本正文
- body_html: HTML 正文
- received_at: 接收时间
- is_read: 是否已读
- deleted_at: 软删除时间戳

### 附件表 (attachments)
- id: 主键
- email_id: 邮件ID（外键）
- filename: 文件名
- r2_key: R2 存储键
- size: 文件大小
- content_type: MIME 类型
- deleted_at: 软删除时间戳

### API Key 表 (api_keys)
- id: 主键
- user_id: 用户ID（外键，支持每用户多密钥）
- name: 密钥名称
- key_hash: API Key 的 SHA-256 哈希值（唯一，不存储明文）
- permissions: 权限（逗号分隔：read, write, admin）
- is_active: 是否启用
- expires_at: 过期时间
- created_at: 创建时间
- last_used_at: 最后使用时间

---

## 🔌 API 接口文档

本系统提供两套 API 接口：

1. **北向 API（对外）**：使用 API Key 认证，适合自动化脚本、CI/CD 等场景，路径前缀 `/v1`
2. **内部 API（Web）**：使用 JWT Token 认证，供 Web 前端调用，路径前缀 `/api`

**版本管理建议**：
- 北向 API 使用版本号（`/v1`、`/v2`）便于未来升级
- 内部 API 可根据需要添加版本（如 `/api/v1`）
- 使用请求头 `X-API-Version` 作为备选版本控制方式

### 📡 北向 API（外部调用）

#### 认证方式

除健康检查外，所有北向 API 请求需要在请求头中携带 API Key：
```http
X-API-Key: your_api_key_here
```

#### 0. 健康检查（无需认证）
```http
GET /health

成功响应（200）：
{
  "status": "healthy",
  "service": "pmail-api",
  "timestamp": "2025-10-12T12:30:00Z",
  "version": "1.0.0"
}
```

#### 获取 API Key

用户注册并登录后，在 Web 页面的"设置"中可以生成 API Key。

**说明**：
- 每个用户**只能创建一个** API Key
- API Key 格式：64字符长度的唯一标识符（例如：`550e8400-e29b-41d4-a716-446655440000-abcd1234efgh5678ijkl9012mnop3456`）
- API Key 创建后只显示一次，请妥善保管
- 如需重新生成，需先删除旧的 API Key

---

#### 1. 创建临时邮箱
```http
POST /v1/mailbox
X-API-Key: your_api_key

请求体（可选）：
{
  "prefix": "custom",        // 可选：自定义前缀
  "expires_in": 3600         // 可选：过期时间（秒），默认3600
}

成功响应（200）：
{
  "success": true,
  "data": {
    "address": "abc123@temp.example.com",
    "expires_at": "2025-10-12T13:30:00Z",
    "created_at": "2025-10-12T12:30:00Z"
  }
}

失败响应（401）：
{
  "success": false,
  "error": "Invalid API Key"
}

失败响应（403）：
{
  "success": false,
  "error": "已达到最大邮箱数量限制（10个）"
}
```

#### 2. 获取我的邮箱列表
```http
GET /v1/mailboxes
X-API-Key: your_api_key

成功响应（200）：
{
  "success": true,
  "data": [
    {
      "address": "abc123@temp.example.com",
      "created_at": "2025-10-12T12:30:00Z",
      "expires_at": "2025-10-12T13:30:00Z",
      "email_count": 3,
      "unread_count": 2
    }
  ]
}
```

#### 3. 获取指定邮箱的邮件列表
```http
GET /v1/mailbox/{address}/emails
X-API-Key: your_api_key

例如：GET /v1/mailbox/abc123@temp.example.com/emails

查询参数（可选）：
- limit: 返回数量，默认20，最大100

成功响应（200）：
{
  "success": true,
  "data": [
    {
      "id": 1,
      "from": "noreply@github.com",
      "subject": "Verify your email address",
      "preview": "Please click the link...",
      "received_at": "2025-10-12T12:28:35Z",
      "is_read": false,
      "has_attachments": true
    }
  ],
  "total": 3
}

失败响应（403）：
{
  "success": false,
  "error": "无权访问此邮箱"
}
```

#### 4. 搜索邮件（关键字）
```http
GET /v1/mailbox/{address}/emails/search?q=keyword
X-API-Key: your_api_key

例如：GET /v1/mailbox/abc123@temp.example.com/emails/search?q=verification

查询参数：
- q: 搜索关键字（必填）
- scope: 搜索范围，默认 "all"
  - "all": 搜索主题、发件人、正文（默认）
  - "subject": 仅搜索主题
  - "from": 仅搜索发件人
  - "body": 仅搜索正文
- limit: 返回数量，默认20，最大100

成功响应（200）：
{
  "success": true,
  "data": [
    {
      "id": 1,
      "from": "noreply@github.com",
      "subject": "Verify your email address",
      "preview": "Please click the link to verify...",
      "received_at": "2025-10-12T12:28:35Z",
      "match_in": ["subject", "body"]
    }
  ],
  "total": 1,
  "search_params": {
    "keyword": "verification",
    "scope": "all"
  }
}
```

#### 5. 获取邮件详情
```http
GET /v1/email/{id}
X-API-Key: your_api_key

例如：GET /v1/email/1

成功响应（200）：
{
  "success": true,
  "data": {
    "id": 1,
    "from": "noreply@github.com",
    "to": "abc123@temp.example.com",
    "subject": "Verify your email address",
    "body_text": "Please click the link to verify...",
    "body_html": "<html>...</html>",
    "received_at": "2025-10-12T12:28:35Z",
    "attachments": [
      {
        "id": 1,
        "filename": "document.pdf",
        "size": 245760,
        "content_type": "application/pdf",
        "download_url": "/v1/attachment/1"
      }
    ]
  }
}

失败响应（403）：
{
  "success": false,
  "error": "无权访问此邮件"
}

失败响应（404）：
{
  "success": false,
  "error": "邮件不存在"
}

权限验证流程：
1. 通过 API Key 查询 user_id
2. 通过 email_id 查询邮件所属的 temp_email_id
3. 验证 temp_email 的 user_id 是否与 API Key 所属用户匹配
4. 仅当匹配时返回邮件详情，否则返回 403
```

#### 6. 删除邮箱
```http
DELETE /v1/mailbox/{address}
X-API-Key: your_api_key

例如：DELETE /v1/mailbox/abc123@temp.example.com

成功响应（200）：
{
  "success": true,
  "message": "邮箱已删除"
}
```

#### 7. 删除邮件
```http
DELETE /v1/email/{id}
X-API-Key: your_api_key

成功响应（200）：
{
  "success": true,
  "message": "邮件已删除"
}
```

#### 8. 下载附件
```http
GET /v1/attachment/{id}
X-API-Key: your_api_key

成功响应（200）：
Content-Type: application/pdf
Content-Disposition: attachment; filename="document.pdf"

[二进制文件内容]
```

---

### 🌐 内部 API（Web 前端）

#### 认证方式

除健康检查外，内部 API 使用 JWT Token 认证，需要先登录获取 Token：
```http
Authorization: Bearer {token}
```

---

#### 系统接口

#### 0. 健康检查（无需认证）
```http
GET /api/health

成功响应（200）：
{
  "status": "healthy",
  "service": "pmail-api",
  "timestamp": "2025-10-12T12:30:00Z",
  "version": "1.0.0",
  "uptime": 3600
}
```

#### 认证接口

#### 1. 注册用户
```http
POST /api/auth/register
Content-Type: application/json

请求体：
{
  "username": "user123",
  "email": "user@example.com",
  "password": "your_password"
}

成功响应（200）：
{
  "success": true,
  "message": "注册成功",
  "data": {
    "user_id": 1,
    "username": "user123",
    "email": "user@example.com"
  }
}

失败响应（400）：
{
  "success": false,
  "error": "用户名已存在"
}
```

#### 2. 用户登录
```http
POST /api/auth/login
Content-Type: application/json

请求体：
{
  "username": "user123",
  "password": "your_password"
}

成功响应（200）：
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "user123",
      "email": "user@example.com"
    }
  }
}

失败响应（401）：
{
  "success": false,
  "error": "用户名或密码错误"
}
```

#### 3. 获取当前用户信息
```http
GET /api/auth/me
Authorization: Bearer {token}

成功响应（200）：
{
  "success": true,
  "data": {
    "id": 1,
    "username": "user123",
    "email": "user@example.com",
    "created_at": "2025-10-12T10:00:00Z",
    "stats": {
      "mailbox_count": 3,
      "total_emails": 45,
      "unread_emails": 12,
      "active_mailboxes": 2
    }
  }
}

失败响应（401）：
{
  "success": false,
  "error": "未授权，请先登录"
}
```

#### 4. 请求重置密码
```http
POST /api/auth/forgot-password
Content-Type: application/json

请求体：
{
  "email": "user@example.com"
}

成功响应（200）：
{
  "success": true,
  "message": "重置密码邮件已发送，请查收"
}

说明：
- 系统将向用户邮箱发送重置密码链接
- 重置链接包含 token，有效期 1 小时
- 即使邮箱不存在，也返回成功（防止用户枚举）
```

#### 5. 重置密码
```http
POST /api/auth/reset-password
Content-Type: application/json

请求体：
{
  "token": "reset_token_from_email",
  "new_password": "new_strong_password"
}

成功响应（200）：
{
  "success": true,
  "message": "密码重置成功，请重新登录"
}

失败响应（400）：
{
  "success": false,
  "error": "重置 token 无效或已过期"
}
```

### 邮箱管理接口

#### 1. 创建临时邮箱
```http
POST /api/mailbox/create
Authorization: Bearer {token}
Content-Type: application/json

请求体（可选）：
{
  "prefix": "custom",      // 可选：自定义前缀
  "expires_in": 3600       // 可选：过期时间（秒），默认1小时
}

成功响应（200）：
{
  "success": true,
  "data": {
    "id": 1,
    "address": "abc123xyz@temp.example.com",
    "created_at": "2025-10-12T12:30:00Z",
    "expires_at": "2025-10-12T13:30:00Z"
  }
}

失败响应（403）：
{
  "success": false,
  "error": "已达到最大邮箱数量限制（10个）"
}
```

#### 2. 获取用户的邮箱列表
```http
GET /api/mailbox/list
Authorization: Bearer {token}

成功响应（200）：
{
  "success": true,
  "data": [
    {
      "id": 1,
      "address": "abc123@temp.example.com",
      "created_at": "2025-10-12T12:30:00Z",
      "expires_at": "2025-10-12T13:30:00Z",
      "email_count": 3,
      "unread_count": 2
    }
  ]
}
```

#### 3. 删除临时邮箱
```http
DELETE /api/mailbox/:address
Authorization: Bearer {token}

成功响应（200）：
{
  "success": true,
  "message": "邮箱已删除"
}
```

### API Key 管理接口

#### 1. 生成/重新生成 API Key
```http
POST /api/apikey/generate
Authorization: Bearer {token}
Content-Type: application/json

成功响应（200）：
{
  "success": true,
  "data": {
    "key": "550e8400-e29b-41d4-a716-446655440000-abcd1234efgh5678ijkl9012mnop3456",
    "created_at": "2025-10-12T12:00:00Z"
  },
  "message": "请妥善保管 API Key，关闭后将无法再次查看"
}
```

#### 2. 获取我的 API Key 信息
```http
GET /api/apikey/info
Authorization: Bearer {token}

成功响应（200）：
{
  "success": true,
  "data": {
    "exists": true,
    "key_prefix": "550e8400...3456",
    "created_at": "2025-10-12T12:00:00Z",
    "last_used_at": "2025-10-12T13:30:00Z"
  }
}
```

#### 3. 删除 API Key
```http
DELETE /api/apikey
Authorization: Bearer {token}

成功响应（200）：
{
  "success": true,
  "message": "API Key 已删除"
}
```

### 邮件查询接口

#### 1. 获取指定邮箱的邮件列表
```http
GET /api/emails/:address
Authorization: Bearer {token}

查询参数（可选）：
- page: 页码，默认1
- limit: 每页数量，默认20

成功响应（200）：
{
  "success": true,
  "data": {
    "emails": [
      {
        "id": 1,
        "from": "noreply@github.com",
        "subject": "Verify your email address",
        "preview": "Please click the link to verify...",
        "received_at": "2025-10-12T12:28:35Z",
        "is_read": false,
        "has_attachments": true,
        "attachment_count": 1
      }
    ],
    "total": 2,
    "page": 1,
    "limit": 20
  }
}
```

#### 2. 关键字搜索邮件
```http
GET /api/emails/:address/search?q=keyword
Authorization: Bearer {token}

查询参数：
- q: 搜索关键字（必填）
- scope: 搜索范围，默认 "all"（all/subject/from/body）
- date_from: 开始日期（ISO 8601格式）
- date_to: 结束日期（ISO 8601格式）
- page: 页码，默认1
- limit: 每页数量，默认20
```

#### 3. 获取邮件详情
```http
GET /api/email/:id
Authorization: Bearer {token}
```

#### 4. 删除邮件
```http
DELETE /api/email/:id
Authorization: Bearer {token}
```

#### 5. 批量删除邮件
```http
DELETE /api/emails/batch
Authorization: Bearer {token}
Content-Type: application/json

请求体：
{
  "ids": [1, 2, 3, 4, 5]
}
```

#### 6. 查看原始邮件
```http
GET /api/email/:id/raw
Authorization: Bearer {token}
```

#### 7. 标记为已读
```http
PATCH /api/email/:id/read
Authorization: Bearer {token}
```

### 附件接口

#### 下载附件
```http
GET /api/attachment/:id
Authorization: Bearer {token}

权限验证流程：
1. 通过 attachment_id 查询附件记录
2. 通过 email_id 查询邮件所属的 temp_email_id
3. 验证 temp_email.user_id 是否与当前用户匹配
4. 仅当权限验证通过时，从 R2 读取文件并返回
```

### 状态码说明

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | 未授权，需要登录 |
| 403 | 禁止访问，权限不足 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

### 错误码规范

```javascript
{
  "success": false,
  "error": "错误描述信息",
  "error_code": "ERROR_CODE",
  "details": {}  // 可选的额外信息
}
```

| 错误码 | 说明 | HTTP状态码 |
|--------|------|-----------|
| `AUTH_INVALID_CREDENTIALS` | 用户名或密码错误 | 401 |
| `AUTH_TOKEN_EXPIRED` | Token已过期 | 401 |
| `AUTH_TOKEN_INVALID` | Token无效 | 401 |
| `USER_ALREADY_EXISTS` | 用户已存在 | 400 |
| `USER_NOT_FOUND` | 用户不存在 | 404 |
| `MAILBOX_LIMIT_EXCEEDED` | 超过邮箱数量限制 | 403 |
| `MAILBOX_NOT_FOUND` | 邮箱不存在 | 404 |
| `MAILBOX_EXPIRED` | 邮箱已过期 | 410 |
| `EMAIL_NOT_FOUND` | 邮件不存在 | 404 |
| `PERMISSION_DENIED` | 权限不足 | 403 |
| `RATE_LIMIT_EXCEEDED` | 超过速率限制 | 429 |
| `VALIDATION_ERROR` | 参数验证失败 | 400 |
| `INTERNAL_ERROR` | 内部服务器错误 | 500 |

### 时区说明

系统中所有时间均使用 **UTC 时区**，格式遵循 ISO 8601 标准：`YYYY-MM-DDTHH:mm:ssZ`

---

## 🎨 Web 界面设计（桌面端）

### 1. 登录/注册页面
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    📧 PMail                         │
│              临时邮箱系统 · 安全便捷                     │
│                                                         │
│         ┌───────────────────────────────────┐          │
│         │                                   │          │
│         │   用户名  [____________________]  │          │
│         │                                   │          │
│         │   密  码  [____________________]  │          │
│         │                                   │          │
│         │   [      登录      ]              │          │
│         │                                   │          │
│         │   还没有账号？[注册新账号]        │          │
│         │                                   │          │
│         └───────────────────────────────────┘          │
│                                                         │
│        ✓ 完全免费    ✓ 快速创建    ✓ 隐私保护          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2. 主仪表盘
```
┌──────────────────────────────────────────────────────────────────────────┐
│  📧 PMail                                      👤 用户名 ▼  [退出]    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  我的临时邮箱                                       [+ 创建新邮箱]      │
│                                                                          │
│  ┌──────────────────────────────────────────────────────┐              │
│  │ 📬 abc123@temp.example.com                           │              │
│  │ 创建: 2025-10-12 12:30                               │              │
│  │ 过期: 2025-10-12 13:30 (剩余 45 分钟) ⏱            │              │
│  │ 📨 收到 3 封邮件 (2 封未读) ●●                       │              │
│  │ [复制地址]  [查看邮件]  [删除邮箱]                  │              │
│  └──────────────────────────────────────────────────────┘              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3. 邮件列表页
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← 返回    📬 abc123@temp.example.com    [复制地址]    [刷新] 🔄   [删除邮箱] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────┬──────────────────────────────────────────┐ │
│  │  收件箱 (3)                 │                                          │ │
│  │  🔍 [搜索邮件...]           │    选择左侧邮件查看详情                   │ │
│  │                             │                                          │ │
│  │  ┌───────────────────────┐ │                                          │ │
│  │  │ ● noreply@github.com  │ │                                          │ │
│  │  │   📎 Verify email     │ │                                          │ │
│  │  │   2 分钟前             │ │                                          │ │
│  │  └───────────────────────┘ │                                          │ │
│  └─────────────────────────────┴──────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚦 工作流程与架构原理

### 邮件接收流程
```
外部邮件 → Cloudflare Email Routing
         → Email Worker (接收邮件)
         → 验证收件地址在 D1 中存在
         → 解析邮件内容
         → 邮件正文/头部存入 D1，附件存入 R2
```

### 用户访问流程
```
用户访问 → Cloudflare Pages (前端)
         → 调用 API Worker
         → 验证 JWT Token
         → 查询 D1 数据库
         → 返回数据
```

### 消息队列机制（可选优化）

使用 Cloudflare Queues 异步处理邮件：

```typescript
// Email Worker - 快速接收并入队
export default {
  async email(message: EmailMessage, env: Env) {
    const toAddress = message.to[0].address;
    const isValid = await quickValidateAddress(toAddress, env.KV);

    if (!isValid) {
      message.setReject('Invalid recipient');
      return;
    }

    await env.EMAIL_QUEUE.send({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      message: {
        from: message.from,
        to: message.to,
        subject: message.subject,
        headers: Object.fromEntries(message.headers),
        rawEmail: await streamToString(message.raw)
      }
    });
  }
};
```

队列配置（wrangler.toml）：
```toml
[[queues.producers]]
queue = "email-queue"
binding = "EMAIL_QUEUE"

[[queues.consumers]]
queue = "email-queue"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "email-dlq"
```

### 多级缓存策略

```
L1: 内存缓存（Worker 实例内，60s TTL）
L2: KV 缓存（跨 Worker 共享，5min TTL）
L3: D1 数据库（持久化存储）
```

| 数据类型 | L1 TTL | L2 TTL | 更新策略 |
|---------|--------|--------|----------|
| 用户信息 | 60s | 5分钟 | 登录时更新 |
| 邮箱列表 | 30s | 2分钟 | 创建/删除时失效 |
| 邮件列表 | 10s | 1分钟 | 新邮件时失效 |
| 邮件详情 | 120s | 10分钟 | 基本不变 |
| API Key | 300s | 30分钟 | 很少变化 |

---

## 💡 实现原理

### 临时邮箱创建原理

**核心概念**：临时邮箱并非真正创建邮箱账户，而是利用域名 Catch-All（通配符接收）功能。

1. **生成随机地址**：系统生成随机字符串，拼接域名形成完整地址
2. **重复检查**：生成后验证唯一性，若重复则重新生成（最多重试 5 次）
3. **数据库登记**：将地址、用户 ID、过期时间写入数据库
4. **无需邮件服务器**：不在邮件服务器创建真实账户，只在数据库中记录

**类比**：就像酒店前台登记房间号，而非真正建造房间。

### 邮件接收原理

- 域名配置 Catch-All，所有 `*@domain.com` 的邮件都会被接收
- DNS MX 记录指向 Cloudflare Email Routing
- Cloudflare 接收邮件并触发 Email Worker
- Email Worker 验证地址有效性，解析并存储邮件

### 用户隔离机制

数据关联关系：
```
users → temp_emails → emails → attachments
```

所有查询**必须**包含 `user_id` 条件，确保用户只能操作自己的数据。

### JWT 密钥轮换机制

**密钥生命周期**：
```
active（活跃）→ retired（退休）→ deleted（删除）
   ↓                ↓                ↓
签发+验证        仅验证           不可用
(30天)          (7天宽限期)       (永久删除)
```

Token 验证流程：
```
接收 Token → 解析 Header 获取 kid → 查找对应密钥 → 检查密钥状态 → 验证签名
```

### 密码重置流程

```
用户提交邮箱 → 生成重置 Token → 存入 KV（TTL 1小时）→ 发送重置邮件
→ 用户点击链接 → 验证 Token → 更新密码 → 删除 Token
```

### 数据清理机制

- **Cron Trigger**：每小时执行清理过期邮箱、级联删除邮件和附件
- **软删除**：使用 `deleted_at` 时间戳，查询默认过滤 `WHERE deleted_at IS NULL`
- **存储限制**：单用户最多 10 个有效邮箱

---

## 🔒 安全特性与限制

### 数据限制

#### 用户相关
- **用户名**：3-20 个字符，仅支持字母、数字、下划线
- **密码**：8-64 个字符，必须包含大小写字母和数字
- **邮箱**：标准邮箱格式验证

#### 临时邮箱相关
- **邮箱地址格式**：`[a-z0-9]{8,16}@yourdomain.com`
- **每用户邮箱数量**：最多同时拥有 10 个有效邮箱
- **过期时间**：最短 10 分钟，最长 24 小时，默认 1 小时

#### 邮件相关
- **单封邮件大小**：最大 25MB（Cloudflare Email Routing 限制）
- **Workers 响应限制**：单次响应最大 1MB（需分页处理）

#### 附件相关
- **单个附件大小**：最大 10MB
- **单封邮件附件数量**：最多 10 个
- **总附件大小**：单封邮件所有附件不超过 20MB

#### 数据库限制
- **D1 单次查询结果**：最多 1000 行
- **D1 单次事务大小**：最大 10MB

---

## 💰 成本估算详情

| 服务 | 免费额度 | 超出后费用 |
|------|---------|-----------|
| **Workers** | 10万请求/天 | $0.15/百万请求 |
| **D1 数据库** | 5GB 存储，500万行读取/天 | $0.75/百万行读取 |
| **R2 存储** | 10GB 存储，100万次写入/月，1000万次读取/月，出口流量免费 | $0.015/GB/月 |
| **KV 存储** | 10万次读取/天，1000次写入/天，1GB 存储 | $0.50/百万次读取 |
| **Pages** | 无限带宽 | 完全免费 |
| **Email Routing** | 完全免费 | 完全免费 |

---

## 📝 使用示例

### 北向 API 使用流程

#### 1. 注册账号并生成 API Key
```bash
# 注册
curl -X POST https://api.yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "myuser", "email": "myuser@example.com", "password": "your_password"}'

# 登录
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "myuser", "password": "your_password"}'

# 生成 API Key
curl -X POST https://api.yourdomain.com/api/apikey/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Script API Key"}'
```

#### 2. 创建临时邮箱并获取邮件
```bash
# 创建临时邮箱
curl -X POST https://api.yourdomain.com/v1/mailbox \
  -H "X-API-Key: $API_KEY"

# 查看邮件列表
curl https://api.yourdomain.com/v1/mailbox/$TEMP_EMAIL/emails \
  -H "X-API-Key: $API_KEY"

# 获取邮件详情
curl https://api.yourdomain.com/v1/email/1 \
  -H "X-API-Key: $API_KEY"
```

#### 3. 自动化脚本示例（Python）
```python
import requests
import time

API_BASE = "https://api.yourdomain.com"
API_KEY = "your_api_key"

# 创建临时邮箱
response = requests.post(f"{API_BASE}/v1/mailbox", headers={"X-API-Key": API_KEY})
email_address = response.json()["data"]["address"]
print(f"临时邮箱: {email_address}")

# 轮询等待邮件
for i in range(10):
    response = requests.get(
        f"{API_BASE}/v1/mailbox/{email_address}/emails",
        headers={"X-API-Key": API_KEY}
    )
    emails = response.json()["data"]
    if emails:
        detail = requests.get(
            f"{API_BASE}/v1/email/{emails[0]['id']}",
            headers={"X-API-Key": API_KEY}
        ).json()
        print(f"收到邮件: {detail['data']['subject']}")
        break
    time.sleep(5)
```

---

## 🚀 部署指南

### 首次部署完整指南

本指南将带你从零开始，完成 PMail 系统的首次部署。

#### 部署前准备

**必需账号**：
- **Cloudflare 账号** - [注册地址](https://dash.cloudflare.com/sign-up)，免费套餐即可
- **域名** - 需要拥有一个域名，必须添加到 Cloudflare 并使用 Cloudflare DNS

**必需工具**：
```bash
# Node.js (18 或更高版本)
node --version

# 安装 Wrangler CLI
npm install -g wrangler
```

#### 第一步：认证 Wrangler

```bash
wrangler login
```

#### 第二步：创建 Cloudflare 资源

**D1 数据库**：
```bash
wrangler d1 create temp-email-db
```

**R2 存储桶**：
```bash
wrangler r2 bucket create temp-email-attachments
```

**KV 命名空间**（6个）：
```bash
wrangler kv namespace create "RESET_TOKENS"
wrangler kv namespace create "JWT_KEYS"
wrangler kv namespace create "CACHE"
wrangler kv namespace create "SESSIONS"
wrangler kv namespace create "RATE_LIMITS"
wrangler kv namespace create "EMAIL_VALIDATION"
```

#### 第三步：配置项目

**初始化数据库**：
```bash
wrangler d1 execute temp-email-db --file=./schema.sql
```

**部署 API Worker**：
```bash
cd workers/api
npm install && wrangler deploy
```

**部署 Email Worker**：
```bash
cd ../email
npm install && wrangler deploy
```

**配置邮件接收**：
1. 在 Cloudflare Dashboard → Email → Email Routing 启用
2. 配置 `*@yourdomain.com` 路由到 `pmail-receiver` Worker

**部署前端**：
```bash
cd web
npm install && npm run build && wrangler pages deploy dist --project-name temp-email
```

#### 验证部署

1. 访问前端 Pages URL
2. 测试用户注册/登录
3. 测试创建临时邮箱
4. 发送测试邮件验证接收

### GitHub 自动部署配置

项目已配置完整的 GitHub Actions CI/CD 流水线：

- **`main` 分支推送** → 完整部署到生产环境
- **`dev` 分支推送** → 测试 + 构建（不部署）
- **Pull Request** → 代码检查 + 预览部署

#### 必需的 GitHub Secrets

| Secret 名称 | 描述 | 获取方法 |
|------------|------|----------|
| `CF_API_TOKEN` | Cloudflare API Token | Dashboard > My Profile > API Tokens > Create Token |
| `CF_ACCOUNT_ID` | Cloudflare 账户 ID | Dashboard 右侧边栏可见 |
| `D1_DATABASE_ID` | D1 数据库 ID | Workers & Pages > D1 > temp-email-db > Settings |
| `JWT_SECRET` | JWT 签名密钥 | `openssl rand -base64 32` |
| `DATABASE_ENCRYPTION_KEY` | 数据库加密密钥 | `openssl rand -base64 32` |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile 验证密钥 | Dashboard > Turnstile > Site Keys |

#### 分支部署策略

| 分支 | 推送触发 | PR触发 | 生产部署 |
|------|----------|--------|----------|
| `main` | ✅ 完整部署 | ✅ 预览部署 | ✅ 是 |
| `dev` | ✅ 测试+构建 | ✅ 预览部署 | ❌ 否 |

#### main 分支部署流程

1. 代码检查 - ESLint, Prettier
2. 类型检查 - TypeScript 验证
3. 安全扫描 - 依赖漏洞检查
4. 单元测试 - Vitest 测试套件
5. 构建 - API Worker 和前端构建
6. 数据库迁移 - 自动执行 schema 更新
7. 部署 - 部署到 Cloudflare Workers 和 Pages
8. 健康检查 - 验证部署状态

---

## ✅ 生产环境部署检查清单

### 🔐 安全检查

- [ ] JWT 密钥足够强（至少 32 个字符）
- [ ] JWT 密钥轮换已配置并测试
- [ ] 密码要求已强制执行
- [ ] API 密钥具有适当的作用域和权限
- [ ] 管理员端点已得到适当保护
- [ ] 速率限制已启用并配置
- [ ] CORS 已针对生产域正确配置
- [ ] 所有敏感数据已加密存储
- [ ] HTTPS 已强制
- [ ] SQL 注入防护已测试
- [ ] XSS 防护头已配置
- [ ] Cloudflare WAF 规则已配置
- [ ] 密钥已正确存储在 Wrangler secrets 中

### 🏗️ 基础设施

- [ ] D1 数据库已创建，Schema 已部署
- [ ] R2 存储桶已创建
- [ ] KV 命名空间已创建（CACHE, SESSIONS, RATE_LIMITS, EMAIL_VALIDATION）
- [ ] API Worker 和 Email Worker 已部署
- [ ] Email Routing 已配置为 Catch-all
- [ ] 环境变量和密钥已配置
- [ ] Cron 定时任务已配置

### 📊 监控

- [ ] 结构化日志记录已实施
- [ ] 响应时间和错误率指标已收集
- [ ] 告警已配置（错误率、响应时间、存储配额）
- [ ] `observability.enabled = true` 已在 wrangler.toml 中启用

### 🧪 测试

- [ ] 所有 API 端点已测试
- [ ] 邮件接收已测试
- [ ] 附件处理已测试
- [ ] 速率限制已测试
- [ ] CORS `ALLOWED_ORIGINS` 不包含 localhost

### 📝 文档

- [ ] API 文档已完成
- [ ] 部署程序已记录
- [ ] 服务条款和隐私政策已发布

---

## ⚙️ 配置文件示例

### API Worker 配置 (workers/api/wrangler.toml)
```toml
name = "pmail-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[triggers]
crons = [
  "0 * * * *",        # 每小时清理过期数据
  "0 0 */30 * *"      # 每30天执行密钥轮换
]

[[d1_databases]]
binding = "DB"
database_name = "temp-email-db"
database_id = "your-database-id"

[[r2_buckets]]
binding = "R2"
bucket_name = "temp-email-attachments"

[[kv_namespaces]]
binding = "RESET_TOKENS"
id = "your-kv-namespace-id"

[[kv_namespaces]]
binding = "JWT_KEYS"
id = "your-jwt-keys-namespace-id"

[vars]
DOMAIN = "temp.example.com"
FRONTEND_URL = "https://your-app.pages.dev"
ALLOWED_ORIGINS = "https://your-app.pages.dev,http://localhost:3000"
KEY_ROTATION_DAYS = "30"
KEY_GRACE_PERIOD_DAYS = "7"
```

### Email Worker 配置 (workers/email/wrangler.toml)
```toml
name = "pmail-receiver"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "temp-email-db"
database_id = "your-database-id"

[[r2_buckets]]
binding = "R2"
bucket_name = "temp-email-attachments"

[vars]
DOMAIN = "temp.example.com"
```

### 前端配置 (web/.env)
```env
VITE_API_BASE_URL=https://api.yourdomain.com
```
