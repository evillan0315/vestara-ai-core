/**
 * ProjectStore — sql.js persistence for orchestrator project state.
 */

import type { Database } from 'sql.js';
import { dbAll, dbGet, dbRun, now, str } from '../db';
import { generateId } from '../ids';
import type { OrchestratedProject, ProjectPhase } from '../types';

export interface CreateProjectInput {
  readonly name: string;
  readonly goal: string;
  readonly repoPath: string;
  readonly workspaceId: string;
}

export class ProjectStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.exec(`
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
    `);
  }

  async create(input: CreateProjectInput): Promise<OrchestratedProject> {
    const id = generateId('project');
    const project: OrchestratedProject = {
      id,
      name: input.name,
      goal: input.goal,
      repoPath: input.repoPath,
      phase: 'draft',
      workspaceId: input.workspaceId,
      createdAt: now(),
      updatedAt: now(),
    };
    dbRun(
      this.db,
      `INSERT INTO orchestrated_projects (id, name, goal, repo_path, phase, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project.id,
        project.name,
        project.goal,
        project.repoPath,
        project.phase,
        project.workspaceId,
        project.createdAt,
        project.updatedAt,
      ],
    );
    return project;
  }

  async get(id: string): Promise<OrchestratedProject | null> {
    const row = dbGet(this.db, 'SELECT * FROM orchestrated_projects WHERE id = ?', [id]);
    return row ? this.rowToProject(row) : null;
  }

  async list(workspaceId: string): Promise<OrchestratedProject[]> {
    const rows = dbAll(this.db, 'SELECT * FROM orchestrated_projects WHERE workspace_id = ? ORDER BY created_at ASC', [
      workspaceId,
    ]);
    return rows.map((row) => this.rowToProject(row));
  }

  async updatePhase(id: string, phase: ProjectPhase): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_projects SET phase = ?, updated_at = ? WHERE id = ?', [phase, now(), id]);
  }

  async cancel(id: string, reason: string): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_projects SET phase = ?, cancel_reason = ?, updated_at = ? WHERE id = ?', [
      'cancelled',
      reason,
      now(),
      id,
    ]);
  }

  async archive(id: string): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_projects SET phase = ?, updated_at = ? WHERE id = ?', ['archived', now(), id]);
  }

  private rowToProject(row: Record<string, unknown>): OrchestratedProject {
    return {
      id: str(row.id),
      name: str(row.name),
      goal: str(row.goal),
      repoPath: str(row.repo_path),
      phase: str(row.phase) as ProjectPhase,
      workspaceId: str(row.workspace_id),
      cancelReason: row.cancel_reason ? str(row.cancel_reason) : undefined,
      createdAt: str(row.created_at),
      updatedAt: str(row.updated_at),
    };
  }
}
