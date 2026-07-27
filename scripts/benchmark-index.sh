#!/bin/bash
# benchmark-index.sh — Benchmark knowledge engine indexing throughput.
# Usage: bash scripts/benchmark-index.sh [iterations=3]
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ITERATIONS="${1:-3}"
TMP_REPO=$(mktemp -d /tmp/vestara-bench-index-XXXXX)

cleanup() { rm -rf "$TMP_REPO"; }
trap cleanup EXIT

echo "=== Knowledge Indexing Benchmark ==="
echo "Iterations: $ITERATIONS"
echo ""

# Build a test repo with N files
N=50
mkdir -p "$TMP_REPO/src"
cat > "$TMP_REPO/package.json" << 'JSON'
{ "name": "bench", "private": true }
JSON

echo "Generating $N test files..."
for i in $(seq 1 $N); do
  cat > "$TMP_REPO/src/file${i}.ts" << EOF
import { helper } from './helper';
export function fn${i}(): string {
  return helper(${i});
}
EOF
done
cat > "$TMP_REPO/src/helper.ts" << 'EOF'
export function helper(n: number): string {
  return `result-${n}`;
}
EOF

# Build workspace first
bash "$ROOT/build-order.sh" 2>&1 | tail -1

echo ""
echo "--- Indexing benchmarks ---"

for iter in $(seq 1 $ITERATIONS); do
  echo ""
  echo "Iteration $iter:"
  
  # Run the indexing via node
  node -e "
  const path = require('path');
  
  (async () => {
    const { DefaultKnowledgeEngine, KnowledgeStorage } = require('${ROOT}/packages/knowledge/dist/index.js');
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs.default();
    const db = new SQL.Database();
    const storage = new KnowledgeStorage(db);
    const engine = new DefaultKnowledgeEngine({ storage });
    
    const start = performance.now();
    const report = await engine.index('${TMP_REPO}');
    const elapsed = Math.round(performance.now() - start);
    
    console.log('  Files:       ' + report.documentsIndexed);
    console.log('  Chunks:      ' + report.chunksCreated);
    console.log('  Duration:    ' + elapsed + 'ms');
    console.log('  Throughput:  ' + Math.round(report.documentsIndexed / (elapsed / 1000)) + ' files/sec');
    
    // Clean up for next iteration
    const db2 = new SQL.Database();
    engine.storage = new (require('${ROOT}/packages/knowledge/dist/index.js').KnowledgeStorage)(db2);
  })().catch(e => { console.error(e); process.exit(1); });
  "
done

echo ""
echo "--- Done ---"
