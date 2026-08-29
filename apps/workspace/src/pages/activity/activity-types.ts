import type {
  ActivityOrganizationalEffect,
  ActivityRecord,
  ActivitySeverity,
  MessageTarget,
} from '@vestara/activity-projection';

export type { ActivityOrganizationalEffect, ActivityRecord, ActivitySeverity, MessageTarget };

/**
 * A timeline record as served by the Activity Room list. Large agent content is
 * truncated to a preview budget server-side; when `hasDetails` is true the full
 * raw record is available via `GET /api/activity-room/:id` (lazy hydration).
 */
export type ActivityProjectionRecord = ActivityRecord & { hasDetails?: boolean };

export type ActivityKind = ActivityRecord['kind'];

/** UI connection state for the Activity stream. */
export type ActivityConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'paused' | 'error';

/** Lifecycle of a locally-sent (optimistic) human message. */
export type PendingSendState = 'sending' | 'failed';

/** Viewing density for the Activity Room timeline. */
export type ActivityDensity = 'summary' | 'operational' | 'raw';

export interface ActivityMessageInput {
  content: string;
  targets: readonly MessageTarget[];
  workflowId?: string;
  sessionId?: string;
  referencedActivityIds?: readonly string[];
  /** Organizational effect of the message (provenance). Defaults to 'message'. */
  effect?: ActivityOrganizationalEffect;
  /** Who is speaking (provenance). Defaults to the local actor. */
  actor?: { displayName?: string; role?: string };
  /** When set, this message corrects the referenced activity (append-only). */
  correctionOf?: string;
}

/** A workflow/session focus for the room (AAR-001F). Empty = global view. */
export interface ActivityScope {
  workflowId?: string;
  sessionId?: string;
}

export function scopeIsEmpty(scope: ActivityScope): boolean {
  return scope.workflowId === undefined && scope.sessionId === undefined;
}

/** Real participant of the selected workflow (AR-01 model, from participants projection). */
export interface WorkflowParticipant {
  workflowId: string;
  role: string;
  agentId: string;
  threadId: string;
  executionState: string;
  lastActivityAt?: string;
  lastActivity?: string;
}

/** One coalesced per-participant live narrative line (AR-01 model, never a transcript). */
export interface LiveStreamItem {
  threadId: string;
  role: string;
  agentId: string;
  sessionId?: string;
  text: string;
  lastActivityAt: string;
}

/** Aggregated workflow receipts: unread counts per agent + per-message receipts. */
export interface WorkflowReceipts {
  receiptsByMessage?: unknown;
  unreadByAgent: Readonly<Record<string, number>>;
}

/** Lifecycle of a workflow-scoped auxiliary source (AR-01). */
export type AuxiliarySourceStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error';

/**
 * A first-class, cancellable, stateful auxiliary source. `stale` means a prior
 * success is still displayed but the latest refresh failed — never silently
 * labeled current. `idle` means the source is not relevant for the scope.
 */
export interface AuxiliarySource<T> {
  status: AuxiliarySourceStatus;
  data?: T;
  error?: string;
  updatedAt?: number;
}

export interface ActivityStreamSnapshot {
  state: ActivityConnectionState;
  records: readonly ActivityProjectionRecord[];
  latestSequence: number;
  paused: boolean;
  error?: string;
  sendStates: Readonly<Record<string, PendingSendState>>;
  scope: ActivityScope;
  unread: number;
  freshIds: ReadonlySet<string>;
  pause: () => void;
  resume: () => void;
  clear: () => void;
  sendMessage: (input: ActivityMessageInput) => Promise<void>;
  retrySend: (messageId: string) => Promise<void>;
  applyScope: (scope: ActivityScope) => void;
  retry: () => void;
  loadOlder: () => Promise<void>;
  loadingOlder: boolean;
  olderLoaded: number;
  oldestSequence?: number;
  clearUnread: () => void;
  reportViewport: (atBottom: boolean) => void;
}
