import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAgents } from '../lib/api';
import { workspaceSocket } from '../lib/ws';
import type { WorkspaceEvent } from '../lib/ws';

// ─── Types ──────────────────────────────────────────────────────

export type AgentStatus =
  | 'idle' | 'thinking' | 'working' | 'waiting'
  | 'reviewing' | 'verifying' | 'completed' | 'failed';

export type OperationType =
  | 'file.read' | 'file.write' | 'file.delete'
  | 'search' | 'analyze' | 'plan' | 'build'
  | 'verify' | 'test' | 'lint' | 'format'
  | 'review' | 'delegate' | 'reason' | 'decide'
  | 'unknown';

export interface TelemetryEvent {
  id: string;
  agent: string;
  timestamp: string;
  type: string;
  operation: OperationType;
  status: AgentStatus;
  task: string;
  filePath?: string;
  progress: number;
  phase: string;
  detail: string;
  severity: 'info' | 'warning' | 'error';
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentState {
  id: string;
  name: string;
  status: AgentStatus;
  currentTask: string;
  currentOperation: OperationType;
  activeFilePath?: string;
  progress: number;
  elapsedMs: number;
  phase: string;
  detail: string;
  updatedAt: string;
}

export interface TelemetryStore {
  agents: AgentState[];
  events: TelemetryEvent[];
  getAgent: (id: string) => AgentState | undefined;
  getEventsByAgent: (agent: string) => TelemetryEvent[];
  eventCount: number;
}

const DEFAULT_AGENTS: Array<{ id: string; name: string }> = [
  { id: 'context', name: 'Context' },
  { id: 'developer', name: 'Developer' },
  { id: 'planner', name: 'Planner' },
  { id: 'reviewer', name: 'Reviewer' },
  { id: 'verifier', name: 'Verifier' },
];

const STATUS_WEIGHT: Record<string, number> = {
  completed: 0, idle: 0, waiting: 1, thinking: 2,
  working: 3, verifying: 3, reviewing: 3, failed: 4,
};

const AGENT_ORDER = ['context', 'developer', 'planner', 'reviewer', 'verifier'];

// ─── Helpers ────────────────────────────────────────────────────

function makeAgent(id: string, name: string): AgentState {
  return { id, name, status: 'idle', currentTask: '', currentOperation: 'unknown', progress: 0, elapsedMs: 0, phase: '', detail: '', updatedAt: '' };
}

function inferOperation(type: string): OperationType {
  if (type.startsWith('agent.file.')) return type.split('.').slice(2).join('.') as OperationType;
  if (type.startsWith('agent.')) return type.slice(6) as OperationType;
  if (type === 'verification.started' || type === 'verification.completed') return 'verify';
  return 'unknown';
}

function inferStatus(type: string, detail: string): AgentStatus {
  if (detail.startsWith('✓')) return 'completed';
  if (detail.startsWith('✗')) return 'failed';
  if (type.includes('completed')) return 'completed';
  if (type.includes('failed')) return 'failed';
  if (type.includes('started')) return 'working';
  if (type.includes('reading') || type.includes('writing')) return 'working';
  return 'working';
}

function toEvent(ws: WorkspaceEvent): TelemetryEvent | null {
  const payload = (ws as any).payload ?? {};
  const type: string = ws.type || '';
  const actor = (ws as any).actor ?? {};
  const agentId = typeof actor === 'object' ? (actor.id || 'system') : 'system';
  const detail = (ws as any).message || payload.detail || '';
  const status = inferStatus(type, detail);

  return {
    id: ws.id,
    agent: agentId,
    timestamp: ws.timestamp,
    type,
    operation: payload.operation || inferOperation(type),
    status: payload.status || status,
    task: payload.task || '',
    filePath: payload.filePath,
    progress: payload.progress ?? 0,
    phase: payload.phase || '',
    detail,
    severity: type.includes('failed') ? 'error' : type.includes('warning') ? 'warning' : 'info',
    sessionId: (ws as any).sessionId,
    metadata: payload,
  };
}

// ─── Context ────────────────────────────────────────────────────

const TelemetryContext = createContext<TelemetryStore | null>(null);

const MAX_EVENTS = 500;

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const [, setTick] = useState(0);
  const agentsRef = useRef<Map<string, AgentState>>(new Map());
  const eventsRef = useRef<TelemetryEvent[]>([]);
  const eventCountRef = useRef(0);
  const startedRef = useRef(Date.now());

  if (agentsRef.current.size === 0) {
    for (const a of DEFAULT_AGENTS) agentsRef.current.set(a.id, makeAgent(a.id, a.name));
  }

  useEffect(() => {
    // Source the agent catalog from the real registry (Vestara is the single
    // source of truth) rather than a hardcoded list. Live status updates from
    // the socket still apply on top; the corrected DEFAULT_AGENTS remain only
    // as an offline fallback if the registry fetch fails.
    void getAgents()
      .then((real) => {
        if (real.length === 0) return;
        const next = new Map<string, AgentState>();
        for (const agent of real) {
          const existing = agentsRef.current.get(agent.id);
          next.set(agent.id, existing ?? makeAgent(agent.id, agent.name || agent.id));
        }
        agentsRef.current = next;
        setTick((t) => t + 1);
      })
      .catch(() => {
        /* keep the corrected fallback catalog */
      });

    const unsub = workspaceSocket.onEvent((wsEvent: WorkspaceEvent) => {
      const ev = toEvent(wsEvent);
      if (!ev) return;

      const now = Date.now();
      const agent = agentsRef.current.get(ev.agent);
      if (agent) {
        agent.status = ev.status;
        agent.currentTask = ev.task || agent.currentTask;
        agent.currentOperation = ev.operation;
        agent.activeFilePath = ev.filePath ?? agent.activeFilePath;
        agent.progress = ev.progress ?? agent.progress;
        agent.phase = ev.phase || agent.phase;
        agent.detail = ev.detail || agent.detail;
        agent.updatedAt = ev.timestamp;
        if (ev.status === 'working' || ev.status === 'verifying') {
          agent.elapsedMs = now - startedRef.current;
        }
      }

      eventsRef.current = [ev, ...eventsRef.current].slice(0, MAX_EVENTS);
      eventCountRef.current++;
      setTick((t) => t + 1);
    });

    return unsub;
  }, []);

  const store = useMemo<TelemetryStore>(() => {
    const agents = Array.from(agentsRef.current.values())
      .sort((a, b) => AGENT_ORDER.indexOf(a.id) - AGENT_ORDER.indexOf(b.id));
    return {
      agents,
      events: eventsRef.current,
      getAgent: (id: string) => agentsRef.current.get(id),
      getEventsByAgent: (agentId: string) =>
        eventsRef.current.filter((e) => e.agent === agentId),
      eventCount: eventCountRef.current,
    };
  }, [/* re-compute on every render triggered by setTick */]);

  return (
    <TelemetryContext.Provider value={store}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetryStore(): TelemetryStore {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error('useTelemetryStore must be used within TelemetryProvider');
  return ctx;
}
