/**
 * VESTARA Extractor — bundle signature reader (Phase 2).
 *
 * Uses acorn to read the destructured props out of a minified component
 * head such as:
 *
 *   var Je=({category:e="other",open:n,className:t="w-[14px]"})=>{...}
 *
 * Only the declarator expression is parsed (sliced window, never the whole
 * megabyte bundle), so this stays cheap per component. Anything acorn
 * cannot parse returns null and the caller keeps registry props.
 */

import { parseExpressionAt } from 'acorn';

export interface SignatureProp {
  /** Prop name as written at the call site (`category`, not the minified `e`). */
  readonly name: string;
  /** Raw source of the default value (`"other"`, `0`, `!0`), or null. */
  readonly defaultSource: string | null;
}

const WINDOW_CHARS = 4000;

function isObjectPattern(node: unknown): node is {
  properties: Array<{
    type: string;
    key?: { type: string; name?: string; value?: unknown };
    value?: { type: string; left?: { start: number; end: number }; right?: { start: number; end: number } };
  }>;
} {
  return typeof node === 'object' && node !== null && (node as { type: string }).type === 'ObjectPattern';
}

/**
 * Read `{...}` props from `var <varName>=...` in bundle source.
 * Returns null when the declarator is missing, is not an arrow function
 * with an object-pattern first param, or fails to parse.
 */
export function extractSignature(source: string, varName: string): readonly SignatureProp[] | null {
  if (typeof source !== 'string' || typeof varName !== 'string' || varName === '') return null;
  const head = `var ${varName}=`;
  const at = source.indexOf(head);
  if (at < 0) return null;
  const exprSrc = source.slice(at + head.length, at + head.length + WINDOW_CHARS);
  let root: unknown;
  try {
    root = parseExpressionAt(exprSrc, 0, { ecmaVersion: 'latest' });
  } catch {
    return null;
  }
  if (typeof root !== 'object' || root === null) return null;
  const { type } = root as { type: string };
  if (type !== 'ArrowFunctionExpression') return null;
  const params = (root as { params?: unknown[] }).params ?? [];
  const first = params[0];
  if (!first) return [];
  if (!isObjectPattern(first)) return null;
  const out: SignatureProp[] = [];
  for (const prop of first.properties) {
    if (prop.type === 'RestElement') continue;
    if (prop.type !== 'Property' || !prop.key || !prop.value) continue;
    const key = prop.key;
    const name =
      key.type === 'Identifier' ? (key.name ?? null) : key.type === 'Literal' ? String(key.value) : null;
    if (!name) continue;
    if (prop.value.type === 'AssignmentPattern' && prop.value.right) {
      out.push({ name, defaultSource: exprSrc.slice(prop.value.right.start, prop.value.right.end) });
    } else {
      out.push({ name, defaultSource: null });
    }
  }
  return out;
}
