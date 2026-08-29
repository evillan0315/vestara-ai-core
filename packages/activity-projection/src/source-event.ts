import type { ActivityActor } from './contracts';

/**
 * The normalized subsystem event consumed by the projection layer.
 *
 * Projectors never reach into subsystem internals; adapters in this module
 * normalize the authoritative subsystem events into this contract.
 */
export type ActivitySourceAuthority = 'user' | 'agent' | 'system' | 'policy' | 'verification';

export interface ActivitySourceEvent {
  readonly id: string;
  readonly type: string;
  readonly at: string;
  readonly actorId: string;
  readonly authority: ActivitySourceAuthority;
  readonly workflowId?: string;
  readonly sessionId?: string;
  readonly taskId?: string;
  readonly threadId?: string;
  readonly turnId?: string;
  readonly verificationRunId?: string;
  readonly correlationId?: string;
  readonly sourceSequence?: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Structural subset of `@vestara/engineering-event-store` truth events. */
export interface EngineeringTruthEventLike {
  readonly id: string;
  readonly seq: number;
  readonly type: string;
  readonly at: string;
  readonly actorId: string;
  readonly authority: 'user' | 'system' | 'agent' | 'policy' | 'verification';
  readonly taskId?: string;
  readonly threadId?: string;
  readonly turnId?: string;
  readonly verificationRunId?: string;
  readonly correlationId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export function fromEngineeringTruthEvent(event: EngineeringTruthEventLike): ActivitySourceEvent {
  return {
    id: event.id,
    type: event.type,
    at: event.at,
    actorId: event.actorId,
    authority: event.authority,
    taskId: event.taskId,
    threadId: event.threadId,
    turnId: event.turnId,
    verificationRunId: event.verificationRunId,
    correlationId: event.correlationId,
    sourceSequence: event.seq,
    payload: event.payload,
  };
}

/** Structural subset of `@vestara/workflow-orchestrator` orchestration events. */
export interface OrchestrationEventLike {
  readonly type: string;
  readonly at?: string;
  readonly projectId?: string;
  readonly planId?: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly [key: string]: unknown;
}

const ENVELOPE_KEYS = new Set(['type', 'at', 'projectId', 'taskId', 'agentId']);

export function fromOrchestrationEvent(event: OrchestrationEventLike): ActivitySourceEvent {
  const at = event.at ?? new Date().toISOString();
  const type = event.type;
  const projectId = typeof event.projectId === 'string' ? event.projectId : undefined;
  const taskId = typeof event.taskId === 'string' ? event.taskId : undefined;
  const observed = type.startsWith('workflow.transition.') || type.startsWith('workflow.observation.');
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (!ENVELOPE_KEYS.has(key)) payload[key] = value;
  }
  return {
    id: `orchestration:${projectId ?? 'unknown'}:${type}:${at}`,
    type,
    at,
    actorId: observed
      ? 'workflow-observer'
      : typeof event.agentId === 'string'
        ? event.agentId
        : 'workflow-orchestrator',
    authority: 'system',
    workflowId: projectId,
    taskId,
    // ARX-015 M2: projectId is not an execution identity. Orchestration events
    // without an explicit execution context remain uncorrelated (fail-closed).
    correlationId: undefined,
    payload,
  };
}

/** Map a source authority to the activity actor model. */
export function resolveActivityActor(event: ActivitySourceEvent): ActivityActor {
  const type = event.authority === 'user' ? 'human' : event.authority === 'agent' ? 'agent' : 'system';
  return {
    type,
    id: event.actorId,
    displayName: event.actorId,
    role: event.authority,
  };
}

/** Extract a readonly string array from `evidenceRefs` or `evidence` artifact fields. */
export function extractEvidenceRefs(payload: Readonly<Record<string, unknown>>): readonly string[] {
  const direct = payload.evidenceRefs;
  if (Array.isArray(direct)) {
    const refs = direct.filter((ref): ref is string => typeof ref === 'string');
    if (refs.length > 0) return refs;
  }
  const artifacts = payload.evidence;
  if (Array.isArray(artifacts)) {
    return artifacts
      .map((artifact) => {
        if (typeof artifact === 'string') return artifact;
        if (artifact && typeof artifact === 'object') {
          const record = artifact as Readonly<Record<string, unknown>>;
          const id = record.id;
          const uri = record.uri;
          return typeof id === 'string' ? id : typeof uri === 'string' ? uri : '';
        }
        return '';
      })
      .filter((ref) => ref.length > 0);
  }
  return [];
}

/** Read an optional string field from a payload. */
export function stringField(payload: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Read a string field from a payload with a fallback. */
export function stringFieldOr(payload: Readonly<Record<string, unknown>>, key: string, fallback: string): string {
  return stringField(payload, key) ?? fallback;
}

/** Read an optional number field from a payload. */
export function numberField(payload: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
