/**
 * Deterministic workflow stage derivation.
 *
 * Stages are inferred from thread items and engineering events by their
 * structure (tool names, item kinds, event types) — never from parsing model
 * text. Explicit stage events can override inference later; this projector
 * makes current runs appear correctly without another harness rewrite.
 */

import type { EngineeringTruthEvent } from '@vestara/engineering-event-store';
import type { ThreadItem } from '@vestara/types';
import { WORKFLOW_STAGES, type WorkflowStageId, type WorkflowStageProjection, type WorkflowStageStatus } from './types';

const _INVESTIGATION_TOOLS = /read|search|grep|view|list|reference|filesystem\.read|filesystem\.search/;
const EXECUTION_TOOLS =
  /write|create|update|delete|rename|move|copy|patch|shell|bash|exec|run|git|test|build|lint|format|filesystem\.write|filesystem\.update|filesystem\.create/;
const PLANNING_TOOLS = /plan/;

const STAGE_LABEL: Record<WorkflowStageId, string> = {
  intent: 'Intent',
  context: 'Context',
  investigation: 'Investigation',
  planning: 'Planning',
  execution: 'Execution',
  verification: 'Verification',
  review: 'Review',
  complete: 'Complete',
};

/** Default owning agent per lifecycle stage, overridden by the first actor. */
const STAGE_DEFAULT_AGENT: Record<WorkflowStageId, string> = {
  intent: 'conversation',
  context: 'analyst',
  investigation: 'analyst',
  planning: 'planner',
  execution: 'developer',
  verification: 'verifier',
  review: 'reviewer',
  complete: 'system',
};

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function stageForItem(item: ThreadItem): WorkflowStageId | undefined {
  const payload = record(item.payload);
  switch (item.kind) {
    case 'harness-run':
    case 'user-message':
    case 'steering-message':
      return 'intent';
    case 'model-response':
    case 'agent-message':
      return 'context';
    case 'tool-call':
    case 'tool-result': {
      const tool = String(payload.toolName ?? '');
      if (PLANNING_TOOLS.test(tool)) return 'planning';
      if (EXECUTION_TOOLS.test(tool)) return 'execution';
      return 'investigation';
    }
    case 'approval-request':
    case 'approval-decision':
      return 'review';
    case 'verification-result':
    case 'revision-request':
      return 'verification';
    case 'final-outcome':
      return 'complete';
    default:
      return undefined;
  }
}

export function stageForEvent(event: EngineeringTruthEvent): WorkflowStageId | undefined {
  const type = event.type;
  const payload = record(event.payload);
  if (type.includes('verification') || type === 'harness.revision.requested') return 'verification';
  if (type.includes('approval')) return 'review';
  if (type.startsWith('change.') || type.includes('diff')) return 'review';
  if (type === 'harness.turn.started' || type === 'harness.thread.created') return 'intent';
  if (type === 'harness.model.started' || type === 'harness.model.completed') return 'context';
  if (
    type === 'harness.tool.proposed' ||
    type === 'harness.tool.started' ||
    type === 'harness.tool.completed' ||
    type === 'harness.tool.failed'
  ) {
    const tool = String(payload.toolName ?? '');
    if (PLANNING_TOOLS.test(tool)) return 'planning';
    if (EXECUTION_TOOLS.test(tool)) return 'execution';
    return 'investigation';
  }
  if (type.startsWith('harness.outcome.')) return 'complete';
  return undefined;
}

interface StageSignal {
  readonly id: WorkflowStageId;
  readonly at: string;
  readonly kind: 'item' | 'event';
  readonly actorId: string;
  readonly revision: boolean;
  readonly payload: Readonly<Record<string, unknown>>;
}

function toolOf(payload: Readonly<Record<string, unknown>>): string | undefined {
  const tool = payload.toolName;
  return typeof tool === 'string' ? tool : undefined;
}

function fileOf(payload: Readonly<Record<string, unknown>>): string | undefined {
  const input = payload.input as { path?: unknown } | undefined;
  if (input && typeof input.path === 'string') return input.path;
  const pathValue = payload.path;
  return typeof pathValue === 'string' ? pathValue : undefined;
}

function evidenceCountOf(payload: Readonly<Record<string, unknown>>): number {
  return Array.isArray(payload.evidence) ? payload.evidence.length : 0;
}

/** Explicit stage announcements (`harness.stage.*`) override inference. */
function explicitStageEvents(
  events: readonly EngineeringTruthEvent[],
): Map<WorkflowStageId, { startedAt?: string; completedAt?: string }> {
  const map = new Map<WorkflowStageId, { startedAt?: string; completedAt?: string }>();
  for (const event of events) {
    if (!event.type.startsWith('harness.stage.')) continue;
    const stageId = event.payload.stageId;
    if (typeof stageId !== 'string' || !(WORKFLOW_STAGES as readonly string[]).includes(stageId)) continue;
    const id = stageId as WorkflowStageId;
    const entry = map.get(id) ?? {};
    if (event.type.endsWith('.started')) entry.startedAt = event.at;
    if (event.type.endsWith('.completed')) entry.completedAt = event.at;
    map.set(id, entry);
  }
  return map;
}

/**
 * Derive the eight workflow stages from thread items + engineering events.
 * Hybrid model: explicit `harness.stage.*` announcements override the
 * deterministic inference; stages without explicit announcements are inferred
 * from the structural signals. The last activated stage is `active` until a
 * terminal outcome supersedes it.
 */
export function deriveStages(
  items: readonly ThreadItem[],
  events: readonly EngineeringTruthEvent[],
): WorkflowStageProjection[] {
  const signals: StageSignal[] = [];
  for (const item of items) {
    const id = stageForItem(item);
    if (id)
      signals.push({
        id,
        at: item.createdAt,
        kind: 'item',
        actorId: item.actorId,
        revision: item.kind === 'revision-request',
        payload: record(item.payload),
      });
  }
  for (const event of events) {
    const id = stageForEvent(event);
    if (id)
      signals.push({
        id,
        at: event.at,
        kind: 'event',
        actorId: event.actorId,
        revision: event.type === 'harness.revision.requested',
        payload: record(event.payload),
      });
  }
  signals.sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : 0));

  const firstAt = new Map<WorkflowStageId, string>();
  const firstActor = new Map<WorkflowStageId, string>();
  const tools = new Map<WorkflowStageId, Set<string>>();
  const files = new Map<WorkflowStageId, Set<string>>();
  const evidence = new Map<WorkflowStageId, number>();
  const failed = new Map<WorkflowStageId, string>();
  const retries = new Map<WorkflowStageId, number>();
  const lastSignalAt = new Map<WorkflowStageId, string>();
  let terminalAt: string | undefined;
  let failedStage: WorkflowStageId | undefined;

  for (const signal of signals) {
    const prior = firstAt.get(signal.id);
    if (!prior) firstAt.set(signal.id, signal.at);
    const signalAgent =
      typeof signal.payload.agentId === 'string' && signal.payload.agentId ? String(signal.payload.agentId) : undefined;
    if (!firstActor.has(signal.id) && signalAgent) firstActor.set(signal.id, signalAgent);
    lastSignalAt.set(signal.id, signal.at);
    const tool = toolOf(signal.payload);
    if (tool) {
      const set = tools.get(signal.id) ?? new Set<string>();
      set.add(tool);
      tools.set(signal.id, set);
    }
    const file = fileOf(signal.payload);
    if (file) {
      const set = files.get(signal.id) ?? new Set<string>();
      set.add(file);
      files.set(signal.id, set);
    }
    evidence.set(signal.id, (evidence.get(signal.id) ?? 0) + evidenceCountOf(signal.payload));
    if (signal.revision) retries.set(signal.id, (retries.get(signal.id) ?? 0) + 1);
    if (signal.payload.status === 'failed' && !failedStage) {
      failedStage = signal.id;
      failed.set(signal.id, String(signal.payload.error ?? 'Tool failed'));
    }
    if (signal.id === 'complete' && signal.kind === 'item') terminalAt = signal.at;
  }

  // Hybrid: explicit announcements win for boundaries; inference fills gaps.
  const explicit = explicitStageEvents(events);
  const activationStart = (id: WorkflowStageId): string | undefined =>
    explicit.get(id)?.startedAt ?? firstAt.get(id) ?? explicit.get(id)?.completedAt;
  const explicitComplete = (id: WorkflowStageId): string | undefined => explicit.get(id)?.completedAt;

  const activated = WORKFLOW_STAGES.filter((id) => activationStart(id) !== undefined);
  const lastActivated = activated.at(-1);
  const terminal = terminalAt !== undefined || lastActivated === 'complete';

  return WORKFLOW_STAGES.map((id) => {
    const startedAt = activationStart(id);
    const activatedIndex = activated.indexOf(id);
    const next = activatedIndex >= 0 ? activated[activatedIndex + 1] : undefined;
    const nextStarted = next !== undefined ? activationStart(next) : undefined;
    const completedAt = explicitComplete(id) ?? nextStarted ?? (id === 'complete' ? terminalAt : undefined);
    const status = stageStatus(id, startedAt, completedAt, lastActivated, terminal, failedStage);
    const durationMs =
      startedAt && (completedAt ?? lastSignalAt.get(id))
        ? Math.max(0, new Date(completedAt ?? lastSignalAt.get(id)!).getTime() - new Date(startedAt).getTime())
        : undefined;
    return {
      id,
      label: STAGE_LABEL[id],
      status,
      startedAt,
      completedAt,
      durationMs,
      agentId: firstActor.get(id) ?? STAGE_DEFAULT_AGENT[id],
      tools: [...(tools.get(id) ?? [])],
      files: [...(files.get(id) ?? [])],
      evidenceCount: evidence.get(id) ?? 0,
      verification:
        id === 'verification' && startedAt
          ? {
              status: failedStage === id ? 'failed' : 'passed',
              retryCount: retries.get(id) ?? 0,
            }
          : undefined,
      blockingReason: failed.get(id),
      childSteps: [],
    };
  });
}

function stageStatus(
  id: WorkflowStageId,
  startedAt: string | undefined,
  completedAt: string | undefined,
  lastActivated: WorkflowStageId | undefined,
  terminal: boolean,
  failedStage: WorkflowStageId | undefined,
): WorkflowStageStatus {
  if (!startedAt) return 'pending';
  if (failedStage === id) return 'failed';
  // The `complete` stage is a lifecycle marker, not an execution stage.
  // It should reflect the aggregate outcome: failed if any stage failed,
  // completed only when the workflow truly succeeded.
  if (id === 'complete' && failedStage !== undefined) return 'failed';
  if (completedAt !== undefined) return 'completed';
  if (id === lastActivated) return terminal ? 'completed' : 'active';
  return 'active';
}
