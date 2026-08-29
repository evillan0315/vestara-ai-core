import type { InstalledExtension } from '@vestara/extension-runtime';
import type { MarketplaceAsset } from './asset';
import type { RuntimeCompatibilityContext } from './compatibility';
import { isCompatible } from './compatibility';
import { compareSemver, versionBumpType } from './versions';

export type MarketplaceUpdateStatus = 'current' | 'update-available' | 'incompatible-update' | 'unknown';

export type MarketplaceInstallState = 'installed' | 'active' | 'inactive' | 'failed' | 'rollback-available';

export type MarketplaceUpdateType = 'patch' | 'minor' | 'major' | 'prerelease';

/** Projected view of an installed package, derived from `LocalExtensionManager` state. */
export interface InstalledMarketplaceAsset {
  readonly assetId: string;
  readonly packageName: string;
  readonly installedVersion: string;
  readonly latestCompatibleVersion?: string;
  readonly state: MarketplaceInstallState;
  readonly enabled: boolean;
  readonly updateStatus: MarketplaceUpdateStatus;
  readonly installedAt: string;
}

export interface MarketplaceUpdateCandidate {
  readonly packageName: string;
  readonly installedVersion: string;
  readonly targetVersion: string;
  readonly updateType: MarketplaceUpdateType;
  readonly compatible: boolean;
  readonly reason?: string;
}

function projectState(installed: InstalledExtension): MarketplaceInstallState {
  const version = installed.versions[installed.currentVersion];
  const hasRollback = Object.keys(installed.versions).length > 1;
  if (version?.state === 'active') return 'active';
  if (version?.state === 'disabled') return 'inactive';
  if (version?.state === 'failed') return 'failed';
  return hasRollback ? 'rollback-available' : 'installed';
}

/** Map installed package state onto `InstalledMarketplaceAsset`, using the catalog for update status. */
export function projectInstalled(
  installed: readonly InstalledExtension[],
  assets: ReadonlyMap<string, MarketplaceAsset>,
  context?: RuntimeCompatibilityContext,
): InstalledMarketplaceAsset[] {
  const result: InstalledMarketplaceAsset[] = [];
  for (const entry of installed) {
    const version = entry.versions[entry.currentVersion];
    const asset = assets.get(entry.packageId);
    const latestCompatible = asset ? latestCompatibleVersion(asset, entry.currentVersion, context) : undefined;
    const updateStatus = updateStatusOf(asset, entry.currentVersion, latestCompatible);
    result.push({
      assetId: asset?.id ?? entry.packageId,
      packageName: entry.packageId,
      installedVersion: entry.currentVersion,
      latestCompatibleVersion: latestCompatible,
      state: projectState(entry),
      enabled: version?.state === 'active',
      updateStatus,
      installedAt: version?.installedAt ?? '',
    });
  }
  return result.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

/** Newest catalog version above `currentVersion` that is compatible with the runtime. */
export function latestCompatibleVersion(
  asset: MarketplaceAsset,
  currentVersion: string,
  context?: RuntimeCompatibilityContext,
): string | undefined {
  const newer = asset.versions.filter((summary) => compareSemver(summary.version, currentVersion) > 0);
  if (newer.length === 0) return undefined;
  const compatible = newer.filter((summary) => !context || isCompatible(summary.compatibility, context));
  if (compatible.length === 0) return undefined;
  return compatible.reduce((best, item) => (compareSemver(item.version, best.version) > 0 ? item : best)).version;
}

export function updateStatusOf(
  asset: MarketplaceAsset | undefined,
  installedVersion: string,
  latestCompatible: string | undefined,
): MarketplaceUpdateStatus {
  if (!asset) return 'unknown';
  if (!latestCompatible) {
    const anyNewer = asset.versions.some((summary) => compareSemver(summary.version, installedVersion) > 0);
    return anyNewer ? 'incompatible-update' : 'current';
  }
  return compareSemver(latestCompatible, installedVersion) > 0 ? 'update-available' : 'current';
}

/** Newer versions with an explicit compatibility flag, suitable for the Updates page/CLI. */
export function detectUpdates(
  installed: readonly InstalledExtension[],
  assets: ReadonlyMap<string, MarketplaceAsset>,
  context?: RuntimeCompatibilityContext,
): MarketplaceUpdateCandidate[] {
  const candidates: MarketplaceUpdateCandidate[] = [];
  for (const entry of installed) {
    const asset = assets.get(entry.packageId);
    if (!asset) continue;
    const newer = asset.versions.filter((summary) => compareSemver(summary.version, entry.currentVersion) > 0);
    if (newer.length === 0) continue;
    const compatible = newer.filter((summary) => !context || isCompatible(summary.compatibility, context));
    const target = compatible[0] ?? newer[0];
    candidates.push({
      packageName: entry.packageId,
      installedVersion: entry.currentVersion,
      targetVersion: target.version,
      updateType: versionBumpType(entry.currentVersion, target.version),
      compatible: compatible.length > 0,
      reason: compatible.length === 0 ? 'no compatible version above the installed one' : undefined,
    });
  }
  return candidates.sort((a, b) => a.packageName.localeCompare(b.packageName));
}
