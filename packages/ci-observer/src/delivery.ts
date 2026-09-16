/**
 * CI-OBS-001I — Notification delivery drain.
 *
 * Drains the durable notification outbox to one or more sinks (UI badge,
 * Telegram, etc.). Delivery is idempotent: a notification is marked delivered
 * only after every configured sink accepted it, and `markDelivered` is
 * once-only. No sinks → nothing is marked (notifications are never lost).
 *
 * Channels own their own transport; this module owns the canonical drain so
 * delivery semantics are not re-implemented per channel.
 */

import type { CINotificationRecord, CINotificationStore } from './records';

export interface CINotificationSink {
  readonly id: string;
  deliver(notification: CINotificationRecord): Promise<void>;
}

export interface CIDeliverySummary {
  readonly pending: number;
  readonly delivered: number;
  readonly failed: number;
  readonly sinkIds: readonly string[];
}

export async function deliverPendingCINotifications(
  store: CINotificationStore,
  sinks: readonly CINotificationSink[],
  options: { readonly limit?: number; readonly now?: () => string } = {},
): Promise<CIDeliverySummary> {
  const now = options.now ?? (() => new Date().toISOString());
  const pending = await store.pending(options.limit ?? 20);

  let delivered = 0;
  let failed = 0;
  for (const notification of pending) {
    if (sinks.length === 0) {
      failed += 1;
      continue;
    }
    let ok = true;
    for (const sink of sinks) {
      try {
        await sink.deliver(notification);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      await store.markDelivered(notification.notificationId, now());
      delivered += 1;
    } else {
      failed += 1;
    }
  }

  return { pending: pending.length, delivered, failed, sinkIds: sinks.map((sink) => sink.id) };
}
