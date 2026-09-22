import type { WorkflowRunId, WorkflowTaskId } from '@vestara/types';
import type { ActivityOrganizationalEffect, ActivityRecord } from './contracts';
import type { AttentionCategory, AttentionEntry, AttentionReason, AttentionSeverity } from './projection-types';

const OPEN_EFFECTS = new Set<AttentionReason>(['hold', 'finding', 'recommendation']);
const RESOLVING_EFFECTS = new Set<ActivityOrganizationalEffect>([
  'closure',
  'decision',
  'authorization',
  'intervention',
]);

const TASK_OPEN_STATUSES = new Set(['blocked', 'failed', 'awaiting-approval']);

const TASK_RESOLVED_STATUSES = new Set([
  'ready',
  'assigned',
  'in-progress',
  'reviewing',
  'changes-requested',
  'testing',
  'approved',
  'retrying',
  'cancelled',
  'completed',
]);

/**
 * Derive current Needs Attention entries from structured ActivityRecords.
 * This is a read-model projection only; owning subsystems keep authority.
 */
export function projectAttentionEntries(records: readonly ActivityRecord[]): readonly AttentionEntry[] {
  const sorted = [...records].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
  const active = new Map<string, AttentionEntry>();

  for (const record of sorted) {
    resolveByRecord(active, record);
    const entry = attentionForRecord(record);
    if (entry) active.set(attentionKey(entry, record), entry);
  }

  return [...active.values()].sort(compareAttention);
}

function resolveByRecord(active: Map<string, AttentionEntry>, record: ActivityRecord): void {
  switch (record.kind) {
    case 'task':
      if (TASK_RESOLVED_STATUSES.has(record.status)) {
        for (const [key, entry] of active) {
          if (entry.taskId === record.taskId && key.startsWith('task:')) active.delete(key);
        }
      }
      break;
    case 'workflow':
      if (record.authoritative && record.currentState !== 'failed') {
        active.delete(`workflow:${record.workflowId}`);
      }
      break;
    case 'verification':
      if (record.outcome === 'passed') {
        active.delete(`verification:${verificationKey(record)}`);
      }
      break;
    case 'test':
      if (record.failed === 0 && record.passed > 0) {
        active.delete(`test:${testKey(record)}`);
      }
      break;
    case 'tool-result':
      if (record.status === 'completed') {
        active.delete(`tool:${record.callID}`);
      }
      break;
    case 'agent-message':
      if (record.messageKind === 'approval-decision') {
        active.delete(`approval:${approvalKey(record)}`);
      }
      break;
  }

  for (const [key, entry] of active) {
    if (entry.details?.effect === undefined) continue;
    if (resolvesEffect(record, String(entry.sourceRecordId), entry.workflowRunId, entry.sessionId)) active.delete(key);
  }
}

function attentionForRecord(record: ActivityRecord): AttentionEntry | undefined {
  switch (record.kind) {
    case 'task':
      if (!TASK_OPEN_STATUSES.has(record.status)) return effectAttention(record);
      return makeEntry(record, {
        category: record.status === 'awaiting-approval' ? 'approval' : 'blocker',
        reason:
          record.status === 'blocked'
            ? 'task-blocked'
            : record.status === 'awaiting-approval'
              ? 'task-awaiting-approval'
              : 'task-failed',
        message: record.summary ?? `Task ${record.status}`,
        owner: 'workflow-orchestrator',
        details: {
          status: record.status,
          previousStatus: record.previousStatus,
          ...(record.planId ? { planId: record.planId } : {}),
          ...(record.summary ? { summary: record.summary } : {}),
        },
      });
    case 'workflow':
      if (!record.authoritative || record.currentState !== 'failed') return effectAttention(record);
      return makeEntry(record, {
        category: 'workflow',
        reason: 'workflow-failed',
        message: record.reason || 'Workflow failed',
        owner: record.observed ? 'workflow-observer' : 'workflow-orchestrator',
        details: {
          currentState: record.currentState,
          previousState: record.previousState,
          reason: record.reason,
          authoritative: record.authoritative,
          observed: record.observed,
        },
      });
    case 'verification':
      if (record.outcome !== 'failed' && record.outcome !== 'blocked') return effectAttention(record);
      return makeEntry(record, {
        category: 'verification-failure',
        reason: record.outcome === 'blocked' ? 'verification-blocked' : 'verification-failed',
        message: record.reason ?? `Verification ${record.outcome}`,
        owner: 'verification',
        details: {
          outcome: record.outcome,
          failedChecks: record.checks.filter((check) => check.status === 'failed').length,
          blockedChecks: record.checks.filter((check) => check.status === 'blocked').length,
          ...(record.verificationRunId ? { verificationRunId: record.verificationRunId } : {}),
          ...(record.confidence !== undefined ? { confidence: record.confidence } : {}),
        },
      });
    case 'test':
      if (record.failed <= 0) return effectAttention(record);
      return makeEntry(record, {
        category: 'test-failure',
        reason: 'test-failed',
        message: `${record.failed} test${record.failed === 1 ? '' : 's'} failed`,
        owner: 'test',
        details: {
          command: record.command,
          passed: record.passed,
          failed: record.failed,
          skipped: record.skipped,
          failureFingerprints: record.failureFingerprints,
        },
      });
    case 'tool-result':
      if (record.status !== 'failed') return effectAttention(record);
      return makeEntry(record, {
        category: 'execution-failure',
        reason: 'tool-failed',
        message: `${record.toolName} failed`,
        owner: 'runtime-session',
        details: {
          toolName: record.toolName,
          callID: record.callID,
          status: record.status,
          ...(record.output ? { output: record.output } : {}),
        },
      });
    case 'agent-message':
      if (record.messageKind !== 'approval-request') return effectAttention(record);
      return makeEntry(record, {
        category: 'approval',
        reason: 'approval-required',
        message: record.content || 'Approval required',
        owner: 'agent-harness',
        severity: severityFromRisk(record.risk),
        details: {
          messageKind: record.messageKind,
          ...(record.toolName ? { toolName: record.toolName } : {}),
          ...(record.risk ? { risk: record.risk } : {}),
          ...(record.status ? { status: record.status } : {}),
        },
      });
    default:
      return effectAttention(record);
  }
}

function effectAttention(record: ActivityRecord): AttentionEntry | undefined {
  if (record.effect === undefined || !OPEN_EFFECTS.has(record.effect as AttentionReason)) return undefined;
  const reason = record.effect as Extract<AttentionReason, 'hold' | 'finding' | 'recommendation'>;
  return makeEntry(record, {
    category: effectCategory(record.effect),
    reason,
    message: contentForEffect(record),
    owner: 'activity-room',
    details: { effect: record.effect },
  });
}

function makeEntry(
  record: ActivityRecord,
  input: {
    readonly category: AttentionCategory;
    readonly reason: AttentionReason;
    readonly message: string;
    readonly owner?: string;
    readonly severity?: AttentionSeverity;
    readonly details?: Readonly<Record<string, unknown>>;
  },
): AttentionEntry {
  return {
    attentionId: `attention:${record.id}`,
    reason: input.reason,
    category: input.category,
    ...(input.severity ? { severity: input.severity } : {}),
    message: input.message,
    sourceRecordId: record.id,
    ...(input.owner ? { owner: input.owner } : {}),
    status: 'open',
    evidenceRefs: record.evidenceRefs,
    ...(input.details ? { details: input.details } : {}),
    actor: record.actor,
    workflowRunId: record.workflowId as WorkflowRunId | undefined,
    taskId: record.taskId as WorkflowTaskId | undefined,
    sessionId: record.sessionId,
    timestamp: record.timestamp,
    acknowledged: false,
  };
}

function attentionKey(entry: AttentionEntry, record: ActivityRecord): string {
  switch (entry.reason) {
    case 'task-blocked':
    case 'task-failed':
    case 'task-awaiting-approval':
      return `task:${entry.taskId ?? record.id}`;
    case 'workflow-failed':
      return `workflow:${entry.workflowRunId ?? record.id}`;
    case 'verification-failed':
    case 'verification-blocked':
      return `verification:${record.kind === 'verification' ? verificationKey(record) : record.id}`;
    case 'test-failed':
      return `test:${record.kind === 'test' ? testKey(record) : record.id}`;
    case 'tool-failed':
      return `tool:${record.kind === 'tool-result' ? record.callID : record.id}`;
    case 'approval-required':
      return `approval:${record.kind === 'agent-message' ? approvalKey(record) : record.id}`;
    default:
      return `effect:${record.id}`;
  }
}

function verificationKey(record: Extract<ActivityRecord, { kind: 'verification' }>): string {
  return record.verificationRunId ?? record.taskId ?? record.id;
}

function testKey(record: Extract<ActivityRecord, { kind: 'test' }>): string {
  return `${record.taskId ?? 'global'}:${record.command}`;
}

function approvalKey(record: Extract<ActivityRecord, { kind: 'agent-message' }>): string {
  return (
    record.correlationId ?? `${record.threadId ?? 'thread'}:${record.turnId ?? 'turn'}:${record.toolName ?? 'approval'}`
  );
}

function resolvesEffect(
  record: ActivityRecord,
  sourceRecordId: string,
  workflowId?: string,
  sessionId?: string,
): boolean {
  if (record.correctionOf === sourceRecordId) return true;
  if (record.relatesTo?.includes(sourceRecordId)) return true;
  if ((record.relatesTo?.length ?? 0) > 0) return false;
  if (!RESOLVING_EFFECTS.has(record.effect ?? 'message')) return false;
  if (workflowId !== undefined && record.workflowId === workflowId) return true;
  if (sessionId !== undefined && record.sessionId === sessionId) return true;
  return false;
}

function contentForEffect(record: ActivityRecord): string {
  if (record.kind === 'agent-message') return record.content;
  if (record.kind === 'workflow') return record.reason;
  if (record.kind === 'task') return record.summary ?? `Task ${record.status}`;
  if (record.kind === 'verification') return record.reason ?? `Verification ${record.outcome}`;
  if (record.kind === 'test') return `${record.failed} failed`;
  return record.id;
}

function effectCategory(effect: ActivityOrganizationalEffect): AttentionCategory {
  if (effect === 'hold') return 'blocker';
  if (effect === 'finding') return 'issue';
  return 'agent-attention';
}

function severityFromRisk(risk: 'low' | 'medium' | 'high' | 'critical' | undefined): AttentionSeverity | undefined {
  if (risk === 'critical' || risk === 'high' || risk === 'medium' || risk === 'low') return risk;
  return undefined;
}

function compareAttention(left: AttentionEntry, right: AttentionEntry): number {
  const severity = severityRank(right.severity) - severityRank(left.severity);
  if (severity !== 0) return severity;
  const time = left.timestamp.localeCompare(right.timestamp);
  if (time !== 0) return time;
  return left.attentionId.localeCompare(right.attentionId);
}

function severityRank(severity: AttentionSeverity | undefined): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}
