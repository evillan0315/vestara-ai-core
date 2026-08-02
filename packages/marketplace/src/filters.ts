import type { MarketplaceAsset, MarketplacePackageType, MarketplaceVisibility } from './asset';

/** Static-field filters applied to catalog assets. Compatibility filtering uses the runtime context. */
export interface MarketplaceFilters {
  readonly types?: readonly MarketplacePackageType[];
  readonly publisherIds?: readonly string[];
  readonly tags?: readonly string[];
  readonly visibility?: readonly MarketplaceVisibility[];
  readonly verification?: 'signed' | 'checksum-verified';
}

export function applyFilters(
  assets: readonly MarketplaceAsset[],
  filters: MarketplaceFilters | undefined,
): MarketplaceAsset[] {
  if (!filters) return [...assets];
  return assets.filter((asset) => {
    if (filters.types?.length && !filters.types.includes(asset.type)) return false;
    if (filters.publisherIds?.length && !filters.publisherIds.includes(asset.publisherId)) return false;
    if (filters.tags?.length && !filters.tags.some((tag) => asset.tags.includes(tag))) return false;
    if (filters.visibility?.length && !filters.visibility.includes(asset.visibility)) return false;
    if (filters.verification === 'signed' && !asset.verification.signed) return false;
    if (filters.verification === 'checksum-verified' && !asset.verification.checksumVerified) return false;
    return true;
  });
}
