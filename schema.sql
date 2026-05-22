-- ==========================================
-- PMail Database Schema (Single Source of Truth)
-- ==========================================
-- Cloudflare D1 (SQLite)
--
-- This file IS the canonical schema. The project is pre-launch with no
-- backwards-compatibility burden (see CLAUDE.md), so schema changes are made
-- directly here — no incremental migration scripts.
--
-- IMPORTANT: When you edit this file, copy the full contents to
-- `workers/api/migrations/0001_init.sql` so `wrangler d1 migrations apply`
-- can provision fresh D1 databases. The two files must stay byte-identical.
-- ==========================================

-- ==========================================
-- 等级配置表（核心）
-- ==========================================
CREATE TABLE IF NOT EXISTS tier_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier_name TEXT NOT NULL UNIQUE,              -- 等级标识（如 'basic', 'vip1', 'premium'）
    display_name TEXT NOT NULL,                  -- 显示名称（如 '普通用户', 'VIP1', '优选用户'）
    sort_order INTEGER DEFAULT 0,                -- 排序权重（0=最低等级，越大等级越高）
    permanent_mailbox_quota INTEGER NOT NULL,    -- 永久邮箱配额
    temporary_mailbox_quota INTEGER DEFAULT -1,  -- 临时邮箱配额（-1 = 无限）
    is_active INTEGER DEFAULT 1,                 -- 是否启用（0 = 禁用, 1 = 启用）
    description TEXT,                            -- 等级描述（用于前端展示）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tier_configs_active ON tier_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_tier_configs_name ON tier_configs(tier_name);
CREATE INDEX IF NOT EXISTS idx_tier_configs_sort ON tier_configs(sort_order);

-- 初始化默认等级数据
INSERT OR IGNORE INTO tier_configs (id, tier_name, display_name, sort_order, permanent_mailbox_quota, temporary_mailbox_quota, description, is_active)
VALUES
  (1, 'basic', '普通用户', 0, 10, 100, '默认等级，适合个人轻度使用', 1),
  (2, 'premium', '优选用户', 10, 100, -1, '高级等级，无限临时邮箱，适合重度使用者', 1);

-- ==========================================
-- 用户表
-- 支持密码登录与 OAuth 登录（OAuth 用户 password_hash 为 NULL）
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,                                              -- 允许 NULL（OAuth 用户无密码）
    avatar_url TEXT,                                                 -- 用户头像 URL（OAuth 提供）
    oauth_provider TEXT,                                             -- OAuth 提供商（'linuxdo' 等）
    tier_id INTEGER DEFAULT 1,                                       -- 关联等级（外键指向 tier_configs）
    role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),       -- 用户角色
    tier_upgraded_at DATETIME,                                       -- 最后升级时间
    tier_expires_at DATETIME,                                        -- 等级过期时间（NULL = 永久）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME                                              -- 软删除时间戳（NULL = 未删除）
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier_id ON users(tier_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_tier_expires ON users(tier_expires_at);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_oauth_provider ON users(oauth_provider);

-- 更新时间触发器
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ==========================================
-- OAuth 账户绑定表
-- ==========================================
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,                     -- 关联的用户 ID
    provider TEXT NOT NULL,                       -- OAuth 提供商（'linuxdo'）
    provider_user_id TEXT NOT NULL,               -- 提供商的用户 ID
    provider_username TEXT,                       -- 提供商的用户名（可选）
    provider_email TEXT,                          -- 提供商的邮箱（可选）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(provider, provider_user_id)            -- 防止同一 OAuth 账号重复绑定
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_user_id ON oauth_accounts(provider, provider_user_id);

-- ==========================================
-- 临时邮箱表
-- 支持游客模式：user_id 可以为 NULL（游客邮箱）
-- 支持永不过期：expires_at 可以为 NULL（永久邮箱）
-- ==========================================
CREATE TABLE IF NOT EXISTS temp_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,                              -- 允许 NULL（游客邮箱）
    address TEXT NOT NULL UNIQUE,
    expires_at DATETIME,                          -- 允许 NULL（永不过期）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_temp_emails_user_id ON temp_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_temp_emails_address ON temp_emails(address);
CREATE INDEX IF NOT EXISTS idx_temp_emails_expires_at ON temp_emails(expires_at);

-- ==========================================
-- 邮件表
-- ==========================================
CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temp_email_id INTEGER NOT NULL,
    from_email TEXT NOT NULL,
    from_name TEXT,
    to_email TEXT NOT NULL,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    headers TEXT,                                 -- JSON 格式存储邮件头
    size_bytes INTEGER DEFAULT 0,
    raw_content TEXT,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read INTEGER DEFAULT 0,                    -- SQLite 使用 INTEGER 作为 BOOLEAN
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (temp_email_id) REFERENCES temp_emails(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_emails_temp_email_id ON emails(temp_email_id);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails(is_read);
CREATE INDEX IF NOT EXISTS idx_emails_from_email ON emails(from_email);
CREATE INDEX IF NOT EXISTS idx_emails_subject ON emails(subject);

-- ==========================================
-- 附件表
-- ==========================================
CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    r2_key TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL,
    content_type TEXT,
    checksum TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);
CREATE INDEX IF NOT EXISTS idx_attachments_r2_key ON attachments(r2_key);

-- ==========================================
-- API Key 表（用于北向 API 认证）
-- 支持多 API Keys：每个用户可创建多个 key，用于不同场景
-- ==========================================
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,                     -- 用户 ID（支持多 keys，user_id 无 UNIQUE 约束）
    name TEXT NOT NULL DEFAULT 'Default',         -- Key 名称（用户自定义）
    key_hash TEXT NOT NULL UNIQUE,                -- 存储 SHA-256 哈希值，不存储明文
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,                        -- 最后使用时间（自动更新）
    expires_at DATETIME,                          -- 过期时间（NULL = 永不过期）
    is_active INTEGER DEFAULT 1,                  -- 激活状态（0=禁用, 1=激活）
    permissions TEXT DEFAULT 'read,write',        -- 权限列表（逗号分隔：read, write）
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);

-- ==========================================
-- 用户统计表
-- ==========================================
CREATE TABLE IF NOT EXISTS user_statistics (
    user_id INTEGER PRIMARY KEY,
    total_mailboxes INTEGER DEFAULT 0,
    active_mailboxes INTEGER DEFAULT 0,
    permanent_mailboxes INTEGER DEFAULT 0,        -- 永久邮箱数量
    temporary_mailboxes INTEGER DEFAULT 0,        -- 临时邮箱数量
    total_emails INTEGER DEFAULT 0,
    unread_emails INTEGER DEFAULT 0,
    last_activity DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==========================================
-- 审计日志表
-- ==========================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip ON audit_logs(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ==========================================
-- 失败邮件表（记录处理失败的邮件）
-- ==========================================
CREATE TABLE IF NOT EXISTS failed_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    from_email TEXT,
    to_email TEXT,
    error_message TEXT,
    raw_content TEXT,
    failed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_failed_emails_failed_at ON failed_emails(failed_at);

-- ==========================================
-- 用户设置表（Webhook 等个性化配置）
-- ==========================================
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    default_mailbox_duration INTEGER DEFAULT 3600,
    notifications_enabled INTEGER DEFAULT 0,
    timezone TEXT DEFAULT 'UTC',
    webhook_enabled INTEGER DEFAULT 0,
    webhook_url TEXT,
    webhook_secret TEXT,
    forward_to TEXT,
    forward_verified INTEGER DEFAULT 0,
    forward_verified_at DATETIME,
    forward_cf_address_tag TEXT,
    forward_enabled INTEGER DEFAULT 1,
    forward_last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- ==========================================
-- 附件下载日志表
-- ==========================================
CREATE TABLE IF NOT EXISTS attachment_downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attachment_id INTEGER NOT NULL,
    user_id INTEGER,
    downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attachment_downloads_attachment_id ON attachment_downloads(attachment_id);
CREATE INDEX IF NOT EXISTS idx_attachment_downloads_user_id ON attachment_downloads(user_id);

-- ==========================================
-- 限流表（Rate Limiting）
-- 日级限流持久化，分钟级限流走进程内 Map
-- ==========================================
CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);

-- ==========================================
-- 登录失败锁定表（防暴力破解）
-- ==========================================
CREATE TABLE IF NOT EXISTS login_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,                     -- IP 地址或用户名
    type TEXT NOT NULL,                           -- 'ip' 或 'username'
    failure_count INTEGER DEFAULT 0,              -- 失败次数
    locked_until DATETIME,                        -- 锁定到期时间（NULL = 未锁定）
    last_attempt DATETIME,                        -- 最后一次尝试时间
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_failures_identifier ON login_failures(identifier, type);
CREATE INDEX IF NOT EXISTS idx_login_failures_locked ON login_failures(locked_until);
CREATE INDEX IF NOT EXISTS idx_login_failures_last_attempt ON login_failures(last_attempt);

-- ==========================================
-- 兑换码表（支持时效等级：永久/天/月）
-- ==========================================
CREATE TABLE IF NOT EXISTS redemption_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,                                                              -- 兑换码（唯一）
    tier_id INTEGER NOT NULL,                                                               -- 兑换后的等级 ID
    duration_type TEXT DEFAULT 'permanent' CHECK(duration_type IN ('permanent', 'days', 'months')),
    duration_value INTEGER,                                                                 -- 时效数值（permanent 时为 NULL）
    max_uses INTEGER DEFAULT 1,                                                             -- 最大使用次数（-1 = 无限）
    used_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_by INTEGER,                                                                     -- 创建者（管理员用户 ID）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,                                                                    -- 兑换码本身的过期时间
    note TEXT,
    FOREIGN KEY (tier_id) REFERENCES tier_configs(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_redemption_codes_code ON redemption_codes(code);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_tier_id ON redemption_codes(tier_id);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_active ON redemption_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_expires ON redemption_codes(expires_at);

-- ==========================================
-- 兑换历史表
-- ==========================================
CREATE TABLE IF NOT EXISTS redemption_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code_id INTEGER NOT NULL,
    tier_id INTEGER NOT NULL,                     -- 兑换后的等级 ID（快照）
    tier_expires_at DATETIME,                     -- 等级过期时间（快照）
    redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (code_id) REFERENCES redemption_codes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_redemption_history_user ON redemption_history(user_id);
CREATE INDEX IF NOT EXISTS idx_redemption_history_code ON redemption_history(code_id);
CREATE INDEX IF NOT EXISTS idx_redemption_history_redeemed ON redemption_history(redeemed_at);

-- 防止同一用户重复使用同一兑换码
CREATE UNIQUE INDEX IF NOT EXISTS idx_redemption_unique ON redemption_history(code_id, user_id);

-- ==========================================
-- 系统设置表（动态配置：注册开关 / OAuth 开关等）
-- ==========================================
CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    setting_type TEXT DEFAULT 'boolean',          -- 'string', 'number', 'boolean', 'json'
    category TEXT NOT NULL,                       -- 'auth', 'oauth', 'system'
    display_name TEXT NOT NULL,
    description TEXT,
    is_public INTEGER DEFAULT 0,                  -- 0 = 仅管理员可见, 1 = 公开可见
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);

INSERT OR IGNORE INTO system_settings (setting_key, setting_value, setting_type, category, display_name, description, is_public)
VALUES
  ('registration_enabled', 'true', 'boolean', 'auth', '允许用户注册', '是否允许新用户通过邮箱注册账号', 1),
  ('password_login_enabled', 'true', 'boolean', 'auth', '允许密码登录', '是否允许用户使用用户名/邮箱+密码登录', 1),
  ('oauth_linuxdo_enabled', 'true', 'boolean', 'oauth', '允许 Linux.do OAuth', '是否启用 Linux.do 第三方登录', 1);

CREATE TRIGGER IF NOT EXISTS update_system_settings_timestamp
AFTER UPDATE ON system_settings
BEGIN
    UPDATE system_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ==========================================
-- 公告表
-- ==========================================
CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'markdown' CHECK(content_type IN ('markdown', 'plain')),
    is_pinned INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON announcements(is_pinned DESC, priority DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_deleted ON announcements(deleted_at);

-- 公告已读记录表
CREATE TABLE IF NOT EXISTS announcement_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    announcement_id INTEGER NOT NULL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_announcement_reads_unique ON announcement_reads(user_id, announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON announcement_reads(user_id);

-- ==========================================
-- 域名配置表（多域名邮箱支持）
-- ==========================================
CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL UNIQUE,                  -- 域名（如 your-domain.com）
    display_name TEXT,                            -- 显示名称
    is_active INTEGER DEFAULT 1,                  -- 是否启用
    is_default INTEGER DEFAULT 0,                 -- 是否为默认域名
    sort_order INTEGER DEFAULT 0,                 -- 排序权重（越小越靠前）
    description TEXT,
    mx_verified INTEGER DEFAULT 0,                -- MX 记录是否已验证（保留字段）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domains_active ON domains(is_active);
CREATE INDEX IF NOT EXISTS idx_domains_default ON domains(is_default);
CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
CREATE INDEX IF NOT EXISTS idx_domains_sort ON domains(sort_order);

CREATE TRIGGER IF NOT EXISTS update_domains_timestamp
AFTER UPDATE ON domains
BEGIN
    UPDATE domains SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- 确保只有一个默认域名（更新时）
CREATE TRIGGER IF NOT EXISTS ensure_single_default_domain
AFTER UPDATE ON domains
WHEN NEW.is_default = 1 AND OLD.is_default = 0
BEGIN
    UPDATE domains SET is_default = 0 WHERE is_default = 1 AND id != NEW.id;
END;

-- 确保只有一个默认域名（插入时）
CREATE TRIGGER IF NOT EXISTS ensure_single_default_domain_insert
AFTER INSERT ON domains
WHEN NEW.is_default = 1
BEGIN
    UPDATE domains SET is_default = 0 WHERE is_default = 1 AND id != NEW.id;
END;
