# PMail 使用指南

本文档面向**项目使用者**，按身份分三个章节讲清楚怎么用。如果你只是想快速试用 PMail，看 §1；如果你要把 PMail 部署到自己的 Cloudflare 账号，看 §2；如果你要用 API 集成 PMail 到自己的程序，看 §3。

---

## 0. PMail 是什么

PMail 是一个完全跑在 Cloudflare 免费服务上的临时邮箱系统，提供：

- 一次性匿名邮箱（**游客模式**，2 小时有效，无需注册）
- 注册账户后的多邮箱管理（默认 10 个永久邮箱，可调）
- 邮件实时接收、搜索、附件下载
- 北向 REST API（用 API Key 认证，便于脚本/自动化对接）
- OAuth 登录（Linux.do）、JWT 自动密钥轮换、字段级加密等安全特性

技术上由三个独立部署单元组成：API Worker（`pmail-api`）+ Email Worker（`pmail-receiver`）+ Pages 前端（`pmail-web`），共享 D1/R2/KV 资源。

---

## 1. 终端用户：直接使用部署好的 PMail

如果你只是想用别人部署好的 PMail 实例（或自己刚部署完想试试），按下面流程走。

### 1.1 游客模式（最快，无需注册）

1. 打开前端首页（部署者会告诉你访问地址，例如 `https://app.your-domain.com`）
2. 首页直接出现一个临时邮箱地址，复制使用
3. 这个邮箱**自动有效 2 小时**，到期所有邮件一并清理，**不可续期**
4. 关闭浏览器不会丢——只要 URL 还在，2 小时内回来还能看到收件箱

适用场景：注册测试账号、临时验证码接收、不想留邮箱踪迹的注册。

### 1.2 注册账户（保留邮箱、多邮箱管理）

1. 首页点击"注册"，填邮箱（用于密码找回，不会用来收信）+ 密码（8–64 位，含大小写字母 + 数字）
2. 完成 Turnstile 人机验证
3. 登录后可以：
   - 在 "我的邮箱" 创建多个临时邮箱（默认上限 10 个，自定义有效期 10 分钟–24 小时，或选择"永不过期"）
   - 在邮箱详情查看收件、搜索、下载附件
   - 在"个人中心 → API Keys" 生成 API Key 给程序用（见 §3）

> **OAuth 登录**：如果部署者启用了 Linux.do OAuth，注册页会有"使用 Linux.do 登录"按钮。OAuth 账户与密码账户互不相通，不能用 OAuth 邮箱的密码登录。

### 1.3 收件常识

- 邮件发到 `任意前缀@你的邮箱域名` 都会被路由进来，没有黑名单
- 单封邮件最大 25MB，附件单文件最大 10MB，单封最多 10 个附件
- 邮件正文若部署者设置了 `DATABASE_ENCRYPTION_KEY`，则存储时已 AES-256 加密
- 邮箱过期后**邮件并未立即从存储中物理删除**，但会被标记 `deleted_at`，前端不再展示；每小时 cron 清理已标记的内容

更详细的邮箱生命周期规则见 [`docs/TEMPORARY_MAILBOX_LOGIC.md`](docs/TEMPORARY_MAILBOX_LOGIC.md)。

---

## 2. 自部署者：在你自己的 Cloudflare 账号上跑

PMail 完全用 Cloudflare 免费套餐就能跑起来。两条部署路径：**本地手动**（首次推荐，便于看清每一步）和 **GitHub Actions 自动**（迭代推荐，`git push` 自动上线）。

### 2.1 前置准备（一次性）

| 项 | 说明 |
|---|---|
| Cloudflare 账号 | 注册免费 |
| 一个域名 | 加到 Cloudflare 托管 DNS，Email Routing 需要 |
| Node.js ≥ 18 | `node -v` 检查 |
| wrangler ≥ 4 | `npm i -g wrangler@latest` |
| 已登录 wrangler | `wrangler login`（或导出 `CLOUDFLARE_API_TOKEN`） |

可选但推荐：
- 一个 Cloudflare Turnstile 站点（注册/登录时人机验证，免费）
- 一个 Linux.do OAuth 应用（如果想开 OAuth 登录）

### 2.2 路径 A：本地一键部署（推荐首次）

```bash
git clone <this-repo> && cd PMail

# 1. 创建资源（D1 / R2 / KV / Pages 项目），脚本幂等，已存在的会复用
node scripts/bootstrap.mjs

# 脚本会：
#   - 自动创建/复用 D1（pmail-db）、R2（pmail-storage）、KV（JWT_KEYS / CACHE）、Pages（pmail-web）
#   - 自动渲染 workers/api/wrangler.toml、workers/email/wrangler.toml
#   - 自动写一份 .env，把资源 ID 和 Pages 项目名填进去

# 2. 在 .env 里补齐业务变量（脚本不会替你填这些）：
#    DOMAIN=mail.your-domain.com
#    ALLOWED_ORIGINS=https://app.your-domain.com
#    OAUTH_LINUXDO_CLIENT_ID=...   # 不用 OAuth 可留空
#    API_URL=https://pmail-api.<your-subdomain>.workers.dev
# 然后重跑一次 bootstrap 让 [vars] 也填上：
node scripts/bootstrap.mjs

# 3. 设置 Worker 运行时 secrets（一次性，本机推送即可）
cd workers/api
wrangler secret put DATABASE_ENCRYPTION_KEY      # openssl rand -hex 32 生成
wrangler secret put TURNSTILE_SECRET_KEY         # Turnstile 后台获取
wrangler secret put OAUTH_LINUXDO_CLIENT_SECRET  # 不用 OAuth 可跳过
cd ../email
wrangler secret put DATABASE_ENCRYPTION_KEY      # 必须与 API 一致
cd ../..

# 4. 部署
bash deploy.sh

# deploy.sh 会自动：
#   - 应用 D1 migrations
#   - 部署 API Worker、Email Worker
#   - 构建并部署前端到 Pages
#   - 如果 .env 里设了 API_URL，最后做 /health 健康检查
```

### 2.3 必须在 Dashboard 手动做的最后一步

在 Cloudflare Dashboard → **Email → Email Routing → Email Workers → Create route**：

- Matcher：`Catch-all`
- Action：`Send to Worker → pmail-receiver`

> 此步必须在 `pmail-receiver` Worker 首次部署成功后做，否则下拉框里选不到。

完成后给你的域名发一封邮件，几秒内应能在前端任意临时邮箱看到（如果发到的就是该地址）。

### 2.4 路径 B：GitHub Actions 自动部署（迭代推荐）

仓库已带 `.github/workflows/deploy.yml`，push 到 `main` 自动跑：

1. 按 §2.2 步骤 1 在本地跑一次 `node scripts/bootstrap.mjs`，记录控制台输出的资源 ID
2. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 录入约 18 个 Secret（清单见 [`docs/CI_DEPLOYMENT.md` §3](docs/CI_DEPLOYMENT.md)）
3. `git push origin main`，Actions 自动渲染 wrangler.toml、apply D1 migrations、推送 secrets、部署三个组件、健康检查
4. 后续改代码只需 `git push`，全程自动

详细 CI 流程、回滚、排错见 [`docs/CI_DEPLOYMENT.md`](docs/CI_DEPLOYMENT.md)。

### 2.5 关键不可逆配置

- **`DATABASE_ENCRYPTION_KEY` 一旦设定不可更换**——换了历史加密邮件全部解不出来。用 `openssl rand -hex 32` 生成后，把这个 32 字节 hex 字符串**离线妥善备份**（例如团队密码管理器）。
- D1 migration 不可逆，需要回滚就写新 migration 反向迁移（不要改已发布的 migration）。

### 2.6 日常运维

| 想做的事 | 怎么做 |
|---|---|
| 看实时邮件接收日志 | `wrangler tail pmail-receiver` |
| 看 API 错误 | Dashboard → Workers & Pages → pmail-api → Logs |
| 临时改业务变量（如 `ALLOWED_ORIGINS`） | 改 `.env` + 重跑 `bootstrap.mjs` + `deploy.sh`，或改 GitHub Secret + 手动触发 deploy workflow |
| 回滚某次部署 | Dashboard → Workers & Pages → 选 Worker / Pages 项目 → Deployments → Rollback |
| 调整每用户邮箱配额 | 改 D1 `tier_configs` 表的 `permanent_mailbox_quota` |
| 备份找回 | R2 桶 `backups/` 前缀下有每日 D1 自动备份 |

---

## 3. API 集成方：用 API Key 对接 PMail

PMail 暴露两套路径：
- `/api/*` — Web 前端使用，JWT 认证（用户名密码登录后拿 token）
- `/v1/*` — **北向 API**，用 `X-API-Key` header 认证，**推荐脚本/集成使用**

### 3.1 生成 API Key

1. Web 登录后进入 "个人中心 → API Keys"
2. 点击"生成新 Key"，输入 name（用于识别用途，如 "ci-bot"）、权限（`read` 或 `read,write`）、过期时间（可选）
3. **Key 明文只显示一次**，复制并妥善保存；服务端只存 SHA-256 哈希，丢了只能重新生成

同一用户可以创建多个 Key，互不影响。在 Web 上可以随时禁用（`is_active=false`）或删除。

### 3.2 常用调用示例

替换 `API_BASE`（如 `https://pmail-api.your-subdomain.workers.dev`）和 `<key>` 为你的实际值。

**创建一个临时邮箱**
```bash
curl -X POST "$API_BASE/v1/mailbox/create" \
  -H "X-API-Key: <key>" \
  -H "Content-Type: application/json" \
  -d '{"prefix":"test","ttl":3600}'
```

**列出我的邮箱**
```bash
curl "$API_BASE/v1/mailbox/list" -H "X-API-Key: <key>"
```

**查指定邮箱的收件**
```bash
curl "$API_BASE/v1/mailbox/test@your-domain.com/emails?page=1&pageSize=20" \
  -H "X-API-Key: <key>"
```

**下载附件**
```bash
curl "$API_BASE/v1/attachment/<attachment-id>/download" \
  -H "X-API-Key: <key>" \
  -o attachment.bin
```

完整端点清单见 `workers/api/openapi.yaml`，也可参考 [`docs/other.md`](docs/other.md) 的接口章节。

### 3.3 速率限制

- 分钟级：默认每用户 100 req/min（`RATE_LIMIT_DEFAULT` 可调），超限返回 429
- 日级：D1 持久化，按用户分桶
- 触发限频后等到下一分钟/下一天即恢复，无需联系管理员

### 3.4 错误码

| HTTP | 含义 | 处理建议 |
|---|---|---|
| 401 | API Key 无效/已禁用/已过期 | 重新生成 Key |
| 403 | Key 没有 `write` 权限做了写操作 | 用更高权限的 Key |
| 404 | 邮箱/邮件不存在或不属于你 | 检查地址拼写、是否被删 |
| 429 | 触发速率限制 | 退避重试 |
| 500 | 服务端错误 | 查 `wrangler tail` 或 Dashboard 日志定位 |

---

## 4. 常见问题

**Q：游客邮箱 2 小时能延长吗？**
A：不能。游客模式按设计就是阅后即焚。需要长期邮箱请注册。

**Q：邮箱可以自定义前缀吗？**
A：可以。创建邮箱时传 `prefix` 字段（API）或在前端创建时勾选"自定义前缀"。前缀冲突会返回 409。

**Q：邮件来了没看到？**
A：依次检查：
1. Dashboard → Email Routing 的 catch-all 路由是否指向 `pmail-receiver`
2. `wrangler tail pmail-receiver` 看入站日志
3. 检查域名 MX 记录是否正确解析到 Cloudflare

**Q：能不能换加密密钥？**
A：**不能**。换了之后所有已加密邮件都无法解密。生产环境只能新部署一套实例。

**Q：API Key 弄丢了怎么办？**
A：只能新建一个。Key 明文只在创建时返回一次，服务端只存哈希。

---

## 5. 文档导航

| 文档 | 内容 |
|---|---|
| [`README.md`](README.md) | 项目简介、功能特性、技术栈 |
| [`docs/CI_DEPLOYMENT.md`](docs/CI_DEPLOYMENT.md) | GitHub Actions 自动部署完整指南、Secrets 清单、排错 |
| [`docs/TEMPORARY_MAILBOX_LOGIC.md`](docs/TEMPORARY_MAILBOX_LOGIC.md) | 邮箱生命周期、游客模式实现细节 |
| [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md) | 上线前的安全/性能检查清单 |
| [`docs/SECURITY_IMPROVEMENT_PLAN.md`](docs/SECURITY_IMPROVEMENT_PLAN.md) | 安全增强路线图 |
| [`docs/other.md`](docs/other.md) | 完整 API 端点列表、架构原理 |
| `workers/api/openapi.yaml` | API OpenAPI 规范（可导入 Postman / Swagger UI） |
| [`CLAUDE.md`](CLAUDE.md) | 给 AI 协作者的项目约束（自部署者可忽略） |
