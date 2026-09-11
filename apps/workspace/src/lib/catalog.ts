/**
 * Capability Catalog API client.
 * Read-only — no mutation operations.
 */

export interface CapabilityCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly parkingState: 'active' | 'parked' | 'experimental' | 'unknown';
  readonly requirement: string;
  readonly activation: string;
  readonly packages: readonly string[];
  readonly dependencies: readonly string[];
  readonly health: 'verified' | 'pass' | 'fail' | 'degraded' | 'unknown';
  readonly documentation?: readonly string[];
  readonly evidence?: readonly string[];
}

export interface CapabilityCatalog {
  readonly profileId: string;
  readonly capabilities: readonly CapabilityCatalogEntry[];
  readonly summary: {
    readonly total: number;
    readonly active: number;
    readonly parked: number;
    readonly experimental: number;
    readonly unknown: number;
  };
}

const BASE = '/api/catalog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catalog request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const catalogClient = {
  async catalog(profile?: string): Promise<CapabilityCatalog> {
    const params = profile ? `?profile=${encodeURIComponent(profile)}` : '';
    return fetchJson<CapabilityCatalog>(`${BASE}${params}`);
  },

  async capability(id: string): Promise<CapabilityCatalogEntry> {
    return fetchJson<CapabilityCatalogEntry>(`${BASE}/${encodeURIComponent(id)}`);
  },

  async search(q: string): Promise<{ results: readonly CapabilityCatalogEntry[]; count: number }> {
    return fetchJson(`${BASE}/search?q=${encodeURIComponent(q)}`);
  },

  async parked(): Promise<{ capabilities: readonly CapabilityCatalogEntry[]; count: number }> {
    return fetchJson(`${BASE}/parked`);
  },
};
