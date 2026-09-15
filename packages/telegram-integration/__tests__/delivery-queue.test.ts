/**
 * VES-TG-011: Outbound delivery queue tests.
 *
 * Covers ordering, failure, bounded retry, dead-letter, duplicate
 * delivery protection, per-chat limits, rate limiting, cancellation,
 * resurrection, and restart recovery.
 */

import type { ChannelDelivery } from '@vestara/channel-types';
import { migrate } from '@vestara/sqlite-migrations';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { TelegramDeliveryQueue } from '../src/delivery-queue';
import { TELEGRAM_MANIFEST } from '../src/migrations';
import { TelegramPersistentStore } from '../src/persistent-store';

// ─── Helpers ─────────────────────────────────────────────────────

let deliverySeq = 0;

function makeDelivery(overrides: Partial<ChannelDelivery> = {}): ChannelDelivery {
  deliverySeq += 1;
  return {
    id: `test-delivery-${deliverySeq}`,
    channel: 'telegram',
    conversation: { channel: 'telegram', externalId: 'chat-1', type: 'direct' },
    content: { text: `message ${deliverySeq}` },
    priority: 'normal',
    ...overrides,
  };
}

async function makeStore(): Promise<TelegramPersistentStore> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  migrate(db, TELEGRAM_MANIFEST);
  return new TelegramPersistentStore(db);
}

/** Dequeue a specific record then fail it (single-record flows). */
function dequeueAndFail(
  queue: TelegramDeliveryQueue,
  id: string,
  error = 'boom',
  options?: { retryable?: boolean },
): void {
  const rec = queue.dequeue();
  expect(rec?.id).toBe(id);
  queue.markFailed(id, error, options);
}

// ─── Ordering ────────────────────────────────────────────────────

describe('TelegramDeliveryQueue ordering', () => {
  it('delivers high priority before normal before low', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000 });
    queue.enqueue(makeDelivery(), 'low');
    queue.enqueue(makeDelivery(), 'normal');
    const high = queue.enqueue(makeDelivery(), 'high');

    expect(queue.dequeue()?.id).toBe(high.id);
    expect(queue.dequeue()?.delivery.priority).toBe('normal');
  });

  it('preserves FIFO within the same priority', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000 });
    const first = queue.enqueue(makeDelivery());
    const second = queue.enqueue(makeDelivery());

    expect(queue.dequeue()?.id).toBe(first.id);
    expect(queue.dequeue()?.id).toBe(second.id);
  });
});

// ─── Failure and bounded retry ───────────────────────────────────

describe('TelegramDeliveryQueue failure and retry', () => {
  it('moves failed deliveries through retrying back to pending', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000, retryBaseDelayMs: 1000 });
    const record = queue.enqueue(makeDelivery());

    dequeueAndFail(queue, record.id, 'timeout');
    expect(queue.getRecord(record.id)?.status).toBe('retrying');
    expect(queue.getRecord(record.id)?.attempts).toBe(1);

    // Not yet due — nothing moves.
    expect(queue.processDueRetries(Date.now())).toBe(0);
    expect(queue.getPending()).toHaveLength(0);

    // Due — back to pending with attempts preserved.
    expect(queue.processDueRetries(Date.now() + 60_000)).toBe(1);
    expect(queue.getRecord(record.id)?.status).toBe('pending');
    const redelivered = queue.dequeue();
    expect(redelivered?.id).toBe(record.id);
    expect(redelivered?.attempts).toBe(2);
  });

  it('dead-letters after exhausting bounded retries', () => {
    const queue = new TelegramDeliveryQueue({
      rateLimitPerSecond: 1000,
      maxAttempts: 2,
      retryBaseDelayMs: 10,
    });
    const record = queue.enqueue(makeDelivery());

    dequeueAndFail(queue, record.id, 'err-1');
    queue.processDueRetries(Date.now() + 60_000);
    dequeueAndFail(queue, record.id, 'err-2');

    expect(queue.getRecord(record.id)?.status).toBe('dead-letter');
    expect(queue.getDeadLetterQueue()).toHaveLength(1);
    expect(queue.getStats().deadLetter).toBe(1);
  });

  it('marks non-retryable failures as failed without retry', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000 });
    const record = queue.enqueue(makeDelivery());

    dequeueAndFail(queue, record.id, 'rejected payload', { retryable: false });
    expect(queue.getRecord(record.id)?.status).toBe('failed');
    expect(queue.processDueRetries(Date.now() + 60_000)).toBe(0);
    expect(queue.getDeadLetterQueue()).toHaveLength(0);
  });

  it('resurrects dead-lettered and failed deliveries', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000, maxAttempts: 1 });
    const dead = queue.enqueue(makeDelivery());
    dequeueAndFail(queue, dead.id);
    const failed = queue.enqueue(makeDelivery());
    dequeueAndFail(queue, failed.id, 'bad', { retryable: false });

    expect(queue.retryDeadLetter(dead.id)).toBe(true);
    expect(queue.retryDeadLetter(failed.id)).toBe(true);
    expect(queue.getRecord(dead.id)?.status).toBe('pending');
    expect(queue.getRecord(dead.id)?.attempts).toBe(0);
    expect(queue.retryDeadLetter('missing')).toBe(false);
  });
});

// ─── Duplicate delivery protection ───────────────────────────────

describe('TelegramDeliveryQueue duplicate protection', () => {
  it('returns the existing record when the same delivery is enqueued twice', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000 });
    const delivery = makeDelivery();
    const first = queue.enqueue(delivery);
    const second = queue.enqueue(delivery);

    expect(second.id).toBe(first.id);
    expect(queue.getPending()).toHaveLength(1);
  });

  it('allows re-enqueue after terminal delivery', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000 });
    const delivery = makeDelivery();
    const first = queue.enqueue(delivery);
    const dequeued = queue.dequeue();
    queue.markDelivered(dequeued!.id, 'ext-1');

    const second = queue.enqueue(delivery);
    expect(second.id).not.toBe(first.id);
  });
});

// ─── Bounds ──────────────────────────────────────────────────────

describe('TelegramDeliveryQueue bounds', () => {
  it('enforces the per-chat pending limit', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000, maxPendingPerChat: 2 });
    queue.enqueue(makeDelivery());
    queue.enqueue(makeDelivery());
    expect(() => queue.enqueue(makeDelivery())).toThrow('Maximum pending deliveries per chat reached');
  });

  it('scopes the per-chat limit per chat', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000, maxPendingPerChat: 1 });
    queue.enqueue(makeDelivery());
    const other = makeDelivery({
      conversation: { channel: 'telegram', externalId: 'chat-2', type: 'direct' },
    });
    expect(() => queue.enqueue(other)).not.toThrow();
  });

  it('bounds the dead-letter queue, dropping oldest first', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000, maxAttempts: 1, deadLetterCapacity: 2 });
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const record = queue.enqueue(makeDelivery());
      ids.push(record.id);
      dequeueAndFail(queue, record.id, `err-${i}`);
    }

    const dlq = queue.getDeadLetterQueue();
    expect(dlq).toHaveLength(2);
    expect(dlq.map((r) => r.id)).not.toContain(ids[0]);
    expect(dlq.map((r) => r.id)).toContain(ids[2]);
  });

  it('rate-limits dequeues and refills over time', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1 });
    queue.enqueue(makeDelivery());
    queue.enqueue(makeDelivery());

    expect(queue.dequeue()).not.toBeNull();
    expect(queue.dequeue()).toBeNull();

    // Simulate one second passing.
    (queue as any).rateLimitLastRefill = Date.now() - 2000;
    expect(queue.dequeue()).not.toBeNull();
  });

  it('cancels pending deliveries but not in-flight ones', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000 });
    const flying = queue.enqueue(makeDelivery());
    const pending = queue.enqueue(makeDelivery());
    queue.dequeue(); // FIFO: `flying` is now delivering

    expect(queue.cancel(pending.id)).toBe(true);
    expect(queue.getRecord(pending.id)).toBeUndefined();
    expect(queue.cancel(flying.id)).toBe(false);
    expect(queue.cancel('missing')).toBe(false);
  });
});

// ─── Restart recovery ────────────────────────────────────────────

describe('TelegramDeliveryQueue restart recovery', () => {
  it('rehydrates in-flight and pending records as pending', async () => {
    const store = await makeStore();
    const before = new TelegramDeliveryQueue({ store, rateLimitPerSecond: 1000 });
    const flying = before.enqueue(makeDelivery());
    before.dequeue(); // now delivering, attempts = 1
    const waiting = before.enqueue(makeDelivery());

    const after = new TelegramDeliveryQueue({ store, rateLimitPerSecond: 1000 });
    expect(after.getRecord(flying.id)?.status).toBe('pending');
    expect(after.getRecord(flying.id)?.attempts).toBe(1);
    expect(after.getRecord(waiting.id)?.status).toBe('pending');
    expect(after.getPending()).toHaveLength(2);
  });

  it('prunes delivered rows on recovery', async () => {
    const store = await makeStore();
    const before = new TelegramDeliveryQueue({ store, rateLimitPerSecond: 1000 });
    const record = before.enqueue(makeDelivery());
    const dequeued = before.dequeue();
    before.markDelivered(dequeued!.id, 'ext-9');

    const after = new TelegramDeliveryQueue({ store, rateLimitPerSecond: 1000 });
    expect(after.getRecord(record.id)).toBeUndefined();
    expect(after.getPending()).toHaveLength(0);
  });

  it('rehydrates dead-letter rows and keeps retry working', async () => {
    const store = await makeStore();
    const before = new TelegramDeliveryQueue({ store, rateLimitPerSecond: 1000, maxAttempts: 1 });
    const record = before.enqueue(makeDelivery());
    dequeueAndFail(before, record.id);

    const after = new TelegramDeliveryQueue({ store, rateLimitPerSecond: 1000 });
    expect(after.getDeadLetterQueue()).toHaveLength(1);
    expect(after.retryDeadLetter(record.id)).toBe(true);
    expect(after.getRecord(record.id)?.status).toBe('pending');
  });

  it('recovers retry schedules without timers', async () => {
    const store = await makeStore();
    const before = new TelegramDeliveryQueue({ store, rateLimitPerSecond: 1000, retryBaseDelayMs: 5000 });
    const record = before.enqueue(makeDelivery());
    dequeueAndFail(before, record.id, 'timeout');

    // Restart before the retry is due.
    const after = new TelegramDeliveryQueue({ store, rateLimitPerSecond: 1000 });
    expect(after.getRecord(record.id)?.status).toBe('pending');
  });
});

// ─── Stats ───────────────────────────────────────────────────────

describe('TelegramDeliveryQueue stats', () => {
  it('counts records by status', () => {
    const queue = new TelegramDeliveryQueue({ rateLimitPerSecond: 1000, maxAttempts: 1 });
    const delivered = queue.enqueue(makeDelivery());
    queue.markDelivered(queue.dequeue()!.id);
    const dead = queue.enqueue(makeDelivery());
    dequeueAndFail(queue, dead.id);
    queue.enqueue(makeDelivery());

    const stats = queue.getStats();
    expect(stats.delivered).toBe(1);
    expect(stats.deadLetter).toBe(1);
    expect(stats.pending).toBe(1);
    expect(queue.getByStatus('delivered').map((r) => r.id)).toContain(delivered.id);
  });
});
