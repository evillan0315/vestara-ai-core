import type { JobId, TrustScore, VerificationCheckType, WorkerId } from '@vestara/types';

export const VerificationEventTypes = {
  Started: 'verification:started',
  Passed: 'verification:passed',
  Failed: 'verification:failed',
  Skipped: 'verification:skipped',
  TrustScoreChanged: 'trust:score-changed',
  TrustThresholdCrossed: 'trust:threshold-crossed',
} as const;

export interface VerificationStartedPayload {
  jobId: JobId;
  checkType: VerificationCheckType;
  workerId: WorkerId | null;
}

export interface VerificationPassedPayload {
  jobId: JobId;
  checkType: VerificationCheckType;
  duration: number;
}

export interface VerificationFailedPayload {
  jobId: JobId;
  checkType: VerificationCheckType;
  error: string;
  details: Record<string, unknown>;
}

export interface VerificationSkippedPayload {
  jobId: JobId;
  checkType: VerificationCheckType;
  reason: string;
}

export interface TrustScoreChangedPayload {
  workerId: WorkerId;
  previous: TrustScore;
  current: TrustScore;
  reason: string;
}

export interface TrustThresholdCrossedPayload {
  workerId: WorkerId;
  score: TrustScore;
  threshold: TrustScore;
  action: 'deprioritize' | 'quarantine' | 'escalate' | 'restore';
}

export type VerificationEventPayloads = {
  [VerificationEventTypes.Started]: VerificationStartedPayload;
  [VerificationEventTypes.Passed]: VerificationPassedPayload;
  [VerificationEventTypes.Failed]: VerificationFailedPayload;
  [VerificationEventTypes.Skipped]: VerificationSkippedPayload;
  [VerificationEventTypes.TrustScoreChanged]: TrustScoreChangedPayload;
  [VerificationEventTypes.TrustThresholdCrossed]: TrustThresholdCrossedPayload;
};
