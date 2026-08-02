import type { DecisionContext, VerificationResultRecord } from '../context';
import type { StageRunner } from '../stages';

export interface VerificationAdapter {
  verify(input: {
    requestId: string;
    targetType: string;
    targetId: string;
  }): Promise<VerificationResultRecord> | VerificationResultRecord;
}

/**
 * Stage runner for the Verification stage. Composes an existing verification
 * engine (e.g. @vestara/verification) behind a thin adapter.
 */
export function verificationStage(adapter: VerificationAdapter): StageRunner {
  return {
    stage: 'verification',
    run: async (context: DecisionContext) => ({
      field: 'verificationResult',
      value: await adapter.verify({
        requestId: context.request.id,
        targetType: context.request.targetType,
        targetId: context.request.targetId,
      }),
    }),
  };
}
