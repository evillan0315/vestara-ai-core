/**
 * FILES-EDITOR-001 F-E-2: Editor tab state.
 *
 * Local (feature-scoped) tab model: open/dedupe/activate/close with
 * per-tab draft isolation. Draft ≠ Persisted Content: `drafts[path]` holds
 * unsaved edits, `dirty[path]` flags divergence; the persisted content lives
 * in the loader cache owned by the browser, saves go through /api/files/*.
 *
 * Architecture Traceability:
 *   IDE-RECOVERY-001 §F (ai-planner multiTabEditorStore, adapted to Vestara
 *   local-hook state — no Nanostores, no router query coupling).
 */

import { useCallback, useMemo, useState } from 'react';

export interface EditorTab {
  readonly path: string;
  readonly name: string;
}

interface TabListState {
  readonly tabs: readonly EditorTab[];
  readonly activePath: string | null;
}

export interface UseEditorTabsReturn {
  readonly tabs: readonly EditorTab[];
  readonly activePath: string | null;
  readonly drafts: Readonly<Record<string, string>>;
  readonly dirty: Readonly<Record<string, boolean>>;
  openTab: (path: string, name: string) => void;
  closeTab: (path: string) => void;
  closeAllTabs: () => void;
  setActive: (path: string | null) => void;
  setDraft: (path: string, draft: string, isDirty: boolean) => void;
  markSaved: (path: string) => void;
  /** True when the tab holds unsaved edits (close guard). */
  isDirty: (path: string) => boolean;
}

export function useEditorTabs(): UseEditorTabsReturn {
  const [list, setList] = useState<TabListState>({ tabs: [], activePath: null });
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [dirty, setDirty] = useState<Readonly<Record<string, boolean>>>({});

  const openTab = useCallback((path: string, name: string) => {
    setList((prev) => ({
      tabs: prev.tabs.some((t) => t.path === path) ? prev.tabs : [...prev.tabs, { path, name }],
      activePath: path,
    }));
  }, []);

  const closeTab = useCallback((path: string) => {
    setList((prev) => {
      const idx = prev.tabs.findIndex((t) => t.path === path);
      if (idx < 0) return prev;
      const tabs = prev.tabs.filter((t) => t.path !== path);
      let activePath = prev.activePath;
      if (activePath === path) {
        activePath = tabs.length === 0 ? null : tabs[Math.min(idx, tabs.length - 1)].path;
      }
      return { tabs, activePath };
    });
    setDrafts((prev) => {
      if (!(path in prev)) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setDirty((prev) => {
      if (!(path in prev)) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const closeAllTabs = useCallback(() => {
    setList({ tabs: [], activePath: null });
    setDrafts({});
    setDirty({});
  }, []);

  const setActive = useCallback((path: string | null) => {
    setList((prev) => {
      if (path === null) return prev.activePath === null ? prev : { ...prev, activePath: null };
      if (prev.activePath === path || !prev.tabs.some((t) => t.path === path)) return prev;
      return { ...prev, activePath: path };
    });
  }, []);

  const setDraft = useCallback((path: string, draft: string, isDirty: boolean) => {
    setDrafts((prev) => (prev[path] === draft ? prev : { ...prev, [path]: draft }));
    setDirty((prev) => (prev[path] === isDirty ? prev : { ...prev, [path]: isDirty }));
  }, []);

  const markSaved = useCallback((path: string) => {
    setDrafts((prev) => {
      if (!(path in prev)) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setDirty((prev) => (prev[path] ? { ...prev, [path]: false } : prev));
  }, []);

  const isDirty = useCallback((path: string) => dirty[path] === true, [dirty]);

  return useMemo(
    () => ({
      tabs: list.tabs,
      activePath: list.activePath,
      drafts,
      dirty,
      openTab,
      closeTab,
      closeAllTabs,
      setActive,
      setDraft,
      markSaved,
      isDirty,
    }),
    [list, drafts, dirty, openTab, closeTab, closeAllTabs, setActive, setDraft, markSaved, isDirty],
  );
}
