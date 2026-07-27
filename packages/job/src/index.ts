import type { CapabilityProfile } from '@vestara/capabilities';
import { createCapabilityProfile } from '@vestara/capabilities';
import type { StateMachine } from '@vestara/state-machine';
import { createStateMachine } from '@vestara/state-machine';
import type {
  Checkpoint,
  IntentId,
  JobId,
  JobInfo,
  JobPriority,
  JobResult,
  JobResultStatus,
  JobState,
  JobType,
  RetryPolicy,
  RollbackPolicy,
  RuntimeId,
  Timestamp,
  VerificationCheck,
  VerificationPolicy,
  WorkerId,
} from '@vestara/types';

export type { CapabilityProfile } from '@vestara/capabilities';

export type {
  Checkpoint,
  JobId,
  JobInfo,
  JobPriority,
  JobResult,
  JobResultStatus,
  JobState,
  JobType,
  RetryPolicy,
  RollbackPolicy,
  VerificationCheck,
  VerificationPolicy,
};

const JOB_TRANSITIONS: Record<JobState, readonly JobState[]> = {
  requested: ['validated', 'rejected', 'cancelled'],
  validated: ['authorized', 'denied', 'cancelled'],
  authorized: ['scheduled', 'cancelled'],
  scheduled: ['assigned', 'cancelled', 'timed-out'],
  assigned: ['running', 'timed-out', 'failed'],
  running: ['verifying', 'retrying', 'rolling-back', 'failed', 'timed-out'],
  retrying: ['assigned', 'rolling-back', 'failed'],
  'rolling-back': ['rolled-back', 'failed'],
  verifying: ['completed', 'verification-failed', 'retrying'],
  'verification-failed': ['retrying', 'failed', 'archived'],
  completed: ['archived'],
  'rolled-back': ['archived'],
  failed: ['archived'],
  'timed-out': ['archived'],
  cancelled: ['archived'],
  rejected: ['archived'],
  denied: ['archived'],
  archived: [],
};

export interface JobSpec {
  type: JobType;
  priority: JobPriority;
  permissions?: string[];
  capabilities?: string[];
  verification?: Partial<VerificationPolicy>;
  rollback?: Partial<RollbackPolicy>;
  retry?: Partial<RetryPolicy>;
  timeout?: number;
}

export interface JobConfig {
  id: JobId;
  spec: JobSpec;
  owner: RuntimeId;
  runtime: RuntimeId;
  intent?: IntentId;
  dependencies?: JobId[];
}

export interface JobObserver {
  onTransition?: (from: JobState, to: JobState) => void;
}

const DEFAULT_RETRY: RetryPolicy = { maxRetries: 0, backoffMs: 1000, backoffMultiplier: 2 };
const DEFAULT_ROLLBACK: RollbackPolicy = { enabled: false, strategy: 'none' };
const DEFAULT_VERIFICATION: VerificationPolicy = { checks: [], required: true };

export class Job {
  readonly id: JobId;
  readonly type: JobType;
  readonly owner: RuntimeId;
  readonly runtime: RuntimeId;
  readonly intent: IntentId | null;
  readonly createdAt: Timestamp;

  private _stateMachine: StateMachine<JobState>;
  private _priority: JobPriority;
  private _dependencies: JobId[];
  private _permissions: string[];
  private _verification: VerificationPolicy;
  private _rollback: RollbackPolicy;
  private _retry: RetryPolicy;
  private _timeout: number;
  private _capabilities: string[];
  private _checkpoints: Map<string, unknown> = new Map();
  private _checkpointList: Checkpoint[] = [];
  private _result: JobResult | null = null;
  private _error: string | null = null;
  private _startedAt: Timestamp | null = null;
  private _completedAt: Timestamp | null = null;
  private _archivedAt: Timestamp | null = null;
  private _assignedWorker: WorkerId | null = null;
  private _retryCount: number = 0;
  private _observer: JobObserver | null = null;

  constructor(config: JobConfig, observer?: JobObserver) {
    this.id = config.id;
    this.type = config.spec.type;
    this.owner = config.owner;
    this.runtime = config.runtime;
    this.intent = config.intent ?? null;
    this.createdAt = new Date().toISOString() as Timestamp;

    this._priority = config.spec.priority;
    this._dependencies = config.dependencies ?? [];
    this._permissions = config.spec.permissions ?? [];
    this._verification = { ...DEFAULT_VERIFICATION, ...config.spec.verification };
    this._rollback = { ...DEFAULT_ROLLBACK, ...config.spec.rollback };
    this._retry = { ...DEFAULT_RETRY, ...config.spec.retry };
    this._timeout = config.spec.timeout ?? 300_000;
    this._capabilities = config.spec.capabilities ?? [];
    this._observer = observer ?? null;

    this._stateMachine = createStateMachine<JobState>({
      initial: 'requested',
      states: JOB_TRANSITIONS,
    });
  }

  get state(): JobState {
    return this._stateMachine.state;
  }

  get priority(): JobPriority {
    return this._priority;
  }

  get dependencies(): readonly JobId[] {
    return [...this._dependencies];
  }

  get permissions(): readonly string[] {
    return [...this._permissions];
  }

  get capabilities(): readonly string[] {
    return [...this._capabilities];
  }

  get verification(): VerificationPolicy {
    return { ...this._verification };
  }

  get rollback(): RollbackPolicy {
    return { ...this._rollback };
  }

  get retry(): RetryPolicy {
    return { ...this._retry };
  }

  get timeout(): number {
    return this._timeout;
  }

  get result(): JobResult | null {
    return this._result;
  }

  get error(): string | null {
    return this._error;
  }

  get startedAt(): Timestamp | null {
    return this._startedAt;
  }

  get completedAt(): Timestamp | null {
    return this._completedAt;
  }

  get archivedAt(): Timestamp | null {
    return this._archivedAt;
  }

  get assignedWorker(): WorkerId | null {
    return this._assignedWorker;
  }

  get retryCount(): number {
    return this._retryCount;
  }

  get retriesRemaining(): number {
    return Math.max(0, this._retry.maxRetries - this._retryCount);
  }

  get hasCheckpoints(): boolean {
    return this._checkpointList.length > 0;
  }

  get info(): JobInfo {
    return {
      id: this.id,
      type: this.type,
      priority: this._priority,
      owner: this.owner,
      runtime: this.runtime,
      intent: this.intent,
      dependencies: [...this._dependencies],
      permissions: [...this._permissions],
      verification: { ...this._verification },
      rollback: { ...this._rollback },
      retry: { ...this._retry },
      timeout: this._timeout,
      checkpoint: [...this._checkpointList],
      result: this._result ? { ...this._result } : null,
      status: this.state,
      createdAt: this.createdAt,
      startedAt: this._startedAt,
      completedAt: this._completedAt,
      archivedAt: this._archivedAt,
      assignedWorker: this._assignedWorker,
    };
  }

  private transition(target: JobState, error?: string): void {
    const from = this.state;
    if (!this._stateMachine.canTransition(target)) {
      throw new Error(`Job ${this.id} cannot transition from "${from}" to "${target}"`);
    }
    if (error) this._error = error;
    this._stateMachine.transition(target);
    this._observer?.onTransition?.(from, target);
  }

  validate(): void {
    this.transition('validated');
  }

  reject(reason: string): void {
    this._result = { status: 'failure', summary: reason, error: reason };
    this.transition('rejected', reason);
  }

  authorize(): void {
    this.transition('authorized');
  }

  deny(reason: string): void {
    this._result = { status: 'failure', summary: reason, error: reason };
    this.transition('denied', reason);
  }

  schedule(): void {
    this.transition('scheduled');
  }

  assign(workerId: WorkerId): void {
    this._assignedWorker = workerId;
    this.transition('assigned');
  }

  start(): void {
    this._startedAt = new Date().toISOString() as Timestamp;
    this.transition('running');
  }

  checkpoint(percent: number, data: Record<string, unknown>): void {
    const cp: Checkpoint = {
      id: `${this.id}-cp-${percent}` as Checkpoint['id'],
      percent,
      data,
      createdAt: new Date().toISOString() as Timestamp,
    };
    this._checkpointList = [...this._checkpointList, cp];
    this._checkpoints.set(`percent:${percent}`, data);
  }

  complete(result?: Partial<JobResult>): void {
    this._completedAt = new Date().toISOString() as Timestamp;
    this._result = {
      status: 'success',
      summary: result?.summary ?? 'Job completed successfully',
      ...result,
    };
    this.transition('verifying');
  }

  verifyComplete(): void {
    this._completedAt = new Date().toISOString() as Timestamp;
    this.transition('completed');
  }

  verificationFailed(): void {
    this.transition('verification-failed');
  }

  fail(error: string): void {
    this._error = error;
    this._result = { status: 'failure', summary: error, error };
    this.transition('failed', error);
  }

  timeoutOccurred(stage: string): void {
    this._error = `Timed out during "${stage}"`;
    this._result = { status: 'timed-out', summary: this._error, error: this._error };
    this.transition('timed-out');
  }

  cancel(reason?: string): void {
    this._result = {
      status: 'cancelled',
      summary: reason ?? 'Job cancelled',
      error: reason,
    };
    this.transition('cancelled');
  }

  retryLater(): void {
    this._retryCount++;
    this.transition('retrying');
  }

  startRollback(): void {
    this.transition('rolling-back');
  }

  rollbackComplete(): void {
    this._result = {
      status: 'rollback',
      summary: 'Job rolled back to pre-execution state',
    };
    this.transition('rolled-back');
  }

  archive(): void {
    this._archivedAt = new Date().toISOString() as Timestamp;
    this.transition('archived');
  }

  canCancel(): boolean {
    const cancellableFrom: JobState[] = ['requested', 'validated', 'authorized', 'scheduled'];
    return cancellableFrom.includes(this.state);
  }

  canRetry(): boolean {
    return this.retriesRemaining > 0 && (this.state === 'failed' || this.state === 'verification-failed');
  }

  hasRequiredCapability(capability: string): boolean {
    return this._capabilities.length === 0 || this._capabilities.includes(capability);
  }

  capabilityProfile(): CapabilityProfile {
    return createCapabilityProfile(this._capabilities);
  }

  getLatestCheckpoint(): Checkpoint | undefined {
    if (this._checkpointList.length === 0) return undefined;
    return this._checkpointList[this._checkpointList.length - 1];
  }

  setPriority(priority: JobPriority): void {
    this._priority = priority;
  }
}

export type { RepositoryOperationSpec } from './jobs/repository-operation-job';
export { RepositoryOperationJob } from './jobs/repository-operation-job';
export type { UserApprovalSpec } from './jobs/user-approval-job';
export { UserApprovalJob } from './jobs/user-approval-job';
export type { VerificationSpec } from './jobs/verification-job';
export { VerificationJob } from './jobs/verification-job';
export type { WorkflowExecutionSpec } from './jobs/workflow-execution-job';
export { WorkflowExecutionJob } from './jobs/workflow-execution-job';
