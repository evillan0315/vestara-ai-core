/**
 * CollaborationStorage — SQLite-backed persistence for collaboration artifacts.
 *
 * Manages three tables:
 *   collaboration_records — main records with review lifecycle
 *   approvals            — immutable approval events (append-only)
 *   comments             — artifact-attached comments
 *
 * Architecture Traceability:
 *   PCS: PCS-006 — Collaboration
 *   Product Principle: Commands Are Ephemeral. Artifacts Are Durable.
 */

import type { Approval, CollaborationComment, CollaborationRecord, ReviewStatus } from './types';

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

let crCounter = 0;
function genId(): string {
  return `CR-${++crCounter}`;
}

let aprCounter = 0;
function _genAprId(): string {
  return `APR-${++aprCounter}`;
}

let cmtCounter = 0;
function _genCmtId(): string {
  return `CMT-${++cmtCounter}`;
}

export class CollaborationStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collaboration_records (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        change_set_id TEXT,
        plan_id TEXT,
        verification_id TEXT,
        status TEXT DEFAULT 'draft',
        approvals TEXT DEFAULT '[]',
        comments TEXT DEFAULT '[]',
        ownership TEXT DEFAULT '{}',
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cr_cs ON collaboration_records(change_set_id);
      CREATE INDEX IF NOT EXISTS idx_cr_workspace ON collaboration_records(workspace_id);

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        record_id TEXT,
        reviewer TEXT,
        decision TEXT,
        comment TEXT,
        created_at TEXT,
        FOREIGN KEY (record_id) REFERENCES collaboration_records(id)
      );
      CREATE INDEX IF NOT EXISTS idx_apr_record ON approvals(record_id);

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        record_id TEXT,
        artifact_type TEXT,
        artifact_id TEXT,
        author TEXT,
        message TEXT,
        created_at TEXT,
        FOREIGN KEY (record_id) REFERENCES collaboration_records(id)
      );
      CREATE INDEX IF NOT EXISTS idx_cmt_record ON comments(record_id);
    `);
  }

  async create(changeSetId: string, planId: string, workspaceId: string): Promise<CollaborationRecord> {
    const now = new Date().toISOString();
    const id = genId();
    const record: CollaborationRecord = {
      id,
      workspaceId,
      changeSetId,
      planId,
      verificationId: null,
      status: 'draft',
      approvals: [],
      comments: [],
      ownership: { owner: 'current-user', contributors: [], reviewers: ['current-user'] },
      createdAt: now,
      updatedAt: now,
    };
    await this.save(record);
    return record;
  }

  async save(record: CollaborationRecord): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO collaboration_records
       (id, workspace_id, change_set_id, plan_id, verification_id, status, approvals, comments, ownership, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.workspaceId,
        record.changeSetId,
        record.planId,
        record.verificationId,
        record.status,
        JSON.stringify(record.approvals),
        JSON.stringify(record.comments),
        JSON.stringify(record.ownership),
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  async get(id: string): Promise<CollaborationRecord | null> {
    const row = dbGet(this.db, 'SELECT * FROM collaboration_records WHERE id = ?', [id]);
    if (!row) return null;
    return this.rowToRecord(row);
  }

  async listByWorkspace(workspaceId: string): Promise<CollaborationRecord[]> {
    const rows = dbAll(this.db, 'SELECT * FROM collaboration_records WHERE workspace_id = ? ORDER BY created_at DESC', [
      workspaceId,
    ]);
    return rows.map((r: any) => this.rowToRecord(r));
  }

  async updateStatus(id: string, status: ReviewStatus): Promise<void> {
    dbRun(this.db, 'UPDATE collaboration_records SET status = ?, updated_at = ? WHERE id = ?', [
      status,
      new Date().toISOString(),
      id,
    ]);
  }

  async updateVerificationId(id: string, verificationId: string): Promise<void> {
    dbRun(this.db, 'UPDATE collaboration_records SET verification_id = ?, updated_at = ? WHERE id = ?', [
      verificationId,
      new Date().toISOString(),
      id,
    ]);
  }

  async addApproval(recordId: string, approval: Approval): Promise<void> {
    // Store in approvals table (append-only, immutable)
    dbRun(
      this.db,
      'INSERT INTO approvals (id, record_id, reviewer, decision, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [approval.id, recordId, approval.reviewer, approval.decision, approval.comment ?? null, approval.createdAt],
    );

    // Also update the record's approvals array for convenience
    const record = await this.get(recordId);
    if (record) {
      record.approvals.push(approval);
      record.updatedAt = new Date().toISOString();
      await this.save(record);
    }
  }

  async addComment(recordId: string, comment: CollaborationComment): Promise<void> {
    // Store in comments table
    dbRun(
      this.db,
      'INSERT INTO comments (id, record_id, artifact_type, artifact_id, author, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        comment.id,
        recordId,
        comment.artifactType,
        comment.artifactId,
        comment.author,
        comment.message,
        comment.createdAt,
      ],
    );

    // Also update the record's comments array
    const record = await this.get(recordId);
    if (record) {
      record.comments.push(comment);
      record.updatedAt = new Date().toISOString();
      await this.save(record);
    }
  }

  async getApprovals(recordId: string): Promise<Approval[]> {
    const rows = dbAll(this.db, 'SELECT * FROM approvals WHERE record_id = ? ORDER BY created_at ASC', [recordId]);
    return rows.map((r: any) => ({
      id: r.id,
      reviewer: r.reviewer,
      decision: r.decision,
      comment: r.comment ?? undefined,
      createdAt: r.created_at,
    }));
  }

  async getComments(recordId: string): Promise<CollaborationComment[]> {
    const rows = dbAll(this.db, 'SELECT * FROM comments WHERE record_id = ? ORDER BY created_at ASC', [recordId]);
    return rows.map((r: any) => ({
      id: r.id,
      artifactType: r.artifact_type,
      artifactId: r.artifact_id,
      author: r.author,
      message: r.message,
      createdAt: r.created_at,
    }));
  }

  private rowToRecord(row: any): CollaborationRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      changeSetId: row.change_set_id,
      planId: row.plan_id,
      verificationId: row.verification_id ?? null,
      status: row.status,
      approvals: JSON.parse(row.approvals ?? '[]'),
      comments: JSON.parse(row.comments ?? '[]'),
      ownership: JSON.parse(row.ownership ?? '{"owner":"current-user","contributors":[],"reviewers":["current-user"]}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
