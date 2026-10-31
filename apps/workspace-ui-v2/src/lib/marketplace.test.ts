import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchMarketplaceAssets,
  installMarketplaceAsset,
  MarketplaceApiError,
  setMarketplaceAssetEnabled,
  uninstallMarketplaceAsset,
} from './marketplace';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init?: unknown) => handler(String(url), init as RequestInit | undefined)),
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
  it('searches assets and overlays installed + enabled state', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) {
        expect(url).toContain('limit=25');
        return ok({ results: { items: [{ asset: asset() }, { asset: asset({ displayName: '' }) }] } });
      }
      if (url === '/api/marketplace/installed') {
        return ok({ installed: [{ assetId: 'teal-terminal', packageName: 'teal-terminal', enabled: true }] });
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
        enabled: true,
      },
    ]);
  });

  it('marks installed assets disabled when the installed entry says so', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) return ok({ results: { items: [{ asset: asset() }] } });
      if (url === '/api/marketplace/installed') {
        return ok({ installed: [{ assetId: 'teal-terminal', packageName: 'teal-terminal', enabled: false }] });
      }
      throw new Error(`unexpected ${url}`);
    });
    await expect(fetchMarketplaceAssets('')).resolves.toEqual([
      expect.objectContaining({ id: 'teal-terminal', installed: true, enabled: false }),
    ]);
  });

  it('renders search results when the installed read fails', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) return ok({ results: { items: [{ asset: asset() }] } });
      throw new Error('installed down');
    });
    await expect(fetchMarketplaceAssets('term')).resolves.toEqual([
      expect.objectContaining({ id: 'teal-terminal', installed: false, enabled: false }),
    ]);
  });

  it('rejects with status 0 when unreachable', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    await expect(fetchMarketplaceAssets()).rejects.toBeInstanceOf(MarketplaceApiError);
  });
});

describe('marketplace mutations', () => {
  it('installs an asset and reports its enabled flag', async () => {
    const seen: string[] = [];
    stubFetch(async (url, init) => {
      seen.push(`${url} ${(init?.method ?? 'GET') as string}`);
      return ok({ operation: { status: 'completed', installed: { packageName: 'voice-streaming', enabled: true } } });
    });
    await expect(installMarketplaceAsset('voice-streaming')).resolves.toEqual({ enabled: true });
    expect(seen).toContain('/api/marketplace/install POST');
  });

  it('rejects a failed install with the operation error', async () => {
    stubFetch(async () => ok({ operation: { status: 'failed', error: { message: 'no such package' } } }));
    await expect(installMarketplaceAsset('missing')).rejects.toThrow('no such package');
  });

  it('rejects install when the transport is down', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    await expect(installMarketplaceAsset('voice-streaming')).rejects.toBeInstanceOf(MarketplaceApiError);
  });

  it('uninstalls an installed asset', async () => {
    const seen: Array<{ url: string; body: string }> = [];
    stubFetch(async (url, init) => {
      seen.push({ url, body: String(init?.body ?? '') });
      return ok({ operation: { status: 'completed' } });
    });
    await uninstallMarketplaceAsset('voice-streaming');
    expect(seen).toEqual([
      { url: '/api/marketplace/uninstall', body: JSON.stringify({ packageName: 'voice-streaming' }) },
    ]);
  });

  it('rejects a failed uninstall', async () => {
    stubFetch(async () => ok({ operation: { status: 'failed', error: { message: 'still active' } } }));
    await expect(uninstallMarketplaceAsset('voice-streaming')).rejects.toThrow('still active');
  });

  it('enables and disables an installed asset', async () => {
    const seen: Array<{ url: string; method: string; body: string }> = [];
    stubFetch(async (url, init) => {
      seen.push({ url, method: (init?.method ?? 'GET') as string, body: String(init?.body ?? '') });
      return ok({ operation: { installed: { packageName: 'voice-streaming' } } });
    });
    await setMarketplaceAssetEnabled('voice-streaming', false);
    await setMarketplaceAssetEnabled('voice-streaming', true);
    expect(seen).toEqual([
      {
        url: '/api/marketplace/installed/voice-streaming',
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      },
      {
        url: '/api/marketplace/installed/voice-streaming',
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
      },
    ]);
  });

  it('rejects enable when the asset is not found', async () => {
    stubFetch(async () => ({ ok: false, status: 404, json: async () => ({ error: 'not installed' }) }) as Response);
    await expect(setMarketplaceAssetEnabled('missing', true)).rejects.toThrow('not installed');
  });
});
