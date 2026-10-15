/**
 * VESTARA Extractor — CommandPalette (Phase 3).
 *
 * Cmd+K modal searching files, components, props, and actions via fuse.js.
 * Backdrop uses the overlay token (governed equivalent of the artifact's
 * blurred scrim). Full keyboard control: arrows, Enter, ESC.
 */

import Fuse from 'fuse.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExtractedComponent } from './types.js';

export type PaletteActionId = 'extract-all' | 'export-react' | 'copy-tokens';

export interface PaletteEntry {
  readonly kind: 'file' | 'prop' | 'action';
  readonly title: string;
  readonly subtitle: string;
  /** Component file path for file/prop entries. */
  readonly path: string | null;
  readonly action: PaletteActionId | null;
}

const ACTION_ENTRIES: PaletteEntry[] = [
  { kind: 'action', title: 'Extract all', subtitle: 'Show every component', path: null, action: 'extract-all' },
  { kind: 'action', title: 'Export as React', subtitle: 'Download ZIP (React format)', path: null, action: 'export-react' },
  { kind: 'action', title: 'Copy tokens', subtitle: 'Copy tokens.css to clipboard', path: null, action: 'copy-tokens' },
];

/** Searchable index over the working set. Pure — unit-tested. */
export function buildPaletteIndex(components: readonly ExtractedComponent[]): PaletteEntry[] {
  const entries: PaletteEntry[] = [];
  for (const c of components) {
    const path = `components/${c.file}`;
    entries.push({ kind: 'file', title: c.file, subtitle: `${c.name} · ${c.category}`, path, action: null });
    for (const p of c.props) {
      entries.push({ kind: 'prop', title: p.name, subtitle: `${c.name} · ${p.type}`, path, action: null });
    }
  }
  entries.push(...ACTION_ENTRIES);
  return entries;
}

interface CommandPaletteProps {
  readonly open: boolean;
  readonly components: readonly ExtractedComponent[];
  readonly onOpenFile: (path: string) => void;
  readonly onAction: (action: PaletteActionId) => void;
  readonly onClose: () => void;
}

export default function CommandPalette({ open, components, onOpenFile, onAction, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const index = buildPaletteIndex(components);
    const q = query.trim();
    if (!q) return index.slice(0, 12);
    const fuse = new Fuse(index, { keys: ['title', 'subtitle'], threshold: 0.4 });
    return fuse.search(q, { limit: 12 }).map((r) => r.item);
  }, [components, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open ]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;
  const active = results[cursor] ?? null;

  function choose(entry: PaletteEntry | null): void {
    if (!entry) return;
    if (entry.action) onAction(entry.action);
    else if (entry.path) onOpenFile(entry.path);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[var(--vestara-z-index-overlay)] flex items-start justify-center px-4 pt-[20vh]">
      <div
        className="absolute inset-0 bg-[var(--vestara-surface-overlay)] backdrop-blur"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-[640px] overflow-hidden rounded-2xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] shadow-[var(--vestara-elevation-xl)]">
        <div className="flex h-[52px] items-center gap-3 border-b border-[var(--vestara-border-subtle)] px-4">
          <span className="font-mono text-[var(--vestara-text-muted)]" aria-hidden="true">
            ⌘K
          </span>
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(active);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Search files, components, props, actions..."
            aria-label="Command palette search"
            className="flex-1 bg-transparent text-sm text-[var(--vestara-text-primary)] outline-none"
          />
          <span className="rounded-md border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-1.5 py-1 font-mono text-xs text-[var(--vestara-text-muted)]">
            ESC
          </span>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          <div className="px-2 py-1.5 font-mono text-xs uppercase tracking-widest text-[var(--vestara-text-muted)]">
            Results — {results.length} indexed
          </div>
          <div className="space-y-0.5">
            {results.map((entry, i) => (
              <button
                key={`${entry.kind}-${entry.title}-${entry.subtitle}`}
                type="button"
                onClick={() => choose(entry)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left ${
                  i === cursor
                    ? 'border-[var(--vestara-accent-border-active)] bg-[var(--vestara-surface-interactive)]'
                    : 'border-transparent'
                }`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] font-mono text-xs text-[var(--vestara-accent-text)]">
                  {entry.kind === 'file' ? '◆' : entry.kind === 'prop' ? '◦' : '→'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--vestara-text-primary)]">{entry.title}</span>
                  <span className="block truncate font-mono text-xs text-[var(--vestara-text-muted)]">{entry.subtitle}</span>
                </span>
                <span className="shrink-0 rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-1.5 py-0.5 font-mono text-xs text-[var(--vestara-text-muted)]">
                  {entry.kind}
                </span>
              </button>
            ))}
            {results.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-[var(--vestara-text-muted)]">No matches.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
