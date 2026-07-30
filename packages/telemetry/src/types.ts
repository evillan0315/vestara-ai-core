export type AgentId = string;
export type AgentName = string;

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'reviewing'
  | 'verifying'
  | 'completed'
  | 'failed';

export type OperationType =
  | 'file.read'
  | 'file.write'
  | 'file.delete'
  | 'search'
  | 'analyze'
  | 'plan'
  | 'build'
  | 'verify'
  | 'test'
  | 'lint'
  | 'format'
  | 'review'
  | 'delegate'
  | 'reason'
  | 'decide'
  | 'unknown';

export interface AgentState {
  id: AgentId;
  name: AgentName;
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

export interface TelemetryEvent {
  agent: AgentId;
  timestamp: string;
  type: string;
  status: AgentStatus;
  operation: OperationType;
  task: string;
  filePath?: string;
  progress: number;
  phase: string;
  detail: string;
  metadata?: Record<string, unknown>;
  checks?: Array<{ name: string; status: string; durationMs: number }>;
}

export interface TelemetrySnapshot {
  agents: AgentState[];
  events: TelemetryEvent[];
  startedAt: string;
  eventCount: number;
}

export type TelemetrySubscriber = (event: TelemetryEvent) => void;
