import type { JsonRecord, Timestamp } from './common';
import type { CorrelationId, EventId, IntentId, JobId, RuntimeId } from './ids';

export type EventSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface EventEnvelope {
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

export type EventHandler = (event: EventEnvelope) => void | Promise<void>;

export type UnsubscribeFn = () => void;

export interface EventBus {
  emit(event: Omit<EventEnvelope, 'eventId' | 'timestamp'>): Promise<void>;
  on(type: string, handler: EventHandler): UnsubscribeFn;
  on(pattern: EventSubscription, handler: EventHandler): UnsubscribeFn;
  off(type: string, handler: EventHandler): void;
  once(type: string, handler: EventHandler): UnsubscribeFn;
}
