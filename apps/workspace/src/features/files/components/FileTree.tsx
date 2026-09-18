/**
 * FILES-PAGE-001 FP-4: Repository explorer pane.
 *
 * Expandable tree over the FILES-EDITOR-002 browse projection (no second
 * tree model): selection, active file, keyboard navigation, nested scroll,
 * loading/empty/snapshot/truncation states, context menu + governed DnD.
 * Own vertical scroll; structural styling only (tiles via shared grammar).
 *
 * Architecture Traceability:
 *   FILES-PAGE-001 FP-4.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@vestara/ui';
import type { FileEntry, FilesRecentFile } from '../files.types';

export type TreeFacet = 'all' | 'file' | 'dir' | 'code' | 'docs';

interface FileTreeProps {
  readonly entries: readonly FileEntry[];
  readonly selectedPath: string | null;
  readonly activePath: string | null;
  readonly recent?: readonly FilesRecentFile[];
  readonly isLoading: boolean;
  readonly fromSnapshot: boolean;
  readonly truncated: boolean;
  readonly query: string;
  readonly facet: TreeFacet;
  readonly showHidden: boolean;
  onSelect: (entry: FileEntry) => void;
  onOpenFile: (entry: FileEntry) => void;
  onMenu: (entry: FileEntry, x: number, y: number) => void;
  onMove: (sourcePath: string, destDir: FileEntry) => void;
}

const DIR_ACCENT = 'var(--vestara-status-info)';
const CODE_ACCENT = 'var(--vestara-accent)';
const DOCS_ACCENT = 'var(--vestara-status-warning)';
const FILE_ACCENT = 'var(--vestara-status-success)';

export function tileClass(accent: string): string {
  if (accent === DIR_ACCENT) return 'files-tile-info';
  if (accent === CODE_ACCENT) return 'files-tile-accent';
  if (accent === DOCS_ACCENT) return 'files-tile-warning';
  return 'files-tile-success';
}

export function accentFor(entry: FileEntry): { accent: string; glyph: string } {
  if (entry.kind === 'dir') return { accent: DIR_ACCENT, glyph: '▤' };
  const lang = (entry.language ?? '').toLowerCase();
  const name = entry.name.toLowerCase();
  const isCode =
    lang.includes('typescript') ||
    lang.includes('javascript') ||
    lang.includes('json') ||
    name.endsWith('.ts') ||
    name.endsWith('.tsx') ||
    name.endsWith('.js') ||
    name.endsWith('.json') ||
    name.endsWith('.yaml') ||
    name.endsWith('.yml');
  const isDocs = lang.includes('markdown') || name.endsWith('.md') || name.endsWith('.mdx') || name.endsWith('.txt');
  if (isCode) return { accent: CODE_ACCENT, glyph: '◈' };
  if (isDocs) return { accent: DOCS_ACCENT, glyph: '▣' };
  return { accent: FILE_ACCENT, glyph: '▪' };
}

interface FlatRow {
  readonly entry: FileEntry;
  readonly depth: number;
}

function flattenVisible(entries: readonly FileEntry[], expanded: ReadonlySet<string>): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (list: readonly FileEntry[], depth: number) => {
    for (const entry of list) {
      out.push({ entry, depth });
      if (entry.kind === 'dir' && expanded.has(entry.path)) walk(entry.children ?? [], depth + 1);
    }
  };
  walk(entries, 0);
  return out;
}

export function FileTree({
  entries,
  selectedPath,
  activePath,
  recent = [],
  isLoading,
  fromSnapshot,
  truncated,
  query,
  facet,
  showHidden,
  onSelect,
  onOpenFile,
  onMenu,
  onMove,
}: FileTreeProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const rows = useMemo(() => {
    const visible = showHidden ? entries : entries.filter((e) => !e.name.startsWith('.'));
    const all = flattenVisible(visible, expanded);
    const q = query.trim().toLowerCase();
    const matches = (entry: FileEntry): boolean => {
      if (!showHidden && entry.name.startsWith('.')) return false;
      if (facet === 'file' && entry.kind !== 'file') return false;
      if (facet === 'dir' && entry.kind !== 'dir') return false;
      if (facet === 'code' || facet === 'docs') {
        const { accent } = accentFor(entry);
        if (facet === 'code' && accent !== CODE_ACCENT) return false;
        if (facet === 'docs' && accent !== DOCS_ACCENT) return false;
      }
      if (q && !entry.path.toLowerCase().includes(q) && !entry.name.toLowerCase().includes(q)) return false;
      return true;
    };
    if (facet === 'all' && !q && showHidden) return all;
    // Keep ancestors of matches so filtered rows stay reachable.
    const paths = new Set(all.filter((r) => matches(r.entry)).map((r) => r.entry.path));
    const keep = new Set<string>();
    for (const p of paths) {
      let cur = p;
      for (;;) {
        keep.add(cur);
        const slash = cur.lastIndexOf('/');
        if (slash < 0) break;
        cur = cur.slice(0, slash);
      }
    }
    return all.filter((r) => keep.has(r.entry.path));
  }, [entries, expanded, query, facet, showHidden]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const focusRow = useCallback((index: number) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${index}"]`);
    el?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const idx = active?.dataset?.rowIndex !== undefined ? Number(active.dataset.rowIndex) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusRow(Math.min(rows.length - 1, idx + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusRow(Math.max(0, idx - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Enter') {
        const row = rows[idx];
        if (!row) return;
        if (row.entry.kind === 'dir' && (e.key === 'ArrowRight' || (e.key === 'Enter' && !expanded.has(row.entry.path)))) {
          e.preventDefault();
          setExpanded((prev) => new Set(prev).add(row.entry.path));
        } else if (row.entry.kind === 'dir' && (e.key === 'ArrowLeft' || e.key === 'Enter')) {
          e.preventDefault();
          if (expanded.has(row.entry.path)) {
            setExpanded((prev) => {
              const next = new Set(prev);
              next.delete(row.entry.path);
              return next;
            });
          }
        } else if (row.entry.kind === 'file' && e.key === 'Enter') {
          e.preventDefault();
          onOpenFile(row.entry);
        }
      }
    },
    [rows, expanded, focusRow, onOpenFile],
  );

  const resolvedRecent = useMemo(() => {
    const byPath = new Map<string, FileEntry>();
    const walk = (list: readonly FileEntry[]) => {
      for (const e of list) {
        byPath.set(e.path, e);
        if (e.children) walk(e.children);
      }
    };
    walk(entries);
    return recent.map((r) => byPath.get(r.file)).filter((e): e is FileEntry => !!e).slice(0, 5);
  }, [entries, recent]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="ar-kicker mb-2">File browser</p>
      {fromSnapshot && (
        <p className="mb-2 rounded-[var(--vestara-radius-md)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] px-2 py-1 text-xs text-[var(--vestara-status-warning)]" role="note">
          ⚠ Snapshot — runtime unavailable, showing fallback tree.
        </p>
      )}
      {truncated && (
        <p className="mb-2 rounded-[var(--vestara-radius-md)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] px-2 py-1 text-xs text-[var(--vestara-status-warning)]" role="note">
          ⚠ Partial tree — browse limit reached, some entries hidden.
        </p>
      )}
      <ul
        ref={listRef}
        role="tree"
        aria-label="Repository tree"
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-auto py-1"
      >
        {isLoading && (
          <li className="p-4 text-sm text-[var(--vestara-text-muted)]" aria-live="polite">
            Loading workspace tree…
          </li>
        )}
        {!isLoading && rows.length === 0 && (
          <li className="p-4">
            <EmptyState
              title={query.trim() || facet !== 'all' ? 'Nothing matches' : 'Empty workspace'}
              description={
                query.trim() || facet !== 'all'
                  ? 'Try a different path, extension, or type.'
                  : 'No files were returned by the browse projection.'
              }
            />
          </li>
        )}
        {rows.map(({ entry, depth }, i) => {
          const isDir = entry.kind === 'dir';
          const isOpen = expanded.has(entry.path);
          const isSelected = entry.path === selectedPath;
          const isActiveFile = entry.path === activePath;
          const { accent, glyph } = accentFor(entry);
          return (
            <li key={entry.path}>
              <div
                role="treeitem"
                aria-expanded={isDir ? isOpen : undefined}
                aria-selected={isSelected}
                aria-current={isActiveFile ? 'true' : undefined}
              >
                <button
                  type="button"
                  data-row-index={i}
                  onClick={() => {
                    onSelect(entry);
                    if (isDir) toggle(entry.path);
                    else onOpenFile(entry);
                  }}
                  onDoubleClick={() => {
                    if (isDir) toggle(entry.path);
                    else onOpenFile(entry);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onMenu(entry, e.clientX, e.clientY);
                  }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', entry.path);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDropTarget(null)}
                  onDragOver={
                    isDir
                      ? (e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDropTarget(entry.path);
                        }
                      : undefined
                  }
                  onDragLeave={isDir ? () => setDropTarget((cur) => (cur === entry.path ? null : cur)) : undefined}
                  onDrop={
                    isDir
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDropTarget(null);
                          const source = e.dataTransfer.getData('text/plain');
                          if (source && source !== entry.path) onMove(source, entry);
                        }
                      : undefined
                  }
                  title={entry.path}
                  style={{ paddingLeft: `calc(0.5rem + ${depth} * 1rem)` }}
                  className={`flex w-full items-center gap-2 py-1 pr-2 text-left text-sm transition-colors hover:bg-[var(--files-row-hover-bg)] ${
                    isSelected ? 'bg-[var(--files-selected-bg)]' : ''
                  } ${dropTarget === entry.path ? 'outline outline-1 outline-[var(--vestara-border-focus)]' : ''} ${
                    isActiveFile ? 'font-semibold' : ''
                  }`}
                  data-selected={isSelected || undefined}
                >
                  <span aria-hidden="true" className="w-3 shrink-0 text-[var(--vestara-text-muted)]">
                    {isDir ? (isOpen ? '▾' : '▸') : ''}
                  </span>
                  <span aria-hidden="true" className={`mpg-icon-box h-6 w-6 shrink-0 text-xs ${tileClass(accent)}`}>
                    {glyph}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[var(--vestara-text-primary)]">{entry.name}</span>
                  {isActiveFile && (
                    <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--vestara-accent)]" />
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {resolvedRecent.length > 0 && (
        <div className="mt-3 shrink-0">
          <p className="ar-kicker mb-1.5">Recent</p>
          <ul className="space-y-1">
            {resolvedRecent.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(entry);
                    onOpenFile(entry);
                  }}
                  title={entry.path}
                  className="block w-full truncate rounded-[var(--vestara-radius-md)] px-2 py-1 text-left font-mono text-xs text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                >
                  {entry.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
