export type SourceType = 'worker' | 'agent' | 'repository' | 'pipeline' | 'plan';

export type VerificationOutcomeStatus = 'passed' | 'failed' | 'warning';

export interface VerificationOutcome {
  readonly verificationResultId: string;
  readonly sourceId: string;
  readonly sourceType: SourceType;
  readonly capability: string;
  readonly status: VerificationOutcomeStatus;
  readonly timestamp: string;
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly warningChecks: number;
  readonly categories: readonly string[];
}

export interface TrustEvidence {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceType: SourceType;
  readonly capability: string;
  readonly outcome: VerificationOutcomeStatus;
  readonly timestamp: string;
  readonly verificationResultId: string;
}
