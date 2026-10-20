/**
 * FILES-PAGE-001: Files hero header.
 *
 * PageHero composition matching the Orchestration header: title + subtitle
 * on the left; status pills and primary actions on the right. Search lives
 * on the ⌘K shortcut (global to the Files surface), not in the hero.
 * Keeps every other Files capability — live badge, storage stats popover, and the New file/folder menu. Only backed
 * capabilities are exposed — no upload/template actions without runtime
 * support.
 *
 * Architecture Traceability:
 *   VES-FILES-001: Vestara Files (browser + ops stacked)
 */

import { useState } from 'react';
import { Button, StatusIndicator } from '@vestara/ui';
import { formatBytes } from '../../../lib/diagnostics';

interface FilesHeaderProps {
  readonly workspaceName: string;
  readonly live: boolean;
  readonly fileCount: number;
  readonly dirCount: number;
  readonly storageBytes: number;
  readonly activeName: string | null;
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
  onNewFile,
  onNewFolder,
}: FilesHeaderProps) {
  const [statsOpen, setStatsOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const statusLabel = live ? 'Live' : 'Snapshot';

  return (
    <header aria-label="Files header" className="files-hero-surface shrink-0 border-b border-[var(--vestara-border-subtle)] px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-[var(--vestara-spacing-3)]">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-[var(--vestara-spacing-2)]">
            <h1 className="truncate text-[length:var(--vestara-font-size-lg)] font-semibold tracking-tight text-[var(--vestara-text-primary)]">
              Files
            </h1>
            <span
              className={`inline-flex items-center gap-[var(--vestara-spacing-element)] rounded-[var(--vestara-radius-full)] border px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-element)] font-mono text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-wide ${
                live
                  ? 'border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] text-[var(--vestara-status-success)]'
                  : 'border-[var(--vestara-border-subtle)] bg-transparent text-[var(--vestara-text-muted)]'
              }`}
              role="status"
              aria-live="polite"
              title={live ? 'Live filesystem projection' : 'Cached snapshot — runtime unavailable'}
            >
              <StatusIndicator variant={live ? 'live' : 'idle'} size="xs" pulse={live} ariaLabel={`Files: ${workspaceName} ${statusLabel}`} />
              {workspaceName} {statusLabel}
            </span>
            {activeName && (
              <span className="max-w-64 truncate font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]" title={activeName}>
                {activeName}
              </span>
            )}
          </div>
          <p className="mt-[var(--vestara-spacing-1)] max-w-2xl truncate text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">
            {live ? `Live projection of ${workspaceName}` : `Cached snapshot of ${workspaceName} — runtime unavailable`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[var(--vestara-spacing-2)]">
          <div className="relative">
            <button
              type="button"
              onClick={() => setStatsOpen((open) => !open)}
              aria-expanded={statsOpen}
              aria-label="Workspace storage statistics"
              title="Workspace storage statistics"
              className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-border)] bg-transparent px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-element)] font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-accent-text)] transition-colors hover:brightness-125"
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
            <Button
              variant="primary"
              size="sm"
              onClick={() => setNewOpen((open) => !open)}
              aria-expanded={newOpen}
              aria-label="Create new file or folder"
            >
              + New
            </Button>
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
      </div>
    </header>
  );
}
