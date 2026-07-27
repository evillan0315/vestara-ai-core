import type {
  CausationId,
  CorrelationId,
  EventId,
  EventSeverity,
  IntentId,
  JobId,
  RuntimeId,
  Timestamp,
} from '@vestara/types';

export interface EventEnvelope<TPayload = Record<string, unknown>> {
  readonly id: EventId;
  readonly timestamp: Timestamp;
  readonly type: string;
  readonly version: number;

  readonly source: string;
  readonly runtimeId: RuntimeId | null;
  readonly jobId: JobId | null;
  readonly intentId: IntentId | null;

  readonly correlationId: CorrelationId;
  readonly causationId: CausationId | null;

  readonly payload: TPayload;
  readonly severity: EventSeverity;

  readonly metadata: {
    readonly context: Record<string, unknown>;
  };
}
