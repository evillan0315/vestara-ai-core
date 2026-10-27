/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplacePkg } from './Marketplace';

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

const liveSearch = (items: unknown[]) => ok({ results: { items: items.map((asset) => ({ asset })) } });

const liveAsset = {
  id: 'teal-terminal',
  publisherId: 'vestara',
  displayName: 'Teal Terminal',
  summary: 'GPU-styled local shell',
  type: 'terminal',
  latestVersion: '2.0.0',
};

describe('MarketplacePkg', () => {
  it('renders live assets with installed markers and a LIVE pill', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) return liveSearch([liveAsset]);
      return ok({ installed: [{ assetId: 'teal-terminal' }] });
    });
    render(<MarketplacePkg />);
    expect(await screen.findByText('LIVE')).toBeTruthy();
    expect(await screen.findByText('Teal Terminal')).toBeTruthy();
    expect(await screen.findByText('INSTALLED')).toBeTruthy();
  });

  it('searches the live catalog from the search box', async () => {
    const seen: string[] = [];
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) {
        seen.push(url);
        return liveSearch([liveAsset]);
      }
      return ok({ installed: [] });
    });
    render(<MarketplacePkg />);
    const box = await screen.findByLabelText('Search marketplace');
    expect(await screen.findByText('LIVE')).toBeTruthy();
    await act(async () => {
      fireEvent.change(box, { target: { value: 'term' } });
    });
    expect(await screen.findByText('Teal Terminal')).toBeTruthy();
    expect(seen.some((u) => u.includes('q=term'))).toBe(true);
  });

  it('falls back to fixture assets with a SNAPSHOT pill when offline', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<MarketplacePkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    expect(await screen.findByText('Agent Workforce')).toBeTruthy();
  });
});
