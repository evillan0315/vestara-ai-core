/**
 * VOS-STARTUP-001 P3: Onboarding marker route tests.
 *
 * Proves the completion-authority contract the XFCE session launcher
 * depends on: begin → pending, complete → completed (pending cleared),
 * status is read-only, unknown paths/methods are never claimed, and the
 * marker directory override is honored.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import type * as http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { handleOnboardingRoute, resolveOnboardingMarkerDir } from '../src/routes/onboarding';
import type { WorkspaceContext } from '../src/workspace-context';

const repo = mkdtempSync(join(tmpdir(), 'vestara-onboarding-test-'));
const ctx = { repoPath: repo } as unknown as WorkspaceContext;

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

function fakeRes(): {
  res: http.ServerResponse;
  status: () => number;
  body: () => Record<string, unknown>;
} {
  const chunks: string[] = [];
  let status = 0;
  const res = {
    writableEnded: false,
    headersSent: false,
    req: { headers: {} },
    writeHead(s: number): void {
      status = s;
    },
    end(data?: unknown): void {
      if (typeof data === 'string') chunks.push(data);
    },
  };
  return {
    res: res as unknown as http.ServerResponse,
    status: () => status,
    body: () => JSON.parse(chunks.join('')) as Record<string, unknown>,
  };
}

function fakeReq(): http.IncomingMessage {
  return { headers: {} } as unknown as http.IncomingMessage;
}

describe('resolveOnboardingMarkerDir', () => {
  it('defaults to gitignored repo-local runtime state', () => {
    expect(resolveOnboardingMarkerDir(ctx, {})).toBe(join(repo, '.vestara', 'onboarding'));
  });

  it('honors VESTARA_ONBOARDING_MARKER_DIR for the image layout', () => {
    expect(resolveOnboardingMarkerDir(ctx, { VESTARA_ONBOARDING_MARKER_DIR: '/var/lib/vestara/onboarding' })).toBe(
      '/var/lib/vestara/onboarding',
    );
  });

  it('ignores a blank override', () => {
    expect(resolveOnboardingMarkerDir(ctx, { VESTARA_ONBOARDING_MARKER_DIR: '   ' })).toBe(
      join(repo, '.vestara', 'onboarding'),
    );
  });
});

describe('handleOnboardingRoute', () => {
  it('reports a fresh state as neither pending nor completed', async () => {
    const f = fakeRes();
    expect(await handleOnboardingRoute('GET', '/api/onboarding/status', fakeReq(), f.res, ctx)).toBe(true);
    expect(f.status()).toBe(200);
    expect(f.body()).toMatchObject({ completed: false, pending: false });
  });

  it('begin marks pending, complete clears pending and marks completed', async () => {
    const b = fakeRes();
    expect(await handleOnboardingRoute('POST', '/api/onboarding/begin', fakeReq(), b.res, ctx)).toBe(true);
    expect(b.status()).toBe(200);
    expect(b.body()).toMatchObject({ completed: false, pending: true });

    const c = fakeRes();
    expect(await handleOnboardingRoute('POST', '/api/onboarding/complete', fakeReq(), c.res, ctx)).toBe(true);
    expect(c.status()).toBe(200);
    expect(c.body()).toMatchObject({ completed: true, pending: false });
  });

  it('never claims unknown paths or methods', async () => {
    const f = fakeRes();
    expect(await handleOnboardingRoute('GET', '/api/onboarding', fakeReq(), f.res, ctx)).toBe(false);
    expect(await handleOnboardingRoute('DELETE', '/api/onboarding/complete', fakeReq(), f.res, ctx)).toBe(false);
    expect(await handleOnboardingRoute('GET', '/api/health', fakeReq(), f.res, ctx)).toBe(false);
  });
});
