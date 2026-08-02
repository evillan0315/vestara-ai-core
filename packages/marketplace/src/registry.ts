import type { MarketplaceAsset, MarketplaceAssetVersion } from './asset';
import type { MarketplaceCategory } from './catalog';
import type { MarketplaceRegistryScanResult } from './local-registry';
import type { MarketplaceSearchQuery, MarketplaceSearchResult } from './search';

export type MarketplaceRegistryKind = 'local' | 'public' | 'enterprise';

export interface MarketplaceRegistryHealth {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly assetCount: number;
  readonly lastScanAt?: string;
  readonly roots?: readonly string[];
  readonly error?: string;
}

/** Reference to an asset in the catalog. `packageName` may be "publisher/name". */
export interface MarketplaceAssetReference {
  readonly publisherId?: string;
  readonly packageName: string;
}

export interface MarketplaceVersionReference extends MarketplaceAssetReference {
  /** Exact version or semver range. When both are absent, the latest stable wins. */
  readonly version?: string;
}

/**
 * Abstract registry boundary. Designed for future public/enterprise registries;
 * `scan` and `listAssets` are deliberately optional/extended:
 * - local registries implement `scan` to populate their read-only index;
 * - all registries provide `listAssets` so the service can build installed/update
 *   projections without a second installation database.
 */
export interface MarketplaceRegistry {
  readonly id: string;
  readonly kind: MarketplaceRegistryKind;
  readonly displayName: string;

  /** Populate the local index (read-only scan). Public/enterprise registries omit this. */
  scan?(force?: boolean): Promise<MarketplaceRegistryScanResult>;

  listAssets(): Promise<readonly MarketplaceAsset[]>;
  search(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult>;
  getAsset(reference: MarketplaceAssetReference): Promise<MarketplaceAsset | undefined>;
  getVersion(reference: MarketplaceVersionReference): Promise<MarketplaceAssetVersion | undefined>;
  listCategories(): Promise<readonly MarketplaceCategory[]>;
  getHealth(): Promise<MarketplaceRegistryHealth>;
}

/**
 * Parse a user-supplied package reference. Accepts `name`, `publisher/name`, and an
 * optional `@version` suffix (the CLI splits versions before calling this).
 */
export function parsePackageReference(reference: string): MarketplaceAssetReference {
  const trimmed = reference.trim();
  const slash = trimmed.indexOf('/');
  if (slash > 0) {
    return { publisherId: trimmed.slice(0, slash), packageName: trimmed.slice(slash + 1) };
  }
  return { packageName: trimmed };
}

export function formatReference(reference: MarketplaceAssetReference): string {
  return reference.publisherId ? `${reference.publisherId}/${reference.packageName}` : reference.packageName;
}

/** Catalog events. Follow the `marketplace.*` naming convention used by extension-runtime. */
export interface MarketplaceEvent {
  readonly type: `marketplace.${string}`;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly packageName?: string;
  readonly version?: string;
  readonly workspaceId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface MarketplaceEventSink {
  publish(event: MarketplaceEvent): void | Promise<void>;
}

export interface MarketplaceRegistryStatus {
  readonly id: string;
  readonly kind: MarketplaceRegistryKind;
  readonly displayName: string;
  readonly health: MarketplaceRegistryHealth;
}
