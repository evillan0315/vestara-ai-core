/**
 * CI-OBS-002B — Durable correlation store (sql.js substrate).
 *
 * Persists CI correlations on the host's existing sql.js database using the
 * registered `ci_correlations` table. Registration is idempotent on the
 * deterministic correlation id, so a repeated governed-push registration cannot
 * create duplicate correlations.
 */

import type { Database } from 'sql.js';
import type { CICorrelationRecord, CICorrelationStore } from './correlation';

interface CorrelationRow {
  readonly correlation_id: string;
  readonly repository: string;
  readonly commit_sha: string;
  readonly branch: string;
  readonly workflow_name: string | null;
  readonly workflow_run_id: string | null;
  readonly originating_workflow_run_id: string;
  readonly originating_task_id: string;
  readonly originating_operation_id: string;
  readonly created_at: string;
}

function rowToRecord(row: CorrelationRow): CICorrelationRecord {
  return {
    correlationId: row.correlation_id,
    repository: row.repository,
    commitSha: row.commit_sha,
    branch: row.branch,
    ...(row.workflow_name !== null ? { workflowName: row.workflow_name } : {}),
    ...(row.workflow_run_id !== null ? { workflowRunId: row.workflow_run_id } : {}),
    originatingWorkflowRunId: row.originating_workflow_run_id,
    originatingTaskId: row.originating_task_id,
    originatingOperationId: row.originating_operation_id,
    createdAt: row.created_at,
  };
}

export class SqliteCICorrelationStore implements CICorrelationStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  private query(sql: string, params: readonly (string | number | null)[] = []): CorrelationRow[] {
    const statement = this.db.prepare(sql);
    try {
      statement.bind(params as never);
      const rows: CorrelationRow[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as unknown as CorrelationRow);
      return rows;
    } finally {
      statement.free();
    }
  }

  async put(record: CICorrelationRecord): Promise<void> {
    // INSERT OR REPLACE keeps registration idempotent on the primary key while
    // preserving a previously attached run id when the record omits it.
    this.db.run(
      `INSERT INTO ci_correlations (
        correlation_id, repository, commit_sha, branch, workflow_name, workflow_run_id,
        originating_workflow_run_id, originating_task_id, originating_operation_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(correlation_id) DO UPDATE SET
        repository = excluded.repository,
        commit_sha = excluded.commit_sha,
        branch = excluded.branch,
        workflow_name = excluded.workflow_name,
        workflow_run_id = COALESCE(excluded.workflow_run_id, ci_correlations.workflow_run_id),
        originating_workflow_run_id = excluded.originating_workflow_run_id,
        originating_task_id = excluded.originating_task_id,
        originating_operation_id = excluded.originating_operation_id,
        created_at = excluded.created_at`,
      [
        record.correlationId,
        record.repository,
        record.commitSha,
        record.branch,
        record.workflowName ?? null,
        record.workflowRunId ?? null,
        record.originatingWorkflowRunId,
        record.originatingTaskId,
        record.originatingOperationId,
        record.createdAt,
      ],
    );
  }

  async get(correlationId: string): Promise<CICorrelationRecord | undefined> {
    const rows = this.query('SELECT * FROM ci_correlations WHERE correlation_id = ?', [correlationId]);
    return rows.length > 0 ? rowToRecord(rows[0]) : undefined;
  }

  async findByCommit(repository: string, commitSha: string): Promise<readonly CICorrelationRecord[]> {
    return this.query('SELECT * FROM ci_correlations WHERE repository = ? AND commit_sha = ? ORDER BY created_at', [
      repository,
      commitSha,
    ]).map(rowToRecord);
  }

  async findByRunId(runId: string): Promise<readonly CICorrelationRecord[]> {
    return this.query('SELECT * FROM ci_correlations WHERE workflow_run_id = ? ORDER BY created_at', [runId]).map(
      rowToRecord,
    );
  }

  async attachRunId(correlationId: string, runId: string): Promise<CICorrelationRecord | undefined> {
    this.db.run('UPDATE ci_correlations SET workflow_run_id = ? WHERE correlation_id = ? AND workflow_run_id IS NULL', [
      runId,
      correlationId,
    ]);
    return this.get(correlationId);
  }
}
