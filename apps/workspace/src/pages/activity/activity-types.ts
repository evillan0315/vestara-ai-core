import type {
  ActivityOrganizationalEffect,
  ActivityRecord,
  ActivitySeverity,
  MessageTarget,
} from '@vestara/activity-projection';

export type { ActivityOrganizationalEffect, ActivityRecord, ActivitySeverity, MessageTarget };

export type ActivityKind = ActivityRecord['kind'];

/** UI connection state for the Activity stream. */
export type ActivityConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'paused' | 'error';

/** Lifecycle of a locally-sent (optimistic) human message. */
export type PendingSendState = 'sending' | 'failed';

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

export interface ActivityStreamSnapshot {
  state: ActivityConnectionState;
  records: readonly ActivityRecord[];
  latestSequence: number;
  paused: boolean;
  error?: string;
  sendStates: Readonly<Record<string, PendingSendState>>;
  scope: ActivityScope;
  unread: number;
  pause: () => void;
  resume: () => void;
  clear: () => void;
  sendMessage: (input: ActivityMessageInput) => Promise<void>;
  retrySend: (messageId: string) => Promise<void>;
  applyScope: (scope: ActivityScope) => void;
  clearUnread: () => void;
  reportViewport: (atBottom: boolean) => void;
}
