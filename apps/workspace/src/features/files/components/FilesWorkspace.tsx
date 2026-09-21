/**
 * FILES-PAGE-001 FP-1: Production Files workspace composition.
 *
 * Three-pane shell (explorer | work area | inspector) + operations bar over
 * the governed browse projection. State ownership:
 * - tabs/drafts: useEditorTabs (local presentation state)
 * - content cache: per-path loader cache (projection)
 * - mutations: useFileOperations (single command layer, FP-8)
 * - tree: FILES-EDITOR-002 projection (never mutated locally)
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
} from 'react';
import { EmptyState } from '@vestara/ui';
import { useFileOperationsChannel } from '../../../contexts/FileOperationsContext';
import OperationalWorkspaceLayout from '../../../layouts/OperationalWorkspaceLayout';
import {
  classifyFile,
  type FileClassification,
} from '../file-classification';
import { findByPath, findDir } from '../file-tree-utils';
import type { FileEntry } from '../files.types';
import { useEditorTabs } from '../hooks/useEditorTabs';
import { useFileOperations } from '../hooks/useFileOperations';
import { DirectoryTable } from './DirectoryTable';
import { EditorStatusFooter } from './EditorStatusFooter';
import { FileInspector } from './FileInspector';
import { FilePreview } from './FilePreview';
import { FileSearch } from './FileSearch';
import { FileTree } from './FileTree';
import { FilesPageHero } from './FilesPageHero';
import {
  FilesToolbar,
  type FilesDensity,
  type FilesFacet,
  type FilesSort,
} from './FilesToolbar';
import { MultiTabHeader } from './MultiTabHeader';

type WorkMode = 'files' | 'editor' | 'preview' | 'search';

interface LoadedContent {
  content?: string;
  contentBase64?: string;
  classification: FileClassification;
  size: number;
}

interface MenuState {
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

const MODES: ReadonlyArray<{
  id: WorkMode;
  label: string;
  enabled: boolean;
  title: string;
}> = [
  {
    id: 'files',
    label: 'Files',
    enabled: true,
    title: 'Directory browser',
  },
  {
    id: 'editor',
    label: 'Editor',
    enabled: true,
    title: 'Multi-tab editor',
  },
  {
    id: 'preview',
    label: 'Preview',
    enabled: true,
    title: 'Read-only preview',
  },
  {
    id: 'search',
    label: 'Search',
    enabled: true,
    title: 'Runtime content search',
  },
];

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
  const [previewContent, setPreviewContent] = useState<
    (LoadedContent & {
      error: string | null;
      isLoading: boolean;
    }) | null
  >(null);

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
        error: null,
        isLoading: false,
      });
      return;
    }

    let cancelled = false;

    setPreviewContent({
      classification: activeTabEntry
        ? classifyEntry(activeTabEntry)
        : classifyFile('application/octet-stream', activeTabPath),
      size: activeTabEntry?.size ?? 0,
      error: null,
      isLoading: true,
    });

    void (async () => {
      try {
        const response = await fetch(
          `/api/files/content?path=${encodeURIComponent(activeTabPath)}`,
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
            activeTabPath,
          ),
          size: data.size,
        };

        contentCache.current.set(activeTabPath, loaded);

        setPreviewContent({
          ...loaded,
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

  const editorContent = activeTabPath
    ? tabs.drafts[activeTabPath] ?? previewContent?.content
    : undefined;

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
    <div className="files-workspace flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
      <FilesPageHero
        workspaceName={workspaceName}
        live={live}
        fileCount={fileCount}
        dirCount={dirCount}
        storageBytes={storageBytes}
        onNewFile={() => createInCurrentDir(false)}
        onNewFolder={() => createInCurrentDir(true)}
        onRefresh={onRefresh}
      />

      <FilesToolbar
        query={query}
        facet={facet}
        sort={sort}
        density={density}
        showHidden={showHidden}
        dirsFirst={dirsFirst}
        onQueryChange={setQuery}
        onFacetChange={setFacet}
        onSortChange={setSort}
        onDensityChange={setDensity}
        onShowHiddenChange={setShowHidden}
        onDirsFirstChange={setDirsFirst}
      />

      

      <div
        className="ar-panel-launchers flex gap-2"
        role="group"
        aria-label="Open panels"
      >
        <button
          type="button"
          onClick={() => setMobilePanel('explorer')}
          className="min-h-11 flex-1 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-3 text-xs font-semibold text-[var(--vestara-text-secondary)]"
          aria-haspopup="dialog"
        >
          Explorer · {entries.length}
        </button>

        <button
          type="button"
          onClick={() => setMobilePanel('inspector')}
          className="min-h-11 flex-1 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-3 text-xs font-semibold text-[var(--vestara-text-secondary)]"
          aria-haspopup="dialog"
        >
          Inspector
          {selectedEntry
            ? ` · ${selectedEntry.name}`
            : ''}
        </button>
      </div>

      <OperationalWorkspaceLayout
        rail={
          <aside
            className="ar-panel ar-panel--rail min-h-0 min-w-0 max-w-full"
            aria-label="File explorer panel"
          >
            <FileTree
              entries={entries}
              selectedPath={selectedPath}
              activePath={activeTabPath}
              recent={recent}
              isLoading={isLoading}
              fromSnapshot={fromSnapshot}
              truncated={truncated}
              query={query}
              facet={facet}
              showHidden={showHidden}
              onSelect={selectEntry}
              onOpenFile={openFile}
              onMenu={showMenu}
              onMove={moveInto}
            />
          </aside>
        }
        context={
        <aside
          className="ar-panel ar-panel--context min-h-0 min-w-0 max-w-full overflow-auto"
          aria-label="File inspector panel"
        >
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
          />
        </aside>
        }
      >
        <main
          className="ar-panel ar-panel--main flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden"
          aria-label="File work area"
        >
          <div className="flex items-center gap-2 border-b border-[var(--vestara-border-subtle)] px-3 py-2">
            <div
              className="flex gap-1"
              role="tablist"
              aria-label="Work area modes"
            >
              {MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === item.id}
                  title={item.title}
                  onClick={() => setMode(item.id)}
                  className={`rounded-[var(--vestara-radius-md)] px-2.5 py-1 text-xs font-semibold ${
                    mode === item.id
                      ? 'bg-[var(--files-selected-bg)] text-[var(--vestara-text-primary)]'
                      : 'text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]'
                  }`}
                >
                  {item.id === 'editor' && tabs.tabs.length > 0
                    ? `Editor (${tabs.tabs.length})`
                    : item.label}
                </button>
              ))}
            </div>
          </div>

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
                      previewContent?.classification ??
                      (activeTabEntry
                        ? classifyEntry(activeTabEntry)
                        : classifyFile(
                            'application/octet-stream',
                            activeTabPath,
                          ))
                    }
                    content={editorContent}
                    contentBase64={
                      previewContent?.contentBase64
                    }
                    size={
                      previewContent?.size ??
                      activeTabEntry?.size ??
                      0
                    }
                    error={previewContent?.error}
                    isLoading={
                      previewContent?.isLoading ?? false
                    }
                    onSave={(newContent) => {
                      const nextSize = new Blob([
                        newContent,
                      ]).size;
                      const current =
                        contentCache.current.get(
                          activeTabPath,
                        ) ??
                        previewContent ?? {
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
                        error: null,
                        isLoading: false,
                      });
                      tabs.markSaved(activeTabPath);
                      onChanged();
                    }}
                    onDraftChange={(draft) =>
                      tabs.setDraft(
                        activeTabPath,
                        draft,
                        draft !==
                          (contentCache.current.get(
                            activeTabPath,
                          )?.content ??
                            previewContent?.content ??
                            ''),
                      )
                    }
                    onCursorChange={(line, column) =>
                      setCursor({
                        line,
                        column,
                      })
                    }
                  />

                  {previewContent &&
                    !previewContent.isLoading &&
                    !previewContent.error &&
                    previewContent.classification
                      .previewType === 'text' &&
                    previewContent.content !==
                      undefined && (
                      <EditorStatusFooter
                        filePath={activeTabPath}
                        hasUnsavedChanges={tabs.isDirty(
                          activeTabPath,
                        )}
                        line={cursor.line}
                        column={cursor.column}
                        language={
                          previewContent
                            .classification
                            .languageHint
                        }
                        sizeBytes={
                          previewContent.size
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
        </main>


      </OperationalWorkspaceLayout>

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
                className="grid size-11 place-items-center rounded-lg border border-[var(--vestara-border-subtle)] text-lg text-[var(--vestara-text-secondary)]"
              >
                ×
              </button>
            </div>

            {mobilePanel === 'explorer' ? (
              <FileTree
                entries={entries}
                selectedPath={selectedPath}
                activePath={activeTabPath}
                recent={recent}
                isLoading={isLoading}
                fromSnapshot={false}
                truncated={false}
                query={query}
                facet={facet}
                showHidden={showHidden}
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
      <p className="animate-pulse p-4 text-sm text-[var(--vestara-text-muted)]">
        Loading preview…
      </p>
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

function WorkspaceMenu({
  menu,
  ops,
  onSelect,
  onOpenFile,
  onClose,
}: {
  menu: MenuState;
  ops: ReturnType<typeof useFileOperations>;
  onSelect: (entry: FileEntry) => void;
  onOpenFile: (entry: FileEntry) => void;
  onClose: () => void;
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
            className="block w-full rounded-[var(--vestara-radius-md)] px-3 py-1.5 text-left text-sm text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
