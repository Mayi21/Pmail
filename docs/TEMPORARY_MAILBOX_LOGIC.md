# 临时邮箱计算逻辑技术文档

> **文档版本**: v1.0
> **最后更新**: 2025-11-11
> **目标读者**: 后端开发者、系统维护人员

## 📋 文档概述

本文档详细记录了 PMail 项目中临时邮箱使用情况的完整计算逻辑，包括数据统计、配额检查、过期清理等核心机制。文档基于对代码库的深入分析，提供了完整的数据流向、发现的问题以及修复方案。

### 为什么需要这份文档？

- **理解系统行为**: 清晰了解临时邮箱统计数据的来源和更新机制
- **问题排查**: 快速定位配额统计不准确的根本原因
- **维护指南**: 为代码维护和功能扩展提供参考
- **新人入职**: 帮助新开发者快速理解核心业务逻辑

---

## 🔍 核心概念

### 1. 临时邮箱 vs 永久邮箱

在 PMail 系统中，所有邮箱地址都存储在 `temp_emails` 表中，通过 **`expires_at` 字段** 区分类型：

#### 数据库表结构

**文件**: `schema.sql:59-67`

```sql
CREATE TABLE IF NOT EXISTS temp_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,              -- NULL = 游客邮箱，NOT NULL = 注册用户邮箱
    address TEXT NOT NULL UNIQUE, -- 邮箱地址（例如：abc@your-domain.com）
    expires_at DATETIME,          -- 🔑 关键字段：区分临时/永久邮箱
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,          -- 软删除标记
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 判断规则

| 邮箱类型 | 判断条件 | 示例场景 |
|---------|---------|---------|
| **永久邮箱** | `expires_at IS NULL` | 用户选择"永久邮箱"，`expires_in = 0` |
| **临时邮箱** | `expires_at IS NOT NULL` | 用户选择"1小时"，`expires_at = datetime('now', '+3600 seconds')` |
| **游客邮箱** | `user_id IS NULL` | 未登录用户创建的临时邮箱（总是临时） |

#### 代码示例：创建邮箱时的类型判断

**文件**: `workers/api/src/routes/mailbox.ts:118-200`

```typescript
// 用户请求参数
const expiresIn = validated.expires_in ?? 3600; // 单位：秒

// 判断邮箱类型
const isPermanent = (expiresIn === 0); // 0 = 永久邮箱

// 写入数据库
if (isPermanent) {
  // 永久邮箱：expires_at 设为 NULL
  await c.env.DB.prepare(`
    INSERT INTO temp_emails (user_id, address, expires_at)
    VALUES (?, ?, NULL)
  `).bind(userId, address).run();
} else {
  // 临时邮箱：expires_at 设为未来时间
  await c.env.DB.prepare(`
    INSERT INTO temp_emails (user_id, address, expires_at)
    VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))
  `).bind(userId, address, expiresIn).run();
}
```

---

## 📊 统计数据的来源

### 2. user_statistics 表（缓存层）

临时邮箱的使用数量主要存储在 `user_statistics` 表中，作为高性能缓存。

#### 表结构

**文件**: `schema.sql:159-171`

```sql
CREATE TABLE IF NOT EXISTS user_statistics (
    user_id INTEGER PRIMARY KEY,
    total_mailboxes INTEGER DEFAULT 0,      -- 总邮箱数（永久 + 临时）
    active_mailboxes INTEGER DEFAULT 0,     -- 活跃邮箱数（未过期 + 未删除）
    permanent_mailboxes INTEGER DEFAULT 0,  -- 永久邮箱数量
    temporary_mailboxes INTEGER DEFAULT 0,  -- 🔑 临时邮箱数量
    total_emails INTEGER DEFAULT 0,         -- 总邮件数
    unread_emails INTEGER DEFAULT 0,        -- 未读邮件数
    last_activity DATETIME,                 -- 最后活动时间
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 关键字段说明

- **`temporary_mailboxes`**: 用户创建的临时邮箱总数（包括已过期但未清理的）
- **`active_mailboxes`**: 当前活跃的邮箱数（永久 + 未过期临时）
- **`total_mailboxes`**: 所有邮箱数（永久 + 临时，包括过期）

### 3. 统计数据获取策略

系统采用 **缓存优先 + 实时计算兜底** 的双层策略。

#### getUserMailboxStats() 函数逻辑

**文件**: `workers/api/src/services/quotaService.ts:66-123`

```typescript
export async function getUserMailboxStats(
  userId: number,
  db: D1Database
): Promise<UserMailboxStats> {

  // ========== 策略1：优先从缓存表读取 ==========
  const stats = await db.prepare(`
    SELECT
      permanent_mailboxes,
      temporary_mailboxes,
      total_mailboxes
    FROM user_statistics
    WHERE user_id = ?
  `).bind(userId).first<UserMailboxStats>();

  if (stats) {
    return stats; // ✅ 缓存命中，直接返回
  }

  // ========== 策略2：缓存未命中，实时计算 ==========
  const calculated = await db.prepare(`
    SELECT
      COUNT(CASE WHEN expires_at IS NULL THEN 1 END) as permanent_mailboxes,
      COUNT(CASE WHEN expires_at IS NOT NULL THEN 1 END) as temporary_mailboxes,
      COUNT(*) as total_mailboxes
    FROM temp_emails
    WHERE user_id = ? AND deleted_at IS NULL
  `).bind(userId).first<UserMailboxStats>();

  // ========== 策略3：回写到缓存表 ==========
  if (calculated) {
    await db.prepare(`
      INSERT INTO user_statistics (
        user_id,
        permanent_mailboxes,
        temporary_mailboxes,
        total_mailboxes,
        active_mailboxes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        permanent_mailboxes = excluded.permanent_mailboxes,
        temporary_mailboxes = excluded.temporary_mailboxes,
        total_mailboxes = excluded.total_mailboxes,
        updated_at = datetime('now')
    `).bind(
      userId,
      calculated.permanent_mailboxes,
      calculated.temporary_mailboxes,
      calculated.total_mailboxes,
      calculated.total_mailboxes
    ).run();
  }

  return calculated || {
    permanent_mailboxes: 0,
    temporary_mailboxes: 0,
    total_mailboxes: 0
  };
}
```

#### 关键 SQL 解析

```sql
-- 实时统计临时邮箱的核心 SQL
SELECT
  COUNT(CASE WHEN expires_at IS NULL THEN 1 END) as permanent_mailboxes,
  COUNT(CASE WHEN expires_at IS NOT NULL THEN 1 END) as temporary_mailboxes,  -- ← 临时邮箱统计
  COUNT(*) as total_mailboxes
FROM temp_emails
WHERE user_id = ? AND deleted_at IS NULL
```

**统计逻辑**：
- 使用 `CASE WHEN expires_at IS NOT NULL` 识别临时邮箱
- 只统计未软删除的邮箱（`deleted_at IS NULL`）
- 包括已过期但未清理的临时邮箱

---

## 🔄 完整数据流

### 4. 创建临时邮箱流程

#### 4.1 API 请求入口

**接口**: `POST /api/mailbox/create`
**文件**: `workers/api/src/routes/mailbox.ts:118-240`

**请求参数示例**：
```json
{
  "address": "test123",          // 邮箱前缀（自动拼接域名）
  "expires_in": 3600             // 过期时间（秒），0 = 永久
}
```

#### 4.2 完整处理流程

```typescript
// ========== 步骤1：解析请求参数 ==========
const expiresIn = validated.expires_in ?? (parseInt(c.env.DEFAULT_MAILBOX_TTL) || 3600);
const isPermanent = (expiresIn === 0);

// ========== 步骤2：配额检查 ==========
const quotaCheck = await canCreateMailbox(userId, isPermanent, c.env.DB);

if (!quotaCheck.allowed) {
  return c.json({
    success: false,
    error: quotaCheck.reason === 'QUOTA_EXCEEDED'
      ? `临时邮箱配额已满（${quotaCheck.current}/${quotaCheck.limit}）`
      : '配额检查失败',
    error_code: ErrorCode.MAILBOX_QUOTA_EXCEEDED,
  }, 400);
}

// ========== 步骤3：写入数据库 ==========
if (isPermanent) {
  await c.env.DB.prepare(`
    INSERT INTO temp_emails (user_id, address, expires_at)
    VALUES (?, ?, NULL)
  `).bind(userId, fullAddress).run();
} else {
  await c.env.DB.prepare(`
    INSERT INTO temp_emails (user_id, address, expires_at)
    VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))
  `).bind(userId, fullAddress, expiresIn).run();
}

// ========== 步骤4：增量更新统计 ==========
await updateUserMailboxStats(userId, isPermanent, true, c.env.DB);
```

#### 4.3 增量更新逻辑

**文件**: `workers/api/src/services/quotaService.ts:249-283`

```typescript
export async function updateUserMailboxStats(
  userId: number,
  isPermanent: boolean,  // 区分更新哪个字段
  increment: boolean,    // true = 增加，false = 减少
  db: D1Database
): Promise<void> {

  const field = isPermanent ? 'permanent_mailboxes' : 'temporary_mailboxes';
  const operation = increment ? '+' : '-';

  // 增量更新：直接对字段 +1 或 -1
  await db.prepare(`
    UPDATE user_statistics
    SET
      ${field} = ${field} ${operation} 1,
      total_mailboxes = total_mailboxes ${operation} 1,
      active_mailboxes = active_mailboxes ${operation} 1,
      updated_at = datetime('now')
    WHERE user_id = ?
  `).bind(userId).run();

  // 如果记录不存在，触发全量重算
  const exists = await db.prepare(`
    SELECT user_id FROM user_statistics WHERE user_id = ?
  `).bind(userId).first();

  if (!exists) {
    await getUserMailboxStats(userId, db); // 全量重算并创建记录
  }
}
```

**执行示例**（创建临时邮箱）：
```sql
UPDATE user_statistics SET
  temporary_mailboxes = temporary_mailboxes + 1,  -- 85 → 86
  total_mailboxes = total_mailboxes + 1,          -- 95 → 96
  active_mailboxes = active_mailboxes + 1,        -- 90 → 91
  updated_at = datetime('now')
WHERE user_id = 123
```

### 5. 删除邮箱流程

#### 5.1 API 接口

**接口**: `DELETE /api/mailbox/:address`
**文件**: `workers/api/src/routes/mailbox.ts:284-327`

#### 5.2 删除逻辑

```typescript
// 步骤1：查询邮箱信息（判断类型）
const mailbox = await c.env.DB.prepare(`
  SELECT id, expires_at FROM temp_emails
  WHERE address = ? AND user_id = ? AND deleted_at IS NULL
`).bind(address, userId).first();

if (!mailbox) {
  return c.json({ success: false, error: '邮箱不存在' }, 404);
}

// 步骤2：根据 expires_at 判断邮箱类型
const isPermanent = (mailbox.expires_at === null);

// 步骤3：软删除邮箱
await c.env.DB.prepare(`
  UPDATE temp_emails
  SET deleted_at = datetime('now')
  WHERE id = ?
`).bind(mailbox.id).run();

// ��骤4：减少统计计数
await updateUserMailboxStats(userId, isPermanent, false, c.env.DB);
```

**执行 SQL 示例**（删除临时邮箱）：
```sql
UPDATE user_statistics SET
  temporary_mailboxes = temporary_mailboxes - 1,  -- 86 → 85
  total_mailboxes = total_mailboxes - 1,          -- 96 → 95
  active_mailboxes = active_mailboxes - 1,        -- 91 → 90
  updated_at = datetime('now')
WHERE user_id = 123
```

### 6. 定时清理过期邮箱

#### 6.1 Cron 任务配置

**文件**: `workers/api/wrangler.toml:9-13`

```toml
[triggers]
crons = [
  "0 * * * *",        # 每小时执行一次清理
  "0 2 * * *"         # 每日 D1 备份到 R2
]
```

#### 6.2 调度器入口

**文件**: `workers/api/src/index.ts:189-214`

```typescript
async scheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const cronType = event.cron;

  console.log(`Cron job triggered: ${cronType}`);

  switch (cronType) {
    case '0 * * * *':  // 每小时清理
      await cleanupExpiredData(env);
      await checkExpiredTiers(env.DB);
      break;

    case '0 2 * * *':  // 每日 D1 备份
      await performDatabaseBackup(env);
      await cleanupOldBackups(env);
      break;
  }
}
```

#### 6.3 清理流程

**文件**: `workers/api/src/services/cleanup.ts:12-115`

```typescript
export async function cleanupExpiredData(env: Env): Promise<void> {
  console.log('Starting cleanup of expired mailboxes');

  // ========== 步骤1：清理游客邮箱（更激进） ==========
  await cleanupExpiredGuestMailboxes(env);

  // ========== 步骤2：查找过期的注册用户邮箱 ==========
  const expiredEmails = await env.DB.prepare(`
    SELECT id, address, user_id FROM temp_emails
    WHERE expires_at < datetime('now')    -- 🔑 过期条件
      AND deleted_at IS NULL
      AND user_id IS NOT NULL
    LIMIT 100  -- 批量处理，避免 Worker 超时
  `).all();

  if (expiredEmails.results.length === 0) {
    console.log('No expired mailboxes found');
    return;
  }

  console.log(`Found ${expiredEmails.results.length} expired mailboxes`);

  // ========== 步骤3：逐个清理过期邮箱 ==========
  for (const tempEmail of expiredEmails.results) {
    try {
      await cleanupPMail(tempEmail, env);

      // ⚠️ 关键步骤：更新用户统计
      await updateUserStatistics(tempEmail.user_id as number, env);
    } catch (error) {
      console.error(`Failed to cleanup mailbox ${tempEmail.address}:`, error);
    }
  }
}

// 单个邮箱清理逻辑
async function cleanupPMail(
  tempEmail: { id: number; address: string; user_id: number | null },
  env: Env
): Promise<void> {
  // 1. 查找所有邮件ID
  const emails = await env.DB.prepare(`
    SELECT id FROM emails
    WHERE temp_email_id = ? AND deleted_at IS NULL
  `).bind(tempEmail.id).all();

  // 2. 删除 R2 中的附件
  for (const email of emails.results) {
    const attachments = await env.DB.prepare(`
      SELECT attachment_key FROM attachments WHERE email_id = ?
    `).bind(email.id).all();

    for (const attachment of attachments.results) {
      await env.ATTACHMENTS.delete(attachment.attachment_key as string);
    }
  }

  // 3. 软删除邮箱
  await env.DB.prepare(`
    UPDATE temp_emails
    SET deleted_at = datetime('now')
    WHERE id = ?
  `).bind(tempEmail.id).run();

  console.log(`Cleaned up mailbox: ${tempEmail.address}`);
}
```

#### 6.4 清理后的统计更新（⚠️ 存在问题）

**文件**: `workers/api/src/services/cleanup.ts:120-161`

```typescript
async function updateUserStatistics(userId: number, env: Env): Promise<void> {
  // 重新计算活跃邮箱数
  const activeCount = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM temp_emails
    WHERE user_id = ?
      AND (expires_at > datetime('now') OR expires_at IS NULL)  -- 未过期或永���
      AND deleted_at IS NULL
  `).bind(userId).first();

  // 计算邮件统计
  const emailStats = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT e.id) as total,
      SUM(CASE WHEN e.is_read = 0 THEN 1 ELSE 0 END) as unread
    FROM temp_emails t
    LEFT JOIN emails e ON e.temp_email_id = t.id AND e.deleted_at IS NULL
    WHERE t.user_id = ? AND t.deleted_at IS NULL
  `).bind(userId).first();

  // ⚠️ 问题：只更新 active_mailboxes，未更新 permanent_mailboxes 和 temporary_mailboxes
  await env.DB.prepare(`
    INSERT INTO user_statistics (
      user_id,
      active_mailboxes,
      total_emails,
      unread_emails,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      active_mailboxes = ?,
      total_emails = ?,
      unread_emails = ?,
      updated_at = datetime('now')
  `).bind(
    userId,
    activeCount?.count || 0,
    emailStats?.total || 0,
    emailStats?.unread || 0,
    activeCount?.count || 0,
    emailStats?.total || 0,
    emailStats?.unread || 0
  ).run();
}
```

**⚠️ 发现的问题**：
- 清理逻辑只更新了 `active_mailboxes`
- **未更新** `permanent_mailboxes` 和 `temporary_mailboxes` 字段
- 导致这两个字段只增不减，统计数据逐渐失真

---

## ✅ 配额检查机制

### 7. canCreateMailbox() 函数详解

创建邮箱前，系统会检查用户是否有足够的配额。

**文件**: `workers/api/src/services/quotaService.ts:128-211`

```typescript
export async function canCreateMailbox(
  userId: number,
  isPermanent: boolean,  // 区分检查永久/临时邮箱配额
  db: D1Database
): Promise<QuotaCheckResult> {

  // ========== 步骤1：获取用户的等级配置 ==========
  const tierConfig = await getUserTierConfig(userId, db);

  if (!tierConfig) {
    return {
      allowed: false,
      reason: 'TIER_NOT_FOUND',
      tierName: 'unknown'
    };
  }

  // tierConfig 示例：
  // {
  //   tier_name: 'premium',
  //   permanent_mailbox_quota: 100,      // 永久邮箱配额
  //   temporary_mailbox_quota: -1        // 临时邮箱配额（-1=无限）
  // }

  // ========== 步骤2：获取当前使用情况 ==========
  const stats = await getUserMailboxStats(userId, db);

  // stats 示例：
  // {
  //   permanent_mailboxes: 10,
  //   temporary_mailboxes: 85,
  //   total_mailboxes: 95
  // }

  // ========== 步骤3：检查对应类型的配额 ==========
  if (isPermanent) {
    // 检查永久邮箱配额
    const current = stats.permanent_mailboxes;
    const limit = tierConfig.permanent_mailbox_quota;

    if (current >= limit) {
      return {
        allowed: false,
        reason: 'QUOTA_EXCEEDED',
        current,
        limit,
        tierName: tierConfig.tier_name
      };
    }
  } else {
    // 检查临时邮箱配额
    const current = stats.temporary_mailboxes;      // 85
    const limit = tierConfig.temporary_mailbox_quota; // -1 或具体数值

    // 🔑 特殊处理：-1 表示无限制，直接通过
    if (limit !== -1 && current >= limit) {
      return {
        allowed: false,
        reason: 'QUOTA_EXCEEDED',
        current,
        limit,
        tierName: tierConfig.tier_name
      };
    }
  }

  // ========== 步骤4：检查用户等级是否过期 ==========
  const userExpired = await db.prepare(`
    SELECT tier_expires_at
    FROM users
    WHERE id = ? AND deleted_at IS NULL
  `).bind(userId).first<{ tier_expires_at: string | null }>();

  if (userExpired?.tier_expires_at) {
    const expiresAt = new Date(userExpired.tier_expires_at);
    const now = new Date();

    if (expiresAt <= now) {
      return {
        allowed: false,
        reason: 'TIER_EXPIRED',
        tierName: tierConfig.tier_name
      };
    }
  }

  // ========== 步骤5：通过所有检查 ==========
  return {
    allowed: true,
    current: isPermanent ? stats.permanent_mailboxes : stats.temporary_mailboxes,
    limit: isPermanent ? tierConfig.permanent_mailbox_quota : tierConfig.temporary_mailbox_quota,
    tierName: tierConfig.tier_name
  };
}
```

### 8. 等级配置获取

**文件**: `workers/api/src/services/quotaService.ts:47-61`

```typescript
export async function getUserTierConfig(
  userId: number,
  db: D1Database
): Promise<TierConfig | null> {

  const result = await db.prepare(`
    SELECT tc.*
    FROM users u
    JOIN tier_configs tc ON u.tier_id = tc.id
    WHERE u.id = ? AND u.deleted_at IS NULL AND tc.is_active = 1
  `).bind(userId).first<TierConfig>();

  return result;
}
```

#### tier_configs 表结构

**文件**: `schema.sql:7-29`

```sql
CREATE TABLE IF NOT EXISTS tier_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier_name TEXT NOT NULL UNIQUE,           -- 等级名称（basic, premium, vip）
    display_name TEXT NOT NULL,               -- 显示名称
    sort_order INTEGER DEFAULT 0,             -- 排序
    permanent_mailbox_quota INTEGER DEFAULT 0, -- 永久邮箱配额
    temporary_mailbox_quota INTEGER DEFAULT -1, -- 临时邮箱配额（-1=无限）
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初始数据
INSERT OR IGNORE INTO tier_configs (id, tier_name, display_name, sort_order, permanent_mailbox_quota, temporary_mailbox_quota, description, is_active) VALUES
  (1, 'basic', '普通用户', 0, 10, 100, '普通用户等级', 1),
  (2, 'premium', '优选用户', 10, 100, -1, '优选用户等级', 1),
  (3, 'vip', 'VIP 用户', 20, 200, -1, 'VIP 用户等级', 1);
```

---

## ♾️ 无限制配额的特殊处理

### 9. 无限制配额（-1）的设计

系统使用 **`-1` 特殊值** 表示某类邮箱无配额限制。

#### 9.1 数据库定义

```sql
-- schema.sql
temporary_mailbox_quota INTEGER DEFAULT -1  -- -1 = 无限制
```

#### 9.2 配额检查逻辑

**文件**: `quotaService.ts:162-176`

```typescript
// 检查临时邮箱配额
const current = stats.temporary_mailboxes;      // 例如：85
const limit = tierConfig.temporary_mailbox_quota; // -1 或 100

// 🔑 关键逻辑：-1 会跳过检查
if (limit !== -1 && current >= limit) {
  return {
    allowed: false,
    reason: 'QUOTA_EXCEEDED',
    current,
    limit,
    tierName: tierConfig.tier_name
  };
}
// 如果 limit === -1，条件为 false，直接通过检查
```

**逻辑表**：

| limit 值 | current 值 | 条件判断 | 结果 |
|---------|-----------|---------|------|
| 100 | 85 | `100 !== -1 && 85 >= 100` = false | ✅ 允许创建 |
| 100 | 100 | `100 !== -1 && 100 >= 100` = true | ❌ 配额已满 |
| **-1** | 85 | `-1 !== -1 && 85 >= -1` = **false** | ✅ 允许创建（无限） |
| **-1** | 9999 | `-1 !== -1 && 9999 >= -1` = **false** | ✅ 允许创建（无限） |

#### 9.3 前端显示处理

**文件**: `workers/api/src/routes/user.ts:107-143`

```typescript
// API: GET /api/user/me

// 计算剩余配额
const temporaryRemaining = tierConfig.temporary_mailbox_quota === -1
  ? -1  // 无限制
  : tierConfig.temporary_mailbox_quota - mailboxStats.temporary_mailboxes;

// 返回数据结构
return c.json({
  success: true,
  data: {
    quota: {
      temporary: {
        used: 85,                                    // 已使用数量
        limit: -1,                                   // -1 表示无限
        remaining: -1,                               // -1 表示无限剩余
        unlimited: true                              // 明确的布尔标记
      }
    }
  }
});
```

#### 9.4 前端判断示例

```typescript
// 前端代码（React 示例）
function MailboxQuota({ quota }) {
  if (quota.temporary.unlimited) {
    return <div>临时邮箱：{quota.temporary.used} / 无限制 ♾️</div>;
  } else {
    return (
      <div>
        临时邮箱：{quota.temporary.used} / {quota.temporary.limit}
        （剩余 {quota.temporary.remaining}）
      </div>
    );
  }
}
```

---

## 📈 数据流向图

### 10. 完整数据流向

```
┌─────────────────────────────────────────────────────────────────┐
│                     临时邮箱统计数据流                            │
└─────────────────────────────────────────────────────────────────┘

【创建临时邮箱】
POST /api/mailbox/create { expires_in: 3600 }
  │
  ├─> [步骤1] 配额检查
  │   │
  │   ├─> getUserTierConfig(userId, db)
  │   │   └─> SQL: SELECT tc.* FROM users u
  │   │            JOIN tier_configs tc ON u.tier_id = tc.id
  │   │            WHERE u.id = ? AND tc.is_active = 1
  │   │   └─> 返回: { temporary_mailbox_quota: 100 }
  │   │
  │   ├─> getUserMailboxStats(userId, db)
  │   │   │
  │   │   ├─> [缓存命中] SQL: SELECT * FROM user_statistics
  │   │   │                    WHERE user_id = ?
  │   │   │   └─> 返回: { temporary_mailboxes: 85 }
  │   │   │
  │   │   └─> [缓存未命中] SQL: SELECT
  │   │                         COUNT(CASE WHEN expires_at IS NOT NULL THEN 1 END) as temporary_mailboxes
  │   │                         FROM temp_emails WHERE user_id = ? AND deleted_at IS NULL
  │   │       └─> 回写: INSERT INTO user_statistics (...) ON CONFLICT UPDATE
  │   │
  │   └─> 配额检查逻辑
  │       └─> if (limit !== -1 && 85 >= 100) → false ✅ 允许创建
  │
  ├─> [步骤2] 写入数据库
  │   └─> SQL: INSERT INTO temp_emails (user_id, address, expires_at)
  │            VALUES (123, 'test@domain.com', datetime('now', '+3600 seconds'))
  │
  └─> [步骤3] 增量更新统计
      └─> updateUserMailboxStats(userId, false, true, db)
          └─> SQL: UPDATE user_statistics SET
                   temporary_mailboxes = temporary_mailboxes + 1,  -- 85 → 86
                   total_mailboxes = total_mailboxes + 1,
                   updated_at = datetime('now')
                   WHERE user_id = 123

【删除临时邮箱】
DELETE /api/mailbox/:address
  │
  ├─> [步骤1] 查询邮箱类型
  │   └─> SQL: SELECT id, expires_at FROM temp_emails
  │            WHERE address = ? AND user_id = ? AND deleted_at IS NULL
  │   └─> isPermanent = (expires_at === null) → false
  │
  ├─> [步骤2] 软删除邮箱
  │   └─> SQL: UPDATE temp_emails SET deleted_at = datetime('now')
  │            WHERE id = ?
  │
  └─> [步骤3] 减少统计
      └─> updateUserMailboxStats(userId, false, false, db)
          └─> SQL: UPDATE user_statistics SET
                   temporary_mailboxes = temporary_mailboxes - 1,  -- 86 → 85
                   total_mailboxes = total_mailboxes - 1,
                   updated_at = datetime('now')
                   WHERE user_id = 123

【定时清理过期邮箱】（每小时）
Cron: "0 * * * *"
  │
  ├─> cleanupExpiredData(env)
  │   │
  │   ├─> [步骤1] 查询过期邮箱
  │   │   └─> SQL: SELECT id, address, user_id FROM temp_emails
  │   │            WHERE expires_at < datetime('now')
  │   │              AND deleted_at IS NULL AND user_id IS NOT NULL
  │   │            LIMIT 100
  │   │
  │   ├─> [步骤2] 清理附件和邮件
  │   │   └─> 删除 R2 中的附件
  │   │   └─> SQL: UPDATE temp_emails SET deleted_at = datetime('now')
  │   │
  │   └─> [步骤3] ⚠️ 更新统计（不完整）
  │       └─> updateUserStatistics(userId, env)
  │           └─> SQL: SELECT COUNT(*) FROM temp_emails
  │                    WHERE user_id = ?
  │                      AND (expires_at > datetime('now') OR expires_at IS NULL)
  │                      AND deleted_at IS NULL
  │           └─> SQL: UPDATE user_statistics SET
  │                    active_mailboxes = ?,  -- ✅ 更新
  │                    total_emails = ?,      -- ✅ 更新
  │                    unread_emails = ?      -- ✅ 更新
  │                    -- ⚠️ 未更新 temporary_mailboxes 字段
  │
  └─> checkExpiredTiers(db)  -- 同时检查等级过期

【查询统计信息】
GET /api/user/me 或 GET /api/user/quota
  │
  └─> getUserMailboxStats(userId, db)
      └─> 优先返回 user_statistics 表缓存
      └─> 缓存失败则实时计算并回写
```

---

## ⚠️ 发现的关键问题

### 问题 1：定时清理不更新 `temporary_mailboxes` 计数

#### 问题描述

**位置**: `workers/api/src/services/cleanup.ts:140-157`

定时清理任务在删除过期邮箱后，只更新了 `active_mailboxes`、`total_emails`、`unread_emails` 三个字段，**未减少** `permanent_mailboxes` 和 `temporary_mailboxes` 的计数。

#### 当前代码

```typescript
async function updateUserStatistics(userId: number, env: Env): Promise<void> {
  const activeCount = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM temp_emails
    WHERE user_id = ?
      AND (expires_at > datetime('now') OR expires_at IS NULL)
      AND deleted_at IS NULL
  `).bind(userId).first();

  const emailStats = await env.DB.prepare(`...`).first();

  // ⚠️ 问题：只更新这三个字段
  await env.DB.prepare(`
    INSERT INTO user_statistics (
      user_id,
      active_mailboxes,
      total_emails,
      unread_emails,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      active_mailboxes = ?,
      total_emails = ?,
      unread_emails = ?,
      updated_at = datetime('now')
  `).bind(userId, ...).run();

  // 缺失：未更新 permanent_mailboxes 和 temporary_mailboxes
}
```

#### 影响分析

1. **统计数据只增不减**：
   - 用户创建 10 个临时邮箱 → `temporary_mailboxes = 10`
   - 邮箱自动过期 → 统计仍显示 `temporary_mailboxes = 10`
   - 实际活跃邮箱 = 0，但统计显��� = 10

2. **配额检查失败**：
   - 用户等级配额 = 10
   - 统计显示已用 = 10（实际已全部过期）
   - 创建新邮箱时配额检查：`10 >= 10` → ❌ **拒绝创建**

3. **用户体验问题**：
   - 用户无法创建新邮箱，但界面显示"配额已满"
   - 用户实际上没有任何活跃邮箱，却无法创建

4. **数据不一致加剧**：
   - 随着时间推移，统计偏差越来越大
   - 直到用户主动触发实时计算（如刷新配额页面），统计才会修正

#### 触发条件

- 用户创建了临时邮箱（非永久）
- 邮箱到期后，定时任务清理
- 清理后统计未正确更新

### 问题 2：增量更新可能累积误差

#### 问题描述

创建和删除邮箱时使用 **增量更新**（`+1` 或 `-1`），在以下场景可能导致统计不准确：

1. **并发操作**：
   - 线程 A：读取 `temporary_mailboxes = 10`
   - 线程 B：读取 `temporary_mailboxes = 10`
   - 线程 A：更新 `temporary_mailboxes = 11`
   - 线程 B：更新 `temporary_mailboxes = 11`（应该是 12）

2. **部分失败**：
   - 创建邮箱成功，但统计更新失败
   - 删除邮箱失败，但统计已更新

3. **操作回滚**：
   - 事务回滚了邮箱创建，但统计已更新

#### 影响

长期运行后，统计数据可能与实际不符。

### 问题 3：缺乏数据校验机制

系统没有定期校验机制，统计数据一旦不准确，只能依赖用户触发实时计算修正。

---

## 🔧 修复方案

### 方案 1：修复定时清理的统计更新（推荐）

#### 修改文件：`workers/api/src/services/cleanup.ts`

```typescript
async function updateUserStatistics(userId: number, env: Env): Promise<void> {
  // ========== 方案1：完整的实时统计（推荐） ==========
  const stats = await env.DB.prepare(`
    SELECT
      COUNT(CASE WHEN expires_at IS NULL THEN 1 END) as permanent_mailboxes,
      COUNT(CASE WHEN expires_at IS NOT NULL THEN 1 END) as temporary_mailboxes,
      COUNT(*) as total_mailboxes,
      COUNT(CASE WHEN (expires_at > datetime('now') OR expires_at IS NULL) THEN 1 END) as active_mailboxes
    FROM temp_emails
    WHERE user_id = ? AND deleted_at IS NULL
  `).bind(userId).first();

  const emailStats = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT e.id) as total,
      SUM(CASE WHEN e.is_read = 0 THEN 1 ELSE 0 END) as unread
    FROM temp_emails t
    LEFT JOIN emails e ON e.temp_email_id = t.id AND e.deleted_at IS NULL
    WHERE t.user_id = ? AND t.deleted_at IS NULL
  `).bind(userId).first();

  // ✅ 更新所有字段
  await env.DB.prepare(`
    INSERT INTO user_statistics (
      user_id,
      permanent_mailboxes,
      temporary_mailboxes,
      total_mailboxes,
      active_mailboxes,
      total_emails,
      unread_emails,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      permanent_mailboxes = excluded.permanent_mailboxes,
      temporary_mailboxes = excluded.temporary_mailboxes,
      total_mailboxes = excluded.total_mailboxes,
      active_mailboxes = excluded.active_mailboxes,
      total_emails = excluded.total_emails,
      unread_emails = excluded.unread_emails,
      updated_at = datetime('now')
  `).bind(
    userId,
    stats?.permanent_mailboxes || 0,
    stats?.temporary_mailboxes || 0,
    stats?.total_mailboxes || 0,
    stats?.active_mailboxes || 0,
    emailStats?.total || 0,
    emailStats?.unread || 0
  ).run();
}
```

#### 优点

- ✅ 完全修复统计不准确问题
- ✅ 逻辑清晰，易于维护
- ✅ 避免增量更新的累积误差

#### 缺点

- 每次清理需要执行 2 次统计查询（性能影响较小）

### 方案 2：统一使用全量重算

#### 修改文件：`workers/api/src/services/quotaService.ts`

将所有统计更新改为调用 `getUserMailboxStats()` 触发全量重算。

```typescript
// 原：增量更新
await updateUserMailboxStats(userId, isPermanent, true, db);

// 改：全量重算
await getUserMailboxStats(userId, db); // 内部会重算并更新
```

#### 优点

- ✅ 数据永远准确
- ✅ 代码逻辑统一

#### 缺点

- ❌ 每次创建/删除邮箱都需要统计查询（性能开销较大）
- ❌ 高并发下可能影响响应速度

### 方案 3：添加定期校验任务

#### 新增 Cron 任务

在 `wrangler.toml` 中添加每日校验任务：

```toml
[triggers]
crons = [
  "0 * * * *",        # 每小时 - 清理过期数据
  "0 2 * * *",        # 每日 - D1 备份到 R2
  "0 3 * * *"         # 每天凌晨3点 - 校验统计数据
]
```

#### 校验逻辑

```typescript
// workers/api/src/index.ts
async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  switch (event.cron) {
    case '0 3 * * *':  // 每天凌晨校验
      await validateAndFixStatistics(env);
      break;
  }
}

// 新增函数：校验并修复统计数据
async function validateAndFixStatistics(env: Env): Promise<void> {
  console.log('Starting statistics validation...');

  // 获取所有用户
  const users = await env.DB.prepare(`
    SELECT id FROM users WHERE deleted_at IS NULL
  `).all();

  for (const user of users.results) {
    try {
      // 触发全量重算
      await getUserMailboxStats(user.id as number, env.DB);
    } catch (error) {
      console.error(`Failed to validate stats for user ${user.id}:`, error);
    }
  }

  console.log(`Validated statistics for ${users.results.length} users`);
}
```

#### 优点

- ✅ 定期自动修正统计偏差
- ✅ 不影响正常业务逻辑
- ✅ 作为兜底保障

#### 缺点

- 需要增加定时任务（凌晨低峰期影响较小）

---

## 🧪 测试建议

### 测试场景 1：创建临时邮箱后统计正确

```bash
# 1. 创建临时邮箱
curl -X POST https://your-domain.com/api/mailbox/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "test123",
    "expires_in": 3600
  }'

# 2. 查询统计
curl -X GET https://your-domain.com/api/user/me \
  -H "Authorization: Bearer $TOKEN"

# 3. 验证
# 预期：temporary_mailboxes 增加 1
```

### 测试场景 2：删除临时邮箱后统计正确

```bash
# 1. 删除临时邮箱
curl -X DELETE https://your-domain.com/api/mailbox/test123@domain.com \
  -H "Authorization: Bearer $TOKEN"

# 2. 查询统计
curl -X GET https://your-domain.com/api/user/quota \
  -H "Authorization: Bearer $TOKEN"

# 3. 验证
# 预期：temporary_mailboxes 减少 1
```

### 测试场景 3：过期清理后统计正确（修复后）

```bash
# 1. 创建短期临时邮箱（10秒）
curl -X POST https://your-domain.com/api/mailbox/create \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "address": "short-test", "expires_in": 10 }'

# 2. 记录当前统计
curl -X GET https://your-domain.com/api/user/quota \
  -H "Authorization: Bearer $TOKEN"
# 输出示例：{ temporary: { used: 5, limit: 100 } }

# 3. 等待 15 秒（邮箱过期）

# 4. 手动触发清理（开发环境）
wrangler tail pmail-api --format pretty &
# 手动调用 scheduled 事件（需要模拟）

# 5. 再次查询统计
curl -X GET https://your-domain.com/api/user/quota \
  -H "Authorization: Bearer $TOKEN"
# 预期（修复后）：{ temporary: { used: 4, limit: 100 } }  # 减少了 1
# 预期（修复前）：{ temporary: { used: 5, limit: 100 } }  # 未变化 ⚠️
```

### 测试场景 4：无限配额正常工作

```bash
# 1. 升级用户到 premium 等级（temporary_mailbox_quota = -1）
# 通过管理后台或直接更新数据库

# 2. 创建大量临时邮箱（超过 100 个）
for i in {1..150}; do
  curl -X POST https://your-domain.com/api/mailbox/create \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"address\": \"test$i\", \"expires_in\": 3600}"
done

# 3. 查询统计
curl -X GET https://your-domain.com/api/user/quota \
  -H "Authorization: Bearer $TOKEN"

# 4. 验证
# 预期：
# {
#   "temporary": {
#     "used": 150,
#     "limit": -1,
#     "remaining": -1,
#     "unlimited": true
#   }
# }
```

### 数据库验证 SQL

```sql
-- 验证统计数据准确性
SELECT
  u.id as user_id,
  u.username,
  us.permanent_mailboxes as cached_permanent,
  us.temporary_mailboxes as cached_temporary,

  -- 实时统计
  (SELECT COUNT(*) FROM temp_emails
   WHERE user_id = u.id AND expires_at IS NULL AND deleted_at IS NULL) as actual_permanent,

  (SELECT COUNT(*) FROM temp_emails
   WHERE user_id = u.id AND expires_at IS NOT NULL AND deleted_at IS NULL) as actual_temporary,

  -- 差异
  us.permanent_mailboxes - (SELECT COUNT(*) FROM temp_emails
   WHERE user_id = u.id AND expires_at IS NULL AND deleted_at IS NULL) as permanent_diff,

  us.temporary_mailboxes - (SELECT COUNT(*) FROM temp_emails
   WHERE user_id = u.id AND expires_at IS NOT NULL AND deleted_at IS NULL) as temporary_diff

FROM users u
LEFT JOIN user_statistics us ON us.user_id = u.id
WHERE u.deleted_at IS NULL
ORDER BY temporary_diff DESC;

-- 如果 permanent_diff 或 temporary_diff 不为 0，说明统计不准确
```

---

## 📚 维护指南

### 日常维护检查清单

#### 每周检查

- [ ] 查看定时清理日志，确认正常执行
  ```bash
  wrangler tail pmail-api --format pretty | grep "cleanup"
  ```

- [ ] 检查统计数据准确性
  ```bash
  wrangler d1 execute temp-email-db --command="
    SELECT COUNT(*) as inconsistent_users FROM (
      SELECT u.id FROM users u
      LEFT JOIN user_statistics us ON us.user_id = u.id
      WHERE us.temporary_mailboxes != (
        SELECT COUNT(*) FROM temp_emails
        WHERE user_id = u.id AND expires_at IS NOT NULL AND deleted_at IS NULL
      )
    )
  "
  ```

#### 每月检查

- [ ] 验证配额检查逻辑正常
- [ ] 检查过期邮箱是否及时清理
- [ ] 审查用户反馈（配额相关）

### 常见问题排查

#### 问题：用户反馈无法创建邮箱，显示"配额已满"

**排查步骤**：

1. 查询用户统计：
   ```sql
   SELECT * FROM user_statistics WHERE user_id = ?
   ```

2. 查询实际邮箱数：
   ```sql
   SELECT
     COUNT(CASE WHEN expires_at IS NULL THEN 1 END) as permanent,
     COUNT(CASE WHEN expires_at IS NOT NULL THEN 1 END) as temporary
   FROM temp_emails
   WHERE user_id = ? AND deleted_at IS NULL
   ```

3. 对比统计与实际：
   - 如果不一致 → 统计数据失真
   - 解决：手动触发全量重算
     ```sql
     DELETE FROM user_statistics WHERE user_id = ?
     -- 下次查询时会自动重建
     ```

#### 问题：定时清理任务未执行

**排查步骤**：

1. 检查 Cron 配置：
   ```bash
   wrangler deployments list
   ```

2. 查看 Worker 日志：
   ```bash
   wrangler tail pmail-api
   ```

3. 手动触发清理（测试）：
   ```typescript
   // 在开发环境中模拟 scheduled 事件
   ```

### 代码修改注意事项

#### 修改统计逻辑时

- ✅ **必须**同时更新创建、删除、清理三个流程
- ✅ **必须**考虑游客邮箱（`user_id IS NULL`）的特殊处理
- ✅ **必须**保持 `permanent_mailboxes` + `temporary_mailboxes` = `total_mailboxes`
- ⚠️ 避免使用硬编码的字段名，使用变量（如 `isPermanent` 判断）

#### 修改配额逻辑时

- ✅ **必须**同时支持有限配额和无限配额（-1）
- ✅ **必须**检查用户等级是否过期（`tier_expires_at`）
- ✅ **必须**返回清晰的错误信息给前端

#### 添加新邮箱类型时

- 如果增加新的邮箱类型（例如"周期性邮箱"），需要：
  1. 更新 `temp_emails` 表结构（增加类型字段）
  2. 更新 `user_statistics` 表（增加对应统计字段）
  3. 更新所有统计查询 SQL
  4. 更新配额检查逻辑
  5. 更新前端显示

### 性能优化建议

#### 当前性能瓶颈

1. **实时统计查询**：
   - `getUserMailboxStats()` 在缓存未命中时需要扫描整个 `temp_emails` 表
   - ��化：确保 `user_id` 字段有索引

2. **定时清理批量操作**：
   - 当前 `LIMIT 100`，如果过期邮箱过多可能需要多次执行
   - 优化：考虑增加 limit 或使用批量删除

#### 索引建议

```sql
-- schema.sql 中应包含的索引
CREATE INDEX IF NOT EXISTS idx_temp_emails_user_id ON temp_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_temp_emails_expires_at ON temp_emails(expires_at);
CREATE INDEX IF NOT EXISTS idx_temp_emails_deleted_at ON temp_emails(deleted_at);

-- 组合索引（性能更好）
CREATE INDEX IF NOT EXISTS idx_temp_emails_user_expires_deleted
  ON temp_emails(user_id, expires_at, deleted_at);
```

---

## 📖 相关文档

- **数据库表结构**: [`../schema.sql`](../schema.sql)
- **API 与架构**: [`ARCHITECTURE_AND_API.md`](./ARCHITECTURE_AND_API.md)
- **上线检查清单（含安全整改）**: [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md)
- **部署与运维**: [`DEPLOYMENT.md`](./DEPLOYMENT.md)

---

## 📝 总结

### 核心要点

1. **区分标准**: `expires_at IS NOT NULL` = 临时邮箱
2. **统计来源**: `user_statistics.temporary_mailboxes`（缓存）+ 实时计算（兜底）
3. **更新时机**: 创建 +1，删除 -1，⚠️ 清理时不更新（问题）
4. **配额检查**: `limit !== -1 && current >= limit`（-1 = 无限）
5. **过期清理**: 每小时执行，软删除过期邮箱

### 最重要的问题

**定时清理不更新 `temporary_mailboxes` 计数**，导致统计数据只增不减，可能使用户无法创建新邮箱。

**推荐修复方案**: 在 `cleanup.ts:updateUserStatistics()` 中增加完整的实时统计查询，更新所有统计字段。

### 维护建议

1. ✅ 尽快应用修复方案 1
2. ✅ 添加每日统计校验任务（方案 3）
3. ✅ 在数据库中添加必要的索引
4. ✅ 定期检查统计数据准确性
5. ✅ 监控定时任务执行日志

---

**文档维护**：如有代码变更，请及时更新本文档。
