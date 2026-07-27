#!/bin/bash
# benchmark.sh — Pipeline stage timing benchmarks.
# Runs the pipeline multiple times and reports timing statistics.
# Usage: bash scripts/benchmark.sh [iterations=5]
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ITERATIONS="${1:-5}"
TMP_REPO=$(mktemp -d /tmp/vestara-benchmark-XXXXX)

echo "=== Pipeline Benchmark ==="
echo "Repository: $ROOT"
echo "Iterations: $ITERATIONS"
echo ""

# Create a temporary copy of the workspace source for a controlled test
# We'll measure pipeline stages on the actual vestara-ai-core repo
# since that's the most realistic benchmark

cleanup() {
  rm -rf "$TMP_REPO"
}
trap cleanup EXIT

# Build a small benchmark project
mkdir -p "$TMP_REPO/packages/a/src" "$TMP_REPO/packages/b/src" "$TMP_REPO/packages/c/src"
cat > "$TMP_REPO/package.json" << 'JSON'
{ "name": "benchmark", "private": true, "dependencies": { "react": "^19" } }
JSON
echo "packages:" > "$TMP_REPO/pnpm-workspace.yaml"
echo "  - packages/*" >> "$TMP_REPO/pnpm-workspace.yaml"
cat > "$TMP_REPO/packages/a/package.json" << 'JSON'
{ "name": "@bench/a", "dependencies": { "@bench/b": "^1.0" } }
JSON
cat > "$TMP_REPO/packages/b/package.json" << 'JSON'
{ "name": "@bench/b", "dependencies": { "@bench/c": "^1.0" } }
JSON
cat > "$TMP_REPO/packages/c/package.json" << 'JSON'
{ "name": "@bench/c", "dependencies": {} }
JSON
echo 'export const a = 1;' > "$TMP_REPO/packages/a/src/index.ts"
echo 'export const b = 1;' > "$TMP_REPO/packages/b/src/index.ts"
echo 'export const c = 1;' > "$TMP_REPO/packages/c/src/index.ts"
echo '# Benchmark' > "$TMP_REPO/README.md"

# Collect results
echo "Stage,Min,Max,Avg,Median" > "$TMP_REPO/results.csv"

bench_stage() {
  local stage=$1
  local cmd=$2
  local times=()

  for i in $(seq 1 $ITERATIONS); do
    local start=$(date +%s%N)
    eval "$cmd" >/dev/null 2>&1
    local end=$(date +%s%N)
    local elapsed_ms=$(( (end - start) / 1000000 ))
    times+=($elapsed_ms)
  done

  # Sort for median
  IFS=$'\n' sorted=($(sort -n <<<"${times[*]}")); unset IFS

  local min=${sorted[0]}
  local max=${sorted[-1]}
  local total=0
  for t in "${times[@]}"; do total=$((total + t)); done
  local avg=$((total / ITERATIONS))
  local median=${sorted[$((ITERATIONS / 2))]}

  echo "$stage,$min,$max,$avg,$median" >> "$TMP_REPO/results.csv"
  printf "  %-20s  min=%4dms  max=%4dms  avg=%4dms  median=%4dms\n" "$stage" "$min" "$max" "$avg" "$median"
}

# Run benchmarks using node to import the real modules
echo ""
echo "--- Pipeline Stages ---"

bench_stage "Discover" "cd $ROOT && node -e '
const { RepositoryDiscovery } = require(\"./packages/workspace/dist/repository-discovery.js\");
RepositoryDiscovery.discover(\"$TMP_REPO\").then(() => process.exit(0));
'"

bench_stage "Fingerprint" "cd $ROOT && node -e '
const { createFingerprint } = require(\"./packages/workspace/dist/repository-fingerprint.js\");
createFingerprint(\"$TMP_REPO\").then(() => process.exit(0));
'"

bench_stage "Analyze" "cd $ROOT && node -e '
const { RepositoryIntelligence } = require(\"./packages/workspace/dist/repository-intelligence.js\");
const { RepositoryDiscovery } = require(\"./packages/workspace/dist/repository-discovery.js\");
RepositoryDiscovery.discover(\"$TMP_REPO\").then((d) => RepositoryIntelligence.analyze(d.files, \"$TMP_REPO\")).then(() => process.exit(0));
'"

bench_stage "Present" "cd $ROOT && node -e '
const { RepositoryIntelligence } = require(\"./packages/workspace/dist/repository-intelligence.js\");
const { RepositoryPresenter } = require(\"./packages/workspace/dist/repository-presenter.js\");
const { RepositoryDiscovery } = require(\"./packages/workspace/dist/repository-discovery.js\");
RepositoryDiscovery.discover(\"$TMP_REPO\").then((d) => RepositoryIntelligence.analyze(d.files, \"$TMP_REPO\")).then(async (p) => {
  const pres = new RepositoryPresenter();
  await pres.present(p, { documentsIndexed: 0, chunksCreated: 0, duration: 0 });
}).then(() => process.exit(0));
'"

echo ""
echo "--- Results ---"
column -t -s, "$TMP_REPO/results.csv" | head -10
echo ""
