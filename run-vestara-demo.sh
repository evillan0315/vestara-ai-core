#!/usr/bin/env bash
set -euo pipefail

REPO="/media/eddie/LIVE_PERSIST/rw/home/user/projects/vestara-ai-core"
cd "$REPO"

set -a
. "$REPO/.env"
set +a

export VESTARA_REPO="$REPO"
export VESTARA_API_PORT="${VESTARA_API_PORT:-3001}"
export NODE_OPTIONS="--max-old-space-size=1536"

echo "Starting Vestara API from $REPO on 127.0.0.1:${VESTARA_API_PORT}"
echo "Wait for: [api] listening on http://127.0.0.1:${VESTARA_API_PORT}"
echo

exec node apps/api/dist/index.js
