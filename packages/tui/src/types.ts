export type TuiView = 'chat' | 'sessions' | 'plans' | 'graph' | 'explorer' | 'logs' | 'telemetry';

export interface ConversationEntry {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly streaming?: boolean;
}

export interface ToolCard {
  readonly id: string;
  readonly tool: string;
  readonly label: string;
  readonly status: 'running' | 'completed' | 'failed' | 'approval-required';
  readonly startedAt: string;
  readonly detail?: string;
}

export interface AgentCard {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly task?: string;
  readonly progress?: number;
  readonly tokens?: number;
  readonly elapsedMs?: number;
}

export interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly root?: string;
  readonly branch?: string;
  readonly provider?: string;
  readonly model?: string;
}

export type TuiEvent =
  | { type: 'connection'; state: 'connecting' | 'connected' | 'disconnected' | 'error'; message?: string }
  | { type: 'workspace'; workspace: WorkspaceSummary }
  | { type: 'conversation-start'; id: string }
  | { type: 'conversation-delta'; id: string; content: string }
  | { type: 'conversation-complete'; id: string }
  | { type: 'message'; entry: ConversationEntry }
  | { type: 'tool'; card: ToolCard }
  | { type: 'agent'; agent: AgentCard }
  | { type: 'telemetry'; label: string; detail: string; timestamp: string }
  | { type: 'graph'; entities: readonly { id: string; kind: string; label: string; status?: string }[] }
  | { type: 'files'; files: readonly { path: string; status?: string }[] }
  | { type: 'notification'; level: 'success' | 'warning' | 'error' | 'info'; message: string }
  | { type: 'confirmation'; prompt: string; command: string }
  | { type: 'clear' }
  | { type: 'exit' };

export interface TuiSnapshot {
  readonly workspace?: WorkspaceSummary;
  readonly agents: readonly AgentCard[];
  readonly graphEntities: readonly { id: string; kind: string; label: string; status?: string }[];
}
