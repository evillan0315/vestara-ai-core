import type { SourceType, TrustEvidence } from '../types/evidence';
import type { TrustModel, TrustModelConfig } from '../types/model';
import type { TrustDimensions, TrustScore, TrustSnapshot } from '../types/snapshot';

const DEFAULT_CONFIG: TrustModelConfig = {
  decayRate: 0.02,
  decayUnit: 'day',
  minSampleSize: 1,
  recentWindowSize: 20,
};

function generateId(): string {
  return crypto.randomUUID();
}

export class SimpleTrustModel implements TrustModel {
  private readonly config: TrustModelConfig;

  constructor(config?: Partial<TrustModelConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  compute(evidence: readonly TrustEvidence[], sourceId: string, sourceType: SourceType): TrustSnapshot {
    const sorted = [...evidence].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const overall = this.computeOverallScore(sorted);
    const dimensions = this.computeDimensions(sorted);
    const byCapability = this.computeByCapability(sorted);
    const evidencePeriod =
      sorted.length > 0
        ? { start: sorted[0].timestamp, end: sorted[sorted.length - 1].timestamp }
        : { start: new Date().toISOString(), end: new Date().toISOString() };

    return {
      id: generateId(),
      sourceId,
      sourceType,
      computedAt: new Date().toISOString(),
      overall,
      byCapability,
      dimensions,
      evidencePeriod,
      evidenceCount: evidence.length,
    };
  }

  private computeOverallScore(evidence: TrustEvidence[]): TrustScore {
    const sampleSize = evidence.length;
    if (sampleSize < this.config.minSampleSize) {
      return { value: 0.5, confidence: 0, sampleSize };
    }

    const value = this.computeWeightedScore(evidence);
    const confidence = this.computeConfidence(sampleSize);

    return { value, confidence, sampleSize };
  }

  private computeDimensions(evidence: TrustEvidence[]): TrustDimensions {
    const reliability = this.computeReliability(evidence);
    const consistency = this.computeConsistency(evidence);
    return { reliability, consistency };
  }

  private computeReliability(evidence: TrustEvidence[]): TrustScore {
    const sampleSize = evidence.length;
    if (sampleSize < this.config.minSampleSize) {
      return { value: 0.5, confidence: 0, sampleSize };
    }

    const passedWeighted = this.computeWeightedSum(evidence, 'passed');
    const failedWeighted = this.computeWeightedSum(evidence, 'failed');
    const totalWeighted = passedWeighted + failedWeighted;

    const value = totalWeighted === 0 ? 0.5 : passedWeighted / totalWeighted;
    const confidence = this.computeConfidence(sampleSize);

    return { value, confidence, sampleSize };
  }

  private computeConsistency(evidence: TrustEvidence[]): TrustScore {
    const sampleSize = evidence.length;
    if (sampleSize < this.config.minSampleSize) {
      return { value: 0.5, confidence: 0, sampleSize };
    }

    const recent = evidence.slice(-this.config.recentWindowSize);
    const passedCount = recent.filter((e) => e.outcome === 'passed').length;
    const ratio = passedCount / recent.length;

    const value = 1 - Math.abs(ratio - 0.5) * 2;
    const confidence = this.computeConfidence(recent.length);

    return { value, confidence, sampleSize: recent.length };
  }

  private computeByCapability(evidence: TrustEvidence[]): Record<string, TrustScore> {
    const grouped = new Map<string, TrustEvidence[]>();
    for (const e of evidence) {
      const existing = grouped.get(e.capability) ?? [];
      existing.push(e);
      grouped.set(e.capability, existing);
    }

    const result: Record<string, TrustScore> = {};
    for (const [capability, capEvidence] of grouped) {
      result[capability] = this.computeOverallScore(capEvidence);
    }
    return result;
  }

  private computeWeightedScore(evidence: TrustEvidence[]): number {
    let weightedSum = 0;
    let weightedTotal = 0;

    for (const e of evidence) {
      const weight = this.computeDecayWeight(e.timestamp);
      const outcomeValue = e.outcome === 'passed' ? 1.0 : e.outcome === 'failed' ? -1.0 : 0.0;

      weightedSum += weight * outcomeValue;
      weightedTotal += weight;
    }

    if (weightedTotal === 0) return 0.5;
    return (weightedSum / weightedTotal + 1) / 2;
  }

  private computeWeightedSum(evidence: TrustEvidence[], targetOutcome: string): number {
    let sum = 0;
    for (const e of evidence) {
      if (e.outcome === targetOutcome) {
        sum += this.computeDecayWeight(e.timestamp);
      }
    }
    return sum;
  }

  private computeDecayWeight(timestamp: string): number {
    const ageMs = Date.now() - new Date(timestamp).getTime();
    const ageUnit = this.config.decayUnit === 'day' ? ageMs / 86400000 : ageMs / 3600000;
    return Math.exp(-this.config.decayRate * Math.max(0, ageUnit));
  }

  private computeConfidence(sampleSize: number): number {
    return sampleSize / (sampleSize + 20);
  }
}
