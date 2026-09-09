#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Checking staged files with Biome..."
pnpm exec biome check --staged --diagnostic-level=error

echo "Selecting regression tests from staged files..."
STAGED="$(git diff --cached --name-only)"

if [ -z "$STAGED" ]; then
  echo "No staged files — skipping tests."
  exit 0
fi

# Config-level changes can affect any suite: run the fast suite.
if echo "$STAGED" | grep -Eq '^(vitest\.config\.ts|apps/workspace/vitest\.setup\.ts|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig[^/]*\.json|scripts/|tests/)'; then
  echo "Config-level change detected — running fast suite..."
  # shellcheck disable=SC2086
  exec pnpm test:fast -- --maxWorkers=${VITEST_MAX_WORKERS:-2}
fi

# Changed test files run exactly; other staged files run their owning
# package/app suite. Nested providers/tools roots must match before the
# top-level packages/ alternative.
TEST_FILES="$(echo "$STAGED" | grep -E '\.test\.[jt]sx?$' || true)"
ROOTS="$(echo "$STAGED" | grep -Eo '^(packages/(providers|tools)/[^/]+|packages/[^/]+|apps/[^/]+)' | sort -u || true)"
RUNNABLE="$TEST_FILES"
for root in $ROOTS; do
  if [ -d "$root/__tests__" ]; then
    RUNNABLE="$RUNNABLE $root"
  fi
done
RUNNABLE="$(echo "$RUNNABLE" | tr ' ' '\n' | sort -u | tr '\n' ' ')"

if [ -z "${RUNNABLE// /}" ]; then
  echo "No test-bearing packages touched — skipping tests."
  exit 0
fi

echo "Building (incremental) so dist/ aliases are fresh..."
pnpm build

echo "Running scoped tests:$RUNNABLE"
# shellcheck disable=SC2086
exec node_modules/.bin/vitest run $RUNNABLE --maxWorkers=${VITEST_MAX_WORKERS:-2}
