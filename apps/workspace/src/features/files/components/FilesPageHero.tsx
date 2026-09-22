/**
 * FILES-PAGE-001 FP-2: Operational Files hero in Activity Room header grammar.
 *
 * Reuses .ar-header / .ar-header__identity / .ar-header__controls /
 * .ar-status / .ar-kicker from the shared activity-room stylesheet (same
 * structural primitives as Activity Room — no copied CSS). Metrics come
 * from authoritative data, never hardcoded. Upload stays disabled until a
 * governed upload capability exists.
 *
 * Architecture Traceability:
 *   FILES-PAGE-001 FP-2 (Activity Room convergence).
 */

import { useState } from 'react';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import UploadIcon from '@mui/icons-material/Upload';
import { ActionIcon, StatusIndicator } from '@vestara/ui';

interface FilesPageHeroProps {
  readonly workspaceName: string;
  readonly live: boolean;
  readonly fileCount: number;
  readonly dirCount: number;
  readonly storageBytes: number;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
}

export function formatStorage(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const SOLID_ACTION =
  'rounded-[var(--vestara-radius)] bg-[var(--ar-gold)] px-3 py-1.5 text-sm font-semibold text-[var(--vestara-on-accent)] hover:brightness-110';

export function FilesPageHero({
  workspaceName,
  live,
  fileCount,
  dirCount,
  storageBytes,
  onNewFile,
  onNewFolder,
  onRefresh,
}: FilesPageHeroProps) {
  const [newOpen, setNewOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

  return (
    <header className="ar-header" aria-label="Files controls">
      <div className="ar-header__identity">
        <div className="ar-header__mark" aria-hidden="true">
          V
        </div>
        <div className="min-w-0">
          <p className="ar-kicker">Workspace</p>
          <h2 className="ar-header__title">Files</h2>
          <p className="ar-header__subtitle">Filesystem capability operations – every read, write, and search agents perform.</p>
        </div>
      </div>
      <div className="ar-header__controls">
        <span className={`ar-status ${live ? 'ar-status--live' : 'ar-status--warn'}`}>
          <StatusIndicator variant={live ? 'live' : 'warn'} size="xs" pulse={live} aria-hidden />
          {workspaceName} · {live ? 'Live' : 'Snapshot'}
        </span>
        <span
          className="ar-header__meta"
          aria-label={`Workspace metrics: ${fileCount} files, ${dirCount} directories, ${formatStorage(storageBytes)} storage`}
        >
          {fileCount.toLocaleString()} files · {dirCount.toLocaleString()} dirs · {formatStorage(storageBytes)}
        </span>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNewOpen((v) => !v);
              setOverflowOpen(false);
            }}
            aria-haspopup="menu"
            aria-expanded={newOpen}
            className={SOLID_ACTION}
          >
            New ▾
          </button>
          {newOpen && (
            <>
              <div className="fixed inset-0 z-[var(--vestara-z-index-popover)]" onClick={() => setNewOpen(false)} aria-hidden="true" />
              <div
                role="menu"
                aria-label="Create new"
                className="absolute right-0 z-[var(--vestara-z-index-popover)] mt-1 min-w-40 overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-1 shadow-[var(--vestara-elevation-md)]"
              >
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
                    className="block w-full rounded-[var(--vestara-radius)] px-3 py-1.5 text-left text-sm text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          disabled
          title="Upload is not yet a governed capability"
          aria-label="Upload (unavailable)"
          className="flex cursor-not-allowed items-center gap-1.5 rounded-[var(--vestara-radius)] bg-[var(--ar-gold)] px-3 py-1.5 text-sm font-semibold text-[var(--vestara-on-accent)] opacity-40"
        >
          <UploadIcon sx={{ fontSize: 16 }} aria-hidden />
          Upload
        </button>
        <div className="relative">
          <ActionIcon
            label="More file actions"
            tone="muted"
            icon={<MoreVertIcon sx={{ fontSize: 18 }} />}
            onClick={() => {
              setOverflowOpen((v) => !v);
              setNewOpen(false);
            }}
          />
          {overflowOpen && (
            <>
              <div className="fixed inset-0 z-[var(--vestara-z-index-popover)]" onClick={() => setOverflowOpen(false)} aria-hidden="true" />
              <div
                role="menu"
                aria-label="More file actions"
                className="absolute right-0 z-[var(--vestara-z-index-popover)] mt-1 min-w-44 overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-1 shadow-[var(--vestara-elevation-md)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOverflowOpen(false);
                    onRefresh();
                  }}
                  className="block w-full rounded-[var(--vestara-radius)] px-3 py-1.5 text-left text-sm text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                >
                  Refresh workspace
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
