#!/usr/bin/env node
/**
 * Design-token utility guard (VES-DESIGN-009).
 *
 * Closes the bug class that produced a silent regression in b6e4ba1: Tailwind v4
 * shorthand utilities require the leading `--` (`bg-(--vestara-accent-bg)`). A
 * prefix-less form (`bg-(accent-bg)`) is not an error to Tailwind — it simply
 * emits NO RULE, so the element silently loses its background/border/colour.
 * 42 sites shipped that way and nothing caught it: jsdom tests never evaluate
 * CSS, `vds:validate` checks token existence rather than utility validity,
 * and apps/workspace is excluded from Biome.
 *
 * Two checks:
 *   1. STATIC (always) — prefix-less `-(...)` shorthand inside a class
 *      attribute, and `--vestara-*` references that no workspace stylesheet
 *      defines.
 *   2. COMPILED (when a build exists) — every token utility actually used
 *      appears in the emitted CSS. Matched variant-aware: the class
 *      `focus-visible:bg-(--x)/40` compiles to `.focus-visible\:bg-\(--x\)\/40:focus-visible`,
 *      so the probe strips variants/modifiers and matches the escaped core
 *      anywhere in the stylesheet. An exact-selector probe silently produces
 *      false negatives here.
 *
 * Only class attributes are scanned. Raw source text is not: a regex literal
 * such as `language-([\w+-]+)` is not a utility, and app-local custom
 * properties (--files-*, --ov-*, …) are out of scope for the token contract.
 *
 * Usage: node scripts/check-token-utilities.mjs [--no-compiled]
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const core = resolve(import.meta.dirname, '..');
const appSrc = join(core, 'apps/workspace/src');
const distDir = join(core, 'apps/workspace/dist/assets');

const checkCompiled = !process.argv.includes('--no-compiled');
const errors = [];
const findings = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** Every stylesheet in the app — token definitions live in `.tokens.css` and
 *  co-located `*.css` files too, not only under `src/styles/`. */
function walkCss(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkCss(full, out);
    else if (full.endsWith('.css')) out.push(full);
  }
  return out;
}

/** Pull every `className=` / `class=` value, handling `"`, `'`, and `{…}`. */
function classAttributes(src) {
  const values = [];
  const trigger = /(?:className|class)\s*=\s*/g;
  let match;
  while ((match = trigger.exec(src)) !== null) {
    const i = match.index + match[0].length;
    const open = src[i];
    if (open === '"' || open === "'") {
      const end = src.indexOf(open, i + 1);
      if (end === -1) continue;
      values.push(src.slice(i + 1, end));
      trigger.lastIndex = end;
    } else if (open === '{') {
      let depth = 0;
      let j = i;
      for (; j < src.length; j += 1) {
        if (src[j] === '{') depth += 1;
        else if (src[j] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      values.push(src.slice(i + 1, j));
      trigger.lastIndex = j;
    }
  }
  return values;
}

// ── 1. Every custom property the workspace defines ───────────────────────────
const defined = new Set();
if (existsSync(appSrc)) {
  for (const file of walkCss(appSrc)) {
    const css = readFileSync(file, 'utf8');
    for (const match of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(match[1]);
  }
}

// ── 2. Scan class attributes ─────────────────────────────────────────────────
const files = existsSync(appSrc) ? walk(appSrc) : [];

// `bg-(...)` — Tailwind v4 shorthand. Anything not starting with `--` is broken.
const SHORTHAND = /(?<![\w-])([a-z][a-z0-9-]*)-\((?!-)([^()\s]+)\)/g;
// Near-misses that also emit no CSS. Found live: `bg-((--x))` (doubled parens)
// and `border(--x)` (missing the hyphen separator). Both read as valid at a
// glance and neither tripped the prefix check above.
const DOUBLE_PAREN = /(?<![\w-])([a-z][a-z0-9-]*)\(\((--[a-zA-Z0-9-]+)\)\)/g;
const NO_HYPHEN = /(?<![-\w])([a-z][a-z0-9-]*[a-z0-9])\((--[a-zA-Z0-9-]+)\)/g;
// `var(--x)`, `color-mix(…)` and friends look exactly like `border(--x)` to the
// check above. Excluded by name rather than by shape, since no shape rule
// separates a CSS function from a malformed utility.
const CSS_FUNCTIONS = new Set([
  'var',
  'env',
  'attr',
  'url',
  'calc',
  'clamp',
  'min',
  'max',
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'oklch',
  'oklab',
  'lab',
  'lch',
  'color',
  'color-mix',
  'theme',
  'image-set',
  'repeat',
  'minmax',
  'linear-gradient',
  'radial-gradient',
  'conic-gradient',
  'translate',
  'scale',
  'rotate',
]);
// `bg-[var(--x)]` — the verbose form.
const BRACKET_VAR = /-\[var\((--[a-zA-Z0-9-]+)\)\]/g;
// `(--name)` inside a shorthand.
const SHORTHAND_VAR = /--([a-zA-Z0-9-]+)\)/g;
// A token utility, for the compiled check — BOTH the shorthand `bg-(--x)` and
// the verbose `bg-[var(--x)]` form, since only checking one lets a wrong probe
// pass itself.
const TOKEN_UTILITY = /(?<![\w-])([a-z][a-zA-Z0-9:./-]*(?:-\(--[a-zA-Z0-9-]+\)|-\[var\(--[a-zA-Z0-9-]+\)\]))/g;

/** Escape a class name into the selector form Tailwind emits. */
function escapeSelector(cls) {
  return cls.replace(/[[\]()./]/g, (c) => `\\${c}`);
}

const usedUtilities = new Set();

for (const file of files) {
  const rel = relative(core, file);
  for (const value of classAttributes(readFileSync(file, 'utf8'))) {
    for (const match of value.matchAll(SHORTHAND)) {
      errors.push(`${rel}: \`${match[1]}-(${match[2]})\` lacks the \`--\` prefix — Tailwind emits no rule for it`);
    }
    for (const match of value.matchAll(DOUBLE_PAREN)) {
      if (CSS_FUNCTIONS.has(match[1])) continue;
      errors.push(
        `${rel}: \`${match[1]}((${match[2]}))\` has doubled parentheses — expected \`${match[1]}-(${match[2]})\``,
      );
    }
    for (const match of value.matchAll(NO_HYPHEN)) {
      if (CSS_FUNCTIONS.has(match[1])) continue;
      errors.push(
        `${rel}: \`${match[1]}(${match[2]})\` is missing the \`-\` separator — expected \`${match[1]}-(${match[2]})\``,
      );
    }
    for (const match of value.matchAll(BRACKET_VAR)) {
      if (match[1].startsWith('--vestara-') && !defined.has(match[1])) {
        errors.push(`${rel}: \`var(${match[1]})\` is not defined by any workspace stylesheet`);
      }
    }
    for (const match of value.matchAll(SHORTHAND_VAR)) {
      const name = `--${match[1]}`;
      if (name.startsWith('--vestara-') && !defined.has(name)) {
        errors.push(`${rel}: \`${name}\` is referenced but not defined`);
      }
    }
    for (const match of value.matchAll(TOKEN_UTILITY)) usedUtilities.add(match[1]);
  }
}

// ── 3. COMPILED — assert the used utilities actually produced CSS ────────────
const cssFile = existsSync(distDir)
  ? readdirSync(distDir)
      .filter((f) => f.startsWith('index-') && f.endsWith('.css'))
      .sort()
      .pop()
  : undefined;

if (checkCompiled && cssFile) {
  const css = readFileSync(join(distDir, cssFile), 'utf8');
  for (const utility of usedUtilities) {
    // Strip variants (`focus-visible:`) and modifiers (`/40`) — the compiled
    // selector keeps them escaped, so probe the escaped core with no leading
    // dot: a variant-prefixed selector reads `.hover\:text-\(--x\):hover`, so
    // requiring `.text-\(--x\)` would miss it every time.
    const base = utility.includes(':') ? utility.slice(utility.lastIndexOf(':') + 1) : utility;
    const escaped = escapeSelector(base.replace(/\/\d+$/, ''));
    if (!css.includes(escaped)) findings.push(`no emitted rule for \`${utility}\` (probed \`${escaped}\`)`);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(
  `token utilities: ${files.length} files · ${usedUtilities.size} token utilities · ${defined.size} defined properties` +
    `${checkCompiled && cssFile ? ` · compiled against ${cssFile}` : ' · compiled check skipped'}`,
);

if (errors.length || findings.length) {
  console.error(`\nDesign-token utility check FAILED (${errors.length + findings.length})`);
  for (const error of errors) console.error(`  - ${error}`);
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exitCode = 1;
} else {
  console.log('Design-token utility check passed');
}
