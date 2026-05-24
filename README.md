# PMail - 基于 Cloudflare 的临时邮箱系统

一个完全基于 Cloudflare 免费服务构建的临时邮箱系统，支持用户注册、多邮箱管理、邮件搜索、附件下载等功能。

## 🚀 本地开发与部署

### 1. 配置 Cloudflare 资源

在 Cloudflare 控制台或通过 `wrangler` CLI 创建：

- **D1 Database**：用于存储用户、邮箱、邮件元数据
- **R2 Bucket**：单桶，附件用 `attachments/` 前缀、数据库备份用 `backups/` 前缀
- **KV Namespace**：`CACHE`（共享缓存，按前缀复用：`reset:*` / `email_valid:*` / `settings:*`）

### 2. 拷贝并填写配置文件

```bash
cp workers/api/wrangler.toml.example workers/api/wrangler.toml
cp workers/email/wrangler.toml.example workers/email/wrangler.toml
cp web/.env.example web/.env
```

把上面 3 个文件中的 `your-*` 占位符全部替换为你自己的资源 ID、域名等。两个 wrangler 配置中的 `database_id`、`bucket_name`、`CACHE` KV `id` 必须保持一致。

### 3. 配置 Secrets（敏感凭据）

PMail 的 JWT 签名密钥 `JWT_SECRET` 由 `scripts/bootstrap.mjs` 自动生成并通过 `wrangler secret put` 推送（首次执行时，后续重跑会跳过）。仅在启用 admin 域名/转发管理时，需要在 `workers/api/` 下额外推送 `CLOUDFLARE_API_TOKEN`（需具备 Email Routing Addresses: Edit 权限）。

### 4. 使用 bootstrap 脚本一键初始化资源

```bash
node scripts/bootstrap.mjs    # 创建 D1 / R2 / KV、渲染 wrangler.toml、并自动启用 Email Routing
```

### 5. 通过 GitHub Actions 部署

部署（migrations + Workers + Pages）由 GitHub Actions 完成，本地不再执行 `wrangler deploy`。请按 [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) 配置仓库 secrets 并触发 workflow。

---

## 🎯 功能特性

### 用户系统
- 用户注册和登录
- 用户数据完全隔离
- 游客模式（无需注册，2 小时有效期）

### 邮箱管理
- 随机临时邮箱地址生成
- 每个用户独立管理多个邮箱（数量由 tier 配额决定，basic 默认 10）
- 自定义邮箱过期时间（10 分钟 - 24 小时，或永不过期）
- 邮箱自动过期删除
- 多域名支持

### 邮件功能
- 邮件实时接收（Catch-All）
- 邮件列表查看（支持分页）
- 邮件关键字搜索
- 邮件详情查看（文本和 HTML）
- 附件下载（最大 10MB）
- 未读/已读状态管理
- 批量删除

### API 接口
- 内部 API（`/api`，JWT Token 认证）- 供 Web 前端使用
- 完整的 RESTful 设计

### 安全特性
- bcrypt 密码加密
- JWT 无状态认证（HS256，密钥 `JWT_SECRET` 由 bootstrap 自动生成并写入 Worker secret）
- 登录锁定（5 次失败 = 15 分钟锁定）
- 分级速率限制
- XSS 防护（DOMPurify）和 CORS 配置

## 🚀 技术栈

### Cloudflare 服务
| 服务 | 用途 | 免费额度 |
|------|------|----------|
| **Workers** | 后端 API 和邮件处理 | 10 万请求/天 |
| **Email Routing** | 邮件接收 | 完全免费 |
| **D1** | SQLite 数据库 | 5GB 存储 |
| **KV** | 键值存储缓存 | 1GB |
| **Pages** | 前端托管 | 完全免费 |
| **R2** | 附件对象存储 | 10GB 免费 |

### 技术框架
- **后端**: TypeScript + Hono + jose (JWT)
- **前端**: React + TypeScript + TailwindCSS + React Query
- **工具**: Wrangler CLI

## 📁 项目结构

```
PMail/
├── workers/
│   ├── api/                    # API Worker（Hono REST API）
│   │   ├── src/
│   │   │   ├── index.ts       # 入口文件 + Cron 处理
│   │   │   ├── routes/        # 路由模块（auth, mailbox, email, admin）
│   │   │   ├── middleware/    # 中间件（auth, rateLimit, error）
│   │   │   ├── services/      # 业务逻辑
│   │   │   └── utils/         # 工具函数
│   │   ├── test/              # Vitest 测试
│   │   └── wrangler.toml      # Worker 配置
│   └── email/                  # Email Worker
│       ├── src/
│       │   └── index.ts       # 邮件接收处理（email() handler）
│       └── wrangler.toml
├── web/                        # 前端项目（React SPA）
│   ├── src/
│   │   ├── components/        # React 组件
│   │   ├── pages/             # 页面
│   │   ├── api/               # API 调用
│   │   ├── hooks/             # 自定义 Hooks
│   │   ├── stores/            # Zustand 状态管理
│   │   └── App.tsx
│   └── vite.config.ts
├── schema.sql                  # D1 数据库结构
└── README.md
```

## 🛠️ 快速开始

### 前置要求
- Node.js 18+
- Cloudflare 账号 + 一个域名
- Wrangler CLI: `npm install -g wrangler`

### 本地开发

```bash
# 后端 API Worker
cd workers/api
npm install
npm run dev              # localhost:8787

# 前端
cd web
npm install
npm run dev              # localhost:5173
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `cd workers/api && npm run dev` | 启动 API 开发服务器 |
| `cd workers/api && npm run test` | 运行后端测试 |
| `cd workers/api && npm run type-check` | TypeScript 类型检查 |
| `cd web && npm run dev` | 启动前端开发服务器 |
| `cd web && npm run build` | 前端生产构建 |
| `cd web && npm run type-check` | 前端类型检查 |

### 数据库操作

```bash
# 执行数据库结构
wrangler d1 execute temp-email-db --file=./schema.sql

# 本地开发数据库
wrangler d1 execute temp-email-db --local --file=./schema.sql

# 查询数据库
wrangler d1 execute temp-email-db --command="SELECT * FROM users LIMIT 5"
```

## 🚦 部署步骤

### 1. 一键初始化 Cloudflare 资源

```bash
wrangler login
node scripts/bootstrap.mjs
```

`bootstrap.mjs` 会自动：

- 创建 D1 database、R2 bucket、`CACHE` KV namespace
- 把对应 ID 写入 `workers/api/wrangler.toml` 与 `workers/email/wrangler.toml`
- 通过 Cloudflare API 启用 Email Routing 并配置 MX / SPF 记录（需设置 `CLOUDFLARE_API_TOKEN` 环境变量）

### 2. 应用数据库 schema

```bash
wrangler d1 execute <your-database-name> --file=./schema.sql
```

### 3. 配置 secrets

PMail 的 JWT 签名密钥 `JWT_SECRET` 由 `scripts/bootstrap.mjs` 自动生成并通过 `wrangler secret put` 推送（首次执行时，后续重跑会跳过）。如需手动轮换 `JWT_SECRET` 或启用 admin 域名/转发管理，可按需手动推送：

```bash
# 仅在 bootstrap 未执行 / 需要手动轮换 JWT_SECRET 时
cd workers/api
openssl rand -base64 32 | wrangler secret put JWT_SECRET

# 启用 admin 域名/转发管理（可选）
cd workers/api
wrangler secret put CLOUDFLARE_API_TOKEN
```

### 4. 通过 GitHub Actions 部署

将仓库 fork 到 GitHub，按 [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) 配置 `CLOUDFLARE_API_TOKEN` 等 secrets，推送到 `main` 即触发 `.github/workflows/deploy.yml`，自动部署 API Worker、Email Worker、前端 Pages。

### 5. 绑定 Email Worker 到 Catch-all 路由

`bootstrap.mjs` 仅启用 Email Routing，**首次部署完成后**需在 Cloudflare Dashboard → Email → Email Routing → Email Workers 把 Catch-all 规则指向 `pmail-receiver`。

### 6. wrangler.toml 中的非敏感变量

```toml
[vars]
DOMAIN = "yourdomain.com"
FRONTEND_URL = "https://your-app.pages.dev"
ALLOWED_ORIGINS = "https://your-app.pages.dev"
GUEST_MAILBOX_TTL = "7200"
```

## ⚙️ 配置说明

### 环境变量

| 变量 | 说明 | 设置方式 |
|------|------|----------|
| `DOMAIN` | 邮件域名 | wrangler.toml `[vars]` |
| `FRONTEND_URL` | 前端部署 URL | wrangler.toml `[vars]` |
| `ALLOWED_ORIGINS` | CORS 允许源（逗号分隔） | wrangler.toml `[vars]` |
| `GUEST_MAILBOX_TTL` | 游客邮箱有效期秒数（默认 7200） | wrangler.toml `[vars]` |
| `JWT_SECRET` | JWT 签名密钥（HS256） | 由 `scripts/bootstrap.mjs` 自动生成并 `wrangler secret put`，无需手动配置 |
| `CLOUDFLARE_API_TOKEN`（可选） | admin 域名/转发管理用 | `wrangler secret put` |

### 定时任务

配置在 `workers/api/wrangler.toml`：
- `0 * * * *` — 每小时清理过期邮箱 + 检查 tier 过期
- `0 2 * * *` — 每日 D1 备份到 R2 `backups/` 前缀

### 应用限制

| 限制项 | 值 |
|--------|-----|
| 每用户最大邮箱数 | 由 tier 决定（basic 默认 10） |
| 单个附件大小 | 10MB |
| 邮件大小 | 25MB（Cloudflare 限制） |
| 游客邮箱有效期 | 2 小时 |
| 密码要求 | 8-64 字符，含大小写字母和数字 |
| 创建邮箱速率 | 10 次/分钟 |
| 查询邮件速率 | 30 次/分钟 |
| 注册速率 | 每 IP 每小时 3 次 |

## 💰 成本估算

| 规模 | 日活用户 | 预估成本 |
|------|----------|----------|
| 个人项目 | < 100 | **完全免费** |
| 中型项目 | ~1,000 | **完全免费** |
| 大型项目 | ~10,000 | 约 $5-10/月 |

## 📚 更多文档

- [部署指南](./docs/DEPLOYMENT.md) — 资源初始化（bootstrap.mjs）+ GitHub Actions 自动部署
- [API 文档与实现原理](./docs/ARCHITECTURE_AND_API.md) — 完整 API 接口、架构原理、实现细节
- [数据库结构](./schema.sql)
- [上线检查清单](./docs/PRODUCTION_CHECKLIST.md) — 含安全整改路线图
- [功能 roadmap](./docs/FEATURE_GAP_ANALYSIS.md)

## 📚 相关文档

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
- [Cloudflare Email Routing 文档](https://developers.cloudflare.com/email-routing/)
- [Hono 框架文档](https://hono.dev/)

## 📄 License

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
