import type { JsonRecord, Timestamp } from './common';
import type {
  CausationId,
  CorrelationId,
  EventId,
  ExecutionId,
  IntentId,
  JobId,
  RequestId,
  RuntimeId,
  TraceId,
  WorkflowRunId,
} from './ids';

export type EventSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

// ─── ARX-015 M2: Canonical EventHeader ──────────────────────────
//
// The canonical header preserves distinct semantics for each identity type.
// Domain payloads are typed separately and composed via DomainEventEnvelope.
//
// Identity semantics:
//   eventId        — globally unique event identifier
//   requestId      — transport/request correlation (single HTTP/WS request lifecycle)
//   traceId        — distributed causal trace (groups events across processes)
//   correlationId  — execution correlation (always derived from executionId)
//   executionId    — canonical execution identity (source of truth for correlationId)
//   workflowRunId  — workflow instance identity (single run of a workflow project)
//   causationId    — direct causal predecessor (this specific event caused this event)
// ────────────────────────────────────────────────────────────────

/**
 * Canonical event header with distinct identity semantics.
 *
 * Every domain event carries this header. Typed payloads are separate.
 * The header is the最小 shared contract across all event envelope systems.
 */
export interface EventHeader {
  /** Globally unique event identifier. */
  readonly eventId: EventId;

  /** Event type (e.g. 'task.created', 'harness.tool-call'). */
  readonly type: string;

  /** ISO-8601 timestamp of event creation. */
  readonly timestamp: Timestamp;

  /** Producer identity (e.g. 'conversation-engine', 'runtime:kernel'). */
  readonly source: string;

  /** Transport/request correlation. Single HTTP/WS request lifecycle. Discarded after response. */
  readonly requestId?: RequestId;

  /** Distributed causal trace. Groups all events causally related to a top-level entry point. */
  readonly traceId?: TraceId;

  /**
   * Execution correlation. Always derived from executionId via resolveCorrelationId().
   * Groups all events within one execution attempt.
   * Undefined when no execution context exists — prefer absent over misleading.
   */
  readonly correlationId?: CorrelationId;

  /** Canonical execution identity. Source of truth for correlationId derivation. */
  readonly executionId?: ExecutionId;

  /** Workflow instance identity. Single run of a workflow project. */
  readonly workflowRunId?: WorkflowRunId;

  /**
   * Direct causal predecessor. References the eventId of the event that caused this one.
   * Root events (no cause) leave this undefined.
   * Distinct from correlationId ("same execution") and traceId ("same causal trace").
   */
  readonly causationId?: CausationId;
}

/**
 * Canonical domain event envelope: EventHeader + typed domain payload.
 *
 * Generic over TPayload so domain handlers get type-safe payloads.
 * The header carries identity/routing; the payload carries domain data.
 */
export interface DomainEventEnvelope<TPayload = Record<string, unknown>> {
  readonly header: EventHeader;
  readonly payload: TPayload;
}

// ─── Legacy types (kept for backward compatibility) ─────────────

export type EventSeverity_Legacy = EventSeverity;

export interface EventEnvelope_Legacy {
  eventId: EventId;
  timestamp: Timestamp;
  source: string;
  runtimeId: RuntimeId | null;
  jobId: JobId | null;
  intentId: IntentId | null;
  type: string;
  payload: JsonRecord;
  correlationId: CorrelationId;
  parentId: EventId | null;
  severity: EventSeverity;
  metadata: {
    version: number;
    context: JsonRecord;
  };
}

export type EventSubscription = {
  type?: string | string[];
  correlationId?: CorrelationId;
  source?: string;
};

export type EventHandler = (event: EventEnvelope_Legacy) => void | Promise<void>;

export type UnsubscribeFn = () => void;

export interface EventBus_Legacy {
  emit(event: Omit<EventEnvelope_Legacy, 'eventId' | 'timestamp'>): Promise<void>;
  on(type: string, handler: EventHandler): UnsubscribeFn;
  on(pattern: EventSubscription, handler: EventHandler): UnsubscribeFn;
  off(type: string, handler: EventHandler): void;
  once(type: string, handler: EventHandler): UnsubscribeFn;
}
