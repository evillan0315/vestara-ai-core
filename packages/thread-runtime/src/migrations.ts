import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/**
 * Versioned evolution of the agent-harness thread database file
 * (`threads/agent-harness.db`). All tables stable; future changes must be
 * added as migrations.
 */

const BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS task_threads (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_turns (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        state TEXT NOT NULL,
        input TEXT NOT NULL,
        outcome_json TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE(thread_id, sequence),
        FOREIGN KEY(thread_id) REFERENCES task_threads(id)
      );
      CREATE TABLE IF NOT EXISTS thread_items (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        kind TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        causation_id TEXT,
        UNIQUE(thread_id, sequence),
        FOREIGN KEY(thread_id) REFERENCES task_threads(id),
        FOREIGN KEY(turn_id) REFERENCES agent_turns(id)
      );
      CREATE INDEX IF NOT EXISTS idx_turns_thread ON agent_turns(thread_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_items_thread ON thread_items(thread_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_items_turn ON thread_items(turn_id, sequence);
      CREATE TABLE IF NOT EXISTS thread_checkpoints (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(thread_id) REFERENCES task_threads(id),
        FOREIGN KEY(turn_id) REFERENCES agent_turns(id)
      );
    `;

export const THREAD_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'threads.baseline',
    produces: [
      fingerprint('task_threads', [
        'id',
        'task_id',
        'title',
        'status',
        'environment_id',
        'created_at',
        'updated_at',
        'metadata_json',
      ]),
      fingerprint('agent_turns', [
        'id',
        'thread_id',
        'sequence',
        'state',
        'input',
        'outcome_json',
        'started_at',
        'completed_at',
      ]),
      fingerprint('thread_items', [
        'id',
        'thread_id',
        'turn_id',
        'sequence',
        'kind',
        'actor_id',
        'payload_json',
        'created_at',
        'correlation_id',
        'causation_id',
      ]),
      fingerprint('thread_checkpoints', ['id', 'thread_id', 'turn_id', 'reason', 'snapshot_json', 'created_at']),
    ],
    up: (db: Database) => {
      db.run(BASELINE_DDL);
    },
  },
];

export const THREAD_MANIFEST: MigrationManifest = buildManifest('agent-harness-threads', [THREAD_MIGRATIONS]);
