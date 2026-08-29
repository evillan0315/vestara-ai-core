import type {
  AgentEnvironmentId,
  AgentTurnId,
  ApprovalRequestId,
  CausationId,
  CorrelationId,
  RepositoryBindingId,
  TaskThreadId,
  ThreadItemId,
  ToolCallId,
} from './ids';

export type AgentRunState =
  | 'queued'
  | 'preparing'
  | 'reasoning'
  | 'awaiting-tool'
  | 'executing-tool'
  | 'awaiting-approval'
  | 'verifying'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentTerminalState = Extract<AgentRunState, 'blocked' | 'completed' | 'failed' | 'cancelled'>;

export type TaskThreadStatus = 'active' | 'blocked' | 'completed' | 'failed' | 'cancelled' | 'archived';

export type ThreadItemKind =
  | 'harness-run'
  | 'user-message'
  | 'steering-message'
  | 'agent-message'
  | 'model-response'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'approval-decision'
  | 'verification-result'
  | 'revision-request'
  | 'state-transition'
  | 'final-outcome';

export type ToolRisk = 'low' | 'medium' | 'high' | 'critical';

export type PolicyDecision = 'allow' | 'allow-and-notify' | 'require-approval' | 'require-sandbox' | 'deny';

export interface AgentEnvironment {
  readonly id: AgentEnvironmentId;
  readonly kind: 'local' | 'sandbox' | 'container' | 'cloud' | 'remote';
  readonly workspaceRoot: string;
  /** ARX-015 M5: Authoritative repository binding linking this environment to a repository. */
  readonly repositoryBindingId?: RepositoryBindingId;
  readonly networkPolicy: 'deny' | 'restricted' | 'allow';
  readonly filesystemPolicy: 'read-only' | 'workspace-write' | 'unrestricted';
  readonly processPolicy: 'deny' | 'restricted' | 'allow';
}

export interface AgentRunOutcome {
  readonly state: AgentTerminalState;
  readonly summary: string;
  readonly reasonCode?: string;
  readonly completedAt: string;
}

export interface TaskThread {
  readonly id: TaskThreadId;
  readonly taskId: string;
  readonly title: string;
  readonly status: TaskThreadStatus;
  readonly environmentId: AgentEnvironmentId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface AgentTurn {
  readonly id: AgentTurnId;
  readonly threadId: TaskThreadId;
  readonly sequence: number;
  readonly state: AgentRunState;
  readonly input: string;
  readonly outcome?: AgentRunOutcome;
  readonly startedAt: string;
  readonly completedAt?: string;
}

export interface ThreadItem<TPayload = Readonly<Record<string, unknown>>> {
  readonly id: ThreadItemId;
  readonly threadId: TaskThreadId;
  readonly turnId: AgentTurnId;
  readonly sequence: number;
  readonly kind: ThreadItemKind;
  readonly actorId: string;
  readonly payload: TPayload;
  readonly createdAt: string;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
}

export interface ToolCallPayload extends Readonly<Record<string, unknown>> {
  readonly callId: ToolCallId;
  readonly toolName: string;
  readonly input: unknown;
  readonly risk: ToolRisk;
}

export interface ToolResultPayload extends Readonly<Record<string, unknown>> {
  readonly callId: ToolCallId;
  readonly toolName: string;
  readonly status: 'completed' | 'failed' | 'cancelled';
  readonly output?: unknown;
  readonly error?: string;
  readonly evidence: readonly EvidenceArtifact[];
}

export interface ApprovalRequestPayload extends Readonly<Record<string, unknown>> {
  readonly approvalId: ApprovalRequestId;
  readonly callId: ToolCallId;
  readonly toolName: string;
  readonly reason: string;
  readonly risk: ToolRisk;
}

export interface EvidenceArtifact {
  readonly id: string;
  readonly kind: 'command' | 'file' | 'test' | 'log' | 'screenshot' | 'api' | 'environment' | 'custom';
  readonly summary: string;
  readonly uri?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface HarnessVerificationResult {
  readonly status: 'passed' | 'failed' | 'inconclusive' | 'blocked';
  readonly checks: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: 'passed' | 'failed' | 'skipped' | 'blocked';
    readonly summary: string;
  }[];
  readonly evidence: readonly EvidenceArtifact[];
  readonly uncoveredRisks: readonly string[];
  readonly confidence: number;
}

export interface PolicyEvaluationInput {
  readonly agentId: string;
  readonly taskId: string;
  readonly toolName: string;
  readonly risk: ToolRisk;
  readonly environmentId: AgentEnvironmentId;
  readonly affectedResources: readonly string[];
  readonly predictedImpact?: string;
}

export interface PolicyEvaluationResult {
  readonly decision: PolicyDecision;
  readonly reason: string;
}
