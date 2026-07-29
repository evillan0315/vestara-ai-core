/**
 * NotificationService — bridges domain events to user-facing notifications.
 *
 * Subscribes to the ActivityService event stream and automatically creates
 * persistent notifications for important events. Provides query and
 * read-state management for the Notification Center UI.
 *
 * Architecture Traceability:
 *   v7.6 — Notification Center & Alerting
 */

import type { WorkspaceEvent } from '@vestara/events';
import type { Logger } from '@vestara/logger';
import type { AppNotification, NotificationStore } from './notification-store';

/** Event types that should produce a notification when they arrive. */
const NOTIFIABLE_EVENTS = new Set([
  'plan.created',
  'plan.approved',
  'plan.completed',
  'plan.cancelled',
  'changeset.created',
  'changeset.applied',
  'verification.completed',
  'collab.submitted',
  'collab.approved',
  'collab.rejected',
  'agent.started',
  'agent.completed',
  'agent.failed',
  'session.created',
  'session.completed',
  'system.error',
  'memory.indexed',
]);

/** Notifiable event types that get elevated to 'error' severity in the UI. */
const ERROR_EVENTS = new Set(['collab.rejected', 'plan.cancelled', 'system.error', 'verification.completed']);

export class NotificationService {
  private store: NotificationStore;
  private logger?: Logger;
  private unsub?: () => void;

  constructor(options: { store: NotificationStore; logger?: Logger }) {
    this.store = options.store;
    this.logger = options.logger?.child({ component: 'notification-service' });
  }

  /** Start listening to activity events and auto-recording notifications. */
  start(activityOnEvent: (fn: (event: WorkspaceEvent) => void) => () => void): void {
    this.unsub = activityOnEvent((event: WorkspaceEvent) => {
      if (!NOTIFIABLE_EVENTS.has(event.type)) return;

      const isError =
        ERROR_EVENTS.has(event.type) || (event.type === 'verification.completed' && this._verificationFailed(event));

      this.store
        .insert({
          id: `notif-${event.id}`,
          type: isError ? 'error' : event.category === 'agent' ? 'agent' : 'info',
          category: event.category,
          message: event.message,
          actorName: event.actor?.name ?? 'System',
          resourceType: event.resource?.type ?? 'unknown',
          resourceId: event.resource?.id ?? 'unknown',
          timestamp: event.timestamp,
          metadata: {
            eventType: event.type,
            resourceName: event.resource?.name,
            actorId: event.actor?.id,
            ...(event.metadata ?? {}),
          },
        })
        .catch((err) => this.logger?.warn('Failed to record notification', { error: String(err) }));
    });
    this.logger?.info('NotificationService started');
  }

  stop(): void {
    this.unsub?.();
    this.unsub = undefined;
  }

  // ── Query API ────────────────────────────────────────────

  async list(options?: {
    limit?: number;
    unreadOnly?: boolean;
    category?: string;
    before?: string;
  }): Promise<AppNotification[]> {
    return this.store.list(options);
  }

  async markRead(id: string): Promise<void> {
    return this.store.markRead(id);
  }

  async markAllRead(): Promise<number> {
    return this.store.markAllRead();
  }

  async unreadCount(): Promise<number> {
    return this.store.unreadCount();
  }

  private _verificationFailed(event: WorkspaceEvent): boolean {
    const meta = event.metadata ?? {};
    return (meta.failed as number) > 0 || meta.allPassed === false;
  }
}

export type { AppNotification } from './notification-store';
