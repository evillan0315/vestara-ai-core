/**
 * ParentProjectStore — sql.js persistence for multi-repo parent orchestration
 * (PCS-025 §16: one orchestrator per repo; a parent project aggregates the
 * per-repo sub-projects).
 */

import type { Database } from 'sql.js';
import { dbAll, dbGet, dbRun, now, str } from '../db';
import { generateId } from '../ids';

export type ParentProjectStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface ParentProject {
  readonly id: string;
  readonly name: string;
  readonly goal: string;
  readonly repoPath: string;
  readonly workspaceId: string;
  readonly status: ParentProjectStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ParentProjectChild {
  readonly parentId: string;
  readonly repoPath: string;
  readonly childProjectId: string;
}

export class ParentProjectStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.exec(`
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
    `);
  }

  async createParent(input: {
    readonly name: string;
    readonly goal: string;
    readonly repoPath: string;
    readonly workspaceId: string;
  }): Promise<ParentProject> {
    const parent: ParentProject = {
      id: generateId('parent'),
      name: input.name,
      goal: input.goal,
      repoPath: input.repoPath,
      workspaceId: input.workspaceId,
      status: 'running',
      createdAt: now(),
      updatedAt: now(),
    };
    dbRun(
      this.db,
      `INSERT INTO orchestrated_parent_projects (id, name, goal, repo_path, workspace_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parent.id,
        parent.name,
        parent.goal,
        parent.repoPath,
        parent.workspaceId,
        parent.status,
        parent.createdAt,
        parent.updatedAt,
      ],
    );
    return parent;
  }

  async getParent(id: string): Promise<ParentProject | null> {
    const row = dbGet(this.db, 'SELECT * FROM orchestrated_parent_projects WHERE id = ?', [id]);
    return row ? this.rowToParent(row) : null;
  }

  async listParents(workspaceId: string): Promise<ParentProject[]> {
    const rows = dbAll(
      this.db,
      'SELECT * FROM orchestrated_parent_projects WHERE workspace_id = ? ORDER BY created_at ASC',
      [workspaceId],
    );
    return rows.map((row) => this.rowToParent(row));
  }

  async updateStatus(id: string, status: ParentProjectStatus): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_parent_projects SET status = ?, updated_at = ? WHERE id = ?', [
      status,
      now(),
      id,
    ]);
  }

  async linkChild(input: { parentId: string; repoPath: string; childProjectId: string }): Promise<void> {
    dbRun(
      this.db,
      'INSERT OR REPLACE INTO orchestrated_parent_children (parent_id, repo_path, child_project_id) VALUES (?, ?, ?)',
      [input.parentId, input.repoPath, input.childProjectId],
    );
  }

  async listChildren(parentId: string): Promise<ParentProjectChild[]> {
    const rows = dbAll(
      this.db,
      'SELECT * FROM orchestrated_parent_children WHERE parent_id = ? ORDER BY repo_path ASC',
      [parentId],
    );
    return rows.map((row) => ({
      parentId: str(row.parent_id),
      repoPath: str(row.repo_path),
      childProjectId: str(row.child_project_id),
    }));
  }

  private rowToParent(row: Record<string, unknown>): ParentProject {
    return {
      id: str(row.id),
      name: str(row.name),
      goal: str(row.goal),
      repoPath: str(row.repo_path),
      workspaceId: str(row.workspace_id),
      status: str(row.status) as ParentProjectStatus,
      createdAt: str(row.created_at),
      updatedAt: str(row.updated_at),
    };
  }
}
