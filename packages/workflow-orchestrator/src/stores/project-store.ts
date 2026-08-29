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
    // Schema is owned by the migration chain (orchestration-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
    this.db = db;
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
      verificationReopens: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    dbRun(
      this.db,
      `INSERT INTO orchestrated_projects (id, name, goal, repo_path, phase, workspace_id, verification_reopens, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project.id,
        project.name,
        project.goal,
        project.repoPath,
        project.phase,
        project.workspaceId,
        project.verificationReopens,
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

  /** Increment the verification auto-reopen counter (PCS-025 §11). */
  async incrementVerificationReopens(id: string): Promise<number> {
    dbRun(
      this.db,
      'UPDATE orchestrated_projects SET verification_reopens = verification_reopens + 1, updated_at = ? WHERE id = ?',
      [now(), id],
    );
    const row = dbGet(this.db, 'SELECT verification_reopens FROM orchestrated_projects WHERE id = ?', [id]);
    return Number(row?.verification_reopens ?? 0);
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
      verificationReopens: Number(row.verification_reopens ?? 0),
      createdAt: str(row.created_at),
      updatedAt: str(row.updated_at),
    };
  }
}
