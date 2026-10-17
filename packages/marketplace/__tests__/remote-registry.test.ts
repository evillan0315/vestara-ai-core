import { describe, expect, it } from 'vitest';
import { RemoteMarketplaceRegistry } from '../src/remote-registry';

const INDEX_URL = 'https://registry.example.com/index.json';

function registryReturning(index: unknown): RemoteMarketplaceRegistry {
  const fetchImpl = (async () => ({
    ok: true,
    json: async () => index,
  })) as unknown as typeof fetch;
  return new RemoteMarketplaceRegistry({
    id: 'test',
    displayName: 'Test',
    baseUrl: 'https://registry.example.com',
    fetchImpl,
  });
}

function indexWith(assets: readonly unknown[]): unknown {
  return {
    formatVersion: 1,
    generatedAt: '2026-10-01T00:00:00.000Z',
    baseUrl: 'https://registry.example.com',
    assets,
  };
}

function assetEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    publisherId: 'vestara',
    packageName: 'theme-pack',
    displayName: 'Theme Pack',
    summary: 'A theme pack',
    type: 'theme',
    latestVersion: '1.0.0',
    versions: [{ version: '1.0.0', compatibility: { vestara: '*' }, digest: 'abc123' }],
    ...overrides,
  };
}

describe('RemoteMarketplaceRegistry stats passthrough', () => {
  it('surfaces registry-declared stats on the asset', async () => {
    const registry = registryReturning(
      indexWith([assetEntry({ stats: { downloads: 1234, rating: 4.7, reviews: 42 } })]),
    );

    const assets = await registry.listAssets();
    const asset = assets.find((entry) => entry.packageName === 'theme-pack');
    expect(asset?.stats).toEqual({ downloads: 1234, rating: 4.7, reviews: 42 });
  });

  it('omits stats when the index declares none', async () => {
    const registry = registryReturning(indexWith([assetEntry()]));

    const assets = await registry.listAssets();
    const asset = assets.find((entry) => entry.packageName === 'theme-pack');
    expect(asset?.stats).toBeUndefined();
  });

  it('drops non-numeric stat values rather than fabricating them', async () => {
    const registry = registryReturning(
      indexWith([assetEntry({ stats: { downloads: 'many', rating: 'N/A', reviews: 9 } })]),
    );

    const assets = await registry.listAssets();
    const asset = assets.find((entry) => entry.packageName === 'theme-pack');
    expect(asset?.stats).toEqual({ downloads: undefined, rating: undefined, reviews: 9 });
  });

  it('fetches the registry index from the expected path', async () => {
    let requestedUrl = '';
    const fetchImpl = (async (url: string) => {
      requestedUrl = url;
      return { ok: true, json: async () => indexWith([]) };
    }) as unknown as typeof fetch;
    const registry = new RemoteMarketplaceRegistry({
      id: 'test',
      displayName: 'Test',
      baseUrl: 'https://registry.example.com/',
      fetchImpl,
    });

    await registry.listAssets();
    expect(requestedUrl).toBe(INDEX_URL);
  });
});
