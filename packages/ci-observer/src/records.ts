/**
 * CI-OBS-001E (slice) — durable CI observation / decision / finding / delivery
 * records and their stores.
 *
 * These records give the CI loop a persisted read authority so the Settings
 * endpoint (and later Activity Room / Assistant) can show what was observed and
 * decided instead of holding. They persist FACTS that already exist elsewhere:
 * no new CI vocabulary, no authority.
 *
 * Invariants:
 *   - Observation ≠ decision; the finding is a record, never a mutation.
 *   - A retrieval failure is never persisted as a CI outcome.
 *   - Storing a decision confers no verification authority.
 */

import type { CIClassification, CIConclusion, CIStatus } from '@vestara/ci-contracts';

// ─── Records ────────────────────────────────────────────────────────

export interface CIObservationRecord {
  readonly observationId: string;
  readonly runId: string;
  readonly commitSha: string;
  /** Canonical lifecycle status observed (CI-OBS-001B). */
  readonly status: CIStatus;
  readonly conclusion: CIConclusion;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly skippedChecks: number;
  readonly trigger: string;
  readonly observedAt: string;
}

export interface CIDecisionRecord {
  readonly decisionId: string;
  readonly observationId: string;
  readonly correlationId?: string;
  readonly classification: CIClassification;
  readonly verdict: 'promote' | 'hold' | 'reject' | 'unknown';
  readonly action: 'HOLD' | 'REPAIR_CANDIDATE' | 'PROCEED_TO_VERIFICATION';
  readonly confidence: 'low' | 'medium' | 'high';
  readonly decisionRef?: string;
  readonly decidedAt: string;
}

/** One recorded finding (promoted hypothesis) for reuse across reviews. */
export interface CIFindingRecord {
  readonly findingId: string;
  readonly classification: CIClassification;
  readonly verdict: 'promote' | 'hold' | 'reject' | 'unknown';
  /** Canonical scope key (repository:commit) bounding reuse. */
  readonly scopeKey: string;
  readonly summary: string;
  readonly recordedAt: string;
}

export interface CIWebhookDeliveryRecord {
  readonly deliveryId: string;
  readonly kind: string;
  readonly accepted: boolean;
  readonly reason?: string;
  readonly receivedAt: string;
}

// ─── Store ports ────────────────────────────────────────────────────

export interface CIObservationStore {
  save(record: CIObservationRecord): Promise<void>;
  /** Most recent observation, if any. */
  latest(): Promise<CIObservationRecord | undefined>;
  findByCommit(commitSha: string): Promise<readonly CIObservationRecord[]>;
}

export interface CIDecisionStore {
  save(record: CIDecisionRecord): Promise<void>;
  latest(): Promise<CIDecisionRecord | undefined>;
  findByObservation(observationId: string): Promise<CIDecisionRecord | undefined>;
}

export interface CIFindingStore {
  save(record: CIFindingRecord): Promise<void>;
  list(): Promise<readonly CIFindingRecord[]>;
}

export interface CIWebhookDeliveryStore {
  record(record: CIWebhookDeliveryRecord): Promise<void>;
  /** Most recent deliveries, newest first. */
  recent(limit?: number): Promise<readonly CIWebhookDeliveryRecord[]>;
}

export interface CIRecordStores {
  readonly observations: CIObservationStore;
  readonly decisions: CIDecisionStore;
  readonly findings?: CIFindingStore;
  readonly deliveries?: CIWebhookDeliveryStore;
}

// ─── In-memory implementations (tests / ephemeral) ──────────────────

export class InMemoryCIObservationStore implements CIObservationStore {
  private readonly byId = new Map<string, CIObservationRecord>();

  async save(record: CIObservationRecord): Promise<void> {
    this.byId.set(record.observationId, record);
  }
  async latest(): Promise<CIObservationRecord | undefined> {
    return [...this.byId.values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  }
  async findByCommit(commitSha: string): Promise<readonly CIObservationRecord[]> {
    return [...this.byId.values()].filter((record) => record.commitSha === commitSha);
  }
}

export class InMemoryCIDecisionStore implements CIDecisionStore {
  private readonly byId = new Map<string, CIDecisionRecord>();

  async save(record: CIDecisionRecord): Promise<void> {
    this.byId.set(record.decisionId, record);
  }
  async latest(): Promise<CIDecisionRecord | undefined> {
    return [...this.byId.values()].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
  }
  async findByObservation(observationId: string): Promise<CIDecisionRecord | undefined> {
    return [...this.byId.values()].find((record) => record.observationId === observationId);
  }
}

export class InMemoryCIFindingStore implements CIFindingStore {
  private readonly byId = new Map<string, CIFindingRecord>();

  async save(record: CIFindingRecord): Promise<void> {
    this.byId.set(record.findingId, record);
  }
  async list(): Promise<readonly CIFindingRecord[]> {
    return [...this.byId.values()];
  }
}

export class InMemoryCIWebhookDeliveryStore implements CIWebhookDeliveryStore {
  private readonly items: CIWebhookDeliveryRecord[] = [];

  async record(record: CIWebhookDeliveryRecord): Promise<void> {
    this.items.push(record);
  }
  async recent(limit = 20): Promise<readonly CIWebhookDeliveryRecord[]> {
    return [...this.items].reverse().slice(0, limit);
  }
}
