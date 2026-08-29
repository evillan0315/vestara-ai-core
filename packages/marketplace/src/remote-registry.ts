import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import { satisfies } from '@vestara/extension-runtime';
import type { MarketplaceAsset, MarketplaceAssetVersion, MarketplaceAssetVersionSummary } from './asset';
import type { MarketplaceCategory } from './catalog';
import { errorMessage, MarketplaceRegistryError } from './errors';
import type {
  MarketplaceAssetReference,
  MarketplaceEventSink,
  MarketplaceRegistry,
  MarketplaceRegistryHealth,
  MarketplaceVersionReference,
} from './registry';
import type { MarketplaceSearchQuery, MarketplaceSearchResult } from './search';
import { searchAssets, withRegistryId } from './search';
import { compareSemver, isStable, latestStableVersion, selectVersion } from './versions';

export interface RemoteMarketplaceRegistryOptions {
  readonly id: string;
  readonly displayName: string;
  /** Base URL of the registry (index is fetched from `${baseUrl}/index.json`). */
  readonly baseUrl: string;
  readonly eventSink?: MarketplaceEventSink;
  readonly fetchImpl?: typeof fetch;
  /** When provided, remote versions are materialized locally (install support). */
  readonly archiveFetcher?: RemotePackageArchiveFetcher;
  /** Optional cache directory for materialized archives. */
  readonly cacheDir?: string;
}

export interface RemotePackageArchiveFetcher {
  /**
   * Materialize a package archive into a local directory. Returns the absolute
   * path to the extracted package directory. The registry passes the digest to
   * the fetcher so the host can verify integrity before extracting.
   */
  materialize(input: {
    packageName: string;
    version: string;
    downloadUrl: string;
    digest?: string;
    targetDir: string;
  }): Promise<string>;
}

const DEFAULT_INDEX_PATH = 'index.json';

/**
 * Read-only remote registry. Fetches a registry index (JSON) describing
 * catalog assets, caches it in memory, and serves discovery/search/health
 * against the cached copy. `getVersion` returns a manifest-backed version only
 * when an `archiveFetcher` is configured (so installs can materialize a local
 * copy); without one the registry is catalog-only.
 */
export class RemoteMarketplaceRegistry implements MarketplaceRegistry {
  readonly kind = 'public' as const;
  readonly id: string;
  readonly displayName: string;

  private readonly baseUrl: string;
  private readonly eventSink?: MarketplaceEventSink;
  private readonly fetchImpl: typeof fetch;
  private readonly archiveFetcher?: RemotePackageArchiveFetcher;
  private readonly cacheDir?: string;

  private cached: RemoteRegistryCache | null = null;
  private lastFetchAt?: string;

  constructor(options: RemoteMarketplaceRegistryOptions) {
    this.id = options.id;
    this.displayName = options.displayName;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.eventSink = options.eventSink;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.archiveFetcher = options.archiveFetcher;
    this.cacheDir = options.cacheDir;
  }

  async scan(): Promise<never> {
    throw new MarketplaceRegistryError(
      this.id,
      'Remote registries are fetched, not scanned. Use refresh() to reload the index.',
    );
  }

  async refresh(force = false): Promise<number> {
    if (!force && this.cached) return this.cached.assets.length;
    const url = `${this.baseUrl}/${DEFAULT_INDEX_PATH}`;
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new MarketplaceRegistryError(this.id, `index fetch failed (${response.status}) for ${url}`);
    }
    const json = (await response.json()) as Record<string, unknown>;
    const cache = buildRemoteCache(this.id, json);
    this.cached = cache;
    this.lastFetchAt = new Date().toISOString();
    await this.emit('marketplace.registry.scanned', {
      registryId: this.id,
      assetsFound: cache.assets.length,
      url,
    });
    return cache.assets.length;
  }

  async listAssets(): Promise<readonly MarketplaceAsset[]> {
    await this.ensureLoaded();
    return (this.cached as RemoteRegistryCache).assets;
  }

  async search(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult> {
    await this.ensureLoaded();
    const assets = (this.cached as RemoteRegistryCache).assets;
    const hits = withRegistryId(searchAssets(assets, query), this.id);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? hits.length;
    return { total: hits.length, offset, limit, items: hits.slice(offset, offset + limit) };
  }

  async getAsset(reference: MarketplaceAssetReference): Promise<MarketplaceAsset | undefined> {
    await this.ensureLoaded();
    const cache = this.cached as RemoteRegistryCache;
    if (reference.publisherId) return cache.byKey.get(assetKey(reference.publisherId, reference.packageName));
    const matches = cache.assets.filter((asset) => asset.packageName === reference.packageName);
    return matches.sort((a, b) => a.publisherId.localeCompare(b.publisherId))[0];
  }

  async getVersion(reference: MarketplaceVersionReference): Promise<MarketplaceAssetVersion | undefined> {
    await this.ensureLoaded();
    const cache = this.cached as RemoteRegistryCache;
    const asset = await this.getAsset(reference);
    if (!asset) return undefined;
    const versions = asset.versions.map((summary) => summary.version);
    const selected = selectVersion(versions, reference.version, satisfies);
    if (!selected) return undefined;
    const manifest = cache.manifests.get(versionKey(asset.packageName, selected));
    if (!manifest) return undefined;

    // Materialize a local copy for install only when an archive fetcher exists.
    if (this.archiveFetcher) {
      const remoteVersion = cache.versionsByKey.get(versionKey(asset.packageName, selected));
      const downloadUrl =
        remoteVersion?.downloadUrl ??
        `${this.baseUrl}/packages/${asset.publisherId}/${asset.packageName}/${selected}.tgz`;
      const packagePath = await this.materialize(asset.packageName, selected, downloadUrl);
      if (packagePath) {
        return {
          assetId: asset.id,
          publisherId: asset.publisherId,
          packageName: asset.packageName,
          version: selected,
          manifest,
          packagePath,
          integrityVerified: this.integrityVerified(asset.packageName, selected, cache),
        };
      }
    }

    return {
      assetId: asset.id,
      publisherId: asset.publisherId,
      packageName: asset.packageName,
      version: selected,
      manifest,
      packagePath: '',
      integrityVerified: this.integrityVerified(asset.packageName, selected, cache),
    };
  }

  async listCategories(): Promise<readonly MarketplaceCategory[]> {
    await this.ensureLoaded();
    const counts = new Map<string, number>();
    for (const asset of (this.cached as RemoteRegistryCache).assets)
      counts.set(asset.type, (counts.get(asset.type) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, assetCount]) => ({ name, assetCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getHealth(): Promise<MarketplaceRegistryHealth> {
    try {
      const count = await this.refresh(false);
      return { status: 'healthy', assetCount: count, lastScanAt: this.lastFetchAt, roots: [this.baseUrl] };
    } catch (error) {
      return {
        status: 'unhealthy',
        assetCount: this.cached?.assets.length ?? 0,
        error: errorMessage(error),
        lastScanAt: this.lastFetchAt,
      };
    }
  }

  private async materialize(packageName: string, version: string, downloadUrl: string): Promise<string | undefined> {
    if (!this.archiveFetcher || !this.cacheDir) return undefined;
    try {
      const cache = this.cached as RemoteRegistryCache;
      const targetDir = joinCachePath(this.cacheDir, this.id, packageName, version);
      const digest = cache.versionsByKey.get(versionKey(packageName, version))?.digest;
      return await this.archiveFetcher.materialize({
        packageName,
        version,
        downloadUrl,
        digest,
        targetDir,
      });
    } catch (error) {
      await this.emit('marketplace.registry.failed', {
        packageName,
        version,
        reason: errorMessage(error),
      });
      return undefined;
    }
  }

  private integrityVerified(packageName: string, version: string, cache: RemoteRegistryCache): boolean {
    const remote = cache.versionsByKey.get(versionKey(packageName, version));
    return remote?.digest !== undefined;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.cached) await this.refresh();
  }

  private async emit(type: `marketplace.${string}`, metadata: Readonly<Record<string, unknown>>): Promise<void> {
    await this.eventSink?.publish({
      type,
      timestamp: new Date().toISOString(),
      correlationId: identifier('remote'),
      metadata: { registryId: this.id, ...metadata },
    });
  }
}

interface RemoteRegistryCache {
  readonly assets: readonly MarketplaceAsset[];
  readonly byKey: ReadonlyMap<string, MarketplaceAsset>;
  readonly manifests: ReadonlyMap<string, VestaraPackageManifest>;
  readonly versionsByKey: ReadonlyMap<string, { version: string; digest?: string; downloadUrl?: string }>;
}

function buildRemoteCache(registryId: string, json: Record<string, unknown>): RemoteRegistryCache {
  if (json.formatVersion !== 1 || !Array.isArray(json.assets)) {
    throw new MarketplaceRegistryError(registryId, 'index is not a valid format v1 document');
  }
  const assets: MarketplaceAsset[] = [];
  const byKey = new Map<string, MarketplaceAsset>();
  const manifests = new Map<string, VestaraPackageManifest>();
  const versionsByKey = new Map<string, { version: string; digest?: string; downloadUrl?: string }>();

  for (const raw of json.assets as RemoteIndexAssetLike[]) {
    if (!raw.packageName || !Array.isArray(raw.versions) || raw.versions.length === 0) continue;
    const publisherId = raw.publisherId ?? 'unknown';
    const packageName = raw.packageName;
    const key = assetKey(publisherId, packageName);

    const richVersions = raw.versions
      .map((v) => ({
        version: String(v.version ?? ''),
        isStable: isStable(String(v.version ?? '')),
        publishedAt: typeof v.publishedAt === 'string' ? v.publishedAt : undefined,
        compatibility: v.compatibility ?? { vestara: '*' },
        checksumVerified: typeof v.digest === 'string' && v.digest.length > 0,
        digest: typeof v.digest === 'string' ? v.digest : undefined,
        downloadUrl: typeof v.downloadUrl === 'string' ? v.downloadUrl : undefined,
      }))
      .filter((v) => v.version.length > 0)
      .sort((a, b) => compareSemver(b.version, a.version));

    if (richVersions.length === 0) continue;
    const summaries: MarketplaceAssetVersionSummary[] = richVersions.map((v) => ({
      version: v.version,
      isStable: v.isStable,
      publishedAt: v.publishedAt,
      compatibility: { vestara: v.compatibility.vestara ?? '*', node: v.compatibility.node },
      checksumVerified: v.checksumVerified,
    }));
    const latestVersion = latestStableVersion(richVersions.map((v) => v.version)) ?? richVersions[0].version;
    const latestSummary = richVersions.find((v) => v.version === latestVersion);
    const now = new Date().toISOString();

    for (const v of richVersions) {
      versionsByKey.set(versionKey(packageName, v.version), {
        version: v.version,
        digest: v.digest,
        downloadUrl: v.downloadUrl,
      });
      if (v.digest) {
        manifests.set(versionKey(packageName, v.version), {
          schemaVersion: 1,
          id: packageName,
          name: raw.displayName ?? packageName,
          version: v.version,
          description: raw.summary ?? '',
          type: (raw.type as never) ?? 'plugin',
          publisher: { id: publisherId, name: publisherId },
          compatibility: { vestara: v.compatibility?.vestara ?? '*' },
          entrypoints: {},
          capabilities: [],
          permissions: [],
          dependencies: [],
          contributions: {},
          isolation: 'in-process',
          integrity: { algorithm: 'sha256', digest: v.digest },
        });
      }
    }

    const asset: MarketplaceAsset = {
      id: key,
      slug: packageName,
      publisherId,
      packageName,
      displayName: raw.displayName ?? packageName,
      summary: raw.summary ?? '',
      description: raw.description,
      type: (raw.type as never) ?? 'plugin',
      tags: raw.tags ?? [],
      license: raw.license,
      repositoryUrl: raw.repositoryUrl,
      documentationUrl: raw.documentationUrl,
      visibility: raw.visibility ?? 'public',
      latestVersion,
      versions: summaries,
      verification: {
        signed: richVersions.some((v) => v.digest !== undefined),
        signatureValidated: false,
        checksumVerified: latestSummary?.checksumVerified ?? false,
        runtimeVerified: false,
      },
      createdAt: now,
      updatedAt: now,
    };
    assets.push(asset);
    byKey.set(key, asset);
  }

  return { assets, byKey, manifests, versionsByKey };
}

type RemoteIndexAssetLike = {
  publisherId?: string;
  packageName?: string;
  displayName?: string;
  summary?: string;
  description?: string;
  type?: string;
  tags?: readonly string[];
  license?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
  visibility?: 'public' | 'organization' | 'private' | 'local';
  latestVersion?: string;
  versions?: Array<{
    version?: unknown;
    publishedAt?: unknown;
    compatibility?: { vestara?: string; node?: string };
    digest?: unknown;
    signed?: unknown;
    downloadUrl?: unknown;
  }>;
};

function assetKey(publisherId: string, packageName: string): string {
  return `${publisherId}/${packageName}`;
}

function versionKey(packageName: string, version: string): string {
  return `${packageName}@${version}`;
}

function joinCachePath(cacheDir: string, registryId: string, packageName: string, version: string): string {
  return `${cacheDir.replace(/\/+$/, '')}/${registryId}/${packageName}/${version}`;
}

function identifier(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
