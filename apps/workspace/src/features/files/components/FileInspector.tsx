/**
 * FILES-PAGE-001 FP-7: Contextual file inspector.
 *
 * Details (implemented) | Activity (file-correlated ops from the existing
 * execution projection only) | Git (HOLD) | References (HOLD). HOLD tabs
 * render disabled with an honest tooltip — never fixture-filled. Actions
 * route through the shared useFileOperations controller (FP-8).
 *
 * Architecture Traceability:
 *   FILES-PAGE-001 FP-7/FP-8.
 */

import { useEffect, useState } from 'react';
import { EmptyState, KeyValueList } from '@vestara/ui';
import { formatBytes } from '../../../lib/diagnostics';
import { executionApi, formatTime, type FsOperation } from '../../../lib/execution';
import type { FileEntry } from '../files.types';
import type { UseFileOperationsReturn } from '../hooks/useFileOperations';

type InspectorTab = 'details' | 'activity';

interface FileInspectorProps {
  readonly entry: FileEntry | null;
  readonly ops: UseFileOperationsReturn;
  onOpenInEditor: (entry: FileEntry) => void;
  onOpenDir: (entry: FileEntry) => void;
  onDeselect: () => void;
  onCollapse?: () => void;
}

interface GitStatus {
  readonly available: boolean;
  readonly branch: string | null;
  readonly modified: number;
  readonly staged: number;
  readonly untracked: number;
  readonly ahead: number | null;
  readonly behind: number | null;
  readonly dirty: boolean;
}

export function FileInspector({ entry, ops, onOpenInEditor, onOpenDir, onDeselect, onCollapse }: FileInspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('details');
  const [activity, setActivity] = useState<readonly FsOperation[] | null>(null);
  const [git, setGit] = useState<GitStatus | null>(null);

  // Workspace-level git status (GET /api/diagnostics/git) — distinct from
  // file-level correlation, which remains ungoverned (see HOLD tabs).
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/diagnostics/git')
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as Partial<GitStatus>;
        if (!cancelled && data.available) setGit(data as GitStatus);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setTab('details');
  }, [entry?.path]);

  useEffect(() => {
    if (tab !== 'activity' || !entry) return;
    let cancelled = false;
    void executionApi.filesystem(200).then((d) => {
      if (cancelled) return;
      setActivity((d?.operations ?? []).filter((o) => o.target === entry.path));
    });
    return () => {
      cancelled = true;
    };
  }, [tab, entry]);

  if (!entry) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="ar-kicker mb-2">Inspector</p>
        <EmptyState title="Nothing selected" description="Select a file or folder to inspect it." />
      </div>
    );
  }

  const isDir = entry.kind === 'dir';

  const promptName = (title: string, initial: string): string | null => {
    const next = window.prompt(title, initial);
    if (!next || next === initial) return null;
    if (next.includes('/')) return null;
    return next;
  };

  const handleRename = () => {
    const next = promptName('Rename to (name only):', entry.name);
    if (!next) return;
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    void ops.rename(entry.path, parent ? `${parent}/${next}` : next);
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete ${entry.kind} “${entry.path}”? This cannot be undone.`)) return;
    void ops.remove(entry.path);
  };

  const typeTitle = isDir ? 'Directory' : entry.language ? `${entry.language[0].toUpperCase()}${entry.language.slice(1)} File` : 'File';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="ar-panel__head shrink-0 px-3 pt-2">
        <p className="ar-panel__label">Inspector</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDeselect}
            aria-label="Clear selection"
            title="Clear selection"
            className="grid h-6 w-6 place-items-center rounded-[var(--vestara-radius)] text-[var(--vestara-text-muted)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
          >
            ✕
          </button>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse inspector"
              title="Collapse inspector"
              className="grid h-6 w-6 place-items-center rounded-[var(--vestara-radius)] text-[var(--vestara-text-muted)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
            >
              ›
            </button>
          )}
        </div>
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--vestara-radius)] bg-[var(--vestara-status-info-bg)] font-mono text-xs font-bold text-[var(--vestara-status-info)]"
        >
          {(entry.language ?? entry.kind).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--vestara-text-primary)]" title={entry.name}>
            {entry.name}
          </p>
          <p className="truncate font-mono text-xs text-[var(--vestara-text-muted)]" title={entry.path}>
            {entry.path}
          </p>
        </div>
      </div>
      <div className="mt-2 flex shrink-0 gap-1 border-b border-[var(--vestara-border-subtle)]" role="tablist" aria-label="Inspector views">
        {(['details', 'activity'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-2 py-1.5 text-xs font-semibold capitalize ${
              tab === t
                ? 'border-b-2 border-[var(--vestara-border-focus)] text-[var(--vestara-text-primary)]'
                : 'text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]'
            }`}
          >
            {t}
          </button>
        ))}
        {(
          [
            { id: 'git', reason: 'File-level Git correlation is not yet a governed capability' },
            { id: 'references', reason: 'Dependency reference analysis is not yet wired to a governed capability' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected="false"
            aria-disabled="true"
            disabled
            title={t.reason}
            className="cursor-not-allowed px-2 py-1.5 text-xs capitalize text-[var(--vestara-text-disabled)]"
          >
            {t.id}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3" role="tabpanel">
        {tab === 'details' && (
          <>
            <section aria-label="File details" className="overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)]">
              <p className="border-b border-[var(--vestara-border-subtle)] px-3 py-2 font-mono text-[length:var(--vestara-font-size-xs)] tracking-widest text-[var(--vestara-text-muted)]">
                DETAILS
              </p>
              <div className="space-y-3 p-3">
                <div className="flex items-center gap-2 text-sm text-[var(--vestara-text-secondary)]">
                  <span aria-hidden="true" className="font-mono text-[var(--vestara-text-muted)]">&lt;/&gt;</span>
                  {typeTitle}
                </div>
                <KeyValueList
                  className="space-y-1.5 text-sm"
                  items={[
                    ...(!isDir
                      ? [{
                        id: 'size',
                        label: 'Size',
                        value: `${formatBytes(entry.size ?? 0)} (${(entry.size ?? 0).toLocaleString()} bytes)`,
                        truncate: true,
                      } as const]
                      : []),
                    { id: 'modified', label: 'Modified', value: entry.mtime ? formatTime(entry.mtime) : '—', truncate: true },
                    ...(entry.createdAt
                      ? [{ id: 'created', label: 'Created', value: formatTime(entry.createdAt), truncate: true } as const]
                      : []),
                    {
                      id: 'path',
                      label: 'Path',
                      value: (
                        <span title={entry.path} className="font-mono text-xs">
                          {entry.path}
                        </span>
                      ),
                      truncate: true,
                    },
                  ]}
                />
              </div>
            </section>
            <section aria-label="File actions" className="overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)]">
              <p className="border-b border-[var(--vestara-border-subtle)] px-3 py-2 font-mono text-[length:var(--vestara-font-size-xs)] tracking-widest text-[var(--vestara-text-muted)]">
                ACTIONS
              </p>
              <div className="grid grid-cols-2 gap-1.5 p-2">
              <button
                type="button"
                onClick={() => (isDir ? onOpenDir(entry) : onOpenInEditor(entry))}
                className="rounded-[var(--vestara-radius)] bg-[var(--vestara-status-success)] px-2.5 py-1.5 text-xs font-semibold text-[var(--vestara-surface-canvas)] hover:brightness-110"
              >
                Open
              </button>
              {!isDir && (
                <button
                  type="button"
                  onClick={() => onOpenInEditor(entry)}
                  className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] px-2.5 py-1.5 text-xs text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
                >
                  Open in Editor
                </button>
              )}
              {!isDir && (
                <button
                  type="button"
                  onClick={() => void ops.download(entry.path)}
                  className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] px-2.5 py-1.5 text-xs text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
                >
                  Download
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const done = () => undefined;
                  if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(entry.path).then(done, done);
                }}
                className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] px-2.5 py-1.5 text-xs text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
              >
                Copy Path
              </button>
              <button
                type="button"
                onClick={handleRename}
                className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] px-2.5 py-1.5 text-xs text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
              >
                Rename
              </button>
              {!isDir && (
                <button
                  type="button"
                  onClick={() => void ops.duplicate(entry.path)}
                  className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] px-2.5 py-1.5 text-xs text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
                >
                  Duplicate
                </button>
              )}
              <button
                type="button"
                onClick={handleDelete}
                className="col-span-2 rounded-[var(--vestara-radius)] border border-[var(--vestara-status-error-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--vestara-status-error)] hover:bg-[var(--vestara-status-error-bg)]"
              >
                Delete
              </button>
            </div>
            </section>
            <section aria-label="Quick actions" className="overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)]">
              <p className="border-b border-[var(--vestara-border-subtle)] px-3 py-2 font-mono text-[length:var(--vestara-font-size-xs)] tracking-widest text-[var(--vestara-text-muted)]">
                QUICK ACTIONS
              </p>
              <div className="grid grid-cols-2 gap-1.5 p-2">
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(entry.path).then(undefined, undefined);
                  }}
                  className="rounded-[var(--vestara-radius)] px-2 py-1.5 text-left text-xs text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                >
                  Copy Relative Path
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(entry.name).then(undefined, undefined);
                  }}
                  className="rounded-[var(--vestara-radius)] px-2 py-1.5 text-left text-xs text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                >
                  Copy File Name
                </button>
                <a
                  href="/terminal"
                  title={`Open terminal for ${entry.path}`}
                  className="rounded-[var(--vestara-radius)] px-2 py-1.5 text-left text-xs text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                >
                  Show in Terminal
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
                    onOpenDir({ ...entry, path: parent, name: parent.split('/').pop() ?? '', kind: 'dir' });
                  }}
                  className="rounded-[var(--vestara-radius)] px-2 py-1.5 text-left text-xs text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                >
                  Open Containing Folder
                </button>
              </div>
            </section>
            {git && (
              <section aria-label="Git status" className="overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)]">
                <p className="flex items-center justify-between border-b border-[var(--vestara-border-subtle)] px-3 py-2 font-mono text-[length:var(--vestara-font-size-xs)] tracking-widest text-[var(--vestara-text-muted)]">
                  GIT STATUS
                  <span
                    className={`rounded border px-1.5 py-0.5 ${
                      git.dirty
                        ? 'border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] text-[var(--vestara-status-warning)]'
                        : 'border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] text-[var(--vestara-status-success)]'
                    }`}
                  >
                    {git.dirty ? 'modified' : 'clean'}
                  </span>
                </p>
                <div className="space-y-1.5 p-3">
                  <p className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">
                    On branch <span className="text-[var(--vestara-text-primary)]">{git.branch ?? 'detached'}</span>
                    {git.ahead !== null && git.behind !== null && ` · ${git.ahead} ahead, ${git.behind} behind`}
                  </p>
                  <p className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                    {git.modified} modified · {git.staged} staged · {git.untracked} untracked
                  </p>
                </div>
              </section>
            )}
          </>
        )}
        {tab === 'activity' && (
          <div>
            {activity === null && <p className="animate-pulse text-sm text-[var(--vestara-text-muted)]">Loading…</p>}
            {activity !== null && activity.length === 0 && (
              <p className="text-sm text-[var(--vestara-text-muted)]">No recorded operations target this path.</p>
            )}
            {activity !== null && activity.length > 0 && (
              <ul className="space-y-2">
                {activity.slice(0, 20).map((o) => (
                  <li key={o.id} className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] p-2 text-xs">
                    <p className="truncate font-mono text-[var(--vestara-text-secondary)]" title={o.operation}>
                      {o.operation}
                    </p>
                    <p className="mt-0.5 flex justify-between gap-2 text-[var(--vestara-text-muted)]">
                      <span className="truncate">{o.agent}</span>
                      <span className="shrink-0">{formatTime(o.timestamp)}</span>
                    </p>
                    <p className="mt-0.5 text-[var(--vestara-text-muted)]">{o.status}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
