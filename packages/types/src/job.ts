import type { Brand, Range, Timestamp } from './common';
import type { IntentId, JobId, RuntimeId, WorkerId } from './ids';

export type JobPriority = Range<1, 5>;

export type JobType =
  | 'analyze'
  | 'implement'
  | 'review'
  | 'test'
  | 'deploy'
  | 'build'
  | 'lint'
  | 'document'
  | 'refactor'
  | 'migrate'
  | 'configure'
  | 'research'
  | 'plan'
  | 'estimate'
  | 'approve'
  | 'integrate'
  | 'debug'
  | 'optimize'
  | 'generate'
  | 'monitor'
  | 'custom';

export type JobState =
  | 'requested'
  | 'validated'
  | 'authorized'
  | 'scheduled'
  | 'assigned'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'archived'
  | 'retrying'
  | 'rolling-back'
  | 'rolled-back'
  | 'cancelled'
  | 'rejected'
  | 'denied'
  | 'timed-out'
  | 'verification-failed'
  | 'failed';

export type JobResultStatus = 'success' | 'failure' | 'cancelled' | 'timed-out' | 'rollback';

export interface JobResult {
  status: JobResultStatus;
  summary: string;
  artifacts?: Brand<string, 'ArtifactId'>[];
  output?: Record<string, unknown>;
  error?: string;
}

export interface Checkpoint {
  id: Brand<string, 'CheckpointId'>;
  percent: number;
  data: Record<string, unknown>;
  createdAt: Timestamp;
}

export type RetryPolicy = {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
};

export type RollbackPolicy = {
  enabled: boolean;
  strategy: 'full' | 'partial' | 'none';
};

export type VerificationCheckType =
  | 'build'
  | 'test'
  | 'lint'
  | 'coverage'
  | 'security-scan'
  | 'consistency'
  | 'typecheck'
  | 'custom';

export type VerificationResult = 'pending' | 'passed' | 'failed' | 'skipped';

export interface VerificationCheck {
  type: VerificationCheckType;
  config?: Record<string, unknown>;
  threshold?: number;
}

export interface VerificationPolicy {
  checks: VerificationCheck[];
  required: boolean;
}

export interface JobInfo {
  id: JobId;
  type: JobType;
  priority: JobPriority;
  owner: RuntimeId;
  runtime: RuntimeId;
  intent: IntentId | null;
  dependencies: JobId[];
  permissions: string[];
  verification: VerificationPolicy;
  rollback: RollbackPolicy;
  retry: RetryPolicy;
  timeout: number;
  checkpoint: Checkpoint[];
  result: JobResult | null;
  status: JobState;
  createdAt: Timestamp;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  archivedAt: Timestamp | null;
  assignedWorker: WorkerId | null;
}
