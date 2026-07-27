/**
 * CloudStorage — SQLite-backed persistence for cloud execution environment.
 *
 * Architecture Traceability:
 *   PCS: PCS-015 — Cloud Execution Environment
 */

import type { CloudJob, CloudWorker } from './types';

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

export class CloudStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
    this.seedWorkers();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cloud_jobs (
        id TEXT PRIMARY KEY, type TEXT, target TEXT,
        status TEXT DEFAULT 'pending', worker_type TEXT,
        submitted_at TEXT, completed_at TEXT, result TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cj_status ON cloud_jobs(status);
      CREATE TABLE IF NOT EXISTS cloud_workers (
        id TEXT PRIMARY KEY, name TEXT, type TEXT,
        status TEXT DEFAULT 'idle', current_job TEXT,
        resources TEXT DEFAULT '{}'
      );
    `);
  }

  private seedWorkers(): void {
    const existing = dbGet(this.db, 'SELECT COUNT(*) as c FROM cloud_workers');
    if (existing && existing.c > 0) return;
    const workers: CloudWorker[] = [
      {
        id: 'worker-local-1',
        name: 'Local Worker 1',
        type: 'local',
        status: 'idle',
        currentJob: undefined,
        resources: { cpu: 4, memory: 8192 },
      },
      {
        id: 'worker-remote-1',
        name: 'Cloud Worker 1',
        type: 'remote',
        status: 'idle',
        currentJob: undefined,
        resources: { cpu: 16, memory: 32768 },
      },
      {
        id: 'worker-container-1',
        name: 'Container Runner',
        type: 'container',
        status: 'idle',
        currentJob: undefined,
        resources: { cpu: 8, memory: 16384 },
      },
    ];
    for (const w of workers) {
      dbRun(
        this.db,
        'INSERT INTO cloud_workers (id, name, type, status, current_job, resources) VALUES (?, ?, ?, ?, ?, ?)',
        [w.id, w.name, w.type, w.status, w.currentJob ?? null, JSON.stringify(w.resources)],
      );
    }
  }

  async submitJob(type: string, target: string, workerType: string): Promise<CloudJob> {
    const now = new Date().toISOString();
    const id = `job-${Date.now()}`;
    dbRun(
      this.db,
      'INSERT INTO cloud_jobs (id, type, target, status, worker_type, submitted_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, type, target, 'pending', workerType, now],
    );
    return { id, type, target, status: 'pending', workerType: workerType as any, submittedAt: now };
  }

  async listJobs(status?: string): Promise<CloudJob[]> {
    let rows: any[];
    if (status) {
      rows = dbAll(this.db, 'SELECT * FROM cloud_jobs WHERE status = ? ORDER BY submitted_at DESC', [status]);
    } else {
      rows = dbAll(this.db, 'SELECT * FROM cloud_jobs ORDER BY submitted_at DESC');
    }
    return rows.map((r: any) => ({
      id: r.id,
      type: r.type,
      target: r.target,
      status: r.status,
      workerType: r.worker_type,
      submittedAt: r.submitted_at,
      completedAt: r.completed_at ?? undefined,
      result: r.result ?? undefined,
    }));
  }

  async getJob(id: string): Promise<CloudJob | null> {
    const row = dbGet(this.db, 'SELECT * FROM cloud_jobs WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      target: row.target,
      status: row.status,
      workerType: row.worker_type,
      submittedAt: row.submitted_at,
      completedAt: row.completed_at ?? undefined,
      result: row.result ?? undefined,
    };
  }

  async updateJobStatus(id: string, status: string, result?: string): Promise<void> {
    const completedAt = status === 'completed' || status === 'failed' ? new Date().toISOString() : null;
    dbRun(this.db, 'UPDATE cloud_jobs SET status = ?, completed_at = ?, result = ? WHERE id = ?', [
      status,
      completedAt,
      result ?? null,
      id,
    ]);
  }

  async listWorkers(): Promise<CloudWorker[]> {
    return dbAll(this.db, 'SELECT * FROM cloud_workers').map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      currentJob: r.current_job ?? undefined,
      resources: JSON.parse(r.resources ?? '{}'),
    }));
  }
}
