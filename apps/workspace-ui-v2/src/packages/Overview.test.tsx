/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverviewPkg } from './Overview';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown) => handler(String(url))),
  );
}

describe('OverviewPkg', () => {
  it('renders live agent counts with a LIVE pill', async () => {
    stubFetch(async (url) => {
      if (url === '/api/agents')
        return ok({ agents: [{ id: 'a1', name: 'Atlas', role: 'developer', status: 'active' }] });
      return ok({ status: 'ok' });
    });
    render(<OverviewPkg />);
    expect(await screen.findByText('LIVE')).toBeTruthy();
    // Canonical 10 + unknown live Atlas appended, all active.
    expect(await screen.findByText('11/11')).toBeTruthy();
    expect(await screen.findByText('Atlas • active')).toBeTruthy();
  });

  it('falls back to fixture counts with a SNAPSHOT pill when offline', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<OverviewPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    expect(await screen.findByText('10/10')).toBeTruthy();
  });
});
