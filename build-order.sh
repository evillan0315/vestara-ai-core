#!/bin/bash
# Compatibility entrypoint. The dependency graph now comes from workspace manifests.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

pnpm build:references
