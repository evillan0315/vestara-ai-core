/**
 * CI-OBS-002A — Durable CI correlation record.
 *
 * Links a governed push (repository + commit SHA + branch + optional CI run
 * identity) to the originating Vestara execution identity
 * (WorkflowRun / WorkflowTask / Operation / correlation id).
 *
 * Invariants:
 *   - Correlation is a record, not authority.
 *   - Provider identity (run id) is optional: it is attached when observed,
 *     never invented at push time.
 *   - Correlation does not itself authorize repair or merge.
 */

/** A durable link between a governed push and its originating execution. */
export interface CICorrelationRecord {
  /** Stable correlation identity (also used as the task resume token). */
  readonly correlationId: string;

  /** Owner/name repository reference. */
  readonly repository: string;

  /** Commit that was pushed. */
  readonly commitSha: string;

  /** Branch that was pushed. */
  readonly branch: string;

  /** Workflow name, when known at push time. */
  readonly workflowName?: string;

  /** CI run identity — attached when observed, absent until then. */
  readonly workflowRunId?: string;

  /** Originating Vestara workflow run. */
  readonly originatingWorkflowRunId: string;

  /** Originating Vestara task. */
  readonly originatingTaskId: string;

  /** Originating operation identity. */
  readonly originatingOperationId: string;

  /** When the correlation was registered. ISO-8601. */
  readonly createdAt: string;
}

/** Input for registering a correlation at the governed-push boundary. */
export interface RegisterCorrelationInput {
  readonly repository: string;
  readonly commitSha: string;
  readonly branch: string;
  readonly workflowName?: string;
  readonly workflowRunId?: string;
  readonly originatingWorkflowRunId: string;
  readonly originatingTaskId: string;
  readonly originatingOperationId: string;
  /** Override for tests/replay; derived deterministically when omitted. */
  readonly correlationId?: string;
  /** Override for tests/replay; defaults to now. */
  readonly createdAt?: string;
}

/** Deterministic correlation identity for a push/task pair. */
export function deriveCorrelationId(repository: string, commitSha: string, originatingTaskId: string): string {
  return `ci-corr:${repository}:${commitSha}:${originatingTaskId}`;
}

/** Build a correlation record from governed-push inputs. Pure. */
export function createCICorrelationRecord(input: RegisterCorrelationInput): CICorrelationRecord {
  if (!input.repository.trim()) throw new Error('repository is required');
  if (!input.commitSha.trim()) throw new Error('commitSha is required');
  if (!input.originatingTaskId.trim()) throw new Error('originatingTaskId is required');
  return {
    correlationId:
      input.correlationId ?? deriveCorrelationId(input.repository, input.commitSha, input.originatingTaskId),
    repository: input.repository,
    commitSha: input.commitSha,
    branch: input.branch,
    ...(input.workflowName !== undefined ? { workflowName: input.workflowName } : {}),
    ...(input.workflowRunId !== undefined ? { workflowRunId: input.workflowRunId } : {}),
    originatingWorkflowRunId: input.originatingWorkflowRunId,
    originatingTaskId: input.originatingTaskId,
    originatingOperationId: input.originatingOperationId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/** Durable correlation storage boundary. */
export interface CICorrelationStore {
  put(record: CICorrelationRecord): Promise<void>;
  get(correlationId: string): Promise<CICorrelationRecord | undefined>;
  findByCommit(repository: string, commitSha: string): Promise<readonly CICorrelationRecord[]>;
  findByRunId(runId: string): Promise<readonly CICorrelationRecord[]>;
  /** Attach the observed CI run identity to a correlation. */
  attachRunId(correlationId: string, runId: string): Promise<CICorrelationRecord | undefined>;
}

/**
 * Process-lifetime correlation store.
 *
 * Durable persistence (engineering-event-store / SQLite) is a governed
 * follow-up: this slice proves the record + lookup contract without
 * introducing a parallel persistence model.
 */
export class InMemoryCICorrelationStore implements CICorrelationStore {
  private readonly byId = new Map<string, CICorrelationRecord>();

  async put(record: CICorrelationRecord): Promise<void> {
    this.byId.set(record.correlationId, record);
  }

  async get(correlationId: string): Promise<CICorrelationRecord | undefined> {
    return this.byId.get(correlationId);
  }

  async findByCommit(repository: string, commitSha: string): Promise<readonly CICorrelationRecord[]> {
    return [...this.byId.values()].filter(
      (record) => record.repository === repository && record.commitSha === commitSha,
    );
  }

  async findByRunId(runId: string): Promise<readonly CICorrelationRecord[]> {
    return [...this.byId.values()].filter((record) => record.workflowRunId === runId);
  }

  async attachRunId(correlationId: string, runId: string): Promise<CICorrelationRecord | undefined> {
    const existing = this.byId.get(correlationId);
    if (!existing) return undefined;
    const next: CICorrelationRecord = { ...existing, workflowRunId: runId };
    this.byId.set(correlationId, next);
    return next;
  }
}
