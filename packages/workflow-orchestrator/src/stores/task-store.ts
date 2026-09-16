/**
 * TaskStore — sql.js persistence for orchestrated tasks.
 */

import { begin, commit, rollback } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import { dbAll, dbGet, dbRun, jsonParse, now, str } from '../db';
import { generateId } from '../ids';
import type { ExternalVerificationWait, TaskEffort, TaskStatus, WorkflowTask } from '../types';

export interface CreateTaskInput {
  readonly planId: string;
  readonly summary: string;
  readonly description: string;
  readonly files: readonly string[];
  readonly dependencies: readonly string[];
  readonly effort: TaskEffort;
  readonly requiredCapabilities: readonly string[];
}

/** Begin an external-verification wait (in-progress → awaiting-verification). */
export interface BeginExternalVerificationWaitInput {
  readonly taskId: string;
  readonly verifier: 'ci';
  /** Correlation/wait reference (deterministic push↔task identity). */
  readonly waitRef: string;
  readonly repository: string;
  readonly commitSha: string;
  readonly branch: string;
  readonly provider?: string;
  readonly runRef?: string;
  readonly originatingWorkflowRunId?: string;
  readonly originatingOperationId?: string;
  readonly suspendedAt?: string;
}

/** Resume an external-verification wait (awaiting-verification → in-progress). */
export interface ResumeExternalVerificationWaitInput {
  readonly waitRef: string;
  readonly decisionRef: string;
  readonly resumedAt?: string;
}

export class TaskStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    // Schema is owned by the migration chain (orchestration-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
  }

  async createMany(planId: string, inputs: readonly CreateTaskInput[]): Promise<WorkflowTask[]> {
    const nowIso = now();
    const tasks: WorkflowTask[] = [];
    const seqByIndex = new Map<number, string>();
    for (let index = 0; index < inputs.length; index++) seqByIndex.set(index, generateId('task'));

    for (let index = 0; index < inputs.length; index++) {
      const input = inputs[index];
      const id = seqByIndex.get(index) ?? generateId('task');
      const dependencies = input.dependencies.map((dependency) => {
        const numeric = /^\d+$/.test(dependency);
        if (!numeric) return dependency;
        return seqByIndex.get(Number(dependency)) ?? dependency;
      });
      const task: WorkflowTask = {
        id,
        planId,
        summary: input.summary,
        description: input.description,
        files: input.files,
        dependencies,
        status: 'pending',
        effort: input.effort,
        requiredCapabilities: input.requiredCapabilities,
        revisionCount: 0,
        attemptCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.persist(task);
      tasks.push(task);
    }
    return tasks;
  }

  async get(id: string): Promise<WorkflowTask | null> {
    const row = dbGet(this.db, 'SELECT * FROM orchestrated_tasks WHERE id = ?', [id]);
    return row ? this.rowToTask(row) : null;
  }

  async listForProject(projectId: string): Promise<WorkflowTask[]> {
    const rows = dbAll(
      this.db,
      `SELECT t.* FROM orchestrated_tasks t
       JOIN orchestrated_plans p ON p.id = t.plan_id
       WHERE p.project_id = ? ORDER BY t.created_at ASC`,
      [projectId],
    );
    return rows.map((row) => this.rowToTask(row));
  }

  async listForPlan(planId: string): Promise<WorkflowTask[]> {
    const rows = dbAll(this.db, 'SELECT * FROM orchestrated_tasks WHERE plan_id = ? ORDER BY created_at ASC', [planId]);
    return rows.map((row) => this.rowToTask(row));
  }

  async updateStatus(id: string, status: TaskStatus, lastError?: string): Promise<WorkflowTask | null> {
    dbRun(this.db, 'UPDATE orchestrated_tasks SET status = ?, last_error = ?, updated_at = ? WHERE id = ?', [
      status,
      lastError ?? null,
      now(),
      id,
    ]);
    return this.get(id);
  }

  async markStarted(id: string): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_tasks SET status = ?, started_at = ?, updated_at = ? WHERE id = ?', [
      'in-progress',
      now(),
      now(),
      id,
    ]);
  }

  async complete(id: string, agentId?: string): Promise<void> {
    dbRun(
      this.db,
      'UPDATE orchestrated_tasks SET status = ?, assigned_agent_id = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      ['completed', agentId ?? null, now(), now(), id],
    );
  }

  async recordFailure(id: string, error: string, attempt: number): Promise<void> {
    dbRun(
      this.db,
      'UPDATE orchestrated_tasks SET status = ?, attempt_count = ?, last_error = ?, updated_at = ? WHERE id = ?',
      ['failed', attempt, error, now(), id],
    );
  }

  async bumpRevision(id: string): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_tasks SET revision_count = revision_count + 1, updated_at = ? WHERE id = ?', [
      now(),
      id,
    ]);
  }

  async requestApproval(id: string, reason: string): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_tasks SET status = ?, approval_reason = ?, updated_at = ? WHERE id = ?', [
      'awaiting-approval',
      reason,
      now(),
      id,
    ]);
  }

  async clearApproval(id: string): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_tasks SET approval_reason = NULL, updated_at = ? WHERE id = ?', [now(), id]);
  }

  /**
   * Begin an external-verification suspension atomically.
   *
   * Task transition (`in-progress → awaiting-verification`) and the CI
   * correlation fields commit in one transaction, so there can be no
   * "waiting without correlation". Re-beginning with the same `waitRef` while
   * already suspended is idempotent.
   */
  async beginExternalVerificationWait(input: BeginExternalVerificationWaitInput): Promise<WorkflowTask> {
    const task = await this.get(input.taskId);
    if (!task) throw new Error(`Task ${input.taskId} not found`);
    if (task.status === 'awaiting-verification' && task.externalWait?.waitRef === input.waitRef) {
      return task;
    }
    if (task.status !== 'in-progress') {
      throw new Error(
        `cannot begin external wait for task ${input.taskId}: status=${task.status}, expected in-progress`,
      );
    }
    const suspendedAt = input.suspendedAt ?? now();
    begin(this.db);
    dbRun(
      this.db,
      `UPDATE orchestrated_tasks
         SET status = 'awaiting-verification',
             wait_verifier = ?, wait_ref = ?, wait_provider = ?, wait_run_ref = ?,
             wait_repository = ?, wait_commit_sha = ?, wait_branch = ?,
             wait_orig_workflow_run_id = ?, wait_orig_operation_id = ?,
             wait_suspended_at = ?, wait_resumed_at = NULL, wait_decision_ref = NULL,
             updated_at = ?
       WHERE id = ? AND status = 'in-progress'`,
      [
        input.verifier,
        input.waitRef,
        input.provider ?? null,
        input.runRef ?? null,
        input.repository,
        input.commitSha,
        input.branch,
        input.originatingWorkflowRunId ?? null,
        input.originatingOperationId ?? null,
        suspendedAt,
        now(),
        input.taskId,
      ],
    );
    const changed = this.db.getRowsModified();
    if (changed !== 1) {
      rollback(this.db);
      throw new Error(`external wait not applied for task ${input.taskId} (status changed concurrently)`);
    }
    commit(this.db);
    const updated = await this.get(input.taskId);
    if (!updated) throw new Error(`Task ${input.taskId} disappeared after external wait`);
    return updated;
  }

  /**
   * Resume an external-verification suspension atomically and exactly once.
   *
   * The conditional UPDATE (`wait_resumed_at IS NULL`) means a webhook retry or
   * post-restart replay returns the already-recorded resume instead of creating
   * a second one. Resume returns the task to `in-progress` — never `completed`.
   */
  async resumeExternalVerificationWait(input: ResumeExternalVerificationWaitInput): Promise<WorkflowTask> {
    if (!input.decisionRef.trim()) throw new Error('resume requires a correlated decision reference');
    const resumedAt = input.resumedAt ?? now();
    begin(this.db);
    dbRun(
      this.db,
      `UPDATE orchestrated_tasks
         SET status = 'in-progress', wait_resumed_at = ?, wait_decision_ref = ?, updated_at = ?
       WHERE wait_ref = ? AND status = 'awaiting-verification' AND wait_resumed_at IS NULL`,
      [resumedAt, input.decisionRef, now(), input.waitRef],
    );
    const changed = this.db.getRowsModified();
    commit(this.db);
    const task = await this.getByWaitRef(input.waitRef);
    if (changed === 1 && task) return task;
    if (task && task.externalWait?.resumedAt) return task; // exactly-once replay
    throw new Error(`no pending external wait for ${input.waitRef}`);
  }

  async getByWaitRef(waitRef: string): Promise<WorkflowTask | null> {
    const row = dbGet(this.db, 'SELECT * FROM orchestrated_tasks WHERE wait_ref = ? ORDER BY updated_at DESC LIMIT 1', [
      waitRef,
    ]);
    return row ? this.rowToTask(row) : null;
  }

  async listWaitsByCommit(repository: string, commitSha: string): Promise<WorkflowTask[]> {
    const rows = dbAll(
      this.db,
      'SELECT * FROM orchestrated_tasks WHERE wait_repository = ? AND wait_commit_sha = ? ORDER BY wait_suspended_at ASC',
      [repository, commitSha],
    );
    return rows.map((row) => this.rowToTask(row));
  }

  async attachExternalWaitRunRef(waitRef: string, runRef: string): Promise<WorkflowTask | null> {
    dbRun(
      this.db,
      'UPDATE orchestrated_tasks SET wait_run_ref = ?, updated_at = ? WHERE wait_ref = ? AND wait_run_ref IS NULL',
      [runRef, now(), waitRef],
    );
    return this.getByWaitRef(waitRef);
  }

  private persist(task: WorkflowTask): void {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO orchestrated_tasks
       (id, plan_id, summary, description, files, dependencies, status, effort, required_capabilities,
        assigned_agent_id, revision_count, attempt_count, last_error, approval_reason, started_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.planId,
        task.summary,
        task.description,
        JSON.stringify(task.files),
        JSON.stringify(task.dependencies),
        task.status,
        task.effort,
        JSON.stringify(task.requiredCapabilities),
        task.assignedAgentId ?? null,
        task.revisionCount,
        task.attemptCount,
        task.lastError ?? null,
        task.approvalReason ?? null,
        task.startedAt ?? null,
        task.completedAt ?? null,
        task.createdAt,
        task.updatedAt,
      ],
    );
  }

  private rowToTask(row: Record<string, unknown>): WorkflowTask {
    const externalWait: ExternalVerificationWait | undefined =
      str(row.wait_verifier) === 'ci' && row.wait_ref
        ? {
            verifier: 'ci',
            waitRef: str(row.wait_ref),
            ...(row.wait_provider ? { provider: str(row.wait_provider) } : {}),
            ...(row.wait_run_ref ? { runRef: str(row.wait_run_ref) } : {}),
            repository: str(row.wait_repository),
            commitSha: str(row.wait_commit_sha),
            branch: str(row.wait_branch),
            ...(row.wait_orig_workflow_run_id ? { originatingWorkflowRunId: str(row.wait_orig_workflow_run_id) } : {}),
            ...(row.wait_orig_operation_id ? { originatingOperationId: str(row.wait_orig_operation_id) } : {}),
            suspendedAt: str(row.wait_suspended_at),
            ...(row.wait_resumed_at ? { resumedAt: str(row.wait_resumed_at) } : {}),
            ...(row.wait_decision_ref ? { decisionRef: str(row.wait_decision_ref) } : {}),
          }
        : undefined;
    return {
      id: str(row.id),
      planId: str(row.plan_id),
      summary: str(row.summary),
      description: str(row.description),
      files: (jsonParse(row.files) as string[]) ?? [],
      dependencies: (jsonParse(row.dependencies) as string[]) ?? [],
      status: str(row.status) as TaskStatus,
      effort: (str(row.effort) as TaskEffort) ?? 'medium',
      requiredCapabilities: (jsonParse(row.required_capabilities) as string[]) ?? [],
      assignedAgentId: row.assigned_agent_id ? str(row.assigned_agent_id) : undefined,
      revisionCount: Number(row.revision_count) || 0,
      attemptCount: Number(row.attempt_count) || 0,
      lastError: row.last_error ? str(row.last_error) : undefined,
      approvalReason: row.approval_reason ? str(row.approval_reason) : undefined,
      ...(externalWait ? { externalWait } : {}),
      startedAt: row.started_at ? str(row.started_at) : undefined,
      completedAt: row.completed_at ? str(row.completed_at) : undefined,
      createdAt: str(row.created_at),
      updatedAt: str(row.updated_at),
    };
  }
}
