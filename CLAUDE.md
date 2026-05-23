# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 代码开发约束

### 无历史兼容性负担

**当前项目尚未上线，进行代码修改或方案设计时无需考虑向后兼容。**

具体含义：
- 数据库 schema 可直接修改 `schema.sql`，无需写 migration 脚本来兼容旧数据
- API 接口可直接调整请求 / 响应格式，无需保留旧字段或版本化端点
- 配置项、环境变量、KV / R2 key 命名可直接重命名或删除
- 内部类型、函数签名、模块路径可自由重构，无需保留 deprecated 别名或转发层
- 不要写 "兼容旧版本"、"过渡期" 之类的代码分支；直接采用最优方案

唯一例外：外部依赖（Cloudflare 平台 API、第三方 OAuth 协议、postal-mime 等）的契约仍需遵守。

### 并行开发

**修改前必须先拆分修改点，将互不依赖的部分通过并行 Agent 同时开发。**

每次接到非平凡的修改任务时，按以下流程执行：

1. **拆分** — 在动手前先列出本次需要改动的所有点（文件 / 模块 / 功能）
2. **判定依赖** — 标记每个修改点之间是否存在依赖（共享类型、调用关系、schema 变更等）
3. **并行分发** — 将**互不依赖**的修改点分到独立的 Agent（通过单条消息中的多个 `Agent` 工具调用并行触发），依赖链上的修改点保留在主 Agent 中按序处理
4. **汇总验证** — 所有 Agent 返回后，主 Agent 负责跨文件一致性检查（类型、import、命名）和最终测试

### 何时必须并行

- 跨 `workers/api`、`workers/email`、`web` 三个部署单元的修改（默认无依赖）
- 同一目录下不同 route / service 文件的独立功能
- 前后端可同步开发的新功能（先定义 API 契约，前后端 Agent 并行实现）
- 文档 / 测试 / 实现的拆分（测试与文档可独立于实现并行编写）

### 何时不并行

- 共享类型或接口定义的修改（先改类型，再让下游 Agent 并行消费）
- 数据库 schema + 依赖该 schema 的查询（schema 先行）
- 单文件内的多处修改

并行执行时使用 `Agent` 工具，**在同一条消息中发出多个并行调用**，不要串行启动。

## 项目概述

PMail 是部署在 Cloudflare 免费服务上的临时邮箱系统，由三个独立部署单元组成：

- **API Worker** (`workers/api/`) — Hono REST API，JWT 认证、用户/邮箱/邮件管理、定时任务、Queue 消费者
- **Email Worker** (`workers/email/`) — Cloudflare Email Routing 的 `email()` handler，接收 catch-all 邮件并写入 D1 + R2
- **Web Frontend** (`web/`) — React + Vite + TanStack Query + Zustand SPA，部署到 Cloudflare Pages

数据存储：D1（SQLite）、R2 单桶（附件用 `attachments/` 前缀，数据库备份用 `backups/` 前缀）、1 个 KV namespace：`CACHE`（共享缓存，按 key 前缀复用：`reset:*` 密码重置 / `email_valid:*` 收件地址正向缓存 / `settings:*` 应用级配置）。JWT 使用单一静态密钥 `JWT_SECRET`（HS256），通过 `wrangler secret put JWT_SECRET` 设置。

## 架构原则

### 数据所有权
所有用户数据通过外键链定位：`users → temp_emails → emails → attachments`。**所有查询必须包含 `user_id` 条件**（游客邮箱例外，见下文）。中间件 `workers/api/src/middleware/auth.ts` 从 JWT 解析 `user_id` 并写入 Hono context。

### 两种身份
1. **注册用户** — JWT (`/api/*` 路径)，密码登录
2. **游客** — `temp_emails.user_id IS NULL`，2 小时 TTL；查询模式 `WHERE address = ? AND user_id IS NULL`

### JWT 签名密钥
JWT 使用单一静态密钥 `JWT_SECRET`（HS256），通过 `wrangler secret put JWT_SECRET` 设置。签发与验证逻辑见 `workers/api/src/services/jwt.ts`。

### 邮件入站流程 (`workers/email/src/index.ts`)
1. 校验收件域名（先查 `CACHE` KV 的 `settings:active_domains`，再查 D1 `domains` 表，回退到 `env.DOMAIN`）
2. 校验收件地址（先查 `CACHE` KV 的 `email_valid:<address>` 标记，未命中查 D1；**只缓存有效地址**，无效地址直查 DB 防止 KV 配额被刷爆）
3. `postal-mime` 解析；正文 / HTML / raw 直接落 D1 明文
4. 附件写 R2（key 格式 `attachments/{emailId}/{uuid}-{filename}`），元数据写 `attachments` 表

### 速率限制双层设计
- **分钟级** — 进程内 `Map`（`middleware/rateLimit.ts`），按 Worker 实例重置，不持久化
- **日级** — D1 `rate_limits` 表（`services/dailyRateLimit.ts`），跨实例共享
- 登录失败单独表 `login_failures`，5 次失败锁定 15 分钟（`services/loginLockout.ts`）

### 分级与兑换码 (Tier & Redemption)
- `tier_configs` 表定义等级（`basic`/`premium`），驱动 `permanent_mailbox_quota`、`temporary_mailbox_quota`
- `users.tier_id` + `tier_expires_at`（NULL = 永久）；过期由 cron 调用 `services/tierExpirationService.ts:checkExpiredTiers` 自动降级
- 兑换码表 `redemption_codes` 支持 `permanent`/`days`/`months` 时效，逻辑见 `services/redemptionService.ts`

### Admin 与公告
- `users.role` 取值 `user`|`admin`，路由通过 `routes/admin/*` 暴露
- 全站公告通过 `routes/announcements.ts` + `web/src/components/AnnouncementDialog.tsx` 弹窗

## 路由结构

API Worker 在 `workers/api/src/index.ts` 挂载：
- `/api/*` — 前端使用，JWT 认证
- `/api/admin/*` — admin 角色检查

## 常用命令

### API Worker
```bash
cd workers/api
npm run dev              # localhost:8787
npm run deploy           # wrangler deploy
npm test                 # vitest（运行单测）
npm test -- path/to/file # 单文件测试
npm run type-check       # tsc --noEmit
npm run lint             # eslint
```

### Email Worker
```bash
cd workers/email
npm run dev
npm run deploy
wrangler tail pmail-receiver   # 实时查看收件日志
```

### Frontend
```bash
cd web
npm run dev              # localhost:5173（已通过 vite.config.ts 代理 /api 到 :8787）
npm run build            # tsc && vite build → dist/
npm run deploy           # build + wrangler pages deploy dist
npm run type-check
```

### D1 操作
```bash
# 远程执行 schema
wrangler d1 execute <db-name> --file=./schema.sql

# 本地开发库（Miniflare）
wrangler d1 execute <db-name> --local --file=./schema.sql

# 执行 migrations（migrations/ 下增量脚本）
wrangler d1 execute <db-name> --file=./migrations/<file>.sql

# adhoc 查询
wrangler d1 execute <db-name> --command="SELECT * FROM users LIMIT 5"
```

### 配置文件
首次开发或部署前需拷贝并填写：
```
cp workers/api/wrangler.toml.example workers/api/wrangler.toml
cp workers/email/wrangler.toml.example workers/email/wrangler.toml
cp .env.example web/.env
```
两个 wrangler 配置中的 `database_id`、`bucket_name`、`CACHE` KV `id` **必须一致**，否则 Worker 间数据不互通。

## 定时任务 (`workers/api/wrangler.toml`)

| Cron | 作用 | 实现 |
|------|------|------|
| `0 * * * *` | 每小时清理过期邮箱 + 检查 tier 过期 | `cleanupExpiredData` + `checkExpiredTiers` |
| `0 2 * * *` | 每日 D1 备份到 R2（`backups/` 前缀） | `performDatabaseBackup` + `cleanupOldBackups` |

所有 cron 分发逻辑在 `workers/api/src/index.ts` 的 `scheduled()` handler。

## 关键约束

### Cloudflare 平台
- Worker 响应 ≤ 1MB（大结果必须分页）
- Email Routing 邮件 ≤ 25MB（`MAX_EMAIL_SIZE` 环境变量控制实际接收上限）
- D1 查询单次最多 1000 行
- Worker CPU 时间免费套餐 50ms
- KV 最终一致性（写入后短时间内可能读不到）

### 应用层
- 每用户邮箱数由 `tier_configs` 决定（默认 basic=10 永久邮箱）
- 单附件 10MB（`MAX_ATTACHMENT_SIZE`）、每邮件最多 10 附件
- 游客 TTL 7200 秒（`GUEST_MAILBOX_TTL`），不可续期
- 密码 8-64 字符，必须包含大小写字母 + 数字

### 软删除
`temp_emails`、`emails`、`attachments`、`users` 都使用 `deleted_at`。**查询默认必须加 `WHERE deleted_at IS NULL`**，否则会读到已删数据。

## 测试

`workers/api/test/` 使用 Vitest + Miniflare（`vitest.config.ts` 配置了 `TEST_DB`、`TEST_KV`、`TEST_BUCKET`、`TEST_QUEUE` 绑定）。`test/setup.ts` 中有共享 fixture。

## 常见陷阱

1. **忘记 `user_id` 检查** — 任何邮箱/邮件查询都必须按 `user_id` 隔离；游客查询特别用 `user_id IS NULL`
2. **忘记 `deleted_at` 过滤** — 软删除后数据物理仍在
3. **响应超过 1MB** — 邮件列表、附件元数据等需分页
4. **Email Worker handler** — 用 `email()` 而不是 `fetch()`；导出方式与 API Worker 不同
5. **KV 缓存** — `CACHE` 的 `email_valid:*` 只写有效地址，否则恶意请求会刷爆 KV 写配额
6. **CORS** — `ALLOWED_ORIGINS` 是逗号分隔字符串，`workers/api/src/index.ts` 中有正则匹配 Cloudflare Pages preview 域名

## 关键文件索引

| 主题 | 文件 |
|------|------|
| 入口 + cron + queue | `workers/api/src/index.ts` |
| 认证中间件 | `workers/api/src/middleware/auth.ts` |
| JWT 签发与验证 | `workers/api/src/services/jwt.ts` |
| 速率限制 | `workers/api/src/middleware/rateLimit.ts` |
| 邮件接收 | `workers/email/src/index.ts` |
| 数据库 schema | `schema.sql` |
| 增量迁移 | `migrations/` |
| 前端路由 | `web/src/App.tsx` |
| 前端 API client | `web/src/api/client.ts` |
| 前端鉴权状态 | `web/src/stores/authStore.ts` |

## 参考文档

- `docs/DEPLOYMENT.md` — 部署与运维（bootstrap.mjs 资源初始化 + GitHub Actions）
- `docs/PRODUCTION_CHECKLIST.md` — 上线检查清单 + 安全整改路线图
- `docs/ARCHITECTURE_AND_API.md` — API 接口与架构原理（含完整端点列表）
- `docs/TEMPORARY_MAILBOX_LOGIC.md` — 邮箱生命周期与游客模式细节
- `docs/FEATURE_GAP_ANALYSIS.md` — 功能 roadmap
- `README.md` — 部署步骤与功能介绍
