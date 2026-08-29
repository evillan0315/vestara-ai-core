import { CONVERSATION_MANIFEST, CONVERSATION_SESSION_MANIFEST } from '@vestara/conversation-runtime';
import { ENGINEERING_EVENT_MANIFEST } from '@vestara/engineering-event-store';
import { type MigrationManifest, migrate } from '@vestara/sqlite-migrations';
import { THREAD_MANIFEST } from '@vestara/thread-runtime';
import { WORKSPACE_DOMAIN_MANIFEST, WORKSPACE_DOMAIN_MIGRATIONS } from '@vestara/workspace';
import { WORKTREE_MANIFEST } from '@vestara/worktree-runtime';
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

function uv(db: Database): number {
  return Number(db.exec('PRAGMA user_version')[0]?.values?.[0]?.[0] ?? 0);
}

describe('domain file manifests (Track 3, Step 3)', () => {
  let bytes: Uint8Array | undefined;
  const cases: Array<[string, MigrationManifest, string[]]> = [
    [
      'workspace-domain (plans.db)',
      WORKSPACE_DOMAIN_MANIFEST,
      ['plans', 'users', 'projects', 'sprints', 'audit_log', 'change_sets'],
    ],
    ['engineering-events', ENGINEERING_EVENT_MANIFEST, ['engineering_events']],
    ['agent-harness threads', THREAD_MANIFEST, ['task_threads', 'agent_turns', 'thread_items', 'thread_checkpoints']],
    ['conversations', CONVERSATION_MANIFEST, ['conversations', 'conversation_messages']],
    [
      'conversation sessions',
      CONVERSATION_SESSION_MANIFEST,
      ['conversation_sessions', 'session_transcripts', 'session_audio_timeline'],
    ],
    ['worktree leases', WORKTREE_MANIFEST, ['workspace_leases', 'file_leases']],
  ];

  for (const [name, manifest, tables] of cases) {
    it(`${name}: pristine DB migrates and is idempotent`, () => {
      const db = freshDb();
      const result = migrate(db, manifest);
      expect(result.from).toBe(0);
      expect(result.to).toBe(manifest.steps.length);
      for (const table of tables) {
        const cols = db.exec(`PRAGMA table_info(${table})`)[0]?.values ?? [];
        expect(cols.length).toBeGreaterThan(0);
      }
      const second = migrate(db, manifest);
      expect(second.applied).toEqual([]);
      expect(uv(db)).toBe(manifest.steps.length);
    });
  }

  it('workspace-domain adopts a full synthetic legacy baseline, preserving rows', () => {
    const db = freshDb();
    WORKSPACE_DOMAIN_MIGRATIONS[0].up(db, { addColumnIfMissing: () => undefined });
    db.run("INSERT INTO plans (id, title) VALUES ('p1', 'Legacy')");
    const result = migrate(db, WORKSPACE_DOMAIN_MANIFEST);
    expect(result.adopted).toBe(1);
    expect(result.to).toBe(WORKSPACE_DOMAIN_MANIFEST.steps.length);
    expect(db.exec('SELECT title FROM plans WHERE id = ?', ['p1'])[0]?.values?.[0]?.[0]).toBe('Legacy');
  });

  it('multi-step legacy adoption: baseline-only DB is NOT adopted at a later version, then upgraded, persisted, and reopened consistently', () => {
    // A historical DB that satisfies the baseline but predates the later
    // `impact_assessments` step must adopt at v1 (never v2) and then run the
    // remaining migration normally — the detector must not over-adopt.
    const db = freshDb();
    WORKSPACE_DOMAIN_MIGRATIONS[0].up(db, { addColumnIfMissing: () => undefined });
    db.run("INSERT INTO plans (id, title) VALUES ('p1', 'Legacy')");

    const result = migrate(db, WORKSPACE_DOMAIN_MANIFEST, { persist: (m) => (bytes = m.export()) });
    expect(result.adopted).toBe(1);
    expect(result.to).toBe(2);
    expect(uv(db)).toBe(2);
    expect(
      db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='impact_assessments'")[0]?.values,
    ).toHaveLength(1);

    // Persist → reopen → schema, rows, and metadata stay consistent.
    const reopened = new SQL.Database(bytes);
    expect(Number(reopened.exec('PRAGMA user_version')[0]?.values?.[0]?.[0])).toBe(2);
    expect(reopened.exec('SELECT COUNT(*) FROM _vestara_migrations')[0]?.values?.[0]?.[0]).toBe(2);
    expect(reopened.exec('SELECT title FROM plans WHERE id = ?', ['p1'])[0]?.values?.[0]?.[0]).toBe('Legacy');
    expect(
      reopened.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='impact_assessments'")[0]?.values,
    ).toHaveLength(1);

    // A second migrate on the reopened DB is a no-op (idempotent, no re-adoption).
    const second = migrate(reopened, WORKSPACE_DOMAIN_MANIFEST);
    expect(second.applied).toEqual([]);
    expect(second.adopted).toBeUndefined();
  });

  it('multi-step legacy adoption: a DB that genuinely satisfies later steps IS adopted at the higher contiguous version', () => {
    const db = freshDb();
    WORKSPACE_DOMAIN_MIGRATIONS[0].up(db, { addColumnIfMissing: () => undefined });
    WORKSPACE_DOMAIN_MIGRATIONS[1].up(db, { addColumnIfMissing: () => undefined });
    const result = migrate(db, WORKSPACE_DOMAIN_MANIFEST);
    expect(result.adopted).toBe(2);
    expect(result.to).toBe(2);
    expect(result.applied).toEqual([]);
  });
});
