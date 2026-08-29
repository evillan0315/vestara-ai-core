// Canonical identity map for native Marketplace packages. One package resolves
// to one identity across npm name, Marketplace asset ID, package type, runtime
// type, and installation directory. Native packaging makes identity drift very
// hard to correct later, so all resolution goes through these helpers.

import type { VestaraPackageManifest } from '@vestara/extension-contracts';

/** `@vestara/tui` → `vestara.tui` (npm scoped name → Marketplace dot id). */
export function toPackageId(reference: string): string {
  return reference.replace(/^@/, '').replace(/\//g, '.');
}

/** `vestara.tui` → `@vestara/tui` (Marketplace dot id → npm scoped name). */
export function toNpmName(packageId: string): string {
  return `@${packageId.replace(/\./g, '/')}`;
}

/** The canonical installation directory name for a package id. */
export function installationDirName(packageId: string): string {
  return packageId.replace(/\./g, '-');
}

export interface CanonicalIdentity {
  readonly packageId: string;
  readonly npmName: string;
  readonly type: string;
  readonly dirName: string;
}

export function identityFromManifest(
  manifest: Pick<VestaraPackageManifest, 'id' | 'name' | 'type'>,
): CanonicalIdentity {
  return {
    packageId: manifest.id,
    npmName: toNpmName(manifest.id),
    type: manifest.type,
    dirName: installationDirName(manifest.id),
  };
}

/** Assert a manifest identity is a native (executable) package. */
export function assertNativePackage(manifest: Pick<VestaraPackageManifest, 'id' | 'type' | 'entrypoints'>): void {
  if (manifest.type !== 'tui') {
    throw new Error(`Package ${manifest.id} is type "${manifest.type}"; native installer requires type "tui"`);
  }
  const entrypoints = manifest.entrypoints as Record<string, unknown> | undefined;
  if (!entrypoints?.executable) {
    throw new Error(`Package ${manifest.id} declares no executable entrypoint`);
  }
}
