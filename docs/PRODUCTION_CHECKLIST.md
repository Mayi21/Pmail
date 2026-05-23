# PMail Production Deployment Checklist (待完成项目)

> 本清单仅包含**未完成**和**部分完成**的项目
> 已完成项目已移除，详见代码分析报告
> 最后更新: 2026-05-22

## ℹ️ 重要说明

### 如何验证 Secrets 配置

Cloudflare Workers 的 Secrets（敏感信息）**不会出现在代码仓库或 `wrangler.toml` 中**。要验证是否已配置：

```bash
# 进入 API Worker 目录
cd workers/api

# 列出所有已配置的 secrets
wrangler secret list

# 当前已配置的 secrets:
# ✅ TURNSTILE_SECRET_KEY
```

或在 Cloudflare Dashboard 查看: Workers & Pages → 选择 Worker → Settings → Variables → Encrypted

---

## 🔥 高优先级 (上线前必须完成)

### 🔐 安全配置

- [ ] **配置 Cloudflare WAF 规则**
  - 在 Cloudflare Dashboard 中配置
  - 防御 SQL 注入、XSS、CSRF 等常见攻击
  - 参考: OWASP Core Rule Set

- [ ] **移除 localhost 从生产环境 CORS 配置**
  - 当前: `ALLOWED_ORIGINS` 包含 `http://localhost:5173`
  - 操作: 在生产环境 `wrangler.toml` 中移除 localhost
  - 位置: `workers/api/wrangler.toml:60`

- [ ] **JWT 令牌刷新机制**
  - 当前: 仅使用 7 天过期的访问令牌，无 Refresh Token
  - 风险: 令牌被盗后长期有效，无法远程撤销
  - 方案: 双令牌机制（Access Token 15 分钟 + Refresh Token 30 天），启用 `sessions` 表，新增 `/api/auth/refresh` 端点
  - 位置: `workers/api/src/services/jwt.ts`

- [ ] **密码重置令牌安全加固**
  - 当前: 使用 `crypto.randomUUID()` 生成令牌，明文存储，无 IP 绑定
  - 改为: 64 字符强随机令牌、存储哈希、一次性使用、绑定 IP、有效期降至 1 小时、使用后强制登出所有会话
  - 位置: `workers/api/src/routes/auth.ts:318`

### 🗄️ 数据保护

- [ ] **配置 D1 数据库备份策略**
  - 使用 Cloudflare D1 的备份功能
  - 建议: 每日自动备份
  - 保留策略: 至少 7 天

### 📝 法律合规

- [ ] **编写服务条款 (Terms of Service)**
  - 必须项: 服务范围、用户责任、免责声明
  - 建议咨询法律顾问

- [ ] **编写隐私政策 (Privacy Policy)**
  - 必须说明: 数据收集范围、存储时长、第三方共享
  - GDPR/CCPA 合规要求

---

## ⚡ 中优先级 (上线后 1 个月内完成)

### 🔐 安全增强

- [ ] **邮件 HTML 内容 XSS 净化**
  - 当前: 显示 HTML 邮件时缺少严格的内容净化
  - 方案: 引入 DOMPurify，配置允许的标签/属性白名单，移除脚本与事件处理器，沙箱化外部链接，通过代理加载外部图片
  - 涉及: `web/src/components/EmailViewer*` 等邮件渲染组件

- [ ] **统一 API 输入验证 (Zod)**
  - 当前: 各端点验证规则零散
  - 方案: 用 Zod 定义通用 Schema（邮箱、用户名、密码、文件上传参数），统一错误响应格式
  - 位置: `workers/api/src/routes/*`

- [ ] **会话管理增强**
  - 当前: `sessions` 表未充分利用
  - 方案: 记录设备/IP/地理位置；前端「查看活跃会话」「登出所有设备」；可疑登录（新设备/新地理位置）触发邮件通知
  - 涉及: `schema.sql` 中 `sessions` 表、`workers/api/src/routes/auth.ts`

- [ ] **附件安全检查**
  - 当前: 仅靠后缀和大小限制
  - 方案: Magic Number 文件类型验证、类型白名单、附件下载 URL 签名 + 过期、强制 `Content-Disposition: attachment`、可选病毒扫描 API
  - 涉及: `workers/email/src/index.ts`、`workers/api/src/routes/attachments.ts`

- [ ] **速率限制分层**
  - 当前: 单一阈值
  - 方案: 按用户等级（guest/basic/premium）分层；敏感操作（登录、密码重置）单独阈值；增加每小时维度；触发后告警
  - 位置: `workers/api/src/middleware/rateLimit.ts`

- [ ] **审计日志增强**
  - 当前: `audit_logs` 表记录基础字段
  - 方案: 新增 `before_value` / `after_value` 字段记录数据变更；为每个请求生成 request_id 链路追踪；敏感操作全量入库
  - 涉及: `schema.sql` 中 `audit_logs` 表

- [ ] **Webhook 安全（如启用）**
  - 方案: HMAC-SHA256 签名 payload；校验 `webhook_url` 目标域防 SSRF；指数退避重试；调用与响应入库；单独速率限制
  - 位置: 当前未实现 webhook 路由，新增前需提前设计

- [ ] **入站邮件头验证**
  - 方案: 在 Email Worker 中校验 SPF / DKIM / DMARC 验证结果（postal-mime headers），可疑邮件打标
  - 位置: `workers/email/src/index.ts`

### 🏗️ 基础设施

- [ ] **配置 Queue 和 Dead Letter Queue**
  - 当前状态: 代码框架已实现但未实际使用
  - 位置: `workers/api/src/index.ts:214-239`
  - 用途: 异步邮件处理

- [ ] **配置 R2 对象生命周期规则**
  - 自动清理过期邮件的附件
  - 建议: 30 天后删除

- [ ] **配置 CDN 加速附件下载**
  - 使用 Cloudflare R2 的公开 URL
  - 或配置自定义域名

- [ ] **创建 Staging 环境**
  - 独立的 Workers、D1、KV、R2
  - 用于预发布测试

### 📊 监控与告警

- [ ] **集成 Sentry 错误追踪**
  - 当前: 仅使用 `console.error`
  - 安装: `@sentry/browser` (前端) + `@sentry/node` (Workers)
  - 配置告警规则

- [ ] **配置 Cloudflare Analytics 告警**
  - 错误率 > 5% 时告警
  - 响应时间 P99 > 2s 时告警
  - 存储使用量 > 80% 时告警

- [ ] **实现响应时间监控**
  - 在中间件中添加计时逻辑
  - 记录到 D1 或发送到监控服务
  - 目标: P50 < 200ms, P99 < 1s

- [ ] **实现存储配额监控**
  - 定期检查 D1 大小 (限制 5GB)
  - 定期检查 R2 使用量 (限制 10GB)
  - 定期检查 KV 使用量 (限制 1GB)

### 🧪 测试

- [ ] **执行负载测试**
  - 工具: Apache JMeter 或 k6
  - 场景: 并发 100 用户，持续 10 分钟
  - 验证: Workers CPU 限制、D1 查询性能

- [ ] **执行安全测试**
  - 见下方「🧪 安全测试 checklist」章节

- [ ] **提升单元测试覆盖率**
  - 当前: 仅 3 个测试文件
  - 目标: 核心业务逻辑覆盖率 > 70%
  - 关键模块: 认证、邮箱管理、邮件处理

### 📝 文档

- [ ] **编写运维 Runbook**
  - 常见问题处理流程
  - 数据库备份恢复步骤
  - 紧急回滚流程

- [ ] **编写用户使用指南**
  - 如何注册和登录
  - 如何创建临时邮箱
  - 如何查看邮件和下载附件
  - API 使用示例

- [ ] **编写 FAQ 文档**
  - 邮箱有效期说明
  - 数据隐私保护
  - 常见错误码解释

---

## 🌱 低优先级 (持续优化)

### 🔐 安全增强

- [ ] **实现管理员端点 IP 白名单**
  - 位置: `workers/api/src/middleware/auth.ts:255-285`
  - 检查 `CF-Connecting-IP` 头部
  - 仅允许指定 IP 访问管理员 API

- [ ] **增强密码复杂度要求**
  - 当前: 8-64 字符，包含大小写字母和数字
  - 建议: 最低 12 位 + 强制特殊字符；接入 Have I Been Pwned API 拦截常见密码；前端实时密码强度评分
  - 位置: `workers/api/src/routes/auth.ts:29`

- [ ] **多因素认证 (MFA / TOTP)**
  - 状态: 未实现
  - 方案: 用户可选启用 TOTP（Google Authenticator），生成备用恢复码，登录二步校验
  - 涉及: `schema.sql` 新增 mfa 字段、`workers/api/src/routes/auth.ts`

- [ ] **实现显式 CSRF 保护**
  - 当前: JWT 认证天然防御 CSRF
  - 可选: 为重要操作添加 CSRF Token

- [ ] **数据保留策略自动化**
  - 当前: 依赖固定 cron 清理
  - 方案: 用户可自定义邮件保留时间（7/14/30 天）；软删除保留 7 天；附件单独计算配额；自动生成数据导出报告
  - 涉及: `workers/api/src/services/cleanup*`

- [ ] **前端安全加固**
  - Subresource Integrity (SRI) 引用第三方脚本
  - localStorage 中敏感数据加密存储
  - 关键表单防抖（防暴力提交）
  - 检查 HSTS / X-Frame-Options 是否生效
  - 涉及: `web/index.html`、`web/public/_headers`

- [ ] **依赖项安全扫描**
  - 配置 GitHub Actions 自动扫描
  - 集成 Snyk 或 Dependabot
  - CI 中加入 `npm audit`
  - 自动创建安全更新 PR

### 🏗️ 基础设施

- [ ] **验证 DDoS 保护配置**
  - Cloudflare 免费套餐已提供基础保护
  - 在 Dashboard 检查规则状态

- [ ] **配置 Bot 保护**
  - 启用 Cloudflare Bot Management
  - 或使用免费的 Bot Fight Mode

### 📊 监控与性能

- [ ] **定义日志保留策略**
  - Workers 日志默认保留 24 小时
  - 考虑使用 Logpush 持久化到 R2

- [ ] **实现数据库查询性能追踪**
  - 记录慢查询 (> 100ms)
  - 定期优化查询计划

- [ ] **验证缓存命中率**
  - 目标: KV 缓存命中率 > 80%
  - 监控 `CACHE` namespace 使用情况

### 🧪 测试

- [ ] **端到端测试**
  - 使用 Playwright 或 Cypress
  - 覆盖关键用户流程

- [ ] **执行灾难恢复演练**
  - 测试数据库恢复流程
  - 测试 Workers 回滚流程
  - 验证 RTO < 1 小时, RPO < 4 小时

### 🚀 部署流程

- [ ] **实现 CI/CD 自动化**
  - 使用 GitHub Actions
  - 自动运行测试
  - 自动部署到 Staging
  - 手动批准后部署到生产

- [ ] **配置生产部署流程**
  - 低流量时段部署 (如凌晨 2-4 点)
  - 团队通知机制
  - 部署前自动备份

### 📝 文档

- [ ] **创建架构图**
  - 系统架构图
  - 数据流图
  - 部署拓扑图

---

## 🔍 部分完成项目说明

以下项目已部分实现，但需要进一步验证或配置：

### ⚠️ CSRF 保护
- **现状**: JWT 认证天然防御 CSRF
- **建议**: 对于敏感操作（删除账户、修改密码）考虑添加二次确认

### ⚠️ SQL 注入防护
- **现状**: 全量使用 D1 Prepared Statements 参数化查询
- **需要**: 渗透测试覆盖用户名、邮箱地址、搜索字段；CI 中加入静态检查

### ⚠️ 敏感数据脱敏
- **现状**: 基本使用 `console.log` / `console.error`
- **需要**:
  - 审查所有日志点，确保不含密码、Token、邮件正文
  - 错误响应统一封装，避免暴露堆栈或内部细节
  - 用户列表 / 公开页面隐藏完整邮箱（如 `u***@example.com`）
  - 生产环境构建移除所有调试日志

### ⚠️ 错误追踪
- **现状**: 使用 `console.error` 记录错误
- **建议**: 集成专业错误追踪服务（Sentry）

---

## ✅ 快速上线最小检查清单

如果需要快速上线，以下是**绝对必须**完成的项目：

### 已完成 ✅
1. ✅ 配置 `TURNSTILE_SECRET_KEY` 密钥 - 已通过 `wrangler secret` 配置
2. ✅ CSP 安全响应头 - 见 `web/index.html` 与 `web/public/_headers`

### 待完成 ⏳
4. [ ] 配置 Cloudflare WAF 基础规则
5. [ ] 从生产环境移除 `localhost` CORS 配置
6. [ ] 配置 D1 数据库每日备份
7. [ ] JWT 令牌刷新机制（Access + Refresh）
8. [ ] 密码重置令牌安全加固（强随机 + 哈希存储 + 一次性 + 绑定 IP）
9. [ ] 编写服务条款和隐私政策
12. [ ] 配置至少一个告警（错误率或响应时间）
13. [ ] 执行一轮安全测试（至少覆盖 SQL 注入、XSS、认证绕过）

**快速上线完成度**: 4/13 (31%)

---

## 🧪 安全测试 checklist

上线前与每次重大变更后建议跑一遍，按需勾选。

### 认证与授权

- [ ] **密码安全**
  - [ ] 测试弱密码被拒绝
  - [ ] 测试常见密码被拒绝
  - [ ] 验证密码哈希强度（bcrypt, cost >= 10）
  - [ ] 测试密码重置流程
  - [ ] 验证重置令牌只能使用一次

- [ ] **会话管理**
  - [ ] JWT 令牌正确过期
  - [ ] Refresh Token 轮换工作正常
  - [ ] 登出后令牌失效
  - [ ] 同时登录多设备管理正常

- [ ] **登录保护**
  - [ ] 5 次失败后账户锁定
  - [ ] IP 锁定机制正常
  - [ ] Turnstile CAPTCHA 有效
  - [ ] 登录通知邮件发送（如启用）

### 输入验证

- [ ] **SQL 注入防护**
  - [ ] 测试用户名字段 SQL 注入
  - [ ] 测试邮箱地址字段
  - [ ] 测试搜索功能
  - [ ] 所有查询使用参数化

- [ ] **XSS 防护**
  - [ ] 邮件 HTML 内容被净化
  - [ ] 用户输入被正确转义
  - [ ] CSP 策略阻止内联脚本
  - [ ] 测试反射型 XSS
  - [ ] 测试存储型 XSS

- [ ] **文件上传安全**
  - [ ] 文件类型验证（Magic Number）
  - [ ] 文件大小限制生效
  - [ ] 恶意文件名被拒绝
  - [ ] 文件内容扫描（如启用）

### API 安全

- [ ] **速率限制**
  - [ ] 超过限制返回 429
  - [ ] 不同端点有不同限制
  - [ ] 基于用户等级的限制
  - [ ] `Retry-After` 头正确

- [ ] **授权检查**
  - [ ] 无令牌访问受保护端点被拒绝
  - [ ] 过期令牌被拒绝
  - [ ] 用户只能访问自己的数据（`user_id` 隔离）

- [ ] **CORS 配置**
  - [ ] 只允许白名单域名
  - [ ] 预检请求正确处理
  - [ ] Credentials 正确配置

### 数据保护

- [ ] **加密验证**
  - [ ] 数据库中邮件内容已加密
  - [ ] 解密功能正常
  - [ ] R2 附件加密（如启用）

- [ ] **敏感数据处理**
  - [ ] 日志中无密码明文
  - [ ] 错误消息不泄露内部信息
  - [ ] API 响应不含敏感字段
  - [ ] 审计日志完整

### 基础设施

- [ ] **HTTP 头**
  - [ ] CSP 策略正确
  - [ ] HSTS 已启用
  - [ ] X-Frame-Options 正确
  - [ ] X-Content-Type-Options 设置

- [ ] **HTTPS**
  - [ ] 强制 HTTPS 重定向
  - [ ] TLS 1.3 可用
  - [ ] 证书有效

- [ ] **依赖项**
  - [ ] `npm audit` 无高危漏洞
  - [ ] Snyk / Dependabot 扫描通过
  - [ ] 依赖项为最新安全版本

### OWASP Top 10 (2021)

- [ ] A01 - Broken Access Control
- [ ] A02 - Cryptographic Failures
- [ ] A03 - Injection
- [ ] A04 - Insecure Design
- [ ] A05 - Security Misconfiguration
- [ ] A06 - Vulnerable Components
- [ ] A07 - Authentication Failures
- [ ] A08 - Data Integrity Failures
- [ ] A09 - Logging Failures
- [ ] A10 - SSRF

### 参考链接

- OWASP Top 10: <https://owasp.org/www-project-top-ten/>
- OWASP API Security Top 10: <https://owasp.org/www-project-api-security/>
- CWE Top 25: <https://cwe.mitre.org/top25/>
- Cloudflare Workers Security: <https://developers.cloudflare.com/workers/platform/security/>
- DOMPurify: <https://github.com/cure53/DOMPurify>
- jose (JWT): <https://github.com/panva/jose>
- Zod: <https://github.com/colinhacks/zod>

---

## 📊 完成度追踪

| 类别 | 待完成项 | 预计工时 |
|------|---------|---------|
| 🔥 高优先级 | 9 项 | 12-18 小时 |
| ⚡ 中优先级 | 21 项 | 50-70 小时 |
| 🌱 低优先级 | 19 项 | 60-90 小时 |
| **总计** | **49 项** | **122-178 小时** |

### 项目整体完成度

- **已完成**: 25 项 ✅
- **待完成**: 49 项 ⏳
- **总完成率**: **34%** → **目标 100%**

---

## 🎯 里程碑建议

### Milestone 1: 最小可上线版本 (MVP)
- 完成所有高优先级项目（含 JWT 刷新、密码重置加固）
- 时间: 2-3 周

### Milestone 2: 生产就绪版本
- 完成所有高优先级和中优先级项目（含 XSS 净化、附件安全、审计日志增强）
- 时间: 6-8 周

### Milestone 3: 企业级版本
- 完成所有项目（含 MFA、依赖扫描、灾难演练）
- 时间: 12-16 周

---

## ✅ 已完成项目总结

以下重要项目已经完成，可以放心使用：

### 🔐 安全与认证
- ✅ JWT 签名（单一静态密钥 `JWT_SECRET`，HS256）
- ✅ 管理员端点保护（requireAdmin 中间件）
- ✅ 速率限制（分钟级 + 每日限制）
- ✅ 登录失败锁定（5 次失败 = 15 分钟锁定）
- ✅ CORS 配置（基于 ALLOWED_ORIGINS 环境变量）
- ✅ Secrets 安全存储（TURNSTILE_SECRET_KEY）
- ✅ Turnstile CAPTCHA 防护（`workers/api/src/services/turnstileService.ts`）
- ✅ 密码复杂度基线（8-64 字符 + 大小写 + 数字，`workers/api/src/routes/auth.ts:29`）

### 🏗️ 基础设施
- ✅ Workers 配置（API + Email Workers）
- ✅ D1 数据库结构（完整的 schema.sql + 17+ 索引）
- ✅ KV 命名空间（7 个 namespaces 全部配置）
- ✅ R2 存储桶（附件存储）
- ✅ Cron 定时任务（每小时清理 + 每日 D1 备份）
- ✅ Observability 启用（10% 采样率）

### 📊 监控与日志
- ✅ 结构化日志（Hono logger 中间件）
- ✅ 审计日志表（记录用户操作、IP、User Agent）
- ✅ 失败邮件跟踪表

### 🔒 安全头部
- ✅ CSP 头部（web/index.html + web/public/_headers）
- ✅ HTTPS 强制（Strict-Transport-Security）
- ✅ XSS 保护头部（X-Content-Type-Options, X-XSS-Protection）
- ✅ Permissions Policy

### 📝 文档
- ✅ README.md - 项目概览
- ✅ CLAUDE.md - 开发者指南
- ✅ schema.sql - 完整数据库结构注释
- ✅ docs/DEPLOYMENT.md - 部署指南
- ✅ docs/ARCHITECTURE_AND_API.md - API 与架构

---

**检查清单生成日期**: 2025-11-04
**安全方案合并日期**: 2026-05-22
**基于代码版本**: commit `045392c`
**Secrets 验证日期**: 2025-11-04 ✅
**下次审查日期**: _______________
