import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import { digestPackageDirectory, VESTARA_PACKAGE_MANIFEST } from '@vestara/extension-runtime';

const directories: string[] = [];

/** Register a temp dir for cleanup at the end of the suite. */
export function temp(name: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `vestara-marketplace-${name}-`));
  directories.push(directory);
  return directory;
}

export function cleanup(): void {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
}

export type PackageSeed = Partial<VestaraPackageManifest> & { readonly id: string };

/** Write a valid package (with a computed sha256 digest) into `dir`. */
export function writePackage(dir: string, seed: PackageSeed): VestaraPackageManifest {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'runtime.js'), 'module.exports = {};\n');
  const base: VestaraPackageManifest = {
    schemaVersion: 1,
    id: seed.id,
    name: seed.name ?? seed.id,
    version: seed.version ?? '1.0.0',
    description: seed.description ?? `Test package ${seed.id}`,
    type: seed.type ?? 'plugin',
    publisher: seed.publisher ?? { id: 'vestara', name: 'Vestara' },
    compatibility: seed.compatibility ?? { vestara: '>=1.0.0' },
    entrypoints: seed.entrypoints ?? {},
    capabilities: seed.capabilities ?? [],
    permissions: seed.permissions ?? [],
    dependencies: seed.dependencies ?? [],
    contributions: seed.contributions ?? {},
    isolation: seed.isolation ?? 'in-process',
    integrity: { algorithm: 'sha256', digest: '' },
  };
  const manifest: VestaraPackageManifest = {
    ...base,
    integrity: { algorithm: 'sha256' as const, digest: digestPackageDirectory(dir) },
  };
  fs.writeFileSync(path.join(dir, VESTARA_PACKAGE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Seed a package with a deliberately invalid manifest (e.g., malformed JSON or missing fields). */
export function writeInvalidPackage(dir: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, VESTARA_PACKAGE_MANIFEST), content);
}
