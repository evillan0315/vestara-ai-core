/**
 * VerificationStorage — SQLite-backed persistence for VerificationReport artifacts.
 *
 * Architecture Traceability:
 *   PCS: PCS-005 — Verification
 *   Product Principle: Commands Are Ephemeral. Artifacts Are Durable.
 */

import type { VerificationReport } from './types';

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

let vrCounter = 0;
function genId(): string {
  return `VR-${++vrCounter}`;
}

export class VerificationStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS verification_reports (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        plan_id TEXT,
        change_set_id TEXT,
        status TEXT DEFAULT 'pending',
        checks TEXT DEFAULT '[]',
        summary TEXT DEFAULT '{"total":0,"passed":0,"failed":0,"skipped":0}',
        created_at TEXT,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_vr_cs ON verification_reports(change_set_id);
      CREATE INDEX IF NOT EXISTS idx_vr_workspace ON verification_reports(workspace_id);
    `);
  }

  async create(changeSetId: string, planId: string, workspaceId: string): Promise<VerificationReport> {
    const now = new Date().toISOString();
    const id = genId();
    const report: VerificationReport = {
      id,
      workspaceId,
      planId,
      changeSetId,
      status: 'running',
      checks: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      createdAt: now,
      completedAt: null,
    };
    await this.save(report);
    return report;
  }

  async save(report: VerificationReport): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO verification_reports
       (id, workspace_id, plan_id, change_set_id, status, checks, summary, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        report.id,
        report.workspaceId,
        report.planId,
        report.changeSetId,
        report.status,
        JSON.stringify(report.checks),
        JSON.stringify(report.summary),
        report.createdAt,
        report.completedAt,
      ],
    );
  }

  async get(id: string): Promise<VerificationReport | null> {
    const row = dbGet(this.db, 'SELECT * FROM verification_reports WHERE id = ?', [id]);
    if (!row) return null;
    return this.rowToReport(row);
  }

  async listByWorkspace(workspaceId: string): Promise<VerificationReport[]> {
    const rows = dbAll(this.db, 'SELECT * FROM verification_reports WHERE workspace_id = ? ORDER BY created_at DESC', [
      workspaceId,
    ]);
    return rows.map((r: any) => this.rowToReport(r));
  }

  async listByChangeSet(changeSetId: string): Promise<VerificationReport[]> {
    const rows = dbAll(this.db, 'SELECT * FROM verification_reports WHERE change_set_id = ? ORDER BY created_at DESC', [
      changeSetId,
    ]);
    return rows.map((r: any) => this.rowToReport(r));
  }

  private rowToReport(row: any): VerificationReport {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      planId: row.plan_id,
      changeSetId: row.change_set_id,
      status: row.status,
      checks: JSON.parse(row.checks ?? '[]'),
      summary: JSON.parse(row.summary ?? '{"total":0,"passed":0,"failed":0,"skipped":0}'),
      createdAt: row.created_at,
      completedAt: row.completed_at ?? null,
    };
  }
}
