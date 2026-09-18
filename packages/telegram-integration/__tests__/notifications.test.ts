/**
 * VES-TG-018: Telegram Notifications — tests
 */

import { describe, expect, it } from 'vitest';
import {
  buildNotificationDelivery,
  defaultNotificationPreferences,
  isWithinQuietHours,
  type NotificationEvent,
  normalizeNotificationPreferences,
  TelegramNotificationPolicy,
} from '../src/notifications';

function event(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    type: 'execution.completed',
    severity: 'info',
    title: 'Run finished',
    body: '48 tests passed',
    timestamp: '2026-09-16T10:00:00.000Z',
    ...overrides,
  };
}

describe('defaults', () => {
  it('enables the seven work-critical events and disables ambient ones', () => {
    const prefs = defaultNotificationPreferences();
    expect(prefs.enabled['execution.completed']).toBe(true);
    expect(prefs.enabled['execution.failed']).toBe(true);
    expect(prefs.enabled['approval.required']).toBe(true);
    expect(prefs.enabled['agent.needs_input']).toBe(true);
    expect(prefs.enabled['workflow.completed']).toBe(true);
    expect(prefs.enabled['build.failed']).toBe(true);
    expect(prefs.enabled['tests.failed']).toBe(true);
    expect(prefs.enabled['marketplace.updates']).toBe(false);
    expect(prefs.enabled['general.activity']).toBe(false);
    expect(prefs.minSeverity).toBe('info');
    expect(prefs.quietHours.enabled).toBe(false);
  });
});

describe('normalizeNotificationPreferences', () => {
  it('fills defaults for partial payloads', () => {
    const normalized = normalizeNotificationPreferences({ enabled: { 'execution.completed': false } });
    expect(normalized.enabled['execution.completed']).toBe(false);
    expect(normalized.enabled['execution.failed']).toBe(true);
  });

  it('drops unknown event keys and invalid severities', () => {
    const normalized = normalizeNotificationPreferences({
      enabled: { 'made.up': true },
      minSeverity: 'catastrophic',
    });
    expect('made.up' in normalized.enabled).toBe(false);
    expect(normalized.minSeverity).toBe('info');
  });

  it('clamps out-of-range quiet hours', () => {
    const normalized = normalizeNotificationPreferences({ quietHours: { enabled: true, startHour: 99, endHour: -3 } });
    expect(normalized.quietHours.startHour).toBe(22);
    expect(normalized.quietHours.endHour).toBe(7);
  });
});

describe('quiet hours', () => {
  it('handles an overnight window', () => {
    const quiet = { enabled: true, startHour: 22, endHour: 7 };
    expect(isWithinQuietHours(quiet, 23)).toBe(true);
    expect(isWithinQuietHours(quiet, 3)).toBe(true);
    expect(isWithinQuietHours(quiet, 7)).toBe(false);
    expect(isWithinQuietHours(quiet, 12)).toBe(false);
  });

  it('handles a same-day window', () => {
    const quiet = { enabled: true, startHour: 9, endHour: 17 };
    expect(isWithinQuietHours(quiet, 9)).toBe(true);
    expect(isWithinQuietHours(quiet, 16)).toBe(true);
    expect(isWithinQuietHours(quiet, 17)).toBe(false);
  });

  it('is inert when disabled or empty', () => {
    expect(isWithinQuietHours({ enabled: false, startHour: 0, endHour: 23 }, 12)).toBe(false);
    expect(isWithinQuietHours({ enabled: true, startHour: 5, endHour: 5 }, 5)).toBe(false);
  });
});

describe('TelegramNotificationPolicy', () => {
  it('allows a default-enabled event at noon', () => {
    const policy = new TelegramNotificationPolicy();
    const decision = policy.evaluateFor('principal-1', event(), new Date('2026-09-16T12:00:00'));
    expect(decision).toEqual({ deliver: true, reason: 'allowed' });
  });

  it('rejects a disabled event type', () => {
    const policy = new TelegramNotificationPolicy();
    const decision = policy.evaluateFor('principal-1', event({ type: 'general.activity' }));
    expect(decision).toEqual({ deliver: false, reason: 'event-disabled' });
  });

  it('rejects below the minimum severity', () => {
    const policy = new TelegramNotificationPolicy();
    policy.setPreferences('principal-1', { minSeverity: 'error' });
    expect(policy.evaluateFor('principal-1', event({ severity: 'warning' }))).toEqual({
      deliver: false,
      reason: 'below-min-severity',
    });
    expect(policy.evaluateFor('principal-1', event({ severity: 'error' }))).toEqual({
      deliver: true,
      reason: 'allowed',
    });
  });

  it('honours workspace, project, and agent filters', () => {
    const policy = new TelegramNotificationPolicy();
    policy.setPreferences('p', {
      filters: { workspaceIds: ['ws-1'], projectIds: ['proj-1'], agentIds: ['agent-dev'] },
    });
    expect(policy.evaluateFor('p', event({ workspaceId: 'ws-2' })).reason).toBe('filtered-workspace');
    expect(policy.evaluateFor('p', event({ workspaceId: 'ws-1', projectId: 'proj-2' })).reason).toBe(
      'filtered-project',
    );
    expect(
      policy.evaluateFor('p', event({ workspaceId: 'ws-1', projectId: 'proj-1', agentId: 'agent-other' })).reason,
    ).toBe('filtered-agent');
    expect(
      policy.evaluateFor('p', event({ workspaceId: 'ws-1', projectId: 'proj-1', agentId: 'agent-dev' })).deliver,
    ).toBe(true);
  });

  it('suppresses during quiet hours', () => {
    const policy = new TelegramNotificationPolicy();
    policy.setPreferences('p', { quietHours: { enabled: true, startHour: 22, endHour: 7 } });
    expect(policy.evaluateFor('p', event(), new Date('2026-09-16T02:00:00')).reason).toBe('quiet-hours');
    expect(policy.evaluateFor('p', event(), new Date('2026-09-16T12:00:00')).deliver).toBe(true);
  });

  it('uses the event principal when evaluating inline', () => {
    const policy = new TelegramNotificationPolicy();
    policy.setPreferences('p-2', { minSeverity: 'critical' });
    expect(policy.evaluate(event({ principalId: 'p-2' })).reason).toBe('below-min-severity');
  });

  it('reports whether preferences were explicitly stored', () => {
    const policy = new TelegramNotificationPolicy();
    expect(policy.hasPreferences('p')).toBe(false);
    policy.setPreferences('p', {});
    expect(policy.hasPreferences('p')).toBe(true);
  });
});

describe('buildNotificationDelivery', () => {
  it('projects a high-priority delivery for failures with execution provenance', () => {
    const delivery = buildNotificationDelivery(
      event({ type: 'execution.failed', severity: 'error', executionId: 'exec-9' }),
      'chat-1',
    );
    expect(delivery.channel).toBe('telegram');
    expect(delivery.conversation.externalId).toBe('chat-1');
    expect(delivery.priority).toBe('high');
    expect(delivery.content.text).toContain('exec-9');
    expect(delivery.metadata?.notificationType).toBe('execution.failed');
  });

  it('uses normal priority for informational events', () => {
    const delivery = buildNotificationDelivery(event(), 'chat-1');
    expect(delivery.priority).toBe('normal');
  });
});
