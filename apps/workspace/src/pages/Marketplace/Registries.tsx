/**
 * VES-DESIGN-004A: Registries — Registry Health Surface
 *
 * Migrated to reusable Marketplace composition.
 * Preserves registry health display, rescan, and error reporting.
 */

import { useCallback, useEffect, useState } from 'react';
import type { MarketplaceOperationDto, MarketplaceRegistryStatus } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  MarketplaceEmptyState,
  MarketplaceErrorState,
  MarketplacePage,
  MarketplaceStatPill,
  MarketplaceToolbar,
} from './MarketplaceLayout-components.js';

function healthStyles(status: string): string {
  if (status === 'healthy') return 'text-emerald-300';
  if (status === 'degraded') return 'text-amber-300';
  return 'text-red-300';
}

function kindLabel(kind: string): string {
  if (kind === 'local') return 'Local';
  if (kind === 'public') return 'Public';
  if (kind === 'enterprise') return 'Enterprise';
  return kind;
}

export default function Registries() {
  const [registries, setRegistries] = useState<MarketplaceRegistryStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<MarketplaceOperationDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRegistries(await marketplaceClient.registries());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load registries');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rescan = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const operation = await marketplaceClient.rescan();
      setNotice(operation);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Rescan failed');
    } finally {
      setBusy(false);
    }
  };

  const totalAssets = registries.reduce((sum, registry) => sum + registry.health.assetCount, 0);

  return (
    <MarketplacePage
      title="Registries"
      description="Monitor registry health and manage package sources."
      stats={
        <div className="flex flex-wrap gap-3">
          <MarketplaceStatPill label="Registries" value={registries.length} />
          <MarketplaceStatPill label="Assets Indexed" value={totalAssets} color="text-emerald-400" />
        </div>
      }
      toolbar={
        <MarketplaceToolbar
          searchValue=""
          onSearchChange={() => {}}
          actions={
            <button
              type="button"
              onClick={() => void rescan()}
              className="rounded-md border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-3 py-2 text-sm hover:border-[var(--vestara-accent-border)]"
              disabled={busy}
            >
              {busy ? 'Scanning…' : 'Rescan registries'}
            </button>
          }
        />
      }
    >
      {notice && notice.status === 'failed' && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          Operation failed: {notice.error?.message}
        </div>
      )}
      {notice && notice.status === 'completed' && notice.type === 'rescan' && (
        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-800 px-2 py-0.5 text-xs text-emerald-300">
          Registry scan completed
        </div>
      )}
      {error && <MarketplaceErrorState message={error} />}

      {registries.length === 0 ? (
        <MarketplaceEmptyState message="No registries configured." />
      ) : (
        <div className="space-y-3">
          {registries.map((registry) => (
            <div
              key={registry.id}
              className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-zinc-100">{registry.displayName}</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-2 py-0.5 text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                      {kindLabel(registry.kind)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                    {registry.id}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${healthStyles(registry.health.status)}`}>
                    {registry.health.status}
                  </span>
                  <span className="text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                    {registry.health.assetCount} assets
                  </span>
                </div>
              </div>

              {registry.health.roots && registry.health.roots.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {registry.health.roots.map((root) => (
                    <li key={root} className="truncate font-mono text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                      {root}
                    </li>
                  ))}
                </ul>
              )}
              {registry.health.lastScanAt && (
                <div className="mt-2 text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                  Last scan: {new Date(registry.health.lastScanAt).toLocaleString()}
                </div>
              )}
              {registry.health.error && (
                <div className="mt-2 rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                  {registry.health.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </MarketplacePage>
  );
}
