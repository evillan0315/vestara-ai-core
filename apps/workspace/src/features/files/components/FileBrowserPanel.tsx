/**
 * FILES-PAGE-001: File browser sidebar panel.
 *
 * Reference chrome over the governed FileTree projection: header with
 * count + collapse + options menu, focus-mode banner, partial-tree warning,
 * recent files, tree, and footer actions. Filtering lives in the page-level
 * FilesFilterToolbar (orchestration-rail pattern); the query/facet values
 * still flow through here into the tree projection.
 * Every control mutates real workspace state — no decorative buttons.
 *
 * Architecture Traceability:
 *   VES-FILES-001: Vestara Files (browser + ops stacked)
 */

import { useRef, useState } from 'react';
import type { FileEntry, FilesFacet } from '../files.types';
import { accentFor, FileTree } from './FileTree';

interface FileBrowserPanelProps {
  readonly entries: readonly FileEntry[];
  readonly fileCount: number;
  readonly selectedPath: string | null;
  readonly activePath: string | null;
  readonly recentEntries: readonly FileEntry[];
  readonly isLoading: boolean;
  readonly fromSnapshot: boolean;
  readonly truncated: boolean;
  readonly query: string;
  readonly facet: FilesFacet;
  readonly showHidden: boolean;
  readonly expanded: ReadonlySet<string>;
  onExpandedChange: (next: ReadonlySet<string>) => void;
  readonly focusPath: string | null;
  onFocusPathChange: (path: string | null) => void;
  /** Directory path the partial-tree warning can focus, if any. */
  readonly focusTarget: string | null;
  readonly dirsFirst: boolean;
  onDirsFirstChange: (group: boolean) => void;
  onShowHiddenChange: (show: boolean) => void;
  onSelect: (entry: FileEntry) => void;
  onOpenFile: (entry: FileEntry) => void;
  onMenu: (entry: FileEntry, x: number, y: number) => void;
  onMove: (sourcePath: string, destDir: FileEntry) => void;
  onCollapse: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function FileBrowserPanel({
  entries,
  fileCount,
  selectedPath,
  activePath,
  recentEntries,
  isLoading,
  fromSnapshot,
  truncated,
  query,
  facet,
  showHidden,
  expanded,
  onExpandedChange,
  focusPath,
  onFocusPathChange,
  focusTarget,
  dirsFirst,
  onDirsFirstChange,
  onShowHiddenChange,
  onSelect,
  onOpenFile,
  onMenu,
  onMove,
  onCollapse,
  onExpandAll,
  onCollapseAll,
}: FileBrowserPanelProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const revealSelected = () => {
    bodyRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="ar-panel__head shrink-0 px-3 pt-2">
        <span className="ar-panel__label">File browser · {fileCount.toLocaleString()}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse file browser"
            title="Collapse file browser"
            className="grid h-6 w-6 place-items-center rounded-[var(--vestara-radius)] text-[var(--vestara-text-muted)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOptionsOpen((open) => !open)}
              aria-label="Browser options"
              aria-expanded={optionsOpen}
              title="Browser options"
              className={`grid h-6 min-w-[24px] place-items-center rounded-[var(--vestara-radius)] border px-1 transition-colors ${
                optionsOpen
                  ? 'border-[var(--vestara-marketplace-primary-border)] bg-[var(--vestara-marketplace-primary-bg)] text-[var(--vestara-marketplace-primary)]'
                  : 'border-transparent text-[var(--vestara-text-muted)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]'
              }`}
            >
              <span aria-hidden="true">⋯</span>
            </button>
            {optionsOpen && (
              <>
                <button type="button" aria-label="Close browser options" onClick={() => setOptionsOpen(false)} className="fixed inset-0 z-40 cursor-default bg-transparent" />
                <div role="menu" aria-label="Browser options" className="absolute right-0 top-7 z-50 w-48 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-1 shadow-[var(--vestara-elevation-md)]">
                  <p className="px-2.5 py-1 font-mono text-[length:var(--vestara-font-size-xs)] tracking-widest text-[var(--vestara-text-disabled)]">
                    BROWSER OPTIONS
                  </p>
                  {(
                    [
                      { label: 'Directories first', active: dirsFirst, action: () => onDirsFirstChange(!dirsFirst) },
                      { label: 'Show hidden files', active: showHidden, action: () => onShowHiddenChange(!showHidden) },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        item.action();
                        setOptionsOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-[var(--vestara-radius)] px-2.5 py-1.5 text-left text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                    >
                      {item.label}
                      {item.active && (
                        <span aria-hidden="true" className="text-[var(--vestara-marketplace-primary)]">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {focusPath && (
        <div className="mx-2 mt-2 flex shrink-0 items-center justify-between gap-2 rounded-[var(--vestara-radius)] border border-[var(--vestara-marketplace-primary-border)] bg-[var(--vestara-marketplace-primary-bg)] px-2.5 py-2">
          <p className="min-w-0 truncate font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-marketplace-primary)]" title={focusPath}>
            Focused: /{focusPath}
          </p>
          <button
            type="button"
            onClick={() => onFocusPathChange(null)}
            className="shrink-0 text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-marketplace-primary)] hover:underline"
          >
            Exit
          </button>
        </div>
      )}

      {truncated && (
        <div className="mx-2 mt-2 flex shrink-0 gap-2 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] p-2.5" role="note">
          <span aria-hidden="true" className="shrink-0 text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-status-warning)]">⚠</span>
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-secondary)]">
              Partial tree — browse limit reached, some entries hidden.
            </p>
            {focusTarget && (
              <button
                type="button"
                onClick={() => onFocusPathChange(focusTarget)}
                className="mt-2 rounded-[var(--vestara-radius)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-surface-panel)] px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-status-warning)] hover:brightness-110"
              >
                ◉ Focus this folder
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={bodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1.5 py-2">
        {recentEntries.length > 0 && (
          <section aria-label="Recent files">
            <p className="flex items-center gap-1.5 px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] tracking-widest text-[var(--vestara-text-disabled)]">
              <span aria-hidden="true">◷</span> RECENT
              <span className="ml-auto">{recentEntries.length}</span>
            </p>
            <ul className="mt-1 space-y-0.5">
              {recentEntries.map((entry) => {
                const { accent, glyph } = accentFor(entry);
                const isActive = entry.path === activePath;
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(entry);
                        onOpenFile(entry);
                      }}
                      title={entry.path}
                      className={`flex w-full items-center gap-2 rounded-[var(--vestara-radius)] px-2 py-1 text-left text-[length:var(--vestara-font-size-xs)] transition-colors ${
                        isActive
                          ? 'bg-[var(--files-selected-bg)] text-[var(--vestara-text-primary)]'
                          : 'text-[var(--vestara-text-muted)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-secondary)]'
                      }`}
                    >
                      <span aria-hidden="true" className="font-mono" style={{ color: accent }}>
                        {glyph}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section aria-label="Repository tree">
          <p className="flex items-center gap-1.5 px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] tracking-widest text-[var(--vestara-text-disabled)]">
            <span aria-hidden="true">▦</span> TREE
          </p>
          <FileTree
            entries={entries}
            selectedPath={selectedPath}
            activePath={activePath}
            recent={[]}
            isLoading={isLoading}
            fromSnapshot={fromSnapshot}
            truncated={false}
            query={query}
            facet={facet}
            showHidden={showHidden}
            expanded={expanded}
            onExpandedChange={onExpandedChange}
            showRecent={false}
            onSelect={onSelect}
            onOpenFile={onOpenFile}
            onMenu={onMenu}
            onMove={onMove}
          />
        </section>
      </div>

      <div className="flex h-10 shrink-0 items-center justify-between border-t border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onExpandAll}
            className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]"
          >
            Collapse
          </button>
        </div>
        <button
          type="button"
          onClick={revealSelected}
          className="flex items-center gap-1 rounded-[var(--vestara-radius)] px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-secondary)]"
        >
          <span aria-hidden="true">◉</span> Reveal
        </button>
      </div>
    </div>
  );
}
