/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentPkg } from './AgentWorkforce';

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

describe('AgentPkg', () => {
  it('renders the live roster with a LIVE pill', async () => {
    stubFetch(async () => ok({ agents: [{ id: 'a1', name: 'Atlas', role: 'developer', status: 'active' }] }));
    render(<AgentPkg />);
    expect(await screen.findByText('Atlas')).toBeTruthy();
    expect(await screen.findByText('LIVE')).toBeTruthy();
  });

  it('falls back to the fixture roster with a SNAPSHOT pill when offline', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<AgentPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    expect(await screen.findByText('Assistant')).toBeTruthy();
  });
});
