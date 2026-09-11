/**
 * VES-DESIGN-003A: Canonical CSS Generator
 *
 * Generates the canonical CSS artifact from DARK_THEME and LIGHT_THEME.
 * Output is a deterministic CSS file that becomes the single source of
 * truth for all Vestara design token values at runtime.
 *
 * Usage:
 *   npx tsx packages/ui-tokens/src/generate.ts
 *
 * Output:
 *   apps/workspace/src/styles/generated-tokens.css
 *
 * Architecture Traceability:
 *   VES-DESIGN-003A: Canonical Token Runtime Wiring Correction
 *   @see docs/architecture/VES-DESIGN-002-CANONICAL-TOKEN-CONTRACT.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCSSVariables } from './css.js';
import { DARK_THEME, LIGHT_THEME } from './themes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_STYLES = path.resolve(HERE, '../../../apps/workspace/src/styles');
const OUTPUT_FILE = path.join(WORKSPACE_STYLES, 'generated-tokens.css');

// ─── Generation ──────────────────────────────────────────────

function generateCanonicalCSS(): string {
  const darkVars = generateCSSVariables(DARK_THEME);
  const lightVars = generateCSSVariables(LIGHT_THEME);

  // Sort keys for deterministic output
  const darkLines = Object.entries(darkVars)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');

  const lightLines = Object.entries(lightVars)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');

  return `/**
 * VES-DESIGN-003A: Canonical Design Tokens (GENERATED)
 *
 * This file is AUTO-GENERATED from @vestara/ui-tokens.
 * Do NOT edit manually. Regenerate with:
 *   npx tsx packages/ui-tokens/src/generate.ts
 *
 * Source of truth: packages/ui-tokens/src/themes.ts
 */

/* ── Canonical dark appearance (default) ── */
:root {
${darkLines}
}

/* ── Canonical light appearance ── */
[data-theme="light"] {
${lightLines}
}
`;
}

// ─── Main ─────────────────────────────────────────────────────

function main() {
  const css = generateCanonicalCSS();

  // Ensure output directory exists
  fs.mkdirSync(WORKSPACE_STYLES, { recursive: true });

  // Write generated artifact
  fs.writeFileSync(OUTPUT_FILE, css, 'utf-8');

  console.log(`[ui-tokens] Generated canonical CSS → ${OUTPUT_FILE}`);
  console.log(`[ui-tokens] Dark tokens: ${Object.keys(generateCSSVariables(DARK_THEME)).length} variables`);
  console.log(`[ui-tokens] Light tokens: ${Object.keys(generateCSSVariables(LIGHT_THEME)).length} variables`);
}

main();
