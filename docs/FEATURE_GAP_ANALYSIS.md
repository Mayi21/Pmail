# PMail 功能 Gap 分析与 Roadmap 建议

> 归档日期：2026-05-20
> 与本文档相关：[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)（含安全整改路线图）

## 背景

项目当前已具备完整的注册/登录、OAuth、多域名、多 mailbox、tier + 兑换码、admin 面板、审计日志（表存在）、备份、Webhook、Turnstile、JWT 轮换等能力，前端国际化齐全（zh/en）、PWA、a11y 基础已铺。

与同类公开服务（temp-mail.org、mail.tm、SimpleLogin、AnonAddy、addy.io）对照，仍存在若干"行业默认有但本项目没有"的能力空缺。本文档聚焦在 `PRODUCTION_CHECKLIST.md` **没覆盖但用户实际会期待**的功能差距。

---

## 1. 现状边界

**已实现且强项**：catch-all 收件、AES-GCM 加密邮件体、tier+兑换码、JWT 自动轮换、HMAC 签名 webhook、备份+恢复、Linux.do OAuth、guest mode、永久邮箱（NULL expires_at）。

**已在其他文档中规划（不在本文重复）**：MFA、refresh token、CSP nonce、CSRF、session 管理、refresh-token 化的 reset token、WAF、Sentry、ToS/Privacy、queue 实接、R2 lifecycle、staging env、压测、OWASP scan、admin IP 白名单。

---

## 2. Gap 分析（5 个维度）

### A. 战略定位升级（向 alias / 转发服务进化）

| Gap | 现状 | 同类参照 |
|-----|------|----------|
| **出站邮件（reply/forward from alias）** | 完全没有；只有 `services/emailService.ts` 内部发密码重置 | SimpleLogin、AnonAddy、addy.io 全部支持 |
| **转发到真实邮箱** | 没有；user 必须登录本系统才能看 | SimpleLogin 的核心卖点 |
| **PGP 加密转发** | 没有 | SimpleLogin / Proton 标配 |
| **命名别名（user-defined）** | 已有自定义 address，但没有"shopping/newsletter/bank"语义别名分组管理 UI | AnonAddy 有 |

> 这一组若做，相当于把产品从"临时收件箱"提升为"个人邮件别名层"，战略含义最大但工作量也最大。

### B. 实时性与通知（用户感知最强）

| Gap | 现状 |
|-----|------|
| **实时邮件推送（SSE / WebSocket）** | 没有；前端必须轮询。临时邮箱用户对"新邮件到了没"极度敏感，无实时推送直接劣化体验 |
| **浏览器桌面通知（Web Push API）** | 没有 |
| **Telegram / Discord 机器人通知** | 没有；中文社区用户期待度最高 |
| **移动端 push（PWA push notifications）** | manifest 已就位，但未接 push subscription |
| **邮件到达声音 / 闪烁标题** | 没有 |

> 这一组工作量小但用户体感强，性价比最高。

### C. 抗滥用与内容安全（公开服务必备）

| Gap | 现状 |
|-----|------|
| **垃圾邮件过滤** | 完全没有；catch-all 必收一切。`POST /attachment/:id/scan` 是占位符 |
| **发件人黑名单 / 用户级 block** | 没有 |
| **域名级黑名单（防恶意发件域）** | 没有 |
| **用户举报 abuse 工作流** | 没有；admin 也无 UI 处理 |
| **附件病毒扫描** | endpoint 存在但未实现，可接 ClamAV / Cloudflare AV |
| **创建邮箱速率限制** | 已有（10/min）；但缺账号级反 abuse（如新账号 N 小时内只能创建 X 个永久邮箱） |
| **钓鱼链接告警** | 没有；HTML 邮件直渲染，仅依赖 DOMPurify+iframe 沙箱 |

> 一旦项目公网开放，这一组缺失会迅速变成运营噩梦。

### D. 安全合规（PRODUCTION_CHECKLIST 之外的空白）

| Gap | 现状 |
|-----|------|
| **注册邮箱验证（signup email verification）** | 没有；任何邮箱都能直接注册 |
| **账号自助删除 UI** | 没有；admin 可删但用户不能（GDPR 风险） |
| **个人数据导出（GDPR data download）** | 没有 |
| **审计日志 UI** | `audit_logs` 表已有，无任何前端查询界面 |
| **数据保留策略 + 自动过期清理通知** | 部分实现（定时清理已过期 mailbox）；但缺"邮件到期前 X 天提醒用户" |

### E. 开发者生态与商业化

| Gap | 现状 |
|-----|------|
| **IMAP / POP3 bridge** | 没有；无法在 Thunderbird/原生客户端读邮件 |
| **浏览器扩展（一键生成 alias）** | 没有；这是 SimpleLogin / Bitwarden 的增长引擎 |
| **CLI 工具** | 没有 |
| **Webhook 投递面板** | 后端代码 retry 3 次入 `failed_emails`，但没有 admin/user UI 查看投递历史 |
| **Stripe / 在线支付** | 没有；tier 只能靠兑换码激活，限制商业化路径 |
| **BYO domain（用户自带域名）** | domains 表是 admin 全局管理；用户不能自助挂载自己域名（SimpleLogin / addy.io 的付费层卖点） |

---

## 3. 优先级矩阵（影响 × 工作量）

按 **(用户感知 × 战略价值) / 工作量** 综合打分：

| 优先级 | 功能 | 工作量 | 用户感知 | 战略价值 |
|--------|------|--------|----------|----------|
| ★★★ | SSE 实时邮件推送 | 小 | ★★★★★ | ★★★ |
| ★★★ | Telegram/Discord 通知（复用 webhook 框架） | 小 | ★★★★ | ★★★ |
| ★★★ | 注册邮箱验证 | 小 | ★ | ★★★★★（防滥用底线） |
| ★★★ | 账号自助删除 + 数据导出 | 中 | ★★ | ★★★★★（合规底线） |
| ★★ | 用户举报 abuse + admin 处理流 | 中 | ★ | ★★★★ |
| ★★ | 审计日志 UI（表已有） | 小 | ★ | ★★★ |
| ★★ | 简单垃圾邮件过滤（域名黑名单 + Bayesian/规则） | 中 | ★★★ | ★★★★ |
| ★★ | 浏览器扩展（一键 alias） | 中-大 | ★★★★ | ★★★★★ |
| ★ | 出站邮件（reply from alias） | 大 | ★★★★ | ★★★★★ |
| ★ | 转发到真实邮箱 | 大 | ★★★★★ | ★★★★★ |
| ★ | Stripe 支付 | 中 | ★★ | ★★★★（解锁商业化） |
| ★ | BYO domain | 大 | ★★ | ★★★★ |
| ○ | IMAP/POP3 bridge | 大 | ★★ | ★★ |

---

## 4. 推荐"下一步"组合

### 组合一：1 周快速包（强烈推荐）

把 4 个 ★★★ 项打包做掉，让项目从"功能完整 demo"跃迁到"可对外公开运营的产品"：

1. **SSE 实时邮件推送** — `/api/email/stream` 长连接，Email worker 写库后通过 KV pub/sub 或 Durable Object 触发推送
2. **Telegram + Discord 通知通道** — 在现有 `user_settings` 加 `telegram_chat_id` / `discord_webhook_url` 字段，复用 `queue.ts` 中 webhook 发送的位置增加两个分支
3. **注册邮箱验证** — 注册时发送验证邮件（`emailService.ts` 已有 `sendWelcomeEmail` 但没人调），未验证账号 24h 后自动清理
4. **账号自助删除 + GDPR 数据导出** — `/api/user/export`（产出 ZIP：profile + 邮件元数据 + 设置 JSON）和 `/api/user/delete-account`（软删 + 7 天宽限期撤销窗口）

**预期收益**：用户感知层面立刻"像个真正的产品"；合规底线补齐；上线公网风险显著降低。

### 组合二：战略级单点（备选）

如果希望产品定位升级而不只是体验完善：

**做"邮件转发到真实邮箱"单项** — 在 Email worker 收信后，若该 mailbox 设置了 forward target，则通过 Cloudflare Email Routing 的 forward action 或 Resend/SendGrid 把邮件转发到用户真实邮箱（注意 SPF/DKIM 签名需要走自有域）。配套 UI：在 mailbox 设置里加"转发到"字段；在 user_settings 加全局默认转发。

**预期收益**：产品从"临时收件箱"进入"个人邮件别名"赛道，与 SimpleLogin / AnonAddy 同位。可作为付费 tier 的差异化能力（免费 tier 限 1 个转发地址等）。

### 组合三：商业化通路（如果有付费规划）

**做"Stripe 接入 + BYO domain"** — 让 tier 系统不只能靠兑换码激活；让付费用户能挂载自己域名。这两件事一起做能直接打通"产品 → 商业化"链路，但工作量是组合一的 3-4 倍。

---

## 5. 选择建议

- **目前阶段是"上线前最后冲刺"** → 选**组合一（快速包）**。这 4 项是公开服务的合理底线，且都能在 1 周内完成。
- **已经稳定运营、寻求差异化** → 选**组合二（战略级）**，做转发能力，把项目从 temp-mail 升级到 alias service。
- **准备启动付费业务** → 选**组合三（商业化）**，先打通 Stripe 和 BYO domain。

抗滥用维度（垃圾过滤、举报流、附件扫描）建议无论选哪个组合都**至少补一个最小实现**（用户举报按钮 + admin 处理面板），否则一旦被用户当 disposable inbox 大量使用，运营成本会指数级上升。

---

## 6. 不推荐当前阶段做

- **IMAP/POP3 bridge** — 工作量极大但用户基数小（绝大多数临时邮箱用户用网页就够），ROI 太低
- **GraphQL endpoint** — 现有 REST 已足够，徒增维护负担
- **复杂别名分组管理 UI** — 当前 mailbox 列表已能支撑，分组属于过度设计

---

## 7. 如何验证选择

无论选哪个组合，落地前建议：

1. 在 GitHub Issue / Discussion 开一个 "Q3 roadmap" 帖收集 5-10 个真实用户反馈
2. 对比 SimpleLogin / AnonAddy 的 changelog（最近 6 个月）看他们新加了什么 → 反向印证社区需求
3. 查 `audit_logs` 表（实际数据）：哪些功能被频繁使用、哪些 endpoint 0 调用 → 用真实数据校准优先级

---

## 8. 落地参考（如果接下来要做组合一）

仅作参考，本文档是 roadmap，不直接对应代码改动：

- `workers/api/src/routes/email.ts` — 加 SSE 端点
- `workers/api/src/services/emailService.ts` — 接通 `sendWelcomeEmail` / 加 Telegram 发送
- `workers/api/src/routes/user.ts` — 加 `/export` 与 `/delete-account`
- `workers/email/src/queue.ts` — webhook 派发处加 Telegram / Discord 分支
- `web/src/pages/Settings.tsx` — 加 Telegram chat id / 通知通道 UI
- `web/src/hooks/useEmailStream.ts`（新增）— EventSource 包装
- `schema.sql` + `migrations/` — 加 `email_verifications` / `account_deletions` 表
