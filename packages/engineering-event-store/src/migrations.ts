import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/**
 * Versioned evolution of the engineering-events database file
 * (`events/engineering-events.db`). Single stable table; future changes must be
 * added as migrations.
 */

const BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS engineering_events (
        seq INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        at TEXT NOT NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        authority TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        environment_id TEXT,
        task_id TEXT,
        thread_id TEXT,
        turn_id TEXT,
        tool_call_id TEXT,
        verification_run_id TEXT,
        correlation_id TEXT NOT NULL,
        causation_id TEXT,
        payload_json TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_truth_task ON engineering_events(task_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_thread ON engineering_events(thread_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_turn ON engineering_events(turn_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_tool ON engineering_events(tool_call_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_verification ON engineering_events(verification_run_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_correlation ON engineering_events(correlation_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_causation ON engineering_events(causation_id, seq);
    `;

export const ENGINEERING_EVENT_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'engineering_events.baseline',
    produces: [
      fingerprint('engineering_events', [
        'seq',
        'id',
        'at',
        'type',
        'source',
        'actor_id',
        'authority',
        'workspace_id',
        'environment_id',
        'task_id',
        'thread_id',
        'turn_id',
        'tool_call_id',
        'verification_run_id',
        'correlation_id',
        'causation_id',
        'payload_json',
        'previous_hash',
        'hash',
      ]),
    ],
    up: (db: Database) => {
      db.run(BASELINE_DDL);
    },
  },
  // ─── ARX-015 M1: Canonical Identity & Lineage ──────────────
  // Adds trace_id and workflow_run_id columns for distributed trace
  // and workflow run lineage. Additive only; no data loss.
  {
    name: 'engineering_events.arx015-canonical-identity',
    produces: [
      fingerprint('engineering_events', [
        'seq',
        'id',
        'at',
        'type',
        'source',
        'actor_id',
        'authority',
        'workspace_id',
        'environment_id',
        'task_id',
        'thread_id',
        'turn_id',
        'tool_call_id',
        'verification_run_id',
        'correlation_id',
        'causation_id',
        'payload_json',
        'previous_hash',
        'hash',
        'trace_id',
        'workflow_run_id',
      ]),
    ],
    up: (db: Database) => {
      db.run(`ALTER TABLE engineering_events ADD COLUMN trace_id TEXT;`);
      db.run(`ALTER TABLE engineering_events ADD COLUMN workflow_run_id TEXT;`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_truth_trace ON engineering_events(trace_id, seq);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_truth_workflow_run ON engineering_events(workflow_run_id, seq);`);
    },
  },
  // ─── ARX-015 M2: Canonical Event Contract ───────────────────
  // Adds execution_id and request_id columns for canonical event header.
  // execution_id: canonical execution identity (source of truth for correlationId)
  // request_id: transport/request identity (single HTTP/WS request lifecycle)
  // Additive only; no data loss. Existing rows get NULL.
  {
    name: 'engineering_events.arx015-canonical-event-contract',
    produces: [
      fingerprint('engineering_events', [
        'seq',
        'id',
        'at',
        'type',
        'source',
        'actor_id',
        'authority',
        'workspace_id',
        'environment_id',
        'task_id',
        'thread_id',
        'turn_id',
        'tool_call_id',
        'verification_run_id',
        'correlation_id',
        'causation_id',
        'payload_json',
        'previous_hash',
        'hash',
        'trace_id',
        'workflow_run_id',
        'execution_id',
        'request_id',
      ]),
    ],
    up: (db: Database) => {
      db.run(`ALTER TABLE engineering_events ADD COLUMN execution_id TEXT;`);
      db.run(`ALTER TABLE engineering_events ADD COLUMN request_id TEXT;`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_truth_execution ON engineering_events(execution_id, seq);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_truth_request ON engineering_events(request_id, seq);`);
    },
  },
];

export const ENGINEERING_EVENT_MANIFEST: MigrationManifest = buildManifest('engineering-events', [
  ENGINEERING_EVENT_MIGRATIONS,
]);
