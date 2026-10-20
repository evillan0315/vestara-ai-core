/**
 * FILES-PAGE-001: Files filter toolbar.
 *
 * Full-width filter composition above the panes, mirroring the Orchestration
 * rail toolbar: search Input + type-facet pills with live counts + density
 * toggle + match count. State lives in FilesWorkspace; the tree (FileTree)
 * and the table (DirectoryTable) consume the same query/facet projection.
 * Sorting lives on the DirectoryTable headers.
 *
 * Architecture Traceability:
 *   VES-FILES-001: Vestara Files (browser + ops stacked)
 */

import { useMemo } from 'react';
import { Input } from '@vestara/ui';
import { flattenEntries } from '../file-tree-utils';
import type { FileEntry, FilesDensity, FilesFacet } from '../files.types';
import { accentFor } from './FileTree';

const FACETS: ReadonlyArray<{ id: FilesFacet; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'file', label: 'Files' },
  { id: 'dir', label: 'Folders' },
  { id: 'code', label: 'Code' },
  { id: 'docs', label: 'Docs' },
];

interface FilesFilterToolbarProps {
  readonly query: string;
  onQueryChange: (value: string) => void;
  readonly facet: FilesFacet;
  onFacetChange: (facet: FilesFacet) => void;
  /** Full (unscoped) browser entries for counts. */
  readonly entries: readonly FileEntry[];
  readonly showHidden: boolean;
  readonly density: FilesDensity;
  onDensityChange: (density: FilesDensity) => void;
}

export function FilesFilterToolbar({
  query,
  onQueryChange,
  facet,
  onFacetChange,
  entries,
  showHidden,
  density,
  onDensityChange,
}: FilesFilterToolbarProps) {
  const { counts, matches, total } = useMemo(() => {
    const all = flattenEntries(entries);
    const counts: Record<FilesFacet, number> = { all: all.length, file: 0, dir: 0, code: 0, docs: 0 };
    for (const entry of all) {
      if (entry.kind === 'file') counts.file += 1;
      if (entry.kind === 'dir') counts.dir += 1;
      const { accent } = accentFor(entry);
      if (accent === 'var(--vestara-accent)') counts.code += 1;
      else if (accent === 'var(--vestara-status-warning)') counts.docs += 1;
    }
    const q = query.trim().toLowerCase();
    const matches = q
      ? all.filter(
          (entry) =>
            (showHidden || !entry.name.startsWith('.')) &&
            (entry.path.toLowerCase().includes(q) || entry.name.toLowerCase().includes(q)),
        ).length
      : null;
    return { counts, matches, total: all.length };
  }, [entries, query, showHidden]);

  const filtering = query.trim() !== '' || facet !== 'all';

  return (
    <div
      className="mx-3 mt-3 flex shrink-0 flex-wrap items-center gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-element)]"
      role="toolbar"
      aria-label="File filters"
    >
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Filter files… (⌘K for ranked search)"
        aria-label="Filter files"
        className="min-w-48 flex-1"
      />
      <div className="flex flex-wrap items-center gap-[var(--vestara-spacing-element)]" role="group" aria-label="Filter by type">
        {FACETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onFacetChange(item.id)}
            aria-pressed={facet === item.id}
            title={`${counts[item.id].toLocaleString()} ${item.label.toLowerCase()} entries`}
            className={`cursor-pointer rounded-[var(--vestara-radius-full)] border px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-element)] font-mono text-[length:var(--vestara-font-size-xs)] transition-colors ${
              facet === item.id
                ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] text-[var(--vestara-text-primary)]'
                : 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]'
            }`}
          >
            {item.label} · {counts[item.id].toLocaleString()}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onDensityChange(density === 'list' ? 'grid' : 'list')}
        title={`Switch to ${density === 'list' ? 'grid' : 'list'} density`}
        aria-label={`Switch to ${density === 'list' ? 'grid' : 'list'} density`}
        className="rounded-[var(--vestara-radius)] border border-transparent px-2 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)] hover:text-[var(--vestara-text-secondary)]"
      >
        {density === 'list' ? 'List' : 'Grid'}
      </button>
      {filtering && (
        <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]" aria-live="polite">
          {matches !== null ? `${matches} of ${total}` : `${counts[facet]} of ${total}`}
        </span>
      )}
    </div>
  );
}
