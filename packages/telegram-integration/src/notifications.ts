/**
 * VES-TG-018: Telegram Notifications
 *
 * User-configurable notification policy for Telegram delivery. Decisions are
 * made against a principal's stored preferences (event toggles, minimum
 * severity, workspace/project/agent filters, quiet hours) and never mutate
 * the event itself — the policy only answers whether Telegram should deliver.
 *
 * Notifications are a projection: the canonical record always lives in the
 * Vestara Activity Room / event store. Telegram delivery is best-effort and
 * never authoritative (TG-S1/S2/S3).
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-018)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

import { randomBytes } from 'node:crypto';
import type { ChannelDelivery } from '@vestara/channel-types';

// ─── Types ─────────────────────────────────────────────────────

export type NotificationEventType =
  | 'execution.completed'
  | 'execution.failed'
  | 'approval.required'
  | 'agent.needs_input'
  | 'workflow.completed'
  | 'build.failed'
  | 'tests.failed'
  | 'marketplace.updates'
  | 'general.activity';

export type NotificationSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface QuietHours {
  /** Whether quiet hours are enforced */
  readonly enabled: boolean;

  /** Inclusive start hour (0-23, local time) */
  readonly startHour: number;

  /** Exclusive end hour (0-23, local time) */
  readonly endHour: number;
}

export interface NotificationFilters {
  /** Restrict delivery to these workspace IDs (empty/undefined = all) */
  readonly workspaceIds?: readonly string[];

  /** Restrict delivery to these project IDs (empty/undefined = all) */
  readonly projectIds?: readonly string[];

  /** Restrict delivery to these agent IDs (empty/undefined = all) */
  readonly agentIds?: readonly string[];
}

export interface NotificationPreferences {
  /** Per-event-type delivery toggles */
  readonly enabled: Readonly<Record<NotificationEventType, boolean>>;

  /** Lowest severity that may be delivered */
  readonly minSeverity: NotificationSeverity;

  /** Optional scope filters */
  readonly filters: NotificationFilters;

  /** Quiet hours window */
  readonly quietHours: QuietHours;
}

export interface NotificationEvent {
  /** Canonical event type */
  readonly type: NotificationEventType;

  /** Principal the notification targets (required for policy evaluation) */
  readonly principalId?: string;

  /** Severity */
  readonly severity: NotificationSeverity;

  /** Short title */
  readonly title: string;

  /** Body text */
  readonly body: string;

  /** Workspace scope (for filtering) */
  readonly workspaceId?: string;

  /** Project scope (for filtering) */
  readonly projectId?: string;

  /** Agent scope (for filtering) */
  readonly agentId?: string;

  /** Correlated execution (provenance only) */
  readonly executionId?: string;

  /** Correlated Vestara conversation (provenance only) */
  readonly conversationId?: string;

  /** Correlation ID for telemetry */
  readonly correlationId?: string;

  /** ISO-8601 timestamp */
  readonly timestamp: string;
}

export type NotificationDecisionReason =
  | 'allowed'
  | 'event-disabled'
  | 'below-min-severity'
  | 'filtered-workspace'
  | 'filtered-project'
  | 'filtered-agent'
  | 'quiet-hours';

export interface NotificationDecision {
  /** Whether Telegram should deliver this event */
  readonly deliver: boolean;

  /** Why the decision was made (auditable, never inferred) */
  readonly reason: NotificationDecisionReason;
}

/** Catalog metadata for Settings UI rendering (defaults are authoritative here). */
export interface NotificationEventDescriptor {
  readonly type: NotificationEventType;
  readonly label: string;
  readonly description: string;
  readonly defaultEnabled: boolean;
}

// ─── Catalog ───────────────────────────────────────────────────

export const NOTIFICATION_EVENT_CATALOG: readonly NotificationEventDescriptor[] = [
  {
    type: 'execution.completed',
    label: 'Execution completed',
    description: 'An agent execution finished successfully.',
    defaultEnabled: true,
  },
  {
    type: 'execution.failed',
    label: 'Execution failed',
    description: 'An agent execution terminated with an error.',
    defaultEnabled: true,
  },
  {
    type: 'approval.required',
    label: 'Approval required',
    description: 'A governed action is waiting for approval.',
    defaultEnabled: true,
  },
  {
    type: 'agent.needs_input',
    label: 'Agent needs input',
    description: 'An agent paused because it needs a human answer.',
    defaultEnabled: true,
  },
  {
    type: 'workflow.completed',
    label: 'Workflow completed',
    description: 'A workflow reached a terminal success state.',
    defaultEnabled: true,
  },
  {
    type: 'build.failed',
    label: 'Build failed',
    description: 'A build run failed.',
    defaultEnabled: true,
  },
  {
    type: 'tests.failed',
    label: 'Tests failed',
    description: 'A test run failed.',
    defaultEnabled: true,
  },
  {
    type: 'marketplace.updates',
    label: 'Marketplace updates',
    description: 'Marketplace catalog changes and extension updates.',
    defaultEnabled: false,
  },
  {
    type: 'general.activity',
    label: 'General activity',
    description: 'Ambient Activity Room activity.',
    defaultEnabled: false,
  },
];

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

const EVENT_TYPES: readonly NotificationEventType[] = NOTIFICATION_EVENT_CATALOG.map((entry) => entry.type);

// ─── Defaults ──────────────────────────────────────────────────

export function defaultNotificationPreferences(): NotificationPreferences {
  const enabled = Object.fromEntries(
    NOTIFICATION_EVENT_CATALOG.map((entry) => [entry.type, entry.defaultEnabled]),
  ) as Record<NotificationEventType, boolean>;

  return {
    enabled,
    minSeverity: 'info',
    filters: {},
    quietHours: { enabled: false, startHour: 22, endHour: 7 },
  };
}

// ─── Validation ────────────────────────────────────────────────

function isEventType(value: unknown): value is NotificationEventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

function isSeverity(value: unknown): value is NotificationSeverity {
  return value === 'info' || value === 'warning' || value === 'error' || value === 'critical';
}

function normalizeHour(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  if (value < 0 || value > 23) return fallback;
  return value;
}

/**
 * Coerce untrusted (persisted or HTTP) input into valid preferences.
 * Unknown event keys are dropped and defaults fill the gaps, so a partial
 * or stale payload can never disable notifications by accident.
 */
export function normalizeNotificationPreferences(input: unknown): NotificationPreferences {
  const defaults = defaultNotificationPreferences();
  if (typeof input !== 'object' || input === null) return defaults;
  const record = input as Record<string, unknown>;

  const enabled: Record<NotificationEventType, boolean> = { ...defaults.enabled };
  if (typeof record.enabled === 'object' && record.enabled !== null) {
    for (const [key, value] of Object.entries(record.enabled as Record<string, unknown>)) {
      if (isEventType(key) && typeof value === 'boolean') enabled[key] = value;
    }
  }

  const filters = defaults.filters;
  const rawFilters = record.filters;
  const normalizedFilters: NotificationFilters =
    typeof rawFilters === 'object' && rawFilters !== null
      ? {
          workspaceIds: stringList((rawFilters as Record<string, unknown>).workspaceIds),
          projectIds: stringList((rawFilters as Record<string, unknown>).projectIds),
          agentIds: stringList((rawFilters as Record<string, unknown>).agentIds),
        }
      : filters;

  const rawQuiet = record.quietHours;
  const quiet: QuietHours =
    typeof rawQuiet === 'object' && rawQuiet !== null
      ? {
          enabled: (rawQuiet as Record<string, unknown>).enabled === true,
          startHour: normalizeHour((rawQuiet as Record<string, unknown>).startHour, defaults.quietHours.startHour),
          endHour: normalizeHour((rawQuiet as Record<string, unknown>).endHour, defaults.quietHours.endHour),
        }
      : defaults.quietHours;

  return {
    enabled,
    minSeverity: isSeverity(record.minSeverity) ? record.minSeverity : defaults.minSeverity,
    filters: normalizedFilters,
    quietHours: quiet,
  };
}

function stringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return list.length > 0 ? list : undefined;
}

// ─── Quiet Hours ───────────────────────────────────────────────

/**
 * True when `hour` falls inside the quiet window. Handles the common
 * overnight case (`start > end`, e.g. 22 → 07).
 */
export function isWithinQuietHours(quietHours: QuietHours, hour: number): boolean {
  if (!quietHours.enabled) return false;
  const { startHour, endHour } = quietHours;
  if (startHour === endHour) return false;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

// ─── Notification Policy ───────────────────────────────────────

/**
 * Per-principal notification policy. Preferences are read through this
 * boundary; persistence is the caller's concern (store or settings API).
 */
export class TelegramNotificationPolicy {
  private preferences: Map<string, NotificationPreferences> = new Map();

  constructor(preferences?: Readonly<Record<string, NotificationPreferences>>) {
    for (const [principalId, value] of Object.entries(preferences ?? {})) {
      this.preferences.set(principalId, normalizeNotificationPreferences(value));
    }
  }

  /** Get effective preferences for a principal (defaults when unset). */
  getPreferences(principalId: string): NotificationPreferences {
    return this.preferences.get(principalId) ?? defaultNotificationPreferences();
  }

  /** Replace a principal's preferences, returning the normalized result. */
  setPreferences(principalId: string, preferences: unknown): NotificationPreferences {
    const normalized = normalizeNotificationPreferences(preferences);
    this.preferences.set(principalId, normalized);
    return normalized;
  }

  /** True when the principal has explicitly stored preferences. */
  hasPreferences(principalId: string): boolean {
    return this.preferences.has(principalId);
  }

  /**
   * Decide whether a notification event should be delivered to Telegram.
   * Evaluated in a deterministic order so the recorded reason is stable.
   */
  evaluate(event: NotificationEvent, now: Date = new Date()): NotificationDecision {
    return this.evaluateFor(event.principalId ?? '', event, now);
  }

  /**
   * Decide for an explicit principal. This is the canonical entry point;
   * `evaluate` is a convenience for events that carry their principal inline.
   */
  evaluateFor(
    principalId: string,
    event: Omit<NotificationEvent, 'principalId'>,
    now: Date = new Date(),
  ): NotificationDecision {
    const prefs = this.getPreferences(principalId);

    if (!prefs.enabled[event.type]) {
      return { deliver: false, reason: 'event-disabled' };
    }
    if (SEVERITY_RANK[event.severity] < SEVERITY_RANK[prefs.minSeverity]) {
      return { deliver: false, reason: 'below-min-severity' };
    }
    if (!matchesScope(prefs.filters.workspaceIds, event.workspaceId)) {
      return { deliver: false, reason: 'filtered-workspace' };
    }
    if (!matchesScope(prefs.filters.projectIds, event.projectId)) {
      return { deliver: false, reason: 'filtered-project' };
    }
    if (!matchesScope(prefs.filters.agentIds, event.agentId)) {
      return { deliver: false, reason: 'filtered-agent' };
    }
    if (isWithinQuietHours(prefs.quietHours, now.getHours())) {
      return { deliver: false, reason: 'quiet-hours' };
    }
    return { deliver: true, reason: 'allowed' };
  }
}

function matchesScope(scope: readonly string[] | undefined, value: string | undefined): boolean {
  if (!scope || scope.length === 0) return true;
  if (value === undefined) return false;
  return scope.includes(value);
}

// ─── Delivery Projection ───────────────────────────────────────

const SEVERITY_EMOJI: Record<NotificationSeverity, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  critical: '🚨',
};

/**
 * Project a notification event into a canonical Telegram delivery.
 * Pure: no I/O, no delivery side effects.
 */
export function buildNotificationDelivery(event: NotificationEvent, chatId: string): ChannelDelivery {
  const emoji = SEVERITY_EMOJI[event.severity];
  const lines = [`${emoji} **${event.title}**`, '', event.body];
  if (event.executionId) lines.push('', `_Execution ${event.executionId}_`);

  return {
    id: `notif-${Date.now()}-${randomBytes(4).toString('hex')}`,
    channel: 'telegram',
    conversation: {
      channel: 'telegram',
      externalId: chatId,
      type: 'direct',
    },
    content: { text: lines.join('\n') },
    priority: event.severity === 'critical' || event.severity === 'error' ? 'high' : 'normal',
    metadata: {
      notificationType: event.type,
      severity: event.severity,
      ...(event.correlationId ? { correlationId: event.correlationId } : {}),
    },
  };
}
