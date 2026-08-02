/**
 * PlanStore — sql.js persistence for orchestrator plan state.
 */

import type { Database } from 'sql.js';
import { dbAll, dbGet, dbRun, now, str } from '../db';
import { generateId } from '../ids';
import type { PlanStatus, WorkflowPlan } from '../types';

export interface CreatePlanInput {
  readonly projectId: string;
  readonly title: string;
  readonly goal: string;
}

export class PlanStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orchestrated_plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        approval_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oplan_project ON orchestrated_plans(project_id);
    `);
  }

  async create(input: CreatePlanInput): Promise<WorkflowPlan> {
    const id = generateId('plan');
    const plan: WorkflowPlan = {
      id,
      projectId: input.projectId,
      title: input.title,
      goal: input.goal,
      revision: 1,
      status: 'draft',
      createdAt: now(),
      updatedAt: now(),
    };
    this.persist(plan);
    return plan;
  }

  async get(id: string): Promise<WorkflowPlan | null> {
    const row = dbGet(this.db, 'SELECT * FROM orchestrated_plans WHERE id = ?', [id]);
    return row ? this.rowToPlan(row) : null;
  }

  async listForProject(projectId: string): Promise<WorkflowPlan[]> {
    const rows = dbAll(this.db, 'SELECT * FROM orchestrated_plans WHERE project_id = ? ORDER BY created_at ASC', [
      projectId,
    ]);
    return rows.map((row) => this.rowToPlan(row));
  }

  async updateStatus(id: string, status: PlanStatus): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_plans SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
  }

  async bumpRevision(id: string): Promise<WorkflowPlan | null> {
    dbRun(this.db, 'UPDATE orchestrated_plans SET revision = revision + 1, updated_at = ? WHERE id = ?', [now(), id]);
    return this.get(id);
  }

  async setApproval(id: string, approvalId: string): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_plans SET approval_id = ?, updated_at = ? WHERE id = ?', [
      approvalId,
      now(),
      id,
    ]);
  }

  private persist(plan: WorkflowPlan): void {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO orchestrated_plans (id, project_id, title, goal, revision, status, approval_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        plan.id,
        plan.projectId,
        plan.title,
        plan.goal,
        plan.revision,
        plan.status,
        plan.approvalId ?? null,
        plan.createdAt,
        plan.updatedAt,
      ],
    );
  }

  private rowToPlan(row: Record<string, unknown>): WorkflowPlan {
    return {
      id: str(row.id),
      projectId: str(row.project_id),
      title: str(row.title),
      goal: str(row.goal),
      revision: Number(row.revision) || 1,
      status: str(row.status) as PlanStatus,
      approvalId: row.approval_id ? str(row.approval_id) : undefined,
      createdAt: str(row.created_at),
      updatedAt: str(row.updated_at),
    };
  }
}
