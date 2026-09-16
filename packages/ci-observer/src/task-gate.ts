/**
 * CI-OBS-002A — CI task gate.
 *
 * Owns the two lifecycle transitions of this slice, layered on the frozen
 * `WorkflowTaskStatus` vocabulary:
 *
 *   running --(typed reason 'ci')--> waiting
 *   waiting --(correlated completion)--> running
 *
 * `WorkflowRunStatus` is intentionally untouched: task-level `waiting` is
 * authoritative for this slice. The Developer session must not remain
 * computationally active while the task waits.
 *
 * Invariants:
 *   - A wait is a persisted record, not an in-memory re-render.
 *   - Resume requires a correlated completion decision reference.
 *   - Resume is not merge authority.
 */

import type { WorkflowTaskStatus } from '@vestara/types';

/** Typed reason vocabulary for a CI wait. Closed. */
export type CITaskWaitReason = 'ci';

/** A persisted task wait. */
export interface CITaskWaitRecord {
  readonly taskId: string;
  readonly correlationId: string;
  readonly reason: CITaskWaitReason;
  /** Status before suspension (must be 'running'). */
  readonly from: 'running';
  /** Status while suspended. */
  readonly status: 'waiting';
  readonly suspendedAt: string;
}

/** A persisted resume. */
export interface CITaskResumeRecord {
  readonly taskId: string;
  readonly correlationId: string;
  readonly from: 'waiting';
  readonly status: 'running';
  /** Correlated completion decision that woke the task. */
  readonly decisionRef: string;
  readonly resumedAt: string;
}

export interface SuspendCITaskInput {
  readonly taskId: string;
  readonly correlationId: string;
  readonly currentStatus: WorkflowTaskStatus;
  /** Override for tests/replay; defaults to now. */
  readonly suspendedAt?: string;
}

export interface ResumeCITaskInput {
  readonly correlationId: string;
  readonly decisionRef: string;
  /** Override for tests/replay; defaults to now. */
  readonly resumedAt?: string;
}

export interface CITaskGate {
  /** running → waiting (typed reason 'ci'). */
  suspend(input: SuspendCITaskInput): Promise<CITaskWaitRecord>;
  /** waiting → running, citing the correlated completion decision. */
  resume(input: ResumeCITaskInput): Promise<CITaskResumeRecord>;
  getWait(correlationId: string): Promise<CITaskWaitRecord | undefined>;
  getStatus(taskId: string): Promise<WorkflowTaskStatus | undefined>;
}

/** The only task status this gate transitions from. */
const SUSPEND_FROM: 'running' = 'running';
/** The only status this gate suspends into. */
const SUSPEND_TO: 'waiting' = 'waiting';
/** The only status this gate resumes from. */
const RESUME_FROM: 'waiting' = 'waiting';
/** The only status this gate resumes into. */
const RESUME_TO: 'running' = 'running';

/**
 * Process-lifetime task gate.
 *
 * Wiring to the durable orchestrator task store is a governed follow-up; this
 * slice proves the transition contract and the reason/resume identity.
 */
export class InMemoryCITaskGate implements CITaskGate {
  private readonly waits = new Map<string, CITaskWaitRecord>();
  private readonly statuses = new Map<string, WorkflowTaskStatus>();

  async suspend(input: SuspendCITaskInput): Promise<CITaskWaitRecord> {
    if (input.currentStatus !== SUSPEND_FROM) {
      throw new Error(`cannot suspend task ${input.taskId}: status=${input.currentStatus}, expected ${SUSPEND_FROM}`);
    }
    if (this.waits.has(input.correlationId)) {
      throw new Error(`correlation ${input.correlationId} already has a wait`);
    }
    const record: CITaskWaitRecord = {
      taskId: input.taskId,
      correlationId: input.correlationId,
      reason: 'ci',
      from: SUSPEND_FROM,
      status: SUSPEND_TO,
      suspendedAt: input.suspendedAt ?? new Date().toISOString(),
    };
    this.waits.set(input.correlationId, record);
    this.statuses.set(input.taskId, SUSPEND_TO);
    return record;
  }

  async resume(input: ResumeCITaskInput): Promise<CITaskResumeRecord> {
    const wait = this.waits.get(input.correlationId);
    if (!wait) {
      throw new Error(`no wait registered for correlation ${input.correlationId}`);
    }
    if (!input.decisionRef.trim()) {
      throw new Error('resume requires a correlated decision reference');
    }
    const record: CITaskResumeRecord = {
      taskId: wait.taskId,
      correlationId: input.correlationId,
      from: RESUME_FROM,
      status: RESUME_TO,
      decisionRef: input.decisionRef,
      resumedAt: input.resumedAt ?? new Date().toISOString(),
    };
    this.waits.delete(input.correlationId);
    this.statuses.set(wait.taskId, RESUME_TO);
    return record;
  }

  async getWait(correlationId: string): Promise<CITaskWaitRecord | undefined> {
    return this.waits.get(correlationId);
  }

  async getStatus(taskId: string): Promise<WorkflowTaskStatus | undefined> {
    return this.statuses.get(taskId);
  }
}
