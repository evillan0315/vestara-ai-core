export const TUI_PROTOCOL_VERSION = 1 as const;

import type { AssistantExecutionDetail } from '@vestara/shared';

export interface StreamEnvelope<TEvent extends TuiDomainEvent = TuiDomainEvent> {
  readonly schemaVersion: typeof TUI_PROTOCOL_VERSION;
  readonly eventId: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly threadId: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly event: TEvent;
}

export type ActivityStatus = 'pending' | 'active' | 'completed' | 'failed' | 'blocked';
export interface ActivityItem {
  readonly id: string;
  readonly kind: 'intent' | 'tool' | 'command' | 'filesystem' | 'diff' | 'verification' | 'approval' | 'system';
  readonly label: string;
  readonly detail?: string;
  readonly status: ActivityStatus;
  readonly timestamp: string;
  readonly agentId?: string;
  readonly evidenceIds: readonly string[];
}
export interface CommandExecutionProjection {
  readonly id: string;
  readonly command: string;
  readonly cwd?: string;
  readonly status: ActivityStatus;
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly truncated: boolean;
  readonly evidenceIds: readonly string[];
}
export interface DiffLine {
  readonly kind: 'context' | 'addition' | 'deletion';
  readonly oldLine?: number;
  readonly newLine?: number;
  readonly content: string;
}
export interface DiffHunk {
  readonly id: string;
  readonly header: string;
  readonly oldStart: number;
  readonly newStart: number;
  readonly lines: readonly DiffLine[];
}
export interface TaskFileChange {
  readonly taskId: string;
  readonly agentId?: string;
  readonly path: string;
  readonly previousPath?: string;
  readonly operation: 'create' | 'update' | 'delete' | 'rename';
  readonly additions: number;
  readonly deletions: number;
  readonly hunks: readonly DiffHunk[];
  readonly verificationIds: readonly string[];
  readonly observedAt: string;
  readonly preExisting: boolean;
}
export interface VerificationProjection {
  readonly runId: string;
  readonly status: string;
  readonly confidence?: number;
  readonly checks: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly summary: string;
  }[];
  readonly uncoveredRisks: readonly string[];
  readonly evidenceIds: readonly string[];
}
export interface ApprovalProjection {
  readonly id: string;
  readonly tool: string;
  readonly risk: string;
  readonly reason: string;
  readonly resources: readonly string[];
  readonly status: 'pending' | 'approved' | 'denied';
}
export interface ThreadProjection {
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
}
export interface TuiTaskProjection {
  readonly schemaVersion: typeof TUI_PROTOCOL_VERSION;
  readonly sequence: number;
  readonly generatedAt: string;
  readonly thread: ThreadProjection;
  readonly activity: readonly ActivityItem[];
  readonly changes: readonly TaskFileChange[];
  readonly executions: readonly CommandExecutionProjection[];
  readonly verification?: VerificationProjection;
  readonly approvals: readonly ApprovalProjection[];
}

export type TuiDomainEvent =
  | { readonly type: 'activity.updated'; readonly activity: ActivityItem }
  | { readonly type: 'diff.updated'; readonly changes: readonly TaskFileChange[] }
  | { readonly type: 'command.updated'; readonly execution: CommandExecutionProjection }
  | { readonly type: 'verification.updated'; readonly verification: VerificationProjection }
  | { readonly type: 'approval.updated'; readonly approval: ApprovalProjection }
  | { readonly type: 'thread.updated'; readonly thread: ThreadProjection };

export function isStreamEnvelope(value: unknown): value is StreamEnvelope {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<StreamEnvelope>;
  return (
    item.schemaVersion === 1 &&
    typeof item.eventId === 'string' &&
    Number.isInteger(item.sequence) &&
    typeof item.threadId === 'string' &&
    typeof item.correlationId === 'string' &&
    !!item.event
  );
}

// ─── Conversation envelope ───────────────────────────────────
//
// Shared shape for chat streaming across the TUI and Workspace clients. The
// server (`/api/conversations/:id/stream`) emits these; both clients consume
// the same structure instead of re-implementing SSE parsing.

export type ConversationChunkType =
  | 'delta' // incremental text token
  | 'tool' // a tool call is proposed/started
  | 'tool_result' // a tool execution result
  | 'status' // progress/status update
  | 'done' // stream finished
  | 'error'; // stream failed

export interface ConversationChunk {
  readonly schemaVersion: typeof TUI_PROTOCOL_VERSION;
  readonly conversationId: string;
  readonly messageId: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly event: {
    readonly type: ConversationChunkType;
    readonly content?: string;
    readonly name?: string;
    readonly detail?: string;
    /**
     * Structured Assistant execution projection (GA-UX-PREMIUM M3,
     * `assistant.execution.v1`). Additive and optional: older servers omit
     * it, older clients ignore it. TUI consumers keep reading content/name.
     */
    readonly execution?: AssistantExecutionDetail;
  };
}

export interface ConversationSummaryProtocol {
  readonly id: string;
  readonly title: string;
  readonly messageCount: number;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function isConversationChunk(value: unknown): value is ConversationChunk {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ConversationChunk>;
  return (
    item.schemaVersion === 1 &&
    typeof item.conversationId === 'string' &&
    typeof item.messageId === 'string' &&
    Number.isInteger(item.sequence) &&
    !!item.event &&
    typeof (item.event as { type?: unknown })?.type === 'string'
  );
}
