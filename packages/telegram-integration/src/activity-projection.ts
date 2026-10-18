/**
 * VES-TG-014: Telegram Activity Room Projection
 *
 * Projects canonical Activity Room events to Telegram messages. Telegram is a
 * channel — it never owns activity state (TG-S1/S2). Events are filtered,
 * ordered, and rendered as bounded Telegram deliveries with workspace
 * provenance for correlation.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-014)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

import { randomBytes } from 'node:crypto';
import type { ChannelDelivery } from '@vestara/channel-types';

// ─── Types ─────────────────────────────────────────────────────

/** Canonical activity types eligible for Telegram projection. */
export type ProjectableActivityType =
  | 'execution.started'
  | 'execution.progress'
  | 'execution.completed'
  | 'execution.failed'
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.blocked'
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'verification.passed'
  | 'verification.failed'
  | 'test.passed'
  | 'test.failed'
  | 'agent-message';

/** Minimal activity shape required for projection. Structural — callers adapt
 *  their own ActivityRecord types onto this; telegram-integration never imports
 *  activity-room domain types. */
export interface ProjectableActivity {
  readonly activityId: string;
  readonly type: ProjectableActivityType;
  readonly timestamp: string;
  readonly message?: string;
  readonly executionId?: string;
  readonly workflowRunId?: string;
  readonly taskId?: string;
  readonly workspaceId?: string;
  readonly summary?: string;
  readonly error?: string;
}

export interface ActivityProjectionConfig {
  /** Maximum activities to project in a single batch */
  readonly maxPerBatch?: number;
  /** Whether to include workspace provenance in output */
  readonly includeProvenance?: boolean;
  /** Whether to include timestamps in output */
  readonly includeTimestamps?: boolean;
  /** Custom type filter (overrides default projectable set) */
  readonly typeFilter?: readonly ProjectableActivityType[];
}

// ─── Defaults ──────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<ActivityProjectionConfig> = {
  maxPerBatch: 20,
  includeProvenance: true,
  includeTimestamps: true,
  typeFilter: [],
};

/** Types that carry progress updates — coalesced by the delivery layer. */
const PROGRESS_TYPES: ReadonlySet<ProjectableActivityType> = new Set(['execution.progress', 'task.started']);

/** Types that are terminal — always projected, never coalesced. */
const TERMINAL_TYPES: ReadonlySet<ProjectableActivityType> = new Set([
  'execution.completed',
  'execution.failed',
  'task.completed',
  'task.failed',
  'task.blocked',
  'workflow.completed',
  'workflow.failed',
  'verification.passed',
  'verification.failed',
  'test.passed',
  'test.failed',
  'agent-message',
]);

// ─── Type Emoji Map ───────────────────────────────────────────

const TYPE_EMOJI: Record<ProjectableActivityType, string> = {
  'execution.started': '🚀',
  'execution.progress': '⚡',
  'execution.completed': '✅',
  'execution.failed': '❌',
  'task.created': '📋',
  'task.started': '🔄',
  'task.completed': '✅',
  'task.failed': '❌',
  'task.blocked': '🚫',
  'workflow.started': '🔀',
  'workflow.completed': '✅',
  'workflow.failed': '❌',
  'verification.passed': '✅',
  'verification.failed': '❌',
  'test.passed': '✅',
  'test.failed': '❌',
  'agent-message': '💬',
};

// ─── Activity Projection Service ──────────────────────────────

export class TelegramActivityProjection {
  private config: Required<ActivityProjectionConfig>;
  private lastProjected: Map<string, string> = new Map();

  constructor(config?: ActivityProjectionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Project a batch of activities to Telegram deliveries.
   *
   * Filtering: only canonical projectable types are forwarded. Stale
   * activities (older than the last projected for the same activityId) are
   * dropped. Results are ordered by timestamp ascending.
   */
  projectActivities(activities: readonly ProjectableActivity[], chatId: string): ChannelDelivery[] {
    const filtered = this.filterProjectable(activities);
    const ordered = this.orderByTimestamp(filtered);
    const limited = ordered.slice(0, this.config.maxPerBatch);

    return limited.map((activity) => this.projectSingle(activity, chatId));
  }

  /**
   * Project a single activity to a Telegram delivery.
   * Returns null when the activity is not projectable or is stale.
   */
  projectActivity(activity: ProjectableActivity, chatId: string): ChannelDelivery | null {
    if (!this.isProjectable(activity.type)) return null;

    const lastTimestamp = this.lastProjected.get(activity.activityId);
    if (lastTimestamp && !isNewerThan(activity.timestamp, lastTimestamp)) return null;

    this.lastProjected.set(activity.activityId, activity.timestamp);
    return this.projectSingle(activity, chatId);
  }

  /**
   * Check whether a type should be coalesced (progress updates that can be
   * skipped when a newer update for the same execution/task arrives).
   */
  isCoalesceable(type: ProjectableActivityType): boolean {
    return PROGRESS_TYPES.has(type);
  }

  /**
   * Check whether a type is terminal (always delivered, never coalesced).
   */
  isTerminal(type: ProjectableActivityType): boolean {
    return TERMINAL_TYPES.has(type);
  }

  /**
   * Reset the stale-tracking cache. Useful when the projection is re-bound
   * to a different chat or after a delivery layer restart.
   */
  resetCache(): void {
    this.lastProjected.clear();
  }

  // ─── Internal Methods ───────────────────────────────────────

  private filterProjectable(activities: readonly ProjectableActivity[]): ProjectableActivity[] {
    if (this.config.typeFilter.length > 0) {
      const allowed = new Set(this.config.typeFilter);
      return activities.filter((a) => allowed.has(a.type));
    }
    return activities.filter((a) => this.isProjectable(a.type));
  }

  private isProjectable(type: string): type is ProjectableActivityType {
    return type in TYPE_EMOJI;
  }

  private orderByTimestamp(activities: readonly ProjectableActivity[]): ProjectableActivity[] {
    return [...activities].sort((a, b) => {
      const cmp = a.timestamp.localeCompare(b.timestamp);
      if (cmp !== 0) return cmp;
      return a.activityId.localeCompare(b.activityId);
    });
  }

  private projectSingle(activity: ProjectableActivity, chatId: string): ChannelDelivery {
    const emoji = TYPE_EMOJI[activity.type];
    const lines: string[] = [];

    const headline = this.buildHeadline(activity, emoji);
    lines.push(headline);

    const body = this.buildBody(activity);
    if (body) lines.push('', body);

    if (this.config.includeProvenance) {
      const provenance = this.buildProvenance(activity);
      if (provenance) lines.push('', provenance);
    }

    if (this.config.includeTimestamps) {
      lines.push('', `_${formatTimestamp(activity.timestamp)}_`);
    }

    return {
      id: `act-${Date.now()}-${randomBytes(4).toString('hex')}`,
      channel: 'telegram',
      conversation: {
        channel: 'telegram',
        externalId: chatId,
        type: 'direct',
      },
      content: { text: lines.join('\n') },
      priority: this.isTerminal(activity.type) && activity.type.includes('failed') ? 'high' : 'normal',
      metadata: {
        activityId: activity.activityId,
        activityType: activity.type,
        ...(activity.workspaceId ? { workspaceId: activity.workspaceId } : {}),
      },
    };
  }

  private buildHeadline(activity: ProjectableActivity, emoji: string): string {
    const label = formatActivityType(activity.type);
    return `${emoji} **${label}**`;
  }

  private buildBody(activity: ProjectableActivity): string | null {
    if (activity.message) return activity.message;
    if (activity.summary) return activity.summary;
    if (activity.error) return `Error: ${activity.error}`;
    return null;
  }

  private buildProvenance(activity: ProjectableActivity): string | null {
    const parts: string[] = [];
    if (activity.workspaceId) parts.push(`Workspace: ${activity.workspaceId}`);
    if (activity.executionId) parts.push(`Execution: ${activity.executionId}`);
    if (activity.workflowRunId) parts.push(`Run: ${activity.workflowRunId}`);
    if (activity.taskId) parts.push(`Task: ${activity.taskId}`);
    return parts.length > 0 ? `_${parts.join(' · ')}_` : null;
  }
}

// ─── Pure Helpers ─────────────────────────────────────────────

/**
 * True when `candidate` is strictly newer than `previous`.
 * Unparseable timestamps are never treated as stale.
 */
function isNewerThan(candidate: string, previous: string): boolean {
  const a = Date.parse(candidate);
  const b = Date.parse(previous);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return a > b;
}

function formatActivityType(type: ProjectableActivityType): string {
  return type.replace(/\./g, ' ').replace(/(^| )(\w)/g, (_m, prefix, char) => `${prefix}${char.toUpperCase()}`);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // UTC keeps server-rendered timestamps deterministic across timezones.
  return d.toLocaleString('en-GB', { timeZone: 'UTC', hour12: false });
}
