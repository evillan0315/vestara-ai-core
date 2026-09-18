/**
 * FILES-PAGE-001: Shared tree-navigation helpers (projection only).
 *
 * Pure functions over the browse-projection FileEntry tree: flattening,
 * segment navigation, and path lookup. No fetching, no mutation.
 *
 * Architecture Traceability:
 *   FILES-PAGE-001 FP-1/FP-4/FP-5.
 */

import type { FileEntry } from './files.types';

export function flattenEntries(entries: readonly FileEntry[]): FileEntry[] {
  const out: FileEntry[] = [];
  for (const entry of entries) {
    out.push(entry);
    if (entry.children) out.push(...flattenEntries(entry.children));
  }
  return out;
}

export function findDir(entries: readonly FileEntry[], segments: readonly string[]): readonly FileEntry[] {
  let current = entries;
  for (const seg of segments) {
    const next = current.find((e) => e.kind === 'dir' && e.name === seg);
    if (!next?.children) return [];
    current = next.children;
  }
  return current;
}

export function findByPath(entries: readonly FileEntry[], path: string): FileEntry | null {
  for (const entry of entries) {
    if (entry.path === path) return entry;
    if (entry.children) {
      const found = findByPath(entry.children, path);
      if (found) return found;
    }
  }
  return null;
}
