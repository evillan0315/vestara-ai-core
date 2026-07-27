#!/bin/bash
# milestone-status.sh — Audit codebase state against milestone definitions.
# Usage: bash scripts/milestone-status.sh [milestone]
#   If milestone is omitted, checks the latest planned milestone.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
TOTAL=0

pass() { PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); echo "  ❌ $1"; }
skip() { TOTAL=$((TOTAL + 1)); echo "  ⏭️  $1"; }
check() {
  local label="$1" cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then pass "$label"; else fail "$label"; fi
}

echo "=== Vestara Milestone Status Report ==="
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Root: $ROOT"
echo ""

# ── v3.0 — Quality Infrastructure ──────────────────────────────────────────
echo "--- v3.0 — Quality Infrastructure ---"

# .gitignore
check ".gitignore exists at vestara-ai-core root" "test -f '$ROOT/.gitignore'"

# CI/CD
check "CI workflow exists (.github/workflows/ci.yml)" "test -f '$ROOT/.github/workflows/ci.yml'"

# Linter / formatter
check "Linter config present (biome.json or .eslintrc*)" \
  "ls '$ROOT/biome.json' '$ROOT/.eslintrc.yml' '$ROOT/.eslintrc.json' '$ROOT/.eslintrc.js' 2>/dev/null | head -1 | grep -q ."
check "Formatter config present (.prettierrc* or biome.json)" \
  "ls '$ROOT/.prettierrc' '$ROOT/.prettierrc.json' '$ROOT/.prettierrc.yml' '$ROOT/biome.json' 2>/dev/null | head -1 | grep -q ."

# pnpm test passes (dry-run: just check the command exists)
check "'pnpm test' script is defined" "grep -q '\"test\":' '$ROOT/package.json'"

# Enumerate all workspace packages (matches pnpm workspace globs: packages/*, packages/providers/*, apps/*)
all_packages() {
  for dir in "$ROOT"/packages/*/ "$ROOT"/packages/providers/*/ "$ROOT"/packages/tools/*/ "$ROOT"/apps/*/; do
    [ -f "$dir/package.json" ] && echo "$dir"
  done
}

# Per-package test coverage
UNTESTED_PKGS=()
while IFS= read -r pkg; do
  name=$(basename "$pkg")
  # skip empty placeholder dirs (no src/)
  [ -d "$pkg/src" ] || continue
  if [ -d "$pkg/__tests__" ] && ls "$pkg/__tests__/"*.test.ts >/dev/null 2>&1; then
    : # has tests
  else
    UNTESTED_PKGS+=("$name")
  fi
done < <(all_packages)
if [ ${#UNTESTED_PKGS[@]} -eq 0 ]; then
  pass "All live packages have tests"
else
  fail "Untested packages: ${UNTESTED_PKGS[*]}"
fi

# Per-package test scripts
MISSING_SCRIPTS=()
while IFS= read -r pkg; do
  name=$(basename "$pkg")
  [ -d "$pkg/__tests__" ] || continue
  if grep -q '"test":' "$pkg/package.json" 2>/dev/null; then
    : # has test script
  else
    MISSING_SCRIPTS+=("$name")
  fi
done < <(all_packages)
if [ ${#MISSING_SCRIPTS[@]} -eq 0 ]; then
  pass "All packages with tests have a 'test' script"
else
  fail "Packages missing 'test' script: ${MISSING_SCRIPTS[*]}"
fi

# Stale compiled artifacts in __tests__ dirs
STALE=$(find "$ROOT/packages" "$ROOT/apps" -path '*/__tests__/*.js' -not -path '*/node_modules/*' 2>/dev/null | head -10)
if [ -z "$STALE" ]; then
  pass "No stale compiled artifacts in __tests__ directories"
else
  fail "Stale compiled artifacts found in __tests__ dirs (run: git clean or delete them)"
fi

# Stale vitest.config.js at root
if [ -f "$ROOT/vitest.config.js" ] && [ -f "$ROOT/vitest.config.ts" ]; then
  fail "Stale vitest.config.js / .d.ts / .js.map present alongside vitest.config.ts"
else
  pass "No stale vitest.config.js at root"
fi

# Empty placeholder test dirs
if [ -d "$ROOT/tests/integration" ] && [ -z "$(ls -A "$ROOT/tests/integration" 2>/dev/null)" ]; then
  fail "tests/integration/ is empty (populate or remove)"
else
  pass "tests/integration/ is not empty or removed"
fi
if [ -d "$ROOT/tests/performance" ] && [ -z "$(ls -A "$ROOT/tests/performance" 2>/dev/null)" ]; then
  fail "tests/performance/ is empty (populate or remove)"
else
  pass "tests/performance/ is not empty or removed"
fi

# vitest dep declared per package where used
MISSING_VITEST_DEPS=()
while IFS= read -r pkg; do
  name=$(basename "$pkg")
  [ -d "$pkg/__tests__" ] || continue
  if grep -q '"vitest"' "$pkg/package.json" 2>/dev/null; then
    : # has explicit vitest dep
  else
    MISSING_VITEST_DEPS+=("$name")
  fi
done < <(all_packages)
if [ ${#MISSING_VITEST_DEPS[@]} -eq 0 ]; then
  pass "All packages with tests declare vitest in devDependencies"
else
  fail "Packages missing explicit vitest dep: ${MISSING_VITEST_DEPS[*]}"
fi

# IMPLEMENTATION_STATUS.md is up to date (basic check — doesn't claim "No test files exist")
if grep -qi "no test files" "$ROOT/docs/IMPLEMENTATION_STATUS.md" 2>/dev/null; then
  fail "IMPLEMENTATION_STATUS.md still claims 'No test files exist'"
else
  pass "IMPLEMENTATION_STATUS.md does not contain stale 'No test files' claim"
fi
# Check it mentions events-server and os-controller
if grep -q "events-server" "$ROOT/docs/IMPLEMENTATION_STATUS.md" 2>/dev/null && \
   grep -q "os-controller" "$ROOT/docs/IMPLEMENTATION_STATUS.md" 2>/dev/null; then
  pass "IMPLEMENTATION_STATUS.md mentions events-server and os-controller"
else
  fail "IMPLEMENTATION_STATUS.md missing events-server or os-controller"
fi

# git status after build (simulate: just check no unexpected root-level detritus)
if [ -f "$ROOT/tsconfig.tsbuildinfo" ]; then
  pass "tsconfig.tsbuildinfo present (expected build artifact)"
else
  skip "tsconfig.tsbuildinfo not checked (run pnpm build first)"
fi

# ── v8.0 — Runtime Model ─────────────────────────────────────────────
echo "--- v8.0 — Runtime Model ---"

check "ADR-023 documented (Runtime Model)" "grep -q 'ADR-023' '$ROOT/../vestara-blueprint/00-governance/04-decision-log.md' 2>/dev/null || grep -q 'ADR-023' '$ROOT/docs/architecture/ADR-023.md' 2>/dev/null"
check "ADR-024 documented (Job Model)" "grep -q 'ADR-024' '$ROOT/../vestara-blueprint/00-governance/04-decision-log.md' 2>/dev/null"
check "ADR-025 documented (Worker Model)" "grep -q 'ADR-025' '$ROOT/../vestara-blueprint/00-governance/04-decision-log.md' 2>/dev/null"
check "ADR-026 documented (Intent Model)" "grep -q 'ADR-026' '$ROOT/../vestara-blueprint/00-governance/04-decision-log.md' 2>/dev/null"
check "ADR-027 documented (Ownership & Locking)" "grep -q 'ADR-027' '$ROOT/../vestara-blueprint/00-governance/04-decision-log.md' 2>/dev/null"
check "ADR-028 documented (Verification & Trust)" "grep -q 'ADR-028' '$ROOT/../vestara-blueprint/00-governance/04-decision-log.md' 2>/dev/null"
check "ADR-029 documented (Recovery & Failure Budget)" "grep -q 'ADR-029' '$ROOT/../vestara-blueprint/00-governance/04-decision-log.md' 2>/dev/null"
check "ADR-030 documented (Kernel Architecture)" "grep -q 'ADR-030' '$ROOT/../vestara-blueprint/00-governance/04-decision-log.md' 2>/dev/null"
check "Blueprint v2.0 (07 updated)" "grep -q 'version: .2.0.0' '$ROOT/../vestara-blueprint/00-governance/07-ai-operating-system-architecture.md' 2>/dev/null"
check "@vestara/subsystem package exists" "test -d '$ROOT/packages/subsystem/src'"
check "@vestara/subsystem builds" "ls '$ROOT/packages/subsystem/dist/index.js' 2>/dev/null | grep -q ."
check "@vestara/widget-runtime package exists" "test -d '$ROOT/packages/widget-runtime/src'"
check "@vestara/widget-runtime builds" "ls '$ROOT/packages/widget-runtime/dist/index.js' 2>/dev/null | grep -q ."
check "Recovery Manager in kernel" "grep -q 'class DefaultRecoveryManager' '$ROOT/packages/kernel/src/recovery-manager.ts' 2>/dev/null"
check "Scheduler in kernel" "grep -q 'class DefaultScheduler' '$ROOT/packages/kernel/src/scheduler.ts' 2>/dev/null"

echo ""
echo "=== Summary ==="
echo "Total checks: $TOTAL"
echo "Passed:       $PASS"
echo "Failed:       $FAIL"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "All milestone checks pass."
else
  echo "$FAIL checks still failing."
  exit 1
fi
