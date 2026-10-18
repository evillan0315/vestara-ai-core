/**
 * VES-TG-014 — Telegram Activity Room projection tests.
 *
 * Proves:
 * - canonical activities are filtered, ordered, and projected with provenance,
 * - stale activities are dropped,
 * - progress vs terminal classification is correct,
 * - missing/stale activity is handled gracefully,
 * - batch limits are respected.
 */

import { describe, expect, it } from 'vitest';
import { type ProjectableActivity, TelegramActivityProjection } from '../src/activity-projection';

function activity(overrides?: Partial<ProjectableActivity>): ProjectableActivity {
  return {
    activityId: 'act-1',
    type: 'execution.started',
    timestamp: '2026-10-18T10:00:00Z',
    message: 'Execution started',
    executionId: 'exec-1',
    workspaceId: 'ws-1',
    ...overrides,
  };
}

describe('TelegramActivityProjection.projectActivity', () => {
  it('projects a canonical activity with provenance', () => {
    const projection = new TelegramActivityProjection();
    const delivery = projection.projectActivity(activity(), 'chat-1');
    expect(delivery).not.toBeNull();
    expect(delivery!.channel).toBe('telegram');
    expect(delivery!.content.text).toContain('Execution Started');
    expect(delivery!.content.text).toContain('ws-1');
    expect(delivery!.content.text).toContain('exec-1');
  });

  it('returns null for non-projectable types', () => {
    const projection = new TelegramActivityProjection();
    const delivery = projection.projectActivity(activity({ type: 'unknown.type' as any }), 'chat-1');
    expect(delivery).toBeNull();
  });

  it('drops stale activities', () => {
    const projection = new TelegramActivityProjection();
    const first = projection.projectActivity(activity({ timestamp: '2026-10-18T10:00:00Z' }), 'chat-1');
    expect(first).not.toBeNull();

    const stale = projection.projectActivity(activity({ timestamp: '2026-10-18T09:00:00Z' }), 'chat-1');
    expect(stale).toBeNull();
  });

  it('allows same-timestamp activities with different IDs', () => {
    const projection = new TelegramActivityProjection();
    const a = projection.projectActivity(activity({ activityId: 'a1', timestamp: '2026-10-18T10:00:00Z' }), 'chat-1');
    const b = projection.projectActivity(activity({ activityId: 'a2', timestamp: '2026-10-18T10:00:00Z' }), 'chat-1');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });
});

describe('TelegramActivityProjection.projectActivities (batch)', () => {
  it('orders by timestamp ascending', () => {
    const projection = new TelegramActivityProjection();
    const deliveries = projection.projectActivities(
      [
        activity({ activityId: 'a3', timestamp: '2026-10-18T12:00:00Z' }),
        activity({ activityId: 'a1', timestamp: '2026-10-18T10:00:00Z' }),
        activity({ activityId: 'a2', timestamp: '2026-10-18T11:00:00Z' }),
      ],
      'chat-1',
    );
    expect(deliveries).toHaveLength(3);
    expect(deliveries[0]!.content.text).toContain('10:00');
    expect(deliveries[1]!.content.text).toContain('11:00');
    expect(deliveries[2]!.content.text).toContain('12:00');
  });

  it('filters non-projectable types from batch', () => {
    const projection = new TelegramActivityProjection();
    const deliveries = projection.projectActivities(
      [
        activity({ activityId: 'a1', type: 'execution.started' }),
        activity({ activityId: 'a2', type: 'unknown.type' as any }),
        activity({ activityId: 'a3', type: 'execution.failed' }),
      ],
      'chat-1',
    );
    expect(deliveries).toHaveLength(2);
  });

  it('respects maxPerBatch limit', () => {
    const projection = new TelegramActivityProjection({ maxPerBatch: 2 });
    const activities = Array.from({ length: 5 }, (_, i) =>
      activity({
        activityId: `a${i}`,
        timestamp: `2026-10-18T10:00:0${i}Z`,
      }),
    );
    const deliveries = projection.projectActivities(activities, 'chat-1');
    expect(deliveries).toHaveLength(2);
  });
});

describe('TelegramActivityProjection classification', () => {
  it('classifies progress types as coalesceable', () => {
    const projection = new TelegramActivityProjection();
    expect(projection.isCoalesceable('execution.progress')).toBe(true);
    expect(projection.isCoalesceable('task.started')).toBe(true);
  });

  it('classifies terminal types as non-coalesceable', () => {
    const projection = new TelegramActivityProjection();
    expect(projection.isCoalesceable('execution.completed')).toBe(false);
    expect(projection.isTerminal('execution.completed')).toBe(true);
    expect(projection.isTerminal('execution.failed')).toBe(true);
  });

  it('marks failed terminal deliveries as high priority', () => {
    const projection = new TelegramActivityProjection();
    const delivery = projection.projectActivity(activity({ type: 'execution.failed' }), 'chat-1');
    expect(delivery!.priority).toBe('high');
  });

  it('marks successful terminal deliveries as normal priority', () => {
    const projection = new TelegramActivityProjection();
    const delivery = projection.projectActivity(activity({ type: 'execution.completed' }), 'chat-1');
    expect(delivery!.priority).toBe('normal');
  });
});

describe('TelegramActivityProjection.resetCache', () => {
  it('allows re-projection after reset', () => {
    const projection = new TelegramActivityProjection();
    const a = projection.projectActivity(activity({ timestamp: '2026-10-18T10:00:00Z' }), 'chat-1');
    expect(a).not.toBeNull();

    projection.resetCache();
    const b = projection.projectActivity(activity({ timestamp: '2026-10-18T10:00:00Z' }), 'chat-1');
    expect(b).not.toBeNull();
  });
});
