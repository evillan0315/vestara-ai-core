import {
  buildManifest,
  fingerprint,
  type MigrationContext,
  type MigrationManifest,
  type MigrationStep,
} from '@vestara/sqlite-migrations';
import { ORCHESTRATION_MIGRATIONS } from '@vestara/workflow-orchestrator';
import type { Database } from 'sql.js';
import { WORKSPACE_DOMAIN_MIGRATIONS } from './workspace-migrations';

/**
 * Versioned evolution of the AgentStorage domain tables (incident #0001).
 *
 * v1 — the frozen original schema (agents, agent_executions, agent_teams,
 *      agent_schedules, agent_memory, execution_sessions).
 * v2 — add agents.agent_type (commit d838201).
 * v3 — add agents.runtime_agent (formerly an ad-hoc ALTER).
 *
 * Storage constructors no longer mutate schema; the migration chain is the
 * single authoritative evolution path.
 */

const ORIGINAL_AGENTS_COLUMNS = [
  'id',
  'name',
  'role',
  'description',
  'capabilities',
  'permissions',
  'provider',
  'model',
  'team_id',
  'color',
  'status',
  'created_at',
];

const ORIGINAL_AGENT_EXECUTIONS_COLUMNS = [
  'id',
  'agent_id',
  'task',
  'input_artifacts',
  'output_artifacts',
  'status',
  'started_at',
  'completed_at',
  'result',
];

const ORIGINAL_AGENT_TEAMS_COLUMNS = [
  'id',
  'name',
  'description',
  'leader_agent_id',
  'member_ids',
  'shared_context',
  'active_workflow_id',
  'created_at',
];

const ORIGINAL_AGENT_SCHEDULES_COLUMNS = [
  'id',
  'agent_id',
  'task',
  'frequency',
  'cron_expression',
  'next_run_at',
  'last_run_at',
  'last_status',
  'enabled',
  'created_at',
];

const ORIGINAL_AGENT_MEMORY_COLUMNS = [
  'id',
  'agent_id',
  'type',
  'summary',
  'detail',
  'tags',
  'confidence',
  'created_at',
];

const ORIGINAL_EXECUTION_SESSIONS_COLUMNS = [
  'id',
  'goal',
  'workflow_id',
  'assigned_agent_ids',
  'plan_ids',
  'change_set_ids',
  'verification_ids',
  'logs',
  'timeline',
  'approvals',
  'metrics',
  'status',
  'created_at',
  'completed_at',
];

const BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT,
        role TEXT,
        description TEXT DEFAULT '',
        capabilities TEXT DEFAULT '[]',
        permissions TEXT DEFAULT '[]',
        provider TEXT DEFAULT '',
        model TEXT DEFAULT '',
        team_id TEXT DEFAULT '',
        color TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS agent_executions (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        task TEXT,
        input_artifacts TEXT DEFAULT '[]',
        output_artifacts TEXT DEFAULT '[]',
        status TEXT DEFAULT 'queued',
        started_at TEXT,
        completed_at TEXT,
        result TEXT
      );
      CREATE TABLE IF NOT EXISTS agent_teams (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT DEFAULT '',
        leader_agent_id TEXT DEFAULT '',
        member_ids TEXT DEFAULT '[]',
        shared_context TEXT DEFAULT '',
        active_workflow_id TEXT DEFAULT '',
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS agent_schedules (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        task TEXT NOT NULL,
        frequency TEXT DEFAULT 'once',
        cron_expression TEXT DEFAULT '',
        next_run_at TEXT,
        last_run_at TEXT,
        last_status TEXT DEFAULT '',
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sched_agent ON agent_schedules(agent_id);
      CREATE INDEX IF NOT EXISTS idx_sched_next ON agent_schedules(next_run_at);
      CREATE INDEX IF NOT EXISTS idx_exec_agent ON agent_executions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_exec_status ON agent_executions(status);
      CREATE TABLE IF NOT EXISTS agent_memory (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        type TEXT DEFAULT 'observation',
        summary TEXT DEFAULT '',
        detail TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        confidence REAL DEFAULT 0.5,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_agent ON agent_memory(agent_id);
      CREATE TABLE IF NOT EXISTS execution_sessions (
        id TEXT PRIMARY KEY,
        goal TEXT NOT NULL,
        workflow_id TEXT DEFAULT '',
        assigned_agent_ids TEXT DEFAULT '[]',
        plan_ids TEXT DEFAULT '[]',
        change_set_ids TEXT DEFAULT '[]',
        verification_ids TEXT DEFAULT '[]',
        logs TEXT DEFAULT '[]',
        timeline TEXT DEFAULT '[]',
        approvals TEXT DEFAULT '[]',
        metrics TEXT DEFAULT '{}',
        status TEXT DEFAULT 'queued',
        created_at TEXT,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_exs_status ON execution_sessions(status);
    `;

export const AGENT_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'agents.baseline',
    produces: [
      fingerprint('agents', ORIGINAL_AGENTS_COLUMNS),
      fingerprint('agent_executions', ORIGINAL_AGENT_EXECUTIONS_COLUMNS),
      fingerprint('agent_teams', ORIGINAL_AGENT_TEAMS_COLUMNS),
      fingerprint('agent_schedules', ORIGINAL_AGENT_SCHEDULES_COLUMNS),
      fingerprint('agent_memory', ORIGINAL_AGENT_MEMORY_COLUMNS),
      fingerprint('execution_sessions', ORIGINAL_EXECUTION_SESSIONS_COLUMNS),
    ],
    up: (db: Database) => {
      db.exec(BASELINE_DDL);
    },
  },
  {
    name: 'agents.agent_type',
    produces: [fingerprint('agents', ['agent_type'])],
    up: (db: Database, ctx: MigrationContext) => {
      ctx.addColumnIfMissing(db, 'agents', 'agent_type', "TEXT DEFAULT 'workspace'");
    },
  },
  {
    name: 'agents.runtime_agent',
    produces: [fingerprint('agents', ['runtime_agent'])],
    up: (db: Database, ctx: MigrationContext) => {
      ctx.addColumnIfMissing(db, 'agents', 'runtime_agent', "TEXT DEFAULT ''");
    },
  },
];

/** Agent-domain-only manifest (used by agent-specific tests and callers). */
export const AGENT_MANIFEST: MigrationManifest = buildManifest('plans-agents', [AGENT_MIGRATIONS]);

/**
 * The composition-owned manifest for the shared `plans.db` file: agents domain,
 * orchestration domain, then the workspace domain. Storage constructors never
 * mutate schema; each entrypoint composition root runs this chain with explicit
 * persistence.
 */
export const PLANS_MANIFEST: MigrationManifest = buildManifest('plans', [
  AGENT_MIGRATIONS,
  ORCHESTRATION_MIGRATIONS,
  WORKSPACE_DOMAIN_MIGRATIONS,
]);

export { migrate } from '@vestara/sqlite-migrations';
