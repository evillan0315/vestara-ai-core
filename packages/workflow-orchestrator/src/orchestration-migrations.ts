import {
  buildManifest,
  fingerprint,
  type MigrationContext,
  type MigrationManifest,
  type MigrationStep,
} from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/**
 * Versioned evolution of the workflow-orchestrator domain tables in the shared
 * `plans.db` (migration inventory, Track 3). v1 is the original orchestration
 * schema; v2/v3 cover the two columns added after the original.
 */

const BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS orchestrated_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        goal TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        phase TEXT NOT NULL DEFAULT 'draft',
        workspace_id TEXT NOT NULL,
        cancel_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_op_workspace ON orchestrated_projects(workspace_id);
      CREATE TABLE IF NOT EXISTS orchestrated_plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        approval_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oplan_project ON orchestrated_plans(project_id);
      CREATE TABLE IF NOT EXISTS orchestrated_tasks (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        files TEXT NOT NULL DEFAULT '[]',
        dependencies TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        effort TEXT NOT NULL DEFAULT 'medium',
        required_capabilities TEXT NOT NULL DEFAULT '[]',
        assigned_agent_id TEXT,
        revision_count INTEGER NOT NULL DEFAULT 0,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_otask_plan ON orchestrated_tasks(plan_id);
      CREATE INDEX IF NOT EXISTS idx_otask_status ON orchestrated_tasks(status);
      CREATE TABLE IF NOT EXISTS orchestrated_artifacts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        project_id TEXT NOT NULL,
        plan_id TEXT,
        task_id TEXT,
        agent_id TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oartifact_project ON orchestrated_artifacts(project_id, kind);
      CREATE TABLE IF NOT EXISTS orchestrated_file_locks (
        path TEXT PRIMARY KEY,
        holder_agent_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        released_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ofl_task ON orchestrated_file_locks(task_id);
      CREATE TABLE IF NOT EXISTS orchestrated_parent_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        goal TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_opp_workspace ON orchestrated_parent_projects(workspace_id);
      CREATE TABLE IF NOT EXISTS orchestrated_parent_children (
        parent_id TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        child_project_id TEXT NOT NULL,
        PRIMARY KEY (parent_id, repo_path)
      );
      CREATE TABLE IF NOT EXISTS orchestrated_worker_nodes (
        id TEXT PRIMARY KEY,
        hostname TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unknown',
        executors TEXT NOT NULL DEFAULT '[]',
        capabilities TEXT NOT NULL DEFAULT '[]',
        load REAL NOT NULL DEFAULT 0,
        last_heartbeat_at TEXT,
        registered_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS orchestrated_task_leases (
        lease_id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        task TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_otl_node ON orchestrated_task_leases(node_id);
    `;

const PROJECT_COLUMNS = [
  'id',
  'name',
  'goal',
  'repo_path',
  'phase',
  'workspace_id',
  'cancel_reason',
  'created_at',
  'updated_at',
];

const TASK_COLUMNS = [
  'id',
  'plan_id',
  'summary',
  'description',
  'files',
  'dependencies',
  'status',
  'effort',
  'required_capabilities',
  'assigned_agent_id',
  'revision_count',
  'attempt_count',
  'last_error',
  'started_at',
  'completed_at',
  'created_at',
  'updated_at',
];

export const ORCHESTRATION_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'orchestration.baseline',
    produces: [
      fingerprint('orchestrated_projects', PROJECT_COLUMNS),
      fingerprint('orchestrated_plans', [
        'id',
        'project_id',
        'title',
        'goal',
        'revision',
        'status',
        'approval_id',
        'created_at',
        'updated_at',
      ]),
      fingerprint('orchestrated_tasks', TASK_COLUMNS),
      fingerprint('orchestrated_artifacts', [
        'id',
        'kind',
        'project_id',
        'plan_id',
        'task_id',
        'agent_id',
        'body',
        'version',
        'created_at',
      ]),
      fingerprint('orchestrated_file_locks', ['path', 'holder_agent_id', 'task_id', 'acquired_at', 'released_at']),
      fingerprint('orchestrated_parent_projects', [
        'id',
        'name',
        'goal',
        'repo_path',
        'workspace_id',
        'status',
        'created_at',
        'updated_at',
      ]),
      fingerprint('orchestrated_parent_children', ['parent_id', 'repo_path', 'child_project_id']),
      fingerprint('orchestrated_worker_nodes', [
        'id',
        'hostname',
        'status',
        'executors',
        'capabilities',
        'load',
        'last_heartbeat_at',
        'registered_at',
      ]),
      fingerprint('orchestrated_task_leases', ['lease_id', 'execution_id', 'node_id', 'task', 'expires_at']),
    ],
    up: (db: Database) => {
      db.exec(BASELINE_DDL);
    },
  },
  {
    name: 'orchestration.projects.verification_reopens',
    produces: [fingerprint('orchestrated_projects', ['verification_reopens'])],
    up: (db: Database, ctx: MigrationContext) => {
      ctx.addColumnIfMissing(db, 'orchestrated_projects', 'verification_reopens', 'INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    name: 'orchestration.tasks.approval_reason',
    produces: [fingerprint('orchestrated_tasks', ['approval_reason'])],
    up: (db: Database, ctx: MigrationContext) => {
      ctx.addColumnIfMissing(db, 'orchestrated_tasks', 'approval_reason', 'TEXT');
    },
  },
];

/** Standalone orchestration-domain manifest (for direct-construction tests). */
export const ORCHESTRATION_MANIFEST: MigrationManifest = buildManifest('orchestration', [ORCHESTRATION_MIGRATIONS]);
