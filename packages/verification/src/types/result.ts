import type { Evidence } from './evidence';
import type { VerificationStatus } from './status';

export interface IndividualCheckResult {
  readonly checkId: string;
  readonly name: string;
  readonly category: string;
  readonly status: VerificationStatus;
  readonly evidence: readonly Evidence[];
  readonly summary: string;
  readonly durationMs: number;
  readonly error?: string;
}

export interface VerificationResult {
  readonly id: string;
  readonly requestId: string;
  readonly jobId: string;
  readonly status: VerificationStatus;
  readonly checkResults: readonly IndividualCheckResult[];
  readonly summary: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}
