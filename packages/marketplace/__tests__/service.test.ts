import * as path from 'node:path';
import type { VestaraPackageContributions, VestaraPackageManifest } from '@vestara/extension-contracts';
import {
  type ExtensionLoader,
  type ExtensionPermissionApprover,
  LocalExtensionManager,
  type VestaraExtension,
} from '@vestara/extension-runtime';
import { afterAll, describe, expect, it } from 'vitest';
import {
  LocalMarketplaceRegistry,
  MarketplaceInstallError,
  type MarketplaceRegistry,
  MarketplaceService,
} from '../src/index.js';
import { cleanup, temp, writePackage } from './helpers.js';

afterAll(cleanup);

class FakeLoader implements ExtensionLoader {
  async load(_packagePath: string, manifest: VestaraPackageManifest): Promise<VestaraExtension> {
    return {
      manifest,
      async install() {},
      async activate(context) {
        for (const [kind, references] of Object.entries(manifest.contributions)) {
          for (const reference of references ?? []) {
            context.register(kind as keyof VestaraPackageContributions, reference);
          }
        }
      },
      async deactivate() {},
      async uninstall() {},
      async healthCheck() {
        return { status: 'healthy', checkedAt: new Date().toISOString() };
      },
    };
  }
}

const allow: ExtensionPermissionApprover = {
  async decide() {
    return { granted: true, grantedBy: 'test-user' };
  },
};

class BrokenRegistry implements MarketplaceRegistry {
  readonly id = 'broken';
  readonly kind = 'local' as const;
  readonly displayName = 'Broken Registry';

  async scan(): Promise<never> {
    throw new Error('boom');
  }
  async listAssets(): Promise<never> {
    throw new Error('boom');
  }
  async search(): Promise<never> {
    throw new Error('boom');
  }
  async getAsset(): Promise<undefined> {
    return undefined;
  }
  async getVersion(): Promise<undefined> {
    return undefined;
  }
  async listCategories(): Promise<readonly { name: string; assetCount: number }[]> {
    return [];
  }
  async getHealth() {
    return { status: 'unhealthy' as const, assetCount: 0, error: 'boom' };
  }
}

function createService(marketplaceDir: string, extraRegistries: MarketplaceRegistry[] = []) {
  const manager = new LocalExtensionManager(
    path.join(marketplaceDir, '.extensions'),
    allow,
    undefined,
    new FakeLoader(),
  );
  const local = new LocalMarketplaceRegistry({ id: 'local', displayName: 'Local', roots: [marketplaceDir] });
  const service = new MarketplaceService({
    registries: [...extraRegistries, local],
    manager,
    vestaraVersion: '1.0.0',
    workspaceId: 'workspace-a',
  });
  return { manager, service };
}

describe('MarketplaceService', () => {
  it('searches and returns asset details with provenance', async () => {
    const root = temp('service-search');
    writePackage(path.join(root, 'pkg'), {
      id: 'vestara.svc',
      permissions: [{ capability: 'network.outbound', scope: 'provider-api', resources: ['localhost'] }],
    });

    const { service } = createService(root);
    const results = await service.search({ query: 'svc' });
    expect(results.items[0]?.registryId).toBe('local');
    expect(results.total).toBe(1);

    const details = await service.getAsset('vestara.svc');
    expect(details.registryId).toBe('local');
    expect(details.asset.packageName).toBe('vestara.svc');
    expect(details.permissions[0]?.capability).toBe('network.outbound');
    expect(details.integrityVerified).toBe(true);
  });

  it('delegates install to extension-runtime and projects the result', async () => {
    const root = temp('service-install');
    writePackage(path.join(root, 'pkg'), {
      id: 'vestara.inst',
      version: '1.0.0',
      entrypoints: { runtime: './runtime.js' },
    });

    const { manager, service } = createService(root);
    const operation = await service.install({ reference: 'vestara.inst', enable: true });

    expect(operation.status).toBe('completed');
    expect(operation.packageName).toBe('vestara.inst');
    expect(operation.installed?.state).toBe('active');
    expect(manager.get('vestara.inst')?.currentVersion).toBe('1.0.0');

    const installed = await service.listInstalled();
    expect(installed[0]).toMatchObject({ packageName: 'vestara.inst', installedVersion: '1.0.0' });
  });

  it('registers metadata-only packages without activation', async () => {
    const root = temp('service-metadata');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.meta', version: '1.0.0' });

    const { manager, service } = createService(root);
    const operation = await service.install({ reference: 'vestara.meta', enable: true });

    expect(operation.status).toBe('completed');
    expect(operation.installed?.state).toBe('installed');
    expect(manager.get('vestara.meta')).toBeDefined();
  });

  it('dry-run installs plan without delegating to extension-runtime', async () => {
    const root = temp('service-dry-run');
    writePackage(path.join(root, 'pkg'), {
      id: 'vestara.dry',
      permissions: [{ capability: 'network.outbound', scope: 'provider-api', resources: ['localhost'] }],
    });

    const { manager, service } = createService(root);
    const operation = await service.install({ reference: 'vestara.dry', dryRun: true });

    expect(operation.status).toBe('planned');
    expect(operation.resolution?.installOrder.map((pkg) => pkg.packageName)).toEqual(['vestara.dry']);
    expect(operation.permissions).toEqual([{ capability: 'network.outbound', scope: 'provider-api' }]);
    expect(manager.get('vestara.dry')).toBeUndefined();
  });

  it('resolves dependencies during install and enables them', async () => {
    const root = temp('service-deps');
    writePackage(path.join(root, 'dep'), { id: 'vestara.dep', version: '1.0.0' });
    writePackage(path.join(root, 'app'), {
      id: 'vestara.app',
      dependencies: [{ packageId: 'vestara.dep', version: '^1.0.0' }],
    });

    const { manager, service } = createService(root);
    const operation = await service.install({ reference: 'vestara.app', enable: true });
    expect(operation.status).toBe('completed');
    expect(manager.get('vestara.dep')).toBeDefined();
    expect(manager.get('vestara.app')).toBeDefined();
    expect(operation.installed?.packageName).toBe('vestara.app');
  });

  it('detects updates after a newer version is published and updates to it', async () => {
    const root = temp('service-updates');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.up', version: '1.0.0' });

    const { manager, service } = createService(root);
    await service.install({ reference: 'vestara.up' });
    expect(manager.get('vestara.up')?.currentVersion).toBe('1.0.0');

    writePackage(path.join(root, 'pkg-v2'), { id: 'vestara.up', version: '2.0.0' });
    await service.rescan();
    const updates = await service.listUpdates();
    expect(updates[0]).toMatchObject({ packageName: 'vestara.up', installedVersion: '1.0.0', targetVersion: '2.0.0' });

    const operation = await service.update({ packageName: 'vestara.up' });
    expect(operation.status).toBe('completed');
    expect(manager.get('vestara.up')?.currentVersion).toBe('2.0.0');
    expect(await service.listUpdates()).toEqual([]);
  });

  it('uninstalls through extension-runtime', async () => {
    const root = temp('service-uninstall');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.un' });

    const { manager, service } = createService(root);
    await service.install({ reference: 'vestara.un' });
    const operation = await service.uninstall({ packageName: 'vestara.un' });
    expect(operation.status).toBe('completed');
    expect(manager.get('vestara.un')).toBeUndefined();
  });

  it('verifies package integrity against the manifest digest', async () => {
    const root = temp('service-verify');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.ver' });

    const { service } = createService(root);
    const operation = await service.verify({ reference: 'vestara.ver' });
    expect(operation.status).toBe('completed');
    expect(operation.message).toContain('verified');
  });

  it('rescans registries', async () => {
    const root = temp('service-rescan');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.rescan' });

    const { service } = createService(root);
    const operation = await service.rescan();
    expect(operation.operation).toBe('rescan');
    expect(operation.scanResults?.[0]?.assetsFound).toBe(1);
  });

  it('isolates registry failures while preserving healthy registry results', async () => {
    const root = temp('service-isolation');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.isolated' });

    const { service } = createService(root, [new BrokenRegistry()]);
    const results = await service.search({ query: '' });
    expect(results.items.map((hit) => hit.asset.packageName)).toEqual(['vestara.isolated']);
    expect(results.registryErrors?.some((message) => message.includes('broken'))).toBe(true);
  });

  it('rejects updates for packages that are not installed', async () => {
    const root = temp('service-not-installed');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.never' });

    const { service } = createService(root);
    await expect(service.update({ packageName: 'vestara.never' })).rejects.toBeInstanceOf(MarketplaceInstallError);
  });

  it('enables an installed package', async () => {
    const root = temp('service-enable');
    writePackage(path.join(root, 'pkg'), {
      id: 'vestara.toggle',
      version: '1.0.0',
      entrypoints: { runtime: './runtime.js' },
    });

    const { manager, service } = createService(root);
    await service.install({ reference: 'vestara.toggle', enable: false });
    const afterInstall = (await service.listInstalled())[0];
    expect(afterInstall?.enabled).toBe(false);

    const operation = await service.setEnabled({ packageName: 'vestara.toggle', enabled: true });
    expect(operation.status).toBe('completed');
    expect(operation.installed?.enabled).toBe(true);
    expect(manager.get('vestara.toggle')?.versions['1.0.0']?.state).toBe('active');
  });

  it('disables an enabled package', async () => {
    const root = temp('service-disable');
    writePackage(path.join(root, 'pkg'), {
      id: 'vestara.toggle2',
      version: '1.0.0',
      entrypoints: { runtime: './runtime.js' },
    });

    const { manager, service } = createService(root);
    await service.install({ reference: 'vestara.toggle2', enable: true });
    const afterInstall = (await service.listInstalled())[0];
    expect(afterInstall?.enabled).toBe(true);

    const operation = await service.setEnabled({ packageName: 'vestara.toggle2', enabled: false });
    expect(operation.status).toBe('completed');
    expect(operation.installed?.enabled).toBe(false);
    expect(manager.get('vestara.toggle2')?.versions['1.0.0']?.state).toBe('disabled');
  });

  it('returns idempotent result when already in requested state', async () => {
    const root = temp('service-enable-idempotent');
    writePackage(path.join(root, 'pkg'), {
      id: 'vestara.idem',
      version: '1.0.0',
      entrypoints: { runtime: './runtime.js' },
    });

    const { service } = createService(root);
    await service.install({ reference: 'vestara.idem', enable: true });

    const operation = await service.setEnabled({ packageName: 'vestara.idem', enabled: true });
    expect(operation.status).toBe('completed');
    expect(operation.message).toContain('already enabled');
  });

  it('rejects setEnabled for a package that is not installed', async () => {
    const root = temp('service-enable-not-installed');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.missing' });

    const { service } = createService(root);
    await expect(service.setEnabled({ packageName: 'vestara.missing', enabled: true })).rejects.toBeInstanceOf(
      MarketplaceInstallError,
    );
  });
});
