import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InstalledExtension, LocalExtensionManager } from '@vestara/extension-runtime';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarketplaceAsset } from '../src/asset';
import type { MarketplaceRegistry } from '../src/registry';
import { detectWorkspaceStackTags, MarketplaceService } from '../src/service';

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

describe('MarketplaceService.suggest', () => {
  it('excludes installed packages by default but includes them when requested', async () => {
    const service = serviceWith(
      [installedEntry('tool-a')],
      [
        asset({ packageName: 'tool-a', type: 'module', tags: ['evidence'] }),
        asset({ packageName: 'tool-b', type: 'module', tags: ['evidence'] }),
      ],
    );

    const excluded = await service.suggest({});
    expect(excluded.suggestions.map((suggestion) => suggestion.asset.packageName)).toEqual(['tool-b']);
    expect(excluded.total).toBe(1);

    const included = await service.suggest({ includeInstalled: true });
    expect(included.total).toBe(2);
  });

  it('excludes runtime-incompatible assets', async () => {
    const service = serviceWith(
      [],
      [
        asset({
          packageName: 'future-tool',
          versions: [
            {
              version: '1.0.0',
              isStable: true,
              compatibility: { vestara: '>=999.0.0' },
              checksumVerified: false,
            },
          ],
        }),
        asset({ packageName: 'current-tool' }),
      ],
    );

    const result = await service.suggest({});
    expect(result.suggestions.map((suggestion) => suggestion.asset.packageName)).toEqual(['current-tool']);
  });

  it('requires a match when explicit capability hints are given', async () => {
    const service = serviceWith(
      [],
      [
        asset({ packageName: 'evidence-tool', summary: 'Helps with evidence review', tags: ['evidence'] }),
        asset({ packageName: 'unrelated-tool', summary: 'Unrelated helper', tags: ['theme-pack'] }),
      ],
    );

    const matched = await service.suggest({ capabilities: ['evidence'] });
    expect(matched.suggestions.map((suggestion) => suggestion.asset.packageName)).toEqual(['evidence-tool']);
    expect(matched.suggestions[0].reasons).toContain('matches requested capability: evidence');

    const missed = await service.suggest({ capabilities: ['no-such-capability'] });
    expect(missed.total).toBe(0);
    expect(missed.suggestions).toEqual([]);
  });

  it('boosts installed-type overlap and verification with evidence-backed reasons', async () => {
    const service = serviceWith(
      [installedEntry('installed-module')],
      [
        asset({ packageName: 'installed-module', type: 'module', tags: ['shared-tag'] }),
        asset({
          packageName: 'related-module',
          type: 'module',
          tags: ['shared-tag'],
          verification: {
            signed: true,
            signatureValidated: false,
            checksumVerified: true,
            runtimeVerified: false,
          },
        }),
        asset({ packageName: 'other-theme', type: 'theme', tags: ['gallery'] }),
      ],
    );

    const result = await service.suggest({});
    expect(result.suggestions[0].asset.packageName).toBe('related-module');
    expect(result.suggestions[0].reasons).toEqual(
      expect.arrayContaining(['extends module already in use', 'shares tags: shared-tag', 'checksum verified']),
    );
    // No fabricated popularity signals.
    expect(result.suggestions[0].reasons.join(' ')).not.toMatch(/downloads|rating|popular/i);
  });

  it('respects the limit and orders deterministically', async () => {
    const service = serviceWith(
      [],
      [
        asset({ packageName: 'bravo-tool', updatedAt: '2026-09-01T00:00:00.000Z' }),
        asset({ packageName: 'alpha-tool', updatedAt: '2026-09-01T00:00:00.000Z' }),
        asset({ packageName: 'charlie-tool', updatedAt: '2026-10-01T00:00:00.000Z' }),
      ],
    );

    const limited = await service.suggest({ limit: 2 });
    expect(limited.suggestions).toHaveLength(2);
    expect(limited.total).toBe(3);

    const full = await service.suggest({ limit: 10 });
    expect(full.suggestions.map((suggestion) => suggestion.asset.packageName)).toEqual([
      'charlie-tool',
      'alpha-tool',
      'bravo-tool',
    ]);
  });

  it('preserves registry errors instead of failing', async () => {
    const failing: MarketplaceRegistry = {
      id: 'broken',
      kind: 'local',
      displayName: 'Broken',
      getHealth: async () => ({ status: 'unhealthy', assetCount: 0, error: 'boom' }),
      listAssets: async () => {
        throw new Error('boom');
      },
    } as unknown as MarketplaceRegistry;
    const manager = { list: () => [] } as unknown as LocalExtensionManager;
    const service = new MarketplaceService({ registries: [failing], manager });
    service.catalog.upsert(asset({ packageName: 'lonely-tool' }), 'local');

    const result = await service.suggest({});
    expect(result.suggestions.map((suggestion) => suggestion.asset.packageName)).toEqual(['lonely-tool']);
    expect(result.registryErrors?.join(' ')).toContain('broken');
  });
});

describe('workspace stack signals', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function makeRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'vestara-stack-'));
    roots.push(root);
    return root;
  }

  it('detects ecosystems, tags, and dependencies while skipping vendored dirs', () => {
    const root = makeRoot();
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'web-app', version: '1.0.0', keywords: ['react'], dependencies: { react: '^18.0.0' } }),
    );
    mkdirSync(join(root, 'node_modules', 'fake'), { recursive: true });
    writeFileSync(
      join(root, 'node_modules', 'fake', 'package.json'),
      JSON.stringify({ name: 'fake', version: '1.0.0', keywords: ['should-not-appear'] }),
    );
    mkdirSync(join(root, 'services', 'api'), { recursive: true });
    writeFileSync(join(root, 'services', 'api', 'pyproject.toml'), '[project]\nname = "api"\nversion = "0.1.0"\n');

    const tags = detectWorkspaceStackTags(root);
    expect(tags).toEqual(expect.arrayContaining(['node', 'react', 'python']));
    expect(tags).not.toContain('should-not-appear');
    expect([...tags].sort()).toEqual(tags);
  });

  it('boosts assets overlapping the workspace stack with evidence-backed reasons', async () => {
    const root = makeRoot();
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'web-app', version: '1.0.0', keywords: ['react'], dependencies: { react: '^18.0.0' } }),
    );
    const service = serviceWith(
      [],
      [
        asset({ packageName: 'react-helper', tags: ['react'] }),
        asset({ packageName: 'plain-helper', tags: ['unrelated'] }),
      ],
    );

    const result = await service.suggest({ workspaceRoot: root });
    expect(result.suggestions[0].asset.packageName).toBe('react-helper');
    expect(result.suggestions[0].reasons).toContain('matches workspace stack: react');
  });

  it('degrades gracefully when the root is unreadable', async () => {
    const service = serviceWith([], [asset({ packageName: 'lonely-tool' })]);
    const result = await service.suggest({ workspaceRoot: join(tmpdir(), 'vestara-missing-root-xyz') });
    expect(result.suggestions.map((suggestion) => suggestion.asset.packageName)).toEqual(['lonely-tool']);
  });
});
