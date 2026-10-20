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

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EmptyState } from '@vestara/ui';
import { flattenEntries } from '../file-tree-utils';
import type { FileEntry } from '../files.types';
import { accentFor } from './FileTree';

interface FileQuickOpenProps {
  readonly entries: readonly FileEntry[];
  /** Resolved recent entries (ranked first when the query is empty). */
  readonly recentEntries?: readonly FileEntry[];
  /** Ordered recent paths (most-recent first) for recency boosting. */
  readonly recentPaths?: readonly string[];
  /** Currently open file — deprioritised so it never crowds out alternatives. */
  readonly activePath?: string | null;
  onOpenFile: (entry: FileEntry) => void;
  onOpenDir: (entry: FileEntry) => void;
  onClose: () => void;
}

const MAX_RESULTS = 15;

/**
 * Ranked fuzzy match: exact name > name prefix > name substring >
 * path-segment prefix > path substring. Shallower paths win ties;
 * recent files get a boost, the active file a small penalty.
 */
export function scoreQuickOpenMatch(
  entry: FileEntry,
  tokens: readonly string[],
  recentRank?: Map<string, number>,
  activePath?: string | null,
): number | null {
  const name = entry.name.toLowerCase();
  const path = entry.path.toLowerCase();
  const segments = path.split('/');
  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (name === token) score += 100;
    else if (name.startsWith(token)) score += 80;
    else if (name.includes(token)) score += 50;
    else if (segments.some((seg) => seg.startsWith(token))) score += 30;
    else if (path.includes(token)) score += 15;
    else return null;
  }
  // Prefer files over dirs and shallower paths for equal matches.
  if (entry.kind === 'file') score += 4;
  score -= Math.min(segments.length, 8);
  if (recentRank) {
    const rank = recentRank.get(entry.path);
    if (rank !== undefined) score += Math.max(0, 24 - rank * 4);
  }
  if (activePath && entry.path === activePath) score -= 6;
  return score;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  // Highlight each whitespace-separated token at its first occurrence.
  for (const token of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    const idx = lower.indexOf(token, cursor);
    if (idx < 0) continue;
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <mark key={`${token}-${idx}`} className="files-mark">
        {text.slice(idx, idx + token.length)}
      </mark>,
    );
    cursor = idx + token.length;
  }
  if (cursor === 0) return <>{text}</>;
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export function FileQuickOpen({ entries, recentEntries, recentPaths, activePath, onOpenFile, onOpenDir, onClose }: FileQuickOpenProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = flattenEntries(entries);
    const recentRank = new Map<string, number>();
    (recentPaths ?? recentEntries?.map((e) => e.path) ?? []).forEach((p, i) => {
      if (!recentRank.has(p)) recentRank.set(p, i);
    });
    if (!q) {
      // Empty query answers "what was I just in?" — recents first,
      // then files in tree order, deduped.
      const seen = new Set<string>();
      const ordered: FileEntry[] = [];
      for (const entry of [...(recentEntries ?? []), ...all.filter((e) => e.kind === 'file')]) {
        if (seen.has(entry.path)) continue;
        seen.add(entry.path);
        ordered.push(entry);
        if (ordered.length >= MAX_RESULTS) break;
      }
      return { shown: ordered, total: ordered.length, isRecent: true };
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored: Array<{ entry: FileEntry; score: number }> = [];
    for (const entry of all) {
      const score = scoreQuickOpenMatch(entry, tokens, recentRank, activePath);
      if (score !== null) scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path));
    return { shown: scored.slice(0, MAX_RESULTS).map((s) => s.entry), total: scored.length, isRecent: false };
  }, [entries, query, recentEntries, recentPaths, activePath]);

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
                setActiveIndex((i) => Math.min(results.shown.length - 1, i + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (event.key === 'Enter' && results.shown[activeIndex]) {
                open(results.shown[activeIndex]);
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
          <p className="px-2 py-1.5 font-mono text-[length:var(--vestara-font-size-xs)] tracking-widest text-[var(--vestara-text-disabled)]" aria-live="polite">
            {query.trim()
              ? `RESULTS — ${results.shown.length} of ${results.total}`
              : `RECENT FILES — ${results.shown.length}`}
          </p>
          {results.shown.length === 0 ? (
            <div className="px-2 pb-2">
              <EmptyState title="No files match" description="Try a different name or path fragment." />
            </div>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {results.shown.map((entry, i) => {
                const { accent, glyph } = accentFor(entry);
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => open(entry)}
                      onMouseEnter={() => setActiveIndex(i)}
                      aria-current={i === activeIndex}
                      title={entry.mtime ? `${entry.path} · ${entry.mtime}` : entry.path}
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
                          <HighlightedText text={entry.name} query={query} />
                        </span>
                        <span className="block truncate font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                          <HighlightedText text={entry.path} query={query} />
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
