import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import { VESTARA_PACKAGE_MANIFEST } from '@vestara/extension-runtime';
import { afterAll, describe, expect, it } from 'vitest';
import { generatePublisherKeys, LocalMarketplaceRegistry, signManifest, verifyManifest } from '../src/index';

const directories: string[] = [];
function temp(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vestara-signature-${name}-`));
  directories.push(dir);
  return dir;
}

function writeManifest(dir: string, manifest: VestaraPackageManifest): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, VESTARA_PACKAGE_MANIFEST), JSON.stringify(manifest, null, 2));
}

afterAll(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('signature module', () => {
  it('round-trips sign and verify for a manifest', () => {
    const keys = generatePublisherKeys();
    const manifest: VestaraPackageManifest = {
      schemaVersion: 1,
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      description: 'demo',
      type: 'plugin',
      publisher: { id: 'acme', name: 'Acme' },
      compatibility: { vestara: '>=1.0.0' },
      entrypoints: {},
      capabilities: [],
      permissions: [],
      dependencies: [],
      contributions: {},
      isolation: 'in-process',
      integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
    };
    const signed = {
      ...manifest,
      integrity: { ...manifest.integrity, signature: signManifest(manifest, keys.privateKeyPem) },
    };
    const result = verifyManifest(signed, keys.publicKeyPem);
    expect(result.valid).toBe(true);
  });

  it('rejects a signature from a different key', () => {
    const signer = generatePublisherKeys();
    const other = generatePublisherKeys();
    const base: VestaraPackageManifest = {
      schemaVersion: 1,
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      description: 'demo',
      type: 'plugin',
      publisher: { id: 'acme', name: 'Acme' },
      compatibility: { vestara: '>=1.0.0' },
      entrypoints: {},
      capabilities: [],
      permissions: [],
      dependencies: [],
      contributions: {},
      isolation: 'in-process',
      integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
    };
    const signed: VestaraPackageManifest = {
      ...base,
      integrity: { ...base.integrity, signature: signManifest(base, signer.privateKeyPem) },
    };
    expect(verifyManifest(signed, other.publicKeyPem).valid).toBe(false);
  });

  it('rejects when the digest changed after signing', () => {
    const keys = generatePublisherKeys();
    const manifest: VestaraPackageManifest = {
      schemaVersion: 1,
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      description: 'demo',
      type: 'plugin',
      publisher: { id: 'acme', name: 'Acme' },
      compatibility: { vestara: '>=1.0.0' },
      entrypoints: {},
      capabilities: [],
      permissions: [],
      dependencies: [],
      contributions: {},
      isolation: 'in-process',
      integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
    };
    const signed = {
      ...manifest,
      integrity: { ...manifest.integrity, signature: signManifest(manifest, keys.privateKeyPem) },
    };
    const tampered = { ...signed, integrity: { ...signed.integrity, digest: 'b'.repeat(64) } };
    expect(verifyManifest(tampered, keys.publicKeyPem).valid).toBe(false);
  });
});

describe('local registry signature validation', () => {
  it('marks signatureValidated when the publisher public key is provided', async () => {
    const keys = generatePublisherKeys();
    const root = temp('local');
    const pkgDir = path.join(root, 'packages', 'demo');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'runtime.js'), 'module.exports = {};\n');
    const digest = 'a'.repeat(64);
    const base: VestaraPackageManifest = {
      schemaVersion: 1,
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      description: 'demo',
      type: 'plugin',
      publisher: { id: 'acme', name: 'Acme' },
      compatibility: { vestara: '>=1.0.0' },
      entrypoints: {},
      capabilities: [],
      permissions: [],
      dependencies: [],
      contributions: {},
      isolation: 'in-process',
      integrity: { algorithm: 'sha256', digest },
    };
    const signed: VestaraPackageManifest = {
      ...base,
      integrity: { ...base.integrity, signature: signManifest(base, keys.privateKeyPem) },
    };
    writeManifest(pkgDir, signed);

    const registry = new LocalMarketplaceRegistry({
      id: 'local',
      displayName: 'Local',
      roots: [root],
      publicKeyProvider: (publisherId) => (publisherId === 'acme' ? keys.publicKeyPem : undefined),
    });
    const assets = await registry.listAssets();
    const asset = assets.find((a) => a.packageName === 'demo');
    expect(asset).toBeDefined();
    expect(asset?.verification.signed).toBe(true);
    expect(asset?.verification.signatureValidated).toBe(true);
  });

  it('does not validate signatures when no public key is available', async () => {
    const keys = generatePublisherKeys();
    const root = temp('no-key');
    const pkgDir = path.join(root, 'packages', 'demo');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'runtime.js'), 'module.exports = {};\n');
    const digest = 'a'.repeat(64);
    const base: VestaraPackageManifest = {
      schemaVersion: 1,
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      description: 'demo',
      type: 'plugin',
      publisher: { id: 'acme', name: 'Acme' },
      compatibility: { vestara: '>=1.0.0' },
      entrypoints: {},
      capabilities: [],
      permissions: [],
      dependencies: [],
      contributions: {},
      isolation: 'in-process',
      integrity: { algorithm: 'sha256', digest },
    };
    const signed: VestaraPackageManifest = {
      ...base,
      integrity: { ...base.integrity, signature: signManifest(base, keys.privateKeyPem) },
    };
    writeManifest(pkgDir, signed);

    const registry = new LocalMarketplaceRegistry({ id: 'local', displayName: 'Local', roots: [root] });
    const assets = await registry.listAssets();
    const asset = assets.find((a) => a.packageName === 'demo');
    expect(asset).toBeDefined();
    expect(asset?.verification.signed).toBe(true);
    expect(asset?.verification.signatureValidated).toBe(false);
  });
});
