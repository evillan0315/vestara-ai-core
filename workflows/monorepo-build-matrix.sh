#!/bin/bash
# Marketplace Monorepo Build Matrix — builds every app and package in
# apps/ and packages/ (including packages/providers/* and packages/tools/*).
#
# Source of truth for the target list:
#   workflows/monorepo-build-matrix.workflow.json  (.targets[] -> dir/name/kind)
#
# Usage:
#   bash workflows/monorepo-build-matrix.sh --list      # show all apps + packages
#   bash workflows/monorepo-build-matrix.sh --dry-run   # print build plan only
#   bash workflows/monorepo-build-matrix.sh --build     # full topological build
#   bash workflows/monorepo-build-matrix.sh --verify    # boundaries + artifacts
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# The workflow matrix ships next to this script in both layouts: the repo
# (workflows/) and the installed Marketplace package.
WORKFLOW_JSON="$HERE/monorepo-build-matrix.workflow.json"

# Resolve the monorepo root. In the repo layout the script lives in
# <repo>/workflows/; an installed Marketplace copy points back via $VESTARA_REPO.
if [ -d "$HERE/../apps" ] && [ -f "$WORKFLOW_JSON" ]; then
  ROOT="$(cd "$HERE/.." && pwd)"
elif [ -n "${VESTARA_REPO:-}" ] && [ -d "$VESTARA_REPO/apps" ]; then
  ROOT="$(cd "$VESTARA_REPO" && pwd)"
else
  echo "error: cannot locate the vestara-ai-core checkout." >&2
  echo "Run from the repo, or set VESTARA_REPO to the checkout path." >&2
  exit 1
fi
cd "$ROOT"
if [ ! -f "$WORKFLOW_JSON" ]; then
  echo "error: workflow matrix not found: $WORKFLOW_JSON" >&2
  exit 1
fi

list_targets() {
  node -e "
const wf = require('$WORKFLOW_JSON');
for (const t of wf.targets) console.log(t.kind + '\t' + t.dir + '\t' + t.name);
"
}

count_targets() {
  node -e "console.log(require('$WORKFLOW_JSON').targets.length)"
}

cmd_list() {
  printf 'kind\tdir\tpackage\n'
  list_targets
  printf '\nTotal: %s build targets (%s apps, %s packages/providers/tools)\n' \
    "$(count_targets)" \
    "$(node -e "console.log(require('$WORKFLOW_JSON').targets.filter(t=>t.kind==='app').length)")" \
    "$(node -e "console.log(require('$WORKFLOW_JSON').targets.filter(t=>t.kind!=='app').length)")"
}

cmd_dry_run() {
  echo "== Marketplace Monorepo Build Matrix — plan =="
  echo "Targets: $(count_targets) ($(node -e "console.log(require('$WORKFLOW_JSON').targets.filter(t=>t.kind==='app').length)") apps + $(node -e "console.log(require('$WORKFLOW_JSON').targets.filter(t=>t.kind!=='app').length)") packages/providers/tools)"
  echo ""
  echo "1. pnpm install --frozen-lockfile"
  echo "2. pnpm build:references   (regenerate tsconfig project references)"
  echo "3. pnpm -r --workspace-concurrency=4 run build   (topological order)"
  echo "   NOTE: @vestara/workspace-ui is excluded from the monorepo build"
  echo "   (scripts/workspace-architecture.mjs) — build it separately:"
  echo "   pnpm --filter @vestara/workspace-ui build"
  echo "4. pnpm dependencies:check && pnpm check:source-artifacts"
  echo "5. pnpm lint:check"
  echo ""
  echo "-- Full target matrix --"
  cmd_list
}

cmd_build() {
  echo "==> [1/4] pnpm install --frozen-lockfile"
  pnpm install --frozen-lockfile
  echo "==> [2/4] pnpm build:references"
  pnpm build:references
  echo "==> [3/4] pnpm -r topological build (all apps + packages)"
  # -r walks every workspace in topological order, covering apps/*,
  # packages/*, packages/providers/* and packages/tools/*.
  pnpm -r --workspace-concurrency=4 run build
  echo "==> [4/4] workspace-ui (excluded from monorepo build — build separately)"
  pnpm --filter @vestara/workspace-ui build
  echo "Build matrix complete: $(count_targets) targets."
}

cmd_verify() {
  pnpm dependencies:check
  pnpm check:source-artifacts
  pnpm lint:check
}

case "${1:---dry-run}" in
  --list) cmd_list ;;
  --dry-run) cmd_dry_run ;;
  --build) cmd_build ;;
  --verify) cmd_verify ;;
  *) echo "Usage: $0 [--list|--dry-run|--build|--verify]" >&2; exit 1 ;;
esac
