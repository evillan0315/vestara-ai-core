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
    {
      name: 'ci_observer.observations',
      produces: [
        {
          table: 'ci_observations',
          columns: [
            'observation_id',
            'run_id',
            'commit_sha',
            'status',
            'conclusion',
            'passed_checks',
            'failed_checks',
            'skipped_checks',
            'trigger',
            'observed_at',
          ],
        },
      ],
      up: (db) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS ci_observations (
            observation_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            commit_sha TEXT NOT NULL,
            status TEXT NOT NULL,
            conclusion TEXT NOT NULL,
            passed_checks INTEGER NOT NULL DEFAULT 0,
            failed_checks INTEGER NOT NULL DEFAULT 0,
            skipped_checks INTEGER NOT NULL DEFAULT 0,
            trigger TEXT NOT NULL,
            observed_at TEXT NOT NULL
          )
        `);
        db.run('CREATE INDEX IF NOT EXISTS idx_ci_observations_commit ON ci_observations(commit_sha)');
      },
    },
    {
      name: 'ci_observer.decisions',
      produces: [
        {
          table: 'ci_decisions',
          columns: [
            'decision_id',
            'observation_id',
            'correlation_id',
            'classification',
            'verdict',
            'action',
            'confidence',
            'decision_ref',
            'decided_at',
          ],
        },
      ],
      up: (db) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS ci_decisions (
            decision_id TEXT PRIMARY KEY,
            observation_id TEXT NOT NULL,
            correlation_id TEXT,
            classification TEXT NOT NULL,
            verdict TEXT NOT NULL,
            action TEXT NOT NULL,
            confidence TEXT NOT NULL,
            decision_ref TEXT,
            decided_at TEXT NOT NULL
          )
        `);
        db.run('CREATE INDEX IF NOT EXISTS idx_ci_decisions_observation ON ci_decisions(observation_id)');
      },
    },
    {
      name: 'ci_observer.findings',
      produces: [
        {
          table: 'ci_findings',
          columns: ['finding_id', 'classification', 'verdict', 'scope_key', 'summary', 'recorded_at'],
        },
      ],
      up: (db) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS ci_findings (
            finding_id TEXT PRIMARY KEY,
            classification TEXT NOT NULL,
            verdict TEXT NOT NULL,
            scope_key TEXT NOT NULL,
            summary TEXT NOT NULL,
            recorded_at TEXT NOT NULL
          )
        `);
        db.run('CREATE INDEX IF NOT EXISTS idx_ci_findings_classification ON ci_findings(classification)');
      },
    },
    {
      name: 'ci_observer.webhook_deliveries',
      produces: [
        {
          table: 'ci_webhook_deliveries',
          columns: ['delivery_id', 'kind', 'accepted', 'reason', 'received_at'],
        },
      ],
      up: (db) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS ci_webhook_deliveries (
            delivery_id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            accepted INTEGER NOT NULL,
            reason TEXT,
            received_at TEXT NOT NULL
          )
        `);
        db.run('CREATE INDEX IF NOT EXISTS idx_ci_webhook_deliveries_received ON ci_webhook_deliveries(received_at)');
      },
    },
    {
      name: 'ci_observer.notifications',
      produces: [
        {
          table: 'ci_notifications',
          columns: [
            'notification_id',
            'kind',
            'severity',
            'title',
            'body',
            'observation_id',
            'commit_sha',
            'correlation_id',
            'task_id',
            'at',
          ],
        },
      ],
      up: (db) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS ci_notifications (
            notification_id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            severity TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            observation_id TEXT NOT NULL,
            commit_sha TEXT NOT NULL,
            correlation_id TEXT,
            task_id TEXT,
            at TEXT NOT NULL
          )
        `);
        db.run('CREATE INDEX IF NOT EXISTS idx_ci_notifications_at ON ci_notifications(at)');
      },
    },
    {
      name: 'ci_observer.notifications.delivery',
      produces: [{ table: 'ci_notifications', columns: ['delivered_at'] }],
      up: (db, ctx) => {
        ctx.addColumnIfMissing(db, 'ci_notifications', 'delivered_at', 'TEXT');
      },
    },
    {
      name: 'ci_observer.governed_pushes',
      produces: [
        {
          table: 'ci_governed_pushes',
          columns: [
            'push_id',
            'task_id',
            'repository',
            'commit_sha',
            'branch',
            'wait_ref',
            'operation_id',
            'pushed_at',
          ],
        },
      ],
      up: (db) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS ci_governed_pushes (
            push_id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            repository TEXT NOT NULL,
            commit_sha TEXT NOT NULL,
            branch TEXT NOT NULL,
            wait_ref TEXT NOT NULL,
            operation_id TEXT,
            pushed_at TEXT NOT NULL
          )
        `);
        db.run('CREATE INDEX IF NOT EXISTS idx_ci_governed_pushes_task ON ci_governed_pushes(task_id)');
      },
    },
  ],
};
