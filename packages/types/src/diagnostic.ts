/**
 * VESTARA-INTELLIGENCE DIAG-0: Diagnostic Contract Types
 *
 * Defines the minimum stable TypeScript contracts for diagnostics to expose
 * authoritative diagnostic evidence to future consumers. These are type-only
 * contracts — no runtime behavior, no collectors, no persistence.
 *
 * Ownership:
 * - These types define the CONTRACT boundary, not the implementation.
 * - Existing sources retain ownership: collect.ts, M11A instrumentation,
 *   health/readiness mechanisms, logging/telemetry, verification/evidence.
 * - DIAG-0 must not collect, poll, persist, interpret or duplicate source data.
 *
 * Health vocabulary:
 * - DiagnosticSourceHealth uses 'healthy' | 'degraded' | 'unhealthy' | 'unknown'.
 * - This is distinct from HealthCheck.status ('pass' | 'warn' | 'fail' | 'unknown')
 *   in collect.ts. DIAG-1 will implement an explicit mapping/adapter between
 *   source-specific health vocabularies and DiagnosticSourceHealth. Neither
 *   vocabulary is authoritative over the other.
 *
 * Future phases:
 * - DIAG-1 (Snapshot): implements collectors that produce DiagnosticSnapshot
 * - DIAG-2 (Bundle): implements DiagnosticIncidentBundle (deferred from DIAG-0)
 * - DIAG-3 (Correlation): implements DiagnosticCorrelation (deferred from DIAG-0)
 * - DIAG-4 (Timeline): implements DiagnosticIncidentTimeline (deferred from DIAG-0)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 * @see VESTARA-INTELLIGENCE-DEVELOPMENT-PLAN.md M-B1, M-B2
 */

import type { JsonRecord } from './common';

// ─── Source Identity ────────────────────────────────────────────────────────

/**
 * Identifies what is being diagnosed. A diagnostic source is any component,
 * process, module, or subsystem that can be observed for health and state.
 *
 * Source identity is independent of where the data comes from — the same source
 * can be observed by multiple collectors (e.g., M11A instrumentation and
 * process-level health checks both observe the sql.js WASM source).
 */
export interface DiagnosticSourceRef {
  /** Unique identifier for this diagnostic source (e.g., 'sql.js-wasm', 'api-server', 'm9-activity-db') */
  readonly id: string;

  /** What type of source this is */
  readonly kind: DiagnosticSourceKind;

  /** Human-readable name for display (e.g., 'sql.js WASM Module', 'API Server Process') */
  readonly name: string;

  /** Optional component identifier (e.g., package name, route group) */
  readonly component?: string;
}

/**
 * The type of diagnostic source. Each kind implies different observation
 * methods and different failure modes.
 *
 * Not an enum — follows repository convention of string literal unions.
 */
export type DiagnosticSourceKind =
  | 'runtime' // Vestara runtime process (Kernel, services)
  | 'wasm' // WebAssembly module (e.g., sql.js)
  | 'database' // SQLite or other database store
  | 'event-loop' // Node.js event loop health
  | 'provider' // AI provider connection or model availability
  | 'service' // External service dependency
  | 'process' // OS-level process
  | 'network'; // Network connectivity or endpoint reachability

/** Exhaustive list of diagnostic source kinds for runtime iteration */
export const DIAGNOSTIC_SOURCE_KINDS: readonly DiagnosticSourceKind[] = [
  'runtime',
  'wasm',
  'database',
  'event-loop',
  'provider',
  'service',
  'process',
  'network',
] as const;

// ─── Health & Severity ──────────────────────────────────────────────────────

/**
 * The health state of a diagnostic source at a point in time.
 *
 * This represents the SOURCE's own operational state, NOT a root cause
 * diagnosis. A source can be 'unhealthy' without any root cause being known.
 *
 * Preserves INV-REC-1: service recovery and root-cause determination are
 * separate workflows. A source with health 'healthy' may still have an
 * unresolved root cause from a prior incident.
 *
 * Distinguished from:
 * - Root cause (Observer owns analysis)
 * - Verification status (EvidencePipeline/Verifier owns verification)
 * - Operational recovery status (Workflow/Governance owns recovery)
 */
export type DiagnosticSourceHealth =
  | 'healthy' // Source is operating within normal parameters
  | 'degraded' // Source is operating but with reduced capacity, increased latency, or partial failure
  | 'unhealthy' // Source is not operating correctly; may be returning errors or failing requests
  | 'unknown'; // Source health cannot be determined (e.g., observation itself failed)

/** Exhaustive list of source health states for runtime iteration */
export const DIAGNOSTIC_SOURCE_HEALTHS: readonly DiagnosticSourceHealth[] = [
  'healthy',
  'degraded',
  'unhealthy',
  'unknown',
] as const;

/**
 * The severity of a diagnostic observation. Severity reflects impact,
 * not root cause. A 'critical' severity does not imply the root cause
 * is understood — only that the impact is system-threatening.
 */
export type DiagnosticSeverity =
  | 'info' // Informational observation, no impact
  | 'warning' // Potential issue, no immediate impact
  | 'error' // Confirmed issue with measurable impact
  | 'critical'; // System-threatening issue requiring immediate attention

/** Exhaustive list of diagnostic severities for runtime iteration */
export const DIAGNOSTIC_SEVERITIES: readonly DiagnosticSeverity[] = ['info', 'warning', 'error', 'critical'] as const;

// ─── Evidence References ────────────────────────────────────────────────────

/**
 * Reference to evidence in a PCS-026 VerificationEvidenceBundle.
 *
 * Diagnostic contracts reference evidence by reference (FK), never by value.
 * This preserves evidence authority: the bundle is the single source of truth
 * for evidence content, provenance, and confidence.
 *
 * Field authority:
 * - bundleId: FK to VerificationEvidenceBundle.id. PCS-026 is authoritative for
 *   bundle content, provenance, and confidence. DIAG-0 references only.
 * - evidenceRef: FK to EvidenceReference.ref (content-addressed digest). The
 *   evidence store is authoritative for content. DIAG-0 references only.
 * - evidenceKind: mirrors EvidenceReference.kind for consumer convenience. The
 *   evidence bundle is authoritative; this is a derived reference, not a copy.
 * - producedAt: the evidence's own production timestamp (from EvidenceProvenance.createdAt).
 *   Distinguished from DiagnosticSnapshot.observedAt (when the diagnostic observation
 *   was made). These are independent timestamps — evidence may have been produced
 *   before the diagnostic observation that references it.
 * - summary: describes the diagnostic RELEVANCE of this evidence to the observation
 *   (why this evidence matters), NOT the evidence's own content summary. The evidence
 *   bundle's EvidenceReference.summary is authoritative for evidence content.
 *
 * @see packages/evidence/src/types.ts — EvidenceReference, VerificationEvidenceBundle, EvidenceProvenance
 */
export interface DiagnosticEvidenceRef {
  /** FK to VerificationEvidenceBundle.id — PCS-026 is authoritative for bundle content */
  readonly bundleId: string;

  /** FK to EvidenceReference.ref — content-addressed digest (SHA-256) within the bundle */
  readonly evidenceRef: string;

  /** Derived from EvidenceReference.kind for consumer convenience — evidence bundle is authoritative */
  readonly evidenceKind: string;

  /** Diagnostic relevance of this evidence to the observation (NOT the evidence's own content summary) */
  readonly summary: string;

  /** Evidence production timestamp (from EvidenceProvenance.createdAt) — distinct from DiagnosticSnapshot.observedAt */
  readonly producedAt: string;
}

// ─── Snapshot (Bounded Representation) ──────────────────────────────────────

/**
 * A bounded, point-in-time representation of a diagnostic source's state.
 *
 * This is the primary DIAG-0 contract. DIAG-1 (M-B2) will implement
 * collectors that produce DiagnosticSnapshot records. DIAG-0 defines
 * the shape; DIAG-1 fills it.
 *
 * Design constraints:
 * - Cannot represent root cause (Observer owns analysis)
 * - Cannot represent recovery status (Workflow/Governance owns recovery)
 * - Cannot represent verification outcome (EvidencePipeline owns verification)
 * - CAN represent: what the source is, how healthy it is, how severe
 *   the observation is, what evidence supports it, and when it was observed
 *
 * The M11C WASM incident specimen:
 * - source: { id: 'sql.js-wasm', kind: 'wasm', name: 'sql.js WASM Module' }
 * - health: 'unhealthy'
 * - severity: 'critical'
 * - message: 'RuntimeError: memory access out of bounds'
 * - observedAt: '2026-08-30T...' (when the error was observed)
 * - evidenceRefs: [...] (links to M11A instrumentation snapshot, process memory)
 */
export interface DiagnosticSnapshot {
  /** The source being diagnosed */
  readonly source: DiagnosticSourceRef;

  /** Health state of the source at the time of this snapshot */
  readonly health: DiagnosticSourceHealth;

  /** Severity of the observation */
  readonly severity: DiagnosticSeverity;

  /** Human-readable description of what was observed (NO raw stack traces, secrets, or credentials) */
  readonly message: string;

  /** ISO-8601 timestamp of when this observation was made (distinct from DiagnosticEvidenceRef.producedAt) */
  readonly observedAt: string;

  /** References to supporting evidence in PCS-026 bundles (optional — not all observations have evidence) */
  readonly evidenceRefs?: readonly DiagnosticEvidenceRef[];

  /**
   * Bounded structured diagnostic measurement data specific to the source kind.
   * Uses JsonValue (from common.ts) — the existing safe structured-value contract.
   *
   * FORBIDDEN in payload:
   * - Logs, log entries, or log fragments
   * - Stack traces, exceptions, or error objects
   * - Secrets, credentials, tokens, API keys, passwords
   * - Complete source objects, full database rows, or full API responses
   * - Evidence bundles or embedded evidence content
   * - Command strings, execution payloads, or shell commands
   * - Arbitrary unbounded subsystem state
   *
   * ALLOWED in payload:
   * - Numeric measurements (heapUsedBytes, latencyMs, pollCount)
   * - Bounded string identifiers (processId, endpoint)
   * - Boolean flags (isConnected, isHealthy)
   * - Small structured objects with string keys and safe values
   *
   * Example: { heapUsedBytes: 892000000, watcherErrorCount: 3, avgLatencyMs: 12.5 }
   */
  readonly payload?: JsonRecord;
}

// ─── DIAG-2: Incident Bundle ───────────────────────────────────────────────

/**
 * DIAG-2: Incident-scoped collection of snapshots, correlated events,
 * and evidence bundle references.
 *
 * An incident bundle represents a bounded diagnostic incident — a period
 * during which related diagnostic observations are grouped together for
 * analysis. The bundle references (never contains) evidence from PCS-026
 * and snapshots from DIAG-1.
 *
 * Design constraints:
 * - References evidence by FK (bundleId), never by value
 * - References snapshots by reference, not embedded copies
 * - Lifecycle: `open` → `closing` → `closed` (or `discarded`)
 * - Root cause is NOT in the bundle (Observer owns analysis)
 * - Recovery status is NOT in the bundle (Workflow/Governance owns recovery)
 */
export interface DiagnosticIncidentBundle {
  /** Unique incident identifier */
  readonly id: string;

  /** Human-readable incident title */
  readonly title: string;

  /** Incident lifecycle status */
  readonly status: DiagnosticIncidentStatus;

  /** Severity of the incident (highest observed severity across bundled snapshots) */
  readonly severity: DiagnosticSeverity;

  /** ISO-8601 timestamp when the incident was first detected */
  readonly detectedAt: string;

  /** ISO-8601 timestamp when the incident status last changed */
  readonly updatedAt: string;

  /** ISO-8601 timestamp when the incident was closed/discarded (null if still open) */
  readonly closedAt?: string;

  /** Source IDs involved in this incident */
  readonly sourceIds: readonly string[];

  /** References to bundled snapshots (FK to DiagnosticSnapshot.source.id + observedAt) */
  readonly snapshotRefs: readonly DiagnosticSnapshotRef[];

  /** References to correlated evidence bundles (FK to PCS-026 VerificationEvidenceBundle.id) */
  readonly evidenceBundleRefs: readonly string[];

  /** Optional human-readable description of the incident */
  readonly description?: string;

  /** Optional tags for categorization */
  readonly tags?: readonly string[];
}

/** Incident lifecycle status */
export type DiagnosticIncidentStatus = 'open' | 'closing' | 'closed' | 'discarded';

/** Reference to a diagnostic snapshot within an incident bundle */
export interface DiagnosticSnapshotRef {
  /** Source ID (DiagnosticSourceRef.id) */
  readonly sourceId: string;

  /** ISO-8601 timestamp of the snapshot (DiagnosticSnapshot.observedAt) */
  readonly observedAt: string;

  /** Brief summary of what the snapshot observed */
  readonly summary: string;
}

// ─── DIAG-3: Correlation ───────────────────────────────────────────────────

/**
 * DIAG-3: Incident-scoped correlation linking related diagnostic events
 * to incident IDs.
 *
 * Correlation rules determine which diagnostic observations belong to the
 * same incident. Rules are evaluated against incoming snapshots to group
 * related observations.
 */
export interface DiagnosticCorrelation {
  /** Unique correlation rule identifier */
  readonly id: string;

  /** Human-readable rule description */
  readonly description: string;

  /** The correlation strategy used */
  readonly strategy: DiagnosticCorrelationStrategy;

  /** Time window in milliseconds for temporal correlation */
  readonly windowMs: number;

  /** Source kinds this rule applies to (empty = all kinds) */
  readonly sourceKinds: readonly DiagnosticSourceKind[];

  /** Whether this rule is active */
  readonly active: boolean;
}

/** Correlation strategy types */
export type DiagnosticCorrelationStrategy =
  | 'temporal' // Time-proximate observations (within windowMs)
  | 'source' // Same source ID
  | 'severity' // Same or escalating severity
  | 'evidence'; // Shared evidence references

// ─── DIAG-4: Incident Timeline ─────────────────────────────────────────────

/**
 * DIAG-4: Ordered sequence of diagnostic events for a given incident.
 *
 * The timeline provides a time-ordered view of all events related to
 * an incident, enabling historical analysis and root-cause investigation.
 */
export interface DiagnosticIncidentTimeline {
  /** Incident ID (FK to DiagnosticIncidentBundle.id) */
  readonly incidentId: string;

  /** Time-ordered events in this timeline */
  readonly events: readonly DiagnosticTimelineEvent[];

  /** ISO-8601 timestamp of the earliest event */
  readonly startedAt: string;

  /** ISO-8601 timestamp of the latest event */
  readonly endedAt: string;
}

/** A single event in an incident timeline */
export interface DiagnosticTimelineEvent {
  /** Unique event identifier */
  readonly id: string;

  /** ISO-8601 timestamp of the event */
  readonly timestamp: string;

  /** The type of event */
  readonly type: DiagnosticTimelineEventType;

  /** Source ID that produced this event */
  readonly sourceId: string;

  /** Human-readable event description */
  readonly message: string;

  /** Optional severity at the time of this event */
  readonly severity?: DiagnosticSeverity;

  /** Optional reference to a snapshot (DiagnosticSnapshotRef) */
  readonly snapshotRef?: DiagnosticSnapshotRef;

  /** Optional reference to an evidence bundle (FK to PCS-026) */
  readonly evidenceBundleRef?: string;
}

/** Timeline event types */
export type DiagnosticTimelineEventType =
  | 'observed' // A diagnostic observation was made
  | 'escalated' // Severity increased
  | 'de-escalated' // Severity decreased
  | 'correlated' // Event was linked to an incident
  | 'evidence' // Evidence was attached
  | 'status'; // Incident status changed
