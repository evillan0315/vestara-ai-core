/**
 * ActivityFilesPanel — explorer-only file browser for the Activity Room drawer.
 *
 * Just the middle explorer (search + file tree + inline preview + context
 * menu), reusing the Files feature's own components, hooks, and endpoints.
 * No parallel browser: FileTree owns browsing, FilePreview owns preview,
 * WorkspaceMenu owns entry actions, useFileOperations owns mutations.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AssistantCodeEdit } from '../../components/assistant/AssistantCodeEdit';
import type { EditExecutionDetail } from '@vestara/shared';
import { FileTree, type TreeFacet } from '../../features/files/components/FileTree';
import { FilePreview } from '../../features/files/components/FilePreview';
import { FileOperationsBar } from '../../features/files/components/FileOperationsBar';
import { WorkspaceMenu, type MenuState } from '../../features/files/components/FilesWorkspace';
import { classifyFile } from '../../features/files/file-classification';
import type { FileClassification } from '../../features/files/file-classification';
import type { FileEntry } from '../../features/files/files.types';
import { findFileEntryByPath } from './activity-files-navigation';
import { editInspectionTabs, hasAuthoritativeEditDiff, initialEditInspectionTab } from './activity-edit-inspection';
import { useFileOperations } from '../../features/files/hooks/useFileOperations';
import { useFiles } from '../../features/files/hooks/useFiles';
import { useSetActivitySelection } from '../../contexts/SurfaceContext';
import { OPEN_ASSISTANT_EVENT } from '../../lib/assistant-navigation';

interface PreviewState {
  readonly entry: FileEntry;
  readonly classification: FileClassification;
  readonly content?: string;
  readonly contentBase64?: string;
  readonly size: number;
  readonly error: string | null;
  readonly isLoading: boolean;
}

function fileAttachment(entry: FileEntry) {
  return {
    id: `file:${entry.path}`,
    name: entry.name,
    path: entry.path,
  };
}

function parentPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash > 0 ? path.slice(0, slash) : '';
}

function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name;
}

export default function ActivityFilesPanel({
  onAttachToComposer,
  openPath,
  editDetail,
}: {
  onAttachToComposer?: (attachment: { readonly id: string; readonly name: string; readonly path: string }) => void;
  openPath?: string | null;
  editDetail?: EditExecutionDetail | null;
}) {
  const { data, isLoading, error, refetch } = useFiles();
  const setActivitySelection = useSetActivitySelection();
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [activeEditTab, setActiveEditTab] = useState<'current' | 'diff'>('current');

  const ops = useFileOperations({
    onStructuralChange: useCallback(() => {
      void refetch();
    }, [refetch]),
  });

  const facet: TreeFacet = 'all';
  const hasAuthoritativeDiff = editDetail ? hasAuthoritativeEditDiff(editDetail) : false;

  const openFile = useCallback((entry: FileEntry) => {
    setSelectedPath(entry.path);
    if (entry.kind !== 'file') return;
    const path = entry.path;
    setPreview({
      entry,
      classification: classifyFile(entry.mimeType ?? 'application/octet-stream', path),
      size: entry.size ?? 0,
      error: null,
      isLoading: true,
    });
    void (async () => {
      try {
        const response = await fetch(`/api/files/content?path=${encodeURIComponent(path)}`);
        const payload = (await response.json()) as {
          content?: string;
          contentBase64?: string;
          mimeType?: string;
          size?: number;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || `Failed to load: ${response.status}`);
        setPreview((current) => {
          if (!current || current.entry.path !== path) return current;
          return {
            ...current,
            content: payload.content,
            contentBase64: payload.contentBase64,
            classification: classifyFile(payload.mimeType ?? 'application/octet-stream', path),
            size: payload.size ?? current.size,
            error: null,
            isLoading: false,
          };
        });
      } catch (err) {
        setPreview((current) => {
          if (!current || current.entry.path !== path) return current;
          return { ...current, error: err instanceof Error ? err.message : String(err), isLoading: false };
        });
      }
    })();
  }, []);

  const moveInto = useCallback(
    (sourcePath: string, destDir: FileEntry) => {
      const base = sourcePath.split('/').pop() ?? sourcePath;
      void ops.move(sourcePath, `${destDir.path}/${base}`);
    },
    [ops],
  );

  // Leaving preview returns to the tree; selection is preserved.
  const closePreview = useCallback(() => setPreview(null), []);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const entries = useMemo(() => data?.entries ?? [], [data]);

  useEffect(() => {
    if (!openPath || !data || (selectedPath === openPath && preview?.entry.path === openPath)) return;
    const entry = findFileEntryByPath(data.entries, openPath);
    if (entry?.kind === 'file') openFile(entry);
  }, [data, openFile, openPath, preview?.entry.path, selectedPath]);

  useEffect(() => {
    setActiveEditTab(editDetail ? initialEditInspectionTab(editDetail) : 'current');
  }, [editDetail]);

  const selectedEntry = useMemo(() => {
    return selectedPath ? findFileEntryByPath(entries, selectedPath) : null;
  }, [entries, selectedPath]);

  const currentDir = selectedEntry?.kind === 'dir' ? selectedEntry.path : selectedEntry ? parentPath(selectedEntry.path) : '';

  const createInCurrentDir = useCallback(
    (isDirectory: boolean) => {
      const kind = isDirectory ? 'folder' : 'file';
      const name = window.prompt(`New ${kind} name (in ${currentDir || 'workspace root'}):`);
      if (!name) return;
      const trimmed = name.trim();
      if (!trimmed || trimmed.includes('/')) {
        window.alert('Use a non-empty name without slashes.');
        return;
      }
      void ops.create(joinPath(currentDir, trimmed), isDirectory, isDirectory ? undefined : '');
    },
    [currentDir, ops],
  );

  const attachToAssistant = useCallback(
    (entry: FileEntry) => {
      if (entry.kind !== 'file') return;
      setActivitySelection({
        kind: 'file',
        id: entry.path,
        label: entry.name,
      });
      window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { detail: { focusComposer: true } }));
    },
    [setActivitySelection],
  );

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6 text-center" role="status" aria-label="Loading files">
        <span className="text-sm text-[var(--vestara-text-muted)]">Loading workspace files…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-[var(--vestara-text-primary)]">No data available</p>
        <p className="text-xs text-[var(--vestara-text-muted)]">
          {error ?? 'Workspace file metadata could not be loaded.'}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] px-3 py-1.5 text-xs font-medium text-[var(--vestara-accent-text)] transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      {editDetail && (
        <div className="flex shrink-0 gap-1 border-b border-[var(--vestara-border-subtle)] px-2 pt-2" role="tablist" aria-label="Edit inspection views">
          <button
            type="button"
            role="tab"
            aria-selected={activeEditTab === 'current'}
            onClick={() => setActiveEditTab('current')}
            className="rounded-t-[var(--vestara-radius)] px-2 py-1 text-xs text-[var(--vestara-text-secondary)] aria-selected:bg-[var(--vestara-accent-bg)] aria-selected:text-[var(--vestara-accent-text)]"
          >
            Current file · {editDetail.file}
          </button>
          {editDetail && editInspectionTabs(editDetail).includes('diff') && (
            <button
              type="button"
              role="tab"
              aria-selected={activeEditTab === 'diff'}
              onClick={() => setActiveEditTab('diff')}
              className="rounded-t-[var(--vestara-radius)] px-2 py-1 text-xs text-[var(--vestara-text-secondary)] aria-selected:bg-[var(--vestara-accent-bg)] aria-selected:text-[var(--vestara-accent-text)]"
            >
              Edit diff · read-only
            </button>
          )}
        </div>
      )}
      {editDetail && activeEditTab === 'diff' && hasAuthoritativeDiff ? (
        <div className="min-h-0 flex-1 overflow-auto p-2" role="tabpanel" aria-label="Read-only edit diff">
          <p className="mb-2 text-xs text-[var(--vestara-text-muted)]">Historical edit diff · {editDetail.file}</p>
          <AssistantCodeEdit detail={editDetail} />
        </div>
      ) : preview ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--vestara-border-subtle)] px-2 py-1.5">
            <button
              type="button"
              onClick={closePreview}
              aria-label="Back to file tree"
              title="Back to file tree"
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--vestara-radius)] text-[var(--vestara-text-secondary)] transition-colors hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
            >
              <span aria-hidden="true">←</span>
            </button>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--vestara-text-secondary)]" title={preview.entry.path}>
              {preview.entry.name}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {preview.isLoading ? (
              <p className="p-2 text-xs text-[var(--vestara-text-muted)]">Loading preview…</p>
            ) : preview.error ? (
              <p className="p-2 text-xs text-[var(--vestara-status-error)]" role="alert">{preview.error}</p>
            ) : (
              <FilePreview
                filePath={preview.entry.path}
                classification={preview.classification}
                content={preview.content}
                contentBase64={preview.contentBase64}
                size={preview.size}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--vestara-border-subtle)] p-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter files…"
              aria-label="Filter files"
              className="min-h-8 min-w-0 flex-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-2 text-xs text-[var(--vestara-text)] placeholder:text-[var(--vestara-text-dim)] focus:border-[var(--vestara-accent-border)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => createInCurrentDir(false)}
              title="New file"
              aria-label="New file"
              className="shrink-0 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-2 py-1 text-xs font-semibold text-[var(--vestara-text-secondary)] transition-colors hover:bg-[var(--vestara-surface-interactive)] hover:text-[var(--vestara-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
            >
              File
            </button>
            <button
              type="button"
              onClick={() => createInCurrentDir(true)}
              title="New folder"
              aria-label="New folder"
              className="shrink-0 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-2 py-1 text-xs font-semibold text-[var(--vestara-text-secondary)] transition-colors hover:bg-[var(--vestara-surface-interactive)] hover:text-[var(--vestara-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
            >
              Folder
            </button>
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              aria-pressed={showHidden}
              title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
              className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-[var(--vestara-radius)] border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset ${
                showHidden
                  ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)]'
                  : 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text)]'
              }`}
            >
              <span aria-hidden="true">·∗</span>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <FileTree
              entries={entries}
              selectedPath={selectedPath}
              activePath={null}
              recent={data.recent}
              isLoading={false}
              fromSnapshot={data.fromSnapshot}
              truncated={data.treeTruncated}
              query={query}
              facet={facet}
              showHidden={showHidden}
              onSelect={(entry) => setSelectedPath(entry.path)}
              onOpenFile={openFile}
              onMenu={(entry, x, y) => {
                setSelectedPath(entry.path);
                setMenu({ x, y, entry });
              }}
              onMove={moveInto}
            />
          </div>
        </>
      )}

      {menu && (
        <WorkspaceMenu
          menu={menu}
          ops={ops}
          onSelect={(entry) => setSelectedPath(entry.path)}
          onOpenFile={openFile}
          onClose={() => setMenu(null)}
          extraItems={
            menu.entry.kind === 'file'
              ? [
                  {
                    label: 'Attach to Composer',
                    action: () => onAttachToComposer?.(fileAttachment(menu.entry)),
                  },
                  {
                    label: 'Attach to Assistant',
                    action: () => attachToAssistant(menu.entry),
                  },
                ]
              : []
          }
        />
      )}
      <div className="shrink-0 border-t border-[var(--vestara-border-subtle)] p-2">
        <FileOperationsBar ops={ops} />
      </div>
    </div>
  );
}
