/**
 * VES-TG-011: Outbound Delivery Queue
 *
 * Manages outbound message delivery to Telegram with retry, rate limiting,
 * and dead-letter queue for failed deliveries.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-011)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { ChannelDelivery, ChannelDeliveryContent } from '@vestara/channel-types';

// ─── Types ─────────────────────────────────────────────────────

export type DeliveryStatus =
  | 'pending'
  | 'sending'
  | 'delivered'
  | 'failed'
  | 'retrying'
  | 'dead-letter';

export type DeliveryPriority = 'low' | 'normal' | 'high';

export interface DeliveryRecord {
  /** Delivery record ID */
  readonly id: string;

  /** Original delivery request */
  readonly delivery: ChannelDelivery;

  /** Current status */
  readonly status: DeliveryStatus;

  /** Number of attempts made */
  readonly attempts: number;

  /** Maximum retry attempts */
  readonly maxAttempts: number;

  /** ISO-8601 timestamp of last attempt */
  readonly lastAttemptAt?: string;

  /** ISO-8601 timestamp when delivery was created */
  readonly createdAt: string;

  /** Error message from last failure */
  readonly lastError?: string;

  /** Scheduled retry time (ISO-8601) */
  readonly scheduledRetryAt?: string;

  /** External message ID (after successful delivery) */
  readonly externalMessageId?: string;
}

export interface DeliveryQueueConfig {
  /** Maximum retry attempts */
  readonly maxAttempts?: number;

  /** Base delay between retries in ms (exponential backoff) */
  readonly retryBaseDelayMs?: number;

  /** Maximum delay between retries in ms */
  readonly retryMaxDelayMs?: number;

  /** Maximum pending deliveries per chat */
  readonly maxPendingPerChat?: number;

  /** Delivery rate limit: max messages per second */
  readonly rateLimitPerSecond?: number;

  /** Dead letter queue capacity */
  readonly deadLetterCapacity?: number;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<DeliveryQueueConfig> = {
  maxAttempts: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 60000,
  maxPendingPerChat: 50,
  rateLimitPerSecond: 30,
  deadLetterCapacity: 1000,
};

// ─── Delivery Queue ────────────────────────────────────────────

export class TelegramDeliveryQueue {
  private config: Required<DeliveryQueueConfig>;
  private pendingQueue: DeliveryRecord[] = [];
  private deliveryMap: Map<string, DeliveryRecord> = new Map();
  private deadLetterQueue: DeliveryRecord[] = [];
  private rateLimitTokens: number;
  private rateLimitLastRefill: number;

  constructor(config?: DeliveryQueueConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rateLimitTokens = this.config.rateLimitPerSecond;
    this.rateLimitLastRefill = Date.now();
  }

  /**
   * Enqueue a delivery for sending.
   */
  enqueue(
    delivery: ChannelDelivery,
    priority: DeliveryPriority = 'normal',
  ): DeliveryRecord {
    const record: DeliveryRecord = {
      id: `dlv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      delivery,
      status: 'pending',
      attempts: 0,
      maxAttempts: this.config.maxAttempts,
      createdAt: new Date().toISOString(),
    };

    // Insert by priority (high → normal → low)
    const insertIndex = this.findIndexByPriority(priority);
    this.pendingQueue.splice(insertIndex, 0, record);
    this.deliveryMap.set(record.id, record);

    return record;
  }

  /**
   * Dequeue the next delivery to send.
   * Returns null if queue is empty or rate limited.
   */
  dequeue(): DeliveryRecord | null {
    // Refill rate limit tokens
    this.refillTokens();

    // Check rate limit
    if (this.rateLimitTokens <= 0) {
      return null;
    }

    // Find next pending delivery
    const index = this.pendingQueue.findIndex((r) => r.status === 'pending');
    if (index === -1) return null;

    const record = this.pendingQueue[index];
    this.pendingQueue.splice(index, 1);

    // Move to sending state
    const updated: DeliveryRecord = {
      ...record,
      status: 'sending',
      attempts: record.attempts + 1,
      lastAttemptAt: new Date().toISOString(),
    };

    this.deliveryMap.set(updated.id, updated);
    this.rateLimitTokens--;

    return updated;
  }

  /**
   * Mark a delivery as successfully sent.
   */
  markDelivered(deliveryId: string, externalMessageId?: string): void {
    const record = this.deliveryMap.get(deliveryId);
    if (!record) return;

    const updated: DeliveryRecord = {
      ...record,
      status: 'delivered',
      externalMessageId,
    };

    this.deliveryMap.set(deliveryId, updated);
  }

  /**
   * Mark a delivery as failed and schedule retry.
   */
  markFailed(deliveryId: string, error: string): void {
    const record = this.deliveryMap.get(deliveryId);
    if (!record) return;

    if (record.attempts >= record.maxAttempts) {
      // Move to dead letter queue
      const updated: DeliveryRecord = {
        ...record,
        status: 'dead-letter',
        lastError: error,
      };
      this.deadLetterQueue.push(updated);
      this.deliveryMap.set(deliveryId, updated);
      return;
    }

    // Calculate retry delay with exponential backoff
    const delay = Math.min(
      this.config.retryBaseDelayMs * Math.pow(2, record.attempts - 1),
      this.config.retryMaxDelayMs,
    );

    const updated: DeliveryRecord = {
      ...record,
      status: 'retrying',
      lastError: error,
      scheduledRetryAt: new Date(Date.now() + delay).toISOString(),
    };

    this.deliveryMap.set(deliveryId, updated);

    // Re-enqueue after delay
    setTimeout(() => {
      this.requeueForRetry(deliveryId);
    }, delay);
  }

  /**
   * Cancel a pending delivery.
   */
  cancel(deliveryId: string): boolean {
    const index = this.pendingQueue.findIndex((r) => r.id === deliveryId);
    if (index === -1) return false;

    this.pendingQueue.splice(index, 1);
    this.deliveryMap.delete(deliveryId);
    return true;
  }

  /**
   * Get delivery record by ID.
   */
  getRecord(deliveryId: string): DeliveryRecord | undefined {
    return this.deliveryMap.get(deliveryId);
  }

  /**
   * Get all pending deliveries.
   */
  getPending(): readonly DeliveryRecord[] {
    return this.pendingQueue.filter((r) => r.status === 'pending');
  }

  /**
   * Get all deliveries in a specific status.
   */
  getByStatus(status: DeliveryStatus): readonly DeliveryRecord[] {
    return Array.from(this.deliveryMap.values()).filter((r) => r.status === status);
  }

  /**
   * Get dead letter queue.
   */
  getDeadLetterQueue(): readonly DeliveryRecord[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Retry a dead-lettered delivery.
   */
  retryDeadLetter(deliveryId: string): boolean {
    const index = this.deadLetterQueue.findIndex((r) => r.id === deliveryId);
    if (index === -1) return false;

    const record = this.deadLetterQueue[index];
    this.deadLetterQueue.splice(index, 1);

    const updated: DeliveryRecord = {
      ...record,
      status: 'pending',
      attempts: 0,
      lastError: undefined,
      scheduledRetryAt: undefined,
    };

    this.pendingQueue.push(updated);
    this.deliveryMap.set(deliveryId, updated);
    return true;
  }

  /**
   * Get queue statistics.
   */
  getStats(): {
    pending: number;
    sending: number;
    delivered: number;
    retrying: number;
    failed: number;
    deadLetter: number;
  } {
    const records = Array.from(this.deliveryMap.values());
    return {
      pending: records.filter((r) => r.status === 'pending').length,
      sending: records.filter((r) => r.status === 'sending').length,
      delivered: records.filter((r) => r.status === 'delivered').length,
      retrying: records.filter((r) => r.status === 'retrying').length,
      failed: records.filter((r) => r.status === 'failed').length,
      deadLetter: this.deadLetterQueue.length,
    };
  }

  // ─── Internal Methods ───────────────────────────────────────

  private requeueForRetry(deliveryId: string): void {
    const record = this.deliveryMap.get(deliveryId);
    if (!record || record.status !== 'retrying') return;

    const updated: DeliveryRecord = {
      ...record,
      status: 'pending',
    };

    this.pendingQueue.push(updated);
    this.deliveryMap.set(deliveryId, updated);
  }

  private findIndexByPriority(priority: DeliveryPriority): number {
    const priorityOrder: Record<DeliveryPriority, number> = { high: 0, normal: 1, low: 2 };
    const target = priorityOrder[priority];

    for (let i = 0; i < this.pendingQueue.length; i++) {
      const record = this.pendingQueue[i];
      if (record.status !== 'pending') continue;
      const recordPriority = this.getRecordPriority(record);
      if (priorityOrder[recordPriority] > target) {
        return i;
      }
    }

    return this.pendingQueue.length;
  }

  private getRecordPriority(record: DeliveryRecord): DeliveryPriority {
    // Infer priority from delivery metadata or default to normal
    return (record.delivery.metadata?.priority as DeliveryPriority) ?? 'normal';
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.rateLimitLastRefill;
    const refillAmount = Math.floor(elapsed / 1000) * this.config.rateLimitPerSecond;

    if (refillAmount > 0) {
      this.rateLimitTokens = Math.min(
        this.config.rateLimitPerSecond,
        this.rateLimitTokens + refillAmount,
      );
      this.rateLimitLastRefill = now;
    }
  }
}
