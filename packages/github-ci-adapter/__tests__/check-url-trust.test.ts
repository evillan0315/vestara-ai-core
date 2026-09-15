/**
 * CI-OBS-001C MAJOR-1 — Provider-URL trust boundary tests.
 *
 * The client follows provider-returned absolute check_run_url values.
 * These tests pin the security boundary: https-only, same-origin with
 * the configured base URL, no credential forwarding off-origin, and
 * refusals surfacing as retrieval failures (never CI failures).
 * No live GitHub access — mocked fetch only.
 */

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubCIClient } from '../src/client';
import type { GitHubCheckRun, GitHubWorkflowJob } from '../src/github-types';

const SECRET = 'ghp_test_token_must_never_leave_origin';

interface RecordedCall {
  url: string;
  init?: { headers?: Record<string, string> };
}

function makeFetchMock(jobs: readonly GitHubWorkflowJob[], checksByUrl: Record<string, GitHubCheckRun>) {
  const calls: RecordedCall[] = [];
  const mock = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, init });
    if (url.includes('/actions/runs/') && url.endsWith('/jobs')) {
      return { ok: true, json: async () => ({ total_count: jobs.length, jobs }) } as Response;
    }
    const check = checksByUrl[url];
    if (check) {
      return { ok: true, json: async () => check } as Response;
    }
    return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) } as Response;
  });
  return { mock, calls };
}

function makeJob(overrides: Partial<GitHubWorkflowJob> = {}): GitHubWorkflowJob {
  return {
    id: 111,
    run_id: 999,
    name: 'build',
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-09-15T10:00:30Z',
    completed_at: '2026-09-15T10:05:00Z',
    url: 'https://api.github.com/repos/o/r/actions/jobs/111',
    html_url: 'https://github.com/o/r/actions/runs/999/job/111',
    check_run_url: 'https://api.github.com/repos/o/r/check-runs/444',
    run_attempt: 1,
    steps: [],
    ...overrides,
  };
}

function makeCheck(overrides: Partial<GitHubCheckRun> = {}): GitHubCheckRun {
  return {
    id: 444,
    name: 'build',
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-09-15T10:00:30Z',
    completed_at: '2026-09-15T10:01:00Z',
    url: 'https://api.github.com/repos/o/r/check-runs/444',
    html_url: 'https://github.com/o/r/runs/444',
    ...overrides,
  };
}

function authTargets(calls: readonly RecordedCall[]): string[] {
  return calls.filter((c) => c.init?.headers?.Authorization !== undefined).map((c) => new URL(c.url).origin);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('check_run_url trust boundary', () => {
  it('follows a valid same-origin HTTPS check_run_url with genuine job linkage', async () => {
    const jobs = [makeJob()];
    const checksByUrl = { 'https://api.github.com/repos/o/r/check-runs/444': makeCheck() };
    const { mock, calls } = makeFetchMock(jobs, checksByUrl);
    vi.stubGlobal('fetch', mock);

    const client = createGitHubCIClient({ token: SECRET });
    const result = await client.listChecksForRun('o', 'r', 999);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].jobId).toBe('111');
    expect(result.data[0].checkId).toBe('444');
    // Credentials DO go to the trusted origin — the API needs them.
    expect(authTargets(calls)).toContain('https://api.github.com');
  });

  it('rejects a foreign-host check_run_url as a retrieval failure', async () => {
    const jobs = [makeJob({ id: 222, check_run_url: 'https://evil.example/check-runs/1' })];
    const { mock, calls } = makeFetchMock(jobs, {});
    vi.stubGlobal('fetch', mock);

    const client = createGitHubCIClient({ token: SECRET });
    const result = await client.listChecksForRun('o', 'r', 999);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    expect(result.isRetrievalFailure).toBe(true);
    expect(result).not.toHaveProperty('conclusion');
    // Never fetched off-origin, never leaked the token there.
    expect(calls.some((c) => c.url.includes('evil.example'))).toBe(false);
    expect(authTargets(calls)).not.toContain('https://evil.example');
    expect(result.error).not.toContain(SECRET);
  });

  it('rejects an HTTP check_run_url even on the trusted host', async () => {
    const jobs = [makeJob({ id: 333, check_run_url: 'http://api.github.com/repos/o/r/check-runs/444' })];
    const { mock, calls } = makeFetchMock(jobs, {});
    vi.stubGlobal('fetch', mock);

    const client = createGitHubCIClient({ token: SECRET });
    const result = await client.listChecksForRun('o', 'r', 999);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    expect(result.isRetrievalFailure).toBe(true);
    expect(result.error).toContain('non-HTTPS');
    expect(calls.some((c) => c.url.startsWith('http://api.github.com/repos/o/r/check-runs'))).toBe(false);
  });

  it('never forwards credentials outside the trusted origin with mixed jobs', async () => {
    const jobs = [
      makeJob({ id: 111, check_run_url: 'https://api.github.com/repos/o/r/check-runs/444' }),
      makeJob({ id: 222, name: 'evil', check_run_url: 'https://evil.example/check-runs/1' }),
    ];
    const checksByUrl = { 'https://api.github.com/repos/o/r/check-runs/444': makeCheck() };
    const { mock, calls } = makeFetchMock(jobs, checksByUrl);
    vi.stubGlobal('fetch', mock);

    const client = createGitHubCIClient({ token: SECRET });
    const result = await client.listChecksForRun('o', 'r', 999);

    // Fail-closed on the untrusted entry.
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    expect(result.isRetrievalFailure).toBe(true);
    // Every authenticated request stayed on the trusted origin.
    for (const origin of authTargets(calls)) {
      expect(origin).toBe('https://api.github.com');
    }
    expect(calls.some((c) => c.url.includes('evil.example'))).toBe(false);
  });

  it('keeps GitHub Enterprise origins working while refusing outsiders', async () => {
    const ghes = 'https://ghes.example.com/api/v3';
    const jobs = [
      makeJob({
        id: 111,
        url: `${ghes}/repos/o/r/actions/jobs/111`,
        html_url: 'https://ghes.example.com/o/r/actions/runs/999/job/111',
        check_run_url: `${ghes}/repos/o/r/check-runs/444`,
      }),
    ];
    const checksByUrl = {
      [`${ghes}/repos/o/r/check-runs/444`]: makeCheck({
        url: `${ghes}/repos/o/r/check-runs/444`,
        html_url: 'https://ghes.example.com/o/r/runs/444',
      }),
    };
    const { mock, calls } = makeFetchMock(jobs, checksByUrl);
    vi.stubGlobal('fetch', mock);

    const client = createGitHubCIClient({ baseUrl: ghes, token: SECRET });
    const sameOrigin = await client.listChecksForRun('o', 'r', 999);
    expect(sameOrigin.ok).toBe(true);
    expect(authTargets(calls)).toContain('https://ghes.example.com');

    const foreignJobs = [makeJob({ id: 222, check_run_url: 'https://api.github.com/repos/o/r/check-runs/444' })];
    const { mock: mock2, calls: calls2 } = makeFetchMock(foreignJobs, {});
    vi.stubGlobal('fetch', mock2);
    const foreign = await client.listChecksForRun('o', 'r', 999);
    expect(foreign.ok).toBe(false);
    if (foreign.ok) throw new Error('expected refusal');
    expect(foreign.isRetrievalFailure).toBe(true);
    expect(calls2.some((c) => c.url.includes('api.github.com'))).toBe(false);
  });

  it('rejects malformed absolute provider URLs without network activity', async () => {
    const jobs = [makeJob({ id: 444, check_run_url: 'https://exa mple.com/check-runs/1' })];
    const { mock, calls } = makeFetchMock(jobs, {});
    vi.stubGlobal('fetch', mock);

    const client = createGitHubCIClient({ token: SECRET });
    const result = await client.listChecksForRun('o', 'r', 999);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    expect(result.isRetrievalFailure).toBe(true);
    // Only the jobs-listing call (same-origin) went out; the malformed
    // URL was never fetched.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/actions/runs/999/jobs');
  });
});
