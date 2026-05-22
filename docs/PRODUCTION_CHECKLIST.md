# PMail Production Deployment Checklist (待完成项目)

> 本清单仅包含**未完成**和**部分完成**的项目
> 已完成项目已移除，详见代码分析报告
> 最后更新: 2025-11-04

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
# ✅ OAUTH_LINUXDO_CLIENT_SECRET
# ⚠️ DATABASE_ENCRYPTION_KEY (需要配置 - 见数据保护章节)
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

### 🗄️ 数据保护

- [ ] **配置 D1 数据库备份策略**
  - 使用 Cloudflare D1 的备份功能
  - 建议: 每日自动备份
  - 保留策略: 至少 7 天

- [x] **实现邮件正文加密** ✅
  - 状态: 已实现 AES-GCM-256 加密
  - 实现位置:
    - 加密工具: `workers/api/src/utils/crypto.ts` 和 `workers/email/src/utils/crypto.ts`
    - Email Worker 加密逻辑: `workers/email/src/index.ts:172-189`
    - API Worker 解密逻辑: `workers/api/src/routes/email.ts` 和 `workers/api/src/routes/mailboxEmails.ts`
  - 部署要求: **必须配置 `DATABASE_ENCRYPTION_KEY` 密钥**
    ```bash
    # 生成 256-bit 加密密钥
    openssl rand -hex 32

    # 配置到 API Worker
    cd workers/api
    wrangler secret put DATABASE_ENCRYPTION_KEY

    # 配置到 Email Worker
    cd workers/email
    wrangler secret put DATABASE_ENCRYPTION_KEY
    ```
  - 注意: 新邮件将自动加密，旧邮件保持明文（兼容处理）

### 📝 法律合规

- [ ] **编写服务条款 (Terms of Service)**
  - 必须项: 服务范围、用户责任、免责声明
  - 建议咨询法律顾问

- [ ] **编写隐私政策 (Privacy Policy)**
  - 必须说明: 数据收集范围、存储时长、第三方共享
  - GDPR/CCPA 合规要求

---

## ⚡ 中优先级 (上线后 1 个月内完成)

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
  - [ ] OWASP Top 10 漏洞扫描
  - [ ] SQL 注入测试
  - [ ] XSS 测试
  - [ ] 认证绕过尝试
  - [ ] 暴力破解测试

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
  - 建议: 增加特殊字符要求

- [ ] **实现显式 CSRF 保护**
  - 当前: JWT 认证天然防御 CSRF
  - 可选: 为重要操作添加 CSRF Token

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

- [ ] **公开 API 文档**
  - 使用 Swagger/OpenAPI
  - 托管在独立域名或子路径
  - 包含使用示例和错误码

---

## 🔍 部分完成项目说明

以下项目已部分实现，但需要进一步验证或配置：

### ⚠️ CSRF 保护
- **现状**: JWT 认证天然防御 CSRF
- **建议**: 对于敏感操作（删除账户、修改密码）考虑添加二次确认

### ⚠️ SQL 注入防护
- **现状**: 使用参数化查询（D1 Prepared Statements）
- **需要**: 执行渗透测试验证

### ⚠️ 敏感数据脱敏
- **现状**: 基本使用 `console.log`
- **需要**: 确保日志中不包含密码、Token、API Key 等敏感信息

### ⚠️ 错误追踪
- **现状**: 使用 `console.error` 记录错误
- **建议**: 集成专业错误追踪服务（Sentry）

---

## ✅ 快速上线最小检查清单

如果需要快速上线，以下是**绝对必须**完成的项目：

### 已完成 ✅
1. ✅ 配置 `TURNSTILE_SECRET_KEY` 密钥 - 已通过 `wrangler secret` 配置
2. ✅ 配置 `OAUTH_LINUXDO_CLIENT_SECRET` 密钥 - 已通过 `wrangler secret` 配置
3. ✅ 实现邮件正文加密 - 已实现 AES-GCM-256 加密

### 待完成 ⏳
4. [ ] 配置 `DATABASE_ENCRYPTION_KEY` 密钥到 API Worker 和 Email Worker
5. [ ] 配置 Cloudflare WAF 基础规则
6. [ ] 从生产环境移除 `localhost` CORS 配置
7. [ ] 配置 D1 数据库每日备份
8. [ ] 编写服务条款和隐私政策
9. [ ] 配置至少一个告警（错误率或响应时间）
10. [ ] 执行一轮安全测试（至少测试 SQL 注入和 XSS）

**快速上线完成度**: 3/10 (30%)

---

## 📊 完成度追踪

| 类别 | 待完成项 | 预计工时 |
|------|---------|---------|
| 🔥 高优先级 | 7 项 | 6-10 小时 |
| ⚡ 中优先级 | 13 项 | 20-30 小时 |
| 🌱 低优先级 | 13 项 | 40-60 小时 |
| **总计** | **33 项** | **66-100 小时** |

### 项目整体完成度

- **已完成**: 25 项 ✅
- **待完成**: 33 项 ⏳
- **总完成率**: **43%** → **目标 100%**

---

## 🎯 里程碑建议

### Milestone 1: 最小可上线版本 (MVP)
- 完成所有高优先级项目
- 时间: 1-2 周

### Milestone 2: 生产就绪版本
- 完成所有高优先级和中优先级项目
- 时间: 4-6 周

### Milestone 3: 企业级版本
- 完成所有项目
- 时间: 8-12 周

---

## ✅ 已完成项目总结

以下重要项目已经完成，可以放心使用：

### 🔐 安全与认证
- ✅ JWT 密钥轮换机制（每 30 天自动轮换）
- ✅ API 密钥权限控制（read/write 权限分离）
- ✅ 管理员端点保护（requireAdmin 中间件）
- ✅ 速率限制（分钟级 + 每日限制）
- ✅ 登录失败锁定（5 次失败 = 15 分钟锁定）
- ✅ CORS 配置（基于 ALLOWED_ORIGINS 环境变量）
- ✅ Secrets 安全存储（TURNSTILE_SECRET_KEY, OAUTH_LINUXDO_CLIENT_SECRET）

### 🏗️ 基础设施
- ✅ Workers 配置（API + Email Workers）
- ✅ D1 数据库结构（完整的 schema.sql + 17+ 索引）
- ✅ KV 命名空间（7 个 namespaces 全部配置）
- ✅ R2 存储桶（附件存储）
- ✅ Cron 定时任务（每小时清理 + 每 30 天密钥轮换）
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
- ✅ API_KEY_DESIGN.md - API 密钥设计
- ✅ schema.sql - 完整数据库结构注释
- ✅ DEPLOYMENT_GUIDE.md - 部署指南

---

**检查清单生成日期**: 2025-11-04
**基于代码版本**: commit `045392c`
**Secrets 验证日期**: 2025-11-04 ✅
**下次审查日期**: _______________
