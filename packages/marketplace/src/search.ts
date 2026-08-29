import type { MarketplaceAsset } from './asset';
import type { RuntimeCompatibilityContext } from './compatibility';
import { isCompatible } from './compatibility';
import type { MarketplaceFilters } from './filters';
import { applyFilters } from './filters';

export type MarketplaceSort = 'relevance' | 'name' | 'updated' | 'version';
export type MarketplaceSortDirection = 'asc' | 'desc';

export interface MarketplaceSearchQuery {
  readonly query?: string;
  readonly filters?: MarketplaceFilters;
  /** When provided, assets incompatible with this runtime are excluded. */
  readonly compatibleWith?: RuntimeCompatibilityContext;
  readonly limit?: number;
  readonly offset?: number;
  readonly sort?: MarketplaceSort;
  readonly sortDirection?: MarketplaceSortDirection;
}

export interface MarketplaceSearchHit {
  readonly asset: MarketplaceAsset;
  readonly score: number;
  readonly registryId: string;
  readonly matchedFields: readonly string[];
}

export interface MarketplaceSearchResult {
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly items: readonly MarketplaceSearchHit[];
  /** Non-fatal registry errors encountered while searching (provenance preserved). */
  readonly registryErrors?: readonly string[];
}

interface ScoredHit {
  readonly asset: MarketplaceAsset;
  readonly score: number;
  readonly matchedFields: string[];
}

const TEXT_FIELDS = ['displayName', 'summary', 'description', 'tags', 'publisherId', 'type', 'packageName'] as const;

function scoreAsset(asset: MarketplaceAsset, query: string): ScoredHit {
  const needle = query.trim().toLowerCase();
  if (!needle) return { asset, score: 0, matchedFields: [] };
  let score = 0;
  const matched: string[] = [];
  for (const field of TEXT_FIELDS) {
    const value = field === 'tags' ? asset.tags.join(' ') : (asset[field] ?? '');
    const haystack = String(value).toLowerCase();
    if (!haystack) continue;
    if (field === 'displayName' || field === 'packageName') {
      if (haystack === needle) score += 100;
      else if (haystack.startsWith(needle)) score += 80;
      else if (haystack.includes(needle)) score += 50;
      else continue;
    } else if (field === 'summary') {
      if (haystack.startsWith(needle)) score += 40;
      else if (haystack.includes(needle)) score += 30;
      else continue;
    } else if (field === 'tags') {
      if (asset.tags.some((tag) => tag.toLowerCase().includes(needle))) score += 25;
      else continue;
    } else {
      if (haystack.includes(needle)) score += field === 'publisherId' ? 20 : field === 'type' ? 12 : 8;
      else continue;
    }
    matched.push(field);
  }
  return { asset, score, matchedFields: matched };
}

/**
 * Score and rank assets for a query. Deterministic: equal scores are ordered by
 * package name. When no query is given, results are ordered by `sort`.
 * Returns all ranked hits; callers apply `offset`/`limit` and compute `total`.
 */
export function searchAssets(
  assets: readonly MarketplaceAsset[],
  query: MarketplaceSearchQuery,
): MarketplaceSearchHit[] {
  const filtered = applyFilters(assets, query.filters).filter(
    (asset) => !query.compatibleWith || isCompatible(asset.versions[0]?.compatibility, query.compatibleWith),
  );
  const needle = query.query?.trim() ?? '';
  const scored = filtered.map((asset) => scoreAsset(asset, needle));
  const ranked = needle ? scored.filter((hit) => hit.score > 0) : scored;
  const sort = query.sort ?? 'relevance';
  const direction = query.sortDirection ?? 'desc';
  ranked.sort((a, b) => {
    let compared = 0;
    if (sort === 'name') compared = a.asset.packageName.localeCompare(b.asset.packageName);
    else if (sort === 'updated') compared = a.asset.updatedAt.localeCompare(b.asset.updatedAt);
    else if (sort === 'version') compared = a.asset.latestVersion.localeCompare(b.asset.latestVersion);
    else if (needle) compared = a.score - b.score;
    else compared = a.asset.packageName.localeCompare(b.asset.packageName);
    if (compared === 0) compared = a.asset.packageName.localeCompare(b.asset.packageName);
    return direction === 'asc' ? compared : -compared;
  });
  return ranked.map((hit) => ({
    asset: hit.asset,
    score: hit.score,
    registryId: '',
    matchedFields: hit.matchedFields,
  }));
}

/** Helper for registries to stamp provenance onto scored hits. */
export function withRegistryId(hits: readonly MarketplaceSearchHit[], registryId: string): MarketplaceSearchHit[] {
  return hits.map((hit) => ({ ...hit, registryId }));
}
