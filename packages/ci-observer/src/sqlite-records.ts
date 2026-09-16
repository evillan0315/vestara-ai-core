/**
 * CI-OBS-001E (slice) — durable CI record stores on the host sql.js database.
 *
 * Tables are created by `CI_OBSERVER_MIGRATIONS`; these classes only read and
 * write. Writes are idempotent on the record primary key.
 */

import type { CIClassification, CIConclusion, CIStatus } from '@vestara/ci-contracts';
import type { Database } from 'sql.js';
import type {
  CIDecisionRecord,
  CIDecisionStore,
  CIFindingRecord,
  CIFindingStore,
  CIObservationRecord,
  CIObservationStore,
  CIWebhookDeliveryRecord,
  CIWebhookDeliveryStore,
} from './records';

function rows<T>(db: Database, sql: string, params: readonly (string | number | null)[] = []): T[] {
  const statement = db.prepare(sql);
  try {
    statement.bind(params as never);
    const result: T[] = [];
    while (statement.step()) result.push(statement.getAsObject() as unknown as T);
    return result;
  } finally {
    statement.free();
  }
}

// ─── Observations ───────────────────────────────────────────────────

interface ObservationRow {
  observation_id: string;
  run_id: string;
  commit_sha: string;
  status: string;
  conclusion: string;
  passed_checks: number;
  failed_checks: number;
  skipped_checks: number;
  trigger: string;
  observed_at: string;
}

function toObservation(row: ObservationRow): CIObservationRecord {
  return {
    observationId: row.observation_id,
    runId: row.run_id,
    commitSha: row.commit_sha,
    status: row.status as CIStatus,
    conclusion: row.conclusion as CIConclusion,
    passedChecks: Number(row.passed_checks),
    failedChecks: Number(row.failed_checks),
    skippedChecks: Number(row.skipped_checks),
    trigger: row.trigger,
    observedAt: row.observed_at,
  };
}

export class SqliteCIObservationStore implements CIObservationStore {
  constructor(private readonly db: Database) {}

  async save(record: CIObservationRecord): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO ci_observations
        (observation_id, run_id, commit_sha, status, conclusion, passed_checks, failed_checks, skipped_checks, trigger, observed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.observationId,
        record.runId,
        record.commitSha,
        record.status,
        record.conclusion,
        record.passedChecks,
        record.failedChecks,
        record.skippedChecks,
        record.trigger,
        record.observedAt,
      ],
    );
  }

  async latest(): Promise<CIObservationRecord | undefined> {
    const found = rows<ObservationRow>(this.db, 'SELECT * FROM ci_observations ORDER BY observed_at DESC LIMIT 1');
    return found[0] ? toObservation(found[0]) : undefined;
  }

  async findByCommit(commitSha: string): Promise<readonly CIObservationRecord[]> {
    return rows<ObservationRow>(this.db, 'SELECT * FROM ci_observations WHERE commit_sha = ?', [commitSha]).map(
      toObservation,
    );
  }
}

// ─── Decisions ──────────────────────────────────────────────────────

interface DecisionRow {
  decision_id: string;
  observation_id: string;
  correlation_id: string | null;
  classification: string;
  verdict: string;
  action: string;
  confidence: string;
  decision_ref: string | null;
  decided_at: string;
}

function toDecision(row: DecisionRow): CIDecisionRecord {
  return {
    decisionId: row.decision_id,
    observationId: row.observation_id,
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
    classification: row.classification as CIClassification,
    verdict: row.verdict as CIDecisionRecord['verdict'],
    action: row.action as CIDecisionRecord['action'],
    confidence: row.confidence as CIDecisionRecord['confidence'],
    ...(row.decision_ref !== null ? { decisionRef: row.decision_ref } : {}),
    decidedAt: row.decided_at,
  };
}

export class SqliteCIDecisionStore implements CIDecisionStore {
  constructor(private readonly db: Database) {}

  async save(record: CIDecisionRecord): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO ci_decisions
        (decision_id, observation_id, correlation_id, classification, verdict, action, confidence, decision_ref, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.decisionId,
        record.observationId,
        record.correlationId ?? null,
        record.classification,
        record.verdict,
        record.action,
        record.confidence,
        record.decisionRef ?? null,
        record.decidedAt,
      ],
    );
  }

  async latest(): Promise<CIDecisionRecord | undefined> {
    const found = rows<DecisionRow>(this.db, 'SELECT * FROM ci_decisions ORDER BY decided_at DESC LIMIT 1');
    return found[0] ? toDecision(found[0]) : undefined;
  }

  async findByObservation(observationId: string): Promise<CIDecisionRecord | undefined> {
    const found = rows<DecisionRow>(this.db, 'SELECT * FROM ci_decisions WHERE observation_id = ? LIMIT 1', [
      observationId,
    ]);
    return found[0] ? toDecision(found[0]) : undefined;
  }
}

// ─── Findings ───────────────────────────────────────────────────────

interface FindingRow {
  finding_id: string;
  classification: string;
  verdict: string;
  scope_key: string;
  summary: string;
  recorded_at: string;
}

export class SqliteCIFindingStore implements CIFindingStore {
  constructor(private readonly db: Database) {}

  async save(record: CIFindingRecord): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO ci_findings
        (finding_id, classification, verdict, scope_key, summary, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [record.findingId, record.classification, record.verdict, record.scopeKey, record.summary, record.recordedAt],
    );
  }

  async list(): Promise<readonly CIFindingRecord[]> {
    return rows<FindingRow>(this.db, 'SELECT * FROM ci_findings ORDER BY recorded_at DESC').map((row) => ({
      findingId: row.finding_id,
      classification: row.classification as CIClassification,
      verdict: row.verdict as CIFindingRecord['verdict'],
      scopeKey: row.scope_key,
      summary: row.summary,
      recordedAt: row.recorded_at,
    }));
  }
}

// ─── Webhook deliveries ─────────────────────────────────────────────

interface DeliveryRow {
  delivery_id: string;
  kind: string;
  accepted: number;
  reason: string | null;
  received_at: string;
}

export class SqliteCIWebhookDeliveryStore implements CIWebhookDeliveryStore {
  constructor(private readonly db: Database) {}

  async record(record: CIWebhookDeliveryRecord): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO ci_webhook_deliveries (delivery_id, kind, accepted, reason, received_at)
       VALUES (?, ?, ?, ?, ?)`,
      [record.deliveryId, record.kind, record.accepted ? 1 : 0, record.reason ?? null, record.receivedAt],
    );
  }

  async recent(limit = 20): Promise<readonly CIWebhookDeliveryRecord[]> {
    return rows<DeliveryRow>(this.db, 'SELECT * FROM ci_webhook_deliveries ORDER BY received_at DESC LIMIT ?', [
      limit,
    ]).map((row) => ({
      deliveryId: row.delivery_id,
      kind: row.kind,
      accepted: Number(row.accepted) === 1,
      ...(row.reason !== null ? { reason: row.reason } : {}),
      receivedAt: row.received_at,
    }));
  }
}
