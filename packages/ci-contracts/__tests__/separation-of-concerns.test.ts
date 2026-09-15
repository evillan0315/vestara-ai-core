/**
 * CI-OBS-001B — Separation of observation / evidence / hypothesis / finding.
 *
 * These four concepts must remain structurally distinct. One must not be
 * substitutable for another at the type level.
 *
 * Invariants:
 *   - Observation ≠ Hypothesis ≠ Finding
 *   - Claim ≠ Evidence
 *   - Classification is a finding, not authority
 *   - Observation must not confer mutation authority
 */
import { describe, expect, it } from 'vitest';
import { hasFailureEvidence, isTerminalCheck } from '../src/check';
import type { CIFailureEvidence } from '../src/evidence';
import type { CIFinding } from '../src/finding';
import type { CIHypothesis } from '../src/hypothesis';
import type { CIObservation } from '../src/observation';
import { isFailedRun, isPassedRun, isRerun, isTerminalRun } from '../src/run';

describe('structural separation', () => {
  it('CIObservation has observation-specific fields', () => {
    const obs: CIObservation = {
      observationId: 'obs-1',
      runId: 'run-1',
      commitSha: 'abc123',
      status: 'completed',
      conclusion: 'failed',
      passedChecks: 3,
      failedChecks: 1,
      skippedChecks: 0,
      trigger: 'post-push',
      observedAt: '2026-09-15T00:00:00Z',
      provenance: ['https://example.com/run/1'],
    };
    // Observation carries counts and trigger, not classification
    expect(obs.passedChecks).toBe(3);
    expect(obs.failedChecks).toBe(1);
    expect(obs.trigger).toBe('post-push');
    // Observation does NOT have classification, confidence, or recommendation
    expect('classification' in obs).toBe(false);
    expect('confidence' in obs).toBe(false);
    expect('recommendation' in obs).toBe(false);
  });

  it('CIFailureEvidence has evidence-specific fields', () => {
    const ev: CIFailureEvidence = {
      evidenceId: 'ev-1',
      kind: 'log-excerpt',
      summary: 'Worker exited unexpectedly',
      logContent: 'Error: worker exited with code 1',
      stepName: 'unit-tests',
      capturedAt: '2026-09-15T00:00:00Z',
    };
    // Evidence carries raw data, not interpretation
    expect(ev.kind).toBe('log-excerpt');
    expect(ev.logContent).toBeDefined();
    // Evidence does NOT have classification or hypothesis
    expect('classification' in ev).toBe(false);
    expect('hypothesis' in ev).toBe(false);
  });

  it('CIHypothesis has hypothesis-specific fields', () => {
    const hyp: CIHypothesis = {
      hypothesisId: 'hyp-1',
      statement: 'Resource exhaustion caused worker exit',
      status: 'proposed',
      evidenceIds: ['ev-1'],
      proposedAt: '2026-09-15T00:00:00Z',
      updatedAt: '2026-09-15T00:00:00Z',
    };
    // Hypothesis carries statement and status, not raw evidence content
    expect(hyp.statement).toContain('Resource exhaustion');
    expect(hyp.status).toBe('proposed');
    // Hypothesis does NOT have logContent or stepName
    expect('logContent' in hyp).toBe(false);
    expect('stepName' in hyp).toBe(false);
  });

  it('CIFinding has finding-specific fields', () => {
    const finding: CIFinding = {
      findingId: 'find-1',
      title: 'Worker exited unexpectedly',
      description: 'Vitest worker exited during test execution',
      status: 'open',
      classification: 'UNKNOWN',
      severity: 'major',
      evidenceIds: ['ev-1'],
      commitSha: 'abc123',
      confidence: 'low',
      createdAt: '2026-09-15T00:00:00Z',
      updatedAt: '2026-09-15T00:00:00Z',
    };
    // Finding carries classification and confidence
    expect(finding.classification).toBe('UNKNOWN');
    expect(finding.confidence).toBe('low');
    // Finding does NOT have logContent or trigger
    expect('logContent' in finding).toBe(false);
    expect('trigger' in finding).toBe(false);
  });

  it('observation cannot be used as finding (structural)', () => {
    const obs: CIObservation = {
      observationId: 'obs-1',
      runId: 'run-1',
      commitSha: 'abc123',
      status: 'completed',
      conclusion: 'failed',
      passedChecks: 3,
      failedChecks: 1,
      skippedChecks: 0,
      trigger: 'post-push',
      observedAt: '2026-09-15T00:00:00Z',
      provenance: [],
    };
    // Observation lacks required finding fields
    expect('classification' in obs).toBe(false);
    expect('confidence' in obs).toBe(false);
    expect('recommendation' in obs).toBe(false);
  });

  it('evidence cannot be used as hypothesis (structural)', () => {
    const ev: CIFailureEvidence = {
      evidenceId: 'ev-1',
      kind: 'error-message',
      summary: 'Test failed',
      capturedAt: '2026-09-15T00:00:00Z',
    };
    // Evidence lacks required hypothesis fields
    expect('statement' in ev).toBe(false);
    expect('status' in ev).toBe(false);
  });
});

describe('invariant enforcement', () => {
  it('classification on finding is informational, not authoritative', () => {
    // A finding with classification UNKNOWN explicitly says "we don't know"
    const finding: CIFinding = {
      findingId: 'find-2',
      title: 'Unknown failure',
      description: 'Could not determine cause',
      status: 'open',
      classification: 'UNKNOWN',
      severity: 'info',
      evidenceIds: [],
      commitSha: 'abc123',
      confidence: 'low',
      createdAt: '2026-09-15T00:00:00Z',
      updatedAt: '2026-09-15T00:00:00Z',
    };
    // UNKNOWN classification + low confidence = we genuinely don't know
    expect(finding.classification).toBe('UNKNOWN');
    expect(finding.confidence).toBe('low');
    // No recommendation on UNKNOWN finding
    expect(finding.recommendation).toBeUndefined();
  });

  it('hypothesis rejection does not imply root cause', () => {
    const hyp: CIHypothesis = {
      hypothesisId: 'hyp-2',
      statement: 'Stale contracts caused failure',
      status: 'rejected',
      evidenceIds: ['ev-2'],
      proposedAt: '2026-09-15T00:00:00Z',
      updatedAt: '2026-09-15T00:00:00Z',
      testedAtCommit: 'def456',
      resolution: 'Evidence contradicts — contracts were byte-identical',
    };
    // Rejected hypothesis means "this explanation is wrong"
    // It does NOT mean "we know the real cause"
    expect(hyp.status).toBe('rejected');
    expect(hyp.resolution).toContain('contradicts');
  });
});

describe('provider-native provenance boundary', () => {
  it('CIVerificationRun has raw fields for provenance, but canonical helpers ignore them', () => {
    const run = {
      runId: 'run-1',
      repository: 'owner/repo',
      commitSha: 'abc123',
      status: 'completed',
      conclusion: 'passed',
      attempt: 1,
      discoveredAt: '2026-09-15T00:00:00Z',
      completedAt: '2026-09-15T00:01:00Z',
      rawStatus: 'success',
      rawConclusion: 'SUCCESS',
    };
    // Canonical logic operates on status/conclusion, NOT rawStatus/rawConclusion
    expect(isTerminalRun(run)).toBe(true);
    expect(isPassedRun(run)).toBe(true);
    expect(isFailedRun(run)).toBe(false);
    expect(isRerun(run)).toBe(false);
    // Raw fields exist for provenance but do not affect canonical behavior
    expect(run.rawStatus).toBe('success');
    expect(run.rawConclusion).toBe('SUCCESS');
  });

  it('CICheck has raw fields for provenance, but canonical logic ignores them', () => {
    const check = {
      checkId: 'check-1',
      jobId: 'job-1',
      name: 'unit tests',
      status: 'completed',
      conclusion: 'failed',
      rawStatus: 'failure',
      rawConclusion: 'FAILURE',
    };
    // Canonical logic ignores rawStatus/rawConclusion
    expect(isTerminalCheck(check)).toBe(true);
    expect(hasFailureEvidence(check)).toBe(false);
  });
});
