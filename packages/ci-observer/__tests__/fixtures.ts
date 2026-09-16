/**
 * CI-OBS-002A test fixtures — GitHub Actions payloads for the real dogfood run.
 *
 * Run 35031683683 · commit 598d416 · workflow 'CI'.
 * build-and-test: failed overall, with the 'Fast tests' step cancelled.
 * desktop-build: failed at 'Build Workspace UI desktop shell'.
 */

import type { GitHubJobStep, GitHubWorkflowJob, GitHubWorkflowRun } from '@vestara/github-ci-adapter';

export const REPO = 'evillan0315/vestara-ai-core';
export const COMMIT = '598d416bd5998f375f70e43bae81cc8405633006';
export const RUN_ID = 35031683683;

export function workflowRun(over: Partial<GitHubWorkflowRun> = {}): GitHubWorkflowRun {
  return {
    id: RUN_ID,
    name: 'CI',
    node_id: 'node-run',
    run_number: 1,
    event: 'push',
    status: 'completed',
    conclusion: 'failure',
    workflow_id: 1,
    check_suite_id: 1,
    check_suite_node_id: 'node-suite',
    url: 'https://api.github.com/repos/evillan0315/vestara-ai-core/actions/runs/35031683683',
    html_url: 'https://github.com/evillan0315/vestara-ai-core/actions/runs/35031683683',
    created_at: '2026-09-15T22:34:59Z',
    updated_at: '2026-09-15T22:37:04Z',
    run_started_at: '2026-09-15T22:34:59Z',
    jobs_url: 'https://api.github.com/repos/evillan0315/vestara-ai-core/actions/runs/35031683683/jobs',
    logs_url: 'https://api.github.com/repos/evillan0315/vestara-ai-core/actions/runs/35031683683/logs',
    artifacts_url: 'https://api.github.com/repos/evillan0315/vestara-ai-core/actions/runs/35031683683/artifacts',
    head_branch: 'main',
    head_sha: COMMIT,
    repository: { id: 1, name: 'vestara-ai-core', full_name: REPO, owner: { login: 'evillan0315' } },
    attempt: 1,
    ...over,
  };
}

function step(over: Partial<GitHubJobStep> & { name: string; number: number }): GitHubJobStep {
  return {
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-09-15T22:36:36Z',
    completed_at: '2026-09-15T22:37:01Z',
    ...over,
  };
}

export function desktopBuildJob(): GitHubWorkflowJob {
  return {
    id: 11,
    run_id: RUN_ID,
    name: 'desktop-build',
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-09-15T22:35:10Z',
    completed_at: '2026-09-15T22:37:01Z',
    url: 'https://api.github.com/repos/evillan0315/vestara-ai-core/actions/jobs/11',
    html_url: 'https://github.com/evillan0315/vestara-ai-core/actions/runs/35031683683/job/11',
    check_run_url: null,
    run_attempt: 1,
    steps: [
      step({ name: 'Run pnpm install --frozen-lockfile', number: 1 }),
      step({ name: 'Build Workspace UI desktop shell', number: 2, conclusion: 'failure' }),
    ],
  };
}

/** build-and-test failed overall, but the Fast tests step itself was cancelled. */
export function buildAndTestJob(): GitHubWorkflowJob {
  return {
    id: 12,
    run_id: RUN_ID,
    name: 'build-and-test',
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-09-15T22:34:59Z',
    completed_at: '2026-09-15T22:36:20Z',
    url: 'https://api.github.com/repos/evillan0315/vestara-ai-core/actions/jobs/12',
    html_url: 'https://github.com/evillan0315/vestara-ai-core/actions/runs/35031683683/job/12',
    check_run_url: null,
    run_attempt: 1,
    steps: [
      step({ name: 'Run bash build-order.sh', number: 1 }),
      step({
        name: 'Fast tests (excludes repo-scan, e2e and doc-governance suites)',
        number: 2,
        conclusion: 'cancelled',
      }),
    ],
  };
}
