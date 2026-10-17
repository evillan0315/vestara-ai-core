import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExtensionTrustLevel, VestaraPermissionScope } from '@vestara/extension-contracts';
import {
  digestPackageDirectory,
  type InstalledExtension,
  type LocalExtensionManager,
} from '@vestara/extension-runtime';
import type { MarketplaceAsset, MarketplaceAssetDetails, MarketplaceAssetVersion } from './asset';
import { MarketplaceCatalog } from './catalog';
import type { RuntimeCompatibilityContext } from './compatibility';
import { isCompatible, platformToOperatingSystem } from './compatibility';
import { type DetectionReport, DirectoryDetector, type DirectoryDetectorOptions } from './detector';
import { detectPackageInDirectory } from './detector/manifest-readers';
import { errorMessage, MarketplaceError, MarketplaceInstallError, MarketplaceNotFoundError } from './errors';
import type { MarketplaceRegistryScanResult } from './local-registry';
import type { MarketplaceRegistry, MarketplaceRegistryStatus } from './registry';
import {
  formatReference,
  type MarketplaceAssetReference,
  type MarketplaceEventSink,
  parsePackageReference,
} from './registry';
import { latestCatalogVersionFor, type ResolutionPlan, type ResolvedPackage, resolveInstall } from './resolver';
import type { MarketplaceSearchQuery, MarketplaceSearchResult } from './search';
import { assetMatchesCapability, searchAssets } from './search';
import {
  detectUpdates,
  type InstalledMarketplaceAsset,
  type MarketplaceUpdateCandidate,
  projectInstalled,
} from './updates';

export type MarketplaceOperationType = 'install' | 'update' | 'uninstall' | 'verify' | 'rescan';

export interface MarketplaceOperation {
  readonly operation: MarketplaceOperationType;
  readonly status: 'planned' | 'completed' | 'failed';
  readonly packageName?: string;
  readonly version?: string;
  readonly dryRun: boolean;
  readonly correlationId?: string;
  readonly installed?: InstalledMarketplaceAsset;
  readonly updates?: readonly MarketplaceUpdateCandidate[];
  readonly permissions?: readonly MarketplacePermissionSummary[];
  readonly resolution?: ResolutionPlan;
  readonly scanResults?: readonly MarketplaceRegistryScanResult[];
  readonly message?: string;
}

export interface MarketplacePermissionSummary {
  readonly capability: string;
  readonly scope: VestaraPermissionScope;
}

export interface MarketplaceInstallRequest {
  readonly reference: MarketplaceAssetReference | string;
  readonly version?: string;
  readonly workspaceId?: string;
  readonly enable?: boolean;
  readonly dryRun?: boolean;
  readonly trust?: ExtensionTrustLevel;
}

export interface MarketplaceUpdateRequest {
  readonly packageName: string;
  readonly version?: string;
  readonly workspaceId?: string;
  readonly enable?: boolean;
  readonly dryRun?: boolean;
  readonly trust?: ExtensionTrustLevel;
}

export interface MarketplaceUninstallRequest {
  readonly packageName: string;
  readonly workspaceId?: string;
  readonly dryRun?: boolean;
}

export interface MarketplaceVerifyRequest {
  readonly reference: MarketplaceAssetReference | string;
}

export interface MarketplaceSetEnabledRequest {
  readonly packageName: string;
  readonly enabled: boolean;
  readonly workspaceId?: string;
}

export interface MarketplaceSuggestQuery {
  /**
   * Accepted for future per-workspace scoping and event attribution.
   * Install state is currently global (`LocalExtensionManager.list()`), so
   * this does not narrow results yet.
   */
  readonly workspaceId?: string;
  readonly capabilities?: readonly string[];
  readonly types?: readonly string[];
  readonly tags?: readonly string[];
  readonly query?: string;
  readonly limit?: number;
  readonly includeInstalled?: boolean;
  /**
   * Filesystem root scanned (read-only, bounded depth) for stack signals
   * such as ecosystem tags and dependency names. Never accepted from HTTP —
   * the API layer sets this server-side from the workspace context.
   */
  readonly workspaceRoot?: string;
}

export interface MarketplaceSuggestion {
  readonly asset: MarketplaceAsset;
  readonly registryId: string;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface MarketplaceSuggestResult {
  readonly suggestions: readonly MarketplaceSuggestion[];
  readonly total: number;
  readonly registryErrors?: readonly string[];
}

export interface MarketplaceServiceOptions {
  readonly registries: readonly MarketplaceRegistry[];
  readonly manager: LocalExtensionManager;
  readonly eventSink?: MarketplaceEventSink;
  readonly vestaraVersion?: string;
  readonly nodeVersion?: string;
  readonly operatingSystem?: string;
  readonly architecture?: string;
  readonly workspaceId?: string;
  /** Default filesystem root for stack-signal scans (see `MarketplaceSuggestQuery.workspaceRoot`). */
  readonly workspaceRoot?: string;
}

/** TTL for cached workspace stack signals — scans are bounded but still filesystem I/O. */
const STACK_SIGNAL_TTL_MS = 60_000;

/** Max depth for stack-signal directory walks (root + two levels covers monorepo members). */
const STACK_SIGNAL_MAX_DEPTH = 2;

/** Directories never descended into during stack-signal scans. */
const STACK_SIGNAL_SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', '.vestara', '.cache', 'coverage']);

const STACK_SIGNAL_MANIFEST_ECOSYSTEMS: Record<string, string> = {
  'package.json': 'node',
  'Cargo.toml': 'rust',
  'pyproject.toml': 'python',
  'go.mod': 'go',
};

/**
 * Read-only stack-signal scan: collects lowercase tags from manifests found at
 * `root` and its children (bounded depth), plus ecosystem labels and
 * dependency names. Never writes manifests or touches the catalog — use
 * `DirectoryDetector` when registration is intended.
 */
export function detectWorkspaceStackTags(root: string, maxDepth: number = STACK_SIGNAL_MAX_DEPTH): string[] {
  const tags = new Set<string>();
  const visit = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    const detected = detectPackageInDirectory(dir);
    if (detected) {
      for (const tag of detected.tags) {
        if (tag.trim()) tags.add(tag.toLowerCase());
      }
      const ecosystem = STACK_SIGNAL_MANIFEST_ECOSYSTEMS[detected.manifestFile];
      if (ecosystem) tags.add(ecosystem);
      for (const name of Object.keys(detected.dependencies)) {
        if (name.trim()) tags.add(name.toLowerCase());
      }
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || STACK_SIGNAL_SKIPPED_DIRS.has(entry.name)) continue;
      visit(path.join(dir, entry.name), depth + 1);
    }
  };
  visit(root, 0);
  return [...tags].sort().slice(0, 40);
}

/**
 * Aggregates registries into a single catalog and coordinates installs through
 * `extension-runtime`. Owns catalog lookup → version resolution → compatibility →
 * dependency resolution → (policy check) → extension-runtime install → projection.
 * Never duplicates integrity verification, permissions, activation, rollback, or
 * graph recording — those remain `extension-runtime`'s authority.
 */
export class MarketplaceService {
  readonly manager: LocalExtensionManager;
  readonly catalog = new MarketplaceCatalog();
  readonly context: RuntimeCompatibilityContext;

  private readonly registries: readonly MarketplaceRegistry[];
  private readonly eventSink?: MarketplaceEventSink;
  private readonly defaultWorkspaceId?: string;
  private readonly defaultWorkspaceRoot?: string;
  private readonly registryErrors: string[] = [];
  private readonly stackSignalCache = new Map<string, { expiresAt: number; tags: readonly string[] }>();
  private scanned = false;

  constructor(options: MarketplaceServiceOptions) {
    this.registries = options.registries;
    this.manager = options.manager;
    this.eventSink = options.eventSink;
    this.defaultWorkspaceId = options.workspaceId;
    this.defaultWorkspaceRoot = options.workspaceRoot;
    this.context = {
      vestaraVersion: options.vestaraVersion ?? '1.0.0',
      nodeVersion: options.nodeVersion ?? process.versions.node.split('-')[0] ?? process.versions.node,
      operatingSystem: options.operatingSystem ?? platformToOperatingSystem(process.platform),
      architecture: options.architecture ?? process.arch,
    };
  }

  async search(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult> {
    await this.ensureScanned();
    const effectiveQuery =
      query.excludeInstalled && !query.excludePackageNames
        ? { ...query, excludePackageNames: [...this.installedMap().keys()] }
        : query;
    const hits = searchAssets(this.catalog.assets(), effectiveQuery).map((hit) => ({
      ...hit,
      registryId: this.catalog.get(hit.asset.packageName, hit.asset.publisherId)?.registryId ?? 'local',
    }));
    const offset = query.offset ?? 0;
    const limit = query.limit ?? hits.length;
    const result: MarketplaceSearchResult = {
      total: hits.length,
      offset,
      limit,
      items: hits.slice(offset, offset + limit),
      ...(this.registryErrors.length > 0 ? { registryErrors: [...this.registryErrors] } : {}),
    };
    await this.emit('marketplace.search.completed', {
      query: query.query ?? '',
      total: result.total,
      registries: this.registries.map((registry) => registry.id),
    });
    return result;
  }

  /**
   * Suggest catalog assets relevant to the current workspace.
   *
   * Catalog-only heuristic (no manifest materialization): excludes installed
   * packages by default, excludes runtime-incompatible versions, then scores
   * explicit hints (capabilities/types/tags/query) plus overlap with the
   * installed set (same type, shared tags) and verification signals. All
   * reasons are evidence-backed — verification reflects only recomputed
   * signals, never fabricated popularity.
   */
  async suggest(query: MarketplaceSuggestQuery = {}): Promise<MarketplaceSuggestResult> {
    await this.ensureScanned();
    const installedIds = new Set<string>();
    for (const item of this.manager.list()) installedIds.add(item.packageId);
    const installedAssets: MarketplaceAsset[] = [];
    for (const entry of this.catalog.list()) {
      if (installedIds.has(entry.asset.packageName)) installedAssets.push(entry.asset);
    }
    const installedTypes = new Set(installedAssets.map((asset) => asset.type.toLowerCase()));
    const installedTags = new Set<string>();
    for (const asset of installedAssets) {
      for (const tag of asset.tags) installedTags.add(tag.toLowerCase());
    }

    const wantedCapabilities = (query.capabilities ?? []).map((value) => value.trim()).filter(Boolean);
    const wantedTypes = new Set((query.types ?? []).map((value) => value.toLowerCase()).filter(Boolean));
    const wantedTags = new Set((query.tags ?? []).map((value) => value.toLowerCase()).filter(Boolean));
    const needle = query.query?.trim().toLowerCase() ?? '';
    const hasHints = wantedCapabilities.length > 0 || wantedTypes.size > 0 || wantedTags.size > 0 || needle !== '';
    const stackTags = this.stackSignalsFor(query.workspaceRoot ?? this.defaultWorkspaceRoot);

    const scored: MarketplaceSuggestion[] = [];
    for (const asset of this.catalog.assets()) {
      if (!query.includeInstalled && installedIds.has(asset.packageName)) continue;
      const latestCompatibility = asset.versions[0]?.compatibility;
      if (latestCompatibility && !isCompatible(latestCompatibility, this.context)) continue;

      const haystack =
        `${asset.displayName} ${asset.packageName} ${asset.publisherId} ${asset.summary} ${asset.description ?? ''} ${asset.type} ${asset.tags.join(' ')}`.toLowerCase();
      const assetTags = asset.tags.map((tag) => tag.toLowerCase());

      let score = 0;
      let hintScore = 0;
      const reasons: string[] = [];

      if (wantedTypes.has(asset.type.toLowerCase())) {
        score += 30;
        hintScore += 30;
        reasons.push(`matches requested type: ${asset.type}`);
      }
      for (const tag of wantedTags) {
        if (assetTags.some((candidate) => candidate.includes(tag) || tag.includes(candidate))) {
          score += 10;
          hintScore += 10;
          reasons.push(`matches requested tag: ${tag}`);
        }
      }
      for (const capability of wantedCapabilities) {
        if (assetMatchesCapability(asset, capability)) {
          score += 25;
          hintScore += 25;
          reasons.push(`matches requested capability: ${capability}`);
        }
      }
      if (needle && haystack.includes(needle)) {
        score += 8;
        hintScore += 8;
        reasons.push(`matches search: ${query.query?.trim()}`);
      }
      if (hasHints && hintScore === 0) continue;

      if (installedTypes.has(asset.type.toLowerCase())) {
        score += 15;
        reasons.push(`extends ${asset.type} already in use`);
      }
      const sharedTags = assetTags.filter((tag) => installedTags.has(tag)).slice(0, 2);
      if (sharedTags.length > 0) {
        score += Math.min(sharedTags.length * 4, 12);
        reasons.push(`shares tags: ${sharedTags.join(', ')}`);
      }
      if (stackTags.length > 0) {
        const stackMatches = assetTags.filter((tag) => stackTags.includes(tag)).slice(0, 2);
        if (stackMatches.length > 0) {
          score += Math.min(stackMatches.length * 3, 9);
          reasons.push(`matches workspace stack: ${stackMatches.join(', ')}`);
        }
      }
      if (asset.verification.checksumVerified) {
        score += 6;
        reasons.push('checksum verified');
      }
      if (asset.verification.signed) {
        score += 4;
        reasons.push('signed');
      }
      if (reasons.length === 0) reasons.push('compatible with current runtime');

      scored.push({
        asset,
        registryId: this.catalog.get(asset.packageName, asset.publisherId)?.registryId ?? 'local',
        score,
        reasons,
      });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const recency = b.asset.updatedAt.localeCompare(a.asset.updatedAt);
      if (recency !== 0) return recency;
      return a.asset.packageName.localeCompare(b.asset.packageName);
    });

    const limit = Math.min(Math.max(query.limit ?? 6, 1), 50);
    const result: MarketplaceSuggestResult = {
      suggestions: scored.slice(0, limit),
      total: scored.length,
      ...(this.registryErrors.length > 0 ? { registryErrors: [...this.registryErrors] } : {}),
    };
    await this.emit('marketplace.suggest.completed', {
      query: query.query ?? '',
      total: result.total,
      registries: this.registries.map((registry) => registry.id),
      ...(query.workspaceId || this.defaultWorkspaceId
        ? { workspaceId: query.workspaceId ?? this.defaultWorkspaceId }
        : {}),
    });
    return result;
  }

  /**
   * Cached workspace stack signals for a filesystem root. Returns an empty
   * list when no root is configured, the root is unreadable, or the scan
   * fails — suggestions degrade to install/verification signals, never error.
   */
  private stackSignalsFor(root: string | undefined): readonly string[] {
    if (!root) return [];
    const cached = this.stackSignalCache.get(root);
    if (cached && cached.expiresAt > Date.now()) return cached.tags;
    let tags: readonly string[] = [];
    try {
      if (fs.existsSync(root)) tags = detectWorkspaceStackTags(root);
    } catch {
      tags = [];
    }
    this.stackSignalCache.set(root, { expiresAt: Date.now() + STACK_SIGNAL_TTL_MS, tags });
    return tags;
  }

  async getAsset(reference: MarketplaceAssetReference | string): Promise<MarketplaceAssetDetails> {
    await this.ensureScanned();
    const normalized = normalizeReference(reference);
    const entry = this.resolveEntry(normalized);
    if (!entry) throw new MarketplaceNotFoundError(formatReference(normalized));
    const latest = await this.materializeVersion(entry.asset.packageName, entry.asset.latestVersion);
    if (!latest) throw new MarketplaceNotFoundError(formatReference(normalized));
    return {
      asset: entry.asset,
      registryId: entry.registryId,
      manifest: latest.manifest,
      integrityVerified: latest.integrityVerified,
      dependencies: latest.manifest.dependencies.map((dependency) => ({
        packageName: dependency.packageId,
        version: dependency.version,
        optional: dependency.optional,
      })),
      permissions: latest.manifest.permissions,
      capabilities: latest.manifest.capabilities,
    };
  }

  async listInstalled(_workspaceId?: string): Promise<readonly InstalledMarketplaceAsset[]> {
    await this.ensureScanned();
    return projectInstalled(this.manager.list(), this.assetsById(), this.context);
  }

  async listUpdates(_workspaceId?: string): Promise<readonly MarketplaceUpdateCandidate[]> {
    await this.ensureScanned();
    const updates = detectUpdates(this.manager.list(), this.assetsById(), this.context);
    await this.emit('marketplace.update.detected', { count: updates.length });
    return updates;
  }

  async install(request: MarketplaceInstallRequest): Promise<MarketplaceOperation> {
    return this.performInstall(request, 'install');
  }

  async update(request: MarketplaceUpdateRequest): Promise<MarketplaceOperation> {
    await this.ensureScanned();
    const installed = this.installedMap().get(request.packageName);
    if (!installed) throw new MarketplaceInstallError(request.packageName, undefined, 'package is not installed');
    const targetVersion =
      request.version ?? latestCatalogVersionFor(this.catalog, request.packageName, undefined, this.context);
    if (!targetVersion) throw new MarketplaceNotFoundError(request.packageName);
    if (targetVersion === installed.currentVersion)
      return {
        operation: 'update',
        status: 'completed',
        packageName: request.packageName,
        version: installed.currentVersion,
        dryRun: request.dryRun ?? false,
        message: 'already up to date',
      };
    return this.performInstall(
      {
        reference: { packageName: request.packageName },
        version: targetVersion,
        workspaceId: request.workspaceId ?? this.defaultWorkspaceId,
        enable: request.enable,
        dryRun: request.dryRun,
        trust: request.trust,
      },
      'update',
    );
  }

  async uninstall(request: MarketplaceUninstallRequest): Promise<MarketplaceOperation> {
    const workspaceId = request.workspaceId ?? this.defaultWorkspaceId;
    const dryRun = request.dryRun ?? false;
    if (dryRun)
      return {
        operation: 'uninstall',
        status: 'planned',
        packageName: request.packageName,
        dryRun,
        message: `would uninstall ${request.packageName}`,
      };
    try {
      await this.manager.uninstall(request.packageName, workspaceId);
    } catch (error) {
      throw new MarketplaceInstallError(request.packageName, undefined, errorMessage(error));
    }
    return {
      operation: 'uninstall',
      status: 'completed',
      packageName: request.packageName,
      dryRun,
      correlationId: identifier('uninstall'),
    };
  }

  async setEnabled(request: MarketplaceSetEnabledRequest): Promise<MarketplaceOperation> {
    await this.ensureScanned();
    const installed = this.installedMap().get(request.packageName);
    if (!installed) throw new MarketplaceInstallError(request.packageName, undefined, 'package is not installed');
    const version = installed.versions[installed.currentVersion];
    const currentState = version?.state === 'active';
    if (currentState === request.enabled) {
      return {
        operation: 'update',
        status: 'completed',
        packageName: request.packageName,
        version: installed.currentVersion,
        dryRun: false,
        message: `already ${request.enabled ? 'enabled' : 'disabled'}`,
      };
    }
    try {
      if (request.enabled) {
        await this.manager.enable(request.packageName, request.workspaceId);
      } else {
        await this.manager.disable(request.packageName, request.workspaceId);
      }
    } catch (error) {
      throw new MarketplaceInstallError(request.packageName, undefined, errorMessage(error));
    }
    const projected = (await this.listInstalled()).find((item) => item.packageName === request.packageName);
    return {
      operation: 'update',
      status: 'completed',
      packageName: request.packageName,
      version: installed.currentVersion,
      dryRun: false,
      correlationId: identifier('set-enabled'),
      installed: projected,
    };
  }

  async verify(request: MarketplaceVerifyRequest): Promise<MarketplaceOperation> {
    await this.ensureScanned();
    const normalized = normalizeReference(request.reference);
    const entry = this.resolveEntry(normalized);
    if (!entry) throw new MarketplaceNotFoundError(formatReference(normalized));
    const version = await this.materializeVersion(entry.asset.packageName, entry.asset.latestVersion);
    if (!version) throw new MarketplaceNotFoundError(formatReference(normalized));
    const digest = digestPackageDirectory(version.packagePath);
    const verified = digest === version.manifest.integrity.digest;
    return {
      operation: 'verify',
      status: 'completed',
      packageName: version.packageName,
      version: version.version,
      dryRun: false,
      correlationId: identifier('verify'),
      message: `sha256 ${digest} — ${verified ? 'verified' : 'integrity mismatch'}`,
    };
  }

  async rescan(): Promise<MarketplaceOperation> {
    this.registryErrors.length = 0;
    const scanResults: MarketplaceRegistryScanResult[] = [];
    for (const registry of this.registries) {
      if (!registry.scan) continue;
      try {
        scanResults.push(await registry.scan(true));
      } catch (error) {
        this.registryErrors.push(`registry ${registry.id}: ${errorMessage(error)}`);
      }
    }
    this.catalog.clear();
    for (const registry of this.registries) {
      try {
        for (const asset of await registry.listAssets()) this.catalog.upsert(asset, registry.id);
      } catch (error) {
        this.registryErrors.push(`registry ${registry.id}: ${errorMessage(error)}`);
      }
    }
    this.scanned = true;
    return {
      operation: 'rescan',
      status: 'completed',
      dryRun: false,
      correlationId: identifier('rescan'),
      scanResults,
    };
  }

  async registryStatuses(): Promise<readonly MarketplaceRegistryStatus[]> {
    const statuses: MarketplaceRegistryStatus[] = [];
    for (const registry of this.registries) {
      try {
        statuses.push({
          id: registry.id,
          kind: registry.kind,
          displayName: registry.displayName,
          health: await registry.getHealth(),
        });
      } catch (error) {
        statuses.push({
          id: registry.id,
          kind: registry.kind,
          displayName: registry.displayName,
          health: { status: 'unhealthy', assetCount: 0, error: errorMessage(error) },
        });
      }
    }
    return statuses;
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async performInstall(
    request: MarketplaceInstallRequest,
    operation: 'install' | 'update',
  ): Promise<MarketplaceOperation> {
    await this.ensureScanned();
    const normalized = normalizeReference(request.reference);
    const entry = this.resolveEntry(normalized);
    if (!entry) throw new MarketplaceNotFoundError(formatReference(normalized));
    const dryRun = request.dryRun ?? false;
    const workspaceId = request.workspaceId ?? this.defaultWorkspaceId;

    const plan = await resolveInstall(
      {
        reference: { publisherId: entry.asset.publisherId, packageName: entry.asset.packageName },
        version: request.version,
      },
      {
        catalog: this.catalog,
        installed: this.installedMap(),
        context: this.context,
        versionProvider: (packageName, version) => this.materializeVersion(packageName, version),
      },
    );
    const permissions = collectPermissions(plan.installOrder);
    const base: MarketplaceOperation = {
      operation,
      status: 'planned',
      packageName: entry.asset.packageName,
      version: plan.target.version,
      dryRun,
      resolution: plan,
      permissions,
    };
    if (dryRun) return base;

    if (plan.installOrder.length === 0) {
      return {
        ...base,
        status: 'completed',
        message: `already installed at ${plan.target.version} (${plan.target.source})`,
      };
    }

    try {
      const enable = request.enable ?? true;
      for (const pkg of plan.installOrder) {
        if (!pkg.packagePath)
          throw new MarketplaceInstallError(pkg.packageName, pkg.version, 'package source is not available locally');
        // Activation only applies to packages that declare a runtime entrypoint;
        // metadata-only packages (verification packs, themes, standards) are
        // registered as installed without activation.
        const shouldEnable = enable && Boolean(pkg.manifest.entrypoints.runtime);
        await this.manager.install(pkg.packagePath, { workspaceId, enable: shouldEnable, trust: request.trust });
      }
    } catch (error) {
      await this.emit('marketplace.resolution.failed', {
        packageName: entry.asset.packageName,
        reason: errorMessage(error),
      });
      if (error instanceof MarketplaceError) throw error;
      throw new MarketplaceInstallError(entry.asset.packageName, plan.target.version, errorMessage(error));
    }

    const projected = (await this.listInstalled()).find((item) => item.packageName === entry.asset.packageName);
    return {
      ...base,
      status: 'completed',
      correlationId: identifier(operation),
      installed: projected,
    };
  }

  private async materializeVersion(packageName: string, version: string): Promise<MarketplaceAssetVersion | undefined> {
    for (const registry of this.registries) {
      try {
        const result = await registry.getVersion({ packageName, version });
        if (result) return result;
      } catch (error) {
        this.registryErrors.push(`registry ${registry.id}: ${errorMessage(error)}`);
      }
    }
    return undefined;
  }

  private resolveEntry(reference: MarketplaceAssetReference) {
    const direct = this.catalog.get(reference.packageName, reference.publisherId);
    if (direct) return direct;
    if (!reference.publisherId) {
      const matches = this.catalog
        .list()
        .filter((entry) => entry.asset.packageName === reference.packageName)
        .sort((a, b) => a.asset.publisherId.localeCompare(b.asset.publisherId));
      if (matches.length > 0) return matches[0];
    }
    return undefined;
  }

  private async ensureScanned(): Promise<void> {
    if (this.scanned) return;
    this.registryErrors.length = 0;
    for (const registry of this.registries) {
      try {
        await registry.scan?.();
        for (const asset of await registry.listAssets()) this.catalog.upsert(asset, registry.id);
      } catch (error) {
        this.registryErrors.push(`registry ${registry.id}: ${errorMessage(error)}`);
      }
    }
    this.scanned = true;
  }

  /**
   * Detect packages in a directory and register them in the marketplace catalog.
   *
   * Walks the directory tree for manifest files (package.json, Cargo.toml,
   * pyproject.toml, go.mod), generates vestara-package.json for each detected
   * package, and upserts them into the catalog.
   */
  async detectAndRegister(
    directory: string,
    options: Partial<DirectoryDetectorOptions> = {},
  ): Promise<DetectionReport> {
    const detector = new DirectoryDetector({
      publisherId: options.publisherId ?? 'local',
      publisherName: options.publisherName ?? options.publisherId ?? 'Local',
      vestaraVersion: options.vestaraVersion ?? this.context.vestaraVersion,
      maxDepth: options.maxDepth,
      skipExisting: options.skipExisting,
    });
    const report = await detector.detectAndRegister(directory, this.catalog);
    await this.emit('marketplace.directory.detected', {
      directory,
      detected: report.detected,
      registered: report.registered,
    });
    return report;
  }

  private installedMap(): ReadonlyMap<string, InstalledExtension> {
    const map = new Map<string, InstalledExtension>();
    for (const item of this.manager.list()) map.set(item.packageId, item);
    return map;
  }

  private assetsById(): ReadonlyMap<string, MarketplaceAsset> {
    const map = new Map<string, MarketplaceAsset>();
    for (const entry of this.catalog.list()) map.set(entry.asset.packageName, entry.asset);
    return map;
  }

  private async emit(type: `marketplace.${string}`, metadata: Readonly<Record<string, unknown>>): Promise<void> {
    await this.eventSink?.publish({
      type,
      timestamp: new Date().toISOString(),
      correlationId: identifier('service'),
      metadata,
    });
  }
}

function normalizeReference(reference: MarketplaceAssetReference | string): MarketplaceAssetReference {
  return typeof reference === 'string' ? parsePackageReference(reference) : reference;
}

function collectPermissions(packages: readonly ResolvedPackage[]): MarketplacePermissionSummary[] {
  const seen = new Set<string>();
  const permissions: MarketplacePermissionSummary[] = [];
  for (const pkg of packages) {
    for (const permission of pkg.manifest.permissions) {
      const identity = `${permission.capability}:${permission.scope}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      permissions.push({ capability: permission.capability, scope: permission.scope });
    }
  }
  return permissions;
}

function identifier(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
