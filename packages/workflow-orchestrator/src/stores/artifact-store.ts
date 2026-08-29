/**
 * ArtifactStore — versioned JSON artifacts produced and consumed by agent steps.
 */

import type { Database } from 'sql.js';
import { dbAll, dbGet, dbRun, jsonParse, now, str } from '../db';
import { generateId } from '../ids';
import type { ArtifactKind, WorkflowArtifact } from '../types';

export interface CreateArtifactInput {
  readonly kind: ArtifactKind;
  readonly projectId: string;
  readonly planId?: string;
  readonly taskId?: string;
  readonly agentId: string;
  readonly body: Readonly<Record<string, unknown>>;
}

export class ArtifactStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    // Schema is owned by the migration chain (orchestration-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
  }

  async create(input: CreateArtifactInput): Promise<WorkflowArtifact> {
    const artifact: WorkflowArtifact = {
      id: generateId('artifact'),
      kind: input.kind,
      projectId: input.projectId,
      planId: input.planId,
      taskId: input.taskId,
      agentId: input.agentId,
      body: input.body,
      version: 1,
      createdAt: now(),
    };
    dbRun(
      this.db,
      `INSERT INTO orchestrated_artifacts (id, kind, project_id, plan_id, task_id, agent_id, body, version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        artifact.id,
        artifact.kind,
        artifact.projectId,
        artifact.planId ?? null,
        artifact.taskId ?? null,
        artifact.agentId,
        JSON.stringify(artifact.body),
        artifact.version,
        artifact.createdAt,
      ],
    );
    return artifact;
  }

  async get(id: string): Promise<WorkflowArtifact | null> {
    const row = dbGet(this.db, 'SELECT * FROM orchestrated_artifacts WHERE id = ?', [id]);
    return row ? this.rowToArtifact(row) : null;
  }

  async listForProject(projectId: string): Promise<WorkflowArtifact[]> {
    const rows = dbAll(this.db, 'SELECT * FROM orchestrated_artifacts WHERE project_id = ? ORDER BY created_at ASC', [
      projectId,
    ]);
    return rows.map((row) => this.rowToArtifact(row));
  }

  private rowToArtifact(row: Record<string, unknown>): WorkflowArtifact {
    return {
      id: str(row.id),
      kind: str(row.kind) as ArtifactKind,
      projectId: str(row.project_id),
      planId: row.plan_id ? str(row.plan_id) : undefined,
      taskId: row.task_id ? str(row.task_id) : undefined,
      agentId: str(row.agent_id),
      body: (jsonParse(row.body) as Record<string, unknown>) ?? {},
      version: Number(row.version) || 1,
      createdAt: str(row.created_at),
    };
  }
}
