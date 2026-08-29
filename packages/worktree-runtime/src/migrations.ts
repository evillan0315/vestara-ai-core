import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/**
 * Versioned evolution of the worktree leases database file
 * (`worktrees/leases.db`). All tables stable; future changes must be added as
 * migrations.
 */

const BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS workspace_leases (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, repository_root TEXT NOT NULL,
        worktree_path TEXT NOT NULL UNIQUE, branch_name TEXT NOT NULL, base_revision TEXT NOT NULL,
        status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, released_at TEXT
      );
      CREATE TABLE IF NOT EXISTS file_leases (
        lease_id TEXT NOT NULL, repository_root TEXT NOT NULL, file_path TEXT NOT NULL, claimed_at TEXT NOT NULL,
        PRIMARY KEY (lease_id, file_path), FOREIGN KEY(lease_id) REFERENCES workspace_leases(id)
      );
      CREATE INDEX IF NOT EXISTS idx_workspace_leases_task ON workspace_leases(task_id, status);
      CREATE INDEX IF NOT EXISTS idx_workspace_leases_agent ON workspace_leases(agent_id, status);
      CREATE INDEX IF NOT EXISTS idx_file_leases_owner ON file_leases(repository_root, file_path);
    `;

export const WORKTREE_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'worktrees.baseline',
    produces: [
      fingerprint('workspace_leases', [
        'id',
        'task_id',
        'agent_id',
        'repository_root',
        'worktree_path',
        'branch_name',
        'base_revision',
        'status',
        'created_at',
        'updated_at',
        'released_at',
      ]),
      fingerprint('file_leases', ['lease_id', 'repository_root', 'file_path', 'claimed_at']),
    ],
    up: (db: Database) => {
      db.exec(BASELINE_DDL);
    },
  },
];

export const WORKTREE_MANIFEST: MigrationManifest = buildManifest('worktree-leases', [WORKTREE_MIGRATIONS]);
