import * as path from 'node:path';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import type { InstalledExtension } from '@vestara/extension-runtime';
import { afterAll, describe, expect, it } from 'vitest';
import {
  LocalMarketplaceRegistry,
  MarketplaceCatalog,
  MarketplaceResolutionError,
  resolveInstall,
} from '../src/index.js';
import { cleanup, temp, writePackage } from './helpers.js';

afterAll(cleanup);

const context = { vestaraVersion: '1.0.0', nodeVersion: '22.11.0', operatingSystem: 'linux', architecture: 'x64' };

async function buildCatalog(
  root: string,
): Promise<{ catalog: MarketplaceCatalog; registry: LocalMarketplaceRegistry }> {
  const registryRef = new LocalMarketplaceRegistry({ id: 'local', displayName: 'Local', roots: [root] });
  await registryRef.scan();
  const catalog = new MarketplaceCatalog();
  for (const asset of await registryRef.listAssets()) catalog.upsert(asset, 'local');
  return { catalog, registry: registryRef };
}

function installedFrom(manifest: VestaraPackageManifest): InstalledExtension {
  return {
    packageId: manifest.id,
    currentVersion: manifest.version,
    versions: {
      [manifest.version]: {
        manifest,
        installedAt: new Date().toISOString(),
        trust: 'local-development',
        state: 'active',
        grantedPermissions: [],
        health: { status: 'healthy', checkedAt: new Date().toISOString() },
      },
    },
    enabledWorkspaces: [],
  };
}

async function resolve(
  root: string,
  packageName: string,
  version: string | undefined,
  installed: ReadonlyMap<string, InstalledExtension> = new Map(),
) {
  const { catalog, registry } = await buildCatalog(root);
  return resolveInstall(
    { reference: { packageName }, version },
    {
      catalog,
      installed,
      context,
      versionProvider: (name, v) => registry.getVersion({ packageName: name, version: v }),
    },
  );
}

describe('resolver', () => {
  it('resolves exact versions, ranges, and latest compatible stable', async () => {
    const root = temp('resolve-basic');
    writePackage(path.join(root, 'pkg-v1'), { id: 'vestara.pkg', version: '1.0.0' });
    writePackage(path.join(root, 'pkg-v11'), { id: 'vestara.pkg', version: '1.1.0' });
    writePackage(path.join(root, 'pkg-v2'), { id: 'vestara.pkg', version: '2.0.0' });

    expect((await resolve(root, 'vestara.pkg', undefined)).target.version).toBe('2.0.0');
    expect((await resolve(root, 'vestara.pkg', '1.0.0')).target.version).toBe('1.0.0');
    expect((await resolve(root, 'vestara.pkg', '^1.0.0')).target.version).toBe('1.1.0');
  });

  it('produces a deterministic install order with dependencies first', async () => {
    const root = temp('resolve-order');
    writePackage(path.join(root, 'a'), {
      id: 'vestara.a',
      dependencies: [
        { packageId: 'vestara.m', version: '^1.0.0' },
        { packageId: 'vestara.z', version: '^1.0.0' },
      ],
    });
    writePackage(path.join(root, 'm'), { id: 'vestara.m', version: '1.0.0' });
    writePackage(path.join(root, 'z'), { id: 'vestara.z', version: '1.0.0' });

    const plan = await resolve(root, 'vestara.a', undefined);
    expect(plan.installOrder.map((pkg) => pkg.packageName)).toEqual(['vestara.m', 'vestara.z', 'vestara.a']);
    expect(plan.installOrder.every((pkg) => pkg.source === 'catalog')).toBe(true);
  });

  it('reports missing dependencies explicitly', async () => {
    const root = temp('resolve-missing');
    writePackage(path.join(root, 'a'), {
      id: 'vestara.a',
      dependencies: [{ packageId: 'vestara.missing', version: '^1.0.0' }],
    });

    const failure = await resolve(root, 'vestara.a', undefined).catch((error) => error as MarketplaceResolutionError);
    expect(failure).toBeInstanceOf(MarketplaceResolutionError);
    expect(failure.missingDependencies).toContain('vestara.missing');
  });

  it('detects circular dependencies with the offending path', async () => {
    const root = temp('resolve-cycle');
    writePackage(path.join(root, 'a'), {
      id: 'vestara.a',
      dependencies: [{ packageId: 'vestara.b', version: '^1.0.0' }],
    });
    writePackage(path.join(root, 'b'), {
      id: 'vestara.b',
      dependencies: [{ packageId: 'vestara.a', version: '^1.0.0' }],
    });

    const failure = await resolve(root, 'vestara.a', undefined).catch((error) => error as MarketplaceResolutionError);
    expect(failure).toBeInstanceOf(MarketplaceResolutionError);
    expect(failure.cycle).toEqual(expect.arrayContaining(['vestara.a', 'vestara.b']));
  });

  it('reports conflicting version requirements instead of guessing', async () => {
    const root = temp('resolve-conflict');
    writePackage(path.join(root, 'a'), {
      id: 'vestara.a',
      dependencies: [
        { packageId: 'vestara.b', version: '^1.0.0' },
        { packageId: 'vestara.c', version: '^1.0.0' },
      ],
    });
    writePackage(path.join(root, 'c'), {
      id: 'vestara.c',
      dependencies: [{ packageId: 'vestara.b', version: '^2.0.0' }],
    });
    writePackage(path.join(root, 'b-v1'), { id: 'vestara.b', version: '1.0.0' });
    writePackage(path.join(root, 'b-v2'), { id: 'vestara.b', version: '2.0.0' });

    const failure = await resolve(root, 'vestara.a', undefined).catch((error) => error as MarketplaceResolutionError);
    expect(failure).toBeInstanceOf(MarketplaceResolutionError);
    expect(failure.conflictingRequirements[0]?.packageName).toBe('vestara.b');
    expect(failure.conflictingRequirements[0]?.requirements).toEqual(expect.arrayContaining(['^1.0.0', '^2.0.0']));
  });

  it('reuses installed satisfiers and excludes them from the install order', async () => {
    const root = temp('resolve-installed');
    writePackage(path.join(root, 'a'), {
      id: 'vestara.a',
      dependencies: [{ packageId: 'vestara.b', version: '^1.0.0' }],
    });
    const manifestB = writePackage(path.join(root, 'b'), { id: 'vestara.b', version: '1.0.0' });

    const plan = await resolve(root, 'vestara.a', undefined, new Map([[manifestB.id, installedFrom(manifestB)]]));
    expect(plan.satisfiedByInstalled.map((pkg) => pkg.packageName)).toEqual(['vestara.b']);
    expect(plan.installOrder.map((pkg) => pkg.packageName)).toEqual(['vestara.a']);
  });

  it('rejects packages incompatible with the runtime', async () => {
    const root = temp('resolve-incompatible');
    writePackage(path.join(root, 'future'), { id: 'vestara.future', compatibility: { vestara: '>=9.0.0' } });

    const failure = await resolve(root, 'vestara.future', undefined).catch(
      (error) => error as MarketplaceResolutionError,
    );
    expect(failure).toBeInstanceOf(MarketplaceResolutionError);
    expect(failure.incompatible).toContain('vestara.future');
  });
});
