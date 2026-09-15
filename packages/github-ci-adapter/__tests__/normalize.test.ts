/**
 * CI-OBS-001C — GitHub → CI contract normalization tests.
 *
 * Tests the pure normalization functions that translate GitHub Actions
 * API response shapes into canonical @vestara/ci-contracts.
 * No live GitHub access — fixtures only.
 */

import { describe, expect, it } from 'vitest';
import type { GitHubWorkflowRun } from '../src/github-types';
import {
  normalizeCheckConclusion,
  normalizeCheckStatus,
  normalizeJobConclusion,
  normalizeJobStatus,
  normalizeRun,
  normalizeRunConclusion,
  normalizeRunStatus,
  normalizeStepConclusion,
} from '../src/normalize';

// ─── Run status normalization ───────────────────────────────────────

describe('normalizeRunStatus', () => {
  it('maps completed → completed', () => {
    expect(normalizeRunStatus('completed')).toBe('completed');
  });

  it('maps queued/waiting/pending/requested → queued', () => {
    expect(normalizeRunStatus('queued')).toBe('queued');
    expect(normalizeRunStatus('waiting')).toBe('queued');
    expect(normalizeRunStatus('pending')).toBe('queued');
    expect(normalizeRunStatus('requested')).toBe('queued');
  });

  it('maps in_progress/started → running', () => {
    expect(normalizeRunStatus('in_progress')).toBe('running');
    expect(normalizeRunStatus('started')).toBe('running');
  });

  it('maps unknown statuses → discovered (weakest assertion, not running)', () => {
    expect(normalizeRunStatus('unknown_status')).toBe('discovered');
    expect(normalizeRunStatus('')).toBe('discovered');
  });
});

describe('normalizeJobStatus', () => {
  it('maps completed → completed', () => {
    expect(normalizeJobStatus('completed')).toBe('completed');
  });

  it('maps queued → queued', () => {
    expect(normalizeJobStatus('queued')).toBe('queued');
  });

  it('maps in_progress → running', () => {
    expect(normalizeJobStatus('in_progress')).toBe('running');
  });

  it('maps unknown → discovered (weakest assertion)', () => {
    expect(normalizeJobStatus('unknown')).toBe('discovered');
  });
});

describe('normalizeCheckStatus', () => {
  it('maps completed → completed', () => {
    expect(normalizeCheckStatus('completed')).toBe('completed');
  });

  it('maps queued → queued', () => {
    expect(normalizeCheckStatus('queued')).toBe('queued');
  });

  it('maps in_progress → running', () => {
    expect(normalizeCheckStatus('in_progress')).toBe('running');
  });
});

// ─── Conclusion normalization ───────────────────────────────────────

describe('normalizeRunConclusion', () => {
  it('maps success → passed', () => {
    expect(normalizeRunConclusion('success')).toBe('passed');
  });

  it('maps failure → failed', () => {
    expect(normalizeRunConclusion('failure')).toBe('failed');
  });

  it('maps cancelled → cancelled', () => {
    expect(normalizeRunConclusion('cancelled')).toBe('cancelled');
  });

  it('maps timed_out → timed_out', () => {
    expect(normalizeRunConclusion('timed_out')).toBe('timed_out');
  });

  it('maps skipped → skipped', () => {
    expect(normalizeRunConclusion('skipped')).toBe('skipped');
  });

  it('maps action_required → failed', () => {
    expect(normalizeRunConclusion('action_required')).toBe('failed');
  });

  it('maps neutral/stale → unknown (no clean mapping)', () => {
    expect(normalizeRunConclusion('neutral')).toBe('unknown');
    expect(normalizeRunConclusion('stale')).toBe('unknown');
  });

  it('maps null/undefined → unknown (run not yet completed)', () => {
    expect(normalizeRunConclusion(null)).toBe('unknown');
    expect(normalizeRunConclusion(undefined)).toBe('unknown');
  });

  it('maps unrecognized values → unknown', () => {
    expect(normalizeRunConclusion('something_new')).toBe('unknown');
  });
});

describe('normalizeJobConclusion', () => {
  it('maps success → passed, failure → failed', () => {
    expect(normalizeJobConclusion('success')).toBe('passed');
    expect(normalizeJobConclusion('failure')).toBe('failed');
  });

  it('maps null → unknown', () => {
    expect(normalizeJobConclusion(null)).toBe('unknown');
  });
});

describe('normalizeCheckConclusion', () => {
  it('maps success → passed, failure → failed', () => {
    expect(normalizeCheckConclusion('success')).toBe('passed');
    expect(normalizeCheckConclusion('failure')).toBe('failed');
  });

  it('maps neutral/stale → unknown', () => {
    expect(normalizeCheckConclusion('neutral')).toBe('unknown');
    expect(normalizeCheckConclusion('stale')).toBe('unknown');
  });

  it('maps null → unknown', () => {
    expect(normalizeCheckConclusion(null)).toBe('unknown');
  });
});

describe('normalizeStepConclusion', () => {
  it('maps success/failure correctly', () => {
    expect(normalizeStepConclusion('success')).toBe('passed');
    expect(normalizeStepConclusion('failure')).toBe('failed');
  });

  it('maps null → unknown', () => {
    expect(normalizeStepConclusion(null)).toBe('unknown');
  });
});

// ─── Run normalization (full entity) ────────────────────────────────

describe('normalizeRun', () => {
  const mockRun: GitHubWorkflowRun = {
    id: 12345,
    name: 'build-and-test',
    node_id: 'MDg6V29ya2Zsb3dSdW4xMjM0NQ==',
    run_number: 42,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    workflow_id: 678,
    check_suite_id: 999,
    check_suite_node_id: 'CS_xxx',
    url: 'https://api.github.com/repos/owner/repo/actions/runs/12345',
    html_url: 'https://github.com/owner/repo/actions/runs/12345',
    created_at: '2026-09-15T10:00:00Z',
    updated_at: '2026-09-15T10:05:00Z',
    run_started_at: '2026-09-15T10:00:30Z',
    jobs_url: 'https://api.github.com/repos/owner/repo/actions/runs/12345/jobs',
    logs_url: 'https://api.github.com/repos/owner/repo/actions/runs/12345/logs',
    artifacts_url: 'https://api.github.com/repos/owner/repo/actions/runs/12345/artifacts',
    head_branch: 'main',
    head_sha: 'abc123def456abc123def456abc123def456abc1',
    repository: {
      id: 1,
      name: 'repo',
      full_name: 'owner/repo',
      owner: { login: 'owner' },
    },
    attempt: 1,
  };

  it('normalizes a successful completed run', () => {
    const result = normalizeRun(mockRun);
    expect(result.runId).toBe('12345');
    expect(result.repository).toBe('owner/repo');
    expect(result.commitSha).toBe('abc123def456abc123def456abc123def456abc1');
    expect(result.branch).toBe('main');
    expect(result.status).toBe('completed');
    expect(result.conclusion).toBe('passed');
    expect(result.attempt).toBe(1);
    expect(result.provider).toBe('github-actions');
    expect(result.workflowName).toBe('build-and-test');
  });

  it('preserves GitHub-native values as provenance', () => {
    const result = normalizeRun(mockRun);
    expect(result.rawStatus).toBe('completed');
    expect(result.rawConclusion).toBe('success');
    expect(result.url).toBe('https://github.com/owner/repo/actions/runs/12345');
  });

  it('sets completedAt when status is completed', () => {
    const result = normalizeRun(mockRun);
    expect(result.completedAt).toBe('2026-09-15T10:05:00Z');
  });

  it('does not set completedAt when status is not completed', () => {
    const runningRun = { ...mockRun, status: 'in_progress', conclusion: null };
    const result = normalizeRun(runningRun);
    expect(result.completedAt).toBeUndefined();
  });

  it('normalizes a failed run', () => {
    const failedRun = { ...mockRun, conclusion: 'failure' };
    const result = normalizeRun(failedRun);
    expect(result.conclusion).toBe('failed');
    expect(result.rawConclusion).toBe('failure');
  });

  it('normalizes a cancelled run', () => {
    const cancelledRun = { ...mockRun, conclusion: 'cancelled' };
    const result = normalizeRun(cancelledRun);
    expect(result.conclusion).toBe('cancelled');
  });

  it('normalizes a timed_out run', () => {
    const timedOutRun = { ...mockRun, conclusion: 'timed_out' };
    const result = normalizeRun(timedOutRun);
    expect(result.conclusion).toBe('timed_out');
  });

  it('normalizes a neutral conclusion to unknown', () => {
    const neutralRun = { ...mockRun, conclusion: 'neutral' };
    const result = normalizeRun(neutralRun);
    expect(result.conclusion).toBe('unknown');
  });

  it('preserves attempt number', () => {
    const rerun = { ...mockRun, attempt: 3 };
    const result = normalizeRun(rerun);
    expect(result.attempt).toBe(3);
  });

  it('defaults attempt to 1 when missing', () => {
    const noAttempt = { ...mockRun, attempt: undefined };
    const result = normalizeRun(noAttempt as any);
    expect(result.attempt).toBe(1);
  });
});

// ─── UNKNOWN preservation ───────────────────────────────────────────

describe('UNKNOWN preservation', () => {
  it('null conclusion maps to unknown', () => {
    expect(normalizeRunConclusion(null)).toBe('unknown');
    expect(normalizeJobConclusion(null)).toBe('unknown');
    expect(normalizeCheckConclusion(null)).toBe('unknown');
  });

  it('undefined conclusion maps to unknown', () => {
    expect(normalizeRunConclusion(undefined)).toBe('unknown');
  });

  it('unrecognized conclusion maps to unknown', () => {
    expect(normalizeRunConclusion('new_github_status')).toBe('unknown');
    expect(normalizeJobConclusion('new_github_status')).toBe('unknown');
    expect(normalizeCheckConclusion('new_github_status')).toBe('unknown');
  });

  it('neutral/stale (no clean mapping) map to unknown', () => {
    expect(normalizeRunConclusion('neutral')).toBe('unknown');
    expect(normalizeRunConclusion('stale')).toBe('unknown');
    expect(normalizeCheckConclusion('neutral')).toBe('unknown');
    expect(normalizeCheckConclusion('stale')).toBe('unknown');
  });
});

// ─── Incomplete/missing data ────────────────────────────────────────

describe('incomplete data handling', () => {
  it('run with missing branch does not error', () => {
    const run: GitHubWorkflowRun = {
      id: 1,
      name: 'test',
      node_id: 'x',
      run_number: 1,
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      workflow_id: 1,
      check_suite_id: 1,
      check_suite_node_id: 'x',
      url: 'https://api.github.com/test',
      html_url: 'https://github.com/test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:01:00Z',
      jobs_url: '',
      logs_url: '',
      artifacts_url: '',
      head_branch: '',
      head_sha: 'abc123def456abc123def456abc123def456abc1',
      repository: { id: 1, name: 'repo', full_name: 'owner/repo', owner: { login: 'owner' } },
      attempt: 1,
    };
    const result = normalizeRun(run);
    expect(result.branch).toBeUndefined();
  });

  it('run with missing run_started_at does not error', () => {
    const run: GitHubWorkflowRun = {
      id: 1,
      name: 'test',
      node_id: 'x',
      run_number: 1,
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      workflow_id: 1,
      check_suite_id: 1,
      check_suite_node_id: 'x',
      url: 'https://api.github.com/test',
      html_url: 'https://github.com/test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:01:00Z',
      jobs_url: '',
      logs_url: '',
      artifacts_url: '',
      head_branch: 'main',
      head_sha: 'abc123def456abc123def456abc123def456abc1',
      repository: { id: 1, name: 'repo', full_name: 'owner/repo', owner: { login: 'owner' } },
      attempt: 1,
    };
    const result = normalizeRun(run);
    expect(result.startedAt).toBeUndefined();
  });
});
