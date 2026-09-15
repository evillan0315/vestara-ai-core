/**
 * CI-OBS-001C — Observation builder, failure evidence, and client tests.
 *
 * Tests observation construction from normalized entities, failure
 * evidence extraction from steps, and client error handling.
 * No live GitHub access — mocks and fixtures only.
 */

import type { CICheck, CIJob, CIJobId, CIRunId, CIVerificationRun } from '@vestara/ci-contracts';
import { describe, expect, it } from 'vitest';
import type { GitHubCheckRun, GitHubWorkflowJob } from '../src/github-types';
import { buildObservation, extractFailureEvidence, normalizeCheck, normalizeJob } from '../src/normalize';

// ─── Observation builder ────────────────────────────────────────────

function makeRun(overrides: Partial<CIVerificationRun> = {}): CIVerificationRun {
  return {
    runId: '12345' as CIRunId,
    repository: 'owner/repo',
    commitSha: 'abc123',
    status: 'completed',
    conclusion: 'passed',
    attempt: 1,
    discoveredAt: '2026-09-15T00:00:00Z',
    ...overrides,
  };
}

describe('buildObservation', () => {
  it('counts passed checks correctly', () => {
    const run = makeRun();
    const checks: readonly CICheck[] = [
      { checkId: '1', jobId: '1', name: 'lint', status: 'completed', conclusion: 'passed' },
      { checkId: '2', jobId: '1', name: 'test', status: 'completed', conclusion: 'passed' },
      { checkId: '3', jobId: '1', name: 'build', status: 'completed', conclusion: 'passed' },
    ];
    const obs = buildObservation(run, [], checks);
    expect(obs.passedChecks).toBe(3);
    expect(obs.failedChecks).toBe(0);
    expect(obs.skippedChecks).toBe(0);
  });

  it('counts failed checks correctly', () => {
    const run = makeRun({ conclusion: 'failed' });
    const checks: readonly CICheck[] = [
      { checkId: '1', jobId: '1', name: 'lint', status: 'completed', conclusion: 'passed' },
      { checkId: '2', jobId: '1', name: 'test', status: 'completed', conclusion: 'failed' },
    ];
    const obs = buildObservation(run, [], checks);
    expect(obs.passedChecks).toBe(1);
    expect(obs.failedChecks).toBe(1);
  });

  it('counts skipped checks as skipped', () => {
    const run = makeRun();
    const checks: readonly CICheck[] = [
      { checkId: '1', jobId: '1', name: 'lint', status: 'completed', conclusion: 'skipped' },
      { checkId: '2', jobId: '1', name: 'test', status: 'completed', conclusion: 'unknown' },
    ];
    const obs = buildObservation(run, [], checks);
    expect(obs.skippedChecks).toBe(2);
  });

  it('counts cancelled/timed_out as failed', () => {
    const run = makeRun({ conclusion: 'cancelled' });
    const checks: readonly CICheck[] = [
      { checkId: '1', jobId: '1', name: 'lint', status: 'completed', conclusion: 'cancelled' },
      { checkId: '2', jobId: '1', name: 'test', status: 'completed', conclusion: 'timed_out' },
    ];
    const obs = buildObservation(run, [], checks);
    expect(obs.failedChecks).toBe(2);
  });

  it('falls back to job counts when no checks provided', () => {
    const run = makeRun({ conclusion: 'failed' });
    const jobs: readonly CIJob[] = [
      { jobId: '1', runId: '12345', name: 'build', status: 'completed', conclusion: 'passed', attempt: 1 },
      { jobId: '2', runId: '12345', name: 'test', status: 'completed', conclusion: 'failed', attempt: 1 },
    ];
    const obs = buildObservation(run, jobs, []);
    expect(obs.passedChecks).toBe(1);
    expect(obs.failedChecks).toBe(1);
  });

  it('includes provenance URL from run', () => {
    const run = makeRun({ url: 'https://github.com/owner/repo/actions/runs/12345' });
    const obs = buildObservation(run, [], []);
    expect(obs.provenance).toContain('https://github.com/owner/repo/actions/runs/12345');
  });

  it('observation carries commitSha from run', () => {
    const run = makeRun({ commitSha: 'def456' });
    const obs = buildObservation(run, [], []);
    expect(obs.commitSha).toBe('def456');
  });

  it('defaults the trigger to polling (no webhook receiver exists)', () => {
    const obs = buildObservation(makeRun(), [], []);
    expect(obs.trigger).toBe('polling');
  });

  it('honors an explicitly supplied trigger', () => {
    const obs = buildObservation(makeRun(), [], [], 'manual');
    expect(obs.trigger).toBe('manual');
  });
});

// ─── Failure evidence extraction ────────────────────────────────────

describe('extractFailureEvidence', () => {
  it('extracts the first failed step', () => {
    const steps = [
      {
        name: 'Checkout',
        status: 'completed',
        conclusion: 'success',
        number: 1,
        started_at: '2026-09-15T00:00:00Z',
        completed_at: '2026-09-15T00:00:05Z',
      },
      {
        name: 'Install deps',
        status: 'completed',
        conclusion: 'success',
        number: 2,
        started_at: '2026-09-15T00:00:05Z',
        completed_at: '2026-09-15T00:00:30Z',
      },
      {
        name: 'Run tests',
        status: 'completed',
        conclusion: 'failure',
        number: 3,
        started_at: '2026-09-15T00:00:30Z',
        completed_at: '2026-09-15T00:01:00Z',
      },
    ];
    const evidence = extractFailureEvidence(steps, '1' as CIJobId);
    expect(evidence).toBeDefined();
    expect(evidence!.stepName).toBe('Run tests');
    expect(evidence!.kind).toBe('log-excerpt');
    expect(evidence!.summary).toContain('Run tests');
  });

  it('emits a canonical evidence identity derived from provider data', () => {
    const steps = [
      {
        name: 'Run tests',
        status: 'completed',
        conclusion: 'failure',
        number: 3,
        started_at: '2026-09-15T00:00:30Z',
        completed_at: '2026-09-15T00:01:00Z',
      },
    ];
    const evidence = extractFailureEvidence(steps, '67890' as CIJobId);
    expect(evidence!.evidenceId).toBe('gh-evidence-67890-step-3');
    expect(evidence!.capturedAt).toBe('2026-09-15T00:01:00Z');
  });

  it('prefers the provider start timestamp when completion is absent', () => {
    const steps = [
      {
        name: 'Run tests',
        status: 'completed',
        conclusion: 'failure',
        number: 3,
        started_at: '2026-09-15T00:00:30Z',
        completed_at: null,
      },
    ];
    const evidence = extractFailureEvidence(steps, '67890' as CIJobId);
    expect(evidence!.capturedAt).toBe('2026-09-15T00:00:30Z');
  });

  it('returns undefined when no steps failed', () => {
    const steps = [
      { name: 'Checkout', status: 'completed', conclusion: 'success', number: 1, started_at: null, completed_at: null },
      { name: 'Build', status: 'completed', conclusion: 'success', number: 2, started_at: null, completed_at: null },
    ];
    const evidence = extractFailureEvidence(steps, '1' as CIJobId);
    expect(evidence).toBeUndefined();
  });

  it('returns undefined for empty steps array', () => {
    const evidence = extractFailureEvidence([], '1' as CIJobId);
    expect(evidence).toBeUndefined();
  });
});

// ─── Check normalization (genuine job linkage) ──────────────────────

describe('normalizeCheck', () => {
  const mockCheck: GitHubCheckRun = {
    id: 444,
    name: 'test',
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-09-15T10:00:30Z',
    completed_at: '2026-09-15T10:01:00Z',
    url: 'https://api.github.com/repos/owner/repo/check-runs/444',
    html_url: 'https://github.com/owner/repo/runs/444',
  };

  it('carries the caller-supplied parent job ID without invention', () => {
    const result = normalizeCheck(mockCheck, '67890' as CIJobId);
    expect(result.checkId).toBe('444');
    expect(result.jobId).toBe('67890');
    expect(result.name).toBe('test');
    expect(result.status).toBe('completed');
    expect(result.conclusion).toBe('failed');
  });

  it('never defaults the job ID — linkage comes from the caller', () => {
    const a = normalizeCheck(mockCheck, '111' as CIJobId);
    const b = normalizeCheck(mockCheck, '222' as CIJobId);
    expect(a.jobId).toBe('111');
    expect(b.jobId).toBe('222');
  });
});

// ─── Job normalization ──────────────────────────────────────────────

describe('normalizeJob', () => {
  const mockJob: GitHubWorkflowJob = {
    id: 67890,
    run_id: 12345,
    name: 'build-and-test',
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-09-15T10:00:30Z',
    completed_at: '2026-09-15T10:05:00Z',
    url: 'https://api.github.com/repos/owner/repo/actions/jobs/67890',
    html_url: 'https://github.com/owner/repo/actions/runs/12345/job/67890',
    check_run_url: 'https://api.github.com/repos/owner/repo/check-runs/444',
    run_attempt: 1,
    steps: [],
  };

  it('normalizes a successful job', () => {
    const result = normalizeJob(mockJob);
    expect(result.jobId).toBe('67890');
    expect(result.runId).toBe('12345');
    expect(result.name).toBe('build-and-test');
    expect(result.status).toBe('completed');
    expect(result.conclusion).toBe('passed');
    expect(result.rawStatus).toBe('completed');
  });

  it('computes durationMs from start/completion timestamps', () => {
    const result = normalizeJob(mockJob);
    expect(result.durationMs).toBe(270_000); // 4m30s = 270000ms
  });

  it('does not compute durationMs when completed_at is null', () => {
    const runningJob = { ...mockJob, completed_at: null };
    const result = normalizeJob(runningJob);
    expect(result.durationMs).toBeUndefined();
  });

  it('normalizes a failed job', () => {
    const failedJob = { ...mockJob, conclusion: 'failure' };
    const result = normalizeJob(failedJob);
    expect(result.conclusion).toBe('failed');
  });
});

// ─── Client error handling (unit) ───────────────────────────────────

describe('client retrieval failure distinction', () => {
  it('GitHubCIError has isRetrievalFailure: true', async () => {
    // Import the error type directly — we test the structure, not the network
    const { createGitHubCIClient } = await import('../src/client');
    // Create a client with a guaranteed-unreachable base URL
    const client = createGitHubCIClient({
      baseUrl: 'http://127.0.0.1:1', // unreachable
      timeoutMs: 100,
    });
    const result = await client.listWorkflowRuns('owner', 'repo');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.isRetrievalFailure).toBe(true);
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
