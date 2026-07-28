import type { SourceType, TrustEvidence } from '../types/evidence';
import type { TrustRepository } from '../types/repository';
import type { TrustSnapshot } from '../types/snapshot';

export class DefaultTrustRepository implements TrustRepository {
  private readonly evidence: Map<string, TrustEvidence[]> = new Map();
  private readonly snapshots: Map<string, TrustSnapshot[]> = new Map();

  private sourceKey(sourceId: string, sourceType: SourceType): string {
    return `${sourceType}:${sourceId}`;
  }

  storeEvidence(evidence: TrustEvidence): void {
    const key = this.sourceKey(evidence.sourceId, evidence.sourceType);
    const existing = this.evidence.get(key) ?? [];
    existing.push(evidence);
    this.evidence.set(key, existing);
  }

  storeSnapshot(snapshot: TrustSnapshot): void {
    const key = this.sourceKey(snapshot.sourceId, snapshot.sourceType);
    const existing = this.snapshots.get(key) ?? [];
    existing.push(snapshot);
    this.snapshots.set(key, existing);
  }

  getEvidenceBySource(sourceId: string, sourceType: SourceType): readonly TrustEvidence[] {
    const key = this.sourceKey(sourceId, sourceType);
    return this.evidence.get(key) ?? [];
  }

  getLatestSnapshot(sourceId: string, sourceType: SourceType): TrustSnapshot | undefined {
    const key = this.sourceKey(sourceId, sourceType);
    const snapshots = this.snapshots.get(key);
    if (!snapshots || snapshots.length === 0) return undefined;
    return snapshots[snapshots.length - 1];
  }
}
