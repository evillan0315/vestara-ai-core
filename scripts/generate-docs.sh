#!/bin/bash
# generate-docs.sh — Generate API documentation from TypeScript sources.
# Usage: bash scripts/generate-docs.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Generating API documentation ==="

# Ensure output dir exists
mkdir -p docs/api

# Discover every live package entrypoint. The checked-in TypeDoc options hold
# presentation policy; executable package coverage comes from the workspace.
mapfile -t ENTRY_POINTS < <(find packages -mindepth 3 -maxdepth 4 -path '*/src/index.ts' -not -path '*/dist/*' | sort)
if [ ${#ENTRY_POINTS[@]} -eq 0 ]; then
  echo "No package entrypoints found" >&2
  exit 1
fi
npx typedoc --options typedoc.json "${ENTRY_POINTS[@]}" 2>&1 | tail -5
echo "Documented ${#ENTRY_POINTS[@]} package entrypoints"

# Generate package dependency summary
echo ""
echo "=== Package dependency summary ==="
node -e "
const fs = require('fs');
const path = require('path');
const dirs = fs.readdirSync('packages');
const pkgs = [];
for (const dir of dirs) {
  const fp = path.join('packages', dir, 'package.json');
  if (fs.existsSync(fp)) {
    const pkg = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    pkgs.push({
      name: pkg.name || dir,
      version: pkg.version || '0.0.0',
      description: pkg.description || '(no description)',
      deps: Object.keys(pkg.dependencies || {}).filter(d => d.startsWith('@vestara/')).length,
    });
  }
}
// Also check providers and tools
for (const sub of ['providers', 'tools']) {
  const base = path.join('packages', sub);
  if (!fs.existsSync(base)) continue;
  for (const dir of fs.readdirSync(base)) {
    const fp = path.join(base, dir, 'package.json');
    if (fs.existsSync(fp)) {
      const pkg = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      pkgs.push({
        name: pkg.name || dir,
        version: pkg.version || '0.0.0',
        description: pkg.description || '(no description)',
        deps: Object.keys(pkg.dependencies || {}).filter(d => d.startsWith('@vestara/')).length,
      });
    }
  }
}
pkgs.sort((a, b) => a.name.localeCompare(b.name));
const md = [
  '# Package Catalog',
  '',
  '| Package | Version | Description | Internal Deps |',
  '|---------|---------|-------------|--------------|',
];
for (const p of pkgs) {
  md.push('| ' + [p.name, p.version, p.description, p.deps].join(' | ') + ' |');
}
md.push('');
fs.writeFileSync('docs/api/PACKAGE_CATALOG.md', md.join('\n'));
console.log('Package catalog written to docs/api/PACKAGE_CATALOG.md');
"

echo ""
echo "=== Documentation generated ==="
echo "API docs: docs/api/index.html"
echo "Catalog:  docs/api/PACKAGE_CATALOG.md"
