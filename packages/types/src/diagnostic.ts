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

// ─── Deferred Contracts ─────────────────────────────────────────────────────

/**
 * DIAG-2/3/4 contracts are deferred from DIAG-0 because their semantics
 * cannot be fully specified without implementation experience from DIAG-1.
 *
 * Deferred:
 * - DiagnosticIncidentBundle (DIAG-2): incident-scoped collection of snapshots,
 *   correlated events, evidence bundle references. Requires understanding of
 *   how incidents are identified and bounded.
 * - DiagnosticCorrelation (DIAG-3): incident-scoped correlation rules linking
 *   related events to incident IDs. Requires understanding of correlation
 *   semantics and temporal ordering.
 * - DiagnosticIncidentTimeline (DIAG-4): ordered sequence of diagnostic events
 *   for a given incident. Requires understanding of timeline construction
 *   and time-sliced querying.
 *
 * These will be defined in their respective M-B2 phases after DIAG-1
 * establishes the snapshot foundation.
 */
