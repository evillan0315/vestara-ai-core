import type { MarketplaceAsset, MarketplacePackageType } from './asset';

export interface CatalogEntry {
  readonly asset: MarketplaceAsset;
  readonly registryId: string;
}

export interface MarketplaceCategory {
  readonly name: string;
  readonly assetCount: number;
}

export function assetKey(asset: Pick<MarketplaceAsset, 'publisherId' | 'packageName'>): string {
  return key(asset.publisherId, asset.packageName);
}

export function key(publisherId: string | undefined, packageName: string): string {
  return publisherId ? `${publisherId}/${packageName}` : packageName;
}

/**
 * In-memory aggregated asset catalog. Keys are `${publisherId}/${packageName}`
 * (falling back to the bare package name when no publisher id exists), which keeps
 * the catalog deterministic across registries.
 */
export class MarketplaceCatalog {
  private readonly entries = new Map<string, CatalogEntry>();

  upsert(asset: MarketplaceAsset, registryId: string): void {
    this.entries.set(assetKey(asset), { asset, registryId });
  }

  remove(packageName: string, publisherId?: string): boolean {
    return this.entries.delete(key(publisherId, packageName));
  }

  get(packageName: string, publisherId?: string): CatalogEntry | undefined {
    return this.entries.get(key(publisherId, packageName));
  }

  has(packageName: string, publisherId?: string): boolean {
    return this.entries.has(key(publisherId, packageName));
  }

  list(): readonly CatalogEntry[] {
    return [...this.entries.values()];
  }

  /** All assets, deterministically ordered by package name. */
  assets(): readonly MarketplaceAsset[] {
    return [...this.entries.values()]
      .map((entry) => entry.asset)
      .sort((a, b) => a.packageName.localeCompare(b.packageName));
  }

  count(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  categories(): MarketplaceCategory[] {
    const counts = new Map<MarketplacePackageType, number>();
    for (const asset of this.assets()) counts.set(asset.type, (counts.get(asset.type) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, assetCount]) => ({ name, assetCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  publishers(): readonly string[] {
    return [...new Set(this.assets().map((asset) => asset.publisherId))].sort();
  }
}
