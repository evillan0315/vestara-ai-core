/**
 * Engineering Graph global state.
 *
 * Provides the Universal Inspector + graph search to every Workspace page.
 * Mounted once in ShellLayout. Also listens for the `vestara:inspect` custom
 * event so any module can deep-link into the inspector.
 */

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  GraphEntity,
  GraphEvent,
  GraphHealth,
  GraphInsight,
  GraphRelationship,
  GraphStats,
  GraphTimelineEntry,
  GraphTrace,
} from '../../lib/graph';
import { graphApi } from '../../lib/graph';

interface InspectorState {
  open: boolean;
  entityId: string | null;
  entity: GraphEntity | null;
  relationships: GraphRelationship[];
  backlinks: GraphRelationship[];
  trace: GraphTrace | null;
  timeline: GraphTimelineEntry[];
  history: GraphEvent[];
  loading: boolean;
}

interface GraphContextValue {
  stats: GraphStats | null;
  refreshStats: () => Promise<void>;
  insights: GraphInsight[];
  refreshInsights: () => Promise<void>;
  health: GraphHealth | null;
  refreshHealth: () => Promise<void>;

  inspector: InspectorState;
  openInspector: (id: string) => void;
  closeInspector: () => void;
  refreshInspector: () => Promise<void>;

  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
}

const INITIAL_INSPECTOR: InspectorState = {
  open: false,
  entityId: null,
  entity: null,
  relationships: [],
  backlinks: [],
  trace: null,
  timeline: [],
  history: [],
  loading: false,
};

const GraphContext = createContext<GraphContextValue | null>(null);

export function GraphProvider({ children }: { children: ReactNode }) {
  const [inspector, setInspector] = useState<InspectorState>(INITIAL_INSPECTOR);
  const [searchOpen, setSearchOpen] = useState(false);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [insights, setInsights] = useState<GraphInsight[]>([]);
  const [health, setHealth] = useState<GraphHealth | null>(null);

  const refreshStats = useCallback(async () => {
    const data = await graphApi.stats();
    setStats(data?.stats ?? null);
  }, []);

  const refreshInsights = useCallback(async () => {
    const data = await graphApi.insights();
    setInsights(data?.insights ?? []);
  }, []);

  const refreshHealth = useCallback(async () => {
    const data = await graphApi.health();
    setHealth(data?.health ?? null);
  }, []);

  const loadInspector = useCallback(async (id: string) => {
    setInspector((prev) => ({ ...prev, open: true, entityId: id, loading: true }));
    const [entityData, traceData, timelineData, historyData] = await Promise.all([
      graphApi.entity(id),
      graphApi.trace(id),
      graphApi.timeline(id),
      graphApi.history(id),
    ]);
    setInspector({
      open: true,
      entityId: id,
      entity: entityData?.entity ?? null,
      relationships: entityData?.relationships ?? [],
      backlinks: entityData?.backlinks ?? [],
      trace: traceData ?? null,
      timeline: timelineData?.timeline ?? [],
      history: historyData?.history ?? [],
      loading: false,
    });
  }, []);

  const openInspector = useCallback(
    (id: string) => {
      void loadInspector(id);
    },
    [loadInspector],
  );

  const closeInspector = useCallback(() => {
    setInspector(INITIAL_INSPECTOR);
  }, []);

  const refreshInspector = useCallback(async () => {
    if (inspector.entityId) await loadInspector(inspector.entityId);
  }, [inspector.entityId, loadInspector]);

  // Allow any module (or plain DOM code) to deep-link into the inspector.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) openInspector(id);
    };
    window.addEventListener('vestara:inspect', handler);
    return () => window.removeEventListener('vestara:inspect', handler);
  }, [openInspector]);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const value = useMemo<GraphContextValue>(
    () => ({
      stats,
      refreshStats,
      insights,
      refreshInsights,
      health,
      refreshHealth,
      inspector,
      openInspector,
      closeInspector,
      refreshInspector,
      searchOpen,
      openSearch,
      closeSearch,
    }),
    [
      stats,
      refreshStats,
      insights,
      refreshInsights,
      health,
      refreshHealth,
      inspector,
      openInspector,
      closeInspector,
      refreshInspector,
      searchOpen,
      openSearch,
      closeSearch,
    ],
  );

  return <GraphContext.Provider value={value}>{children}</GraphContext.Provider>;
}

export function useGraph(): GraphContextValue {
  const ctx = useContext(GraphContext);
  if (!ctx) throw new Error('useGraph requires GraphProvider');
  return ctx;
}

/** Convenience for non-hook code paths (e.g. event handlers in other modules). */
export function inspectEntity(entityId: string): void {
  window.dispatchEvent(new CustomEvent('vestara:inspect', { detail: entityId }));
}
