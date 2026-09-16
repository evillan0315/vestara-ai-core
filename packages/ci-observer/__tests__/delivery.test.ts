import { describe, expect, it } from 'vitest';
import { deliverPendingCINotifications } from '../src/delivery';
import { type CINotificationRecord, InMemoryCINotificationStore } from '../src/records';

function notification(id: string): CINotificationRecord {
  return {
    notificationId: id,
    kind: 'required-check-failed',
    severity: 'error',
    title: 'CI failed',
    body: 'repair is a candidate',
    observationId: 'obs-1',
    commitSha: 'abc',
    at: '2026-09-16T00:00:00.000Z',
  };
}

describe('deliverPendingCINotifications (CI-OBS-001I)', () => {
  it('marks delivered only after every sink accepts', async () => {
    const store = new InMemoryCINotificationStore();
    await store.record(notification('n1'));
    const seen: string[] = [];
    const summary = await deliverPendingCINotifications(
      store,
      [
        {
          id: 'a',
          async deliver(item) {
            seen.push(item.notificationId);
          },
        },
        { id: 'b', async deliver() {} },
      ],
      { now: () => '2026-09-16T01:00:00.000Z' },
    );
    expect(summary).toEqual({ pending: 1, delivered: 1, failed: 0, sinkIds: ['a', 'b'] });
    expect(seen).toEqual(['n1']);
    expect(await store.pending()).toHaveLength(0);
    expect((await store.recent())[0]?.deliveredAt).toBe('2026-09-16T01:00:00.000Z');
  });

  it('never loses a notification when a sink fails', async () => {
    const store = new InMemoryCINotificationStore();
    await store.record(notification('n2'));
    const summary = await deliverPendingCINotifications(store, [
      {
        id: 'boom',
        async deliver() {
          throw new Error('channel down');
        },
      },
    ]);
    expect(summary.failed).toBe(1);
    expect((await store.pending()).map((item) => item.notificationId)).toEqual(['n2']);
  });

  it('marks nothing when no sinks are configured', async () => {
    const store = new InMemoryCINotificationStore();
    await store.record(notification('n3'));
    const summary = await deliverPendingCINotifications(store, []);
    expect(summary.failed).toBe(1);
    expect(await store.pending()).toHaveLength(1);
  });

  it('is idempotent across drains', async () => {
    const store = new InMemoryCINotificationStore();
    await store.record(notification('n4'));
    await deliverPendingCINotifications(store, [{ id: 'a', async deliver() {} }]);
    const second = await deliverPendingCINotifications(store, [{ id: 'a', async deliver() {} }]);
    expect(second.pending).toBe(0);
    expect(second.delivered).toBe(0);
  });
});
