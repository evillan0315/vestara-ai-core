import { migrate } from '@vestara/sqlite-migrations';
import { DECISION_MANIFEST } from './scaffold-migrations';
import type { Decision } from './types';

function dbRun(db: any, sql: string, params?: any[]): void {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}

function dbAll(db: any, sql: string, params?: any[]): any[] {
  const results: any[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

export class DecisionStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
  }

  private ensureSchema(): void {
    migrate(this.db, DECISION_MANIFEST);
  }

  async save(d: Decision): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO decisions
       (id, workspace_id, plan_id, assessment_id, created_at, recommendation,
        alternatives, rationale, confidence, accepted, accepted_by, accepted_at, model_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.id,
        d.workspaceId,
        d.planId ?? null,
        d.assessmentId ?? null,
        d.createdAt,
        d.recommendation,
        JSON.stringify(d.alternatives),
        d.rationale,
        d.confidence,
        d.accepted ? 1 : 0,
        d.acceptedBy ?? null,
        d.acceptedAt ?? null,
        d.modelVersion,
      ],
    );
  }

  async get(id: string): Promise<Decision | null> {
    const rows = dbAll(this.db, 'SELECT * FROM decisions WHERE id = ?', [id]);
    if (!rows.length) return null;
    return rowToDecision(rows[0]);
  }

  async listByWorkspace(workspaceId: string): Promise<Decision[]> {
    return dbAll(this.db, 'SELECT * FROM decisions WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId]).map(
      rowToDecision,
    );
  }
}

function rowToDecision(r: any): Decision {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    planId: r.plan_id ?? undefined,
    assessmentId: r.assessment_id ?? undefined,
    createdAt: r.created_at,
    recommendation: r.recommendation,
    alternatives: JSON.parse(r.alternatives ?? '[]'),
    rationale: r.rationale,
    confidence: r.confidence,
    accepted: r.accepted === 1,
    acceptedBy: r.accepted_by ?? undefined,
    acceptedAt: r.accepted_at ?? undefined,
    modelVersion: r.model_version,
  };
}
