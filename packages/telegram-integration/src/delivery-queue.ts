/**
 * VES-TG-011: Outbound Delivery Queue
 *
 * Durable outbound delivery to Telegram with priority ordering, bounded
 * retries, rate limiting, duplicate protection, and a dead-letter queue.
 *
 * Delivery semantics are at-least-once: a record stuck in `delivering`
 * across a restart is requeued, so a crash between the Bot API call and
 * acknowledgement can rarely duplicate a chat message. Silent loss is
 * never preferred over a duplicate.
 *
 * No timers are used. Retry scheduling is explicit via `scheduledRetryAt`
 * plus `processDueRetries()`, so behavior is deterministic in tests and
 * safe across restarts (when constructed with a store, non-terminal rows
 * are rehydrated from SQLite).
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-011)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

// ─── Types ─────────────────────────────────────────────────────

import type { ChannelDelivery } from '@vestara/channel-types';
import type { TelegramPersistentStore } from './persistent-store';

export type DeliveryStatus = 'pending' | 'delivering' | 'delivered' | 'retrying' | 'failed' | 'dead-letter';

export type DeliveryPriority = 'low' | 'normal' | 'high';

export interface DeliveryRecord {
  /** Delivery record ID */
  readonly id: string;

  /** Original delivery request */
  readonly delivery: ChannelDelivery;

  /** Current status */
  readonly status: DeliveryStatus;

  /** Queue priority (controls ordering, not urgency of content) */
  readonly priority: DeliveryPriority;

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

  /** Dead letter queue capacity (oldest entries are dropped first) */
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

const NON_TERMINAL: readonly DeliveryStatus[] = ['pending', 'delivering', 'retrying'];

// ─── Delivery Queue ────────────────────────────────────────────

export class TelegramDeliveryQueue {
  private config: Required<DeliveryQueueConfig>;
  private store: TelegramPersistentStore | null;
  private pendingQueue: DeliveryRecord[] = [];
  private deliveryMap: Map<string, DeliveryRecord> = new Map();
  private deadLetterQueue: DeliveryRecord[] = [];
  private rateLimitTokens: number;
  private rateLimitLastRefill: number;

  constructor(config?: DeliveryQueueConfig & { store?: TelegramPersistentStore }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = config?.store ?? null;
    this.rateLimitTokens = this.config.rateLimitPerSecond;
    this.rateLimitLastRefill = Date.now();
    if (this.store) this.recover();
  }

  /**
   * Enqueue a delivery for sending.
   *
   * Idempotent: re-enqueueing the same delivery ID while a non-terminal
   * record exists returns the existing record instead of duplicating the
   * send (duplicate delivery protection for Telegram retries).
   */
  enqueue(delivery: ChannelDelivery, priority: DeliveryPriority = 'normal'): DeliveryRecord {
    for (const existing of this.deliveryMap.values()) {
      if (existing.delivery.id === delivery.id && NON_TERMINAL.includes(existing.status)) {
        return existing;
      }
    }

    const chatId = delivery.conversation.externalId;
    const activeForChat = Array.from(this.deliveryMap.values()).filter(
      (r) => r.delivery.conversation.externalId === chatId && NON_TERMINAL.includes(r.status),
    ).length;
    if (activeForChat >= this.config.maxPendingPerChat) {
      throw new Error('Maximum pending deliveries per chat reached');
    }

    const record: DeliveryRecord = {
      id: `dlv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      delivery,
      status: 'pending',
      priority,
      attempts: 0,
      maxAttempts: this.config.maxAttempts,
      createdAt: new Date().toISOString(),
    };

    this.pendingQueue.splice(this.findIndexByPriority(priority), 0, record);
    this.deliveryMap.set(record.id, record);
    this.store?.saveDeliveryRecord(record);
    return record;
  }

  /**
   * Dequeue the next delivery to send.
   * Returns null if queue is empty or rate limited.
   */
  dequeue(): DeliveryRecord | null {
    this.refillTokens();
    if (this.rateLimitTokens <= 0) return null;

    const index = this.pendingQueue.findIndex((r) => r.status === 'pending');
    if (index === -1) return null;

    const record = this.pendingQueue[index];
    this.pendingQueue.splice(index, 1);

    const updated: DeliveryRecord = {
      ...record,
      status: 'delivering',
      attempts: record.attempts + 1,
      lastAttemptAt: new Date().toISOString(),
    };

    this.deliveryMap.set(updated.id, updated);
    this.store?.saveDeliveryRecord(updated);
    this.rateLimitTokens--;
    return updated;
  }

  /**
   * Mark a delivery as successfully sent.
   */
  markDelivered(deliveryId: string, externalMessageId?: string): void {
    const record = this.deliveryMap.get(deliveryId);
    if (!record) return;

    this.deliveryMap.set(deliveryId, { ...record, status: 'delivered', externalMessageId });
    // Terminal success needs no recovery row.
    this.store?.deleteDeliveryRecord(deliveryId);
  }

  /**
   * Mark a delivery as failed and schedule a bounded retry.
   * Pass `{ retryable: false }` for permanent failures (e.g. rejected
   * payloads): the record goes straight to `failed` with no retry.
   * Exhausted retries move the record to the dead-letter queue.
   */
  markFailed(deliveryId: string, error: string, options?: { retryable?: boolean }): void {
    const record = this.deliveryMap.get(deliveryId);
    if (!record) return;

    if (options?.retryable === false) {
      const failed: DeliveryRecord = { ...record, status: 'failed', lastError: error };
      this.deliveryMap.set(deliveryId, failed);
      this.store?.saveDeliveryRecord(failed);
      return;
    }

    if (record.attempts >= record.maxAttempts) {
      const dead: DeliveryRecord = { ...record, status: 'dead-letter', lastError: error };
      this.deliveryMap.set(deliveryId, dead);
      this.deadLetterQueue.push(dead);
      this.enforceDeadLetterCapacity();
      this.store?.saveDeliveryRecord(dead);
      return;
    }

    const delay = Math.min(this.config.retryBaseDelayMs * 2 ** (record.attempts - 1), this.config.retryMaxDelayMs);
    const updated: DeliveryRecord = {
      ...record,
      status: 'retrying',
      lastError: error,
      scheduledRetryAt: new Date(Date.now() + delay).toISOString(),
    };
    this.deliveryMap.set(deliveryId, updated);
    this.store?.saveDeliveryRecord(updated);
  }

  /**
   * Move retrying records whose scheduled time has passed back to pending.
   * Returns the number of records requeued. Call on a tick; restarts
   * recover schedules from SQLite, so no timers are needed.
   */
  processDueRetries(now: number = Date.now()): number {
    let moved = 0;
    for (const record of this.deliveryMap.values()) {
      if (
        record.status === 'retrying' &&
        record.scheduledRetryAt !== undefined &&
        Date.parse(record.scheduledRetryAt) <= now
      ) {
        const pending: DeliveryRecord = { ...record, status: 'pending', scheduledRetryAt: undefined };
        this.pendingQueue.splice(this.findIndexByPriority(pending.priority), 0, pending);
        this.deliveryMap.set(pending.id, pending);
        this.store?.saveDeliveryRecord(pending);
        moved += 1;
      }
    }
    return moved;
  }

  /**
   * Cancel a pending delivery. In-flight (`delivering`) and scheduled
   * (`retrying`) records cannot be cancelled — returns false.
   */
  cancel(deliveryId: string): boolean {
    const index = this.pendingQueue.findIndex((r) => r.id === deliveryId);
    if (index === -1) return false;

    this.pendingQueue.splice(index, 1);
    this.deliveryMap.delete(deliveryId);
    this.store?.deleteDeliveryRecord(deliveryId);
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
   * Retry a dead-lettered (or permanently failed) delivery.
   * Resets attempts and requeues as pending.
   */
  retryDeadLetter(deliveryId: string): boolean {
    const record = this.deliveryMap.get(deliveryId);
    if (!record || (record.status !== 'dead-letter' && record.status !== 'failed')) return false;

    this.deadLetterQueue = this.deadLetterQueue.filter((r) => r.id !== deliveryId);
    const updated: DeliveryRecord = {
      ...record,
      status: 'pending',
      attempts: 0,
      lastError: undefined,
      scheduledRetryAt: undefined,
    };
    this.pendingQueue.splice(this.findIndexByPriority(updated.priority), 0, updated);
    this.deliveryMap.set(deliveryId, updated);
    this.store?.saveDeliveryRecord(updated);
    return true;
  }

  /**
   * Get queue statistics.
   */
  getStats(): {
    pending: number;
    delivering: number;
    delivered: number;
    retrying: number;
    failed: number;
    deadLetter: number;
  } {
    const records = Array.from(this.deliveryMap.values());
    const count = (status: DeliveryStatus): number => records.filter((r) => r.status === status).length;
    return {
      pending: count('pending'),
      delivering: count('delivering'),
      delivered: count('delivered'),
      retrying: count('retrying'),
      failed: count('failed'),
      deadLetter: this.deadLetterQueue.length,
    };
  }

  // ─── Internal Methods ───────────────────────────────────────

  /**
   * Rehydrate non-terminal rows after a restart. In-flight `delivering`
   * records are safely requeued (at-least-once); terminal successes are
   * pruned since they need no recovery.
   */
  private recover(): void {
    if (!this.store) return;
    for (const record of this.store.loadDeliveryRecords()) {
      if (record.status === 'delivered') {
        this.store.deleteDeliveryRecord(record.id);
        continue;
      }
      if (record.status === 'dead-letter' || record.status === 'failed') {
        this.deliveryMap.set(record.id, record);
        if (record.status === 'dead-letter') this.deadLetterQueue.push(record);
        continue;
      }
      const pending: DeliveryRecord = { ...record, status: 'pending', scheduledRetryAt: undefined };
      this.pendingQueue.splice(this.findIndexByPriority(pending.priority), 0, pending);
      this.deliveryMap.set(pending.id, pending);
      this.store.saveDeliveryRecord(pending);
    }
    this.enforceDeadLetterCapacity();
  }

  private enforceDeadLetterCapacity(): void {
    while (this.deadLetterQueue.length > this.config.deadLetterCapacity) {
      const dropped = this.deadLetterQueue.shift();
      if (dropped) this.store?.deleteDeliveryRecord(dropped.id);
    }
  }

  private findIndexByPriority(priority: DeliveryPriority): number {
    const order: Record<DeliveryPriority, number> = { high: 0, normal: 1, low: 2 };
    const target = order[priority];
    for (let i = 0; i < this.pendingQueue.length; i++) {
      const record = this.pendingQueue[i];
      if (record.status !== 'pending') continue;
      if (order[record.priority] > target) return i;
    }
    return this.pendingQueue.length;
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.rateLimitLastRefill;
    const refillAmount = Math.floor(elapsed / 1000) * this.config.rateLimitPerSecond;
    if (refillAmount > 0) {
      this.rateLimitTokens = Math.min(this.config.rateLimitPerSecond, this.rateLimitTokens + refillAmount);
      this.rateLimitLastRefill = now;
    }
  }
}
