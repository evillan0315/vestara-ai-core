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
}

export function FileInspector({ entry, ops, onOpenInEditor, onOpenDir, onDeselect }: FileInspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('details');
  const [activity, setActivity] = useState<readonly FsOperation[] | null>(null);

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
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="ar-kicker">Inspector</p>
        <button
          type="button"
          onClick={onDeselect}
          aria-label="Clear selection"
          title="Clear selection"
          className="rounded-sm px-1 text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
        >
          ✕
        </button>
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--vestara-radius-md)] bg-[var(--vestara-status-info-bg)] font-mono text-xs font-bold text-[var(--vestara-status-info)]"
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

      <div className="min-h-0 flex-1 overflow-auto py-3" role="tabpanel">
        {tab === 'details' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] px-2.5 py-2 text-sm text-[var(--vestara-text-secondary)]">
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
            <div className="grid grid-cols-2 gap-1.5 border-t border-[var(--vestara-border-subtle)] pt-3">
              <button
                type="button"
                onClick={() => (isDir ? onOpenDir(entry) : onOpenInEditor(entry))}
                className="rounded-[var(--vestara-radius-md)] bg-[var(--vestara-status-success)] px-2.5 py-1.5 text-xs font-semibold text-[var(--vestara-surface-canvas)] hover:brightness-110"
              >
                Open
              </button>
              {!isDir && (
                <button
                  type="button"
                  onClick={() => onOpenInEditor(entry)}
                  className="rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] px-2.5 py-1.5 text-xs text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
                >
                  Open in Editor
                </button>
              )}
              {!isDir && (
                <button
                  type="button"
                  onClick={() => void ops.download(entry.path)}
                  className="rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] px-2.5 py-1.5 text-xs text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
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
                className="rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] px-2.5 py-1.5 text-xs text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
              >
                Copy Path
              </button>
              <button
                type="button"
                onClick={handleRename}
                className="rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] px-2.5 py-1.5 text-xs text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
              >
                Rename
              </button>
              {!isDir && (
                <button
                  type="button"
                  onClick={() => void ops.duplicate(entry.path)}
                  className="rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] px-2.5 py-1.5 text-xs text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
                >
                  Duplicate
                </button>
              )}
              <button
                type="button"
                onClick={handleDelete}
                className="col-span-2 rounded-[var(--vestara-radius-md)] border border-[var(--vestara-status-error-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--vestara-status-error)] hover:bg-[var(--vestara-status-error-bg)]"
              >
                Delete
              </button>
            </div>
            <div className="border-t border-[var(--vestara-border-subtle)] pt-3">
              <p className="ar-kicker mb-1.5">Quick Actions</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(entry.path).then(undefined, undefined);
                  }}
                  className="rounded-[var(--vestara-radius-md)] px-2 py-1.5 text-left text-xs text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                >
                  Copy Relative Path
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(entry.name).then(undefined, undefined);
                  }}
                  className="rounded-[var(--vestara-radius-md)] px-2 py-1.5 text-left text-xs text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                >
                  Copy File Name
                </button>
                <a
                  href="/terminal"
                  title={`Open terminal for ${entry.path}`}
                  className="rounded-[var(--vestara-radius-md)] px-2 py-1.5 text-left text-xs text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                >
                  Show in Terminal
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
                    onOpenDir({ ...entry, path: parent, name: parent.split('/').pop() ?? '', kind: 'dir' });
                  }}
                  className="rounded-[var(--vestara-radius-md)] px-2 py-1.5 text-left text-xs text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                >
                  Open Containing Folder
                </button>
              </div>
            </div>
          </div>
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
                  <li key={o.id} className="rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] p-2 text-xs">
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
