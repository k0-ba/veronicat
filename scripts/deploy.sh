#!/usr/bin/env bash
# Build and (only when asked) push to Cloudflare (Workers static assets — the successor
# of Pages; config in wrangler.jsonc). No server code, just dist/.
#
#   ./scripts/deploy.sh            # build + check, then stop — look at it first
#   ./scripts/deploy.sh --deploy   # the same, then wrangler deploy
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOY=0
[[ "${1:-}" == "--deploy" ]] && DEPLOY=1

# A gitignored API token beats `wrangler login` (OAuth sessions expire mid-deploy).
if [[ -f .env.cloudflare ]]; then set -a; . ./.env.cloudflare; set +a; fi

echo "==> build"
npm run build

# Pages refuses any single file over 25 MiB. If models ever get that big, shard them
# (see the cloudflare-static-3d notes) — don't find out at upload time.
LIMIT=$((25 * 1024 * 1024))
OVER=$(find dist -type f -size +${LIMIT}c | head -5)
if [[ -n "$OVER" ]]; then echo "!!! over the 25 MiB per-file cap:" >&2; echo "$OVER" >&2; exit 1; fi
echo "    $(du -sh dist | cut -f1), $(find dist -type f | wc -l | tr -d ' ') files"

if [[ $DEPLOY -eq 0 ]]; then
  echo
  echo "==> dist/ built, NOT deployed. Check it:  npm run preview  → http://localhost:4181/"
  echo "    then:  ./scripts/deploy.sh --deploy"
  exit 0
fi

npx --yes wrangler@4 deploy
echo
echo "==> https://veronicat.holoesthesia.workers.dev/"
