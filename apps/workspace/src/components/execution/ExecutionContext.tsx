/**
 * Execution Center state.
 *
 * Polls the composed execution dashboard + event stream, loads the
 * traceability graph lazily, and persists UI preferences (tab, interval,
 * search, selected ids) under the `vestara-exec-*` localStorage keys.
 */

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import type { ExecutionDashboard, ExecutionEvent, ExecutionSession, TraceGraph } from '../../lib/execution';
import { executionApi } from '../../lib/execution';

const LS = {
  tab: 'vestara-exec-tab',
  interval: 'vestara-exec-interval',
  search: 'vestara-exec-search',
  session: 'vestara-exec-session',
};

export const INTERVAL_OPTIONS = [2000, 3000, 5000, 10000] as const;

function loadNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function loadString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage unavailable */
  }
}

export type ExecutionTab =
  | 'overview'
  | 'projects'
  | 'plans'
  | 'tasks'
  | 'agents'
  | 'executions'
  | 'artifacts'
  | 'approvals'
  | 'filesystem'
  | 'events'
  | 'metrics'
  | 'traceability';

interface ExecutionContextValue {
  interval: number;
  setInterval: (ms: number) => void;
  paused: boolean;
  togglePause: () => void;
  activeTab: ExecutionTab;
  setActiveTab: (tab: ExecutionTab) => void;
  search: string;
  setSearch: (q: string) => void;

  dashboard: ExecutionDashboard | null;
  dashboardLoading: boolean;
  dashboardError: string | null;
  refresh: () => void;

  events: ExecutionEvent[];
  eventsLoading: boolean;
  refreshEvents: () => void;

  trace: TraceGraph | null;
  traceLoading: boolean;
  traceTarget: string | null;
  loadTrace: (target?: string) => Promise<void>;

  selectedSession: string | null;
  selectSession: (id: string | null) => void;
  sessionDetail: ExecutionSession | null;
}

const ExecutionContext = createContext<ExecutionContextValue | null>(null);

export function ExecutionProvider({ children }: { children: ReactNode }) {
  const [interval, setIntervalState] = useState(() => loadNumber(LS.interval, 3000));
  const [paused, setPaused] = useState(false);
  const [activeTab, setActiveTabState] = useState<ExecutionTab>(
    (() => {
      const v = loadString(LS.tab, 'overview');
      return (v as ExecutionTab) || 'overview';
    })(),
  );
  const [search, setSearchState] = useState(() => loadString(LS.search, ''));
  const [selectedSession, setSelectedSession] = useState<string | null>(() => loadString(LS.session, '') || null);
  const [sessionDetail, setSessionDetail] = useState<ExecutionSession | null>(null);
  const [trace, setTrace] = useState<TraceGraph | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceTarget, setTraceTarget] = useState<string | null>(null);

  useEffect(() => save(LS.tab, activeTab), [activeTab]);
  useEffect(() => save(LS.interval, interval), [interval]);
  useEffect(() => save(LS.search, search), [search]);
  useEffect(() => save(LS.session, selectedSession ?? ''), [selectedSession]);

  const setInterval = useCallback((ms: number) => {
    setIntervalState(ms);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => setPaused((p) => !p), []);
  const setActiveTab = useCallback((tab: ExecutionTab) => setActiveTabState(tab), []);
  const setSearch = useCallback((q: string) => setSearchState(q), []);

  const dashboardPoll = usePolling(executionApi.dashboard, interval, paused);
  const eventsPoll = usePolling(() => executionApi.events({ limit: 200 }), Math.max(interval * 2, 4000), paused);

  const loadTrace = useCallback(async (target?: string) => {
    setTraceLoading(true);
    setTraceTarget(target ?? null);
    try {
      const graph = await executionApi.traceability(target);
      setTrace(graph);
    } finally {
      setTraceLoading(false);
    }
  }, []);

  const selectSession = useCallback((id: string | null) => {
    setSelectedSession(id);
  }, []);

  // Load the selected session's timeline detail, refreshed on each dashboard poll.
  useEffect(() => {
    const refreshKey = dashboardPoll.data?.ts ?? 0;
    if (!selectedSession) {
      setSessionDetail(null);
      return;
    }
    let cancelled = false;
    void executionApi.timeline(selectedSession).then((d) => {
      if (!cancelled && d?.session) setSessionDetail(d.session);
    });
    void refreshKey;
    return () => {
      cancelled = true;
    };
  }, [selectedSession, dashboardPoll.data]);

  const refresh = useCallback(() => {
    void dashboardPoll.refresh();
    void eventsPoll.refresh();
  }, [dashboardPoll, eventsPoll]);

  const value = useMemo<ExecutionContextValue>(
    () => ({
      interval,
      setInterval,
      paused,
      togglePause,
      activeTab,
      setActiveTab,
      search,
      setSearch,
      dashboard: dashboardPoll.data,
      dashboardLoading: dashboardPoll.loading,
      dashboardError: dashboardPoll.error,
      refresh,
      events: eventsPoll.data?.events ?? [],
      eventsLoading: eventsPoll.loading,
      refreshEvents: eventsPoll.refresh,
      trace,
      traceLoading,
      traceTarget,
      loadTrace,
      selectedSession,
      selectSession,
      sessionDetail,
    }),
    [
      interval,
      setInterval,
      paused,
      togglePause,
      activeTab,
      setActiveTab,
      search,
      setSearch,
      dashboardPoll.data,
      dashboardPoll.loading,
      dashboardPoll.error,
      refresh,
      eventsPoll.data,
      eventsPoll.loading,
      eventsPoll.refresh,
      trace,
      traceLoading,
      traceTarget,
      loadTrace,
      selectedSession,
      selectSession,
      sessionDetail,
    ],
  );

  return <ExecutionContext.Provider value={value}>{children}</ExecutionContext.Provider>;
}

export function useExecution(): ExecutionContextValue {
  const ctx = useContext(ExecutionContext);
  if (!ctx) throw new Error('useExecution requires ExecutionProvider');
  return ctx;
}
