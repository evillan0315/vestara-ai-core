import type { EventEnvelope } from '../envelope/envelope';

export type EventHandler<TPayload = Record<string, unknown>> = (event: EventEnvelope<TPayload>) => void | Promise<void>;

export type UnsubscribeFn = () => void;

export type SubscriptionPattern = string | { type?: string; correlationId?: string; source?: string };

export interface EventBusMetrics {
  totalEmitted: number;
  totalProcessed: number;
  totalFailed: number;
  avgLatency: number;
  activeSubscribers: number;
}

export interface EventBus {
  emit<TPayload>(event: EventEnvelope<TPayload>): Promise<void>;

  subscribe<TPayload = Record<string, unknown>>(
    pattern: SubscriptionPattern,
    handler: EventHandler<TPayload>,
  ): UnsubscribeFn;

  once<TPayload = Record<string, unknown>>(type: string, handler: EventHandler<TPayload>): UnsubscribeFn;

  unsubscribeAll(pattern?: string): void;

  getMetrics(): EventBusMetrics;
}
