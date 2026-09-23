import type { FileEntry } from '../../features/files/files.types';

/** Resolve the drawer's exact workspace-relative selection target. */
export function findFileEntryByPath(entries: readonly FileEntry[], path: string): FileEntry | null {
  const pending = [...entries];
  while (pending.length > 0) {
    const entry = pending.shift();
    if (!entry) continue;
    if (entry.path === path) return entry;
    if (entry.children) pending.push(...entry.children);
  }
  return null;
}
