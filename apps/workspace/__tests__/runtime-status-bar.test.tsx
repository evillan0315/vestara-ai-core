import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RuntimeStatusBar from '../src/pages/Agents/RuntimeStatusBar.js';

function json(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

function makeFetch(overrides: { providers?: Array<{ id: string; modelCount: number }> } = {}) {
  return vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/api/opencode/health')) return json({ status: 'healthy', upstream: { healthy: true } });
    if (u.includes('/api/opencode/providers'))
      return json({ providers: overrides.providers ?? [{ id: 'opencode', modelCount: 2 }] });
    return json({});
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RuntimeStatusBar', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeFetch());
  });

  it('renders the runtime health and discovered providers', async () => {
    render(<RuntimeStatusBar />);
    await waitFor(() => expect(screen.getByText('Runtime healthy')).toBeTruthy());
    expect(screen.getByText(/opencode \(2\)/)).toBeTruthy();
  });

  it('reports an unknown runtime when health is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );
    render(<RuntimeStatusBar />);
    await waitFor(() => expect(screen.getByText('Runtime unknown')).toBeTruthy());
  });

  it('falls back to the configured default when no providers are discovered', async () => {
    vi.stubGlobal('fetch', makeFetch({ providers: [] }));
    render(<RuntimeStatusBar />);
    await waitFor(() =>
      expect(screen.getByText(/no providers discovered — the server’s configured default will be used/)).toBeTruthy(),
    );
  });
});
