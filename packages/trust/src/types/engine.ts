import type { SourceType, VerificationOutcome } from './evidence';
import type { TrustModelConfig } from './model';
import type { TrustSnapshot } from './snapshot';

export interface TrustEngineConfig {
  readonly modelConfig?: Partial<TrustModelConfig>;
}

export interface TrustEngine {
  recordVerificationOutcome(outcome: VerificationOutcome): TrustSnapshot;
  getTrustSnapshot(sourceId: string, sourceType: SourceType): TrustSnapshot | undefined;
}
