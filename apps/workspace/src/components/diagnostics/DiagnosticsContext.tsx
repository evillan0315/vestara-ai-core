/**
 * Diagnostic Center state.
 *
 * Owns polling for every diagnostics feed, keeps rolling history buffers for
 * live charts, and persists UI preferences (tab, interval, search, pause)
 * under the `vestara-diag-*` localStorage keys.
 */

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import type {
  DiagAgentState,
  DiagDocker,
  DiagEvent,
  DiagExecution,
  DiagGit,
  DiagProcess,
  DiagSummary,
  FsScan,
} from '../../lib/diagnostics';
import { diagnosticsApi } from '../../lib/diagnostics';

const LS = {
  tab: 'vestara-diag-tab',
  interval: 'vestara-diag-interval',
  search: 'vestara-diag-search',
};

export const HISTORY_LIMIT = 60;
export const INTERVAL_OPTIONS = [1000, 2000, 3000, 5000, 10000] as const;

export interface HistoryPoint {
  t: number;
  value: number;
}

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

export type DiagTab =
  | 'overview'
  | 'processes'
  | 'storage'
  | 'docker'
  | 'git'
  | 'environment'
  | 'agents'
  | 'logs'
  | 'health';

interface DiagnosticsContextValue {
  interval: number;
  setInterval: (ms: number) => void;
  paused: boolean;
  togglePause: () => void;
  activeTab: DiagTab;
  setActiveTab: (tab: DiagTab) => void;
  search: string;
  setSearch: (q: string) => void;

  summary: DiagSummary | null;
  summaryLoading: boolean;
  summaryError: string | null;
  cpuHistory: HistoryPoint[];
  memHistory: HistoryPoint[];
  refreshAll: () => void;

  processes: DiagProcess[];
  processesTotal: number;
  processesThreads: number;
  processesLoading: boolean;
  refreshProcesses: () => void;

  agents: DiagAgentState[];
  executions: DiagExecution[];
  agentsLoading: boolean;
  refreshAgents: () => void;

  events: DiagEvent[];
  eventsLoading: boolean;
  refreshEvents: () => void;

  docker: DiagDocker | null;
  refreshDocker: () => void;

  git: DiagGit | null;
  refreshGit: () => void;

  fsScan: FsScan | null;
  fsScanLoading: boolean;
  refreshFsScan: () => Promise<void>;
}

const DiagnosticsContext = createContext<DiagnosticsContextValue | null>(null);

export function DiagnosticsProvider({ children }: { children: ReactNode }) {
  const [interval, setIntervalState] = useState(() => loadNumber(LS.interval, 2000));
  const [paused, setPaused] = useState(false);
  const [activeTab, setActiveTabState] = useState<DiagTab>(
    () => (loadString(LS.tab, 'overview') as DiagTab) || 'overview',
  );
  const [search, setSearchState] = useState(() => loadString(LS.search, ''));

  const [cpuHistory, setCpuHistory] = useState<HistoryPoint[]>([]);
  const [memHistory, setMemHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => save(LS.tab, activeTab), [activeTab]);
  useEffect(() => save(LS.interval, interval), [interval]);
  useEffect(() => save(LS.search, search), [search]);

  const setInterval = useCallback((ms: number) => {
    setIntervalState(ms);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => setPaused((p) => !p), []);
  const setActiveTab = useCallback((tab: DiagTab) => setActiveTabState(tab), []);
  const setSearch = useCallback((q: string) => setSearchState(q), []);

  // Main summary feed.
  const summaryPoll = usePolling(diagnosticsApi.summary, interval, paused);

  // Live CPU / memory feeds that extend the history buffers.
  const cpuPoll = usePolling(() => diagnosticsApi.cpu(), interval, paused);
  useEffect(() => {
    if (cpuPoll.data?.usage !== undefined) {
      setCpuHistory((prev) => {
        const next = [...prev, { t: Date.now(), value: cpuPoll.data!.usage }];
        return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
      });
    }
  }, [cpuPoll.data]);

  const memPoll = usePolling(() => diagnosticsApi.memory(), interval, paused);
  useEffect(() => {
    const d = memPoll.data;
    if (d?.memory?.total) {
      const pct = (d.memory.used / d.memory.total) * 100;
      setMemHistory((prev) => {
        const next = [...prev, { t: Date.now(), value: pct }];
        return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
      });
    }
  }, [memPoll.data]);

  const processesPoll = usePolling(
    () => diagnosticsApi.processes({ limit: 1500 }),
    Math.max(interval * 2, 3000),
    paused,
  );
  const agentsPoll = usePolling(() => diagnosticsApi.agents(), Math.max(interval * 2, 3000), paused);
  const eventsPoll = usePolling(() => diagnosticsApi.events({ limit: 100 }), Math.max(interval * 2, 4000), paused);
  const dockerPoll = usePolling(() => diagnosticsApi.docker(), 10000, paused);
  const gitPoll = usePolling(() => diagnosticsApi.git(), 10000, paused);
  const [fsScan, setFsScan] = useState<FsScan | null>(null);
  const [fsScanLoading, setFsScanLoading] = useState(false);

  const refreshFsScan = useCallback(async () => {
    setFsScanLoading(true);
    try {
      const data = await diagnosticsApi.filesystem();
      setFsScan(data);
    } finally {
      setFsScanLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    void summaryPoll.refresh();
    void cpuPoll.refresh();
    void memPoll.refresh();
    void processesPoll.refresh();
    void agentsPoll.refresh();
    void eventsPoll.refresh();
    void dockerPoll.refresh();
    void gitPoll.refresh();
  }, [summaryPoll, cpuPoll, memPoll, processesPoll, agentsPoll, eventsPoll, dockerPoll, gitPoll]);

  const value = useMemo<DiagnosticsContextValue>(
    () => ({
      interval,
      setInterval,
      paused,
      togglePause,
      activeTab,
      setActiveTab,
      search,
      setSearch,
      summary: summaryPoll.data,
      summaryLoading: summaryPoll.loading,
      summaryError: summaryPoll.error,
      cpuHistory,
      memHistory,
      refreshAll,
      processes: processesPoll.data?.processes ?? [],
      processesTotal: processesPoll.data?.total ?? 0,
      processesThreads: processesPoll.data?.threads ?? 0,
      processesLoading: processesPoll.loading,
      refreshProcesses: processesPoll.refresh,
      agents: agentsPoll.data?.agents ?? [],
      executions: agentsPoll.data?.executions ?? [],
      agentsLoading: agentsPoll.loading,
      refreshAgents: agentsPoll.refresh,
      events: eventsPoll.data?.events ?? [],
      eventsLoading: eventsPoll.loading,
      refreshEvents: eventsPoll.refresh,
      docker: dockerPoll.data ?? null,
      refreshDocker: dockerPoll.refresh,
      git: gitPoll.data ?? null,
      refreshGit: gitPoll.refresh,
      fsScan,
      fsScanLoading,
      refreshFsScan,
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
      summaryPoll.data,
      summaryPoll.loading,
      summaryPoll.error,
      cpuHistory,
      memHistory,
      refreshAll,
      processesPoll.data,
      processesPoll.loading,
      processesPoll.refresh,
      agentsPoll.data,
      agentsPoll.loading,
      agentsPoll.refresh,
      eventsPoll.data,
      eventsPoll.loading,
      eventsPoll.refresh,
      dockerPoll.data,
      dockerPoll.refresh,
      gitPoll.data,
      gitPoll.refresh,
      fsScan,
      fsScanLoading,
      refreshFsScan,
    ],
  );

  return <DiagnosticsContext.Provider value={value}>{children}</DiagnosticsContext.Provider>;
}

export function useDiagnostics(): DiagnosticsContextValue {
  const ctx = useContext(DiagnosticsContext);
  if (!ctx) throw new Error('useDiagnostics requires DiagnosticsProvider');
  return ctx;
}
