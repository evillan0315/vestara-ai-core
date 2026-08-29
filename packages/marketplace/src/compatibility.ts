import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import { satisfies } from '@vestara/extension-runtime';
import type { MarketplaceCompatibilitySummary } from './asset';

export type CompatibilityStatus =
  | 'compatible'
  | 'incompatible-vestara'
  | 'incompatible-node'
  | 'incompatible-operating-system'
  | 'incompatible-architecture';

/** The runtime the candidate package must run in. */
export interface RuntimeCompatibilityContext {
  readonly vestaraVersion: string;
  readonly nodeVersion?: string;
  readonly operatingSystem?: string;
  readonly architecture?: string;
}

/** Normalize Node's platform names to the manifest's vocabulary (darwin → macos). */
export function platformToOperatingSystem(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? 'macos' : platform;
}

/**
 * Check a declared compatibility block against the runtime context. Checks run in
 * declaration order: Vestara version, Node version, OS, architecture. Returns the
 * first failing status, or `compatible`.
 */
export function checkCompatibility(
  compatibility: MarketplaceCompatibilitySummary | undefined,
  context: RuntimeCompatibilityContext,
): CompatibilityStatus {
  if (!compatibility) return 'compatible';
  if (!satisfies(context.vestaraVersion, compatibility.vestara)) return 'incompatible-vestara';
  if (compatibility.node) {
    const nodeVersion = context.nodeVersion ?? process.versions.node.split('-')[0] ?? process.versions.node;
    if (!satisfies(nodeVersion, compatibility.node)) return 'incompatible-node';
  }
  if (compatibility.operatingSystems?.length) {
    const operatingSystem = context.operatingSystem ?? platformToOperatingSystem(process.platform);
    if (!compatibility.operatingSystems.includes(operatingSystem)) return 'incompatible-operating-system';
  }
  if (compatibility.architectures?.length) {
    const architecture = context.architecture ?? process.arch;
    if (!compatibility.architectures.includes(architecture)) return 'incompatible-architecture';
  }
  return 'compatible';
}

export function isCompatible(
  compatibility: MarketplaceCompatibilitySummary | undefined,
  context: RuntimeCompatibilityContext,
): boolean {
  return checkCompatibility(compatibility, context) === 'compatible';
}

/** Compatibility status of a full manifest. */
export function compatibilityStatusOf(
  manifest: Pick<VestaraPackageManifest, 'compatibility'>,
  context: RuntimeCompatibilityContext,
): CompatibilityStatus {
  return checkCompatibility(
    {
      vestara: manifest.compatibility.vestara,
      node: manifest.compatibility.node,
      operatingSystems: manifest.compatibility.operatingSystems,
      architectures: manifest.compatibility.architectures,
    },
    context,
  );
}

export function compatibilityLabel(status: CompatibilityStatus): string {
  switch (status) {
    case 'compatible':
      return 'compatible';
    case 'incompatible-vestara':
      return 'incompatible (Vestara version)';
    case 'incompatible-node':
      return 'incompatible (Node version)';
    case 'incompatible-operating-system':
      return 'incompatible (OS)';
    case 'incompatible-architecture':
      return 'incompatible (architecture)';
  }
}
