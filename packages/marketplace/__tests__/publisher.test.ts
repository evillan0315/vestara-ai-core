import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { digestPackageDirectory, readManifest, VESTARA_PACKAGE_MANIFEST } from '@vestara/extension-runtime';
import { afterAll, describe, expect, it } from 'vitest';
import { generatePublisherKeys, MarketplacePublisher, verifyManifest } from '../src/index';

const directories: string[] = [];
function temp(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vestara-publish-${name}-`));
  directories.push(dir);
  return dir;
}

function seedPackage(dir: string, id: string, version = '1.0.0'): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'runtime.js'), 'module.exports = {};\n');
  const manifest = {
    schemaVersion: 1,
    id,
    name: id,
    version,
    description: `Package ${id}`,
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
  fs.writeFileSync(path.join(dir, VESTARA_PACKAGE_MANIFEST), JSON.stringify(manifest, null, 2));
}

afterAll(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('MarketplacePublisher', () => {
  it('publishes an unsigned package with a recomputed digest', () => {
    const dir = temp('unsigned');
    seedPackage(dir, 'demo', '1.0.0');
    const publisher = new MarketplacePublisher();
    const result = publisher.publish({ source: { packagePath: dir } });
    expect(result.signed).toBe(false);
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    const manifest = readManifest(dir);
    expect(manifest.integrity.digest).toBe(digestPackageDirectory(dir));
  });

  it('signs a package when a private key is provided', () => {
    const keys = generatePublisherKeys();
    const dir = temp('signed');
    seedPackage(dir, 'demo', '1.0.0');
    const publisher = new MarketplacePublisher();
    const result = publisher.publish({
      source: { packagePath: dir },
      signing: { privateKeyPem: keys.privateKeyPem },
    });
    expect(result.signed).toBe(true);
    expect(result.signatureValid).toBe(true);
    const manifest = readManifest(dir);
    expect(manifest.integrity.signature).toBeDefined();
    expect(verifyManifest(manifest, keys.publicKeyPem).valid).toBe(true);
  });

  it('regenerates keys usable for signing and verification', () => {
    const publisher = new MarketplacePublisher();
    const keys = publisher.generateKeys();
    expect(keys.privateKeyPem).toContain('PRIVATE KEY');
    expect(keys.publicKeyPem).toContain('PUBLIC KEY');
    const dir = temp('keygen');
    seedPackage(dir, 'demo', '1.0.0');
    publisher.publish({ source: { packagePath: dir }, signing: { privateKeyPem: keys.privateKeyPem } });
    const manifest = readManifest(dir);
    expect(verifyManifest(manifest, keys.publicKeyPem).valid).toBe(true);
  });

  it('throws for a directory without a valid manifest', () => {
    const dir = temp('invalid');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'runtime.js'), 'module.exports = {};\n');
    const publisher = new MarketplacePublisher();
    expect(() => publisher.publish({ source: { packagePath: dir } })).toThrow();
  });

  it('registers the published package into a registry root', () => {
    const source = temp('into-root-source');
    const root = temp('into-root');
    seedPackage(source, 'demo', '1.0.0');
    const publisher = new MarketplacePublisher();
    const result = publisher.publishIntoRoot({ source: { packagePath: source }, root });
    expect(result.targetPath).toBe(path.join(root, 'acme', 'demo', '1.0.0'));
    expect(fs.existsSync(path.join(result.targetPath, VESTARA_PACKAGE_MANIFEST))).toBe(true);
    // The registered copy preserves a self-consistent digest.
    const manifest = readManifest(result.targetPath);
    expect(manifest.integrity.digest).toBe(digestPackageDirectory(result.targetPath));
  });

  it('sanitizes publisher identity segments in the registry path', () => {
    const source = temp('into-root-sanitize');
    const root = temp('into-root-sanitize-root');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'runtime.js'), 'module.exports = {};\n');
    fs.writeFileSync(
      path.join(source, VESTARA_PACKAGE_MANIFEST),
      JSON.stringify({
        schemaVersion: 1,
        id: 'demo',
        name: 'demo',
        version: '1.0.0',
        description: 'Demo package',
        type: 'plugin',
        publisher: { id: 'acme/org', name: 'Acme' },
        compatibility: { vestara: '>=1.0.0' },
        entrypoints: {},
        capabilities: [],
        permissions: [],
        dependencies: [],
        contributions: {},
        isolation: 'in-process',
        integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
      }),
    );
    const result = new MarketplacePublisher().publishIntoRoot({ source: { packagePath: source }, root });
    expect(result.targetPath).toBe(path.join(root, 'acme_org', 'demo', '1.0.0'));
    expect(fs.existsSync(path.join(result.targetPath, VESTARA_PACKAGE_MANIFEST))).toBe(true);
  });
});
