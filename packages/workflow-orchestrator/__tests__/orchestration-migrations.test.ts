import { migrate } from '@vestara/sqlite-migrations';
import { ORCHESTRATION_MANIFEST, ORCHESTRATION_MIGRATIONS } from '@vestara/workflow-orchestrator';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

function freshDb(): Database {
  return new SQL.Database();
}

function columns(db: Database, table: string): string[] {
  return (db.exec(`PRAGMA table_info(${table})`)[0]?.values ?? []).map((row) => String(row[1]));
}

describe('orchestration migrations (Track 3, plans.db)', () => {
  it('migrates a pristine DB to v3 with the full orchestration schema', () => {
    const db = freshDb();
    const result = migrate(db, ORCHESTRATION_MANIFEST);
    expect(result.to).toBe(3);
    expect(result.applied).toEqual([
      'orchestration.baseline',
      'orchestration.projects.verification_reopens',
      'orchestration.tasks.approval_reason',
    ]);
    expect(columns(db, 'orchestrated_projects')).toContain('verification_reopens');
    expect(columns(db, 'orchestrated_tasks')).toContain('approval_reason');
    // All baseline tables exist.
    for (const table of [
      'orchestrated_projects',
      'orchestrated_plans',
      'orchestrated_tasks',
      'orchestrated_artifacts',
      'orchestrated_file_locks',
      'orchestrated_parent_projects',
      'orchestrated_parent_children',
      'orchestrated_worker_nodes',
      'orchestrated_task_leases',
    ]) {
      expect(columns(db, table).length).toBeGreaterThan(0);
    }
  });

  it('upgrades a synthetic historical baseline, adding both drift columns', () => {
    const db = freshDb();
    ORCHESTRATION_MIGRATIONS[0].up(db, { addColumnIfMissing: () => undefined });
    db.run(
      "INSERT INTO orchestrated_projects (id, name, goal, repo_path, phase, workspace_id, created_at, updated_at) VALUES ('p1','P','G','/r','draft','w','t','t')",
    );

    const result = migrate(db, ORCHESTRATION_MANIFEST);
    expect(result.adopted).toBe(1);
    expect(result.applied).toEqual([
      'orchestration.projects.verification_reopens',
      'orchestration.tasks.approval_reason',
    ]);
    expect(columns(db, 'orchestrated_projects')).toContain('verification_reopens');
    expect(columns(db, 'orchestrated_tasks')).toContain('approval_reason');
    // Rows preserved.
    expect(db.exec('SELECT id FROM orchestrated_projects WHERE id = ?', ['p1'])[0]?.values?.[0]?.[0]).toBe('p1');
  });

  it('converges the incident state (verification_reopens present, approval_reason absent)', () => {
    const db = freshDb();
    ORCHESTRATION_MIGRATIONS[0].up(db, { addColumnIfMissing: () => undefined });
    db.exec('ALTER TABLE orchestrated_projects ADD COLUMN verification_reopens INTEGER NOT NULL DEFAULT 0');

    const result = migrate(db, ORCHESTRATION_MANIFEST);
    expect(result.adopted).toBe(2); // baseline + verification_reopens already satisfied
    expect(result.applied).toEqual(['orchestration.tasks.approval_reason']);
    expect(columns(db, 'orchestrated_tasks')).toContain('approval_reason');
  });

  it('is idempotent and metadata-consistent', () => {
    const db = freshDb();
    migrate(db, ORCHESTRATION_MANIFEST);
    const second = migrate(db, ORCHESTRATION_MANIFEST);
    expect(second.applied).toEqual([]);
    const maxLog = Number(db.exec('SELECT MAX(version) FROM _vestara_migrations')[0]?.values?.[0]?.[0]);
    const uv = Number(db.exec('PRAGMA user_version')[0]?.values?.[0]?.[0]);
    expect(maxLog).toBe(uv);
  });
});
