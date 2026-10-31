/**
 * VES-UI-001 T6: Files Package
 *
 * File browser surface missing from the v2 prototype (plan G10) —
 * implemented here over the governed files feature (`features/files/`):
 * tree projection via `useFiles` (`GET /api/files/browse` → fixture
 * fallback) plus storage insights from `/api/diagnostics/filesystem`.
 * Never hardcoded arrays in JSX — the tree renders hook output only.
 *
 * Visual roles bind to the scoped `--ds-*` layer, never hex literals.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T6 Files via features/files)
 *   VES-FILES-001: Vestara Files (browser + ops stacked)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { flattenEntries } from '../../files/file-tree-utils';
import type { FileEntry } from '../../files/files.types';
import { useFiles } from '../../files/hooks/useFiles';
import { PackageEmpty, PackageGhostButton, PackageSearchInput, PackageSubHeader } from './PackageChrome';

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function matchesQuery(entry: FileEntry, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  if (entry.name.toLowerCase().includes(normalized)) return true;
  return (entry.children ?? []).some((child) => matchesQuery(child, query));
}

function TreeNode({
  entry,
  depth,
  selectedPath,
  expanded,
  query,
  onSelect,
  onToggle,
}: {
  entry: FileEntry;
  depth: number;
  selectedPath: string | null;
  expanded: ReadonlySet<string>;
  query: string;
  onSelect: (entry: FileEntry) => void;
  onToggle: (path: string) => void;
}) {
  const isDir = entry.kind === 'dir';
  const isOpen = expanded.has(entry.path);
  const selected = selectedPath === entry.path;
  const children = (entry.children ?? []).filter((child) => matchesQuery(child, query));
  if (query.trim() && !matchesQuery(entry, query)) return null;

  return (
    <div role="treeitem" aria-expanded={isDir ? isOpen : undefined} aria-selected={selected}>
      <div className="ds-tree-indent flex items-center gap-[var(--vestara-spacing-1)]" style={{ '--ds-depth': depth } as CSSProperties}>
        {isDir ? (
          <button
            type="button"
            onClick={() => onToggle(entry.path)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' && !isOpen) {
                event.preventDefault();
                onToggle(entry.path);
              } else if (event.key === 'ArrowLeft' && isOpen) {
                event.preventDefault();
                onToggle(entry.path);
              }
            }}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${entry.path}`}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] focus-visible:outline-2 focus-visible:outline-[var(--ds-accent)]"
          >
            <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
          </button>
        ) : (
          <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center text-[var(--ds-text-muted)]">
            ·
          </span>
        )}
        <button
          type="button"
          onClick={() => onSelect(entry)}
          onKeyDown={(event) => {
            if (isDir && event.key === 'ArrowRight' && !isOpen) {
              event.preventDefault();
              onToggle(entry.path);
            }
          }}
          aria-current={selected}
          className={`min-w-0 flex-1 truncate rounded-[var(--vestara-radius-md)] px-[var(--vestara-spacing-1)] py-px text-left text-[length:var(--vestara-font-size-xs)] ${
            selected ? 'bg-[var(--ds-accent-bg)] text-[var(--ds-accent)]' : 'text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-bg)]'
          }`}
          title={entry.path}
        >
          {isDir ? `${entry.name}/` : entry.name}
        </button>
      </div>
      {isDir && (isOpen || query.trim()) ? (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expanded={expanded}
              query={query}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FilesPackage() {
  const { data, isLoading, error, refetch } = useFiles();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [copiedPath, setCopiedPath] = useState(false);

  const summary = useMemo(() => {
    if (!data) return { files: 0, dirs: 0, storage: 0 };
    const all = flattenEntries(data.entries);
    return {
      files: all.filter((entry) => entry.kind === 'file').length,
      dirs: all.filter((entry) => entry.kind === 'dir').length,
      storage: data.dirSizes.reduce((sum, dir) => sum + dir.size, 0),
    };
  }, [data]);

  const selected = useMemo(() => {
    if (!data || !selectedPath) return null;
    return flattenEntries(data.entries).find((entry) => entry.path === selectedPath) ?? null;
  }, [data, selectedPath]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Expand the top-level directories on first data so the tree never paints empty.
  useEffect(() => {
    if (!data) return;
    setExpanded((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      for (const entry of data.entries) {
        if (entry.kind === 'dir') next.add(entry.path);
      }
      return next;
    });
  }, [data]);

  const copySelectedPath = async () => {
    if (!selected?.path) return;
    try {
      await navigator.clipboard.writeText(selected.path);
      setCopiedPath(true);
      window.setTimeout(() => setCopiedPath(false), 1500);
    } catch {
      setCopiedPath(false);
    }
  };

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <PackageSubHeader
        eyebrow={`FILES · ${(data?.workspaceName ?? 'workspace').toUpperCase()}`}
        isLive={Boolean(data && !data.fromSnapshot)}
        meta={
          <span className="hidden shrink-0 text-[length:var(--vestara-font-size-xs)] tabular-nums text-[var(--ds-text-muted)] sm:inline">
            {summary.files} files · {summary.dirs} dirs
          </span>
        }
        action={
          <PackageGhostButton label="Reload workspace files" onClick={() => void refetch()}>
            Reload
          </PackageGhostButton>
        }
      />
    <div className="ds-split-2col ds-split-2col-rail-right grid min-h-0 flex-1 grid-cols-1">
      <div className="flex min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-[var(--vestara-spacing-2)] border-b border-[var(--ds-border)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-1)]">
          <PackageSearchInput
            id="ds-files-search"
            value={query}
            onChange={setQuery}
            label="Filter files"
            placeholder="Filter files…"
          />
        </div>
        <div className="min-h-0 flex-1 space-y-px overflow-auto p-[var(--vestara-spacing-2)]" aria-busy={isLoading} role="tree" aria-label="Workspace files">
          {!data ? (
            <div className="p-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
              {isLoading ? 'Loading workspace files…' : 'No data available.'}
            </div>
          ) : (
            data.entries.map((entry) => (
              <TreeNode
                key={entry.id}
                entry={entry}
                depth={0}
                selectedPath={selectedPath}
                expanded={expanded}
                query={query}
                onSelect={(item) => {
                  setSelectedPath(item.path);
                  if (item.kind === 'dir') toggle(item.path);
                }}
                onToggle={toggle}
              />
            ))
          )}
        </div>
        {error || data?.fromSnapshot ? (
          <div className="shrink-0 border-t border-[var(--ds-border)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
            {error ?? 'Live filesystem scan unavailable — showing cached snapshot.'}
          </div>
        ) : null}
      </div>
      <div className="ds-rail-right flex min-h-0 flex-col gap-[var(--vestara-spacing-2)] overflow-auto p-[var(--vestara-spacing-3)]">
        <div className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-2)]">
          <div className="flex items-center justify-between gap-[var(--vestara-spacing-1)]">
            <div className="text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
              SELECTION
            </div>
            {selected ? (
              <PackageGhostButton label="Copy selected path" onClick={() => void copySelectedPath()}>
                {copiedPath ? 'Copied' : 'Copy path'}
              </PackageGhostButton>
            ) : null}
          </div>
          <div className="mt-[var(--vestara-spacing-1)] truncate text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--ds-text)]" title={selected?.path ?? 'Nothing selected'}>
            {selected ? selected.path : 'Nothing selected'}
          </div>
          <div className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
            {selected ? `${selected.kind} · ${formatSize(selected.size)}` : 'Select a file or folder'}
            {selected?.mtime ? ` · ${selected.mtime}` : ''}
          </div>
        </div>
        <div className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-2)]">
          <div className="text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
            STORAGE · {formatSize(summary.storage)}
          </div>
          <ul className="mt-[var(--vestara-spacing-1)] space-y-[var(--vestara-spacing-1)]">
            {(data?.dirSizes ?? []).slice(0, 4).map((dir) => (
              <li key={dir.dir} className="flex items-center justify-between gap-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)]">
                <span className="min-w-0 truncate text-[var(--ds-text-secondary)]" title={dir.dir}>
                  {dir.dir}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--ds-text-muted)]">{formatSize(dir.size)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-2)]">
          <div className="text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
            RECENT
          </div>
          <ul className="mt-[var(--vestara-spacing-1)] space-y-[var(--vestara-spacing-1)]">
            {(data?.recent ?? []).slice(0, 4).map((item) => (
              <li key={item.file} className="truncate text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]" title={item.file}>
                {item.file}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
    </div>
  );
}
