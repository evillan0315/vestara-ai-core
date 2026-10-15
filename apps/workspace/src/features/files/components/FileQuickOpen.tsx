/**
 * FILES-PAGE-001: Quick-open palette (⌘K).
 *
 * Name/path search over the live browse projection — no content index
 * involved. Enter opens the highlighted match (files open, directories
 * navigate), Escape closes. Full content search lives in the Search mode.
 *
 * Architecture Traceability:
 *   VES-FILES-001: Vestara Files (browser + ops stacked)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@vestara/ui';
import { flattenEntries } from '../file-tree-utils';
import type { FileEntry } from '../files.types';
import { accentFor } from './FileTree';

interface FileQuickOpenProps {
  readonly entries: readonly FileEntry[];
  onOpenFile: (entry: FileEntry) => void;
  onOpenDir: (entry: FileEntry) => void;
  onClose: () => void;
}

const MAX_RESULTS = 8;

export function FileQuickOpen({ entries, onOpenFile, onOpenDir, onClose }: FileQuickOpenProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = flattenEntries(entries);
    if (!q) return all.filter((e) => e.kind === 'file').slice(0, MAX_RESULTS);
    return all
      .filter((e) => e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [entries, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const open = (entry: FileEntry) => {
    if (entry.kind === 'dir') onOpenDir(entry);
    else onOpenFile(entry);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[var(--vestara-z-index-popover)] flex items-start justify-center px-4 pt-[20vh]" role="dialog" aria-modal="true" aria-label="Quick open files">
      <button type="button" aria-label="Close quick open" onClick={onClose} className="absolute inset-0 cursor-default bg-[color-mix(in_srgb,var(--vestara-surface-canvas)_70%,transparent)]" />
      <div className="relative w-full max-w-[640px] overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] shadow-[var(--vestara-elevation-lg)]">
        <div className="flex h-[52px] items-center gap-3 border-b border-[var(--vestara-border-subtle)] px-4">
          <span aria-hidden="true" className="text-[var(--vestara-text-disabled)]">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((i) => Math.min(results.length - 1, i + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (event.key === 'Enter' && results[activeIndex]) {
                open(results[activeIndex]);
              }
            }}
            placeholder="Search files by name or path…"
            aria-label="Search files by name or path"
            className="flex-1 bg-transparent text-[length:var(--vestara-font-size-base)] text-[var(--vestara-text-primary)] placeholder:text-[var(--vestara-text-disabled)] focus:outline-none"
          />
          <span className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-1.5 py-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            ESC
          </span>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          <p className="px-2 py-1.5 font-mono text-[length:var(--vestara-font-size-xs)] tracking-widest text-[var(--vestara-text-disabled)]">
            {query.trim() ? `RESULTS — ${results.length}` : 'RECENT FILES'}
          </p>
          {results.length === 0 ? (
            <div className="px-2 pb-2">
              <EmptyState title="No files match" description="Try a different name or path fragment." />
            </div>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {results.map((entry, i) => {
                const { accent, glyph } = accentFor(entry);
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => open(entry)}
                      onMouseEnter={() => setActiveIndex(i)}
                      aria-current={i === activeIndex}
                      className={`flex w-full items-center gap-3 rounded-[var(--vestara-radius-lg)] border px-3 py-2.5 text-left transition-colors ${
                        i === activeIndex
                          ? 'border-[var(--vestara-marketplace-primary-border)] bg-[var(--vestara-marketplace-primary-bg)]'
                          : 'border-transparent hover:bg-[var(--files-row-hover-bg)]'
                      }`}
                    >
                      <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] font-mono text-[length:var(--vestara-font-size-sm)]" style={{ color: accent }}>
                        {entry.kind === 'dir' ? '▤' : glyph}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-primary)]">
                          {entry.name}
                        </span>
                        <span className="block truncate font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                          {entry.path}
                        </span>
                      </span>
                      <span className="shrink-0 rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)]">
                        {entry.kind}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex h-10 items-center justify-between border-t border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-4">
          <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)]">↑↓ Navigate · ↵ Open</span>
          <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)]">Content search lives in the Search tab</span>
        </div>
      </div>
    </div>
  );
}
