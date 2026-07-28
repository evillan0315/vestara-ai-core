import type { SourceType, TrustEvidence } from './evidence';
import type { TrustSnapshot } from './snapshot';

export interface TrustModelConfig {
  readonly decayRate: number;
  readonly decayUnit: 'day' | 'hour';
  readonly minSampleSize: number;
  readonly recentWindowSize: number;
}

export interface TrustModel {
  compute(evidence: readonly TrustEvidence[], sourceId: string, sourceType: SourceType): TrustSnapshot;
}
