/**
 * M11A Production Activity Room Read API Client
 *
 * Consumes frozen M11A HTTP endpoints. Read-only — no mutation of M8/M9/M10.
 * Authority flow: M9 durable truth → M10 projection → M11A API → this client → UI
 */

import type {
  ActivityCursor,
  ActivityRecord as M9ActivityRecord,
  ActivityRoomProjection,
  AttentionEntry,
  InteractionResponse,
  ParticipantProjection,
  WorkflowSummary,
} from '@vestara/types';
import { resolveHttpUrl } from './clientConfig';

// ─── Types ───────────────────────────────────────────────────

export interface M11ASnapshot {
  room: ActivityRoomProjection['room'];
  participants: readonly ParticipantProjection[];
  stream: readonly M11AStreamItem[];
  workflowSummary: WorkflowSummary | null;
  attention: readonly AttentionEntry[];
  contextualCapabilities: ActivityRoomProjection['contextualCapabilities'];
  cursor: ActivityCursor;
}

export interface M11AStreamItem {
  readonly streamItemId: string;
  readonly activityId: string;
  readonly sequenceNumber: number;
  readonly kind: string;
  readonly importance: 'primary' | 'secondary' | 'muted';
  readonly actor: { readonly type: string; readonly id: string; readonly displayName: string; readonly role?: string };
  readonly content: string;
  readonly timestamp: string;
  readonly workflowRunId?: string;
  readonly executionId?: string;
  readonly taskId?: string;
  readonly aggregated?: {
    readonly count: number;
    readonly kind: string;
    readonly summary: string;
    readonly referencedActivityIds: readonly string[];
    readonly sequenceRange: { readonly first: number; readonly last: number };
  };
  readonly interaction?: {
    readonly interactionId: string;
    readonly lifecycle: 'presented' | 'responded';
    readonly choices?: readonly { readonly choiceId: string; readonly label: string; readonly description?: string }[];
    readonly selectedChoiceId?: string;
    readonly respondingParticipantId?: string;
    readonly respondingParticipantName?: string;
  };
}

export interface M11AActivityRecord {
  readonly activityId: string;
  readonly eventId: string;
  readonly sequenceNumber: number;
  readonly type: string;
  readonly timestamp: string;
  readonly executionId?: string;
  readonly traceId?: string;
  readonly requestId?: string;
  readonly workflowRunId?: string;
  readonly taskId?: string;
  readonly agentAssignmentId?: string;
  readonly repositoryBindingId?: string;
  readonly runtimeSessionBindingId?: string;
  readonly aiBindingId?: string;
  readonly actor: { readonly type: string; readonly id: string; readonly displayName: string };
  readonly actorId?: string;
  readonly source: string;
  readonly payload?: { readonly message?: string; readonly error?: string; readonly output?: unknown };
  readonly visibility: string;
}

export interface M11AActivitiesResponse {
  readonly records: readonly M11AActivityRecord[];
  readonly count: number;
  readonly limit: number;
  readonly nextCursor: ActivityCursor | null;
}

export interface M11AError {
  readonly code: string;
  readonly message: string;
}

// ─── HTTP Client ─────────────────────────────────────────────

async function m11aFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolveHttpUrl(path);
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: M11AError };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      /* keep HTTP detail */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ─── Snapshot ────────────────────────────────────────────────

/**
 * Fetch the room snapshot + authoritative cursor.
 * This is the first call in the HTTP snapshot → WS subscribe lifecycle.
 */
export async function fetchM11ASnapshot(): Promise<M11ASnapshot> {
  return m11aFetch<M11ASnapshot>('/api/activity-room/v1/snapshot');
}

// ─── Historical Activities ───────────────────────────────────

export interface M11AActivityQuery {
  workflowRunId?: string;
  executionId?: string;
  taskId?: string;
  actorType?: string;
  actorId?: string;
  type?: string;
  source?: string;
  afterSequence?: number;
  beforeSequence?: number;
  limit?: number;
}

/**
 * Fetch bounded/paginated historical activities.
 * Used for scroll-up history loading and initial hydration.
 */
export async function fetchM11AActivities(query: M11AActivityQuery = {}): Promise<M11AActivitiesResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return m11aFetch<M11AActivitiesResponse>(`/api/activity-room/v1/activities${qs ? `?${qs}` : ''}`);
}

/**
 * Fetch activities after a specific cursor (for catch-up/recovery).
 */
export async function fetchM11AActivitiesAfter(
  afterSequence: number,
  limit: number = 100,
): Promise<M11AActivitiesResponse> {
  return fetchM11AActivities({ afterSequence, limit });
}

/**
 * Fetch an individual activity record by eventId.
 */
export async function fetchM11AActivityById(eventId: string): Promise<M11AActivityRecord> {
  return m11aFetch<M11AActivityRecord>(`/api/activity-room/v1/activities/${encodeURIComponent(eventId)}`);
}

/**
 * Fetch aggregate drill-down by stream item activityId.
 */
export async function fetchM11AAggregateDrillDown(
  aggregateId: string,
): Promise<{ records: readonly M11AActivityRecord[]; count: number }> {
  return m11aFetch(`/api/activity-room/v1/activities/aggregate/${encodeURIComponent(aggregateId)}`);
}

// ─── Participant Projection ──────────────────────────────────

export async function fetchM11AParticipants(): Promise<readonly ParticipantProjection[]> {
  return m11aFetch<readonly ParticipantProjection[]>('/api/activity-room/v1/participants');
}

// ─── Attention Projection ────────────────────────────────────

export async function fetchM11AAttention(): Promise<readonly AttentionEntry[]> {
  return m11aFetch<readonly AttentionEntry[]>('/api/activity-room/v1/attention');
}

// ─── Workflow Summary ────────────────────────────────────────

export async function fetchM11AWorkflowSummary(): Promise<WorkflowSummary | null> {
  return m11aFetch<WorkflowSummary | null>('/api/activity-room/v1/workflow-summary');
}

// ─── Interaction Response Submission (R6) ───────────────────

/**
 * AR-REC-R6: Submit a human response to a structured interaction.
 *
 * Consumes the frozen R5 HTTP contract exactly:
 *   POST /api/interactions/:interactionId/responses
 *   Body: { "choiceId": "..." }
 *
 * Server-derived provenance (not sent by client):
 *   - respondingParticipantId (from auth)
 *   - respondingParticipantName (from auth)
 *   - responseId (server-generated UUID)
 *   - respondedAt (server time)
 *
 * Response semantics:
 *   - 201: first response accepted
 *   - 200: same-choice retry (idempotent)
 *   - 409: conflict (different choice already recorded)
 *   - 404: interaction not found
 *   - 400: validation failure
 *   - 500: server error
 */
export async function submitInteractionResponse(
  interactionId: string,
  choiceId: string,
): Promise<{ readonly response: InteractionResponse }> {
  return m11aFetch<{ readonly response: InteractionResponse }>(
    `/api/interactions/${encodeURIComponent(interactionId)}/responses`,
    {
      method: 'POST',
      body: JSON.stringify({ choiceId }),
    },
  );
}

// ─── Submission Error Types (R6) ────────────────────────────

/**
 * Typed error for interaction response submission failures.
 * Maps HTTP status codes to structured error information.
 */
export interface InteractionSubmissionError {
  readonly kind: 'validation' | 'not-found' | 'conflict' | 'server' | 'network';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Parse an HTTP error from submitInteractionResponse into a typed
 * InteractionSubmissionError for UI feedback.
 */
export function classifySubmissionError(error: unknown): InteractionSubmissionError {
  const msg = error instanceof Error ? error.message : String(error);

  if (msg.includes('HTTP 400') || msg.includes('validation')) {
    return { kind: 'validation', message: msg, retryable: false };
  }
  if (msg.includes('HTTP 404') || msg.includes('not found')) {
    return { kind: 'not-found', message: 'Interaction is no longer available', retryable: false };
  }
  if (msg.includes('HTTP 409') || msg.includes('conflict')) {
    return { kind: 'conflict', message: 'A response has already been recorded', retryable: false };
  }
  if (msg.includes('HTTP 500') || msg.includes('Internal')) {
    return { kind: 'server', message: 'Server error — please try again', retryable: true };
  }
  // Network / fetch failure
  return { kind: 'network', message: 'Network error — please try again', retryable: true };
}
