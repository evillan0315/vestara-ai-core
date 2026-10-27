import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketplaceAssets, MarketplaceApiError } from './marketplace';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown) => handler(String(url))),
  );
}

const asset = (overrides = {}) => ({
  id: 'teal-terminal',
  slug: 'teal-terminal',
  publisherId: 'vestara',
  displayName: 'Teal Terminal',
  summary: 'GPU-styled local shell',
  type: 'terminal',
  latestVersion: '2.0.0',
  ...overrides,
});

describe('fetchMarketplaceAssets', () => {
  it('searches assets and overlays installed state', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) {
        expect(url).toContain('limit=25');
        return ok({ results: { items: [{ asset: asset() }, { asset: asset({ displayName: '' }) }] } });
      }
      if (url === '/api/marketplace/installed') {
        return ok({ installed: [{ assetId: 'teal-terminal', packageName: 'teal-terminal' }] });
      }
      throw new Error(`unexpected ${url}`);
    });
    await expect(fetchMarketplaceAssets('')).resolves.toEqual([
      {
        id: 'teal-terminal',
        displayName: 'Teal Terminal',
        summary: 'GPU-styled local shell',
        type: 'terminal',
        version: '2.0.0',
        publisher: 'vestara',
        installed: true,
      },
    ]);
  });

  it('renders search results when the installed read fails', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) return ok({ results: { items: [{ asset: asset() }] } });
      throw new Error('installed down');
    });
    await expect(fetchMarketplaceAssets('term')).resolves.toEqual([
      expect.objectContaining({ id: 'teal-terminal', installed: false }),
    ]);
  });

  it('rejects with status 0 when unreachable', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    await expect(fetchMarketplaceAssets()).rejects.toBeInstanceOf(MarketplaceApiError);
  });
});
