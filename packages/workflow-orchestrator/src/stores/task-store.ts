/**
 * TaskStore — sql.js persistence for orchestrated tasks.
 */

import type { Database } from 'sql.js';
import { dbAll, dbGet, dbRun, jsonParse, now, str } from '../db';
import { generateId } from '../ids';
import type { TaskEffort, TaskStatus, WorkflowTask } from '../types';

export interface CreateTaskInput {
  readonly planId: string;
  readonly summary: string;
  readonly description: string;
  readonly files: readonly string[];
  readonly dependencies: readonly string[];
  readonly effort: TaskEffort;
  readonly requiredCapabilities: readonly string[];
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
      startedAt: row.started_at ? str(row.started_at) : undefined,
      completedAt: row.completed_at ? str(row.completed_at) : undefined,
      createdAt: str(row.created_at),
      updatedAt: str(row.updated_at),
    };
  }
}
