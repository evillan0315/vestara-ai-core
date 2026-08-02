/**
 * Execution Center domain — the single source of truth for the DTOs consumed
 * by the Execution Center UI and produced by the execution projections.
 *
 * Consumers (workspace UI lib, API route) must import these from this package
 * rather than re-declaring them.
 */

// ─── Pipeline ─────────────────────────────────────────────────

export interface PipelineStage {
  id: string;
  label: string;
  agents: string[];
}

// ─── Queue ────────────────────────────────────────────────────

export type QueueKind = 'session' | 'plan' | 'task' | 'execution';

export interface QueueEntry {
  id: string;
  kind: QueueKind;
  title: string;
  status: string;
  agentId?: string;
  project?: string;
  started?: string;
  updated?: string;
  priority?: string;
}

export interface QueueSummary {
  total: number;
  pending: number;
  running: number;
  blocked: number;
  waitingApproval: number;
  retrying: number;
  cancelled: number;
  completed: number;
  failed: number;
}

// ─── Approvals ────────────────────────────────────────────────

export type PendingApprovalKind = 'collaboration' | 'session';

export interface PendingApproval {
  id: string;
  kind: PendingApprovalKind;
  title: string;
  status: string;
  requestedBy: string;
  createdAt: string;
  risk?: string;
  detail?: string;
}

// ─── Filesystem ───────────────────────────────────────────────

export interface FsOperation {
  id: string;
  agent: string;
  operation: string;
  target: string;
  timestamp: string;
  status: string;
  detail: string;
}

// ─── Events ───────────────────────────────────────────────────

export interface ExecutionEvent {
  id: string;
  timestamp: string;
  category: string;
  type: string;
  actor: string;
  message: string;
  status?: string;
}

// ─── Traceability ─────────────────────────────────────────────

export type TraceNodeKind =
  | 'request'
  | 'project'
  | 'plan'
  | 'task'
  | 'execution'
  | 'agent'
  | 'capability'
  | 'artifact'
  | 'review'
  | 'verification';

export interface TraceNode {
  id: string;
  kind: TraceNodeKind;
  label: string;
  status?: string;
  meta?: string;
}

export interface TraceEdge {
  from: string;
  to: string;
  label?: string;
}

export interface TraceGraph {
  nodes: TraceNode[];
  edges: TraceEdge[];
}

// ─── Metrics ──────────────────────────────────────────────────

export interface ExecutionMetrics {
  sessions: {
    total: number;
    running: number;
    queued: number;
    completed: number;
    failed: number;
    cancelled: number;
    successRate: number;
    avgDurationMs: number;
  };
  executions: {
    total: number;
    running: number;
    completed: number;
    failed: number;
    successRate: number;
    avgDurationMs: number;
  };
  plans: { total: number; approved: number; executing: number; completed: number; cancelled: number };
  tasks: { total: number; running: number; completed: number; blocked: number; pending: number };
  agents: { total: number; active: number; utilization: number };
  fsOps: number;
  artifacts: number;
  approvalsPending: number;
  queueLength: number;
}

// ─── Sessions / executions / agents / projects ────────────────

export interface ExecutionSession {
  id: string;
  goal: string;
  workflowId?: string;
  assignedAgentIds: string[];
  planIds: string[];
  changeSetIds: string[];
  verificationIds: string[];
  logs: string[];
  timeline: Array<{ step: string; agentId: string; status: string; timestamp: string }>;
  approvals: Array<{ agentId: string; approved: boolean; reason?: string; timestamp: string }>;
  metrics: { duration: number; totalSteps: number; completedSteps: number; artifactCount: number };
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  task: string;
  inputArtifacts: string[];
  outputArtifacts: string[];
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  result?: string;
}

export interface AgentState {
  id: string;
  name: string;
  status: string;
  currentTask: string;
  currentOperation: string;
  activeFilePath?: string;
  progress: number;
  elapsedMs: number;
  phase: string;
  detail: string;
  updatedAt: string;
}

export interface ProjectWithStats {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  stats?: Record<string, unknown>;
}

export interface ExecutionDashboard {
  ts: number;
  projects: ProjectWithStats[];
  plans: Array<Record<string, unknown>>;
  changeSets: Array<Record<string, unknown>>;
  verifications: Array<Record<string, unknown>>;
  collaboration: Array<Record<string, unknown>>;
  sessions: ExecutionSession[];
  executions: AgentExecution[];
  agents: AgentState[];
  approvals: PendingApproval[];
  queue: QueueEntry[];
  queueSummary: QueueSummary;
  metrics: ExecutionMetrics;
  pipeline: PipelineStage[];
}

// ─── Source records (structural inputs to projections) ────────

export interface PlanTaskRecord {
  id: string;
  summary?: string;
  status?: string;
  effort?: string;
}

export interface PlanRecord {
  id: string;
  title?: string;
  goal?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  tasks?: readonly PlanTaskRecord[];
}

export interface ChangeSetRecord {
  id: string;
  status?: string;
  planId?: string;
  createdAt?: string;
}

export interface VerificationRecord {
  id: string;
  status?: string;
  changeSetId?: string;
}

export interface CollaborationRecord {
  id: string;
  status?: string;
  changeSetId?: string;
  planId?: string;
  createdAt?: string;
  ownership?: { owner?: { name?: string } };
}

export interface ExecutionSessionRecord {
  id: string;
  goal?: string;
  status: string;
  createdAt?: string;
  completedAt?: string;
  approvals?: readonly { agentId?: string; approved?: boolean; status?: string; timestamp?: string }[];
}

export interface AgentExecutionRecord {
  id: string;
  agentId?: string;
  task?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentStateRecord {
  id: string;
  name?: string;
  status?: string;
}

export interface TelemetryEventRecord {
  agent: string;
  operation?: string;
  status?: string;
  timestamp: string;
  filePath?: string;
  task?: string;
  detail?: string;
}
