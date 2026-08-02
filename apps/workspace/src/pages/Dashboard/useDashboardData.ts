import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Execution, MilestoneResponse } from '../../components/dashboard/constants';
import { fetchExecutions, fetchMilestones, REFRESH_EVENTS } from '../../components/dashboard/constants';
import { threadIdFromSession } from '../../lib/agent-harness';
import { workflowApi, type WorkflowProjection } from '../../lib/workflow';
import type { AgentData, PlanData, WorkspaceData } from '../../lib/api';
import { getAgents, getPlans, getSuggestions, getWorkflow, getWorkspace } from '../../lib/api';
import { useEventStream } from '../../lib/useEventStream';
import { workspaceSocket } from '../../lib/ws';

export interface DashboardData {
  workspace: WorkspaceData | null;
  agents: AgentData[];
  plans: PlanData[];
  suggestions: Array<{
    id: string;
    priority: string;
    title: string;
    description?: string;
    impact?: string;
    category?: string;
  }>;
  milestones: MilestoneResponse | null;
  health: Record<string, unknown> | null;
  executions: Execution[];
  execSessions: Record<string, unknown>[];
  workflows: Array<{ id: string; label: string; steps: number }>;
  projects: Record<string, unknown>[];
  sprints: { sprints: Record<string, unknown>[]; active: Record<string, unknown>[] };
  logEvents: Array<{
    id: string;
    timestamp: string;
    category: string;
    type: string;
    message: string;
    actor: { name: string };
  }>;
  loading: boolean;
  error: string | null;
  lastRefresh: string;
  connected: boolean;
  events: ReturnType<typeof useEventStream>['events'];
  execStats: {
    total: number;
    completed: number;
    failed: number;
    running: number;
  };
  activityStats: {
    lastHour: number;
    uniqueActors: number;
    totalEvents: number;
  };
  activeMilestones: MilestoneResponse['milestones'];
  upcomingMilestones: MilestoneResponse['milestones'];
  recentCompletions: MilestoneResponse['milestones'];
  activeSession: Record<string, unknown> | undefined;
  refresh: () => void;
  updateMilestoneStatus: (version: string, status: string) => Promise<void>;
}

export function useDashboardData(): DashboardData {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [suggestions, setSuggestions] = useState<
    Array<{ id: string; priority: string; title: string; description?: string; impact?: string; category?: string }>
  >([]);
  const [milestones, setMilestones] = useState<MilestoneResponse | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [execSessions, setExecSessions] = useState<Record<string, unknown>[]>([]);
  const [workflows, setWorkflows] = useState<Array<{ id: string; label: string; steps: number }>>([]);
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [sprints, setSprints] = useState<{ sprints: Record<string, unknown>[]; active: Record<string, unknown>[] }>({
    sprints: [],
    active: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date().toISOString());
  const [logEvents, setLogEvents] = useState<
    Array<{ id: string; timestamp: string; category: string; type: string; message: string; actor: { name: string } }>
  >([]);

  const { connected, events } = useEventStream();

  const refresh = useCallback(() => {
    const now = new Date().toISOString();
    Promise.all([
      getWorkspace(),
      getAgents(),
      getPlans(),
      getSuggestions(),
      getWorkflow(),
      fetchMilestones(),
      fetchExecutions(),
      fetch('/api/health').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/projects').then((r) => (r.ok ? r.json() : { projects: [] })),
      fetch('/api/sprints').then((r) => (r.ok ? r.json() : { sprints: [], active: [] })),
      fetch('/api/sessions/executions').then((r) => (r.ok ? r.json() : { sessions: [] })),
      fetch('/api/workflows').then((r) => (r.ok ? r.json() : { workflows: [] })),
      fetch('/api/activity-log').then((r) => (r.ok ? r.json() : { events: [] })),
    ])
      .then(([w, a, pl, sug, wf, ms, ex, h, pjs, sps, exs, wfs, logs]) => {
        if (w) setWorkspace(w);
        setAgents(a);
        setPlans(pl);
        setSuggestions(sug);
        if (ms) setMilestones(ms);
        if (h) setHealth(h);
        setExecutions(ex);
        setProjects(pjs.projects ?? []);
        if (sps) setSprints(sps);
        if (exs) setExecSessions(exs.sessions ?? []);
        if (wfs) setWorkflows(wfs.workflows ?? []);
        if (logs?.events) setLogEvents(logs.events.slice(0, 5));
        setLastRefresh(now);
      })
      .catch(() => setError('Failed to connect to workspace API'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const off = workspaceSocket.onEvent((event) => {
      if (REFRESH_EVENTS.has(event.type)) {
        getWorkspace().then((w) => {
          if (w) setWorkspace(w);
        });
        getAgents().then(setAgents);
        getPlans().then(setPlans);
        if (event.type === 'milestone:completed') fetchMilestones().then(setMilestones);
        if (
          event.type === 'plan.created' ||
          event.type === 'plan.approved' ||
          event.type === 'plan.completed' ||
          event.type === 'session.created' ||
          event.type === 'agent.started' ||
          event.type === 'agent.completed'
        ) {
          fetch('/api/sessions/executions')
            .then((r) => (r.ok ? r.json() : { sessions: [] }))
            .then((d) => setExecSessions(d.sessions ?? []));
        }
      }
    });
    return off;
  }, []);

  const updateMilestoneStatus = async (version: string, status: string) => {
    await fetch('/api/milestones', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, data: { status } }),
    });
    refresh();
  };

  const execStats = useMemo(
    () => ({
      total: executions.length,
      completed: executions.filter((e) => e.status === 'completed').length,
      failed: executions.filter((e) => e.status === 'failed').length,
      running: executions.filter((e) => e.status === 'running' || e.status === 'queued').length,
    }),
    [executions],
  );

  const activityStats = useMemo(() => {
    const cut = Date.now() - 86_400_000;
    const recent = events.filter((e) => new Date(e.timestamp).getTime() >= cut);
    const lastHour = recent.filter((e) => Date.now() - new Date(e.timestamp).getTime() < 3_600_000);
    return {
      lastHour: lastHour.length,
      uniqueActors: new Set(recent.map((e) => e.actor.name)).size,
      totalEvents: recent.length,
    };
  }, [events]);

  const { activeMilestones, upcomingMilestones, recentCompletions } = useMemo(() => {
    if (!milestones) return { activeMilestones: [], upcomingMilestones: [], recentCompletions: [] };
    return {
      activeMilestones: milestones.milestones.filter((m) => m.status === 'in_progress'),
      upcomingMilestones: milestones.milestones.filter((m) => m.status === 'pending').slice(0, 4),
      recentCompletions: milestones.milestones.filter((m) => m.status === 'completed').slice(0, 4),
    };
  }, [milestones]);

  const activeSession = execSessions.find((s) => s.status === 'running' || s.status === 'queued');

  return {
    workspace,
    agents,
    plans,
    suggestions,
    milestones,
    health,
    executions,
    execSessions,
    workflows,
    projects,
    sprints,
    logEvents,
    loading,
    error,
    lastRefresh,
    connected,
    events,
    execStats,
    activityStats,
    activeMilestones,
    upcomingMilestones,
    recentCompletions,
    activeSession,
    refresh,
    updateMilestoneStatus,
  };
}
