#!/usr/bin/env bash
set -Eeuo pipefail

# Compile the Vestara TUI into platform-specific standalone Bun executables and
# emit a checksums manifest. The produced artifacts are consumed by the
# Marketplace package builder; users never need a global Bun runtime.
#
# Usage: scripts/compile-tui.sh [--targets linux-x64,linux-arm64]
#   VESTARA_TUI_PACKAGE_VERSION overrides the embedded version.

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PKG_DIR="$ROOT/packages/tui"
SRC="$PKG_DIR/src/index.tsx"
OUT_DIR="${VESTARA_TUI_OUTPUT:-$PKG_DIR/dist/bin}"
VERSION="${VESTARA_TUI_PACKAGE_VERSION:-0.1.0}"

TARGETS="${VESTARA_TUI_TARGETS:-linux-x64,linux-arm64,darwin-x64,darwin-arm64,win32-x64}"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required to compile the TUI executables" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
: > "$OUT_DIR/checksums.json"

printf '{\n  "version": "%s",\n  "artifacts": {\n' "$VERSION" > "$OUT_DIR/checksums.json"

first=1
IFS=',' read -ra TARGET_LIST <<< "$TARGETS"
for target in "${TARGET_LIST[@]}"; do
  case "$target" in
    win32-x64) suffix=".exe" ;;
    *) suffix="" ;;
  esac
  outfile="$OUT_DIR/vestara-tui-${target}${suffix}"
  echo "compiling $target -> $outfile"
  (cd "$PKG_DIR" && bun build "$SRC" --compile --target="bun-$target" --outfile="$outfile")
  chmod +x "$outfile"
  checksum=$(sha256sum "$outfile" | cut -d' ' -f1)
  if [ "$first" -eq 0 ]; then printf ',\n' >> "$OUT_DIR/checksums.json"; fi
  printf '    "%s": {"path": "bin/vestara-tui-%s%s", "sha256": "%s"}' \
    "$target" "$target" "$suffix" "$checksum" >> "$OUT_DIR/checksums.json"
  first=0
done

printf '\n  }\n}\n' >> "$OUT_DIR/checksums.json"
echo "checksums -> $OUT_DIR/checksums.json"
echo "artifacts:"
ls -la "$OUT_DIR"
