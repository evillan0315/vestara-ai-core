/**
 * Markdown helpers for the Documentation module:
 * frontmatter parsing, heading extraction, GitHub-style slugging, text stripping.
 */

import type { ReactNode } from 'react';

export interface Frontmatter {
  meta: Record<string, string | string[]>;
  body: string;
}

/** Parse YAML-ish frontmatter delimited by `---`. Values are strings or string lists. */
export function parseFrontmatter(md: string): Frontmatter {
  const trimmed = md.replace(/^\uFEFF/, '');
  if (!trimmed.startsWith('---')) return { meta: {}, body: trimmed };

  const end = trimmed.indexOf('\n---');
  if (end === -1) return { meta: {}, body: trimmed };

  const block = trimmed.slice(3, end);
  const body = trimmed.slice(end + 4);

  const meta: Record<string, string | string[]> = {};
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value.startsWith('[') && value.endsWith(']')) {
      meta[m[1].toLowerCase()] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    } else if (value.includes(',')) {
      meta[m[1].toLowerCase()] = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    meta[m[1].toLowerCase()] = value;
  }

  return { meta, body };
}

export function metaString(meta: Record<string, string | string[]>, key: string): string | undefined {
  const v = meta[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

export function metaList(meta: Record<string, string | string[]>, key: string): string[] {
  const v = meta[key];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) return [v];
  return [];
}

export interface Heading {
  depth: number;
  text: string;
  slug: string;
}

/** GitHub-style slug used for heading anchors. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[`~!@#$%^&*()+=,./\\'"{}[\]|:;<>?]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Extract headings, skipping frontmatter and fenced code blocks. Duplicate slugs get numeric suffixes. */
export function extractHeadings(md: string): Heading[] {
  const { body } = parseFrontmatter(md);
  const headings: Heading[] = [];
  const seen: Record<string, number> = {};
  let inFence = false;

  for (const rawLine of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = rawLine.match(/^(#{1,6})\s+(.+)$/);
    if (!m) continue;
    const text = m[2].replace(/[#\s]+$/, '').trim();
    if (!text) continue;
    const base = slugify(text);
    seen[base] = (seen[base] ?? 0) + 1;
    const slug = seen[base] > 1 ? `${base}-${seen[base] - 1}` : base;
    headings.push({ depth: m[1].length, text, slug });
  }

  return headings;
}

/** Strip markdown syntax for plain-text snippets. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^\uFEFF/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/^\s*[-+*]\s+/gm, ' ')
    .replace(/^\s*\d+\.\s+/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Render plain text with a search term highlighted. */
export function highlightText(text: string, query: string): ReactNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [text];
  const out: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    const idx = rest.toLowerCase().indexOf(q);
    if (idx === -1) {
      out.push(rest);
      break;
    }
    if (idx > 0) out.push(rest.slice(0, idx));
    out.push(
      <mark key={key} className="doc-hl">
        {rest.slice(idx, idx + q.length)}
      </mark>,
    );
    rest = rest.slice(idx + q.length);
    key += 1;
  }
  return out;
}

/** Build a short snippet around the first query hit. */
export function snippetAround(text: string, query: string, radius = 90): string {
  const q = query.trim().toLowerCase();
  if (!q) return text.length > 2 * radius ? `${text.slice(0, 2 * radius)}…` : text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text.length > 2 * radius ? `${text.slice(0, 2 * radius)}…` : text;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}
