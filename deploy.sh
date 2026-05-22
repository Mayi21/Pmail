#!/usr/bin/env bash
# PMail 本地部署脚本
#
# 用途：将代码从本机推送到 Cloudflare（D1 migration → 3 个 wrangler deploy）。
# 这是 .github/workflows/deploy.yml 的本地等价版本，命令完全一致。
#
# 前置条件（顺序）：
#   1. wrangler login          # 一次性，本机授权
#   2. cp .env.example .env    # 填入 DOMAIN / ALLOWED_ORIGINS / PAGES_PROJECT_NAME 等
#   3. node scripts/bootstrap.mjs
#        - 创建 D1 / R2 / KV / Queues
#        - 渲染 workers/api/wrangler.toml 和 workers/email/wrangler.toml
#   4. cd workers/api && wrangler secret put DATABASE_ENCRYPTION_KEY
#      cd workers/api && wrangler secret put TURNSTILE_SECRET_KEY
#      cd workers/api && wrangler secret put OAUTH_LINUXDO_CLIENT_SECRET
#      cd workers/email && wrangler secret put DATABASE_ENCRYPTION_KEY
#      （SENDGRID_API_KEY 等可选 secret 按需）
#
# 用法：bash deploy.sh

set -euo pipefail

# ---- 颜色 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${YELLOW}▸${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
fatal() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# ---- 前置检查 ----
command -v node    >/dev/null 2>&1 || fatal "node 未安装"
command -v npm     >/dev/null 2>&1 || fatal "npm 未安装"
command -v npx     >/dev/null 2>&1 || fatal "npx 未安装"
command -v curl    >/dev/null 2>&1 || fatal "curl 未安装（用于健康检查）"

# 读取 .env（如果存在），用于本地默认值
if [ -f "$REPO_ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$REPO_ROOT/.env"; set +a
fi

# 数据库名（统一为 pmail-db；可通过 .env 的 D1_DATABASE_NAME 覆盖）
D1_DATABASE_NAME="${D1_DATABASE_NAME:-pmail-db}"

# Pages 项目名（与 package.json 的 web 名一致；可通过 .env 覆盖）
PAGES_PROJECT_NAME="${PAGES_PROJECT_NAME:-pmail-web}"

# wrangler.toml 必须已由 bootstrap.mjs 渲染
for f in workers/api/wrangler.toml workers/email/wrangler.toml; do
  [ -f "$REPO_ROOT/$f" ] || fatal "缺少 $f — 先运行: node scripts/bootstrap.mjs"
done
ok "wrangler.toml 检查通过"

# ---- 安装依赖 ----
install_deps() {
  local dir=$1
  info "安装依赖：$dir"
  (cd "$REPO_ROOT/$dir" && npm ci)
}
install_deps workers/api
install_deps workers/email
install_deps web

# ---- D1 migration（使用 wrangler 原生 migrations 子命令）----
info "应用 D1 migration → $D1_DATABASE_NAME (--remote)"
(cd "$REPO_ROOT/workers/api" && npx wrangler d1 migrations apply "$D1_DATABASE_NAME" --remote)
ok "migration 完成"

# ---- 部署 API Worker ----
info "部署 API Worker"
(cd "$REPO_ROOT/workers/api" && npx wrangler deploy)
ok "API Worker 部署完成"

# ---- 部署 Email Worker ----
info "部署 Email Worker"
(cd "$REPO_ROOT/workers/email" && npx wrangler deploy)
ok "Email Worker 部署完成"

# ---- 构建 + 部署前端 ----
info "构建前端"
(cd "$REPO_ROOT/web" && npm run build)

info "部署 Cloudflare Pages → $PAGES_PROJECT_NAME"
(cd "$REPO_ROOT/web" && npx wrangler pages deploy dist --project-name="$PAGES_PROJECT_NAME" --branch=main)
ok "前端部署完成"

# ---- 健康检查（可选）----
if [ -n "${API_URL:-}" ]; then
  info "健康检查 → ${API_URL}/health"
  if curl -fsS --retry 5 --retry-delay 5 --retry-connrefused "${API_URL}/health" >/dev/null; then
    ok "健康检查通过"
  else
    echo -e "${YELLOW}⚠${NC} 健康检查失败（非致命，可能 DNS 尚未传播）"
  fi
else
  echo -e "${YELLOW}⚠${NC} 未设置 API_URL，跳过健康检查（在 .env 中设置以启用）"
fi

echo
ok "部署完成"
echo "下一步："
echo "  - 在 Cloudflare Dashboard 配置 Email Routing（catch-all → pmail-email-receiver）"
echo "  - 在 Cloudflare Dashboard 绑定自定义域名（可选）"
