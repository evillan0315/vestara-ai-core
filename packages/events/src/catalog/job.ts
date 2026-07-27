import type {
  JobId,
  JobPriority,
  JobResult,
  JobType,
  RuntimeId,
  Timestamp,
  VerificationCheckType,
  VerificationResult,
  WorkerId,
} from '@vestara/types';

export const JobEventTypes = {
  Submitted: 'job:submitted',
  Validated: 'job:validated',
  Authorized: 'job:authorized',
  Scheduled: 'job:scheduled',
  Assigned: 'job:assigned',
  Started: 'job:started',
  Checkpoint: 'job:checkpoint',
  Verifying: 'job:verifying',
  Verified: 'job:verified',
  Completed: 'job:completed',
  Failed: 'job:failed',
  Retrying: 'job:retrying',
  RollingBack: 'job:rolling-back',
  RolledBack: 'job:rolled-back',
  Cancelled: 'job:cancelled',
  Rejected: 'job:rejected',
  Denied: 'job:denied',
  TimedOut: 'job:timed-out',
  Archived: 'job:archived',
} as const;

export interface JobSubmittedPayload {
  jobId: JobId;
  jobType: JobType;
  priority: JobPriority;
  owner: RuntimeId;
  intentId: string | null;
}

export interface JobValidatedPayload {
  jobId: JobId;
}

export interface JobAuthorizedPayload {
  jobId: JobId;
}

export interface JobScheduledPayload {
  jobId: JobId;
  priority: JobPriority;
}

export interface JobAssignedPayload {
  jobId: JobId;
  workerId: WorkerId;
  workerType: string;
}

export interface JobStartedPayload {
  jobId: JobId;
  workerId: WorkerId;
  startedAt: Timestamp;
}

export interface JobCheckpointPayload {
  jobId: JobId;
  percent: number;
  progress: string;
}

export interface JobVerifyingPayload {
  jobId: JobId;
  checks: VerificationCheckType[];
}

export interface JobVerifiedPayload {
  jobId: JobId;
  passed: number;
  failed: number;
  skipped: number;
  details: Array<{ check: VerificationCheckType; result: VerificationResult }>;
}

export interface JobCompletedPayload {
  jobId: JobId;
  result: JobResult;
  duration: number;
}

export interface JobFailedPayload {
  jobId: JobId;
  error: string;
  stage: string;
}

export interface JobRetryingPayload {
  jobId: JobId;
  attempt: number;
  maxRetries: number;
  error: string;
}

export interface JobRollingBackPayload {
  jobId: JobId;
  reason: string;
}

export interface JobRolledBackPayload {
  jobId: JobId;
  duration: number;
}

export interface JobCancelledPayload {
  jobId: JobId;
  reason: string;
}

export interface JobRejectedPayload {
  jobId: JobId;
  reason: string;
}

export interface JobDeniedPayload {
  jobId: JobId;
  reason: string;
}

export interface JobTimedOutPayload {
  jobId: JobId;
  stage: string;
  timeout: number;
}

export interface JobArchivedPayload {
  jobId: JobId;
  finalStatus: string;
}

export type JobEventPayloads = {
  [JobEventTypes.Submitted]: JobSubmittedPayload;
  [JobEventTypes.Validated]: JobValidatedPayload;
  [JobEventTypes.Authorized]: JobAuthorizedPayload;
  [JobEventTypes.Scheduled]: JobScheduledPayload;
  [JobEventTypes.Assigned]: JobAssignedPayload;
  [JobEventTypes.Started]: JobStartedPayload;
  [JobEventTypes.Checkpoint]: JobCheckpointPayload;
  [JobEventTypes.Verifying]: JobVerifyingPayload;
  [JobEventTypes.Verified]: JobVerifiedPayload;
  [JobEventTypes.Completed]: JobCompletedPayload;
  [JobEventTypes.Failed]: JobFailedPayload;
  [JobEventTypes.Retrying]: JobRetryingPayload;
  [JobEventTypes.RollingBack]: JobRollingBackPayload;
  [JobEventTypes.RolledBack]: JobRolledBackPayload;
  [JobEventTypes.Cancelled]: JobCancelledPayload;
  [JobEventTypes.Rejected]: JobRejectedPayload;
  [JobEventTypes.Denied]: JobDeniedPayload;
  [JobEventTypes.TimedOut]: JobTimedOutPayload;
  [JobEventTypes.Archived]: JobArchivedPayload;
};
