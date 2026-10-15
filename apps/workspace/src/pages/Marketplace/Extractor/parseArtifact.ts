/**
 * VESTARA Extractor — client-side artifact parser (Phase 1.1).
 *
 * Registry-driven mapping: bundle `var XX=` declarations that match
 * `componentRegistry.js` become real library entries (verified name, props,
 * description). Unknown vars (vendored React internals, helpers) are
 * counted as `unmappedVarCount` — never guessed into components.
 *
 * Also detects framework versions (React, Tailwind) and extracts the
 * `:root` custom-property block as the token source.
 *
 * Pure functions only — identical in browser and vitest. Phase 2 upgrades
 * the clean-view reconstruction to a real AST; this contract stays.
 */

import { COMPONENT_REGISTRY } from './componentRegistry.js';
import { extractSignature } from './propSignature.js';
import type { ExtractedComponent, ExtractedProp, ExtractionResult, ExtractorFileNode } from './types.js';

const STYLE_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;
const MODULE_SCRIPT_RE = /<script[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi;
const VAR_DECL_RE = /var\s+([A-Za-z_$][\w$]*)\s*=/g;
const ROOT_VARS_RE = /:root\{[^}]*\}/g;
const REACT_VERSION_RE = /\.version="(\d+\.\d+\.\d+(?:-next-[A-Za-z0-9-]+)?)"/;
const TAILWIND_VERSION_RE = /tailwindcss v(\d+\.\d+\.\d+)/;
const MAX_VARS = 500;
const MAX_TOKENS_CHARS = 8192;
const SNIPPET_CHARS = 240;

function kib(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / 1024));
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function extractBlocks(html: string, re: RegExp): string[] {
  const out: string[] = [];
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (match[1] !== undefined) out.push(match[1]);
  }
  return out;
}

function uniqueVarNames(scripts: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const script of scripts) {
    VAR_DECL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = VAR_DECL_RE.exec(script)) !== null && seen.size < MAX_VARS) {
      const name = match[1];
      if (name && !seen.has(name)) seen.add(name);
    }
    if (seen.size >= MAX_VARS) break;
  }
  return [...seen];
}

function hasOwn(registry: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(registry, key);
}

function snippetFor(script: string, varName: string): string {
  const idx = script.indexOf(`var ${varName}=`);
  if (idx < 0) return `var ${varName}=/* declared in bundle */`;
  return script.slice(idx, Math.min(script.length, idx + SNIPPET_CHARS));
}

function extractTokensCss(styles: readonly string[]): string {
  const roots: string[] = [];
  for (const style of styles) {
    const matches = style.match(ROOT_VARS_RE);
    if (matches) roots.push(...matches);
  }
  if (roots.length > 0) return roots.join('\n').slice(0, MAX_TOKENS_CHARS);
  return styles.join('\n').slice(0, 2048);
}

/**
 * Parse a single-file React artifact into an extraction result.
 * Never throws for malformed input — returns an empty-component result.
 */
export function parseArtifactHtml(html: string): ExtractionResult {
  const source = typeof html === 'string' ? html : '';
  const styles = extractBlocks(source, STYLE_RE);
  const scripts = extractBlocks(source, MODULE_SCRIPT_RE);
  const tokensCss = extractTokensCss(styles);
  const bundleSource = scripts[0] ?? '';

  const allVars = uniqueVarNames(scripts);
  const knownVars = allVars.filter((v) => hasOwn(COMPONENT_REGISTRY, v));

  const components: ExtractedComponent[] = [];
  for (const varName of knownVars) {
    const reg = COMPONENT_REGISTRY[varName];
    if (!reg) continue;
    // acorn pass: confirm/extend registry props from the real signature.
    // Failures fall back to registry props — extraction never throws.
    let props: readonly ExtractedProp[] = reg.props;
    try {
      const sig = extractSignature(bundleSource, varName);
      if (sig) {
        const merged: ExtractedProp[] = reg.props.map((p) => {
          const hit = sig.find((s) => s.name === p.name);
          if (hit?.defaultSource && (p.defaultValue === '—' || p.defaultValue === '')) {
            return { ...p, defaultValue: hit.defaultSource };
          }
          return p;
        });
        const known = new Set(reg.props.map((p) => p.name));
        for (const s of sig) {
          if (!known.has(s.name)) {
            merged.push({
              name: s.name,
              type: 'unknown',
              defaultValue: s.defaultSource ?? '—',
              description: 'Detected in bundle signature.',
            });
          }
        }
        props = merged;
      }
    } catch {
      props = reg.props;
    }
    const propNames = props.map((p) => p.name).join(', ');
    components.push({
      id: reg.file.replace(/\.tsx$/, '').toLowerCase(),
      varName,
      name: reg.name,
      description: reg.description,
      file: reg.file,
      category: reg.category,
      sizeKb: 1,
      source: {
        original: snippetFor(bundleSource, varName),
        clean: [
          `// ${reg.name} (${varName}) — extracted TypeScript component.`,
          `import type { ReactNode } from 'react';`,
          ``,
          `export interface ${reg.name}Props {`,
          ...reg.props.map((p) => `  ${p.name}?: ${p.type};`),
          `}`,
          ``,
          `export function ${reg.name}(props: ${reg.name}Props): ReactNode {`,
          `  return null;`,
          `}`,
        ].join('\n'),
      },
      props,
      dependencies: [],
    });
  }

  const reactMatch = REACT_VERSION_RE.exec(bundleSource);
  const tailwindMatch = TAILWIND_VERSION_RE.exec(styles.join('\n'));
  const frameworks = {
    react: reactMatch?.[1] ?? null,
    tailwind: tailwindMatch?.[1] ?? null,
  };

  const bundleKb = kib(byteLength(source));
  const cssKb = styles.length === 0 ? 0 : kib(byteLength(styles.join('\n')));
  const fileTree: ExtractorFileNode[] = [
    {
      path: 'components/',
      name: 'components/',
      kind: 'dir',
      children: components.map((c) => ({ path: `components/${c.file}`, name: c.file, kind: 'file' as const })),
    },
    { path: 'tokens.css', name: 'tokens.css', kind: 'file' },
    { path: 'manifest.json', name: 'manifest.json', kind: 'file' },
  ];

  return {
    bundleKb,
    cssKb,
    componentCount: components.length,
    varNames: knownVars,
    unmappedVarCount: allVars.length - knownVars.length,
    frameworks,
    tokensCss,
    manifestJson: JSON.stringify(
      {
        name: 'vestara-artifact',
        bundleKb,
        cssKb,
        componentCount: components.length,
        frameworks,
        status: components.length > 0 ? 'parsed' : 'empty',
      },
      null,
      2,
    ),
    fileTree,
    components,
  };
}
