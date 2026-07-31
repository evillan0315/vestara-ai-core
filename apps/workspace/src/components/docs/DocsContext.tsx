/**
 * Documentation module state.
 *
 * Owns the doc tree, selected document, and all persistent UI state
 * (expanded folders, favorites, pins, recents, reading history, panel
 * widths, viewer settings). Everything is stored in localStorage under
 * the `vestara-docs-*` keys, matching the app's persistence conventions.
 */

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { DocContent, DocIndexEntry, DocNode, DocsMeta } from '../../lib/docs';
import { flattenDocs, getDocContent, getDocsIndex, getDocsMeta, getDocsTree } from '../../lib/docs';

const LS = {
  expanded: 'vestara-docs-expanded',
  favorites: 'vestara-docs-favorites',
  pinned: 'vestara-docs-pinned',
  recent: 'vestara-docs-recent',
  history: 'vestara-docs-history',
  searches: 'vestara-docs-searches',
  widths: 'vestara-docs-widths',
  settings: 'vestara-docs-settings',
};

export interface RecentDoc {
  path: string;
  title: string;
  at: number;
}

export interface HistoryEntry {
  path: string;
  progress: number;
  at: number;
}

export interface DocsSettings {
  tocOpen: boolean;
  explorerOpen: boolean;
  focusMode: boolean;
  lineNumbers: boolean;
}

const DEFAULT_SETTINGS: DocsSettings = {
  tocOpen: true,
  explorerOpen: true,
  focusMode: false,
  lineNumbers: false,
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

function loadArr<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

interface DocsContextValue {
  meta: DocsMeta | null;
  roots: DocNode[];
  rootsCount: number;
  loading: boolean;
  error: string | null;

  index: DocIndexEntry[];
  indexLoading: boolean;
  loadIndex: () => Promise<void>;

  selectedPath: string | null;
  content: DocContent | null;
  contentLoading: boolean;
  contentError: string | null;
  selectDoc: (path: string | null) => void;
  refresh: () => void;

  flat: ReturnType<typeof flattenDocs>;

  expanded: Record<string, boolean>;
  toggleDir: (path: string) => void;
  expandAll: () => void;
  collapseAll: () => void;

  favorites: string[];
  toggleFavorite: (path: string) => void;
  isFavorite: (path: string) => boolean;

  pinned: string[];
  togglePin: (path: string) => void;
  isPinned: (path: string) => boolean;

  recent: RecentDoc[];
  clearRecent: () => void;

  history: HistoryEntry[];
  recordProgress: (path: string, progress: number) => void;
  getProgress: (path: string) => number;

  searches: string[];
  addSearch: (q: string) => void;

  widths: { explorer: number; toc: number };
  setWidth: (panel: 'explorer' | 'toc', width: number) => void;

  settings: DocsSettings;
  updateSettings: <K extends keyof DocsSettings>(key: K, value: DocsSettings[K]) => void;
}

const DocsContext = createContext<DocsContextValue | null>(null);

export function DocsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const selectedPath = searchParams.get('path');

  const [meta, setMeta] = useState<DocsMeta | null>(null);
  const [roots, setRoots] = useState<DocNode[]>([]);
  const [rootsCount, setRootsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [index, setIndex] = useState<DocIndexEntry[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);

  const [content, setContent] = useState<DocContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => load(LS.expanded, {}));
  const [favorites, setFavorites] = useState<string[]>(() => loadArr<string>(LS.favorites));
  const [pinned, setPinned] = useState<string[]>(() => loadArr<string>(LS.pinned));
  const [recent, setRecent] = useState<RecentDoc[]>(() => loadArr<RecentDoc>(LS.recent));
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadArr<HistoryEntry>(LS.history));
  const [searches, setSearches] = useState<string[]>(() => loadArr<string>(LS.searches));
  const [widths, setWidths] = useState<{ explorer: number; toc: number }>(() =>
    load(LS.widths, { explorer: 280, toc: 260 }),
  );
  const [settings, setSettings] = useState<DocsSettings>(() => load(LS.settings, DEFAULT_SETTINGS));

  // Persist each slice.
  useEffect(() => save(LS.expanded, expanded), [expanded]);
  useEffect(() => save(LS.favorites, favorites), [favorites]);
  useEffect(() => save(LS.pinned, pinned), [pinned]);
  useEffect(() => save(LS.recent, recent), [recent]);
  useEffect(() => save(LS.history, history), [history]);
  useEffect(() => save(LS.searches, searches), [searches]);
  useEffect(() => save(LS.widths, widths), [widths]);
  useEffect(() => save(LS.settings, settings), [settings]);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, t] = await Promise.all([getDocsMeta(), getDocsTree()]);
      setMeta(m);
      setRoots(t?.roots ?? []);
      setRootsCount(t?.rootsCount ?? 0);
    } catch {
      setError('Failed to load documentation');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  // Auto-expand ancestors of the selected document.
  useEffect(() => {
    if (!selectedPath) return;
    const parts = selectedPath.split('/');
    parts.pop();
    const parents: string[] = [];
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      parents.push(acc);
    }
    if (parents.length === 0) return;
    setExpanded((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of parents) {
        if (!next[p]) {
          next[p] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedPath]);

  // Load search index once, lazily.
  const loadIndex = useCallback(async () => {
    setIndexLoading(true);
    try {
      const data = await getDocsIndex();
      setIndex(data?.docs ?? []);
    } finally {
      setIndexLoading(false);
    }
  }, []);

  // Load the selected document's content.
  useEffect(() => {
    let cancelled = false;
    if (!selectedPath) {
      setContent(null);
      setContentError(null);
      setContentLoading(false);
      return;
    }
    setContentLoading(true);
    setContentError(null);
    void getDocContent(selectedPath)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setContentError('Document not found');
          setContent(null);
        } else {
          setContent(data);
          setRecent((prev) => {
            const next = [
              { path: data.path, title: data.name.replace(/\.(md|mdx|markdown)$/i, ''), at: Date.now() },
              ...prev.filter((r) => r.path !== data.path),
            ].slice(0, 24);
            return next;
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContentError('Failed to load document');
          setContent(null);
        }
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const selectDoc = useCallback(
    (path: string | null) => {
      if (!path) {
        navigate('/docs', { replace: false });
        return;
      }
      navigate(`/docs?path=${encodeURIComponent(path)}`);
    },
    [navigate],
  );

  const toggleDir = useCallback((path: string) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  }, []);

  const expandAll = useCallback(() => {
    setExpanded((prev) => {
      const next: Record<string, boolean> = {};
      const walk = (nodes: DocNode[]) => {
        for (const n of nodes) {
          if (n.type === 'dir') {
            next[n.path] = true;
            walk(n.children);
          }
        }
      };
      walk(roots);
      return Object.keys(next).length > 0 ? next : prev;
    });
  }, [roots]);

  const collapseAll = useCallback(() => setExpanded({}), []);

  const toggleFavorite = useCallback((path: string) => {
    setFavorites((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
  }, []);

  const isFavorite = useCallback((path: string) => favorites.includes(path), [favorites]);

  const togglePin = useCallback((path: string) => {
    setPinned((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [path, ...prev]));
  }, []);

  const isPinned = useCallback((path: string) => pinned.includes(path), [pinned]);

  const clearRecent = useCallback(() => setRecent([]), []);

  const recordProgress = useCallback((path: string, progress: number) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h.path !== path);
      next.unshift({ path, progress, at: Date.now() });
      return next.slice(0, 50);
    });
  }, []);

  const getProgress = useCallback((path: string) => history.find((h) => h.path === path)?.progress ?? 0, [history]);

  const addSearch = useCallback((q: string) => {
    const query = q.trim();
    if (!query) return;
    setSearches((prev) => [query, ...prev.filter((s) => s !== query)].slice(0, 12));
  }, []);

  const setWidth = useCallback((panel: 'explorer' | 'toc', width: number) => {
    setWidths((prev) => ({ ...prev, [panel]: Math.max(180, Math.min(520, width)) }));
  }, []);

  const updateSettings = useCallback(<K extends keyof DocsSettings>(key: K, value: DocsSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const flat = useMemo(() => flattenDocs(roots), [roots]);

  const value = useMemo<DocsContextValue>(
    () => ({
      meta,
      roots,
      rootsCount,
      loading,
      error,
      index,
      indexLoading,
      loadIndex,
      selectedPath,
      content,
      contentLoading,
      contentError,
      selectDoc,
      refresh: loadTree,
      flat,
      expanded,
      toggleDir,
      expandAll,
      collapseAll,
      favorites,
      toggleFavorite,
      isFavorite,
      pinned,
      togglePin,
      isPinned,
      recent,
      clearRecent,
      history,
      recordProgress,
      getProgress,
      searches,
      addSearch,
      widths,
      setWidth,
      settings,
      updateSettings,
    }),
    [
      meta,
      roots,
      rootsCount,
      loading,
      error,
      index,
      indexLoading,
      loadIndex,
      selectedPath,
      content,
      contentLoading,
      contentError,
      selectDoc,
      loadTree,
      flat,
      expanded,
      toggleDir,
      expandAll,
      collapseAll,
      favorites,
      toggleFavorite,
      isFavorite,
      pinned,
      togglePin,
      isPinned,
      recent,
      clearRecent,
      history,
      recordProgress,
      getProgress,
      searches,
      addSearch,
      widths,
      setWidth,
      settings,
      updateSettings,
    ],
  );

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}

export function useDocs(): DocsContextValue {
  const ctx = useContext(DocsContext);
  if (!ctx) throw new Error('useDocs requires DocsProvider');
  return ctx;
}
