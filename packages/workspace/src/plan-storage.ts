/**
 * PlanStorage — SQLite-backed persistence for Plan artifacts.
 *
 * Follows the same pattern as KnowledgeStorage and MemoryRuntime.
 * Plans are stored per-workspace in .vestara/plans/plans.db.
 *
 * Architecture Traceability:
 *   PCS: PCS-003 — Planning
 *   Product Principle: Commands Are Ephemeral. Artifacts Are Durable.
 */

import type { Plan, PlanStatus, Task } from './types';

function dbRun(db: any, sql: string, params?: any[]): void {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}

function dbGet(db: any, sql: string, params?: any[]): any {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const r = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return r;
}

function dbAll(db: any, sql: string, params?: any[]): any[] {
  const results: any[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

let planCounter = 0;
function genId(): string {
  return `P-${++planCounter}`;
}

export class PlanStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
    this.initialized = true;
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        title TEXT,
        goal TEXT,
        scope TEXT DEFAULT '[]',
        assumptions TEXT DEFAULT '[]',
        constraints TEXT DEFAULT '[]',
        risks TEXT DEFAULT '[]',
        tasks TEXT DEFAULT '[]',
        status TEXT DEFAULT 'draft',
        created_at TEXT,
        updated_at TEXT,
        workspace_id TEXT,
        parent_explanations TEXT DEFAULT '[]',
        prediction_id TEXT,
        decision_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
      CREATE INDEX IF NOT EXISTS idx_plans_workspace ON plans(workspace_id);
    `);
  }

  async create(goal: string, workspaceId: string): Promise<Plan> {
    const now = new Date().toISOString();
    const id = genId();
    const plan: Plan = {
      id,
      title: goal.length > 60 ? `${goal.slice(0, 57)}...` : goal,
      goal,
      scope: [],
      assumptions: [],
      constraints: [],
      risks: [],
      tasks: [],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      workspaceId,
      parentExplanations: [],
    };
    await this.save(plan);
    return plan;
  }

  async save(plan: Plan): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO plans
       (id, title, goal, scope, assumptions, constraints, risks, tasks, status, created_at, updated_at, workspace_id, parent_explanations, prediction_id, decision_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        plan.id,
        plan.title,
        plan.goal,
        JSON.stringify(plan.scope),
        JSON.stringify(plan.assumptions),
        JSON.stringify(plan.constraints),
        JSON.stringify(plan.risks),
        JSON.stringify(plan.tasks),
        plan.status,
        plan.createdAt,
        plan.updatedAt,
        plan.workspaceId,
        JSON.stringify(plan.parentExplanations),
        plan.predictionId ?? null,
        plan.decisionId ?? null,
      ],
    );
  }

  async get(id: string): Promise<Plan | null> {
    const row = dbGet(this.db, 'SELECT * FROM plans WHERE id = ?', [id]);
    if (!row) return null;
    return this.rowToPlan(row);
  }

  async list(workspaceId: string): Promise<Plan[]> {
    const rows = dbAll(this.db, 'SELECT * FROM plans WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId]);
    return rows.map((r: any) => this.rowToPlan(r));
  }

  async updateStatus(id: string, status: PlanStatus): Promise<void> {
    dbRun(this.db, 'UPDATE plans SET status = ?, updated_at = ? WHERE id = ?', [status, new Date().toISOString(), id]);
  }

  async updateTasks(id: string, tasks: Task[]): Promise<void> {
    dbRun(this.db, 'UPDATE plans SET tasks = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify(tasks),
      new Date().toISOString(),
      id,
    ]);
  }

  async delete(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM plans WHERE id = ?', [id]);
  }

  async deleteAll(workspaceId: string): Promise<number> {
    const before = dbAll(this.db, 'SELECT COUNT(*) as cnt FROM plans WHERE workspace_id = ?', [workspaceId]);
    const count = before[0]?.cnt ?? 0;
    dbRun(this.db, 'DELETE FROM plans WHERE workspace_id = ?', [workspaceId]);
    return count;
  }

  private rowToPlan(row: any): Plan {
    return {
      id: row.id,
      title: row.title,
      goal: row.goal,
      scope: JSON.parse(row.scope ?? '[]'),
      assumptions: JSON.parse(row.assumptions ?? '[]'),
      constraints: JSON.parse(row.constraints ?? '[]'),
      risks: JSON.parse(row.risks ?? '[]'),
      tasks: JSON.parse(row.tasks ?? '[]'),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      workspaceId: row.workspace_id,
      parentExplanations: JSON.parse(row.parent_explanations ?? '[]'),
      predictionId: row.prediction_id ?? undefined,
      decisionId: row.decision_id ?? undefined,
    };
  }
}
