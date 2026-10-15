/**
 * FILES-PAGE-001: Compact Files header.
 *
 * Sticky 52px shell chrome for the Files surface: workspace crumb +
 * active-file pill, quick-open trigger (⌘K), live badge, storage stats
 * popover, and the New file/folder menu. Only backed capabilities are
 * exposed — no upload/template actions without runtime support.
 *
 * Architecture Traceability:
 *   VES-FILES-001: Vestara Files (browser + ops stacked)
 */

import { useState } from 'react';
import { formatBytes } from '../../../lib/diagnostics';

interface FilesHeaderProps {
  readonly workspaceName: string;
  readonly live: boolean;
  readonly fileCount: number;
  readonly dirCount: number;
  readonly storageBytes: number;
  readonly activeName: string | null;
  onOpenSearch: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
}

export function FilesHeader({
  workspaceName,
  live,
  fileCount,
  dirCount,
  storageBytes,
  activeName,
  onOpenSearch,
  onNewFile,
  onNewFolder,
}: FilesHeaderProps) {
  const [statsOpen, setStatsOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)]">
          <span aria-hidden="true" className="font-mono text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-marketplace-primary)]">
            ▤
          </span>
        </div>
        <div className="hidden min-w-0 items-center gap-1.5 text-[length:var(--vestara-font-size-sm)] sm:flex">
          <span className="font-semibold tracking-wide text-[var(--vestara-text-primary)]">WORKSPACE</span>
          <span aria-hidden="true" className="text-[var(--vestara-text-disabled)]">›</span>
          <span className="text-[var(--vestara-text-secondary)]">Files</span>
        </div>
        {activeName && (
          <span className="hidden max-w-[200px] truncate rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)] px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)] md:inline-block" title={activeName}>
            {activeName}
          </span>
        )}
      </div>

      <div className="mx-3 max-w-[480px] flex-1 sm:mx-6">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search files (Command K)"
          className="group flex h-8 w-full items-center gap-2 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-3 transition-colors hover:border-[var(--vestara-marketplace-primary-border)]"
        >
          <span aria-hidden="true" className="text-[var(--vestara-text-disabled)] group-hover:text-[var(--vestara-text-muted)]">⌕</span>
          <span className="truncate text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-disabled)]">
            Search files by name or path…
          </span>
          <span className="ml-auto hidden shrink-0 items-center gap-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)] sm:flex" aria-hidden="true">
            ⌘K
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span
          className="hidden items-center gap-1.5 lg:flex"
          title={live ? 'Live filesystem projection' : 'Cached snapshot — runtime unavailable'}
        >
          <span className="relative flex h-2 w-2" aria-hidden="true">
            {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--vestara-status-success)] opacity-75" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-[var(--vestara-status-success)]' : 'bg-[var(--vestara-text-disabled)]'}`} />
          </span>
          <span className="font-mono text-[length:var(--vestara-font-size-xs)] font-medium tracking-widest text-[var(--vestara-text-secondary)]">
            {workspaceName} {live ? 'LIVE' : 'SNAPSHOT'}
          </span>
        </span>

        <div className="relative hidden sm:block">
          <button
            type="button"
            onClick={() => setStatsOpen((open) => !open)}
            aria-expanded={statsOpen}
            aria-label="Workspace storage statistics"
            className="rounded border border-transparent px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)] transition-colors hover:border-[var(--vestara-border-subtle)] hover:text-[var(--vestara-text-secondary)]"
          >
            {fileCount.toLocaleString()} files · {dirCount.toLocaleString()} dirs · {formatBytes(storageBytes)}
          </button>
          {statsOpen && (
            <>
              <button type="button" aria-label="Close statistics" onClick={() => setStatsOpen(false)} className="fixed inset-0 z-40 cursor-default bg-transparent" />
              <div className="absolute right-0 top-8 z-50 w-64 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-3 shadow-[var(--vestara-elevation-md)]">
                <p className="mb-2 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">WORKSPACE STATS</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: fileCount.toLocaleString(), label: 'FILES' },
                    { value: dirCount.toLocaleString(), label: 'DIRS' },
                    { value: formatBytes(storageBytes), label: 'USED' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] p-2">
                      <p className="truncate text-[length:var(--vestara-font-size-lg)] font-semibold leading-none text-[var(--vestara-text-primary)]" title={stat.value}>
                        {stat.value}
                      </p>
                      <p className="mt-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setNewOpen((open) => !open)}
            aria-expanded={newOpen}
            aria-label="Create new file or folder"
            className="flex h-8 items-center gap-1.5 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)] px-3 text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)] transition-colors hover:text-[var(--vestara-text-primary)]"
          >
            <span aria-hidden="true">＋</span>
            <span className="hidden sm:inline">New</span>
            <span aria-hidden="true" className="text-[var(--vestara-text-disabled)]">▾</span>
          </button>
          {newOpen && (
            <>
              <button type="button" aria-label="Close new menu" onClick={() => setNewOpen(false)} className="fixed inset-0 z-40 cursor-default bg-transparent" />
              <div role="menu" aria-label="Create new" className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-1 shadow-[var(--vestara-elevation-md)]">
                {(
                  [
                    { label: 'File', action: onNewFile },
                    { label: 'Folder', action: onNewFolder },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setNewOpen(false);
                      item.action();
                    }}
                    className="block w-full rounded-[var(--vestara-radius)] px-3 py-2 text-left text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
