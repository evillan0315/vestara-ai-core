/**
 * CI-OBS-002B — Durable CI observation schema.
 *
 * Schema DDL lives here (registered migration module) and is applied by the
 * shared `@vestara/sqlite-migrations` runner against the host's existing
 * sql.js database — no separate CI storage system is introduced.
 *
 * Invariants:
 *   - `ci_correlations.correlation_id` is the deterministic push/task identity
 *     (primary key) so re-registration is idempotent.
 *   - `ci_task_waits.correlation_id` is the primary key and `resumed_at` is the
 *     single-resume marker, so webhook retries / restart cannot double-resume.
 */

import type { MigrationManifest } from '@vestara/sqlite-migrations';

export const CI_OBSERVER_MIGRATIONS: MigrationManifest = {
  file: 'ci-observer',
  steps: [
    {
      name: 'ci_observer.correlations',
      produces: [
        {
          table: 'ci_correlations',
          columns: [
            'correlation_id',
            'repository',
            'commit_sha',
            'branch',
            'workflow_name',
            'workflow_run_id',
            'originating_workflow_run_id',
            'originating_task_id',
            'originating_operation_id',
            'created_at',
          ],
        },
      ],
      up: (db) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS ci_correlations (
            correlation_id TEXT PRIMARY KEY,
            repository TEXT NOT NULL,
            commit_sha TEXT NOT NULL,
            branch TEXT NOT NULL,
            workflow_name TEXT,
            workflow_run_id TEXT,
            originating_workflow_run_id TEXT NOT NULL,
            originating_task_id TEXT NOT NULL,
            originating_operation_id TEXT NOT NULL,
            created_at TEXT NOT NULL
          )
        `);
        db.run('CREATE INDEX IF NOT EXISTS idx_ci_correlations_commit ON ci_correlations(repository, commit_sha)');
        db.run('CREATE INDEX IF NOT EXISTS idx_ci_correlations_run ON ci_correlations(workflow_run_id)');
      },
    },
    {
      name: 'ci_observer.task_waits',
      produces: [
        {
          table: 'ci_task_waits',
          columns: [
            'correlation_id',
            'task_id',
            'reason',
            'from_status',
            'status',
            'suspended_at',
            'decision_ref',
            'resumed_at',
          ],
        },
      ],
      up: (db) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS ci_task_waits (
            correlation_id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            from_status TEXT NOT NULL,
            status TEXT NOT NULL,
            suspended_at TEXT NOT NULL,
            decision_ref TEXT,
            resumed_at TEXT
          )
        `);
        db.run('CREATE INDEX IF NOT EXISTS idx_ci_task_waits_task ON ci_task_waits(task_id)');
      },
    },
  ],
};
