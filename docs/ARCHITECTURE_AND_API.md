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

本系统仅提供内部 API（供 Web 前端调用），统一使用 JWT 认证。路由分两类：

- `/api/*` — 普通用户端点，需要 JWT
- `/api/admin/*` — 管理员端点，需要 JWT 且 `users.role = 'admin'`
- 少量公开端点无需认证（健康检查、公开域名、公开配置、游客邮箱）

### 🌐 内部 API（Web 前端）

#### 认证方式

除明确标注「无需认证」的端点外，所有 API 需要 JWT Token：
```http
Authorization: Bearer {token}
```

JWT 使用单一静态密钥签发与验证（HS256）。密钥 `JWT_SECRET` 作为 Worker secret 通过 `wrangler secret put` 写入（由 `scripts/bootstrap.mjs` 首次部署时自动生成并推送），逻辑见 `workers/api/src/services/jwt.ts`。需要轮换时手动重推 `JWT_SECRET`，所有已签发的 token 即时失效。

---

#### 系统接口

#### 0. 健康检查（无需认证）
```http
GET /health           # 基础健康检查
GET /health/detailed  # 包含 DB / KV / R2 依赖状态
GET /health/ready     # 部署就绪检查

成功响应（200）：
{
  "status": "healthy",
  "service": "pmail-api",
  "timestamp": "2025-10-12T12:30:00Z",
  "version": "1.0.0-kv-optimized",
  "response_time": 1
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
  "message": "Registration successful",
  "data": {
    "user_id": 1,
    "username": "user123",
    "email": "user@example.com"
  }
}

失败响应（400）：
{
  "success": false,
  "error": "Username or email already exists",
  "error_code": "USER_ALREADY_EXISTS"
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
  "error": "Invalid username or password",
  "error_code": "AUTH_INVALID_CREDENTIALS"
}

说明：
- 同时受 IP 与 username 双维度登录失败锁定（5 次失败 → 15 分钟锁定，返回 429）
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

### 邮箱管理接口

#### 1. 创建临时邮箱
```http
POST /api/mailbox/create
Authorization: Bearer {token}
Content-Type: application/json

请求体（可选）：
{
  "prefix": "custom",      // 可选：自定义前缀，匹配 ^[a-z0-9]+$
  "expires_in": 3600,      // 可选：过期时间（秒）；0 = 永久邮箱，否则 600-86400
  "domain": "example.com"  // 可选：指定使用哪个已启用的域名
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
  "error": "Mailbox quota exceeded. You have 10/10 permanent mailboxes.",
  "error_code": "QUOTA_EXCEEDED"
}
```

#### 2. 创建游客邮箱（无需认证）
```http
POST /api/mailbox/create-guest
Content-Type: application/json

说明：游客邮箱 user_id 为 NULL，TTL 由 GUEST_MAILBOX_TTL 控制（默认 7200 秒），不可续期。
响应字段包含 is_guest: true。
```

#### 3. 获取用户的邮箱列表
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
      "unread_count": 2,
      "is_expired": false
    }
  ]
}
```

#### 4. 删除临时邮箱
```http
DELETE /api/mailbox/:address
Authorization: Bearer {token}
```

### 邮件查询接口

#### 1. 获取指定邮箱的邮件列表
```http
GET /api/emails/:address
Authorization: Bearer {token}

查询参数（可选）：
- page: 页码，默认 1
- limit: 每页数量，默认 20（最大 100）

成功响应（200）：
{
  "success": true,
  "data": {
    "emails": [
      {
        "id": 1,
        "from_address": "noreply@github.com",
        "from_name": null,
        "to_address": "abc123@temp.example.com",
        "subject": "Verify your email address",
        "body_text": "Please click the link to verify...",
        "received_at": "2025-10-12T12:28:35Z",
        "is_read": false,
        "size_bytes": 1234,
        "has_attachments": true
      }
    ],
    "total": 2,
    "page": 1,
    "limit": 20
  }
}
```

#### 2. 游客邮箱邮件列表（无需认证）
```http
GET /api/emails/guest/:address
```

#### 3. 关键字搜索邮件
```http
GET /api/emails/:address/search?q=keyword
Authorization: Bearer {token}

查询参数：
- q: 搜索关键字（必填）
- scope: 搜索范围，默认 "all"（all/subject/from/body）
- date_from: 开始日期（ISO 8601）
- date_to: 结束日期（ISO 8601）
- page, limit: 分页
```

#### 4. 获取邮件详情
```http
GET /api/email/:id
Authorization: Bearer {token}
```
另有 `GET /api/email/guest/:id`（无需认证，仅返回游客邮箱中的邮件）。

#### 5. 删除单封邮件
```http
DELETE /api/email/:id
Authorization: Bearer {token}
```

#### 6. 批量删除邮件
```http
DELETE /api/email/batch
Authorization: Bearer {token}
Content-Type: application/json

请求体：
{
  "ids": [1, 2, 3, 4, 5]   // 1-100 个 ID
}
```

#### 7. 查看原始邮件
```http
GET /api/email/:id/raw
Authorization: Bearer {token}
```

#### 8. 标记为已读
```http
PATCH /api/email/:id/read
Authorization: Bearer {token}
```

### 附件接口

```http
GET    /api/attachment/:id                 # 附件元数据
GET    /api/attachment/:id/download        # 下载附件（流式）
GET    /api/attachment/:id/url             # 生成签名下载 URL（expires_in 60-86400）
GET    /api/attachment/:id/preview         # 图片预览（可带 width / height）
POST   /api/attachment/:id/scan            # 病毒扫描
DELETE /api/attachment/:id                 # 删除附件
GET    /api/attachment/email/:emailId      # 某封邮件的全部附件
GET    /api/attachment/storage/stats       # 当前用户附件存储统计
POST   /api/attachment/cleanup             # 清理过期附件（仅 admin）
```

权限验证：通过 `attachment_id → email_id → temp_email_id` 链验证 `temp_emails.user_id` 与当前用户匹配。附件本体存放在 R2 桶的 `attachments/{emailId}/{uuid}-{filename}` 路径下。

### 用户信息接口

```http
GET /api/user/me            # 用户资料 + tier 信息 + quota 详情
GET /api/user/quota         # 仅 quota 信息（轻量版）
GET /api/user/statistics    # 用户统计明细
```

### 用户设置接口

```http
GET   /api/user/settings    # 获取用户设置
PATCH /api/user/settings    # 更新用户设置（局部更新）
```

字段：`default_mailbox_duration`、`timezone`、`notifications_enabled`、`webhook_enabled`、`webhook_url`、`webhook_secret`。

### 邮件转发接口

```http
GET    /api/user/forwarding         # 当前转发配置
PUT    /api/user/forwarding         # 设置/更新转发目标（自动调用 Cloudflare API 创建 Destination Address）
POST   /api/user/forwarding/refresh # 刷新目标地址的验证状态
PATCH  /api/user/forwarding/toggle  # 开关转发（{ enabled: boolean }）
DELETE /api/user/forwarding         # 删除转发配置
```

转发目标域名不允许使用本服务管理的任何域名（防止环路）。

### 兑换码接口

```http
POST /api/redemption/redeem    # 兑换代码 { code: "..." }
POST /api/redemption/check     # 校验代码是否可用（不消费）
GET  /api/redemption/history   # 当前用户兑换历史（limit 默认 50，最大 100）
```

### 公告接口

```http
GET  /api/announcements/unread   # 未读公告列表（已登录用户）
POST /api/announcements/:id/read # 标记公告已读
```

### 公开端点（无需认证）

```http
GET /api/settings/public      # 公开的系统配置（is_public = 1）
GET /api/domains              # 已启用的域名列表
GET /api/domains/default      # 默认域名
```

### 管理员接口（`/api/admin/*`，需要 admin 角色）

```http
# 统计
GET    /api/admin/statistics

# 用户管理
GET    /api/admin/users
GET    /api/admin/users/:id
PATCH  /api/admin/users/:id/tier
PATCH  /api/admin/users/:id/role
DELETE /api/admin/users/:id

# Tier 管理
GET    /api/admin/tiers/list
GET    /api/admin/tiers/:id
POST   /api/admin/tiers/create
PATCH  /api/admin/tiers/:id/update
PATCH  /api/admin/tiers/:id/toggle
DELETE /api/admin/tiers/:id

# 兑换码管理
POST   /api/admin/redemption/generate
GET    /api/admin/redemption/list
GET    /api/admin/redemption/:id
PATCH  /api/admin/redemption/:id/toggle
DELETE /api/admin/redemption/:id

# 系统设置
GET    /api/admin/settings
GET    /api/admin/settings/:key
PATCH  /api/admin/settings/:key
POST   /api/admin/settings/batch

# 备份
POST   /api/admin/backup/trigger
GET    /api/admin/backup/list
GET    /api/admin/backup/latest
GET    /api/admin/backup/:encodedKey/download
DELETE /api/admin/backup/:encodedKey

# 公告管理
POST   /api/admin/announcements
GET    /api/admin/announcements/list
GET    /api/admin/announcements/:id
PATCH  /api/admin/announcements/:id
PATCH  /api/admin/announcements/:id/toggle
DELETE /api/admin/announcements/:id

# 域名管理
GET    /api/admin/domains/list
GET    /api/admin/domains/:id
POST   /api/admin/domains/create
PATCH  /api/admin/domains/:id/update
PATCH  /api/admin/domains/:id/toggle
PATCH  /api/admin/domains/:id/set-default
DELETE /api/admin/domains/:id
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
         → Email Worker (email() handler 接收 catch-all 邮件)
         → 校验收件域名（KV `settings:active_domains` → D1 domains 表 → 回退 env.DOMAIN）
         → 校验收件地址（KV `email_valid:<address>` → D1 temp_emails；仅缓存有效地址）
         → postal-mime 解析
         → 正文 / HTML / raw 直接以明文写入 D1
         → 附件写 R2（key 格式 attachments/{emailId}/{uuid}-{filename}）
```

### 用户访问流程
```
用户访问 → Cloudflare Pages (前端)
         → 调用 API Worker
         → 验证 JWT Token（HS256 单密钥）
         → 查询 D1 数据库（必须包含 user_id 与 deleted_at IS NULL 过滤）
         → 返回数据
```

### 缓存策略

仅使用 1 个 KV namespace `CACHE`，按 key 前缀复用：

| Key 前缀 | 用途 | TTL |
|----------|------|-----|
| `reset:*` | 密码重置 token | 1 小时 |
| `email_valid:<address>` | 收件地址正向缓存（**只写有效地址**，无效地址直查 D1 防 KV 配额被刷爆） | 与邮箱过期时间一致；永久邮箱 7 天 |
| `settings:*` | 应用级配置（含 `active_domains`） | 由配置项决定 |

进程内（Worker 实例内）的 `Map` 用于分钟级速率限制（`middleware/rateLimit.ts`），跨实例重置；日级速率限制由 D1 的 `rate_limits` 表持久化。

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

JWT 使用单一静态密钥签发与验证（HS256）。密钥 `JWT_SECRET` 作为 Cloudflare Worker secret 存储，通过 `wrangler secret put JWT_SECRET` 写入（`scripts/bootstrap.mjs` 首次部署时用 `openssl rand -base64 32` 自动生成并推送；若已存在则跳过）。签名与验证使用同一密钥，实现见 `workers/api/src/services/jwt.ts`，token 有效期 7 天。如需轮换，手动重推 `JWT_SECRET` 即可，效果是所有已签发的 token 立即失效、用户被迫重新登录。当前架构不支持密钥共存的平滑过渡，如需平滑轮换需引入版本化机制（暂未实现）。

### 数据清理与定时任务

| Cron | 作用 |
|------|------|
| `0 * * * *` | 每小时清理过期邮箱（级联删除邮件 / 附件）+ 检查 tier 过期自动降级 |
| `0 2 * * *` | 每日 02:00 UTC 备份 D1 到 R2（`backups/` 前缀），并按 `BACKUP_RETENTION_DAYS` 清理旧备份 |

- **软删除**：`users`、`temp_emails`、`emails`、`attachments` 都使用 `deleted_at` 时间戳，查询默认过滤 `WHERE deleted_at IS NULL`
- **配额**：每用户最大邮箱数由 `tier_configs` 表的 `permanent_mailbox_quota` / `temporary_mailbox_quota` 字段决定（basic 默认 10 永久邮箱）

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
