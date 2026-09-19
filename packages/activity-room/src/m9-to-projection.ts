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

import type { ActivityRecord, AgentMessageActivity } from './contracts';
import type { ActivityRecord as M9ActivityRecord } from './m9-types';
import { extractOriginProvenance } from './origin-provenance';

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
  'tool.called': 'tool-call',
  'tool.succeeded': 'tool-result',
  'tool.failed': 'tool-result',
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
  const kind = KIND_MAP[record.type] ?? 'workflow';
  const actor = {
    type: record.actor.type,
    id: record.actor.id,
    displayName: record.actor.displayName,
    ...(record.actorId ? { role: record.actorId } : {}),
  };
  const agentId = record.actor.type === 'agent' ? record.actor.id : '';
  const data = record.payload?.data as Record<string, unknown> | undefined;
  const callID = (data?.callID as string) ?? '';
  const toolName = (data?.toolName as string) ?? '';
  // AR-UI-REPLY-002: preserve ONLY authoritative origin provenance from the
  // durable payload. Everything else about this conversion stays lossy.
  const origin = extractOriginProvenance(record.payload);

  // Tool activities have a distinct shape from agent-message
  if (kind === 'tool-call') {
    return {
      id: String(record.activityId),
      sequence: record.sequenceNumber,
      timestamp: record.timestamp,
      actor,
      kind: 'tool-call',
      agentId,
      toolName,
      callID,
      evidenceRefs: [],
      ...origin,
    };
  }
  if (kind === 'tool-result') {
    return {
      id: String(record.activityId),
      sequence: record.sequenceNumber,
      timestamp: record.timestamp,
      actor,
      kind: 'tool-result',
      agentId,
      toolName,
      callID,
      status: record.type === 'tool.failed' ? 'failed' : 'completed',
      evidenceRefs: [],
      ...origin,
    };
  }

  // REASONING-BOUNDARY-001: preserve ONLY validated diagnostic details
  // from the durable payload for the details surface. Content keeps exactly
  // one authorship; details never duplicate it.
  const details = extractMessageDetails(record.payload?.data);

  return {
    id: String(record.activityId),
    sequence: record.sequenceNumber,
    timestamp: record.timestamp,
    actor,
    kind,
    agentId,
    messageKind: 'message',
    content: record.payload?.message ?? '',
    workflowId: record.workflowRunId,
    sessionId: undefined,
    evidenceRefs: [],
    ...(record.payload?.error ? { effect: 'intervention' as const } : {}),
    ...(record.payload?.output ? { output: record.payload.output } : {}),
    ...(details ? { details } : {}),
    ...origin,
  } as ActivityRecord;
}

/**
 * REASONING-BOUNDARY-001: validated details extraction. Known keys only,
 * bounded strings, finite numbers — everything else (including absent data)
 * stays absent. Never parses message content. Shared by the M11B live path
 * and the M10 snapshot path so both projections agree.
 */
export function extractMessageDetails(data: unknown): AgentMessageActivity['details'] | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;
  const details: Record<string, unknown> = {};
  const reasoning = readBoundedString(record.reasoning, MAX_REASONING_WIRE_CHARS);
  if (reasoning) details.reasoning = reasoning;
  const providerId = readBoundedString(record.providerId, 128);
  if (providerId) details.providerId = providerId;
  const modelId = readBoundedString(record.modelId, 256);
  if (modelId) details.modelId = modelId;
  const latencyMs = readFiniteNumber(record.latencyMs);
  if (latencyMs !== undefined) details.latencyMs = latencyMs;
  const tokens = readFiniteNumber(record.tokens);
  if (tokens !== undefined) details.tokens = tokens;
  const conversationId = readBoundedString(record.conversationId, 256);
  if (conversationId) details.conversationId = conversationId;
  return Object.keys(details).length > 0 ? (details as AgentMessageActivity['details']) : undefined;
}

/** Wire bound for reasoning in flight (matches persistence bound). */
const MAX_REASONING_WIRE_CHARS = 8000;

function readBoundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return undefined;
  return trimmed;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
