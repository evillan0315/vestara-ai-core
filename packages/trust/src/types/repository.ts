import type { SourceType, TrustEvidence } from './evidence';
import type { TrustSnapshot } from './snapshot';

export interface TrustRepository {
  storeEvidence(evidence: TrustEvidence): void;
  storeSnapshot(snapshot: TrustSnapshot): void;
  getEvidenceBySource(sourceId: string, sourceType: SourceType): readonly TrustEvidence[];
  getLatestSnapshot(sourceId: string, sourceType: SourceType): TrustSnapshot | undefined;
}
