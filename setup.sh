#!/usr/bin/env bash
# PMail 资源初始化脚本
#
# 此脚本已被 scripts/bootstrap.mjs 取代——bootstrap.mjs 是幂等的、支持
# dry-run、能自动渲染 wrangler.toml / .env，无需 sed 替换占位符。
#
# 此 wrapper 保留是为了向后兼容文档与肌肉记忆。它会：
#   1. 转发到 node scripts/bootstrap.mjs（传递所有 CLI 参数）
#   2. 提示后续步骤
#
# 用法：bash setup.sh [bootstrap 参数]
#   示例：bash setup.sh --dry-run
#         bash setup.sh --name-suffix=staging

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v node >/dev/null 2>&1 || {
  echo -e "${RED}✗${NC} node 未安装" >&2
  exit 1
}

echo -e "${YELLOW}▸${NC} 运行 scripts/bootstrap.mjs（创建 Cloudflare 资源 + 渲染 wrangler.toml / .env）"
node "$REPO_ROOT/scripts/bootstrap.mjs" "$@"

cat <<EOF

${GREEN}✓${NC} 资源初始化完成。下一步：

  1. 设置 worker secrets（按需）：
       cd workers/api  && wrangler secret put DATABASE_ENCRYPTION_KEY
       cd workers/api  && wrangler secret put TURNSTILE_SECRET_KEY
       cd workers/api  && wrangler secret put OAUTH_LINUXDO_CLIENT_SECRET
       cd workers/email && wrangler secret put DATABASE_ENCRYPTION_KEY

  2. 在 Cloudflare Dashboard 配置 Email Routing（catch-all → pmail-email-receiver）

  3. 部署：
       bash deploy.sh

EOF
