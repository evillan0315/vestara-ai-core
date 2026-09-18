/**
 * FILES-PAGE-001 FP-3: Global Files toolbar.
 *
 * Only backed capabilities are exposed (visible control ⇒ supported
 * capability): path filter, type select, sort select, view density, and a
 * Filters popover (hidden-file visibility + directory grouping — both
 * applied to the real projection). Content search lives in the Search
 * work-area mode (runtime-backed); no fake search anywhere.
 *
 * Architecture Traceability:
 *   FILES-PAGE-001 FP-3.
 */

import { useState } from 'react';
import FilterListIcon from '@mui/icons-material/FilterList';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import { ActionIcon } from '@vestara/ui';

export type FilesFacet = 'all' | 'file' | 'dir' | 'code' | 'docs';
export type FilesSort = 'name' | 'modified' | 'size';
export type FilesDensity = 'list' | 'grid';

const TYPE_OPTIONS: ReadonlyArray<{ id: FilesFacet; label: string }> = [
  { id: 'all', label: 'All Types' },
  { id: 'file', label: 'Files' },
  { id: 'dir', label: 'Directories' },
  { id: 'code', label: 'Code' },
  { id: 'docs', label: 'Docs' },
];

interface FilesToolbarProps {
  readonly query: string;
  readonly facet: FilesFacet;
  readonly sort: FilesSort;
  readonly density: FilesDensity;
  readonly showHidden: boolean;
  readonly dirsFirst: boolean;
  onQueryChange: (value: string) => void;
  onFacetChange: (facet: FilesFacet) => void;
  onSortChange: (sort: FilesSort) => void;
  onDensityChange: (density: FilesDensity) => void;
  onShowHiddenChange: (show: boolean) => void;
  onDirsFirstChange: (group: boolean) => void;
}

const SELECT_CLASS =
  'shrink-0 rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-2.5 py-1.5 text-sm text-[var(--vestara-text-secondary)]';

export function FilesToolbar({
  query,
  facet,
  sort,
  density,
  showHidden,
  dirsFirst,
  onQueryChange,
  onFacetChange,
  onSortChange,
  onDensityChange,
  onShowHiddenChange,
  onDirsFirstChange,
}: FilesToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-44 flex-1">
        <label className="sr-only" htmlFor="files-workspace-search">
          Search files by name, path, or content
        </label>
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vestara-text-muted)]">
          ⌕
        </span>
        <input
          id="files-workspace-search"
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search files by name, path, or content… (⌘K)"
          aria-label="Search files by name, path, or content"
          className="w-full rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] bg-[var(--files-inset-bg)] py-1.5 pl-9 pr-8 text-sm text-[var(--vestara-text-primary)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Clear filter"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex shrink-0 overflow-hidden rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)]" role="group" aria-label="Density">
        <ActionIcon
          label="List view"
          tone={density === 'list' ? 'accent' : 'muted'}
          icon={<ViewListIcon sx={{ fontSize: 18 }} />}
          onClick={() => onDensityChange('list')}
        />
        <ActionIcon
          label="Grid view"
          tone={density === 'grid' ? 'accent' : 'muted'}
          icon={<GridViewIcon sx={{ fontSize: 18 }} />}
          onClick={() => onDensityChange('grid')}
        />
      </div>
      <label className="sr-only" htmlFor="files-workspace-type">
        Filter by type
      </label>
      <select
        id="files-workspace-type"
        value={facet}
        onChange={(e) => onFacetChange(e.target.value as FilesFacet)}
        className={SELECT_CLASS}
        aria-label="Filter by type"
      >
        {TYPE_OPTIONS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="files-workspace-sort">
        Sort files
      </label>
      <select
        id="files-workspace-sort"
        value={sort}
        onChange={(e) => onSortChange(e.target.value as FilesSort)}
        className={SELECT_CLASS}
        aria-label="Sort files"
      >
        <option value="name">Name</option>
        <option value="modified">Modified</option>
        <option value="size">Size</option>
      </select>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={filtersOpen}
          className={`${SELECT_CLASS} flex items-center gap-1.5 hover:text-[var(--vestara-text-primary)]`}
        >
          <FilterListIcon sx={{ fontSize: 16 }} aria-hidden />
          Filters
        </button>
        {filtersOpen && (
          <>
            <div className="fixed inset-0 z-[var(--vestara-z-index-popover)]" onClick={() => setFiltersOpen(false)} aria-hidden="true" />
            <div
              role="dialog"
              aria-label="Display filters"
              className="absolute right-0 z-[var(--vestara-z-index-popover)] mt-1 w-56 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-3 shadow-[var(--vestara-elevation-md)]"
            >
              <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-[var(--vestara-text-secondary)]">
                <input
                  type="checkbox"
                  checked={showHidden}
                  onChange={(e) => onShowHiddenChange(e.target.checked)}
                  className="accent-[var(--vestara-accent)]"
                />
                Show hidden files
              </label>
              <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-[var(--vestara-text-secondary)]">
                <input
                  type="checkbox"
                  checked={dirsFirst}
                  onChange={(e) => onDirsFirstChange(e.target.checked)}
                  className="accent-[var(--vestara-accent)]"
                />
                Group directories first
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
