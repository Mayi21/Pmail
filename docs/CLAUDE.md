# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在此代码仓库中工作的指导。

## 项目概述 (Project Overview)

PMail 是一个完全基于 Cloudflare 免费服务构建的临时邮箱系统。架构包含：

- **API Worker** (`workers/api/`) - 基于 Hono 的 REST API，使用 JWT 认证，处理用户管理和邮件查询
- **Email Worker** (`workers/email/`) - 通过 Cloudflare Email Routing 接收邮件并处理
- **Web Frontend** (`web/`) - React + TypeScript 单页应用，使用 TailwindCSS 和 React Query
- **D1 Database** - SQLite 数据库，存储用户、邮箱、邮件、附件
- **R2 Storage** - 单桶对象存储，附件用 `attachments/` 前缀、数据库备份用 `backups/` 前缀
- **KV Stores** - 2 个命名空间：`JWT_KEYS`（版本化 JWT 签名密钥）+ `CACHE`（共享缓存，前缀复用：`reset:*` / `oauth:*` / `email_valid:*` / `settings:*`）

## 架构原则 (Architecture Principles)

### 数据流与所有权 (Data Flow & Ownership)
每条数据都通过外键链绑定到用户：
```
users → temp_emails → emails → attachments
```
所有查询**必须**包含 `user_id` 条件以防止未授权访问。中间件 `workers/api/src/middleware/auth.ts` 从 JWT/API Key 中提取 `user_id` 并附加到上下文。

### 认证系统 (Authentication System)
- **Web 用户**: JWT 令牌，自动密钥轮换（30 天周期）
- **OAuth 用户**: 支持使用 Linux.do 账号登录，无需密码
- **API 用户**: SHA-256 哈希的 API 密钥存储在 `api_keys` 表
- **游客**: `temp_emails.user_id` 可为 NULL，用于匿名邮箱
- JWT 密钥版本化存储在 KV，令牌头部包含 `kid` (key ID)
- 令牌验证前会检查密钥状态（active/retired/deleted）
- OAuth 账户与密码账户隔离，OAuth 用户的 `password_hash` 为 NULL

### 邮件处理流程 (Email Processing)
Cloudflare Email Routing 使用 catch-all 接收 `*@domain.com`，触发 Email Worker：
1. 验证收件地址在 D1 中存在
2. 使用 `mailparser` 或类似工具解析邮件
3. 邮件正文/头部存入 D1，附件存入 R2
4. 使用 temp_email_id 关联邮件到邮箱

### 安全层级 (Security Layers)
1. **Turnstile CAPTCHA** - 注册/登录时验证 (`workers/api/src/services/turnstileService.ts`)
2. **登录锁定** - 5 次失败尝试 = 15 分钟锁定 (`workers/api/src/services/loginLockout.ts`)
3. **速率限制** - 每分钟和每日限制，通过 D1 表 + 内存缓存
4. **API 密钥权限** - `read` 与 `read,write` 以 CSV 格式存储在 `api_keys.permissions`
5. **CORS** - 限制为 `ALLOWED_ORIGINS` 环境变量指定的域名

## 常用开发命令 (Common Development Commands)

### 后端 API Worker (Backend - API Worker)
```bash
cd workers/api
npm run dev              # 启动开发服务器 localhost:8787
npm run deploy           # 部署到 Cloudflare
npm run test             # 运行 Vitest 测试
npm run type-check       # TypeScript 类型检查
```

### 后端 Email Worker (Backend - Email Worker)
```bash
cd workers/email
npm run dev              # 开发服务器
npm run deploy           # 部署邮件处理器
```

### 前端 (Frontend)
```bash
cd web
npm run dev              # 启动 Vite 开发服务器 localhost:5173
npm run build            # 生产构建
npm run deploy           # 构建并部署到 Cloudflare Pages
npm run type-check       # TypeScript 类型检查
```

### 数据库操作 (Database Operations)
```bash
# 执行数据库结构 (Execute schema)
wrangler d1 execute temp-email-db --file=./schema.sql

# 运行迁移 (Run migrations)
wrangler d1 execute temp-email-db --file=./migrations/001_add_column.sql

# 查询数据库 (Query database)
wrangler d1 execute temp-email-db --command="SELECT * FROM users LIMIT 5"

# 本地开发数据库 (Local development database)
wrangler d1 execute temp-email-db --local --file=./schema.sql
```

### 测试邮件接收 (Testing Email Reception)
发送邮件到任意 `{random}@your-domain.com` 地址，查看 Worker 日志：
```bash
wrangler tail pmail-receiver
```

## 关键代码位置 (Key Code Locations)

### 认证与授权 (Authentication & Authorization)
- `workers/api/src/middleware/auth.ts` - JWT 和 API 密钥验证
- `workers/api/src/services/jwtKeyManager.ts` - 密钥轮换逻辑
- `workers/api/src/routes/auth.ts` - 注册、登录、密码重置

### 速率限制 (Rate Limiting)
- `workers/api/src/middleware/rateLimit.ts` - 每分钟内存缓存
- `workers/api/src/services/dailyRateLimit.ts` - 每日 D1 持久化
- 使用 `rate_limits` 表 + 内存 Map 提升性能

### 邮件处理 (Email Processing)
- `workers/email/src/index.ts` - 邮件处理器，导出 `email()` 函数
- `workers/api/src/routes/email.ts` - 邮件查询端点
- Email Worker 通过 `ForwardableEmailMessage` 接口接收

### API 密钥管理 (API Key Management)
- `workers/api/src/routes/apikey.ts` - CRUD 操作
- 支持每用户多密钥（移除 UNIQUE 约束）
- 包含 `name`、`permissions`、`expires_at`、`is_active` 字段

### 定时任务 (Cron Jobs)
配置在 `workers/api/wrangler.toml`：
- `0 * * * *` - 每小时清理过期邮箱 + 检查 tier 过期
- `0 2 * * *` - 每日 D1 备份到 R2（`backups/` 前缀）；scheduled handler 内按 `day-of-month % KEY_ROTATION_DAYS === 0` 触发 JWT 密钥轮换
- 实现在 `workers/api/src/index.ts` 的 scheduled 处理器

## 重要限制 (Important Constraints)

### Cloudflare 平台限制 (Cloudflare Limits)
- Workers 响应大小: 最大 1MB（需对大结果分页）
- 邮件大小: 最大 25MB (Cloudflare Email Routing 限制)
- D1 查询结果: 每次查询最多 1000 行
- Worker CPU 时间: 免费套餐 50ms

### 应用限制 (Application Limits)
- 每用户最大邮箱数: 10（通过 `MAX_MAILBOXES_PER_USER` 配置）
- 附件大小: 每个文件 10MB
- 游客邮箱 TTL: 2 小时（不可延长）
- 密码要求: 8-64 字符，必须包含大写、小写字母和数字

### 速率限制（每用户）(Rate Limits per User)
- 创建邮箱: 10 次/分钟
- 查询邮件: 30 次/分钟
- 注册: 每 IP 每小时 3 次
- 登录尝试: 5 次失败 = 15 分钟锁定

## 数据库结构说明 (Database Schema Notes)

### 游客模式支持 (Guest Mode Support)
`temp_emails.user_id` 可为 NULL，用于匿名邮箱。查询模式：
```sql
-- 获取游客邮箱 (Get guest mailbox)
SELECT * FROM temp_emails WHERE address = ? AND user_id IS NULL

-- 获取用户邮箱 (Get user mailbox)
SELECT * FROM temp_emails WHERE address = ? AND user_id = ?
```

### 软删除 (Soft Deletes)
表使用 `deleted_at` 时间戳代替硬删除：
- `temp_emails.deleted_at`
- `emails.deleted_at`
- `attachments.deleted_at`

查询默认应过滤 `WHERE deleted_at IS NULL`。

### 多 API 密钥设计 (Multi-API-Key Design)
`api_keys` 表支持每用户多密钥：
- `name` 字段用于用户友好标签
- `permissions` 字段: 逗号分隔（`read`, `write`, `admin`）
- `is_active` 开关，无需删除即可禁用
- 验证有效性需检查 `expires_at IS NULL OR expires_at > NOW()`

## 环境变量 (Environment Variables)

### 关键密钥（使用 `wrangler secret put`）(Critical Secrets)
- `TURNSTILE_SECRET_KEY` - Cloudflare Turnstile 验证密钥
- `DATABASE_ENCRYPTION_KEY` - （待实现）用于加密邮件正文

### 配置变量（`wrangler.toml` [vars]）(Configuration)
- `DOMAIN` - 邮件域名（例如 `your-domain.com`）
- `FRONTEND_URL` - Pages 部署 URL
- `ALLOWED_ORIGINS` - 逗号分隔的 CORS 允许源
- `KEY_ROTATION_DAYS` - JWT 密钥轮换周期（默认: 30）
- `GUEST_MAILBOX_TTL` - 游客会话时长，单位秒（默认: 7200）

## 测试方法 (Testing Approach)

### 单元测试 (Unit Tests)
- 位置: `workers/api/test/`
- 使用 Vitest 和 `@cloudflare/workers-types`
- 使用 Miniflare 模拟 D1、KV、R2 绑定

### API 测试 (API Testing)
参考 `workers/api/openapi.yaml` 中的 OpenAPI 规范。关键流程：

1. **用户注册 (User Registration)**
   ```
   POST /api/auth/register → JWT token
   ```

2. **创建邮箱 (Create Mailbox)**
   ```
   POST /api/mailbox/create (携带 JWT)
   ```

3. **生成 API 密钥 (Generate API Key)**
   ```
   POST /api/apikey/generate (携带 JWT) → API key
   ```

4. **通过 API 密钥查询邮件 (Query Emails via API Key)**
   ```
   GET /v1/mailbox/{address}/emails (使用 X-API-Key 请求头)
   ```

## 常见陷阱 (Common Pitfalls)

1. **忘记 user_id 检查** - 查询时务必通过 user_id 验证所有权
2. **未处理 NULL user_id** - 游客邮箱的 `user_id IS NULL`
3. **超过 1MB 响应限制** - Worker 响应有上限，需使用分页
4. **Email handler 与 fetch handler** - Email Worker 使用 `email()` 而非 `fetch()`
5. **KV 最终一致性** - KV 写入可能无法立即读取
6. **D1 事务限制** - 每个事务最大 10MB
7. **速率限制缓存** - 分钟级限制使用内存 Map（每个 Worker 实例重置）

## 生产环境部署前安全检查清单 (Security Checklist Before Production)

- [ ] 通过 `wrangler secret put` 设置 `TURNSTILE_SECRET_KEY`
- [ ] 实现邮件正文加密（参见 `SECURITY_IMPROVEMENT_PLAN.md`）
- [ ] 在前端启用 CSP 头部（`web/index.html`）
- [ ] 配置 Cloudflare WAF 规则
- [ ] 为登录失败峰值设置监控/告警
- [ ] 手动测试 JWT 密钥轮换 Cron 任务
- [ ] 验证生产环境的 CORS `ALLOWED_ORIGINS` 不包含 localhost
- [ ] 在 `wrangler.toml` 中启用 `observability.enabled = true`

## 参考文档 (Reference Documentation)

- 完整 API 文档: `README.md`（第 101-932 行）
- 数据库结构详情: `schema.sql`
- 安全改进计划: `SECURITY_IMPROVEMENT_PLAN.md`
- 部署检查清单: `PRODUCTION_CHECKLIST.md`
- 游客模式实现: `GUEST_MODE_DEPLOYMENT.md`
