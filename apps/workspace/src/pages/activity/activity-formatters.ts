import type { ActivityDensity, ActivityOrganizationalEffect, ActivityRecord, ActivitySeverity } from './activity-types';

/**
 * Activity hierarchy — coarse category used to group the stream into an
 * engineering-operations timeline (WORKFLOW / PLAN / AGENT / TOOL / TEST /
 * REVIEW / VERIFY / EVIDENCE) rather than a flat list of messages.
 */
export type ActivityCategory =
  | 'WORKFLOW'
  | 'PLAN'
  | 'AGENT'
  | 'TOOL'
  | 'TEST'
  | 'REVIEW'
  | 'VERIFY'
  | 'EVIDENCE'
  | 'HUMAN';

export function hierarchyCategory(record: ActivityRecord): ActivityCategory {
  switch (record.kind) {
    case 'workflow':
      return 'WORKFLOW';
    case 'test':
      return 'TEST';
    case 'verification':
      return 'VERIFY';
    case 'task':
      return 'PLAN';
    case 'agent-message': {
      if (record.actor.type === 'human') return 'HUMAN';
      switch (record.messageKind) {
        case 'tool-call':
        case 'tool-result':
          return 'TOOL';
        case 'approval-request':
        case 'approval-decision':
          return 'REVIEW';
        default:
          return record.effect === 'finding' || record.effect === 'recommendation' ? 'REVIEW' : 'AGENT';
      }
    }
    default:
      return 'AGENT';
  }
}

const CATEGORY_META: Record<ActivityCategory, { icon: string; accent: string }> = {
  WORKFLOW: { icon: '◈', accent: 'var(--vestara-blue)' },
  PLAN: { icon: '▣', accent: 'var(--vestara-violet, #a78bfa)' },
  AGENT: { icon: '●', accent: 'var(--vestara-text-2)' },
  TOOL: { icon: '⌘', accent: 'var(--vestara-text-dim)' },
  TEST: { icon: '✓', accent: 'var(--vestara-green)' },
  REVIEW: { icon: '⚠', accent: 'var(--vestara-amber)' },
  VERIFY: { icon: '⚖', accent: 'var(--vestara-blue)' },
  EVIDENCE: { icon: '◆', accent: 'var(--vestara-green)' },
  HUMAN: { icon: '✎', accent: 'var(--vestara-accent-text)' },
};

export function categoryIcon(category: ActivityCategory): string {
  return CATEGORY_META[category]?.icon ?? '◇';
}

export function categoryAccent(category: ActivityCategory): string {
  return CATEGORY_META[category]?.accent ?? 'var(--vestara-text-dim)';
}

export type CollapsedStreamEntry =
  | { kind: 'record'; record: ActivityRecord }
  | { kind: 'tools'; agentId: string; count: number; lastTool: string; timestamp: string };

/**
 * Aggregate consecutive low-level tool events from the same agent into a single
 * operational row so a long run of tool chatter never renders as many rows.
 */
export function collapseToolRuns(records: readonly ActivityRecord[]): CollapsedStreamEntry[] {
  const out: CollapsedStreamEntry[] = [];
  let run: { agentId: string; count: number; lastTool: string; timestamp: string } | null = null;
  for (const record of records) {
    if (hierarchyCategory(record) === 'TOOL' && record.kind === 'agent-message') {
      const agentId = String(record.agentId ?? record.actor.id ?? 'agent');
      const toolName = String(record.toolName ?? record.content ?? '').slice(0, 60);
      if (run && run.agentId === agentId) {
        run.count += 1;
        run.lastTool = toolName;
        run.timestamp = record.timestamp;
      } else {
        if (run) out.push({ kind: 'tools', ...run });
        run = { agentId, count: 1, lastTool: toolName, timestamp: record.timestamp };
      }
    } else {
      if (run) {
        out.push({ kind: 'tools', ...run });
        run = null;
      }
      out.push({ kind: 'record', record });
    }
  }
  if (run) out.push({ kind: 'tools', ...run });
  return out;
}

/**
 * Whether a record is shown at a given density. Summary shows milestones,
 * decisions, errors, verification, approvals, findings and human messages.
 * Operational (default) adds tool/file/test activity. Raw shows everything.
 */
export function matchesDensity(record: ActivityRecord, density: ActivityDensity): boolean {
  if (density === 'raw') return true;
  const category = hierarchyCategory(record);
  if (density === 'summary') {
    if (category === 'HUMAN' || category === 'WORKFLOW' || category === 'VERIFY' || category === 'REVIEW') return true;
    if (record.kind === 'agent-message') {
      if (record.messageKind === 'approval-request' || record.messageKind === 'approval-decision') return true;
      if (record.effect === 'finding' || record.effect === 'decision' || record.effect === 'authorization') return true;
      if (record.risk === 'high' || record.risk === 'critical') return true;
    }
    return false;
  }
  // operational: hide raw tool/event chatter
  return category !== 'TOOL';
}

const KIND_LABELS: Record<string, string> = {
  workflow: 'Workflow',
  task: 'Task',
  'agent-message': 'Agent',
  test: 'Test',
  verification: 'Verification',
};

const EFFECT_LABELS: Record<ActivityOrganizationalEffect, string> = {
  message: 'Message',
  finding: 'Finding',
  recommendation: 'Recommendation',
  decision: 'Decision',
  authorization: 'Authorization',
  intervention: 'Intervention',
  handoff: 'Handoff',
  closure: 'Closure',
  recognition: 'Recognition',
  hold: 'Hold',
};

export function effectLabel(effect: ActivityOrganizationalEffect): string {
  return EFFECT_LABELS[effect] ?? effect;
}

export function effectAccent(effect: ActivityOrganizationalEffect): string {
  switch (effect) {
    case 'authorization':
    case 'decision':
      return 'var(--vestara-blue)';
    case 'hold':
    case 'intervention':
      return 'var(--vestara-amber)';
    case 'closure':
      return 'var(--vestara-green)';
    case 'finding':
    case 'recommendation':
      return 'var(--vestara-violet, #a78bfa)';
    default:
      return 'var(--vestara-text-dim)';
  }
}

const KIND_ICONS: Record<string, string> = {
  workflow: '◈',
  task: '▣',
  'agent-message': '●',
  test: '✓',
  verification: '⚖',
};

export function kindLabel(kind: ActivityRecord['kind']): string {
  return KIND_LABELS[kind] ?? kind;
}

export function kindIcon(kind: ActivityRecord['kind']): string {
  return KIND_ICONS[kind] ?? '◇';
}

/**
 * Display severity derived from the typed record. Mirrors the projection
 * package's `severityOf` (imported here only as a type, since the app's bundler
 * does not consume the package's CommonJS runtime output).
 */
export function severityOfRecord(record: ActivityRecord): ActivitySeverity {
  switch (record.kind) {
    case 'workflow':
      if (record.currentState === 'completed' || record.currentState === 'approved') return 'success';
      if (record.currentState === 'cancelled') return 'warning';
      return 'info';
    case 'task':
      switch (record.status) {
        case 'completed':
          return 'success';
        case 'failed':
          return 'error';
        case 'blocked':
        case 'cancelled':
          return 'warning';
        default:
          return 'info';
      }
    case 'agent-message':
      if (record.messageKind === 'tool-result' && record.status === 'failed') return 'error';
      if (record.messageKind === 'approval-request') return 'warning';
      if (record.risk === 'high' || record.risk === 'critical') return 'warning';
      return 'info';
    case 'test':
      if (record.failed > 0) return 'error';
      if (record.passed > 0) return 'success';
      return 'info';
    case 'verification':
      switch (record.outcome) {
        case 'passed':
          return 'success';
        case 'failed':
          return 'error';
        case 'blocked':
          return 'warning';
        default:
          return 'info';
      }
    default:
      return 'info';
  }
}

const SEVERITY_ACCENT: Record<ActivitySeverity, string> = {
  info: 'var(--vestara-blue)',
  success: 'var(--vestara-green)',
  warning: 'var(--vestara-amber)',
  error: 'var(--vestara-red)',
};

const SEVERITY_BADGE: Record<ActivitySeverity, string> = {
  info: 'bg-(--vestara-blue)/10 text-(--vestara-blue) border-(--vestara-blue)/30',
  success: 'bg-(--vestara-green)/10 text-(--vestara-green) border-(--vestara-green)/30',
  warning: 'bg-(--vestara-amber)/10 text-(--vestara-amber) border-(--vestara-amber)/30',
  error: 'bg-(--vestara-red)/10 text-(--vestara-red) border-(--vestara-red)/30',
};

export function severityAccent(severity: ActivitySeverity): string {
  return SEVERITY_ACCENT[severity] ?? SEVERITY_ACCENT.info;
}

export function severityBadge(severity: ActivitySeverity): string {
  return SEVERITY_BADGE[severity] ?? SEVERITY_BADGE.info;
}

export function actorInitials(record: ActivityRecord): string {
  const name = record.actor.displayName || record.actor.id || '?';
  return name.slice(0, 2).toUpperCase();
}

export function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatRelative(timestamp: string | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
