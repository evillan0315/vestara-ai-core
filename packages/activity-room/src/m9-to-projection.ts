/**
 * M9 → Projection Record Conversion
 *
 * Converts M9 ActivityRecords to the discriminated-union ActivityRecord
 * format used by the ActivityStreamHub and M11A/M11B projection layers.
 *
 * Extracted from apps/api/src/routes/activity-room-m11a.ts and
 * apps/api/src/routes/activity-room-m11b.ts to eliminate duplication.
 *
 * Architecture Traceability:
 *   ARX-015: M11A/M11B projection composition
 */

import type { ActivityRecord } from './contracts';
import type { ActivityRecord as M9ActivityRecord } from './m9-types';

/**
 * Map M9 activity types to projection ActivityRecord kinds.
 */
const KIND_MAP: Record<string, ActivityRecord['kind']> = {
  'workflow.started': 'workflow',
  'workflow.completed': 'workflow',
  'workflow.failed': 'workflow',
  'workflow.cancelled': 'workflow',
  'task.runnable': 'task',
  'task.started': 'task',
  'task.completed': 'task',
  'task.failed': 'task',
  'task.cancelled': 'task',
  'agent.assigned': 'agent-message',
  'agent.started': 'agent-message',
  'agent.progress': 'agent-message',
  'agent.waiting': 'agent-message',
  'agent.completed': 'agent-message',
  'agent.failed': 'agent-message',
  'agent.cancelled': 'agent-message',
  'human.message': 'agent-message',
  'system.event': 'workflow',
  'interaction.presented': 'agent-message',
  'interaction.responded': 'agent-message',
};

/**
 * Convert an M9 ActivityRecord to the projection ActivityRecord format
 * used by the ActivityStreamHub for broadcasting.
 *
 * This is a lossy conversion — M9 records carry richer metadata than the
 * discriminated union projection format. The conversion preserves the
 * essential fields needed for UI rendering.
 */
export function toProjectionRecord(record: M9ActivityRecord): ActivityRecord {
  return {
    id: String(record.activityId),
    sequence: record.sequenceNumber,
    timestamp: record.timestamp,
    actor: {
      type: record.actor.type,
      id: record.actor.id,
      displayName: record.actor.displayName,
      ...(record.actorId ? { role: record.actorId } : {}),
    },
    kind: KIND_MAP[record.type] ?? 'workflow',
    agentId: record.actor.type === 'agent' ? record.actor.id : undefined,
    messageKind: 'message',
    content: record.payload?.message ?? '',
    workflowId: record.workflowRunId,
    sessionId: undefined,
    evidenceRefs: [],
    ...(record.payload?.error ? { effect: 'intervention' as const } : {}),
    ...(record.payload?.output ? { output: record.payload.output } : {}),
  } as ActivityRecord;
}
