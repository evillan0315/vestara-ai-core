import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import type { MarketplaceAsset, MarketplaceCompatibilitySummary, MarketplaceVerificationSummary } from './asset';

/**
 * Wire format served by a remote registry's index endpoint. The remote index
 * is a JSON document describing catalog assets without requiring the client to
 * walk the filesystem.
 */
export interface RemoteRegistryIndex {
  readonly formatVersion: 1;
  readonly generatedAt: string;
  readonly baseUrl: string;
  readonly assets: readonly RemoteRegistryIndexAsset[];
}

export interface RemoteRegistryIndexAsset {
  readonly publisherId: string;
  readonly packageName: string;
  readonly displayName: string;
  readonly summary: string;
  readonly description?: string;
  readonly type: string;
  readonly tags?: readonly string[];
  readonly license?: string;
  readonly repositoryUrl?: string;
  readonly documentationUrl?: string;
  readonly visibility?: 'public' | 'organization' | 'private' | 'local';
  /** Highest version advertised by the index. */
  readonly latestVersion: string;
  readonly versions: readonly RemoteRegistryIndexVersion[];
  /** Optional download location for a package archive at the latest version. */
  readonly downloadUrl?: string;
}

export interface RemoteRegistryIndexVersion {
  readonly version: string;
  readonly publishedAt?: string;
  readonly compatibility: MarketplaceCompatibilitySummary;
  readonly digest?: string;
  readonly signed?: boolean;
  /** Optional per-version archive download URL. */
  readonly downloadUrl?: string;
}

/** Parsed/validated shape a remote registry keeps in memory after fetching. */
export interface RemoteCatalogEntry {
  readonly asset: MarketplaceAsset;
  readonly versions: ReadonlyMap<string, RemoteRegistryIndexVersion>;
  readonly manifests: ReadonlyMap<string, VestaraPackageManifest>;
  readonly downloadUrls: ReadonlyMap<string, string>;
}

export interface RemoteVerificationSignal {
  readonly checksumVerified: boolean;
  readonly signatureValidated: boolean;
}
