import type {
  VestaraPackageManifest,
  VestaraPackageType,
  VestaraPermissionRequest,
} from '@vestara/extension-contracts';

/**
 * Runtime compatibility declared by a published asset version.
 * Mirrors `VestaraPackageManifest.compatibility`; kept separate so the
 * catalog model does not depend on the full manifest shape.
 */
export interface MarketplaceCompatibilitySummary {
  readonly vestara: string;
  readonly node?: string;
  readonly operatingSystems?: readonly string[];
  readonly architectures?: readonly string[];
}

/** Per-version publication metadata. Manifests are read on demand, not stored here. */
export interface MarketplaceAssetVersionSummary {
  readonly version: string;
  readonly isStable: boolean;
  readonly publishedAt?: string;
  readonly compatibility: MarketplaceCompatibilitySummary;
  readonly checksumVerified: boolean;
}

/**
 * Independent verification signals. The local registry never fabricates them:
 * `signed` reflects only whether the manifest declares a signature (unvalidated),
 * `checksumVerified` reflects a recomputed content digest. `runtimeVerified` is
 * always false because discovery never executes package code.
 */
export interface MarketplaceVerificationSummary {
  readonly signed: boolean;
  readonly signatureValidated: boolean;
  readonly checksumVerified: boolean;
  readonly runtimeVerified: boolean;
}

/** Optional commercial/social statistics. Never fabricated by the local registry. */
export interface MarketplaceAssetStats {
  readonly downloads?: number;
  readonly rating?: number;
  readonly reviews?: number;
}

/**
 * A published asset in the catalog. The authoritative package definition remains
 * `VestaraPackageManifest`; this adds marketplace publication metadata around it.
 */
export interface MarketplaceAsset {
  readonly id: string;
  readonly slug: string;
  readonly publisherId: string;
  readonly packageName: string;
  readonly displayName: string;
  readonly summary: string;
  readonly description?: string;
  readonly type: VestaraPackageManifest['type'];
  readonly tags: readonly string[];
  readonly license?: string;
  readonly repositoryUrl?: string;
  readonly documentationUrl?: string;
  readonly visibility: 'public' | 'organization' | 'private' | 'local';
  readonly latestVersion: string;
  readonly versions: readonly MarketplaceAssetVersionSummary[];
  readonly verification: MarketplaceVerificationSummary;
  readonly stats?: MarketplaceAssetStats;
  /** Registry-observed timestamps (first discovery / last change), not publisher data. */
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A concrete, on-disk package version. Constructed on demand so full manifests are
 * never retained in the catalog.
 */
export interface MarketplaceAssetVersion {
  readonly assetId: string;
  readonly publisherId: string;
  readonly packageName: string;
  readonly version: string;
  readonly manifest: VestaraPackageManifest;
  /** Absolute path to the package directory (contains `vestara-package.json`). */
  readonly packagePath: string;
  readonly integrityVerified: boolean;
}

/** A dependency edge for detail views. */
export interface MarketplaceAssetDependency {
  readonly packageName: string;
  readonly version: string;
  readonly optional?: boolean;
}

/** Full asset details: catalog summary + the latest manifest + dependency/permission view. */
export interface MarketplaceAssetDetails {
  readonly asset: MarketplaceAsset;
  readonly registryId: string;
  readonly manifest: VestaraPackageManifest;
  readonly integrityVerified: boolean;
  readonly dependencies: readonly MarketplaceAssetDependency[];
  readonly permissions: readonly VestaraPermissionRequest[];
  readonly capabilities: readonly string[];
}

export type MarketplaceVisibility = MarketplaceAsset['visibility'];
export type MarketplacePackageType = VestaraPackageType;
