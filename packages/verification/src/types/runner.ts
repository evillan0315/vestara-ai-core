import type { VerificationCheckRequest } from './request';
import type { IndividualCheckResult } from './result';

export interface VerificationRunner {
  readonly id: string;
  readonly name: string;
  readonly supportedCategories: readonly string[];
  execute(check: VerificationCheckRequest): Promise<IndividualCheckResult>;
}
