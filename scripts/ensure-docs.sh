#!/bin/bash
# ensure-docs.sh — Fill standard documentation gaps across all packages.
# Idempotent: never overwrites existing files, only creates missing ones.
# Usage: bash scripts/ensure-docs.sh [--force]
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORCE="${1:-}"

CREATED=0
SKIPPED=0

create() {
  local file="$1" content="$2"
  if [ -f "$file" ] && [ "$FORCE" != "--force" ]; then
    echo "  ⏭️  exists: $(basename "$(dirname "$file")")/$(basename "$file")"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  mkdir -p "$(dirname "$file")"
  echo "$content" > "$file"
  echo "  ✅ created: $(basename "$(dirname "$file")")/$(basename "$file")"
  CREATED=$((CREATED + 1))
}

update_json() {
  local pkg_dir="$1" field="$2" value="$3"
  local json="$pkg_dir/package.json"
  [ -f "$json" ] || return
  if grep -q "\"$field\":" "$json" 2>/dev/null; then
    echo "  ⏭️  $field already set in $(basename "$pkg_dir")/package.json"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  # Insert field after "name" (first field in every package.json)
  # Using sed to avoid json parsing issues; assumes simple package.json format
  local tmp
  tmp=$(mktemp)
  awk -v f="\"$field\": \"$value\"," '/"name":/{print; print f; next}1' "$json" > "$tmp"
  mv "$tmp" "$json"
  echo "  ✅ set $field in $(basename "$pkg_dir")/package.json"
  CREATED=$((CREATED + 1))
}

# Enumerate all workspace packages
all_packages() {
  for dir in "$ROOT"/packages/*/ "$ROOT"/packages/providers/*/ "$ROOT"/packages/tools/*/ "$ROOT"/apps/*/; do
    [ -f "$dir/package.json" ] && echo "${dir%/}"
  done
}

echo "=== Vestara Standard Documentation ==="
echo ""

# ── Root README ────────────────────────────────────────────────────────────
create "$ROOT/README.md" "\
# Vestara AI Core

AI-native engineering platform — runtime kernel and product services.

## Quick start

\`\`\`bash
pnpm install
bash build-order.sh
pnpm vestara doctor
\`\`\`

See [docs/](docs/) for capability specifications, UX specs, architecture docs,
and milestone tracking.

## Workspace

| Directory | Role |
|-----------|------|
| \`apps/api/\` | HTTP+WS gateway for Workspace UI |
| \`apps/cli/\` | CLI and REPL entry point |
| \`apps/workspace/\` | React 19 + Vite UI shell |
| \`packages/*\` | Runtime libraries (pnpm workspaces) |
| \`docs/\` | PCS, UX, ATS, milestones, decisions |
"

# ── Package descriptions and READMEs ──────────────────────────────────────
# Mapping of package name (directory basename with prefix) to description
declare -A DESCRIPTIONS
DESCRIPTIONS=(
  ["shared"]="Zero-dependency public contract types and interfaces"
  ["configuration"]="Configuration loader and file-based config source"
  ["logger"]="Structured JSON logger with levels and transports"
  ["metrics"]="Counters, gauges histograms for runtime observability"
  ["event-bus"]="In-process pub/sub event bus with wildcard pattern matching"
  ["service-registry"]="Topological service registry using Kahn's algorithm"
  ["health"]="Aggregate health checks for runtime components"
  ["permission"]="Role-based permission engine for tool and agent execution"
  ["stream"]="Canonical streaming types and StreamProcessor"
  ["provider-runtime"]="AI provider lifecycle manager load/unload/health"
  ["opencode"]="OpenCode AI provider with SSE streaming"
  ["context"]="Context assembler with system prompt and message window"
  ["memory"]="Four-layer memory: working episodic semantic long-term"
  ["cognitive"]="Five-stage cognitive pipeline: perception through action"
  ["knowledge"]="Full-text search knowledge engine with language detection"
  ["reasoning"]="Eight reasoning strategies from fast response to deep analysis"
  ["action"]="Permission-gated tool execution runtime"
  ["state-runtime"]="SQLite persistence layer via sql.js WASM"
  ["conversation"]="Conversation service with in-memory message store"
  ["filesystem"]="Safe file read/write tool with path traversal protection"
  ["workspace"]="Workspace runtime pipeline and product services"
  ["kernel"]="Ten-step boot sequence and service initialization"
  ["events"]="Workspace event type definitions"
  ["events-server"]="Event streaming server for workspace signals"
  ["os-controller"]="OS integration: systemd desktop and service management"
  ["api"]="HTTP and WebSocket gateway for the Workspace UI"
  ["cli"]="CLI entry point REPL and demo commands"
  ["workspace-ui"]="React 19 + Vite 6 + Tailwind CSS workspace shell"
  ["tools-shell"]="Shell execution tool (stub)"
  ["tools-memory"]="Memory graph query tool (stub)"
  ["tools-knowledge"]="Knowledge search tool (stub)"
  ["tools-project"]="Project analysis tool (stub)"
)

# Folder-based package list for README generation
declare -A PACKAGE_ROLES
PACKAGE_ROLES=(
  ["shared"]="public"
  ["api"]="app"
  ["cli"]="app"
  ["workspace-ui"]="app"
)

while IFS= read -r pkg_dir; do
  pkg_name=$(basename "$pkg_dir")
  pkg_json="$pkg_dir/package.json"

  # Derive package key: if under providers/ or tools/, prefix the name
  parent_dir=$(basename "$(dirname "$pkg_dir")")
  if [ "$parent_dir" = "providers" ]; then
    key="${pkg_name}"
  elif [ "$parent_dir" = "tools" ]; then
    key="tools-${pkg_name}"
  else
    key="$pkg_name"
  fi

  desc="${DESCRIPTIONS[$key]:-}"

  # Set description in package.json if missing
  if [ -n "$desc" ]; then
    update_json "$pkg_dir" "description" "$desc"
  fi

  # Generate README.md if missing
  npmpkg=$(grep '"name":' "$pkg_json" 2>/dev/null | head -1 | sed 's/.*"name": "*\([^"]*\)".*/\1/')
  deps=$(grep -A100 '"dependencies":' "$pkg_json" 2>/dev/null | grep '"@vestara/' | sed 's/.*"\(.*\)":.*/\1/' | tr '\n' ' ' | sed 's/  */ /g' || true)
  role="${PACKAGE_ROLES[$key]:-library}"

  readme_content="# ${npmpkg:-$pkg_name}"
  [ -n "$desc" ] && readme_content="${readme_content}

${desc}."
  readme_content="${readme_content}

## Usage

Import via workspace reference:

\`\`\`
pnpm --filter @vestara/${key} build
\`\`\`"
  [ -n "$deps" ] && readme_content="${readme_content}

## Dependencies

\`${deps}\`"
  readme_content="${readme_content}

See [docs/](../docs/) for capability specifications and architecture.
"

  create "$pkg_dir/README.md" "$readme_content"

done < <(all_packages)

echo ""
echo "=== Summary ==="
echo "Created: $CREATED"
echo "Skipped: $SKIPPED"
