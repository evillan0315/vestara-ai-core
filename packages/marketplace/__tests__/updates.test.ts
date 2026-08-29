import * as path from 'node:path';
import type { InstalledExtension } from '@vestara/extension-runtime';
import { afterAll, describe, expect, it } from 'vitest';
import type { MarketplaceAsset, MarketplaceAssetVersionSummary } from '../src/index.js';
import {
  detectUpdates,
  LocalMarketplaceRegistry,
  latestCompatibleVersion,
  projectInstalled,
  updateStatusOf,
} from '../src/index.js';
import { cleanup, temp, writePackage } from './helpers.js';

afterAll(cleanup);

const context = { vestaraVersion: '1.0.0', nodeVersion: '22.11.0', operatingSystem: 'linux', architecture: 'x64' };

function installedFrom(installed: InstalledExtension): InstalledExtension {
  return installed;
}

function summary(
  version: string,
  compatibility: MarketplaceAsset['versions'][number]['compatibility'] = { vestara: '>=1.0.0' },
): MarketplaceAssetVersionSummary {
  return { version, isStable: !version.includes('-'), compatibility, checksumVerified: true };
}

function asset(seed: Partial<MarketplaceAsset> & { packageName: string }): MarketplaceAsset {
  return {
    id: `vestara/${seed.packageName}`,
    slug: seed.packageName,
    publisherId: 'vestara',
    packageName: seed.packageName,
    displayName: seed.packageName,
    summary: seed.summary ?? `Summary for ${seed.packageName}`,
    type: seed.type ?? 'plugin',
    tags: [],
    visibility: 'local',
    latestVersion: seed.latestVersion ?? '1.0.0',
    versions: seed.versions ?? [summary('1.0.0')],
    verification: { signed: false, signatureValidated: false, checksumVerified: true, runtimeVerified: false },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}

describe('updates', () => {
  it('projects installed state and detects update availability', async () => {
    const manifest = writePackage(temp('updates'), { id: 'vestara.upd', version: '1.0.0' });
    const installed: InstalledExtension[] = [
      installedFrom({
        packageId: manifest.id,
        currentVersion: '1.0.0',
        versions: {
          '1.0.0': {
            manifest,
            installedAt: '2026-08-01T00:00:00.000Z',
            trust: 'local-development',
            state: 'active',
            grantedPermissions: [],
            health: { status: 'healthy', checkedAt: '2026-08-01T00:00:00.000Z' },
          },
        },
        enabledWorkspaces: ['workspace-a'],
      }),
    ];
    const catalogAsset = asset({
      packageName: 'vestara.upd',
      latestVersion: '2.0.0',
      versions: [summary('2.0.0'), summary('1.0.0')],
    });
    const assets = new Map([[catalogAsset.packageName, catalogAsset]]);

    const projected = projectInstalled(installed, assets, context);
    expect(projected[0]).toMatchObject({
      packageName: 'vestara.upd',
      installedVersion: '1.0.0',
      state: 'active',
      updateStatus: 'update-available',
      latestCompatibleVersion: '2.0.0',
    });

    const updates = detectUpdates(installed, assets, context);
    expect(updates).toEqual([
      {
        packageName: 'vestara.upd',
        installedVersion: '1.0.0',
        targetVersion: '2.0.0',
        updateType: 'major',
        compatible: true,
        reason: undefined,
      },
    ]);
  });

  it('flags incompatible updates and unknown packages', async () => {
    const manifest = writePackage(temp('updates-incompat'), { id: 'vestara.fut', version: '1.0.0' });
    const installed: InstalledExtension[] = [
      installedFrom({
        packageId: manifest.id,
        currentVersion: '1.0.0',
        versions: {
          '1.0.0': {
            manifest,
            installedAt: '2026-08-01T00:00:00.000Z',
            trust: 'local-development',
            state: 'installed',
            grantedPermissions: [],
            health: { status: 'unknown', checkedAt: '2026-08-01T00:00:00.000Z' },
          },
        },
        enabledWorkspaces: [],
      }),
    ];
    const incompatibleAsset = asset({
      packageName: 'vestara.fut',
      latestVersion: '2.0.0',
      versions: [summary('2.0.0', { vestara: '>=9.0.0' }), summary('1.0.0')],
    });
    const assets = new Map([[incompatibleAsset.packageName, incompatibleAsset]]);

    const projected = projectInstalled(installed, assets, context);
    expect(projected[0]?.updateStatus).toBe('incompatible-update');
    expect(latestCompatibleVersion(incompatibleAsset, '1.0.0', context)).toBeUndefined();

    expect(updateStatusOf(undefined, '1.0.0', undefined)).toBe('unknown');
  });

  it('marks current when no newer version exists', async () => {
    const manifest = writePackage(temp('updates-current'), { id: 'vestara.cur', version: '1.0.0' });
    const installed: InstalledExtension[] = [
      installedFrom({
        packageId: manifest.id,
        currentVersion: '1.0.0',
        versions: {
          '1.0.0': {
            manifest,
            installedAt: '2026-08-01T00:00:00.000Z',
            trust: 'local-development',
            state: 'active',
            grantedPermissions: [],
            health: { status: 'healthy', checkedAt: '2026-08-01T00:00:00.000Z' },
          },
        },
        enabledWorkspaces: [],
      }),
    ];
    const assets = new Map([['vestara.cur', asset({ packageName: 'vestara.cur', versions: [summary('1.0.0')] })]]);
    expect(projectInstalled(installed, assets, context)[0]?.updateStatus).toBe('current');
    expect(detectUpdates(installed, assets, context)).toEqual([]);
  });

  it('detects updates against a real scanned registry', async () => {
    const root = temp('registry-updates');
    const manifest = writePackage(path.join(root, 'pkg'), { id: 'vestara.scan', version: '1.0.0' });
    const registryRef = new LocalMarketplaceRegistry({ id: 'local', displayName: 'Local', roots: [root] });
    await registryRef.scan();
    const assets = new Map<string, MarketplaceAsset>();
    for (const item of await registryRef.listAssets()) assets.set(item.packageName, item);

    const installed: InstalledExtension[] = [
      installedFrom({
        packageId: manifest.id,
        currentVersion: '1.0.0',
        versions: {
          '1.0.0': {
            manifest,
            installedAt: '2026-08-01T00:00:00.000Z',
            trust: 'local-development',
            state: 'active',
            grantedPermissions: [],
            health: { status: 'healthy', checkedAt: '2026-08-01T00:00:00.000Z' },
          },
        },
        enabledWorkspaces: [],
      }),
    ];
    expect(projectInstalled(installed, assets, context)[0]?.updateStatus).toBe('current');
  });
});
