import type { DecisionContext, TrustRecord } from '../context';
import type { StageRunner } from '../stages';

export interface TrustAdapter {
  score(input: { sourceId: string; sourceType: string }): Promise<TrustRecord> | TrustRecord;
}

/**
 * Stage runner for the Trust stage. Composes an existing trust engine
 * (e.g. @vestara/trust DefaultTrustEngine) behind a thin adapter.
 */
export function trustStage(adapter: TrustAdapter): StageRunner {
  return {
    stage: 'trust',
    run: async (context: DecisionContext) => ({
      field: 'trustRecord',
      value: await adapter.score({
        sourceId: context.principal.id,
        sourceType: context.principal.runtimeType ?? 'agent',
      }),
    }),
  };
}
