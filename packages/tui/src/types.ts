export type TuiView =
  | 'chat'
  | 'sessions'
  | 'plans'
  | 'graph'
  | 'explorer'
  | 'logs'
  | 'telemetry'
  | 'execution'
  | 'workflow'
  | 'artifacts'
  | 'settings';

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
  readonly providers?: Readonly<Record<string, { readonly configured: boolean; readonly source?: string }>>;
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

export interface LogEntry {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly timestamp: string;
}

export interface Toast {
  readonly id: string;
  readonly level: 'success' | 'warning' | 'error' | 'info';
  readonly message: string;
}

/** Declarative extension point. Extensions supply data, never Ink components. */
export interface TuiViewContribution {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly command?: string;
}

// ─── Harness execution projections (mirror @vestara/tui-protocol) ─────────

export interface HarnessThreadSummary {
  readonly id: string;
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly phase: string;
  readonly environmentId: string;
  readonly attentionRequired: boolean;
}

export interface HarnessActivityItem {
  readonly id: string;
  readonly kind: 'intent' | 'tool' | 'command' | 'filesystem' | 'diff' | 'verification' | 'approval' | 'system';
  readonly label: string;
  readonly detail?: string;
  readonly status: string;
  readonly timestamp: string;
  readonly agentId?: string;
}

export interface HarnessDiffLine {
  readonly kind: 'context' | 'addition' | 'deletion';
  readonly oldLine?: number;
  readonly newLine?: number;
  readonly content: string;
}

export interface HarnessDiffHunk {
  readonly id: string;
  readonly header: string;
  readonly lines: readonly HarnessDiffLine[];
}

export interface HarnessFileChange {
  readonly path: string;
  readonly previousPath?: string;
  readonly operation: 'create' | 'update' | 'delete' | 'rename';
  readonly additions: number;
  readonly deletions: number;
  readonly hunks?: readonly HarnessDiffHunk[];
  readonly preExisting: boolean;
}

export interface HarnessApproval {
  readonly id: string;
  readonly tool: string;
  readonly risk: string;
  readonly reason: string;
  readonly resources: readonly string[];
  readonly status: 'pending' | 'approved' | 'denied';
}

export interface HarnessVerification {
  readonly runId: string;
  readonly status: string;
  readonly confidence?: number;
  readonly checks: readonly { id: string; name: string; status: string; summary: string }[];
  readonly uncoveredRisks: readonly string[];
}

export interface HarnessCommandExecution {
  readonly id: string;
  readonly command: string;
  readonly status: string;
  readonly exitCode?: number;
}

export interface HarnessTaskSnapshot {
  readonly schemaVersion: number;
  readonly sequence: number;
  readonly generatedAt: string;
  readonly thread: {
    readonly id: string;
    readonly taskId: string;
    readonly title: string;
    readonly status: string;
    readonly activeAgentId?: string;
    readonly environmentId: string;
    readonly branch?: string;
    readonly phase: string;
    readonly changedFileCount: number;
    readonly verificationStatus?: string;
    readonly attentionRequired: boolean;
  };
  readonly activity: readonly HarnessActivityItem[];
  readonly changes: readonly HarnessFileChange[];
  readonly executions: readonly HarnessCommandExecution[];
  readonly verification?: HarnessVerification;
  readonly approvals: readonly HarnessApproval[];
}

// ─── Workflow lifecycle projection (mirror @vestara/workflow-projections) ──

export interface WorkflowStageSummary {
  readonly id: string;
  readonly label: string;
  readonly status: 'pending' | 'active' | 'completed' | 'blocked' | 'failed' | 'skipped';
  readonly durationMs?: number;
  readonly agentId?: string;
  readonly tools: readonly string[];
  readonly files: readonly string[];
  readonly blockingReason?: string;
}

export interface WorkflowAgentSummary {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly activeTool?: string;
}

export interface WorkflowSwimlaneSummary {
  readonly agentId: string;
  readonly agentName: string;
  readonly segments: readonly {
    readonly stageId: string;
    readonly status: WorkflowStageSummary['status'];
    readonly durationMs?: number;
  }[];
}

export interface WorkflowApprovalSummary {
  readonly id: string;
  readonly tool: string;
  readonly status: 'pending' | 'approved' | 'denied';
}

export interface WorkflowProjectionSummary {
  readonly workflowId: string;
  readonly threadId: string;
  readonly runId: string;
  readonly status: string;
  readonly currentStageId?: string;
  readonly stages: readonly WorkflowStageSummary[];
  readonly agents: readonly WorkflowAgentSummary[];
  readonly swimlanes: readonly WorkflowSwimlaneSummary[];
  readonly approvals: readonly WorkflowApprovalSummary[];
  readonly verification?: { readonly status: string; readonly confidence?: number };
  readonly metrics: {
    readonly elapsedMs: number;
    readonly stagesCompleted: number;
    readonly toolsInvoked: number;
    readonly filesChanged: number;
    readonly additions: number;
    readonly deletions: number;
  };
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
  | { type: 'harness-threads'; threads: readonly HarnessThreadSummary[] }
  | { type: 'harness-task'; snapshot: HarnessTaskSnapshot }
  | { type: 'workflow'; workflow: WorkflowProjectionSummary }
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
