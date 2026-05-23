# PMail 使用指南

本文档面向**项目使用者**，按身份分两个章节讲清楚怎么用。如果你只是想快速试用 PMail，看 §1；如果你要把 PMail 部署到自己的 Cloudflare 账号，看 §2。

---

## 0. PMail 是什么

PMail 是一个完全跑在 Cloudflare 免费服务上的临时邮箱系统，提供：

- 一次性匿名邮箱（**游客模式**，2 小时有效，无需注册）
- 注册账户后的多邮箱管理（默认 10 个永久邮箱，可调）
- 邮件实时接收、搜索、附件下载
- JWT 自动密钥轮换、字段级加密等安全特性

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

### 1.3 收件常识

- 邮件发到 `任意前缀@你的邮箱域名` 都会被路由进来，没有黑名单
- 单封邮件最大 25MB，附件单文件最大 10MB，单封最多 10 个附件
- 邮箱过期后**邮件并未立即从存储中物理删除**，但会被标记 `deleted_at`，前端不再展示；每小时 cron 清理已标记的内容

更详细的邮箱生命周期规则见 [`docs/TEMPORARY_MAILBOX_LOGIC.md`](docs/TEMPORARY_MAILBOX_LOGIC.md)。

---

## 2. 自部署者：在你自己的 Cloudflare 账号上跑

PMail 完全用 Cloudflare 免费套餐就能跑起来。部署模式：**本地 `bootstrap.mjs` 负责资源创建和配置渲染，GitHub Actions 负责实际部署**（`git push` 自动上线）。

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

### 2.2 部署流程（5 步）

```bash
git clone <this-repo> && cd PMail

# 1. 创建 Cloudflare 资源 + 渲染配置（脚本幂等，已存在的会复用）
node scripts/bootstrap.mjs

# 脚本会：
#   - 自动创建/复用 D1（pmail-db）、R2（pmail-storage）、KV（JWT_KEYS / CACHE）、Pages（pmail-web）
#   - 渲染 workers/api/wrangler.toml、workers/email/wrangler.toml
#   - 写一份 .env，把资源 ID 和 Pages 项目名填进去

# 2. 在 .env 里补齐业务变量（脚本不会替你填这些）：
#    DOMAIN=mail.your-domain.com
#    ALLOWED_ORIGINS=https://app.your-domain.com
#    API_URL=https://pmail-api.<your-subdomain>.workers.dev
# 然后重跑一次 bootstrap 让 [vars] 也填上：
node scripts/bootstrap.mjs

# 3. 设置 Worker 运行时 secrets（本机推送即可，CI 还会同步一份镜像）
cd workers/api
wrangler secret put TURNSTILE_SECRET_KEY         # Turnstile 后台获取
cd ../..

# 4. 配置 GitHub Secrets（约 18 项，清单见 docs/DEPLOYMENT.md §3.2）
#    Settings → Secrets and variables → Actions
#    包括：资源 ID（D1_DATABASE_ID 等）+ 业务变量 + secret 镜像

# 5. push 触发部署
git push origin main
```

GitHub Actions 会自动：渲染 wrangler.toml → apply D1 migrations → 部署 3 个组件 → 健康检查。约 2–3 分钟。后续改代码只需 `git push`。

详细 CI 流程、回滚、排错见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。

### 2.3 必须在 Dashboard 手动做的最后一步

在 Cloudflare Dashboard → **Email → Email Routing → Email Workers → Create route**：

- Matcher：`Catch-all`
- Action：`Send to Worker → pmail-receiver`

> 此步必须在 GitHub Actions 首次部署完成（`pmail-receiver` Worker 存在）后做，否则下拉框里选不到。

完成后给你的域名发一封邮件，几秒内应能在前端任意临时邮箱看到（如果发到的就是该地址）。

### 2.4 关键不可逆配置

- D1 migration 不可逆，需要回滚就写新 migration 反向迁移（不要改已发布的 migration）。

### 2.5 日常运维

| 想做的事 | 怎么做 |
|---|---|
| 看实时邮件接收日志 | `wrangler tail pmail-receiver` |
| 看 API 错误 | Dashboard → Workers & Pages → pmail-api → Logs |
| 临时改业务变量（如 `ALLOWED_ORIGINS`） | 改 GitHub Secret + 在 Actions 页 "Run workflow" 手动触发 deploy |
| 回滚某次部署 | Dashboard → Workers & Pages → 选 Worker / Pages 项目 → Deployments → Rollback |
| 调整每用户邮箱配额 | 改 D1 `tier_configs` 表的 `permanent_mailbox_quota` |
| 备份找回 | R2 桶 `backups/` 前缀下有每日 D1 自动备份 |

---

## 3. 常见问题

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

---

## 4. 文档导航

| 文档 | 内容 |
|---|---|
| [`README.md`](README.md) | 项目简介、功能特性、技术栈 |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | 部署完整指南：本地一键 + GitHub Actions、Secrets 清单、排错 |
| [`docs/TEMPORARY_MAILBOX_LOGIC.md`](docs/TEMPORARY_MAILBOX_LOGIC.md) | 邮箱生命周期、游客模式实现细节 |
| [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md) | 上线前的安全/性能检查清单 + 安全整改路线图 |
| [`docs/ARCHITECTURE_AND_API.md`](docs/ARCHITECTURE_AND_API.md) | 完整 API 端点列表、架构原理 |
| [`docs/FEATURE_GAP_ANALYSIS.md`](docs/FEATURE_GAP_ANALYSIS.md) | 功能 roadmap |
| [`CLAUDE.md`](CLAUDE.md) | 给 AI 协作者的项目约束（自部署者可忽略） |
