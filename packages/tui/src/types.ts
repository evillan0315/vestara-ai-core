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

export interface RoutingAgent {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly status: string;
  readonly provider?: string;
  readonly model?: string;
}

export interface RoutingCandidate {
  readonly ref: { readonly providerId: string; readonly modelId: string; readonly modelRevision?: string };
  readonly providerName: string;
  readonly locality: 'local' | 'cloud';
  readonly availability: { readonly available: boolean; readonly state: string };
}

export interface RoutingSelection {
  readonly revision: number;
  readonly profileId: string;
  readonly roles: Readonly<Record<string, { readonly providerId: string; readonly modelId: string } | undefined>>;
  readonly agents: readonly RoutingAgent[];
  readonly candidates: readonly RoutingCandidate[];
  readonly activeAgentId?: string;
}

export interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly root?: string;
  readonly branch?: string;
  readonly provider?: string;
  readonly model?: string;
}

export interface PlanSummary {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly status: string;
  readonly taskCount: number;
  readonly updatedAt?: string;
}

export interface SessionSummary {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly status: string;
  readonly participantCount: number;
  readonly createdAt?: string;
}

export interface FileSummary {
  readonly path: string;
  readonly status?: string;
}

/** Declarative extension point. Extensions supply data, never Ink components. */
export interface TuiViewContribution {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly command?: string;
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
  | { type: 'routing'; routing: RoutingSelection }
  | { type: 'telemetry'; label: string; detail: string; timestamp: string }
  | { type: 'graph'; entities: readonly { id: string; kind: string; label: string; status?: string }[] }
  | { type: 'files'; files: readonly FileSummary[] }
  | { type: 'plans'; plans: readonly PlanSummary[] }
  | { type: 'sessions'; sessions: readonly SessionSummary[] }
  | { type: 'navigate'; view: TuiView }
  | { type: 'notification'; level: 'success' | 'warning' | 'error' | 'info'; message: string }
  | { type: 'confirmation'; prompt: string; command: string }
  | { type: 'clear' }
  | { type: 'exit' };

export interface TuiSnapshot {
  readonly workspace?: WorkspaceSummary;
  readonly agents: readonly AgentCard[];
  readonly graphEntities: readonly { id: string; kind: string; label: string; status?: string }[];
}
