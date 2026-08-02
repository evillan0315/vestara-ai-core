/**
 * @vestara/marketplace — Vestara Marketplace (Engineering Exchange)
 *
 * Catalog, discovery, search, resolution, update projections, and install
 * orchestration. Installation mechanics are delegated to `@vestara/extension-runtime`
 * (`LocalExtensionManager`), which remains the authority for integrity verification,
 * permissions, activation, rollback, and Engineering Graph recording.
 *
 * Architecture Traceability:
 *   Plan: docs/marketplace/MARKETPLACE-PLAN.md
 */

export type {
  MarketplaceAsset,
  MarketplaceAssetDependency,
  MarketplaceAssetDetails,
  MarketplaceAssetStats,
  MarketplaceAssetVersion,
  MarketplaceAssetVersionSummary,
  MarketplaceCompatibilitySummary,
  MarketplacePackageType,
  MarketplaceVerificationSummary,
  MarketplaceVisibility,
} from './asset';

export type { CatalogEntry, MarketplaceCategory } from './catalog';
export { assetKey, key, MarketplaceCatalog } from './catalog';

export type { CompatibilityStatus, RuntimeCompatibilityContext } from './compatibility';
export {
  checkCompatibility,
  compatibilityLabel,
  compatibilityStatusOf,
  isCompatible,
  platformToOperatingSystem,
} from './compatibility';

export type {
  MarketplaceErrorCode,
  VersionConflict,
} from './errors';
export {
  errorMessage,
  MARKETPLACE_ERROR_CODES,
  MarketplaceApprovalRequiredError,
  MarketplaceCompatibilityError,
  MarketplaceError,
  MarketplaceInstallError,
  MarketplaceNotFoundError,
  MarketplaceRegistryError,
  MarketplaceResolutionError,
} from './errors';

export type { MarketplaceFilters } from './filters';
export { applyFilters } from './filters';

export type {
  MarketplaceRegistryScanResult,
  MarketplaceScanIssue,
} from './local-registry';
export { LocalMarketplaceRegistry } from './local-registry';

export type {
  MarketplaceAssetReference,
  MarketplaceEvent,
  MarketplaceEventSink,
  MarketplaceRegistry,
  MarketplaceRegistryHealth,
  MarketplaceRegistryKind,
  MarketplaceRegistryStatus,
  MarketplaceVersionReference,
} from './registry';
export { formatReference, parsePackageReference } from './registry';
export type { ResolutionOptions, ResolutionPlan, ResolutionRequest, ResolvedPackage } from './resolver';
export { latestCatalogVersionFor, resolveInstall } from './resolver';
export type {
  MarketplaceSearchHit,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
  MarketplaceSort,
  MarketplaceSortDirection,
} from './search';
export { searchAssets, withRegistryId } from './search';
export type {
  MarketplaceInstallRequest,
  MarketplaceOperation,
  MarketplaceOperationType,
  MarketplacePermissionSummary,
  MarketplaceServiceOptions,
  MarketplaceUninstallRequest,
  MarketplaceUpdateRequest,
  MarketplaceVerifyRequest,
} from './service';
export { MarketplaceService } from './service';
export type {
  InstalledMarketplaceAsset,
  MarketplaceInstallState,
  MarketplaceUpdateCandidate,
  MarketplaceUpdateStatus,
  MarketplaceUpdateType,
} from './updates';
export { detectUpdates, latestCompatibleVersion, projectInstalled, updateStatusOf } from './updates';

export type { ParsedSemver } from './versions';
export {
  compareSemver,
  isSemver,
  isStable,
  latestStableVersion,
  latestVersion,
  parseSemver,
  selectVersion,
  sortVersionsDesc,
  versionBumpType,
} from './versions';
