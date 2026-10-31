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
  /** Installed-only; false (or meaningless) while not installed. */
  enabled: boolean;
}

export interface InstalledMarketplaceEntry {
  assetId?: unknown;
  packageName?: unknown;
  enabled?: unknown;
}

export type MarketplaceOperationState = 'completed' | 'planning' | 'awaiting-permission' | 'failed';

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
}): Omit<LiveMarketplaceAsset, 'installed' | 'enabled'> | null {
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
    .filter((a): a is Omit<LiveMarketplaceAsset, 'installed' | 'enabled'> => a !== null);

  // Best-effort overlay: installed ids plus their enabled flags. When the
  // installed read fails the search results render as not-installed.
  const installedById = new Map<string, boolean>();
  try {
    const installedRes = await assistantFetch(`${apiBaseUrl()}/api/marketplace/installed`);
    if (installedRes.ok) {
      const installedData = (await installedRes.json()) as { installed?: InstalledMarketplaceEntry[] };
      if (Array.isArray(installedData?.installed)) {
        for (const entry of installedData.installed) {
          const ids = [entry?.assetId, entry?.packageName].filter(
            (v): v is string => typeof v === 'string' && v !== '',
          );
          for (const id of ids) {
            if (!installedById.has(id)) installedById.set(id, entry?.enabled !== false);
          }
        }
      }
    }
  } catch {
    // Best-effort — search results render without installed markers.
  }
  return assets.map((a) => ({
    ...a,
    installed: installedById.has(a.id),
    enabled: installedById.get(a.id) ?? false,
  }));
}

interface MarketplaceOperationBody {
  status?: unknown;
  installed?: { enabled?: unknown } | null;
  error?: { code?: unknown; message?: unknown } | null;
}

function operationState(body: MarketplaceOperationBody): MarketplaceOperationState {
  return body.status === 'completed' ||
    body.status === 'planning' ||
    body.status === 'awaiting-permission' ||
    body.status === 'failed'
    ? body.status
    : 'failed';
}

function operationError(body: MarketplaceOperationBody, fallback: string): string {
  const message = typeof body.error?.message === 'string' ? body.error.message : '';
  return message || fallback;
}

async function postMarketplaceOperation(
  path: string,
  body: unknown,
  action: string,
): Promise<{ status: MarketplaceOperationState; enabled: boolean }> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
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
  const data = (await res.json()) as { operation?: MarketplaceOperationBody };
  const status = operationState(data?.operation ?? {});
  if (status === 'failed' || status === 'planning') {
    throw new MarketplaceApiError(res.status, operationError(data?.operation ?? {}, `${action} failed`));
  }
  return { status, enabled: data?.operation?.installed?.enabled !== false };
}

/**
 * Install an asset by catalog id (sent as packageName reference, v1
 * `marketplaceClient.install` parity). The explicit click counts as
 * approval, so one round trip completes permissionless installs.
 */
export async function installMarketplaceAsset(packageName: string): Promise<{ enabled: boolean }> {
  const { status, enabled } = await postMarketplaceOperation(
    '/api/marketplace/install',
    { reference: { packageName }, approved: true },
    'Install',
  );
  if (status === 'awaiting-permission') {
    throw new MarketplaceApiError(200, 'Install needs permission approval in the API console');
  }
  return { enabled };
}

/** Uninstall an installed asset by catalog id. */
export async function uninstallMarketplaceAsset(packageName: string): Promise<void> {
  await postMarketplaceOperation('/api/marketplace/uninstall', { packageName }, 'Uninstall');
}

/** Enable or disable an installed asset (PATCH /installed/:id, v1 parity). */
export async function setMarketplaceAssetEnabled(packageName: string, enabled: boolean): Promise<void> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/marketplace/installed/${encodeURIComponent(packageName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
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
}
