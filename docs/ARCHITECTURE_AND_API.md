# PMail - API 与架构文档

本文档包含 PMail 项目的完整 API 接口文档、架构原理、实现细节等。

> 项目概述和快速开始请参见 [README.md](../README.md)
> 部署指南请参见 [DEPLOYMENT.md](./DEPLOYMENT.md)
> 数据库表结构请参见 [schema.sql](../schema.sql)（真相源）

---

## 目录

- [API 接口文档](#-api-接口文档)
  - [内部 API（Web 前端）](#-内部-apiweb-前端)
- [Web 界面设计](#-web-界面设计)
- [工作流程与架构原理](#-工作流程与架构原理)
- [实现原理](#-实现原理)
- [安全特性与限制](#-安全特性与限制)
- [成本估算详情](#-成本估算详情)

---

## 🔌 API 接口文档

本系统提供一套内部 API：使用 JWT Token 认证，供 Web 前端调用，路径前缀 `/api`。

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

### JWT 签名密钥

JWT 使用单一静态密钥 `JWT_SECRET`（HS256），通过 `wrangler secret put JWT_SECRET` 设置。签发与验证逻辑见 `workers/api/src/services/jwt.ts`。

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

## 📚 相关文档

- 部署与运维：[DEPLOYMENT.md](./DEPLOYMENT.md)
- 上线检查清单：[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)
- 数据库表结构：[../schema.sql](../schema.sql)
- 临时邮箱配额计算细节：[TEMPORARY_MAILBOX_LOGIC.md](./TEMPORARY_MAILBOX_LOGIC.md)
- 功能 roadmap：[FEATURE_GAP_ANALYSIS.md](./FEATURE_GAP_ANALYSIS.md)
