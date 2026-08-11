import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/**
 * Versioned evolution of the dormant feature-scaffold schemas in
 * `@vestara/workspace`. These classes are not yet wired into a production
 * composition root (0 construction/injection sites); each manifest is ready to
 * be executed by the root that eventually wires the feature. All tables
 * stable; future changes must be added as migrations.
 */

const CLOUD_BASELINE_DDL = `
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
    `;

const ENTERPRISE_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY, name TEXT, description TEXT,
        members TEXT DEFAULT '[]', role TEXT DEFAULT 'engineer', created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS enterprise_projects (
        id TEXT PRIMARY KEY, name TEXT, goal TEXT,
        repositories TEXT DEFAULT '[]', status TEXT DEFAULT 'active', created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS approval_policies (
        id TEXT PRIMARY KEY, name TEXT, artifact_type TEXT,
        required_approvers INTEGER DEFAULT 1, roles TEXT DEFAULT '[]', created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY, actor TEXT, action TEXT,
        resource TEXT, details TEXT, timestamp TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(timestamp);
    `;

const ORGANIZATION_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        repositories TEXT DEFAULT '[]',
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS organization_relations (
        id TEXT PRIMARY KEY,
        source_repo TEXT,
        target_repo TEXT,
        type TEXT,
        description TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_orgrel_source ON organization_relations(source_repo);
    `;

const ACCURACY_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS prediction_accuracy (
        id TEXT PRIMARY KEY,
        assessment_id TEXT,
        change_set_id TEXT,
        verification_id TEXT,
        predicted_health_delta REAL,
        actual_health_delta REAL,
        error REAL,
        absolute_error REAL,
        recorded_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pa_assessment ON prediction_accuracy(assessment_id);
    `;

const DECISION_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY, workspace_id TEXT, plan_id TEXT, assessment_id TEXT,
        created_at TEXT, recommendation TEXT, alternatives TEXT DEFAULT '[]',
        rationale TEXT, confidence REAL, accepted INTEGER DEFAULT 0,
        accepted_by TEXT, accepted_at TEXT, model_version TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_dec_ws ON decisions(workspace_id);
    `;

const SUGGESTION_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS dismissed_suggestions (
        id TEXT PRIMARY KEY,
        dismissed_at TEXT NOT NULL,
        reason TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS suggestion_feedback (
        id TEXT PRIMARY KEY,
        suggestion_id TEXT,
        action TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `;

const ANALYTICS_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS health_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        overall REAL,
        code_quality REAL,
        test_coverage REAL,
        dependency_health REAL,
        documentation REAL
      );
    `;

const PLUGIN_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        name TEXT, version TEXT, publisher TEXT,
        description TEXT,
        permissions TEXT DEFAULT '[]',
        hooks TEXT DEFAULT '[]',
        status TEXT DEFAULT 'active',
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS plugin_executions (
        id TEXT PRIMARY KEY,
        plugin_id TEXT,
        hook TEXT,
        status TEXT,
        duration INTEGER,
        message TEXT,
        timestamp TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pe_plugin ON plugin_executions(plugin_id);
    `;

const CLOUD_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'cloud.baseline',
    produces: [
      fingerprint('cloud_jobs', [
        'id',
        'type',
        'target',
        'status',
        'worker_type',
        'submitted_at',
        'completed_at',
        'result',
      ]),
      fingerprint('cloud_workers', ['id', 'name', 'type', 'status', 'current_job', 'resources']),
    ],
    up: (db: Database) => {
      db.exec(CLOUD_BASELINE_DDL);
    },
  },
];

const ENTERPRISE_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'enterprise.baseline',
    produces: [
      fingerprint('teams', ['id', 'name', 'description', 'members', 'role', 'created_at']),
      fingerprint('enterprise_projects', ['id', 'name', 'goal', 'repositories', 'status', 'created_at']),
      fingerprint('approval_policies', ['id', 'name', 'artifact_type', 'required_approvers', 'roles', 'created_at']),
      fingerprint('audit_events', ['id', 'actor', 'action', 'resource', 'details', 'timestamp']),
    ],
    up: (db: Database) => {
      db.exec(ENTERPRISE_BASELINE_DDL);
    },
  },
];

const ORGANIZATION_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'organization.baseline',
    produces: [
      fingerprint('organizations', ['id', 'name', 'description', 'repositories', 'created_at', 'updated_at']),
      fingerprint('organization_relations', ['id', 'source_repo', 'target_repo', 'type', 'description', 'created_at']),
    ],
    up: (db: Database) => {
      db.exec(ORGANIZATION_BASELINE_DDL);
    },
  },
];

const ACCURACY_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'accuracy.baseline',
    produces: [
      fingerprint('prediction_accuracy', [
        'id',
        'assessment_id',
        'change_set_id',
        'verification_id',
        'predicted_health_delta',
        'actual_health_delta',
        'error',
        'absolute_error',
        'recorded_at',
      ]),
    ],
    up: (db: Database) => {
      db.exec(ACCURACY_BASELINE_DDL);
    },
  },
];

const DECISION_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'decision.baseline',
    produces: [
      fingerprint('decisions', [
        'id',
        'workspace_id',
        'plan_id',
        'assessment_id',
        'created_at',
        'recommendation',
        'alternatives',
        'rationale',
        'confidence',
        'accepted',
        'accepted_by',
        'accepted_at',
        'model_version',
      ]),
    ],
    up: (db: Database) => {
      db.exec(DECISION_BASELINE_DDL);
    },
  },
];

const SUGGESTION_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'suggestion.baseline',
    produces: [
      fingerprint('dismissed_suggestions', ['id', 'dismissed_at', 'reason']),
      fingerprint('suggestion_feedback', ['id', 'suggestion_id', 'action', 'created_at']),
    ],
    up: (db: Database) => {
      db.exec(SUGGESTION_BASELINE_DDL);
    },
  },
];

const ANALYTICS_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'analytics.baseline',
    produces: [
      fingerprint('health_snapshots', [
        'id',
        'timestamp',
        'overall',
        'code_quality',
        'test_coverage',
        'dependency_health',
        'documentation',
      ]),
    ],
    up: (db: Database) => {
      db.exec(ANALYTICS_BASELINE_DDL);
    },
  },
];

const PLUGIN_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'plugin.baseline',
    produces: [
      fingerprint('plugins', [
        'id',
        'name',
        'version',
        'publisher',
        'description',
        'permissions',
        'hooks',
        'status',
        'created_at',
      ]),
      fingerprint('plugin_executions', ['id', 'plugin_id', 'hook', 'status', 'duration', 'message', 'timestamp']),
    ],
    up: (db: Database) => {
      db.exec(PLUGIN_BASELINE_DDL);
    },
  },
];

export const CLOUD_MANIFEST: MigrationManifest = buildManifest('scaffolds-cloud', [CLOUD_MIGRATIONS]);
export const ENTERPRISE_MANIFEST: MigrationManifest = buildManifest('scaffolds-enterprise', [ENTERPRISE_MIGRATIONS]);
export const ORGANIZATION_MANIFEST: MigrationManifest = buildManifest('scaffolds-organization', [
  ORGANIZATION_MIGRATIONS,
]);
export const ACCURACY_MANIFEST: MigrationManifest = buildManifest('scaffolds-accuracy', [ACCURACY_MIGRATIONS]);
export const DECISION_MANIFEST: MigrationManifest = buildManifest('scaffolds-decision', [DECISION_MIGRATIONS]);
export const SUGGESTION_MANIFEST: MigrationManifest = buildManifest('scaffolds-suggestion', [SUGGESTION_MIGRATIONS]);
export const ANALYTICS_MANIFEST: MigrationManifest = buildManifest('scaffolds-analytics', [ANALYTICS_MIGRATIONS]);
export const PLUGIN_MANIFEST: MigrationManifest = buildManifest('scaffolds-plugin', [PLUGIN_MIGRATIONS]);
