import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EngineeringGraph, entityId } from '@vestara/engineering-graph';
import type { ExtensionHealth, VestaraExtension, VestaraPackageManifest } from '@vestara/extension-contracts';
import { afterEach, describe, expect, it } from 'vitest';
import {
  digestPackageDirectory,
  EngineeringGraphExtensionProjection,
  type ExtensionEvent,
  type ExtensionLoader,
  type ExtensionPermissionApprover,
  LocalExtensionManager,
  satisfies,
  VESTARA_PACKAGE_MANIFEST,
} from '../src/index.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function temp(name: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  directories.push(directory);
  return directory;
}

function writePackage(
  root: string,
  version = '1.0.0',
  patch: Partial<VestaraPackageManifest> = {},
): VestaraPackageManifest {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'runtime.js'), `module.exports = {}; // ${version}\n`);
  const base: VestaraPackageManifest = {
    schemaVersion: 1,
    id: 'vestara.mock-provider',
    name: 'Mock Provider',
    version,
    description: 'Reference provider for local package tests',
    type: 'provider',
    publisher: { id: 'vestara', name: 'Vestara' },
    compatibility: { vestara: '>=1.0.0' },
    entrypoints: { runtime: './runtime.js' },
    capabilities: ['engineering.implementation'],
    permissions: [{ capability: 'network.outbound', scope: 'provider-api', resources: ['localhost'] }],
    dependencies: [],
    contributions: { providers: [{ id: 'mock-provider' }] },
    isolation: 'in-process',
    integrity: { algorithm: 'sha256', digest: '' },
  };
  const candidate = { ...base, ...patch };
  const manifest = {
    ...candidate,
    integrity: { algorithm: 'sha256' as const, digest: digestPackageDirectory(root) },
  };
  fs.writeFileSync(path.join(root, VESTARA_PACKAGE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

class FakeLoader implements ExtensionLoader {
  readonly calls: string[] = [];
  failActivation = false;
  contributionId = 'mock-provider';

  async load(_packagePath: string, manifest: VestaraPackageManifest): Promise<VestaraExtension> {
    const calls = this.calls;
    const loader = this;
    return {
      manifest,
      async install() {
        calls.push(`install:${manifest.version}`);
      },
      async activate(context) {
        calls.push(`activate:${manifest.version}`);
        if (loader.failActivation) throw new Error('activation failed');
        context.register('providers', { id: loader.contributionId });
      },
      async deactivate(context) {
        calls.push(`deactivate:${manifest.version}:${context.reason}`);
      },
      async uninstall() {
        calls.push(`uninstall:${manifest.version}`);
      },
      async healthCheck(): Promise<ExtensionHealth> {
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

describe('LocalExtensionManager', () => {
  it('installs, grants, activates, persists, disables, and uninstalls a local package', async () => {
    const source = temp('vestara-extension-source');
    const root = temp('vestara-extension-store');
    writePackage(source);
    const loader = new FakeLoader();
    const events: ExtensionEvent[] = [];
    const graph = new EngineeringGraph();
    const manager = new LocalExtensionManager(
      root,
      allow,
      undefined,
      loader,
      {
        publish(event) {
          events.push(event);
        },
      },
      new EngineeringGraphExtensionProjection(graph),
    );

    const result = await manager.install(source, { enable: true, workspaceId: 'workspace-a' });
    expect(result.activated).toBe(true);
    expect(result.installed.enabledWorkspaces).toEqual(['workspace-a']);
    expect(result.installed.versions['1.0.0']?.grantedPermissions[0]?.grantedBy).toBe('test-user');
    expect(manager.contributionRegistry().list('providers')).toEqual([{ id: 'mock-provider' }]);
    expect(graph.getEntity(entityId('marketplace-package', 'vestara.mock-provider'))?.status).toBe('installed');
    expect(graph.getEntity(entityId('extension', 'vestara.mock-provider@1.0.0'))?.status).toBe('active');
    expect(
      graph
        .outRelationships(entityId('marketplace-package', 'vestara.mock-provider'))
        .map((relationship) => relationship.type),
    ).toEqual(expect.arrayContaining(['published-by', 'provides', 'requests-permission']));
    expect(await manager.health('vestara.mock-provider', 'workspace-a')).toMatchObject({ status: 'healthy' });
    expect(new LocalExtensionManager(root, allow, undefined, loader).get('vestara.mock-provider')).toBeDefined();

    await manager.disable('vestara.mock-provider', 'workspace-a');
    expect(manager.contributionRegistry().list()).toEqual([]);
    await manager.uninstall('vestara.mock-provider', 'workspace-a');
    expect(manager.get('vestara.mock-provider')).toBeUndefined();
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'marketplace.install-requested',
        'marketplace.package-verified',
        'marketplace.permission-requested',
        'marketplace.package-installed',
        'marketplace.package-activated',
        'marketplace.package-uninstalled',
      ]),
    );
  });

  it('leaves no installation when permission or integrity verification fails', async () => {
    const source = temp('vestara-extension-source');
    const root = temp('vestara-extension-store');
    writePackage(source);
    const deny: ExtensionPermissionApprover = {
      async decide() {
        return { granted: false, grantedBy: 'test-user' };
      },
    };
    const denied = new LocalExtensionManager(root, deny, undefined, new FakeLoader());
    await expect(denied.install(source)).rejects.toThrow('Permission rejected');
    expect(denied.list()).toEqual([]);

    fs.appendFileSync(path.join(source, 'runtime.js'), 'tampered');
    const verified = new LocalExtensionManager(root, allow, undefined, new FakeLoader());
    await expect(verified.install(source)).rejects.toThrow('integrity mismatch');
    expect(verified.list()).toEqual([]);
  });

  it('rolls back package state and files after activation failure', async () => {
    const source = temp('vestara-extension-source');
    const root = temp('vestara-extension-store');
    writePackage(source);
    const loader = new FakeLoader();
    loader.failActivation = true;
    const manager = new LocalExtensionManager(root, allow, undefined, loader);
    await expect(manager.install(source, { enable: true, workspaceId: 'workspace-a' })).rejects.toThrow(
      'activation failed',
    );
    expect(manager.list()).toEqual([]);
    expect(manager.contributionRegistry().list()).toEqual([]);
    expect(fs.existsSync(path.join(root, 'packages', 'vestara.mock-provider', '1.0.0'))).toBe(false);
  });

  it('rejects symlinked content and undeclared runtime contributions', async () => {
    const source = temp('vestara-extension-source');
    const root = temp('vestara-extension-store');
    writePackage(source);
    fs.symlinkSync(path.join(source, 'runtime.js'), path.join(source, 'escape-link'));
    const manager = new LocalExtensionManager(root, allow, undefined, new FakeLoader());
    await expect(manager.install(source)).rejects.toThrow('symbolic link');
    fs.unlinkSync(path.join(source, 'escape-link'));

    const loader = new FakeLoader();
    loader.contributionId = 'undeclared-provider';
    const guarded = new LocalExtensionManager(root, allow, undefined, loader);
    await expect(guarded.install(source, { enable: true })).rejects.toThrow('Undeclared contribution');
    expect(guarded.list()).toEqual([]);
    expect(guarded.contributionRegistry().list()).toEqual([]);
  });

  it('updates and rolls back between retained immutable versions', async () => {
    const first = temp('vestara-extension-v1');
    const second = temp('vestara-extension-v2');
    const root = temp('vestara-extension-store');
    writePackage(first, '1.0.0');
    writePackage(second, '1.1.0');
    const loader = new FakeLoader();
    const manager = new LocalExtensionManager(root, allow, undefined, loader);
    await manager.install(first, { enable: true, workspaceId: 'workspace-a' });
    await manager.install(second, { enable: true, workspaceId: 'workspace-a' });
    expect(manager.get('vestara.mock-provider')?.currentVersion).toBe('1.1.0');
    expect(manager.get('vestara.mock-provider')?.versions['1.0.0']).toBeDefined();
    await manager.rollback('vestara.mock-provider', '1.0.0', 'workspace-a');
    expect(manager.get('vestara.mock-provider')?.currentVersion).toBe('1.0.0');
    expect(manager.contributionRegistry().list('providers')).toEqual([{ id: 'mock-provider' }]);
  });

  it('supports exact, caret, and comparator dependency ranges', () => {
    expect(satisfies('1.4.2', '1.4.2')).toBe(true);
    expect(satisfies('1.4.2', '^1.2.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
    expect(satisfies('1.4.2', '>=1.0.0 <2.0.0')).toBe(true);
  });

  it('rejects incompatible and cyclic package upgrades', async () => {
    const root = temp('vestara-extension-store');
    const packageA = temp('vestara-extension-a');
    const packageB = temp('vestara-extension-b');
    const packageAUpdate = temp('vestara-extension-a-update');
    writePackage(packageA, '1.0.0', { id: 'vestara.package-a', entrypoints: {} });
    writePackage(packageB, '1.0.0', {
      id: 'vestara.package-b',
      entrypoints: {},
      dependencies: [{ packageId: 'vestara.package-a', version: '^1.0.0' }],
    });
    writePackage(packageAUpdate, '1.1.0', {
      id: 'vestara.package-a',
      entrypoints: {},
      dependencies: [{ packageId: 'vestara.package-b', version: '^1.0.0' }],
    });
    const manager = new LocalExtensionManager(root, allow, undefined, new FakeLoader());
    await manager.install(packageA);
    await manager.install(packageB);
    await expect(manager.install(packageAUpdate)).rejects.toThrow('Dependency cycle');
    expect(manager.get('vestara.package-a')?.currentVersion).toBe('1.0.0');

    const incompatible = temp('vestara-extension-incompatible');
    writePackage(incompatible, '1.0.0', {
      id: 'vestara.incompatible',
      entrypoints: {},
      compatibility: { vestara: '>=9.0.0' },
    });
    await expect(manager.install(incompatible)).rejects.toThrow('requires Vestara');
  });
});
