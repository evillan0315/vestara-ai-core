import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { MarketplaceAssetReference } from '../src/index';
import { RemoteMarketplaceRegistry, type RemotePackageArchiveFetcher } from '../src/index';

function serveIndex(index: unknown): { url: string; close: () => Promise<void> } {
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(index));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

const INDEX = {
  formatVersion: 1,
  generatedAt: '2026-08-03T00:00:00.000Z',
  baseUrl: 'http://example.test',
  assets: [
    {
      publisherId: 'acme',
      packageName: 'toolbox',
      displayName: 'Acme Toolbox',
      summary: 'A collection of build helpers',
      type: 'plugin',
      tags: ['build', 'helpers'],
      latestVersion: '2.1.0',
      versions: [
        {
          version: '2.1.0',
          publishedAt: '2026-07-01T00:00:00.000Z',
          compatibility: { vestara: '>=1.0.0', node: '>=18' },
          digest: 'a'.repeat(64),
          downloadUrl: 'http://example.test/toolbox-2.1.0.tgz',
        },
        {
          version: '1.4.0',
          publishedAt: '2026-01-01T00:00:00.000Z',
          compatibility: { vestara: '>=1.0.0' },
          digest: 'b'.repeat(64),
        },
      ],
    },
    {
      publisherId: 'vestara',
      packageName: 'theme-dark',
      displayName: 'Dark Theme',
      summary: 'A dark theme',
      type: 'theme',
      tags: ['theme'],
      latestVersion: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          compatibility: { vestara: '>=1.0.0' },
          digest: 'c'.repeat(64),
        },
      ],
    },
  ],
};

const reference = (ref: MarketplaceAssetReference): MarketplaceAssetReference => ref;

describe('RemoteMarketplaceRegistry', () => {
  it('fetches the index and lists assets', async () => {
    const server = await serveIndex(INDEX);
    try {
      const registry = new RemoteMarketplaceRegistry({ id: 'public', displayName: 'Public', baseUrl: server.url });
      const assets = await registry.listAssets();
      expect(assets).toHaveLength(2);
      expect(assets[0].packageName).toBe('toolbox');
      expect(assets[0].latestVersion).toBe('2.1.0');
      expect(assets[0].versions).toHaveLength(2);
    } finally {
      await server.close();
    }
  });

  it('searches across remote assets', async () => {
    const server = await serveIndex(INDEX);
    try {
      const registry = new RemoteMarketplaceRegistry({ id: 'public', displayName: 'Public', baseUrl: server.url });
      const result = await registry.search({ query: 'theme' });
      expect(result.total).toBe(1);
      expect(result.items[0]?.asset.packageName).toBe('theme-dark');
      expect(result.items[0]?.registryId).toBe('public');
    } finally {
      await server.close();
    }
  });

  it('gets an asset by publisher-qualified reference', async () => {
    const server = await serveIndex(INDEX);
    try {
      const registry = new RemoteMarketplaceRegistry({ id: 'public', displayName: 'Public', baseUrl: server.url });
      const asset = await registry.getAsset(reference({ publisherId: 'acme', packageName: 'toolbox' }));
      expect(asset?.publisherId).toBe('acme');
    } finally {
      await server.close();
    }
  });

  it('materializes a version locally when an archive fetcher is configured', async () => {
    const server = await serveIndex(INDEX);
    const fetcher: RemotePackageArchiveFetcher = {
      materialize: async ({ packageName, version }) => `/tmp/cache/${packageName}/${version}`,
    };
    try {
      const registry = new RemoteMarketplaceRegistry({
        id: 'public',
        displayName: 'Public',
        baseUrl: server.url,
        archiveFetcher: fetcher,
        cacheDir: '/tmp/cache',
      });
      const version = await registry.getVersion(reference({ packageName: 'toolbox', version: '2.1.0' }));
      expect(version).toBeDefined();
      expect(version?.packagePath).toBe('/tmp/cache/toolbox/2.1.0');
      expect(version?.manifest.id).toBe('toolbox');
      expect(version?.integrityVerified).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('returns a manifest-backed version without a package path when no fetcher', async () => {
    const server = await serveIndex(INDEX);
    try {
      const registry = new RemoteMarketplaceRegistry({ id: 'public', displayName: 'Public', baseUrl: server.url });
      const version = await registry.getVersion(reference({ packageName: 'toolbox' }));
      expect(version).toBeDefined();
      expect(version?.packagePath).toBe('');
      expect(version?.manifest.version).toBe('2.1.0');
    } finally {
      await server.close();
    }
  });

  it('reports health and recovers after a failed fetch', async () => {
    const server = await serveIndex(INDEX);
    try {
      const registry = new RemoteMarketplaceRegistry({ id: 'public', displayName: 'Public', baseUrl: server.url });
      const health = await registry.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.assetCount).toBe(2);
    } finally {
      await server.close();
    }
  });

  it('throws a registry error for a malformed index', async () => {
    const server = await serveIndex({ formatVersion: 99 });
    try {
      const registry = new RemoteMarketplaceRegistry({ id: 'public', displayName: 'Public', baseUrl: server.url });
      await expect(registry.listAssets()).rejects.toThrow();
    } finally {
      await server.close();
    }
  });
});
