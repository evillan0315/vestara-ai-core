import type { ImpactAssessment } from './types';

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

export class ImpactStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async save(a: ImpactAssessment): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO impact_assessments
       (id, workspace_id, plan_id, target, created_at, confidence,
        scope, risk, effort, health, recommendations, narrative, model_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        a.workspaceId,
        a.planId ?? null,
        a.target,
        a.createdAt,
        a.confidence,
        JSON.stringify(a.scope),
        JSON.stringify(a.risk),
        JSON.stringify(a.effort),
        JSON.stringify(a.health),
        JSON.stringify(a.recommendations),
        a.narrative ?? null,
        a.modelVersion,
      ],
    );
  }

  async get(id: string): Promise<ImpactAssessment | null> {
    const rows = dbAll(this.db, 'SELECT * FROM impact_assessments WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    return rowToAssessment(rows[0]);
  }

  async listByWorkspace(workspaceId: string): Promise<ImpactAssessment[]> {
    const rows = dbAll(this.db, 'SELECT * FROM impact_assessments WHERE workspace_id = ? ORDER BY created_at DESC', [
      workspaceId,
    ]);
    return rows.map(rowToAssessment);
  }
}

function rowToAssessment(r: any): ImpactAssessment {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    planId: r.plan_id ?? undefined,
    target: r.target,
    createdAt: r.created_at,
    confidence: r.confidence,
    scope: JSON.parse(r.scope ?? '{}'),
    risk: JSON.parse(r.risk ?? '{}'),
    effort: JSON.parse(r.effort ?? '{}'),
    health: JSON.parse(r.health ?? '{}'),
    recommendations: JSON.parse(r.recommendations ?? '[]'),
    narrative: r.narrative ?? undefined,
    modelVersion: r.model_version,
  };
}
