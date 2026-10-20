/**
 * FILES-PAGE-001 FP-1: Production Files workspace composition.
 *
 * Reference shell: compact header, resizable browser/editor/inspector
 * rails, mode tabs, open-file tabs, path breadcrumb, and a ⌘K quick-open
 * palette — over the governed browse projection. State ownership:
 * - tabs/drafts: useEditorTabs (local presentation state)
 * - content cache: per-path loader cache (projection)
 * - mutations: useFileOperations (single command layer, FP-8)
 * - tree: FILES-EDITOR-002 projection (never mutated locally)
 * - tree expansion + focus root: local presentation state
 *
 * Architecture Traceability:
 *   FILES-PAGE-001 FP-1/FP-4/FP-5/FP-6/FP-7/FP-11/FP-12.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ThreePaneLayout } from '@vestara/ui';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useFileOperationsChannel } from '../../../contexts/FileOperationsContext';
import { WorkspaceTabs } from '../../../components/ui/WorkspaceTabs';
import { navIcon } from '../../../layouts/workspace-navigation';
import {
  classifyFile,
  type FileClassification,
} from '../file-classification';
import { findByPath, findDir } from '../file-tree-utils';
import type {
  FileEntry,
  FilesDensity,
  FilesFacet,
  FilesSort,
} from '../files.types';
import { useEditorTabs } from '../hooks/useEditorTabs';
import { useFileOperations } from '../hooks/useFileOperations';
import { DirectoryTable } from './DirectoryTable';
import { EditorStatusFooter } from './EditorStatusFooter';
import { FileBrowserPanel } from './FileBrowserPanel';
import { FileOperationsBar } from './FileOperationsBar';
import { FilesFilterToolbar } from './FilesFilterToolbar';
import { FileInspector } from './FileInspector';
import { FilePreview } from './FilePreview';
import { FileQuickOpen } from './FileQuickOpen';
import { FileSearch } from './FileSearch';
import { FilesHeader } from './FilesHeader';
import { MultiTabHeader } from './MultiTabHeader';

type WorkMode = 'files' | 'editor' | 'preview' | 'search';

const WORK_MODE_TABS: ReadonlyArray<{ id: WorkMode; label: string; title: string; icon: ReactNode }> = [
  { id: 'files', label: 'Files', title: 'Directory browser', icon: navIcon('files') },
  { id: 'editor', label: 'Editor', title: 'Multi-tab editor', icon: <CodeRoundedIcon fontSize="small" /> },
  { id: 'preview', label: 'Preview', title: 'Read-only preview', icon: <VisibilityOutlinedIcon fontSize="small" /> },
  { id: 'search', label: 'Search', title: 'Runtime content search', icon: <SearchOutlinedIcon fontSize="small" /> },
];

interface LoadedContent {
  content?: string;
  contentBase64?: string;
  classification: FileClassification;
  size: number;
}

export interface MenuState {
  readonly x: number;
  readonly y: number;
  readonly entry: FileEntry;
}

interface FilesWorkspaceProps {
  readonly workspaceName: string;
  readonly live: boolean;
  readonly fileCount: number;
  readonly dirCount: number;
  readonly storageBytes: number;
  readonly entries: readonly FileEntry[];
  readonly isLoading: boolean;
  readonly fromSnapshot: boolean;
  readonly truncated: boolean;
  readonly recent: readonly { file: string; mtime: string }[];
  readonly onChanged: () => void;
  readonly onRefresh: () => void;
}

function classifyEntry(entry: FileEntry): FileClassification {
  return classifyFile(
    entry.mimeType ?? 'application/octet-stream',
    entry.path,
  );
}

export function FilesWorkspace({
  workspaceName,
  live,
  fileCount,
  dirCount,
  storageBytes,
  entries,
  isLoading,
  fromSnapshot,
  truncated,
  recent,
  onChanged,
  onRefresh,
}: FilesWorkspaceProps) {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [facet, setFacet] = useState<FilesFacet>('all');
  const [sort, setSort] = useState<FilesSort>('name');
  const [density, setDensity] = useState<FilesDensity>('list');
  const [showHidden, setShowHidden] = useState(false);
  const [dirsFirst, setDirsFirst] = useState(true);
  const [segments, setSegments] = useState<readonly string[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkMode>('files');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [mobilePanel, setMobilePanel] = useState<
    'explorer' | 'inspector' | null
  >(null);
  const [cursor, setCursor] = useState({
    line: 1,
    column: 1,
  });
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [truncatedDismissed, setTruncatedDismissed] = useState(false);
  const [browserCollapsed, setBrowserCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(320);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewContent, setPreviewContent] = useState<
    (LoadedContent & {
      /** Which tab path this preview state belongs to — never render it for another path. */
      path: string;
      error: string | null;
      isLoading: boolean;
    }) | null
  >(null);

  const centerRef = useRef<HTMLElement>(null);
  const tabs = useEditorTabs();
  const tabsRef = useRef(tabs);

  tabsRef.current = tabs;

  const contentCache = useRef(new Map<string, LoadedContent>());

  useEffect(() => {
    if (!mobilePanel) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobilePanel(null);
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [mobilePanel]);

  // ⌘K / Ctrl+K quick open. Capture-phase so the shell command palette
  // (same keystroke, bubble listener) never stacks on top: on the Files
  // route, ⌘K belongs to quick-open. Skipped inside text inputs and Monaco
  // so editor chords keep working; Escape closes the palette anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setQuickOpen(false);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      if (quickOpen) {
        event.preventDefault();
        event.stopPropagation();
        setQuickOpen(false);
        return;
      }
      // event.target can be document/window (e.g. right after a native
      // prompt closes and focus is unassigned) — only Element targets
      // support closest(); anything else falls through to open.
      const target = event.target instanceof Element ? event.target : null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          (target as HTMLElement).isContentEditable ||
          target.closest('.monaco-editor'))
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setQuickOpen(true);
    };

    window.addEventListener('keydown', onKey, true);

    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [quickOpen]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const selectedEntry = useMemo(
    () => (selectedPath ? findByPath(entries, selectedPath) : null),
    [entries, selectedPath],
  );

  const activeTabPath = tabs.activePath;

  const activeTabEntry = useMemo(
    () => (activeTabPath ? findByPath(entries, activeTabPath) : null),
    [entries, activeTabPath],
  );

  const dirEntries = useMemo(
    () => findDir(entries, segments),
    [entries, segments],
  );

  // Focus-scoped tree root (focus mode narrows the browser to a subtree).
  const visibleEntries = useMemo(() => {
    if (!focusPath) return entries;
    const scoped = findDir(
      entries,
      focusPath.split('/').filter((segment) => segment.length > 0),
    );
    return scoped.length > 0 ? scoped : entries;
  }, [entries, focusPath]);

  const recentEntries = useMemo(
    () =>
      recent
        .map((item) => findByPath(entries, item.file))
        .filter((entry): entry is FileEntry => !!entry)
        .slice(0, 5),
    [entries, recent],
  );

  const focusTarget = useMemo(() => {
    if (!selectedEntry) return null;
    if (selectedEntry.kind === 'dir') return selectedEntry.path;
    const slash = selectedEntry.path.lastIndexOf('/');
    return slash > 0 ? selectedEntry.path.slice(0, slash) : null;
  }, [selectedEntry]);

  const activeName = useMemo(() => {
    if (activeTabPath) return activeTabPath.split('/').pop() ?? activeTabPath;
    return selectedEntry?.name ?? null;
  }, [activeTabPath, selectedEntry]);

  const breadcrumbPath = activeTabPath ?? selectedPath ?? '';

  const focusParentDir = useCallback(() => {
    if (!breadcrumbPath) return;
    const slash = breadcrumbPath.lastIndexOf('/');
    const parent = slash > 0 ? breadcrumbPath.slice(0, slash) : null;
    setFocusPath(parent);
    setSelectedPath(parent);
  }, [breadcrumbPath]);

  const expandAll = useCallback(() => {
    const dirs = new Set<string>();
    const walk = (list: readonly FileEntry[]) => {
      for (const entry of list) {
        if (entry.kind === 'dir') {
          dirs.add(entry.path);
          if (entry.children) walk(entry.children);
        }
      }
    };
    walk(entries);
    setExpanded(dirs);
  }, [entries]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void centerRef.current?.requestFullscreen();
    }
  }, []);

  const ops = useFileOperations({
    onStructuralChange: useCallback(
      (paths: readonly string[]) => {
        for (const path of paths) {
          contentCache.current.delete(path);
          tabsRef.current.closeTab(path);
        }

        setSelectedPath((current) =>
          current && paths.includes(current) ? null : current,
        );
      },
      [],
    ),
    onRefresh: onChanged,
  });

  // Publish the single command layer for the Operations page (FP-8 channel).
  const {
    register: registerOps,
    unregister: unregisterOps,
  } = useFileOperationsChannel();

  useEffect(() => {
    registerOps(ops);

    return () => {
      unregisterOps();
    };
  }, [registerOps, unregisterOps, ops]);

  const openFile = useCallback(
    (entry: FileEntry) => {
      setSelectedPath(entry.path);
      const classification = classifyEntry(entry);

      if (classification.isEditable) {
        tabs.openTab(entry.path, entry.name);
        setMode('editor');
        return;
      }

      setMode('preview');
    },
    [tabs],
  );

  const selectEntry = useCallback((entry: FileEntry) => {
    setSelectedPath(entry.path);
  }, []);

  const openDir = useCallback((entry: FileEntry) => {
    setSegments(entry.path.split('/').filter((segment) => segment.length > 0));
    setSelectedPath(entry.path);
    setMode('files');
  }, []);

  const openSearchPath = useCallback(
    (path: string) => {
      const entry = findByPath(entries, path);

      if (entry && entry.kind === 'file') {
        openFile(entry);
      } else {
        tabs.openTab(path, path.split('/').pop() ?? path);
        setMode('editor');
      }
    },
    [entries, openFile, tabs],
  );

  // Deep links (`/files?focus=<path>`, legacy `?path=`) run once per target,
  // only after the tree resolves — otherwise a valid path would fabricate a
  // bogus tab while entries are still loading.
  const deepLinkHandled = useRef<string | null>(null);

  useEffect(() => {
    const target = searchParams.get('focus') ?? searchParams.get('path');
    if (!target || deepLinkHandled.current === target || isLoading) return;
    deepLinkHandled.current = target;
    const entry = findByPath(entries, target);
    if (entry) {
      if (entry.kind === 'file') {
        // Expand ancestors so the opened file is revealed in the tree.
        setExpanded((prev) => {
          const next = new Set(prev);
          let cur = target;
          for (;;) {
            const slash = cur.lastIndexOf('/');
            if (slash < 0) break;
            cur = cur.slice(0, slash);
            next.add(cur);
          }
          return next;
        });
        openFile(entry);
      } else {
        setSegments(target.split('/').filter((segment) => segment.length > 0));
        setFocusPath(target);
        setSelectedPath(target);
        setMode('files');
      }
      return;
    }
    // Not in the projection: with a truncated tree the file may still exist
    // (the content API is authoritative), so open it best-effort.
    if (truncated) openSearchPath(target);
  }, [searchParams, entries, truncated, isLoading, openFile, openSearchPath]);

  // Content loading for the active tab (cached across switches).
  useEffect(() => {
    if (!activeTabPath) {
      setPreviewContent(null);
      return;
    }

    const cached = contentCache.current.get(activeTabPath);

    if (cached) {
      setPreviewContent({
        ...cached,
        path: activeTabPath,
        error: null,
        isLoading: false,
      });
      return;
    }

    let cancelled = false;
    const path = activeTabPath;

    setPreviewContent({
      path,
      classification: activeTabEntry
        ? classifyEntry(activeTabEntry)
        : classifyFile('application/octet-stream', path),
      size: activeTabEntry?.size ?? 0,
      error: null,
      isLoading: true,
    });

    void (async () => {
      try {
        const response = await fetch(
          `/api/files/content?path=${encodeURIComponent(path)}`,
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || `Failed to load: ${response.status}`,
          );
        }

        if (cancelled) {
          return;
        }

        const loaded: LoadedContent = {
          content: data.content,
          contentBase64: data.contentBase64,
          classification: classifyFile(
            data.mimeType,
            path,
          ),
          size: data.size,
        };

        contentCache.current.set(path, loaded);

        setPreviewContent({
          ...loaded,
          path,
          error: null,
          isLoading: false,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPreviewContent((previous) => ({
          ...previous!,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load file',
          isLoading: false,
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTabPath, activeTabEntry]);

  useEffect(() => {
    setCursor({
      line: 1,
      column: 1,
    });
  }, [activeTabPath]);

  const confirmUnsaved = useCallback((path: string) => {
    if (!tabsRef.current.isDirty(path)) {
      return true;
    }

    return window.confirm(
      `You have unsaved changes in ${
        path.split('/').pop() ?? path
      }. Discard them?`,
    );
  }, []);

  const showMenu = useCallback(
    (entry: FileEntry, x: number, y: number) => {
      setSelectedPath(entry.path);
      setMenu({
        x,
        y,
        entry,
      });
    },
    [],
  );

  const moveInto = useCallback(
    (sourcePath: string, destDir: FileEntry) => {
      const base =
        sourcePath.split('/').pop() ?? sourcePath;

      void ops.move(
        sourcePath,
        `${destDir.path}/${base}`,
      );
    },
    [ops],
  );

  // Only the preview state fetched for the active tab may feed the editor.
  // During a tab switch the previous tab's content is still in state for one
  // render — using it would mount the new tab's editor with stale content,
  // which the draft-lifting effect would then persist as the new tab's draft
  // (off-by-one tab content). Until the active tab's own state arrives the
  // editor shows loading instead. The loader cache is read synchronously
  // (pure read, no mutation) so switching between already-loaded tabs is
  // instant with no loading flash.
  const previewForActive =
    previewContent && previewContent.path === activeTabPath
      ? previewContent
      : null;

  const cachedActive = activeTabPath
    ? contentCache.current.get(activeTabPath)
    : undefined;

  const view =
    previewForActive ??
    (activeTabPath && cachedActive
      ? {
          ...cachedActive,
          path: activeTabPath,
          error: null as string | null,
          isLoading: false,
        }
      : null);

  const editorContent = activeTabPath
    ? tabs.drafts[activeTabPath] ?? view?.content
    : undefined;

  const editorIsLoading = activeTabPath ? !view || view.isLoading : false;

  const previewEntry =
    selectedEntry?.kind === 'file'
      ? selectedEntry
      : activeTabEntry;

  const createInCurrentDir = useCallback(
    (isDirectory: boolean) => {
      const kind = isDirectory ? 'folder' : 'file';

      const base =
        segments.length > 0
          ? `${segments.join('/')}/`
          : '';

      const name = window.prompt(
        `New ${kind} name (in ${base || 'workspace root'}):`,
      );

      if (!name) {
        return;
      }

      if (name.includes('/')) {
        return;
      }

      void ops.create(
        `${base}${name}`,
        isDirectory,
        isDirectory ? undefined : '',
      );
    },
    [ops, segments],
  );

  return (
    <div className="files-workspace flex h-full min-h-0 min-w-0 flex-col gap-[var(--vestara-spacing-section)] overflow-hidden">
      <FilesHeader
        workspaceName={workspaceName}
        live={live}
        fileCount={fileCount}
        dirCount={dirCount}
        storageBytes={storageBytes}
        activeName={activeName}
        onNewFile={() => createInCurrentDir(false)}
        onNewFolder={() => createInCurrentDir(true)}
      />

      {ops.state.status !== 'idle' && (
        <div className="shrink-0">
          <FileOperationsBar ops={ops} />
        </div>
      )}

      {truncated && !truncatedDismissed && (
        <div
          className="flex shrink-0 gap-2 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] p-2.5"
          role="note"
          aria-label="Partial tree notice"
        >
          <span aria-hidden="true" className="shrink-0 text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-status-warning)]">⚠</span>
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-secondary)]">
              Partial tree — browse limit reached, some entries hidden.
            </p>
            {focusTarget && (
              <button
                type="button"
                onClick={() => setFocusPath(focusTarget)}
                className="mt-2 rounded-[var(--vestara-radius)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-surface-panel)] px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-status-warning)] hover:brightness-110"
              >
                ◉ Focus this folder
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setTruncatedDismissed(true)}
            aria-label="Dismiss partial tree notice"
            className="h-fit shrink-0 cursor-pointer rounded-[var(--vestara-radius)] px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]"
          >
            ✕
          </button>
        </div>
      )}

      <FilesFilterToolbar
        query={query}
        onQueryChange={setQuery}
        facet={facet}
        onFacetChange={setFacet}
        entries={entries}
        showHidden={showHidden}
        density={density}
        onDensityChange={setDensity}
      />

      <ThreePaneLayout
        barePanes
        leftWidth={leftWidth}
        onLeftWidthChange={setLeftWidth}
        rightWidth={rightWidth}
        onRightWidthChange={setRightWidth}
        minLeftWidth={220}
        maxLeftWidth={440}
        minRightWidth={280}
        maxRightWidth={420}
        leftCollapsed={browserCollapsed}
        onLeftCollapsedChange={setBrowserCollapsed}
        rightCollapsed={inspectorCollapsed}
        onRightCollapsedChange={setInspectorCollapsed}
        leftAriaLabel="File browser panel"
        centerAriaLabel="File work area"
        rightAriaLabel="File inspector panel"
        stackBelow={false}
        left={
          <FileBrowserPanel
              entries={visibleEntries}
              fileCount={fileCount}
              selectedPath={selectedPath}
              activePath={activeTabPath}
              recentEntries={recentEntries}
              isLoading={isLoading}
              fromSnapshot={fromSnapshot}
              query={query}
              facet={facet}
              showHidden={showHidden}
              expanded={expanded}
              onExpandedChange={setExpanded}
              focusPath={focusPath}
              onFocusPathChange={setFocusPath}
              dirsFirst={dirsFirst}
              onDirsFirstChange={setDirsFirst}
              onShowHiddenChange={setShowHidden}
              onSelect={selectEntry}
              onOpenFile={openFile}
              onMenu={showMenu}
              onMove={moveInto}
              onCollapse={() => setBrowserCollapsed(true)}
              onExpandAll={expandAll}
              onCollapseAll={collapseAll}
            />
        }
        center={
          <section
            ref={centerRef}
            className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--vestara-surface-canvas)]"
            aria-label="File work area"
          >
          <div className="flex shrink-0 items-center gap-[var(--vestara-spacing-2)]">
            <WorkspaceTabs
              tabs={WORK_MODE_TABS.map((item) => ({
                id: item.id,
                label: item.label,
                icon: item.icon,
                ...(item.id === 'editor' && tabs.tabs.length > 0 ? { badge: tabs.tabs.length } : {}),
              }))}
              activeTab={mode}
              onTabChange={(tabId) => setMode(tabId as WorkMode)}
              ariaLabel="Work area modes"
              className="min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen work area'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen work area'}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--vestara-radius)] text-[var(--vestara-text-muted)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
            >
              <span aria-hidden="true">{isFullscreen ? '✕' : '⛶'}</span>
            </button>
          </div>

          {breadcrumbPath && (
            <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-4">
              <p className="truncate font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)]" title={breadcrumbPath}>
                /{breadcrumbPath}
              </p>
              <button
                type="button"
                onClick={focusParentDir}
                title="Open containing folder in focus mode"
                className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)] hover:text-[var(--vestara-marketplace-primary)]"
              >
                <span aria-hidden="true">◉</span> Focus folder
              </button>
            </div>
          )}

          <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden" aria-label="File work area content">
            {mode === 'files' && (
              <DirectoryTable
                workspaceName={workspaceName}
                segments={segments}
                entries={dirEntries}
                query={query}
                facet={facet}
                sort={sort}
                density={density}
                selectedPath={selectedPath}
                showHidden={showHidden}
                dirsFirst={dirsFirst}
                onSegmentsChange={setSegments}
                onSortChange={setSort}
                onSelect={selectEntry}
                onOpenFile={openFile}
                onMenu={showMenu}
                onMove={moveInto}
              />
            )}

            {mode === 'editor' && (
              <div className="flex min-h-0 flex-1 flex-col">
                {activeTabPath ? (
                  <>
                    <EditorTabHeader
                      tabs={tabs}
                      selectTab={(path) => {
                        tabs.setActive(path);
                        setSelectedPath(path);
                      }}
                      confirmUnsaved={confirmUnsaved}
                    />

                    <FilePreview
                      key={activeTabPath}
                      filePath={activeTabPath}
                      classification={
                        view?.classification ??
                        (activeTabEntry
                          ? classifyEntry(activeTabEntry)
                          : classifyFile(
                              'application/octet-stream',
                              activeTabPath,
                            ))
                      }
                      content={editorContent}
                      contentBase64={
                        view?.contentBase64
                      }
                      size={
                        view?.size ??
                        activeTabEntry?.size ??
                        0
                      }
                      error={view?.error}
                      isLoading={editorIsLoading}
                      onSave={(newContent) => {
                        const nextSize = new Blob([
                          newContent,
                        ]).size;
                        const current =
                          contentCache.current.get(
                            activeTabPath,
                          ) ??
                          view ?? {
                            classification:
                              activeTabEntry
                                ? classifyEntry(
                                    activeTabEntry,
                                  )
                                : classifyFile(
                                    'application/octet-stream',
                                    activeTabPath,
                                  ),
                            size: nextSize,
                          };
                        const loaded: LoadedContent = {
                          classification:
                            current.classification,
                          content: newContent,
                          contentBase64:
                            current.contentBase64,
                          size: nextSize,
                        };

                        contentCache.current.set(
                          activeTabPath,
                          loaded,
                        );
                        setPreviewContent({
                          ...loaded,
                          path: activeTabPath,
                          error: null,
                          isLoading: false,
                        });
                        tabs.markSaved(activeTabPath);
                        onChanged();
                      }}
                      onDraftChange={(draft) => {
                        // Ignore the mount-time echo while the active file has
                        // not loaded yet: the editor briefly mounts with no
                        // content and would otherwise persist the previous
                        // tab's content as this tab's draft, permanently
                        // shadowing the real load.
                        const persisted = contentCache.current.get(
                          activeTabPath,
                        )?.content;
                        if (
                          persisted === undefined &&
                          view?.content === undefined
                        ) {
                          return;
                        }
                        tabs.setDraft(
                          activeTabPath,
                          draft,
                          draft !==
                            (persisted ??
                              view?.content ??
                              ''),
                        );
                      }}
                      onCursorChange={(line, column) =>
                        setCursor({
                          line,
                          column,
                        })
                      }
                    />

                    {view &&
                      !view.isLoading &&
                      !view.error &&
                      view.classification
                        .previewType === 'text' &&
                      view.content !==
                        undefined && (
                        <EditorStatusFooter
                          filePath={activeTabPath}
                          hasUnsavedChanges={tabs.isDirty(
                            activeTabPath,
                          )}
                          line={cursor.line}
                          column={cursor.column}
                          language={
                            view
                              .classification
                              .languageHint
                          }
                          sizeBytes={
                            view.size
                          }
                        />
                      )}
                  </>
                ) : (
                  <EmptyState
                    title="No open file"
                    description="Open a file from the explorer or directory to edit it here."
                  />
                )}
              </div>
            )}

            {mode === 'preview' && (
              <div className="flex min-h-0 flex-1 flex-col">
                {previewEntry ? (
                  <PreviewLoader
                    path={previewEntry.path}
                  />
                ) : (
                  <EmptyState
                    title="Nothing to preview"
                    description="Select a file to preview it read-only."
                  />
                )}
              </div>
            )}

            {mode === 'search' && (
              <FileSearch
                onOpenPath={openSearchPath}
              />
            )}
          </div>
          </section>
        }
        right={
          <FileInspector
              entry={selectedEntry}
              ops={ops}
              onOpenInEditor={(entry) =>
                openFile(entry)
              }
              onOpenDir={(entry) => {
                setSegments(
                  entry.path
                    .split('/')
                    .filter(
                      (segment) =>
                        segment.length > 0,
                    ),
                );
                setSelectedPath(
                  entry.path || null,
                );
                setMode('files');
              }}
              onDeselect={() =>
                setSelectedPath(null)
              }
              onCollapse={() => setInspectorCollapsed(true)}
            />
        }
      />

      <div
        className="flex gap-2 xl:hidden"
        role="group"
        aria-label="Open panels"
      >
        <button
          type="button"
          onClick={() => setMobilePanel('explorer')}
          className="min-h-11 flex-1 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[color-mix(in_srgb,var(--vestara-accent)_14%,transparent)] px-3 text-xs font-semibold text-[var(--vestara-text-secondary)]"
          aria-haspopup="dialog"
        >
          Explorer · {entries.length}
        </button>

        <button
          type="button"
          onClick={() => setMobilePanel('inspector')}
          className="min-h-11 flex-1 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[color-mix(in_srgb,var(--vestara-accent)_14%,transparent)] px-3 text-xs font-semibold text-[var(--vestara-text-secondary)]"
          aria-haspopup="dialog"
        >
          Inspector
          {selectedEntry
            ? ` · ${selectedEntry.name}`
            : ''}
        </button>
      </div>

      {mobilePanel && (
        <div
          className="fixed inset-0 z-50 xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={
            mobilePanel === 'explorer'
              ? 'File explorer'
              : 'File inspector'
          }
          onClick={() => setMobilePanel(null)}
        >
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden="true"
          />

          <div
            className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-2xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-3"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--vestara-text-muted)]">
                {mobilePanel === 'explorer'
                  ? 'Explorer'
                  : 'Inspector'}
              </span>

              <button
                type="button"
                onClick={() =>
                  setMobilePanel(null)
                }
                aria-label="Close panel"
                className="grid size-11 place-items-center rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] text-lg text-[var(--vestara-text-secondary)]"
              >
                ×
              </button>
            </div>

            {mobilePanel === 'explorer' ? (
              <FileBrowserPanel
                entries={visibleEntries}
                fileCount={fileCount}
                selectedPath={selectedPath}
                activePath={activeTabPath}
                recentEntries={recentEntries}
                isLoading={isLoading}
                fromSnapshot={fromSnapshot}
                query={query}
                facet={facet}
                showHidden={showHidden}
                expanded={expanded}
                onExpandedChange={setExpanded}
                focusPath={focusPath}
                onFocusPathChange={setFocusPath}
                dirsFirst={dirsFirst}
                onDirsFirstChange={setDirsFirst}
                onShowHiddenChange={setShowHidden}
                onSelect={(entry) => {
                  selectEntry(entry);
                  setMobilePanel(null);
                }}
                onOpenFile={(entry) => {
                  openFile(entry);
                  setMobilePanel(null);
                }}
                onMenu={showMenu}
                onMove={moveInto}
                onCollapse={() => setMobilePanel(null)}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
              />
            ) : (
              <FileInspector
                entry={selectedEntry}
                ops={ops}
                onOpenInEditor={(entry) => {
                  openFile(entry);
                  setMobilePanel(null);
                }}
                onOpenDir={(entry) => {
                  setSegments(
                    entry.path
                      .split('/')
                      .filter(
                        (segment) =>
                          segment.length > 0,
                      ),
                  );
                  setSelectedPath(
                    entry.path || null,
                  );
                  setMode('files');
                  setMobilePanel(null);
                }}
                onDeselect={() =>
                  setSelectedPath(null)
                }
              />
            )}
          </div>
        </div>
      )}

      {quickOpen && (
        <FileQuickOpen
          entries={entries}
          recentEntries={recentEntries}
          recentPaths={recent.map((item) => item.file)}
          activePath={activeTabPath}
          onOpenFile={openFile}
          onOpenDir={openDir}
          onClose={() => setQuickOpen(false)}
        />
      )}

      {menu && (
        <WorkspaceMenu
          menu={menu}
          ops={ops}
          onSelect={selectEntry}
          onOpenFile={openFile}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function EditorTabHeader({
  tabs,
  selectTab,
  confirmUnsaved,
}: {
  tabs: ReturnType<typeof useEditorTabs>;
  selectTab: (path: string) => void;
  confirmUnsaved: (path: string) => boolean;
}) {
  return (
    <MultiTabHeader
      tabs={tabs.tabs}
      activePath={tabs.activePath}
      isDirty={tabs.isDirty}
      onSelect={selectTab}
      onCloseRequest={(path) => {
        if (confirmUnsaved(path)) {
          tabs.closeTab(path);
        }
      }}
      onCloseAllRequest={() => {
        const dirty = tabs.tabs.filter((tab) =>
          tabs.isDirty(tab.path),
        );

        if (
          dirty.length > 0 &&
          !window.confirm(
            `You have unsaved changes in ${
              dirty.length
            } file${
              dirty.length === 1 ? '' : 's'
            }. Discard them?`,
          )
        ) {
          return;
        }

        tabs.closeAllTabs();
      }}
    />
  );
}

/**
 * Read-only preview loader for the Preview mode
 * (projection fetch, no draft).
 */
function PreviewLoader({
  path,
}: {
  path: string;
}) {
  const [state, setState] = useState<{
    content?: string;
    contentBase64?: string;
    size: number;
    error: string | null;
    isLoading: boolean;
  } | null>(null);

  const [
    classification,
    setClassification,
  ] = useState<FileClassification>(() =>
    classifyFile(
      'application/octet-stream',
      path,
    ),
  );

  useEffect(() => {
    let cancelled = false;

    setState(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/files/content?path=${encodeURIComponent(
            path,
          )}`,
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              `Failed to load: ${response.status}`,
          );
        }

        if (cancelled) {
          return;
        }

        setClassification(
          classifyFile(data.mimeType, path),
        );

        setState({
          content: data.content,
          contentBase64: data.contentBase64,
          size: data.size,
          error: null,
          isLoading: false,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setState({
          size: 0,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load file',
          isLoading: false,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!state) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4" role="status" aria-live="polite" aria-label="Loading preview">
        <div aria-hidden="true" className="mpg-skeleton h-8 w-1/3" />
        <div aria-hidden="true" className="mpg-skeleton h-4 w-2/3" />
        <div aria-hidden="true" className="mpg-skeleton min-h-0 flex-1" />
        <span className="sr-only">Loading preview…</span>
      </div>
    );
  }

  return (
    <FilePreview
      filePath={path}
      classification={classification}
      content={state.content}
      contentBase64={state.contentBase64}
      size={state.size}
      error={state.error}
      isLoading={state.isLoading}
      readOnly
    />
  );
}

export function WorkspaceMenu({
  menu,
  ops,
  onSelect,
  onOpenFile,
  onClose,
  extraItems = [],
}: {
  menu: MenuState;
  ops: ReturnType<typeof useFileOperations>;
  onSelect: (entry: FileEntry) => void;
  onOpenFile: (entry: FileEntry) => void;
  onClose: () => void;
  extraItems?: ReadonlyArray<{
    readonly label: string;
    action: () => void;
  }>;
}) {
  const { entry } = menu;

  const promptName = (
    title: string,
    initial: string,
  ): string | null => {
    const next = window.prompt(
      title,
      initial,
    );

    if (
      !next ||
      next === initial ||
      next.includes('/')
    ) {
      return null;
    }

    return next;
  };

  const items: ReadonlyArray<{
    label: string;
    action: () => void;
  }> = [
    {
      label: 'Open',
      action: () =>
        entry.kind === 'file'
          ? onOpenFile(entry)
          : onSelect(entry),
    },

    ...(entry.kind === 'file'
      ? [
          {
            label: 'Duplicate',
            action: () =>
              void ops.duplicate(entry.path),
          },
        ]
      : [
          {
            label: 'New file here…',
            action: () => {
              const name = promptName(
                'New file name:',
                'untitled.txt',
              );

              if (name) {
                void ops.create(
                  `${entry.path}/${name}`,
                  false,
                  '',
                );
              }
            },
          },
          {
            label: 'New folder here…',
            action: () => {
              const name = promptName(
                'New folder name:',
                'untitled',
              );

              if (name) {
                void ops.create(
                  `${entry.path}/${name}`,
                  true,
                );
              }
            },
          },
        ]),

    {
      label: 'Rename…',
      action: () => {
        const next = promptName(
          'Rename to (name only):',
          entry.name,
        );

        if (!next) {
          return;
        }

        const parent = entry.path.includes('/')
          ? entry.path.slice(
              0,
              entry.path.lastIndexOf('/'),
            )
          : '';

        void ops.rename(
          entry.path,
          parent
            ? `${parent}/${next}`
            : next,
        );
      },
    },

    {
      label: 'Delete…',
      action: () => {
        if (
          window.confirm(
            `Delete ${entry.kind} “${entry.path}”? This cannot be undone.`,
          )
        ) {
          void ops.remove(entry.path);
        }
      },
    },

    {
      label: 'Copy path',
      action: () => {
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard
            .writeText(entry.path)
            .then(undefined, undefined);
        }
      },
    },

    ...extraItems,
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-[var(--vestara-z-index-popover)]"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
        aria-hidden="true"
      />

      <div
        role="menu"
        aria-label={`Actions for ${entry.name}`}
        className="fixed z-[var(--vestara-z-index-popover)] min-w-44 overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-1 shadow-[var(--vestara-elevation-md)]"
        style={{
          left: Math.min(
            menu.x,
            window.innerWidth - 200,
          ),
          top: Math.min(
            menu.y,
            window.innerHeight - 280,
          ),
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose();
          }
        }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.action();
            }}
            className="block w-full rounded-[var(--vestara-radius)] px-3 py-1.5 text-left text-sm text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
