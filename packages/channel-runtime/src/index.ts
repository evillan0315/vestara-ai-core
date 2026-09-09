/**
 * VES-TG-004: Channel Runtime Gateway
 *
 * Generic channel gateway for Vestara interaction channels.
 * Routes incoming messages to appropriate handlers and manages
 * outbound delivery.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-004)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type {
  ChannelKind,
  ChannelMessage,
  ChannelAction,
  ChannelDelivery,
  ChannelDeliveryResult,
  ChannelEvent,
  ChannelConfig,
  ChannelConversationRef,
} from '@vestara/channel-types';

// ─── Types ─────────────────────────────────────────────────────

export interface ChannelAdapter {
  /** Channel kind this adapter handles */
  readonly kind: ChannelKind;

  /** Process an incoming message */
  processMessage(message: ChannelMessage): Promise<ChannelEvent>;

  /** Process an incoming action */
  processAction(action: ChannelAction): Promise<ChannelEvent>;

  /** Send a delivery */
  sendDelivery(delivery: ChannelDelivery): Promise<ChannelDeliveryResult>;
}

export interface ChannelGatewayConfig {
  /** Registered channel adapters */
  readonly adapters: readonly ChannelAdapter[];

  /** Event handlers */
  readonly handlers: ChannelEventHandlers;
}

export interface ChannelEventHandlers {
  /** Handle incoming message */
  onMessage?: (message: ChannelMessage) => Promise<void>;

  /** Handle incoming action */
  onAction?: (action: ChannelAction) => Promise<void>;

  /** Handle delivery result */
  onDeliveryResult?: (result: ChannelDeliveryResult) => Promise<void>;

  /** Handle channel event */
  onEvent?: (event: ChannelEvent) => Promise<void>;
}

export interface ChannelGatewayState {
  /** Registered adapters */
  readonly adapters: Map<ChannelKind, ChannelAdapter>;

  /** Pending deliveries */
  readonly pendingDeliveries: Map<string, ChannelDelivery>;

  /** Delivery results */
  readonly deliveryResults: Map<string, ChannelDeliveryResult>;
}

// ─── Channel Gateway ───────────────────────────────────────────

export class ChannelGateway {
  private state: ChannelGatewayState;
  private handlers: ChannelEventHandlers;

  constructor(config: ChannelGatewayConfig) {
    this.state = {
      adapters: new Map(),
      pendingDeliveries: new Map(),
      deliveryResults: new Map(),
    };
    this.handlers = config.handlers;

    // Register adapters
    for (const adapter of config.adapters) {
      this.state.adapters.set(adapter.kind, adapter);
    }
  }

  /**
   * Get adapter for a channel kind.
   */
  getAdapter(kind: ChannelKind): ChannelAdapter | undefined {
    return this.state.adapters.get(kind);
  }

  /**
   * Process an incoming message.
   */
  async processMessage(message: ChannelMessage): Promise<ChannelEvent> {
    const adapter = this.getAdapter(message.channel);
    if (!adapter) {
      throw new Error(`No adapter registered for channel: ${message.channel}`);
    }

    const event = await adapter.processMessage(message);

    // Notify handlers
    await this.handlers.onMessage?.(message);
    await this.handlers.onEvent?.(event);

    return event;
  }

  /**
   * Process an incoming action.
   */
  async processAction(action: ChannelAction): Promise<ChannelEvent> {
    const adapter = this.getAdapter(action.channel);
    if (!adapter) {
      throw new Error(`No adapter registered for channel: ${action.channel}`);
    }

    const event = await adapter.processAction(action);

    // Notify handlers
    await this.handlers.onAction?.(action);
    await this.handlers.onEvent?.(event);

    return event;
  }

  /**
   * Send a delivery to a channel.
   */
  async sendDelivery(delivery: ChannelDelivery): Promise<ChannelDeliveryResult> {
    const adapter = this.getAdapter(delivery.channel);
    if (!adapter) {
      throw new Error(`No adapter registered for channel: ${delivery.channel}`);
    }

    // Track pending delivery
    this.state.pendingDeliveries.set(delivery.id, delivery);

    try {
      const result = await adapter.sendDelivery(delivery);

      // Track result
      this.state.deliveryResults.set(delivery.id, result);
      this.state.pendingDeliveries.delete(delivery.id);

      // Notify handlers
      await this.handlers.onDeliveryResult?.(result);

      return result;
    } catch (error) {
      const result: ChannelDeliveryResult = {
        deliveryId: delivery.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };

      this.state.deliveryResults.set(delivery.id, result);
      this.state.pendingDeliveries.delete(delivery.id);

      await this.handlers.onDeliveryResult?.(result);

      return result;
    }
  }

  /**
   * Get pending deliveries.
   */
  getPendingDeliveries(): readonly ChannelDelivery[] {
    return Array.from(this.state.pendingDeliveries.values());
  }

  /**
   * Get delivery result.
   */
  getDeliveryResult(deliveryId: string): ChannelDeliveryResult | undefined {
    return this.state.deliveryResults.get(deliveryId);
  }
}

// ─── Delivery Queue ────────────────────────────────────────────

export type DeliveryStatus = 'pending' | 'delivering' | 'delivered' | 'failed' | 'retrying' | 'dead-letter';

export interface DeliveryQueueEntry {
  /** Delivery */
  readonly delivery: ChannelDelivery;

  /** Current status */
  status: DeliveryStatus;

  /** Retry count */
  retryCount: number;

  /** Maximum retries */
  readonly maxRetries: number;

  /** Last attempt timestamp */
  lastAttemptAt?: string;

  /** Next retry timestamp */
  nextRetryAt?: string;
}

export class DeliveryQueue {
  private entries: Map<string, DeliveryQueueEntry> = new Map();
  private maxRetries: number;
  private retryBaseMs: number;

  constructor(maxRetries = 3, retryBaseMs = 1000) {
    this.maxRetries = maxRetries;
    this.retryBaseMs = retryBaseMs;
  }

  /**
   * Add a delivery to the queue.
   */
  enqueue(delivery: ChannelDelivery): void {
    this.entries.set(delivery.id, {
      delivery,
      status: 'pending',
      retryCount: 0,
      maxRetries: this.maxRetries,
    });
  }

  /**
   * Get next delivery to process.
   */
  dequeue(): DeliveryQueueEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.status === 'pending') {
        entry.status = 'delivering';
        entry.lastAttemptAt = new Date().toISOString();
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Mark a delivery as completed.
   */
  complete(deliveryId: string): void {
    const entry = this.entries.get(deliveryId);
    if (entry) {
      entry.status = 'delivered';
    }
  }

  /**
   * Mark a delivery as failed and schedule retry.
   */
  fail(deliveryId: string, error?: string): void {
    const entry = this.entries.get(deliveryId);
    if (!entry) return;

    entry.retryCount += 1;

    if (entry.retryCount >= entry.maxRetries) {
      entry.status = 'dead-letter';
    } else {
      entry.status = 'retrying';
      entry.nextRetryAt = new Date(
        Date.now() + this.retryBaseMs * Math.pow(2, entry.retryCount - 1),
      ).toISOString();
    }
  }

  /**
   * Get queue size.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Get pending count.
   */
  get pendingCount(): number {
    return Array.from(this.entries.values()).filter((e) => e.status === 'pending').length;
  }
}
