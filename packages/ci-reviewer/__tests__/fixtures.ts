/**
 * CI-OBS-001D — Shared fixtures for Reviewer kernel tests.
 * Deterministic builders over frozen 001B contracts. No IO, no clock reads
 * beyond fixed ISO strings.
 */

import type { CIFailureEvidence, CIObservation } from '@vestara/ci-contracts';
import type { PriorRecord } from '../src/types';

export function makeObservation(overrides: Partial<CIObservation> = {}): CIObservation {
  return {
    observationId: 'obs-1',
    runId: 'run-1',
    commitSha: 'abc123',
    status: 'completed',
    conclusion: 'failed',
    passedChecks: 0,
    failedChecks: 1,
    skippedChecks: 0,
    trigger: 'polling',
    observedAt: '2026-09-15T10:05:00Z',
    provenance: ['https://github.com/o/r/actions/runs/999'],
    ...overrides,
  };
}

export function makeEvidence(overrides: Partial<CIFailureEvidence> = {}): CIFailureEvidence {
  return {
    evidenceId: 'ev-1',
    kind: 'log-excerpt',
    summary: 'Step "Test" failed',
    stepName: 'Test',
    capturedAt: '2026-09-15T10:01:00Z',
    ...overrides,
  };
}

export function makePrior(overrides: Partial<PriorRecord> = {}): PriorRecord {
  return {
    priorId: 'hyp-old-1',
    kind: 'hypothesis',
    recordedStatus: 'rejected',
    scopeKeys: { runId: 'run-1', commitSha: 'abc123' },
    summaryOrRef: 'Prior hypothesis: flaky runner.',
    ...overrides,
  };
}
