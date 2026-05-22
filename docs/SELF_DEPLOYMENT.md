# PMail 自部署指南

本文档面向**想把 PMail 部署到自己 Cloudflare 账号**的开发者，主线是**本地手动一键部署**。如果你想用 GitHub Actions 自动部署，看 [`CI_DEPLOYMENT.md`](CI_DEPLOYMENT.md)。

读完本文档你应该能：
- 从零在自己的 Cloudflare 账号上把 PMail 跑起来
- 知道每一步在做什么、出错时去哪里看
- 部署后如何更新、回滚、备份

---

## 0. 部署前提

| 项 | 要求 | 验证命令 |
|---|---|---|
| Cloudflare 账号 | 免费即可 | — |
| 一个域名 | **已添加到 Cloudflare 托管 DNS**（Email Routing 必须） | Dashboard → 看是否有 Active 状态的 zone |
| Node.js | ≥ 18 | `node -v` |
| npm | 任意现代版本 | `npm -v` |
| wrangler | ≥ 4 | `npx wrangler --version` |
| curl | 任意 | `curl --version` |
| openssl | 任意 | `openssl version` |

可选项（开了对应功能才需要）：
- **Cloudflare Turnstile 站点** —— 注册/登录人机验证，免费在 Dashboard 申请
- **Linux.do OAuth 应用** —— 想开 OAuth 登录时申请

> wrangler 不需要全局安装，仓库的 `workers/api/node_modules/.bin/wrangler` 就够用。`scripts/bootstrap.mjs` 会自动找。

---

## 1. 总览：5 步走

```
1. wrangler login                                # 一次性授权
2. node scripts/bootstrap.mjs                    # 自动创建 D1/R2/KV/Pages 资源
3. 编辑 .env 补业务变量 → 再跑一次 bootstrap.mjs  # 让 [vars] 也填上
4. wrangler secret put ...                       # 推 4 个 secret
5. bash deploy.sh                                # apply migration + 部署 3 个组件
```

最后还要在 Dashboard 手动绑定一次 Email Routing 路由（§7），那之后就跑通了。

---

## 2. 登录 Cloudflare

```bash
wrangler login
```

浏览器会弹出授权页面，授权后凭证写到 `~/.config/.wrangler/config/default.toml`。

若是 CI 或无浏览器环境，导出 token 代替：
```bash
export CLOUDFLARE_API_TOKEN=<your-token>
```

Token 在 Dashboard → My Profile → API Tokens → Create Custom Token 创建，授予以下最小权限即可：

| Scope | Permission |
|---|---|
| Account → Workers Scripts | Edit |
| Account → D1 | Edit |
| Account → Workers R2 Storage | Edit |
| Account → Workers KV Storage | Edit |
| Account → Cloudflare Pages | Edit |
| Account → Email Routing Addresses | Read |

---

## 3. 创建 Cloudflare 资源（bootstrap 一键）

```bash
cd /path/to/PMail

# 试运行：只打印计划，不创建任何东西
node scripts/bootstrap.mjs --dry-run

# 正式执行
node scripts/bootstrap.mjs
```

脚本会做这些事（**幂等**，已存在的资源会复用而不是重建）：

| 资源 | 名字 | 用途 |
|---|---|---|
| D1 数据库 | `pmail-db` | 用户、邮箱、邮件、附件元数据 |
| R2 桶 | `pmail-storage` | 附件（`attachments/` 前缀）+ DB 备份（`backups/` 前缀） |
| KV 命名空间 | `JWT_KEYS` | 版本化 JWT 签名密钥 |
| KV 命名空间 | `CACHE` | 共享缓存：`reset:*` / `oauth:*` / `email_valid:*` / `settings:*` |
| Pages 项目 | `pmail-web` | 前端静态站点 |

完成后还会自动渲染：
- `workers/api/wrangler.toml`
- `workers/email/wrangler.toml`
- `.env`（如果不存在则创建）

### 多账号或资源重名

```bash
# 账号下有多个 account：显式指定
node scripts/bootstrap.mjs --account-id=<your-account-id>

# 资源名被全局占用（特别是 Pages 项目名全局唯一）：加后缀
node scripts/bootstrap.mjs --name-suffix=mycorp
# → 资源名变成 pmail-db-mycorp、pmail-storage-mycorp、pmail-web-mycorp
```

### 没有 bootstrap 想手动创建？

按以下命令逐条执行，把返回的 ID 自己填进 wrangler.toml 即可：

```bash
wrangler d1 create pmail-db                       # → D1_DATABASE_ID
wrangler r2 bucket create pmail-storage           # → R2_BUCKET
wrangler kv namespace create JWT_KEYS             # → KV_JWT_KEYS_ID
wrangler kv namespace create CACHE                # → KV_CACHE_ID
wrangler pages project create pmail-web --production-branch=main
```

---

## 4. 配置业务变量

bootstrap 只填了**资源 ID**，业务变量（域名、CORS 白名单等）需要你自己补到 `.env`。

打开 `.env` 编辑：

```bash
# bootstrap 已填好的，不要动
CLOUDFLARE_ACCOUNT_ID=...
D1_DATABASE_ID=...
PAGES_PROJECT_NAME=pmail-web

# 自己填这些
DOMAIN=mail.your-domain.com                       # 收信用的主域名
ALLOWED_ORIGINS=https://app.your-domain.com       # CORS 白名单，多个用逗号
OAUTH_LINUXDO_CLIENT_ID=                          # 不用 OAuth 留空
API_URL=https://pmail-api.<your-subdomain>.workers.dev/health  # 部署后健康检查用
```

> **注意**：`.env.example` 默认没有 `ALLOWED_ORIGINS` 和 `OAUTH_LINUXDO_CLIENT_ID` 这两行，需要你**手动加上**，否则 bootstrap 不会渲染到 wrangler.toml 的 `[vars]` 段。

然后**重跑一次 bootstrap**让 wrangler.toml 的 `[vars]` 也填上：

```bash
node scripts/bootstrap.mjs
```

这次脚本会看到资源已存在（reuse），但会用 `.env` 里的新值重新渲染 wrangler.toml。

### 业务变量参考

`workers/api/wrangler.toml.example` 的 `[vars]` 段还有一堆默认值能调，列几个常用的：

| 变量 | 默认 | 含义 |
|---|---|---|
| `KEY_ROTATION_DAYS` | `30` | JWT 密钥轮换周期（天） |
| `KEY_GRACE_PERIOD_DAYS` | `7` | 旧密钥宽限期 |
| `DEFAULT_MAILBOX_TTL` | `3600` | 默认邮箱 TTL（秒） |
| `MAX_MAILBOX_TTL` | `86400` | 邮箱 TTL 上限（秒） |
| `GUEST_MAILBOX_TTL` | `7200` | 游客邮箱 TTL（秒） |
| `MAX_EMAIL_SIZE` | `26214400` | 单封邮件大小上限（字节，25MB） |
| `MAX_ATTACHMENT_SIZE` | `10485760` | 单附件大小上限（字节，10MB） |
| `RATE_LIMIT_DEFAULT` | `100` | 每分钟请求上限/用户 |
| `BACKUP_RETENTION_DAYS` | `30` | R2 备份保留天数 |

要改的话直接编辑 `workers/api/wrangler.toml`（已渲染好的），下次部署生效。注意改 `wrangler.toml.example` 不会立即生效，要重跑 bootstrap 或手动 envsubst。

---

## 5. 设置 Worker Secrets

业务变量明文存在 `wrangler.toml` 里就行，但**敏感凭据**必须通过 `wrangler secret put` 推送，不要写文件。

### 5.1 必须设置（4 个）

```bash
# 进入 API Worker 目录
cd workers/api

# 1. 字段级加密密钥（用于邮件正文 AES-256 加密）
# 一旦设定永不可换！用 openssl 生成后离线妥善备份。
openssl rand -hex 32 > /tmp/db-key.txt
cat /tmp/db-key.txt | wrangler secret put DATABASE_ENCRYPTION_KEY
# 用完销毁文件
rm /tmp/db-key.txt

# 2. Turnstile 后端验证密钥
wrangler secret put TURNSTILE_SECRET_KEY
# 粘贴 Turnstile 控制台的 Secret Key 后回车

# 3. Linux.do OAuth client secret（不用 OAuth 跳过这步）
wrangler secret put OAUTH_LINUXDO_CLIENT_SECRET

# 进入 Email Worker 目录
cd ../email

# 4. Email Worker 也需要同一份加密密钥（必须与 API 的完全一致）
wrangler secret put DATABASE_ENCRYPTION_KEY
# 粘贴上面生成的同一个 hex 字符串

cd ../..
```

### 5.2 可选 secret

```bash
# 出站发信（用 SendGrid 发密码重置邮件等，不需要可跳过）
cd workers/api
wrangler secret put SENDGRID_API_KEY
```

### 5.3 验证 secret 配置

```bash
cd workers/api
wrangler secret list
# 应该看到 DATABASE_ENCRYPTION_KEY / TURNSTILE_SECRET_KEY / OAUTH_LINUXDO_CLIENT_SECRET

cd ../email
wrangler secret list
# 应该看到 DATABASE_ENCRYPTION_KEY
```

> **`DATABASE_ENCRYPTION_KEY` 必须两边一致**，否则 Email Worker 写入的加密数据，API Worker 读不出来。

---

## 6. 一键部署

```bash
bash deploy.sh
```

`deploy.sh` 会顺序执行：

1. 校验 `wrangler.toml` 已渲染（缺则报错让你重跑 bootstrap）
2. 三个目录 `npm ci` 安装依赖
3. `wrangler d1 migrations apply pmail-db --remote` 应用数据库 schema
4. `wrangler deploy` 部署 API Worker（`pmail-api`）
5. `wrangler deploy` 部署 Email Worker（`pmail-receiver`）
6. `npm run build` 构建前端 + `wrangler pages deploy dist` 部署前端
7. 如果 `.env` 设了 `API_URL`，curl `/health` 做健康检查

成功后控制台输出每个 Worker 的访问 URL，记下 API Worker 的 URL（形如 `https://pmail-api.<your-subdomain>.workers.dev`），下一步要用。

> JWT 签名密钥**不需要手动初始化**——`workers/api/src/services/jwtKeyManager.ts` 在首次访问发现 KV 里没有 active key 时会自动生成。

---

## 7. 配置 Email Routing（必须，最后一步）

到 Cloudflare Dashboard：**域名 → Email → Email Routing → Email Workers → Create route**

| 字段 | 值 |
|---|---|
| Matcher | `Catch-all` |
| Action | `Send to Worker` |
| Worker | `pmail-receiver`（下拉选） |

> 必须先执行了 §6 让 `pmail-receiver` 部署成功，下拉框里才能选到。

设置完成后，往 `任意前缀@your-domain.com` 发一封邮件，几秒内应能在前端任意临时邮箱看到（如果你创建的就是该地址）。也可以用 `wrangler tail pmail-receiver` 实时看入站日志。

---

## 8. 配置前端

前端域名建议绑自定义域，避免直接用 `*.pages.dev`：

1. Dashboard → Workers & Pages → `pmail-web` → Custom Domains → Set up a custom domain → 输入 `app.your-domain.com`
2. 自动创建 CNAME（如果域名在同账号 Cloudflare 托管），等几分钟生效
3. 修改 `.env` 中 `ALLOWED_ORIGINS=https://app.your-domain.com`，重跑 `bootstrap.mjs` 和 `deploy.sh`，让后端接受这个来源的请求

API Worker 同理可以绑 `api.your-domain.com`，绑完后更新 `web/.env` 的 `VITE_API_BASE_URL` 并重新部署前端。

---

## 9. 验证部署

按顺序检查：

```bash
# 1. API 健康
curl -i https://pmail-api.<your-subdomain>.workers.dev/health
# 期望 200 + JSON

# 2. D1 表已建好
cd workers/api
wrangler d1 execute pmail-db --remote --command="SELECT name FROM sqlite_master WHERE type='table'"
# 期望看到 users / temp_emails / emails / attachments / api_keys / ... 等表

# 3. 前端可访问
curl -I https://app.your-domain.com
# 期望 200 / 304

# 4. 入站邮件可达
wrangler tail pmail-receiver &
# 另开终端用 mail 命令或 webmail 发一封到 test@your-domain.com
# 看 tail 输出有 "Received email ..." 即通
```

注册一个账号、创建一个邮箱、发邮件到这个地址、能在前端看到——全链路通了。

---

## 10. 日常维护

### 10.1 更新代码后重新部署

```bash
git pull
bash deploy.sh
```

`deploy.sh` 是幂等的，每次部署都是全量替换，无副作用。

### 10.2 修改业务变量

```bash
# 改 .env 或 wrangler.toml
node scripts/bootstrap.mjs    # 重新渲染（如果改的是 .env 中的 envsubst 变量）
bash deploy.sh                # 重新部署生效
```

### 10.3 添加 D1 schema 变更

不要改 `workers/api/migrations/0001_init.sql`（基线不可变），而是新增 `0002_xxx.sql`：

```bash
# 1. 在 workers/api/migrations/ 下新建增量文件
# 2. 同步更新 schema.sql 保持人类可读版本一致
# 3. 重新部署，CI 会自动跑 migrations apply
bash deploy.sh
```

D1 migration **不可逆**，要回滚就写新的反向 migration。详见 [`CI_DEPLOYMENT.md` §8](CI_DEPLOYMENT.md)。

### 10.4 回滚部署

Dashboard → Workers & Pages → 选 Worker / Pages 项目 → Deployments → 选历史版本 → Rollback。**D1 migration 不会一起回滚**（数据库改动不可逆）。

### 10.5 查看日志

```bash
# API Worker 实时日志（最常用）
wrangler tail pmail-api

# Email Worker（看收信情况）
wrangler tail pmail-receiver

# 历史日志、错误率
# Dashboard → Workers & Pages → 选 Worker → Logs
```

### 10.6 查看 D1 数据

```bash
cd workers/api

# 看表结构
wrangler d1 execute pmail-db --remote --command=".schema users"

# 查数据
wrangler d1 execute pmail-db --remote --command="SELECT COUNT(*) FROM users"
wrangler d1 execute pmail-db --remote --command="SELECT id, address, expires_at FROM temp_emails WHERE deleted_at IS NULL LIMIT 10"
```

---

## 11. 备份与恢复

### 11.1 自动备份

`workers/api/wrangler.toml` 中已配置每日 02:00 UTC 的 cron 自动备份：

- 备份位置：R2 桶 `pmail-storage` 的 `backups/` 前缀
- 文件名格式：`backups/pmail-db-YYYY-MM-DD-HHMMSS.sqlite`
- 保留天数：`BACKUP_RETENTION_DAYS`（默认 30 天）
- 实现：`workers/api/src/services/databaseBackup.ts`

### 11.2 手动下载备份

```bash
# 列出最近备份
wrangler r2 object list pmail-storage --prefix=backups/ | head

# 下载
wrangler r2 object get pmail-storage/backups/pmail-db-2026-05-21-020000.sqlite \
  --file=./backup.sqlite

# 本地用 sqlite3 打开看
sqlite3 backup.sqlite ".tables"
```

### 11.3 从备份恢复

D1 没有直接的"从 sqlite 文件恢复"命令，需要：

1. 用 sqlite3 把备份 dump 成 SQL：`sqlite3 backup.sqlite .dump > restore.sql`
2. 创建新 D1 数据库（不要在原库上恢复，避免污染）：`wrangler d1 create pmail-db-restore`
3. 把 SQL 灌入新库：`wrangler d1 execute pmail-db-restore --remote --file=restore.sql`
4. 验证数据无误后，更新 `wrangler.toml` 的 `database_id` 指向新库，重新部署
5. 旧库 Dashboard 删除

---

## 12. 升级到 CI 自动部署

本地部署链路跑顺后，想转 GitHub Actions 自动部署的话：

1. 仓库已带 `.github/workflows/deploy.yml`，开箱即用
2. 把 `.env` 里的变量 + bootstrap 输出的资源 ID + 你设置的 secret，逐项录入 GitHub 仓库 Settings → Secrets and variables → Actions（清单约 18 项）
3. `git push origin main` 触发自动部署

完整 Secret 清单、CI 流程图、排错见 [`CI_DEPLOYMENT.md`](CI_DEPLOYMENT.md)。

升级后**本地 `deploy.sh` 仍可用**，二者命令完全等价；适合需要快速验证修改时绕过 CI。

---

## 13. 常见问题

**Q：bootstrap.mjs 报 "wrangler whoami failed"**
A：没登录 Cloudflare。跑 `wrangler login`，或 `export CLOUDFLARE_API_TOKEN=...`。

**Q：bootstrap.mjs 报 "Multiple Cloudflare accounts detected"**
A：你的 wrangler 凭证关联多个 account。加 `--account-id=<id>` 显式指定。Account ID 在 Dashboard 右侧栏可见。

**Q：bootstrap 报 Pages 项目名被占用**
A：Pages 项目名在 Cloudflare 全局唯一。加 `--name-suffix=mycorp` 让名字变成 `pmail-web-mycorp`。

**Q：deploy.sh 报 "缺少 workers/api/wrangler.toml"**
A：没跑过 bootstrap.mjs，或跑过但 `.env` 里的 envsubst 变量未填全导致渲染失败。检查 `.env`，把 `DOMAIN` / `ALLOWED_ORIGINS` 补上后重跑 bootstrap。

**Q：发邮件到自己域名收不到**
A：依次排查：
1. Dashboard → Email → Email Routing 状态是否为 Active
2. 是否绑定了 catch-all → `pmail-receiver` 路由（§7）
3. `wrangler tail pmail-receiver` 看入站日志，没日志说明邮件根本没路由进来；有日志看是否有报错
4. 域名 MX 记录是否正确（Cloudflare 应自动配置，可在 DNS 页面确认）

**Q：前端登录后调 API 报 401**
A：JWT secret 不一致。本地部署不需要手动初始化 JWT 密钥（首次访问会自动生成），但如果你换了 `KEY_ROTATION_DAYS` 或手动操作过 `JWT_KEYS` KV，可能导致密钥混乱。最简单的修法：Dashboard 清空 `JWT_KEYS` KV namespace，重启一次 API Worker 让它重新生成。

**Q：DATABASE_ENCRYPTION_KEY 设错了/丢了**
A：**没救**。已加密的邮件数据无法恢复。建议方案：
- 如果是测试阶段：删除 D1 数据库重建（`wrangler d1 delete pmail-db` 后重跑 bootstrap）
- 如果生产已运行：只能放弃历史数据，新部署一套实例

**Q：想测试 Email Worker 不想真的发邮件**
A：`workers/email/wrangler.toml` 暂时把 `name` 改成测试名，本地 `wrangler dev` 启动后用 `curl` 模拟入站。或者注册一个测试域名只挂 Cloudflare、不发对外邮件。

**Q：CPU 时间超 50ms 报错怎么办**
A：免费套餐 CPU 时间上限 50ms。常见原因：附件加密慢、邮件解析复杂。可以：
- 升级 Workers 付费套餐（$5/月，CPU 时间 30 秒）
- 把附件处理拆到 Queue 异步执行（需要代码改造）

---

## 14. 卸载

完整删除部署：

```bash
cd workers/api && wrangler delete --name pmail-api
cd ../email && wrangler delete --name pmail-receiver
cd ../.. && wrangler pages project delete pmail-web

# 数据资源（注意：会丢数据）
wrangler d1 delete pmail-db
wrangler r2 bucket delete pmail-storage         # 桶非空时需先清空
wrangler kv namespace delete --binding=JWT_KEYS
wrangler kv namespace delete --binding=CACHE

# Dashboard 手动删除 Email Routing 的 catch-all 路由
```

---

## 15. 进一步阅读

| 文档 | 内容 |
|---|---|
| [`CI_DEPLOYMENT.md`](CI_DEPLOYMENT.md) | GitHub Actions 自动部署完整指南 |
| [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) | 上线前的安全/性能/合规检查清单 |
| [`SECURITY_IMPROVEMENT_PLAN.md`](SECURITY_IMPROVEMENT_PLAN.md) | 安全增强路线图 |
| [`TEMPORARY_MAILBOX_LOGIC.md`](TEMPORARY_MAILBOX_LOGIC.md) | 邮箱生命周期/游客模式实现细节 |
| [`other.md`](other.md) | 完整 API 端点列表与架构原理 |
| [`../User.md`](../User.md) | 终端用户使用指南 |
| [`../CLAUDE.md`](../CLAUDE.md) | 给 AI 协作者的项目约束 |
