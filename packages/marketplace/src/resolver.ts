import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import type { InstalledExtension } from '@vestara/extension-runtime';
import { satisfies } from '@vestara/extension-runtime';
import type { MarketplaceAssetVersion } from './asset';
import type { MarketplaceCatalog } from './catalog';
import type { RuntimeCompatibilityContext } from './compatibility';
import { compatibilityStatusOf, isCompatible } from './compatibility';
import { MarketplaceResolutionError, type VersionConflict } from './errors';
import type { MarketplaceAssetReference } from './registry';
import { compareSemver, latestStableVersion, sortVersionsDesc } from './versions';

export interface ResolvedPackage {
  readonly packageName: string;
  readonly version: string;
  readonly source: 'catalog' | 'installed';
  readonly manifest: VestaraPackageManifest;
  /** On-disk source directory for catalog packages (delegated to extension-runtime). */
  readonly packagePath?: string;
}

export interface ResolutionPlan {
  readonly target: ResolvedPackage;
  /** Deterministic install order: dependencies before dependents, ties by name. Excludes installed satisfiers. */
  readonly installOrder: readonly ResolvedPackage[];
  readonly satisfiedByInstalled: readonly ResolvedPackage[];
  readonly warnings: readonly string[];
}

export interface ResolutionRequest {
  readonly reference: MarketplaceAssetReference;
  /** Exact version or semver range. Defaults to the latest compatible stable version. */
  readonly version?: string;
}

export interface ResolutionOptions {
  readonly catalog: MarketplaceCatalog;
  readonly installed: ReadonlyMap<string, InstalledExtension>;
  readonly context: RuntimeCompatibilityContext;
  /** Materialize a concrete version (manifest + package path) from the catalog asset. */
  readonly versionProvider: (packageName: string, version: string) => Promise<MarketplaceAssetVersion | undefined>;
}

interface Requirement {
  readonly range: string;
  readonly requiredBy: string;
}

/**
 * Minimum-viable dependency/version resolver. Deliberately not an npm-equivalent
 * solver: exact versions, semver ranges, latest compatible stable selection,
 * graph traversal, cycle detection, missing-dependency errors, conflicting-version
 * errors, compatibility rejection, and a deterministic install order. Unresolved
 * conflicts are reported explicitly instead of guessing.
 */
export async function resolveInstall(request: ResolutionRequest, options: ResolutionOptions): Promise<ResolutionPlan> {
  const { catalog, installed, context, versionProvider } = options;
  const resolvedByName = new Map<string, ResolvedPackage>();
  const requirements = new Map<string, Requirement[]>();
  const warnings: string[] = [];

  const addRequirement = (packageName: string, requirement: Requirement): void => {
    const list = requirements.get(packageName) ?? [];
    list.push(requirement);
    requirements.set(packageName, list);
  };

  const visit = async (
    packageName: string,
    range: string,
    requiredBy: string,
    stack: string[],
  ): Promise<ResolvedPackage> => {
    if (stack.includes(packageName)) {
      const cycle = [...stack.slice(stack.indexOf(packageName)), packageName];
      throw new MarketplaceResolutionError(`Dependency cycle: ${cycle.join(' -> ')}`, { cycle });
    }
    addRequirement(packageName, { range, requiredBy });
    const existing = resolvedByName.get(packageName);
    if (existing) {
      if (satisfies(existing.version, range)) return existing;
      // Fall through to re-resolution; conflict handling below decides.
    }

    const installedEntry = installed.get(packageName);
    if (installedEntry) {
      const installedVersion = installedEntry.versions[installedEntry.currentVersion];
      if (installedVersion && satisfies(installedEntry.currentVersion, range)) {
        const status = compatibilityStatusOf(installedVersion.manifest, context);
        if (status === 'compatible') {
          const pkg: ResolvedPackage = {
            packageName,
            version: installedEntry.currentVersion,
            source: 'installed',
            manifest: installedVersion.manifest,
          };
          resolvedByName.set(packageName, pkg);
          return pkg;
        }
      }
    }

    const entries = catalogEntriesFor(catalog, packageName);
    if (entries.length === 0) {
      throw new MarketplaceResolutionError(`Missing dependency: ${packageName} (required by ${requiredBy}, ${range})`, {
        missingDependencies: [packageName],
      });
    }

    const versions = entries
      .flatMap((entry) => entry.asset.versions.map((summary) => ({ entry, summary })))
      .sort((a, b) => compareSemver(b.summary.version, a.summary.version));
    const matching = versions.filter(({ summary }) => satisfies(summary.version, range));
    const compatibleMatches = matching.filter(({ summary }) => isCompatible(summary.compatibility, context));
    const selected = compatibleMatches.find(({ summary }) => summary.isStable) ?? compatibleMatches[0];

    if (!selected) {
      const available = sortVersionsDesc(versions.map(({ summary }) => summary.version));
      if (matching.length === 0) {
        throw new MarketplaceResolutionError(
          `No version of ${packageName} satisfies ${range} (available: ${available.join(', ') || 'none'})`,
          { incompatible: available.length ? [] : [packageName] },
        );
      }
      throw new MarketplaceResolutionError(
        `All versions of ${packageName} satisfying ${range} are incompatible with the current runtime`,
        { incompatible: [packageName] },
      );
    }

    const picked = selected.summary.version;
    if (existing && existing.version !== picked) {
      const previous = requirements.get(packageName) ?? [];
      const previousRanges = previous.map((item) => item.range);
      const mutuallySatisfied = previousRanges.every((item) => satisfies(picked, item));
      if (mutuallySatisfied) {
        const higher = compareSemver(picked, existing.version) > 0 ? picked : existing.version;
        if (higher === picked) {
          // replace the existing resolution with the higher pick
          resolvedByName.delete(packageName);
        } else {
          return existing;
        }
      } else {
        const conflict: VersionConflict = {
          packageName,
          requiredBy: [...new Set([...previous.map((item) => item.requiredBy), requiredBy])],
          requirements: [...new Set([...previousRanges, range])],
        };
        throw new MarketplaceResolutionError(
          `Conflicting version requirements for ${packageName}: ${conflict.requirements.join(', ')}`,
          { conflictingRequirements: [conflict] },
        );
      }
    }

    const concrete = await versionProvider(packageName, picked);
    if (!concrete) {
      throw new MarketplaceResolutionError(
        `Version ${packageName}@${picked} could not be materialized from its registry`,
        { missingDependencies: [packageName] },
      );
    }

    const pkg: ResolvedPackage = {
      packageName,
      version: picked,
      source: 'catalog',
      manifest: concrete.manifest,
      packagePath: concrete.packagePath,
    };
    resolvedByName.set(packageName, pkg);

    const dependencies = [...pkg.manifest.dependencies].sort((a, b) => a.packageId.localeCompare(b.packageId));
    for (const dependency of dependencies) {
      try {
        await visit(dependency.packageId, dependency.version, packageName, [...stack, packageName]);
      } catch (error) {
        if (dependency.optional) {
          warnings.push(`Optional dependency ${dependency.packageId} could not be resolved; skipping`);
          continue;
        }
        throw error;
      }
    }
    return pkg;
  };

  const target = await visit(
    request.reference.packageName,
    request.version ?? '*',
    request.reference.publisherId
      ? `request:${request.reference.publisherId}/${request.reference.packageName}`
      : `request:${request.reference.packageName}`,
    [],
  );

  const installOrder: ResolvedPackage[] = [];
  const ordered = new Set<string>();
  const collect = (pkg: ResolvedPackage, stack: string[]): void => {
    if (ordered.has(pkg.packageName) || pkg.source !== 'catalog') return;
    if (stack.includes(pkg.packageName)) return;
    const dependencies = [...pkg.manifest.dependencies].sort((a, b) => a.packageId.localeCompare(b.packageId));
    for (const dependency of dependencies) {
      const dependencyPackage = resolvedByName.get(dependency.packageId);
      if (dependencyPackage) collect(dependencyPackage, [...stack, pkg.packageName]);
    }
    ordered.add(pkg.packageName);
    installOrder.push(pkg);
  };
  collect(target, []);

  const satisfiedByInstalled = [...resolvedByName.values()].filter((pkg) => pkg.source === 'installed');
  return { target, installOrder, satisfiedByInstalled, warnings };
}

/** Look up every catalog entry for a package name (multi-publisher aware, deterministic). */
function catalogEntriesFor(catalog: MarketplaceCatalog, packageName: string) {
  const entries = catalog.list().filter((entry) => entry.asset.packageName === packageName);
  return entries.sort((a, b) => a.asset.publisherId.localeCompare(b.asset.publisherId));
}

/** Latest catalog version satisfying the request range, used by update flows. */
export function latestCatalogVersionFor(
  catalog: MarketplaceCatalog,
  packageName: string,
  range: string | undefined,
  context: RuntimeCompatibilityContext,
): string | undefined {
  const entries = catalogEntriesFor(catalog, packageName);
  const versions = entries.flatMap((entry) => entry.asset.versions.map((summary) => summary.version));
  if (range && range !== '*' && range !== 'latest') {
    const matching = sortVersionsDesc(versions).filter((version) => satisfies(version, range));
    const compatible = matching.filter((version) =>
      entries.some((entry) =>
        entry.asset.versions.find(
          (summary) => summary.version === version && isCompatible(summary.compatibility, context),
        ),
      ),
    );
    return compatible.find((version) => !version.includes('-')) ?? compatible[0];
  }
  const compatible = versions.filter((version) =>
    entries.some((entry) =>
      entry.asset.versions.find(
        (summary) => summary.version === version && isCompatible(summary.compatibility, context),
      ),
    ),
  );
  return latestStableVersion(compatible) ?? latestStableVersion(versions);
}
