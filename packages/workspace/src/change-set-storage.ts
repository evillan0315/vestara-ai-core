/**
 * ChangeSetStorage — SQLite-backed persistence for Change Set artifacts.
 *
 * Follows the same pattern as PlanStorage and KnowledgeStorage.
 * Change Sets are stored per-workspace in .vestara/plans/ (same DB as plans).
 *
 * Architecture Traceability:
 *   PCS: PCS-004 — Implementation
 *   Product Principle: Commands Are Ephemeral. Artifacts Are Durable.
 */

import type { ChangeSet, ChangeSetStatus, FileChange } from './types';

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

let csCounter = 0;
function genId(): string {
  return `CS-${++csCounter}`;
}

export class ChangeSetStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    // Schema is owned by the migration chain (workspace-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
  }

  async create(planId: string, title: string, workspaceId: string): Promise<ChangeSet> {
    const now = new Date().toISOString();
    const id = genId();
    const cs: ChangeSet = {
      id,
      planId,
      title,
      status: 'draft',
      files: [],
      createdAt: now,
      appliedAt: null,
      workspaceId,
    };
    await this.save(cs);
    return cs;
  }

  async save(cs: ChangeSet): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO change_sets
       (id, plan_id, title, status, files, created_at, applied_at, workspace_id, assessment_id, decision_id, author, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cs.id,
        cs.planId,
        cs.title,
        cs.status,
        JSON.stringify(cs.files),
        cs.createdAt,
        cs.appliedAt,
        cs.workspaceId,
        cs.assessmentId ?? null,
        cs.decisionId ?? null,
        cs.author ?? null,
        cs.summary ? JSON.stringify(cs.summary) : null,
      ],
    );
  }

  async get(id: string): Promise<ChangeSet | null> {
    const row = dbGet(this.db, 'SELECT * FROM change_sets WHERE id = ?', [id]);
    if (!row) return null;
    return this.rowToChangeSet(row);
  }

  async listByPlan(planId: string): Promise<ChangeSet[]> {
    const rows = dbAll(this.db, 'SELECT * FROM change_sets WHERE plan_id = ? ORDER BY created_at DESC', [planId]);
    return rows.map((r: any) => this.rowToChangeSet(r));
  }

  async listByWorkspace(workspaceId: string): Promise<ChangeSet[]> {
    const rows = dbAll(this.db, 'SELECT * FROM change_sets WHERE workspace_id = ? ORDER BY created_at DESC', [
      workspaceId,
    ]);
    return rows.map((r: any) => this.rowToChangeSet(r));
  }

  async updateStatus(id: string, status: ChangeSetStatus): Promise<void> {
    const now = new Date().toISOString();
    const appliedAt = status === 'applied' ? now : null;
    dbRun(this.db, 'UPDATE change_sets SET status = ?, applied_at = ? WHERE id = ?', [status, appliedAt, id]);
  }

  async updateFiles(id: string, files: FileChange[]): Promise<void> {
    dbRun(this.db, 'UPDATE change_sets SET files = ? WHERE id = ?', [JSON.stringify(files), id]);
  }

  async delete(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM change_sets WHERE id = ?', [id]);
  }

  private rowToChangeSet(row: any): ChangeSet {
    return {
      id: row.id,
      planId: row.plan_id,
      title: row.title,
      status: row.status,
      files: JSON.parse(row.files ?? '[]'),
      createdAt: row.created_at,
      appliedAt: row.applied_at ?? null,
      workspaceId: row.workspace_id,
      assessmentId: row.assessment_id ?? undefined,
      decisionId: row.decision_id ?? undefined,
      author: row.author ?? undefined,
      summary: row.summary ? JSON.parse(row.summary) : undefined,
    };
  }
}
