/**
 * APE-001 — performance evidence snapshot.
 *
 * One agent run captured as an immutable ADR-012 `EvidenceSnapshot`. The
 * content hash is computed by the verification-evidence kernel so comparisons
 * never trust stored conclusions.
 */

import { type EvidenceSnapshot, snapshotContentHash } from '@vestara/verification-evidence';
import type { AgentPerformanceResults, AgentRole } from './performance-types';

export interface AgentPerformanceIdentity {
  readonly role: AgentRole;
  readonly providerId: string;
  readonly modelId: string;
}

export interface AgentPerformanceExecution {
  readonly workflowId: string;
  /** Comparable scope key (goal/objective id) — comparisons require a matching scope. */
  readonly workflowScope: string;
  readonly objectiveId?: string;
  /** Verification-evidence refs that backed this run (VEF-001). */
  readonly verificationEvidenceRefs: readonly string[];
  /** WFO-001 observation hash backing the conversation metrics. */
  readonly observationHash?: string;
}

export type AgentPerformanceSnapshot = EvidenceSnapshot<
  AgentPerformanceIdentity,
  AgentPerformanceExecution,
  AgentPerformanceResults
>;

export interface PerformanceSnapshotInput {
  readonly identity: AgentPerformanceIdentity;
  readonly execution: AgentPerformanceExecution;
  readonly results: AgentPerformanceResults;
  readonly capturedAt?: string;
}

export const APE_SCHEMA_VERSION = 'ape-001';
export const AGENT_PERFORMANCE_EVIDENCE_TYPE = 'agent-performance';

/** Build an immutable performance snapshot with a deterministic content hash. */
export function performanceSnapshot(input: PerformanceSnapshotInput): AgentPerformanceSnapshot {
  const base = {
    schemaVersion: APE_SCHEMA_VERSION,
    evidenceType: AGENT_PERFORMANCE_EVIDENCE_TYPE,
    identity: input.identity,
    execution: input.execution,
    results: input.results,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
  return { ...base, contentHash: snapshotContentHash(base) };
}
