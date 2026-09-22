/**
 * AR-REF-001: Activity reference resolution for turn context.
 *
 * Resolves durable Activity ids (`AgentMessageActivity.referencedActivityIds`,
 * `AttentionEntry.sourceRecordId`) into bounded `TurnSurfaceReference`
 * entries for `CompletionRequest.surfaceContext.selectedReferences`.
 *
 * Authority rules:
 * - Both identity spaces are supported: the legacy organizational store
 *   (legacy record `id`) first, then the M9 store (`activityId`) — the same
 *   order as the message-ingress validator (`referenceExists`). Never
 *   rendered text, never message-content inference.
 * - Labels derive ONLY from authoritative structured fields. Bounded:
 *   whole label ≤ LABEL_MAX, excerpts ≤ EXCERPT_MAX. Raw payloads, full tool
 *   output, and entire AttentionEntry objects never enter the label.
 * - Unresolvable ids are preserved deterministically as
 *   `{kind: 'activity', id, label: 'Unresolved activity reference'}` —
 *   no fabricated context, no silent drop (the durable id survives).
 */

import type { TurnSurfaceReference } from '@vestara/shared';
import type { ActivityRecord as LegacyActivityRecord } from './contracts';
import type { ActivityRecord as M9ActivityRecord } from './m9-types';

/** Whole-label bound (characters). */
export const ACTIVITY_REFERENCE_LABEL_MAX = 300;

/** Per-field excerpt bound (characters). */
export const ACTIVITY_REFERENCE_EXCERPT_MAX = 200;

/** Deterministic label for ids present in neither store. */
export const UNRESOLVED_ACTIVITY_REFERENCE_LABEL = 'Unresolved activity reference';

/** Minimal lookup surface over the two authoritative Activity stores. */
export interface ActivityReferenceLookup {
  /** Legacy organizational store (`ActivityStore.get`). */
  readonly getLegacyActivity: (id: string) => Promise<LegacyActivityRecord | null>;
  /** M9 durable store (`getByActivityId`). */
  readonly getM9Activity: (id: string) => Promise<M9ActivityRecord | null | undefined>;
}

function excerpt(value: string | undefined, max: number = ACTIVITY_REFERENCE_EXCERPT_MAX): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : undefined;
}

function boundLabel(parts: readonly (string | undefined)[]): string {
  return parts
    .filter((part): part is string => !!part && part.length > 0)
    .join(' · ')
    .slice(0, ACTIVITY_REFERENCE_LABEL_MAX);
}

function titleCase(value: string): string {
  return value.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusWord(status: string): string {
  const normalized = status
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, '-');
  if (normalized === 'failed') return 'Failed';
  if (normalized === 'completed') return 'Completed';
  if (normalized === 'started' || normalized === 'running' || normalized === 'in-progress') return 'Running';
  if (normalized === 'blocked') return 'Blocked';
  return titleCase(status);
}

/** Bounded label for a legacy organizational Activity record. Fields only. */
export function labelLegacyActivity(record: LegacyActivityRecord): string {
  // Captured before the switch narrows the union (the default arm would
  // otherwise see `never` under exhaustive checking).
  const kind: string = record.kind;
  switch (record.kind) {
    case 'tool-call':
      return boundLabel(['TOOL', record.toolName, 'Running', `call ${record.callID}`]);
    case 'tool-result': {
      const status = record.status === 'failed' ? 'Failed' : 'Completed';
      return boundLabel(['TOOL', record.toolName, status, `call ${record.callID}`, excerpt(record.output)]);
    }
    case 'task':
      return boundLabel(['TASK', record.summary ?? record.taskId, statusWord(record.status), `task ${record.taskId}`]);
    case 'workflow':
      return boundLabel([
        'WORKFLOW',
        statusWord(record.currentState),
        excerpt(record.reason),
        `workflow ${record.workflowId}`,
      ]);
    case 'test':
      return boundLabel([
        'TEST',
        record.command,
        `${record.failed} failed · ${record.passed} passed`,
        ...(record.taskId ? [`task ${record.taskId}`] : []),
      ]);
    case 'verification': {
      const failed = record.checks.filter((check) => check.status === 'failed').length;
      return boundLabel([
        'VERIFICATION',
        titleCase(record.outcome),
        excerpt(record.reason) ?? (failed > 0 ? `${failed} checks failed` : undefined),
        ...(record.taskId ? [`task ${record.taskId}`] : []),
      ]);
    }
    case 'agent-message':
      if (record.messageKind === 'approval-request') {
        return boundLabel([
          'APPROVAL',
          record.toolName,
          excerpt(record.content, 120),
          ...(record.risk ? [`${record.risk} risk`] : []),
        ]);
      }
      return boundLabel(['MESSAGE', excerpt(record.content, 120)]);
    case 'acceptance':
      return boundLabel(['ACCEPTANCE', excerpt(record.objective, 120)]);
    default:
      return boundLabel(['ACTIVITY', titleCase(kind)]);
  }
}

function m9StatusWord(type: string): string | undefined {
  if (type.endsWith('.failed')) return 'Failed';
  if (type.endsWith('.completed') || type.endsWith('.succeeded')) return 'Completed';
  if (type.endsWith('.started') || type.endsWith('.called')) return 'Running';
  if (type.endsWith('.cancelled')) return 'Cancelled';
  return undefined;
}

/** Bounded label for an M9 durable Activity record. Type taxonomy + fields only. */
export function labelM9Activity(record: M9ActivityRecord): string {
  const [domain] = record.type.split('.');
  const status = m9StatusWord(record.type);
  const data = (record.payload.data ?? {}) as Record<string, unknown>;
  const toolName = typeof data.toolName === 'string' ? data.toolName : undefined;
  const callID = typeof data.callID === 'string' ? data.callID : undefined;
  const errorMessage = record.payload.error?.message;
  const output = record.payload.output;
  switch (domain) {
    case 'tool':
      return boundLabel([
        'TOOL',
        toolName,
        status,
        ...(callID ? [`call ${callID}`] : []),
        excerpt(errorMessage) ?? excerpt(output),
      ]);
    case 'task':
      return boundLabel(['TASK', record.taskId, status, excerpt(record.payload.message, 120)]);
    case 'workflow':
      return boundLabel(['WORKFLOW', record.workflowRunId, status, excerpt(record.payload.message, 120)]);
    case 'agent':
      return boundLabel(['ACTIVITY', record.actor.displayName, status, excerpt(record.payload.message, 120)]);
    case 'human':
      return boundLabel(['MESSAGE', record.actor.displayName, excerpt(record.payload.message, 120)]);
    case 'interaction':
      return boundLabel(['APPROVAL', status, excerpt(record.payload.message, 120)]);
    case 'system':
      return boundLabel(['EVENT', excerpt(record.payload.message, 120)]);
    default:
      return boundLabel(['ACTIVITY', titleCase(record.type)]);
  }
}

/**
 * Resolve durable Activity ids to bounded turn references, preserving input
 * order. Every input id yields exactly one entry — resolvable ids carry a
 * bounded authoritative label, unresolvable ids carry the deterministic
 * unresolved label with the durable id intact.
 */
export async function resolveActivityReferences(
  ids: readonly string[],
  lookup: ActivityReferenceLookup,
): Promise<TurnSurfaceReference[]> {
  const resolved: TurnSurfaceReference[] = [];
  for (const raw of ids) {
    const id = String(raw ?? '').trim();
    if (!id) continue;
    if (id.startsWith('diagnostic:')) {
      resolved.push({ kind: 'diagnostic', id, label: labelSystemReference(id, 'DIAGNOSTIC') } as TurnSurfaceReference);
      continue;
    }
    if (id.startsWith('finding:')) {
      resolved.push({ kind: 'finding', id, label: labelSystemReference(id, 'FINDING') } as TurnSurfaceReference);
      continue;
    }
    if (id.startsWith('verification:')) {
      resolved.push({
        kind: 'verification',
        id,
        label: labelSystemReference(id, 'VERIFICATION'),
      } as TurnSurfaceReference);
      continue;
    }
    const legacy = await lookup.getLegacyActivity(id);
    if (legacy) {
      resolved.push({ kind: 'activity', id, label: labelLegacyActivity(legacy) });
      continue;
    }
    const m9 = await lookup.getM9Activity(id);
    if (m9) {
      resolved.push({ kind: 'activity', id, label: labelM9Activity(m9) });
      continue;
    }
    resolved.push({ kind: 'activity', id, label: UNRESOLVED_ACTIVITY_REFERENCE_LABEL });
  }
  return resolved;
}

function labelSystemReference(id: string, kind: string): string {
  const subject = id.slice(id.indexOf(':') + 1).replace(/[-_.]+/g, ' ');
  return boundLabel([kind, subject || id]);
}
