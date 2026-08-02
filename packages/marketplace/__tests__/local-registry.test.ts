import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { MarketplaceEvent } from '../src/index.js';
import { LocalMarketplaceRegistry } from '../src/index.js';
import { cleanup, temp, writeInvalidPackage, writePackage } from './helpers.js';

afterAll(cleanup);

function registry(roots: readonly string[], events?: MarketplaceEvent[]): LocalMarketplaceRegistry {
  return new LocalMarketplaceRegistry({
    id: 'local',
    displayName: 'Local',
    roots,
    eventSink: events
      ? {
          publish(event) {
            events.push(event);
          },
        }
      : undefined,
  });
}

describe('LocalMarketplaceRegistry', () => {
  it('discovers valid packages with provenance and verified checksums', async () => {
    const root = temp('catalog');
    writePackage(path.join(root, 'alpha'), { id: 'vestara.alpha', version: '1.0.0' });
    writePackage(path.join(root, 'beta'), { id: 'vestara.beta', version: '2.1.0' });

    const registryRef = registry([root]);
    const scan = await registryRef.scan();

    expect(scan.assetsFound).toBe(2);
    expect(scan.malformed).toHaveLength(0);
    expect(scan.errors).toHaveLength(0);

    const assets = await registryRef.listAssets();
    expect(assets.map((asset) => asset.packageName)).toEqual(['vestara.alpha', 'vestara.beta']);
    expect(assets.every((asset) => asset.visibility === 'local')).toBe(true);
    expect(assets.every((asset) => asset.verification.checksumVerified)).toBe(true);

    const search = await registryRef.search({ query: 'alpha' });
    expect(search.items[0]?.registryId).toBe('local');
    expect(search.items[0]?.asset.packageName).toBe('vestara.alpha');
  });

  it('isolates malformed packages without failing the scan', async () => {
    const root = temp('malformed');
    writePackage(path.join(root, 'good'), { id: 'vestara.good' });
    writeInvalidPackage(path.join(root, 'bad'), '{ not json');
    const invalidDir = path.join(root, 'invalid-field');
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(
      path.join(invalidDir, 'vestara-package.json'),
      JSON.stringify({ schemaVersion: 99, id: 'vestara.invalid' }),
    );

    const registryRef = registry([root]);
    const scan = await registryRef.scan();

    expect(scan.assetsFound).toBe(1);
    expect(scan.malformed.length).toBe(2);
    expect(scan.malformed.map((issue) => issue.reason)).toEqual(
      expect.arrayContaining([expect.stringContaining('schemaVersion')]),
    );
    expect(scan.malformed.every((issue) => issue.reason.length > 0)).toBe(true);
    const assets = await registryRef.listAssets();
    expect(assets.map((asset) => asset.packageName)).toEqual(['vestara.good']);
  });

  it('skips symlinked entries and rejects symlinks inside packages', async () => {
    const root = temp('symlinks');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.pkg' });
    fs.symlinkSync(path.join(root, 'pkg'), path.join(root, 'escape-link'));

    const registryRef = registry([root]);
    const scan = await registryRef.scan();
    expect(scan.skipped.some((issue) => issue.path.endsWith('escape-link'))).toBe(true);
    expect(scan.assetsFound).toBe(1);

    // A symlink inside a package makes its digest computation reject the package.
    const innerRoot = temp('symlink-inner');
    writePackage(path.join(innerRoot, 'pkg'), { id: 'vestara.pkg2' });
    fs.symlinkSync('runtime.js', path.join(innerRoot, 'pkg', 'inner-link'));
    const inner = registry([innerRoot]);
    const scan2 = await inner.scan();
    expect(scan2.malformed.some((issue) => issue.packageName === 'vestara.pkg2')).toBe(true);
    expect(scan2.malformed[0]?.reason).toContain('symbolic link');
  });

  it('detects duplicate versions across roots and keeps deterministic winners', async () => {
    const rootA = temp('dup-a');
    const rootB = temp('dup-b');
    writePackage(path.join(rootA, 'pkg'), { id: 'vestara.dup', version: '1.0.0' });
    writePackage(path.join(rootB, 'pkg'), { id: 'vestara.dup', version: '1.0.0' });

    const registryRef = registry([rootA, rootB]);
    const scan = await registryRef.scan();
    expect(scan.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(scan.assetsFound).toBe(1);
    const assets = await registryRef.listAssets();
    expect(assets[0]?.versions).toHaveLength(1);
  });

  it('merges multiple versions of the same package into one asset', async () => {
    const root = temp('multi-version');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.multi', version: '1.0.0' });
    writePackage(path.join(root, 'pkg-v2'), { id: 'vestara.multi', version: '2.0.0' });

    const registryRef = registry([root]);
    await registryRef.scan();
    const asset = (await registryRef.getAsset({ packageName: 'vestara.multi' }))!;
    expect(asset.versions.map((version) => version.version)).toEqual(['2.0.0', '1.0.0']);
    expect(asset.latestVersion).toBe('2.0.0');
  });

  it('rescans incrementally and detects content changes', async () => {
    const root = temp('incremental');
    const packageDir = path.join(root, 'pkg');
    writePackage(packageDir, { id: 'vestara.incr', version: '1.0.0' });

    const registryRef = registry([root]);
    const first = await registryRef.scan();
    expect(first.assetsFound).toBe(1);
    expect((await registryRef.listAssets())[0]?.verification.checksumVerified).toBe(true);

    // Tamper with content after the digest was computed.
    fs.appendFileSync(path.join(packageDir, 'runtime.js'), '// tampered\n');
    await registryRef.scan();
    const asset = (await registryRef.getAsset({ packageName: 'vestara.incr' }))!;
    expect(asset.verification.checksumVerified).toBe(false);
  });

  it('enforces manifest size bounds', async () => {
    const root = temp('size-bound');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.size' });
    fs.writeFileSync(path.join(root, 'pkg', 'vestara-package.json'), JSON.stringify({ padding: 'x'.repeat(200_000) }));

    const registryRef = new LocalMarketplaceRegistry({
      id: 'local',
      displayName: 'Local',
      roots: [root],
      maxManifestBytes: 1024,
    });
    const scan = await registryRef.scan();
    expect(scan.malformed.length).toBe(1);
    expect(scan.malformed[0]?.reason).toContain('size bound');
  });

  it('emits registry and asset events without per-file noise', async () => {
    const root = temp('events');
    writePackage(path.join(root, 'pkg'), { id: 'vestara.events' });
    const events: MarketplaceEvent[] = [];
    const registryRef = registry([root], events);
    await registryRef.scan();

    const types = events.map((event) => event.type);
    expect(types).toContain('marketplace.registry.scanned');
    expect(types).toContain('marketplace.asset.discovered');
    expect(types).not.toContain('marketplace.asset.updated');
    expect(events.filter((event) => event.type.includes('file'))).toHaveLength(0);
  });
});
