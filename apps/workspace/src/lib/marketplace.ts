/**
 * Marketplace (Engineering Exchange) Workspace client.
 *
 * Thin typed fetch wrappers over the apps/api marketplace routes. Response
 * shapes mirror `apps/api/src/routes/marketplace.ts` exactly.
 */

export interface MarketplaceCompatibility {
  vestara: string;
  node?: string;
  operatingSystems?: string[];
  architectures?: string[];
}

export interface MarketplaceAssetVersion {
  version: string;
  isStable: boolean;
  compatibility: MarketplaceCompatibility;
  checksumVerified: boolean;
}

export interface MarketplaceVerification {
  signed: boolean;
  signatureValidated: boolean;
  checksumVerified: boolean;
  runtimeVerified: boolean;
}

export interface MarketplaceAsset {
  id: string;
  slug: string;
  publisherId: string;
  packageName: string;
  displayName: string;
  summary: string;
  description?: string;
  type: string;
  tags: string[];
  visibility: string;
  latestVersion: string;
  versions: MarketplaceAssetVersion[];
  verification: MarketplaceVerification;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceAssetDependency {
  packageName: string;
  version: string;
  optional?: boolean;
}

export interface MarketplacePermission {
  capability: string;
  scope: string;
}

export interface MarketplaceContribution {
  id: string;
  entrypoint?: string;
}

export interface MarketplaceAssetDetails {
  asset: MarketplaceAsset;
  registryId: string;
  integrityVerified: boolean;
  dependencies: MarketplaceAssetDependency[];
  permissions: MarketplacePermission[];
  capabilities: string[];
  manifest: {
    contributions: Record<string, MarketplaceContribution[]>;
  } | null;
}

export interface InstalledMarketplaceAsset {
  assetId: string;
  packageName: string;
  installedVersion: string;
  latestCompatibleVersion?: string;
  state: string;
  updateStatus: string;
  installedAt: string;
}

export interface MarketplaceUpdateCandidate {
  packageName: string;
  installedVersion: string;
  targetVersion: string;
  updateType: string;
  compatible: boolean;
  reason?: string;
}

export interface MarketplaceOperationPlan {
  installOrder: Array<{ packageName: string; version: string; source: string }>;
  satisfiedByInstalled: Array<{ packageName: string; version: string }>;
  permissions: MarketplacePermission[];
  warnings: string[];
}

export type MarketplaceOperationStatus =
  | 'requested'
  | 'planning'
  | 'awaiting-permission'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface MarketplaceOperationDto {
  id: string;
  type: string;
  status: MarketplaceOperationStatus;
  asset?: { publisherId?: string; packageName: string };
  plan?: MarketplaceOperationPlan;
  installed?: InstalledMarketplaceAsset;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceRegistryStatus {
  id: string;
  kind: string;
  displayName: string;
  health: { status: string; assetCount: number; lastScanAt?: string; error?: string };
}

export interface MarketplaceSearchResult {
  total: number;
  offset: number;
  limit: number;
  items: Array<{ asset: MarketplaceAsset; registryId: string; score: number }>;
  registryErrors?: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`Marketplace API error: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function params(values: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export interface MarketplaceInstallBody {
  reference: string | { publisherId?: string; packageName: string };
  version?: string;
  workspaceId?: string;
  dryRun?: boolean;
  approved?: boolean;
}

export const marketplaceClient = {
  async search(options?: {
    q?: string;
    type?: string;
    publisher?: string;
    tag?: string;
    limit?: number;
    offset?: number;
  }): Promise<MarketplaceSearchResult> {
    const data = await request<{ results: MarketplaceSearchResult }>(
      `/api/marketplace/search${params({
        q: options?.q,
        type: options?.type,
        publisher: options?.publisher,
        tag: options?.tag,
        limit: options?.limit ?? 50,
        offset: options?.offset,
      })}`,
    );
    return data.results;
  },

  async listAssets(options?: { q?: string; type?: string }): Promise<MarketplaceAsset[]> {
    const data = await request<{ assets: MarketplaceAsset[] }>(
      `/api/marketplace/assets${params({ q: options?.q, type: options?.type })}`,
    );
    return data.assets;
  },

  async asset(publisherId: string, packageName: string): Promise<MarketplaceAssetDetails> {
    const data = await request<{ asset: MarketplaceAssetDetails }>(
      `/api/marketplace/assets/${encodeURIComponent(publisherId)}/${encodeURIComponent(packageName)}`,
    );
    return data.asset;
  },

  async versions(publisherId: string, packageName: string): Promise<MarketplaceAssetVersion[]> {
    const data = await request<{ versions: MarketplaceAssetVersion[] }>(
      `/api/marketplace/assets/${encodeURIComponent(publisherId)}/${encodeURIComponent(packageName)}/versions`,
    );
    return data.versions;
  },

  async categories(): Promise<Array<{ name: string; assetCount: number }>> {
    const data = await request<{ categories: Array<{ name: string; assetCount: number }> }>(
      '/api/marketplace/categories',
    );
    return data.categories;
  },

  async registries(): Promise<MarketplaceRegistryStatus[]> {
    const data = await request<{ registries: MarketplaceRegistryStatus[] }>('/api/marketplace/registries');
    return data.registries;
  },

  async installed(): Promise<InstalledMarketplaceAsset[]> {
    const data = await request<{ installed: InstalledMarketplaceAsset[] }>('/api/marketplace/installed');
    return data.installed;
  },

  async updates(): Promise<MarketplaceUpdateCandidate[]> {
    const data = await request<{ updates: MarketplaceUpdateCandidate[] }>('/api/marketplace/updates');
    return data.updates;
  },

  async install(body: MarketplaceInstallBody): Promise<MarketplaceOperationDto> {
    const data = await request<{ operation: MarketplaceOperationDto }>('/api/marketplace/install', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return data.operation;
  },

  async update(body: {
    packageName: string;
    version?: string;
    dryRun?: boolean;
    approved?: boolean;
  }): Promise<MarketplaceOperationDto> {
    const data = await request<{ operation: MarketplaceOperationDto }>('/api/marketplace/update', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return data.operation;
  },

  async uninstall(packageName: string): Promise<MarketplaceOperationDto> {
    const data = await request<{ operation: MarketplaceOperationDto }>('/api/marketplace/uninstall', {
      method: 'POST',
      body: JSON.stringify({ packageName }),
    });
    return data.operation;
  },

  async verify(reference: string): Promise<MarketplaceOperationDto> {
    const data = await request<{ operation: MarketplaceOperationDto }>('/api/marketplace/verify', {
      method: 'POST',
      body: JSON.stringify({ reference }),
    });
    return data.operation;
  },

  async rescan(): Promise<MarketplaceOperationDto> {
    const data = await request<{ operation: MarketplaceOperationDto }>('/api/marketplace/rescan', { method: 'POST' });
    return data.operation;
  },
};
