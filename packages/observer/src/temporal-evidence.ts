/**
 * VESTARA-INTELLIGENCE OBS-2: Temporal Evidence Retrieval
 *
 * Time-sliced evidence retrieval: given a time range, return evidence
 * references with provenance. Distinct from Activity Room timeline
 * (different query model, different data).
 *
 * Ownership:
 * - Temporal evidence is read-only; no persistence, no mutation
 * - Queries are evaluated against in-memory or persisted finding/snapshot stores
 * - Results are bounded by time range and optional filters
 *
 * Design constraints:
 * - NOT the Activity Room timeline (different query model, different data)
 * - NOT the Observer finding lifecycle (OBS-3 owns status transitions)
 * - Returns evidence references with provenance, not full evidence content
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type {
  DiagnosticSnapshot,
  DiagnosticSourceHealth,
  DiagnosticSourceRef,
  DiagnosticSeverity,
  ObserverFinding,
  ObserverFindingStatus,
} from '@vestara/types';

// ─── Query Types ───────────────────────────────────────────────

/**
 * OBS-2: Query for time-sliced evidence retrieval.
 * Defines the time range and optional filters for temporal queries.
 */
export interface TemporalEvidenceQuery {
  /** ISO-8601 start of the time range (inclusive) */
  readonly start: string;

  /** ISO-8601 end of the time range (inclusive) */
  readonly end: string;

  /** Optional: filter by source IDs */
  readonly sourceIds?: readonly string[];

  /** Optional: filter by minimum severity */
  readonly minSeverity?: DiagnosticSeverity;

  /** Optional: filter by health states */
  readonly healthStates?: readonly DiagnosticSourceHealth[];

  /** Optional: filter by finding status */
  readonly findingStatus?: ObserverFindingStatus;

  /** Optional: maximum number of results */
  readonly limit?: number;

  /** Optional: offset for pagination */
  readonly offset?: number;
}

// ─── Result Types ──────────────────────────────────────────────

/**
 * OBS-2: A temporal evidence record — a snapshot or finding within a time range.
 */
export interface TemporalEvidenceRecord {
  /** The type of evidence record */
  readonly type: 'snapshot' | 'finding';

  /** The source that produced this evidence */
  readonly source: DiagnosticSourceRef;

  /** ISO-8601 timestamp when this evidence was observed */
  readonly timestamp: string;

  /** Severity of the observation */
  readonly severity: DiagnosticSeverity;

  /** Health state (for snapshots) or finding status (for findings) */
  readonly status: DiagnosticSourceHealth | ObserverFindingStatus;

  /** Human-readable summary */
  readonly summary: string;

  /** Confidence score (0-1) — 1.0 for snapshots (direct observation), variable for findings */
  readonly confidence: number;

  /** Optional: full snapshot data (when type is 'snapshot') */
  readonly snapshot?: DiagnosticSnapshot;

  /** Optional: full finding data (when type is 'finding') */
  readonly finding?: ObserverFinding;
}

/**
 * OBS-2: Result of a temporal evidence query.
 */
export interface TemporalEvidenceResult {
  /** Time-ordered evidence records */
  readonly records: readonly TemporalEvidenceRecord[];

  /** Total number of matching records (before limit/offset) */
  readonly total: number;

  /** Query time range */
  readonly queryRange: { start: string; end: string };

  /** ISO-8601 timestamp of when this query was executed */
  readonly queriedAt: string;

  /** Query execution duration in milliseconds */
  readonly durationMs: number;
}

// ─── Temporal Evidence Store ───────────────────────────────────

/**
 * OBS-2: Interface for temporal evidence retrieval.
 * Implementations provide time-sliced queries over snapshots and findings.
 */
export interface TemporalEvidenceStore {
  /**
   * Query evidence records within a time range.
   * Returns time-ordered records with provenance.
   */
  queryTemporalEvidence(query: TemporalEvidenceQuery): Promise<TemporalEvidenceResult>;

  /**
   * Get evidence records for a specific source within a time range.
   */
  getSourceTimeline(
    sourceId: string,
    start: string,
    end: string,
  ): Promise<readonly TemporalEvidenceRecord[]>;

  /**
   * Get the most recent evidence records across all sources.
   */
  getRecentEvidence(limit?: number): Promise<readonly TemporalEvidenceRecord[]>;
}

// ─── In-Memory Implementation ──────────────────────────────────

/**
 * OBS-2: In-memory implementation of TemporalEvidenceStore.
 * For production use, this would be backed by a database.
 */
export class InMemoryTemporalEvidenceStore implements TemporalEvidenceStore {
  private snapshots: DiagnosticSnapshot[] = [];
  private findings: ObserverFinding[] = [];

  /**
   * Add snapshots to the store (for testing/initialization).
   */
  addSnapshots(snapshots: DiagnosticSnapshot[]): void {
    this.snapshots.push(...snapshots);
    this.snapshots.sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  }

  /**
   * Add findings to the store (for testing/initialization).
   */
  addFindings(findings: ObserverFinding[]): void {
    this.findings.push(...findings);
    this.findings.sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  }

  async queryTemporalEvidence(query: TemporalEvidenceQuery): Promise<TemporalEvidenceResult> {
    const start = Date.now();
    const startTime = new Date(query.start).getTime();
    const endTime = new Date(query.end).getTime();

    const records: TemporalEvidenceRecord[] = [];

    // Collect matching snapshots
    for (const snapshot of this.snapshots) {
      const timestamp = new Date(snapshot.observedAt).getTime();
      if (timestamp < startTime || timestamp > endTime) continue;

      if (query.sourceIds && !query.sourceIds.includes(snapshot.source.id)) continue;
      if (query.minSeverity && !this.meetsSeverity(snapshot.severity, query.minSeverity)) continue;
      if (query.healthStates && !query.healthStates.includes(snapshot.health)) continue;

      records.push({
        type: 'snapshot',
        source: snapshot.source,
        timestamp: snapshot.observedAt,
        severity: snapshot.severity,
        status: snapshot.health,
        summary: snapshot.message,
        confidence: 1.0, // Direct observation = full confidence
        snapshot,
      });
    }

    // Collect matching findings
    for (const finding of this.findings) {
      const timestamp = new Date(finding.observedAt).getTime();
      if (timestamp < startTime || timestamp > endTime) continue;

      if (query.sourceIds && !finding.sourceIds.some((id) => query.sourceIds!.includes(id))) continue;
      if (query.minSeverity && !this.meetsSeverity(finding.severity, query.minSeverity)) continue;
      if (query.findingStatus && finding.status !== query.findingStatus) continue;

      records.push({
        type: 'finding',
        source: { id: finding.sourceIds[0] ?? 'unknown', kind: 'runtime', name: 'Unknown Source' },
        timestamp: finding.observedAt,
        severity: finding.severity,
        status: finding.status,
        summary: finding.title,
        confidence: finding.confidence,
        finding,
      });
    }

    // Sort by timestamp
    records.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Apply pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? records.length;
    const paginated = records.slice(offset, offset + limit);

    return {
      records: paginated,
      total: records.length,
      queryRange: { start: query.start, end: query.end },
      queriedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  async getSourceTimeline(
    sourceId: string,
    start: string,
    end: string,
  ): Promise<readonly TemporalEvidenceRecord[]> {
    const result = await this.queryTemporalEvidence({
      start,
      end,
      sourceIds: [sourceId],
    });
    return result.records;
  }

  async getRecentEvidence(limit = 10): Promise<readonly TemporalEvidenceRecord[]> {
    const allRecords: TemporalEvidenceRecord[] = [];

    for (const snapshot of this.snapshots.slice(-limit)) {
      allRecords.push({
        type: 'snapshot',
        source: snapshot.source,
        timestamp: snapshot.observedAt,
        severity: snapshot.severity,
        status: snapshot.health,
        summary: snapshot.message,
        confidence: 1.0,
        snapshot,
      });
    }

    for (const finding of this.findings.slice(-limit)) {
      allRecords.push({
        type: 'finding',
        source: { id: finding.sourceIds[0] ?? 'unknown', kind: 'runtime', name: 'Unknown Source' },
        timestamp: finding.observedAt,
        severity: finding.severity,
        status: finding.status,
        summary: finding.title,
        confidence: finding.confidence,
        finding,
      });
    }

    allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return allRecords.slice(0, limit);
  }

  private meetsSeverity(actual: DiagnosticSeverity, minimum: DiagnosticSeverity): boolean {
    const levels: DiagnosticSeverity[] = ['info', 'warning', 'error', 'critical'];
    return levels.indexOf(actual) >= levels.indexOf(minimum);
  }
}
