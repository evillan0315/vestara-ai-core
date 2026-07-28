import type { SourceType } from './evidence';

export interface TrustScore {
  readonly value: number;
  readonly confidence: number;
  readonly sampleSize: number;
}

export interface TrustDimensions {
  readonly reliability: TrustScore;
  readonly consistency: TrustScore;
}

export interface TrustSnapshot {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceType: SourceType;
  readonly computedAt: string;
  readonly overall: TrustScore;
  readonly byCapability: Record<string, TrustScore>;
  readonly dimensions: TrustDimensions;
  readonly evidencePeriod: {
    readonly start: string;
    readonly end: string;
  };
  readonly evidenceCount: number;
}
