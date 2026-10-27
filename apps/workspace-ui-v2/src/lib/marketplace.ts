// Live Marketplace client — API first, fixtures as offline fallback.
// Contracts: apps/api/src/routes/marketplace.ts
// (GET /api/marketplace/search → { results }, GET /api/marketplace/installed
// → { installed }). The Bearer token rides via assistantFetch (gateway
// VES-AUTH-001 authenticates every /api/*); transport failures reject so
// callers fall back to fixtures (offline-first).

import { apiBaseUrl } from './assistant-api';
import { assistantFetch } from './auth';

export interface LiveMarketplaceAsset {
  id: string;
  displayName: string;
  summary: string;
  type: string;
  version: string;
  publisher: string;
  installed: boolean;
}

export class MarketplaceApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'MarketplaceApiError';
    this.status = status;
  }
}

/** Search window — the package card shows a bounded list, not the catalog. */
export const MARKETPLACE_SEARCH_LIMIT = 25;

function normalizeAsset(raw: {
  id?: unknown;
  slug?: unknown;
  publisherId?: unknown;
  displayName?: unknown;
  summary?: unknown;
  type?: unknown;
  latestVersion?: unknown;
}): Omit<LiveMarketplaceAsset, 'installed'> | null {
  const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : '';
  if (!displayName) return null;
  const id =
    typeof raw.id === 'string' && raw.id ? raw.id : typeof raw.slug === 'string' && raw.slug ? raw.slug : displayName;
  return {
    id,
    displayName,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    type: typeof raw.type === 'string' ? raw.type : 'extension',
    version: typeof raw.latestVersion === 'string' ? raw.latestVersion : '',
    publisher: typeof raw.publisherId === 'string' ? raw.publisherId : '',
  };
}

/**
 * Search assets and overlay installed state. The installed read is
 * best-effort: when it fails the search results still render as
 * not-installed rather than failing the whole card.
 */
export async function fetchMarketplaceAssets(query = ''): Promise<LiveMarketplaceAsset[]> {
  const params = new URLSearchParams({ limit: String(MARKETPLACE_SEARCH_LIMIT) });
  if (query.trim()) params.set('q', query.trim());
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/marketplace/search?${params.toString()}`);
  } catch {
    throw new MarketplaceApiError(0, 'Marketplace API unreachable');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the fallback.
    }
    throw new MarketplaceApiError(res.status, message);
  }
  const data = (await res.json()) as { results?: { items?: unknown } };
  const items = Array.isArray(data?.results?.items) ? data.results.items : [];
  const assets = items
    .map((entry) => {
      const raw = (entry ?? {}) as { asset?: unknown };
      return normalizeAsset((raw.asset ?? {}) as Parameters<typeof normalizeAsset>[0]);
    })
    .filter((a): a is Omit<LiveMarketplaceAsset, 'installed'> => a !== null);

  let installedIds = new Set<string>();
  try {
    const installedRes = await assistantFetch(`${apiBaseUrl()}/api/marketplace/installed`);
    if (installedRes.ok) {
      const installedData = (await installedRes.json()) as {
        installed?: { assetId?: unknown; packageName?: unknown }[];
      };
      if (Array.isArray(installedData?.installed)) {
        installedIds = new Set(
          installedData.installed.flatMap((i) =>
            [i?.assetId, i?.packageName].filter((v): v is string => typeof v === 'string' && v !== ''),
          ),
        );
      }
    }
  } catch {
    // Best-effort — search results render without installed markers.
  }
  return assets.map((a) => ({ ...a, installed: installedIds.has(a.id) }));
}
