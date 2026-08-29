import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import { digestPackageDirectory, readManifest, satisfies, VESTARA_PACKAGE_MANIFEST } from '@vestara/extension-runtime';
import type { MarketplaceAsset, MarketplaceAssetVersion, MarketplaceAssetVersionSummary } from './asset';
import type { MarketplaceCategory } from './catalog';
import { key } from './catalog';
import { errorMessage } from './errors';
import type {
  MarketplaceAssetReference,
  MarketplaceEventSink,
  MarketplaceRegistry,
  MarketplaceRegistryHealth,
  MarketplaceVersionReference,
} from './registry';
import type { MarketplaceSearchQuery, MarketplaceSearchResult } from './search';
import { searchAssets, withRegistryId } from './search';
import { verifyManifest } from './signature';
import { compareSemver, isStable, latestVersion, selectVersion } from './versions';

export interface MarketplaceScanIssue {
  readonly packageName: string;
  readonly path: string;
  readonly reason: string;
}

export interface MarketplaceRegistryScanResult {
  readonly registryId: string;
  readonly scannedAt: string;
  readonly rootsScanned: readonly string[];
  readonly assetsFound: number;
  readonly packagesFound: number;
  readonly malformed: readonly MarketplaceScanIssue[];
  readonly conflicts: readonly MarketplaceScanIssue[];
  readonly errors: readonly MarketplaceScanIssue[];
  readonly skipped: readonly MarketplaceScanIssue[];
}

export interface LocalMarketplaceRegistryOptions {
  readonly id: string;
  readonly displayName: string;
  readonly roots: readonly string[];
  readonly eventSink?: MarketplaceEventSink;
  readonly maxManifestBytes?: number;
  readonly maxDepth?: number;
  readonly maxPackagesPerScan?: number;
  readonly maxFingerprintEntries?: number;
  /** Look up a publisher's public key to validate manifest signatures. Absent → signatures are not validated. */
  readonly publicKeyProvider?: (publisherId: string) => string | undefined;
}

const DEFAULT_MAX_MANIFEST_BYTES = 256 * 1024;
const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_PACKAGES_PER_SCAN = 5000;
const DEFAULT_MAX_FINGERPRINT_ENTRIES = 4000;

interface ScanIssues {
  readonly malformed: MarketplaceScanIssue[];
  readonly conflicts: MarketplaceScanIssue[];
  readonly errors: MarketplaceScanIssue[];
  readonly skipped: MarketplaceScanIssue[];
}

/**
 * Read-only local directory registry. Discovers packages from approved roots,
 * validates manifests strictly, verifies content digests, detects duplicates and
 * version conflicts, and indexes them as catalog assets. Never loads or executes
 * package code, never mutates sources, and isolates malformed packages.
 */
export class LocalMarketplaceRegistry implements MarketplaceRegistry {
  readonly kind = 'local' as const;
  readonly id: string;
  readonly displayName: string;

  private readonly roots: readonly string[];
  private readonly eventSink?: MarketplaceEventSink;
  private readonly maxManifestBytes: number;
  private readonly maxDepth: number;
  private readonly maxPackagesPerScan: number;
  private readonly maxFingerprintEntries: number;
  private readonly publicKeyProvider?: (publisherId: string) => string | undefined;

  private readonly assets = new Map<string, MarketplaceAsset>();
  private readonly versionPaths = new Map<string, string>();
  private readonly checksums = new Map<string, boolean>();
  private readonly createdAt = new Map<string, string>();
  private readonly fingerprintCache = new Map<string, string>();
  private lastScanAt?: string;
  private scanned = false;

  constructor(options: LocalMarketplaceRegistryOptions) {
    this.id = options.id;
    this.displayName = options.displayName;
    this.roots = options.roots.map((root) => path.resolve(root));
    this.eventSink = options.eventSink;
    this.maxManifestBytes = options.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES;
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.maxPackagesPerScan = options.maxPackagesPerScan ?? DEFAULT_MAX_PACKAGES_PER_SCAN;
    this.maxFingerprintEntries = options.maxFingerprintEntries ?? DEFAULT_MAX_FINGERPRINT_ENTRIES;
    this.publicKeyProvider = options.publicKeyProvider;
  }

  async scan(force = false): Promise<MarketplaceRegistryScanResult> {
    if (force) this.fingerprintCache.clear();
    const issues: ScanIssues = { malformed: [], conflicts: [], errors: [], skipped: [] };
    const seen = new Set<string>();
    const seenVersions = new Map<string, string>();
    const rootsScanned: string[] = [];
    let packagesScanned = 0;

    const overLimit = (): boolean => packagesScanned >= this.maxPackagesPerScan;

    for (const root of this.roots) {
      if (!fs.existsSync(root)) continue;
      rootsScanned.push(root);
      try {
        this.walkRoot(root, 0, { seen, seenVersions, issues, overLimit }, () => {
          packagesScanned += 1;
        });
      } catch (error) {
        issues.errors.push({ packageName: '<root>', path: root, reason: errorMessage(error) });
        await this.emit('marketplace.registry.failed', { root, reason: errorMessage(error) });
      }
    }

    for (const [assetKey, asset] of this.assets) {
      if (seen.has(assetKey)) continue;
      this.assets.delete(assetKey);
      for (const summary of asset.versions) this.versionPaths.delete(versionKey(asset.packageName, summary.version));
      await this.emit('marketplace.asset.removed', { packageName: asset.packageName, registryId: this.id });
    }

    this.lastScanAt = new Date().toISOString();
    this.scanned = true;
    const result: MarketplaceRegistryScanResult = {
      registryId: this.id,
      scannedAt: this.lastScanAt,
      rootsScanned,
      assetsFound: this.assets.size,
      packagesFound: seenVersions.size,
      malformed: issues.malformed,
      conflicts: issues.conflicts,
      errors: issues.errors,
      skipped: issues.skipped,
    };
    await this.emit('marketplace.registry.scanned', {
      registryId: this.id,
      assetsFound: result.assetsFound,
      packagesFound: result.packagesFound,
      malformed: result.malformed.length,
      conflicts: result.conflicts.length,
      errors: result.errors.length,
      roots: rootsScanned,
    });
    return result;
  }

  async listAssets(): Promise<readonly MarketplaceAsset[]> {
    if (!this.scanned) await this.scan();
    return [...this.assets.values()];
  }

  async search(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult> {
    if (!this.scanned) await this.scan();
    const assets = [...this.assets.values()];
    const hits = searchAssets(assets, query);
    const items = withRegistryId(hits, this.id);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? hits.length;
    return { total: hits.length, offset, limit, items: items.slice(offset, offset + limit) };
  }

  async getAsset(reference: MarketplaceAssetReference): Promise<MarketplaceAsset | undefined> {
    if (!this.scanned) await this.scan();
    if (reference.publisherId) return this.assets.get(key(reference.publisherId, reference.packageName));
    const matches = [...this.assets.values()].filter((asset) => asset.packageName === reference.packageName);
    if (matches.length === 1) return matches[0];
    // Ambiguous (same name from multiple publishers): deterministic choice, first by publisher id.
    return matches.sort((a, b) => a.publisherId.localeCompare(b.publisherId))[0];
  }

  async getVersion(reference: MarketplaceVersionReference): Promise<MarketplaceAssetVersion | undefined> {
    if (!this.scanned) await this.scan();
    const asset = await this.getAsset(reference);
    if (!asset) return undefined;
    const versions = asset.versions.map((summary) => summary.version);
    const selected = selectVersion(versions, reference.version, satisfies);
    if (!selected) return undefined;
    const packagePath = this.versionPaths.get(versionKey(asset.packageName, selected));
    if (!packagePath) return undefined;
    let manifest: VestaraPackageManifest;
    try {
      manifest = readManifest(packagePath);
    } catch {
      return undefined;
    }
    const summary = asset.versions.find((item) => item.version === selected);
    return {
      assetId: asset.id,
      publisherId: asset.publisherId,
      packageName: asset.packageName,
      version: selected,
      manifest,
      packagePath,
      integrityVerified: summary?.checksumVerified ?? false,
    };
  }

  async listCategories(): Promise<readonly MarketplaceCategory[]> {
    if (!this.scanned) await this.scan();
    const counts = new Map<string, number>();
    for (const asset of this.assets.values()) counts.set(asset.type, (counts.get(asset.type) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, assetCount]) => ({ name, assetCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getHealth(): Promise<MarketplaceRegistryHealth> {
    if (!this.scanned) await this.scan();
    const status: MarketplaceRegistryHealth['status'] = this.lastScanAt === undefined ? 'degraded' : 'healthy';
    return {
      status,
      assetCount: this.assets.size,
      lastScanAt: this.lastScanAt,
      roots: this.roots,
    };
  }

  // ─── Scanning ──────────────────────────────────────────────────────────────

  private walkRoot(
    directory: string,
    depth: number,
    state: {
      readonly seen: Set<string>;
      readonly seenVersions: Map<string, string>;
      readonly issues: ScanIssues;
      readonly overLimit: () => boolean;
    },
    onPackage: () => void,
  ): void {
    if (state.overLimit()) {
      state.issues.skipped.push({ packageName: '<scan>', path: directory, reason: 'per-scan package limit reached' });
      return;
    }
    if (this.hasManifest(directory)) {
      this.indexPackage(directory, state, onPackage);
      return; // a package directory is not scanned for nested packages
    }
    if (depth >= this.maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      state.issues.errors.push({ packageName: '<directory>', path: directory, reason: errorMessage(error) });
      return;
    }
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) {
        state.issues.skipped.push({
          packageName: '<symlink>',
          path: path.join(directory, entry.name),
          reason: 'symlink entry skipped',
        });
        continue;
      }
      if (!entry.isDirectory()) continue;
      this.walkRoot(path.join(directory, entry.name), depth + 1, state, onPackage);
    }
  }

  private indexPackage(
    directory: string,
    state: {
      readonly seen: Set<string>;
      readonly seenVersions: Map<string, string>;
      readonly issues: ScanIssues;
    },
    onPackage: () => void,
  ): void {
    const manifestPath = path.join(directory, VESTARA_PACKAGE_MANIFEST);
    try {
      if (fs.statSync(manifestPath).size > this.maxManifestBytes) {
        state.issues.malformed.push({
          packageName: path.basename(directory),
          path: directory,
          reason: `manifest exceeds size bound (${this.maxManifestBytes} bytes)`,
        });
        return;
      }
    } catch (error) {
      state.issues.malformed.push({
        packageName: path.basename(directory),
        path: directory,
        reason: errorMessage(error),
      });
      return;
    }

    let manifest: VestaraPackageManifest;
    try {
      manifest = readManifest(directory);
    } catch (error) {
      state.issues.malformed.push({
        packageName: path.basename(directory),
        path: directory,
        reason: errorMessage(error),
      });
      return;
    }

    const packageName = manifest.id;
    const vk = versionKey(packageName, manifest.version);
    const existingPath = state.seenVersions.get(vk);
    if (existingPath) {
      if (existingPath !== directory) {
        state.issues.conflicts.push({
          packageName,
          path: directory,
          reason: `duplicate version ${vk} already indexed at ${existingPath}`,
        });
      }
      return;
    }
    if (this.versionPaths.has(vk) && this.versionPaths.get(vk) !== directory) {
      state.issues.conflicts.push({
        packageName,
        path: directory,
        reason: `version ${vk} already indexed from ${this.versionPaths.get(vk)}`,
      });
      return;
    }
    state.seenVersions.set(vk, directory);
    onPackage();

    let checksumVerified: boolean;
    const fingerprint = directoryFingerprint(directory, this.maxFingerprintEntries);
    const cachedChecksum = this.checksums.get(vk);
    const fingerprintReused = cachedChecksum !== undefined && this.fingerprintCache.get(vk) === fingerprint;
    if (fingerprintReused) {
      checksumVerified = cachedChecksum;
    } else {
      try {
        const digest = digestPackageDirectory(directory);
        checksumVerified = digest === manifest.integrity.digest;
        this.checksums.set(vk, checksumVerified);
        this.fingerprintCache.set(vk, fingerprint);
      } catch (error) {
        this.checksums.delete(vk);
        this.fingerprintCache.delete(vk);
        state.issues.malformed.push({ packageName, path: directory, reason: errorMessage(error) });
        return;
      }
    }
    this.versionPaths.set(vk, directory);

    const summary: MarketplaceAssetVersionSummary = {
      version: manifest.version,
      isStable: isStable(manifest.version),
      compatibility: {
        vestara: manifest.compatibility.vestara,
        node: manifest.compatibility.node,
        operatingSystems: manifest.compatibility.operatingSystems,
        architectures: manifest.compatibility.architectures,
      },
      checksumVerified,
    };

    const assetKey = key(manifest.publisher.id, manifest.id);
    const previous = this.assets.get(assetKey);
    const now = new Date().toISOString();
    const created = this.createdAt.get(assetKey) ?? now;
    this.createdAt.set(assetKey, created);

    const versions = mergeVersionSummaries(previous?.versions ?? [], summary);
    const changed = previous === undefined || !fingerprintReused || !sameVersionList(previous.versions, versions);
    const latest = latestVersion(versions.map((item) => item.version));
    const latestSummary = versions.find((item) => item.version === latest);

    const signatureValidated = this.validateSignature(manifest);
    const asset: MarketplaceAsset = {
      id: `${manifest.publisher.id}/${manifest.id}`,
      slug: manifest.id,
      publisherId: manifest.publisher.id,
      packageName: manifest.id,
      displayName: manifest.name,
      summary: manifest.description,
      description: manifest.description,
      type: manifest.type,
      // The manifest has no tags/license/repository fields; the local registry does
      // not fabricate them. Future remote registries will supply them.
      tags: [],
      visibility: 'local',
      latestVersion: latestSummary?.version ?? manifest.version,
      versions,
      verification: {
        signed: Boolean(manifest.integrity.signature),
        signatureValidated,
        checksumVerified: latestSummary?.checksumVerified ?? false,
        runtimeVerified: false,
      },
      createdAt: created,
      updatedAt: changed ? now : (previous?.updatedAt ?? now),
    };
    const isNew = previous === undefined;
    this.assets.set(assetKey, asset);
    state.seen.add(assetKey);
    if (isNew)
      void this.emit('marketplace.asset.discovered', { packageName, version: manifest.version, registryId: this.id });
    else if (changed)
      void this.emit('marketplace.asset.updated', { packageName, version: manifest.version, registryId: this.id });
  }

  private hasManifest(directory: string): boolean {
    return fs.existsSync(path.join(directory, VESTARA_PACKAGE_MANIFEST));
  }

  private validateSignature(manifest: VestaraPackageManifest): boolean {
    if (!this.publicKeyProvider) return false;
    const publicKey = this.publicKeyProvider(manifest.publisher.id);
    if (!publicKey) return false;
    return verifyManifest(manifest, publicKey).valid;
  }

  private async emit(type: `marketplace.${string}`, metadata: Readonly<Record<string, unknown>>): Promise<void> {
    await this.eventSink?.publish({
      type,
      timestamp: new Date().toISOString(),
      correlationId: identifier('registry'),
      metadata,
    });
  }
}

function versionKey(packageName: string, version: string): string {
  return `${packageName}@${version}`;
}

function sameVersionList(
  left: readonly MarketplaceAssetVersionSummary[],
  right: readonly MarketplaceAssetVersionSummary[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index].version !== right[index].version || left[index].checksumVerified !== right[index].checksumVerified)
      return false;
  }
  return true;
}

function mergeVersionSummaries(
  existing: readonly MarketplaceAssetVersionSummary[],
  next: MarketplaceAssetVersionSummary,
): MarketplaceAssetVersionSummary[] {
  const map = new Map(existing.map((item) => [item.version, item]));
  map.set(next.version, next);
  return [...map.values()].sort((a, b) => compareSemver(b.version, a.version));
}

function directoryFingerprint(root: string, maxEntries: number): string {
  const parts: string[] = [];
  const visit = (directory: string, relative: string): void => {
    if (parts.length >= maxEntries) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      parts.push(`${relative}:<error>`);
      return;
    }
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (parts.length >= maxEntries) return;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        parts.push(`${child}:link`);
        continue;
      }
      if (entry.isDirectory()) {
        visit(path.join(directory, entry.name), child);
        continue;
      }
      if (!entry.isFile()) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(path.join(directory, entry.name));
      } catch {
        parts.push(`${child}:<error>`);
        continue;
      }
      parts.push(`${child}:${stat.size}:${stat.mtimeMs}`);
    }
  };
  visit(root, '');
  return parts.join('|');
}

function identifier(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
