import type { VerificationCategory } from './status';

export interface VerificationCheckRequest {
  readonly id: string;
  readonly name: string;
  readonly category: VerificationCategory;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly timeoutMs?: number;
}

export interface VerificationRequest {
  readonly id: string;
  readonly jobId: string;
  readonly artifactUri?: string;
  readonly checks: readonly VerificationCheckRequest[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
