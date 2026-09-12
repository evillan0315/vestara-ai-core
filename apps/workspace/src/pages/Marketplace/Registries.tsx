/**
 * Marketplace Premium Gallery (v7.14) — Registries.
 *
 * Premium registry health cards with StatusIndicator glow, rescan,
 * and error reporting.
 */

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '@vestara/ui';
import type { MarketplaceOperationDto, MarketplaceRegistryStatus } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  InsightBanner,
  MarketplaceEmptyState,
  MarketplacePage,
  MarketplaceStatPill,
  RegistryHealthLamp,
} from './MarketplaceLayout-components.js';

function healthVariant(status: string): 'success' | 'warning' | 'error' {
  if (status === 'healthy') return 'success';
  if (status === 'degraded') return 'warning';
  return 'error';
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
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={() => void rescan()} loading={busy}>
            {busy ? 'Scanning…' : 'Rescan registries'}
          </Button>
        </div>
      }
    >
      {notice && notice.status === 'failed' && (
        <InsightBanner severity="error" description={`Operation failed: ${notice.error?.message}`} />
      )}
      {notice && notice.status === 'completed' && notice.type === 'rescan' && (
        <Badge variant="success" size="md">
          Registry scan completed
        </Badge>
      )}
      {error && <InsightBanner severity="error" description={error} />}

      {registries.length === 0 ? (
        <MarketplaceEmptyState message="No registries configured." />
      ) : (
        <div className="space-y-3">
          {registries.map((registry, i) => (
            <div
              key={registry.id}
              className="mpg-card mpg-enter p-4"
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            >
              <div className="relative z-[2] flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <RegistryHealthLamp status={registry.health.status} />
                    <span className="truncate font-medium text-zinc-100">{registry.displayName}</span>
                    <Badge variant="default" size="md">
                      {kindLabel(registry.kind)}
                    </Badge>
                  </div>
                  <div className="truncate font-mono text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                    {registry.id}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={healthVariant(registry.health.status)} size="md" dot>
                    {registry.health.status}
                  </Badge>
                  <span className="font-mono text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                    {registry.health.assetCount} assets
                  </span>
                </div>
              </div>

              {registry.health.roots && registry.health.roots.length > 0 && (
                <ul className="relative z-[2] mt-2 space-y-0.5">
                  {registry.health.roots.map((root) => (
                    <li key={root} className="truncate font-mono text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                      {root}
                    </li>
                  ))}
                </ul>
              )}
              {registry.health.lastScanAt && (
                <div className="relative z-[2] mt-2 text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                  Last scan: {new Date(registry.health.lastScanAt).toLocaleString()}
                </div>
              )}
              {registry.health.error && (
                <div className="relative z-[2] mt-2">
                  <InsightBanner severity="error" description={registry.health.error} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </MarketplacePage>
  );
}
