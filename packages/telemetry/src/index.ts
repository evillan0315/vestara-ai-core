import type {
  AgentId,
  AgentName,
  AgentState,
  AgentStatus,
  OperationType,
  TelemetryEvent,
  TelemetrySubscriber,
} from './types.js';

export type { AgentId, AgentName, AgentState, AgentStatus, OperationType, TelemetryEvent, TelemetrySubscriber };

const DEFAULT_AGENTS: Array<{ id: string; name: string }> = [
  { id: 'context', name: 'Context' },
  { id: 'planner', name: 'Planner' },
  { id: 'engineer', name: 'Engineer' },
  { id: 'reviewer', name: 'Reviewer' },
  { id: 'verifier', name: 'Verifier' },
];

export class TelemetryRuntime {
  private agents: Map<AgentId, AgentState> = new Map();
  private events: TelemetryEvent[] = [];
  private subscribers: Set<TelemetrySubscriber> = new Set();
  private startedAt: string;
  private eventCount = 0;
  private maxEvents: number;

  constructor(maxEvents = 1000) {
    this.maxEvents = maxEvents;
    this.startedAt = new Date().toISOString();
    for (const a of DEFAULT_AGENTS) {
      this.agents.set(a.id, this.makeState(a.id, a.name, 'idle'));
    }
  }

  private makeState(id: string, name: string, status: AgentStatus): AgentState {
    return {
      id,
      name,
      status,
      currentTask: '',
      currentOperation: 'unknown',
      progress: 0,
      elapsedMs: 0,
      phase: '',
      detail: '',
      updatedAt: new Date().toISOString(),
    };
  }

  private update(): AgentState | undefined {
    return undefined;
  }

  private persist(event: TelemetryEvent): void {
    const agent = this.agents.get(event.agent);
    if (!agent) return;

    agent.status = event.status;
    agent.currentTask = event.task;
    agent.currentOperation = event.operation;
    agent.activeFilePath = event.filePath;
    agent.progress = event.progress;
    agent.phase = event.phase;
    agent.detail = event.detail;
    agent.updatedAt = event.timestamp;
    if (event.status === 'working' || event.status === 'thinking') {
      agent.elapsedMs = Date.now() - new Date(this.startedAt).getTime();
    }

    this.events.push(event);
    this.eventCount++;
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch {}
    }
  }

  track(event: TelemetryEvent): void {
    this.persist(event);
  }

  trackOp(
    agentId: AgentId,
    status: AgentStatus,
    operation: OperationType,
    task: string,
    opts?: {
      filePath?: string;
      progress?: number;
      phase?: string;
      detail?: string;
      metadata?: Record<string, unknown>;
      checks?: Array<{ name: string; status: string; durationMs: number }>;
    },
  ): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.persist({
      agent: agentId,
      timestamp: new Date().toISOString(),
      type: `agent.${operation}`,
      status,
      operation,
      task: task || agent.currentTask,
      filePath: opts?.filePath,
      progress: opts?.progress ?? agent.progress,
      phase: opts?.phase ?? agent.phase,
      detail: opts?.detail ?? '',
      metadata: opts?.metadata,
      checks: opts?.checks,
    });
  }

  setStatus(agentId: AgentId, status: AgentStatus, detail?: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.status = status;
    if (detail !== undefined) agent.detail = detail;
    agent.updatedAt = new Date().toISOString();
  }

  setTask(agentId: AgentId, task: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.currentTask = task;
    agent.updatedAt = new Date().toISOString();
  }

  setProgress(agentId: AgentId, progress: number, detail?: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.progress = progress;
    if (detail !== undefined) agent.detail = detail;
    agent.updatedAt = new Date().toISOString();
  }

  addAgent(id: AgentId, name: AgentName): void {
    if (!this.agents.has(id)) {
      this.agents.set(id, this.makeState(id, name, 'idle'));
    }
  }

  removeAgent(id: AgentId): void {
    this.agents.delete(id);
  }

  getAgent(id: AgentId): AgentState | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): AgentState[] {
    return Array.from(this.agents.values());
  }

  getEvents(limit = 50): TelemetryEvent[] {
    return this.events.slice(-limit);
  }

  getEventCount(): number {
    return this.eventCount;
  }

  subscribe(sub: TelemetrySubscriber): () => void {
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  snapshot(): import('./types.js').TelemetrySnapshot {
    return {
      agents: this.getAllAgents(),
      events: this.getEvents(100),
      startedAt: this.startedAt,
      eventCount: this.eventCount,
    };
  }

  reset(): void {
    this.agents.clear();
    this.events = [];
    this.eventCount = 0;
    this.startedAt = new Date().toISOString();
    for (const a of DEFAULT_AGENTS) {
      this.agents.set(a.id, this.makeState(a.id, a.name, 'idle'));
    }
  }
}
