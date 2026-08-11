/**
 * Generates VestaraPackageManifest from detected package metadata.
 *
 * Writes vestara-package.json to the package directory and computes
 * the content digest for integrity verification.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import { digestPackageDirectory, VESTARA_PACKAGE_MANIFEST } from '@vestara/extension-runtime';
import type { DetectedPackage } from './manifest-readers';
import { mapPackageType } from './type-mapper';

export interface ManifestGeneratorOptions {
  readonly publisherId: string;
  readonly publisherName?: string;
  readonly vestaraVersion?: string;
}

export interface GeneratedManifest {
  readonly manifest: VestaraPackageManifest;
  readonly packageDir: string;
  readonly manifestPath: string;
}

export function generateManifest(
  detected: DetectedPackage,
  packageDir: string,
  options: ManifestGeneratorOptions,
): GeneratedManifest {
  const type = mapPackageType(detected);
  const id = `${options.publisherId}/${detected.name}`;
  const publisherName = options.publisherName ?? options.publisherId;
  const vestaraVersion = options.vestaraVersion ?? '>=0.3.0';

  const manifest: VestaraPackageManifest = {
    schemaVersion: 1,
    id,
    name: detected.name,
    version: detected.version,
    description: detected.description ?? `${detected.name} — detected from ${detected.manifestFile}`,
    type,
    publisher: { id: options.publisherId, name: publisherName },
    compatibility: {
      vestara: vestaraVersion,
    },
    entrypoints: {},
    capabilities: [],
    permissions: [],
    dependencies: Object.entries(detected.dependencies).map(([packageId, version]) => ({
      packageId,
      version,
    })),
    contributions: {},
    isolation: 'in-process',
    integrity: {
      algorithm: 'sha256',
      digest: '',
    },
  };

  // Compute digest from the directory contents (excluding vestara-package.json itself)
  const digest = digestPackageDirectory(packageDir);
  const finalManifest: VestaraPackageManifest = {
    ...manifest,
    integrity: { algorithm: 'sha256', digest },
  };

  // Write vestara-package.json
  const manifestPath = path.join(packageDir, VESTARA_PACKAGE_MANIFEST);
  fs.writeFileSync(manifestPath, JSON.stringify(finalManifest, null, 2) + '\n', 'utf8');

  return { manifest: finalManifest, packageDir, manifestPath };
}
