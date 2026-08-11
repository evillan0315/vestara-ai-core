/**
 * SessionStorage — SQLite-backed persistence for engineering sessions, events.
 *
 * Architecture Traceability:
 *   PCS: PCS-009 — Engineering Session
 *   Safety: Automation may execute. Governance decides.
 */

import type { EngineeringSession, SessionParticipant, SessionStatus, WorkspaceEvent } from './types';

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

let sesCounter = 0;

export class SessionStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    // Schema is owned by the migration chain (workspace-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
  }

  async createSession(title: string, objective: string): Promise<EngineeringSession> {
    const now = new Date().toISOString();
    const id = `SES-${++sesCounter}`;
    const session: EngineeringSession = {
      id,
      title,
      objective,
      status: 'created',
      participants: [{ id: 'current-user', type: 'human', role: 'owner' }],
      artifacts: [],
      createdAt: now,
    };
    dbRun(
      this.db,
      `INSERT INTO engineering_sessions (id, title, objective, status, participants, artifacts, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        objective,
        session.status,
        JSON.stringify(session.participants),
        JSON.stringify(session.artifacts),
        session.createdAt,
      ],
    );
    return session;
  }

  async getSession(id: string): Promise<EngineeringSession | null> {
    const row = dbGet(this.db, 'SELECT * FROM engineering_sessions WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      objective: row.objective,
      status: row.status,
      participants: JSON.parse(row.participants ?? '[]'),
      artifacts: JSON.parse(row.artifacts ?? '[]'),
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
    };
  }

  async listSessions(): Promise<EngineeringSession[]> {
    const rows = dbAll(this.db, 'SELECT * FROM engineering_sessions ORDER BY created_at DESC');
    return rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      objective: r.objective,
      status: r.status,
      participants: JSON.parse(r.participants ?? '[]'),
      artifacts: JSON.parse(r.artifacts ?? '[]'),
      createdAt: r.created_at,
      completedAt: r.completed_at ?? undefined,
    }));
  }

  async updateStatus(id: string, status: SessionStatus): Promise<void> {
    const completedAt = status === 'completed' || status === 'failed' ? new Date().toISOString() : null;
    dbRun(this.db, 'UPDATE engineering_sessions SET status = ?, completed_at = ? WHERE id = ?', [
      status,
      completedAt,
      id,
    ]);
  }

  async addArtifact(id: string, artifactId: string): Promise<void> {
    const session = await this.getSession(id);
    if (!session) return;
    session.artifacts.push(artifactId);
    dbRun(this.db, 'UPDATE engineering_sessions SET artifacts = ? WHERE id = ?', [
      JSON.stringify(session.artifacts),
      id,
    ]);
  }

  async addParticipant(id: string, participant: SessionParticipant): Promise<void> {
    const session = await this.getSession(id);
    if (!session) return;
    session.participants.push(participant);
    dbRun(this.db, 'UPDATE engineering_sessions SET participants = ? WHERE id = ?', [
      JSON.stringify(session.participants),
      id,
    ]);
  }

  async logEvent(event: WorkspaceEvent): Promise<void> {
    dbRun(
      this.db,
      'INSERT INTO workspace_events (id, session_id, type, actor, artifact_id, message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [event.id, event.sessionId, event.type, event.actor, event.artifactId, event.message, event.timestamp],
    );
  }

  async getEvents(sessionId: string): Promise<WorkspaceEvent[]> {
    const rows = dbAll(this.db, 'SELECT * FROM workspace_events WHERE session_id = ? ORDER BY timestamp ASC', [
      sessionId,
    ]);
    return rows.map((r: any) => ({
      id: r.id,
      sessionId: r.session_id,
      type: r.type,
      actor: r.actor,
      artifactId: r.artifact_id,
      message: r.message,
      timestamp: r.timestamp,
    }));
  }
}
