/**
 * VESTARA-INTELLIGENCE OBS-0/OBS-1: Observer Types
 *
 * Defines the core types for the Observer authority — the analytical layer
 * that subscribes to diagnostic output and produces structured findings.
 *
 * Ownership:
 * - Observer findings are analytical observations derived from diagnostic facts
 * - Findings reference source evidence, never duplicate it
 * - Findings carry confidence scores and lifecycle status
 * - Observer is read-only to all authority stores (Workflow, Routing, Activity, Conversation)
 *
 * Invariants:
 * - INV-OBS-1: Observer cannot write to authority stores
 * - INV-OBS-2: Findings reference facts, never duplicate them
 * - INV-OBS-3: Observer does not trigger execution
 *
 * Future phases:
 * - OBS-2 (Temporal Evidence): time-sliced evidence retrieval
 * - OBS-3 (Findings): full finding lifecycle with status transitions
 * - OBS-4 (Health Model): degradation detection and trend analysis
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 * @see packages/types/src/diagnostic.ts (DIAG-0/1/2/3/4 types)
 */

import type {
  DiagnosticSeverity,
  DiagnosticSnapshot,
  DiagnosticSourceHealth,
  DiagnosticSourceRef,
} from './diagnostic';
import type { JsonRecord } from './common';

// ─── Observer Finding ──────────────────────────────────────────

/**
 * OBS-1: An analytical observation derived from diagnostic facts.
 *
 * Each finding references source evidence (by reference, never by value)
 * and carries a confidence score reflecting the strength of the evidence.
 * Findings progress through a lifecycle: observation → hypothesis → diagnosis.
 */
export interface ObserverFinding {
  /** Unique finding identifier */
  readonly id: string;

  /** Human-readable finding title */
  readonly title: string;

  /** Detailed description of the observation */
  readonly description: string;

  /** Current lifecycle status of this finding */
  readonly status: ObserverFindingStatus;

  /** Severity of the finding (derived from source observations) */
  readonly severity: DiagnosticSeverity;

  /** Confidence score (0-1) reflecting evidence strength */
  readonly confidence: number;

  /** Confidence level label (derived from score) */
  readonly confidenceLevel: ObserverConfidenceLevel;

  /** Source IDs that contributed to this finding */
  readonly sourceIds: readonly string[];

  /** References to diagnostic snapshots that support this finding */
  readonly snapshotRefs: readonly ObserverSnapshotRef[];

  /** References to evidence bundles (FK to PCS-026 VerificationEvidenceBundle.id) */
  readonly evidenceBundleRefs: readonly string[];

  /** ISO-8601 timestamp when this finding was first observed */
  readonly observedAt: string;

  /** ISO-8601 timestamp when this finding was last updated */
  readonly updatedAt: string;

  /** Optional: links to related findings */
  readonly relatedFindingIds?: readonly string[];

  /** Optional: structured data specific to this finding type */
  readonly payload?: JsonRecord;
}

/**
 * OBS-1: Finding lifecycle status.
 * Progression: observation → hypothesis → diagnosis (or rejected/merged).
 */
export type ObserverFindingStatus =
  | 'observation'   // Initial detection, evidence being gathered
  | 'hypothesis'    // Preliminary explanation proposed
  | 'diagnosis'     // Root cause identified and verified
  | 'rejected'      // Finding was invalid or superseded
  | 'merged';       // Finding was merged into another finding

/**
 * OBS-1: Confidence level labels derived from numeric scores.
 */
export type ObserverConfidenceLevel =
  | 'low'          // 0.0 - 0.3: weak evidence, speculative
  | 'moderate'     // 0.3 - 0.6: some evidence, plausible
  | 'high'         // 0.6 - 0.8: strong evidence, likely
  | 'very-high';   // 0.8 - 1.0: overwhelming evidence, near-certain

/**
 * OBS-1: Reference to a diagnostic snapshot within a finding.
 */
export interface ObserverSnapshotRef {
  /** Source ID (DiagnosticSourceRef.id) */
  readonly sourceId: string;

  /** ISO-8601 timestamp of the snapshot (DiagnosticSnapshot.observedAt) */
  readonly observedAt: string;

  /** Brief summary of what the snapshot observed */
  readonly summary: string;

  /** Health state at the time of observation */
  readonly health: DiagnosticSourceHealth;
}

// ─── Observer Configuration ────────────────────────────────────

/**
 * OBS-1: Configuration for the Observer authority.
 * Determines which sources to monitor and how to correlate findings.
 */
export interface ObserverConfig {
  /** Source IDs to monitor (empty = all sources) */
  readonly monitorSources: readonly string[];

  /** Minimum severity to produce a finding */
  readonly minSeverity: DiagnosticSeverity;

  /** Minimum confidence threshold to promote observation → hypothesis */
  readonly minConfidenceForHypothesis: number;

  /** Time window in milliseconds for temporal correlation */
  readonly correlationWindowMs: number;

  /** Maximum number of active findings */
  readonly maxActiveFindings: number;

  /** Whether Observer is enabled */
  readonly enabled: boolean;
}

/**
 * OBS-1: Default Observer configuration.
 */
export const DEFAULT_OBSERVER_CONFIG: ObserverConfig = {
  monitorSources: [],
  minSeverity: 'warning',
  minConfidenceForHypothesis: 0.3,
  correlationWindowMs: 60_000, // 1 minute
  maxActiveFindings: 100,
  enabled: true,
};

// ─── Observer Store ────────────────────────────────────────────

/**
 * OBS-1: Read-only store for Observer findings.
 * Observer cannot write to authority stores (INV-OBS-1).
 */
export interface ObserverFindingStore {
  /** Get a finding by ID */
  getFinding(id: string): Promise<ObserverFinding | null>;

  /** List all findings, optionally filtered by status */
  listFindings(status?: ObserverFindingStatus): Promise<readonly ObserverFinding[]>;

  /** Get findings for a specific source */
  getFindingsBySource(sourceId: string): Promise<readonly ObserverFinding[]>;

  /** Get findings within a time range */
  getFindingsByTimeRange(start: string, end: string): Promise<readonly ObserverFinding[]>;

  /** Get the total count of active findings */
  getActiveCount(): Promise<number>;
}

// ─── Observer Event Types ──────────────────────────────────────

/**
 * OBS-1: Events emitted by the Observer authority.
 * These events are consumed by other authorities (Context Intelligence, etc.)
 * but Observer cannot consume events from authority stores.
 */
export type ObserverEventType =
  | 'finding.created'    // New finding observed
  | 'finding.updated'    // Finding status or confidence changed
  | 'finding.promoted'   // Finding promoted (observation → hypothesis → diagnosis)
  | 'finding.resolved'   // Finding resolved (merged or rejected)
  | 'degradation.detected'; // OBS-4: degradation trend detected
