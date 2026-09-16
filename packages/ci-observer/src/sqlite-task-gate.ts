/**
 * CI-OBS-002B — Durable CI task gate (sql.js substrate).
 *
 * Persists the frozen `running --(reason 'ci')--> waiting` / `waiting --> running`
 * lifecycle on the host's existing sql.js database. It reuses the proven
 * transition semantics verbatim; it does not introduce a new task state machine.
 *
 * Idempotency / exactly-once resume:
 *   - `ci_task_waits.correlation_id` is the primary key (one wait per push).
 *   - `resumed_at` is the single-resume marker; resume is a conditional UPDATE
 *     (`WHERE resumed_at IS NULL`), so a webhook retry or a post-restart replay
 *     returns the existing resume record instead of creating a second one.
 */

import type { WorkflowTaskStatus } from '@vestara/types';
import type { Database } from 'sql.js';
import type {
  CITaskGate,
  CITaskResumeRecord,
  CITaskWaitRecord,
  ResumeCITaskInput,
  SuspendCITaskInput,
} from './task-gate';

interface WaitRow {
  readonly correlation_id: string;
  readonly task_id: string;
  readonly reason: string;
  readonly from_status: string;
  readonly status: string;
  readonly suspended_at: string;
  readonly decision_ref: string | null;
  readonly resumed_at: string | null;
}

function toWait(row: WaitRow): CITaskWaitRecord {
  if (row.from_status !== 'running' || row.status !== 'waiting' || row.reason !== 'ci') {
    throw new Error(`corrupt ci_task_waits row for ${row.correlation_id}`);
  }
  return {
    taskId: row.task_id,
    correlationId: row.correlation_id,
    reason: 'ci',
    from: 'running',
    status: 'waiting',
    suspendedAt: row.suspended_at,
  };
}

function toResume(row: WaitRow): CITaskResumeRecord {
  if (row.decision_ref === null || row.resumed_at === null) {
    throw new Error(`ci_task_waits row for ${row.correlation_id} is not resumed`);
  }
  return {
    taskId: row.task_id,
    correlationId: row.correlation_id,
    from: 'waiting',
    status: 'running',
    decisionRef: row.decision_ref,
    resumedAt: row.resumed_at,
  };
}

export class SqliteCITaskGate implements CITaskGate {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  private read(correlationId: string): WaitRow | undefined {
    const statement = this.db.prepare('SELECT * FROM ci_task_waits WHERE correlation_id = ?');
    try {
      statement.bind([correlationId] as never);
      return statement.step() ? (statement.getAsObject() as unknown as WaitRow) : undefined;
    } finally {
      statement.free();
    }
  }

  async suspend(input: SuspendCITaskInput): Promise<CITaskWaitRecord> {
    if (input.currentStatus !== 'running') {
      throw new Error(`cannot suspend task ${input.taskId}: status=${input.currentStatus}, expected running`);
    }
    const suspendedAt = input.suspendedAt ?? new Date().toISOString();
    this.db.run(
      `INSERT OR IGNORE INTO ci_task_waits (
        correlation_id, task_id, reason, from_status, status, suspended_at, decision_ref, resumed_at
      ) VALUES (?, ?, 'ci', 'running', 'waiting', ?, NULL, NULL)`,
      [input.correlationId, input.taskId, suspendedAt],
    );
    const row = this.read(input.correlationId);
    if (!row || row.resumed_at !== null || row.suspended_at !== suspendedAt) {
      throw new Error(`correlation ${input.correlationId} already has a wait`);
    }
    return toWait(row);
  }

  async resume(input: ResumeCITaskInput): Promise<CITaskResumeRecord> {
    if (!input.decisionRef.trim()) {
      throw new Error('resume requires a correlated decision reference');
    }
    const existing = this.read(input.correlationId);
    if (!existing) {
      throw new Error(`no wait registered for correlation ${input.correlationId}`);
    }
    // Exactly-once: the conditional UPDATE only succeeds for the first caller;
    // retries/replays return the already-recorded resume.
    this.db.run(
      `UPDATE ci_task_waits
         SET status = 'running', decision_ref = ?, resumed_at = ?
       WHERE correlation_id = ? AND resumed_at IS NULL`,
      [input.decisionRef, input.resumedAt ?? new Date().toISOString(), input.correlationId],
    );
    const row = this.read(input.correlationId);
    if (!row || row.resumed_at === null) {
      throw new Error(`failed to persist resume for correlation ${input.correlationId}`);
    }
    return toResume(row);
  }

  async getWait(correlationId: string): Promise<CITaskWaitRecord | undefined> {
    const row = this.read(correlationId);
    if (!row || row.resumed_at !== null) return undefined;
    return toWait(row);
  }

  async getStatus(taskId: string): Promise<WorkflowTaskStatus | undefined> {
    const statement = this.db.prepare(
      'SELECT status FROM ci_task_waits WHERE task_id = ? ORDER BY suspended_at DESC LIMIT 1',
    );
    try {
      statement.bind([taskId] as never);
      if (!statement.step()) return undefined;
      const row = statement.getAsObject() as { status?: string };
      return row.status as WorkflowTaskStatus | undefined;
    } finally {
      statement.free();
    }
  }
}
