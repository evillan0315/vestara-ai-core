import { SimpleTrustModel } from './models/simple-trust-model';
import { DefaultTrustRepository } from './repository/default-trust-repository';
import type { TrustEngine, TrustEngineConfig } from './types/engine';
import type { SourceType, TrustEvidence, VerificationOutcome } from './types/evidence';
import type { TrustModel } from './types/model';
import type { TrustRepository } from './types/repository';
import type { TrustSnapshot } from './types/snapshot';

function generateId(): string {
  return crypto.randomUUID();
}

export class DefaultTrustEngine implements TrustEngine {
  private readonly repository: TrustRepository;
  private readonly model: TrustModel;

  constructor(repository?: TrustRepository, config?: TrustEngineConfig) {
    this.repository = repository ?? new DefaultTrustRepository();
    this.model = new SimpleTrustModel(config?.modelConfig);
  }

  recordVerificationOutcome(outcome: VerificationOutcome): TrustSnapshot {
    const evidence = this.toEvidence(outcome);
    this.repository.storeEvidence(evidence);

    const allEvidence = this.repository.getEvidenceBySource(outcome.sourceId, outcome.sourceType);

    // allEvidence already includes the evidence we just stored
    const snapshot = this.model.compute(allEvidence, outcome.sourceId, outcome.sourceType);

    this.repository.storeSnapshot(snapshot);
    return snapshot;
  }

  getTrustSnapshot(sourceId: string, sourceType: SourceType): TrustSnapshot | undefined {
    return this.repository.getLatestSnapshot(sourceId, sourceType);
  }

  private toEvidence(outcome: VerificationOutcome): TrustEvidence {
    return {
      id: generateId(),
      sourceId: outcome.sourceId,
      sourceType: outcome.sourceType,
      capability: outcome.capability,
      outcome: outcome.status,
      timestamp: outcome.timestamp,
      verificationResultId: outcome.verificationResultId,
    };
  }
}
