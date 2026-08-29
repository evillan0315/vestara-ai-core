#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Checking staged files with Biome..."
pnpm exec biome check --staged --diagnostic-level=error

echo "Running regression tests..."
pnpm test
