import type { VerificationRequest } from './request';
import type { VerificationResult } from './result';

export interface VerificationPipeline {
  execute(request: VerificationRequest): Promise<VerificationResult>;
}
