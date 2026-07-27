/**
 * @vestara/event-bus — In-Process Typed Event Bus
 *
 * Typed publish/subscribe for inter-service communication.
 * Services communicate through events, never through direct calls.
 *
 * Architecture Traceability:
 *   Foundation: UNIVERSAL-INTERFACE.md → EventBus
 *   Runtime: LIFECYCLE-SPECIFICATION.md
 */

import type { EventHandler, Unsubscribe, VestaraEvent } from '@vestara/shared';

export type EmitEvent = {
  type: string;
  version?: number;
  source: string;
  payload: Record<string, unknown>;
  actor?: { id: string; role: 'user' | 'system' | 'agent' };
  metadata?: Partial<VestaraEvent['metadata']>;
};

export interface EventBus {
  emit(event: EmitEvent): Promise<void>;
  subscribe<T = unknown>(pattern: string, handler: EventHandler<T>, options?: SubscribeOptions): Unsubscribe;
  once<T = unknown>(type: string, handler: EventHandler<T>): Unsubscribe;
  unsubscribeAll(pattern?: string): void;
  getMetrics(): EventBusMetrics;
}

export interface SubscribeOptions {
  concurrency?: number;
  timeout?: number;
  retry?: boolean;
  maxRetries?: number;
}

export interface EventBusMetrics {
  totalEmitted: number;
  totalProcessed: number;
  totalFailed: number;
  avgLatency: number;
  activeSubscribers: number;
}

interface Subscription {
  pattern: string;
  handler: EventHandler;
  options: SubscribeOptions;
  isOnce: boolean;
}

let eventCounter = 0;

export class InProcessEventBus implements EventBus {
  private subscriptions: Subscription[] = [];
  private metrics: EventBusMetrics = {
    totalEmitted: 0,
    totalProcessed: 0,
    totalFailed: 0,
    avgLatency: 0,
    activeSubscribers: 0,
  };

  async emit(event: EmitEvent): Promise<void> {
    const fullEvent: VestaraEvent = {
      id: event.metadata?.correlationId ?? `evt-${Date.now()}-${++eventCounter}`,
      type: event.type,
      version: event.version ?? 1,
      timestamp: new Date().toISOString(),
      source: event.source,
      actor: event.actor,
      payload: event.payload,
      metadata: {
        correlationId: event.metadata?.correlationId ?? `cor-${Date.now()}`,
        causationId: event.metadata?.causationId,
        retryCount: 0,
        ttl: event.metadata?.ttl ?? 60,
      },
    };

    this.metrics.totalEmitted++;

    const matching = this.subscriptions.filter((sub) => this.matches(sub.pattern, fullEvent.type));

    for (const sub of matching) {
      const start = performance.now();
      try {
        await sub.handler(fullEvent);
        this.metrics.totalProcessed++;

        if (sub.isOnce) {
          this.removeSubscription(sub);
        }
      } catch (_error) {
        this.metrics.totalFailed++;
        if (sub.options.retry && sub.options.maxRetries) {
          fullEvent.metadata.retryCount++;
          if (fullEvent.metadata.retryCount <= sub.options.maxRetries) {
            await this.emit(event);
          }
        }
      }

      const latency = performance.now() - start;
      this.metrics.avgLatency =
        (this.metrics.avgLatency * (this.metrics.totalProcessed - 1) + latency) /
        Math.max(this.metrics.totalProcessed, 1);
    }
  }

  subscribe<T = unknown>(pattern: string, handler: EventHandler<T>, options: SubscribeOptions = {}): Unsubscribe {
    const sub: Subscription = {
      pattern,
      handler: handler as EventHandler,
      options,
      isOnce: false,
    };
    this.subscriptions.push(sub);
    this.metrics.activeSubscribers = this.subscriptions.length;
    return () => this.removeSubscription(sub);
  }

  once<T = unknown>(type: string, handler: EventHandler<T>): Unsubscribe {
    const sub: Subscription = {
      pattern: type,
      handler: handler as EventHandler,
      options: {},
      isOnce: true,
    };
    this.subscriptions.push(sub);
    this.metrics.activeSubscribers = this.subscriptions.length;
    return () => this.removeSubscription(sub);
  }

  unsubscribeAll(pattern?: string): void {
    if (pattern) {
      this.subscriptions = this.subscriptions.filter((sub) => sub.pattern !== pattern);
    } else {
      this.subscriptions = [];
    }
    this.metrics.activeSubscribers = this.subscriptions.length;
  }

  getMetrics(): EventBusMetrics {
    return { ...this.metrics };
  }

  private matches(pattern: string, eventType: string): boolean {
    if (pattern === '*' || pattern === eventType) return true;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return eventType.startsWith(prefix);
    }
    return false;
  }

  private removeSubscription(sub: Subscription): void {
    const index = this.subscriptions.indexOf(sub);
    if (index >= 0) {
      this.subscriptions.splice(index, 1);
      this.metrics.activeSubscribers = this.subscriptions.length;
    }
  }
}
