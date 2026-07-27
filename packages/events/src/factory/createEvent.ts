import type { CorrelationId, EventId, EventSeverity, Timestamp } from '@vestara/types';
import type { EventEnvelope } from '../envelope/envelope';

let eventCounter = 0;

export function generateEventId(): EventId {
  return `evt-${Date.now()}-${++eventCounter}` as EventId;
}

export function generateCorrelationId(): CorrelationId {
  return `cor-${Date.now()}-${++eventCounter}` as CorrelationId;
}

export function now(): Timestamp {
  return new Date().toISOString() as Timestamp;
}

export type CreateEventOverrides<TPayload> = Partial<
  Pick<
    EventEnvelope<TPayload>,
    'runtimeId' | 'jobId' | 'intentId' | 'correlationId' | 'causationId' | 'severity' | 'metadata'
  >
>;

export function createEvent<TPayload>(
  type: string,
  version: number,
  payload: TPayload,
  source: string,
  overrides?: CreateEventOverrides<TPayload>,
): EventEnvelope<TPayload> {
  return {
    id: generateEventId(),
    timestamp: now(),
    type,
    version,
    source,
    runtimeId: overrides?.runtimeId ?? null,
    jobId: overrides?.jobId ?? null,
    intentId: overrides?.intentId ?? null,
    correlationId: overrides?.correlationId ?? generateCorrelationId(),
    causationId: overrides?.causationId ?? null,
    payload,
    severity: overrides?.severity ?? ('info' as EventSeverity),
    metadata: {
      context: overrides?.metadata?.context ?? {},
    },
  };
}
