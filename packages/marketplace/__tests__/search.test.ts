import type { InstalledExtension, LocalExtensionManager } from '@vestara/extension-runtime';
import { describe, expect, it } from 'vitest';
import type { MarketplaceAsset } from '../src/asset';
import type { MarketplaceSearchQuery } from '../src/search';
import { searchAssets } from '../src/search';
import { MarketplaceService } from '../src/service';

const NOW = '2026-10-01T00:00:00.000Z';

function asset(overrides: Partial<MarketplaceAsset> & { packageName: string }): MarketplaceAsset {
  return {
    id: `id-${overrides.packageName}`,
    slug: overrides.packageName,
    publisherId: 'vestara',
    displayName: overrides.packageName,
    summary: `Summary for ${overrides.packageName}`,
    type: 'module',
    tags: [],
    visibility: 'local',
    latestVersion: '1.0.0',
    versions: [
      {
        version: '1.0.0',
        isStable: true,
        compatibility: { vestara: '*' },
        checksumVerified: false,
      },
    ],
    verification: {
      signed: false,
      signatureValidated: false,
      checksumVerified: false,
      runtimeVerified: false,
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function installedEntry(packageId: string): InstalledExtension {
  return {
    packageId,
    currentVersion: '1.0.0',
    versions: { '1.0.0': { state: 'active', installedAt: NOW } },
  } as unknown as InstalledExtension;
}

function serviceWith(installed: readonly InstalledExtension[], assets: readonly MarketplaceAsset[]) {
  const manager = { list: () => [...installed] } as unknown as LocalExtensionManager;
  const service = new MarketplaceService({ registries: [], manager });
  for (const entry of assets) service.catalog.upsert(entry, 'local');
  return service;
}

describe('searchAssets capability and exclusion filters', () => {
  const assets = [
    asset({ packageName: 'evidence-tool', summary: 'Helps with evidence review', tags: ['evidence'] }),
    asset({ packageName: 'theme-pack', summary: 'Gallery themes', tags: ['gallery'] }),
  ];

  it('narrows to assets matching any capability hint', () => {
    const hits = searchAssets(assets, { capabilities: ['evidence'] } satisfies MarketplaceSearchQuery);
    expect(hits.map((hit) => hit.asset.packageName)).toEqual(['evidence-tool']);
  });

  it('matches capabilities against type and publisher text', () => {
    const hits = searchAssets(assets, { capabilities: ['GALLERY'] } satisfies MarketplaceSearchQuery);
    expect(hits.map((hit) => hit.asset.packageName)).toEqual(['theme-pack']);
  });

  it('returns nothing when no asset matches the capability', () => {
    const hits = searchAssets(assets, { capabilities: ['no-such-capability'] } satisfies MarketplaceSearchQuery);
    expect(hits).toEqual([]);
  });

  it('excludes named packages without affecting the rest', () => {
    const hits = searchAssets(assets, { excludePackageNames: ['Evidence-Tool'] } satisfies MarketplaceSearchQuery);
    expect(hits.map((hit) => hit.asset.packageName)).toEqual(['theme-pack']);
  });
});

describe('MarketplaceService.search awareness', () => {
  it('excludes installed packages only when requested', async () => {
    const service = serviceWith(
      [installedEntry('tool-a')],
      [asset({ packageName: 'tool-a' }), asset({ packageName: 'tool-b' })],
    );

    const all = await service.search({});
    expect(all.items.map((item) => item.asset.packageName).sort()).toEqual(['tool-a', 'tool-b']);
    expect(all.total).toBe(2);

    const fresh = await service.search({ excludeInstalled: true });
    expect(fresh.items.map((item) => item.asset.packageName)).toEqual(['tool-b']);
    expect(fresh.total).toBe(1);
  });

  it('filters by capability hints', async () => {
    const service = serviceWith(
      [],
      [
        asset({ packageName: 'evidence-tool', summary: 'Evidence review helper' }),
        asset({ packageName: 'other-tool', summary: 'Unrelated helper' }),
      ],
    );

    const result = await service.search({ capabilities: ['evidence'] });
    expect(result.items.map((item) => item.asset.packageName)).toEqual(['evidence-tool']);
  });

  it('excludes runtime-incompatible assets when a context is provided', async () => {
    const service = serviceWith(
      [],
      [
        asset({
          packageName: 'future-tool',
          versions: [
            { version: '1.0.0', isStable: true, compatibility: { vestara: '>=999.0.0' }, checksumVerified: false },
          ],
        }),
        asset({ packageName: 'current-tool' }),
      ],
    );

    const compatible = await service.search({ compatibleWith: service.context });
    expect(compatible.items.map((item) => item.asset.packageName)).toEqual(['current-tool']);

    const unfiltered = await service.search({});
    expect(unfiltered.total).toBe(2);
  });
});
