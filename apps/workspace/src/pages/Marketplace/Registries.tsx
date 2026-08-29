import { useCallback, useEffect, useState } from 'react';
import type { MarketplaceOperationDto, MarketplaceRegistryStatus } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import { button, chip, muted, panel } from './styles.js';

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`text-sm ${muted}`}>
          {registries.length} registry(ies) · {totalAssets} assets indexed
        </div>
        <button type="button" onClick={() => void rescan()} className={button} disabled={busy}>
          {busy ? 'Scanning…' : 'Rescan registries'}
        </button>
      </div>

      {notice && notice.status === 'failed' && (
        <div className="text-sm text-red-300">Operation failed: {notice.error?.message}</div>
      )}
      {notice && notice.status === 'completed' && notice.type === 'rescan' && (
        <div className={`${chip} text-emerald-300`}>Registry scan completed</div>
      )}
      {error && <div className="text-sm text-red-300">{error}</div>}

      {registries.length === 0 ? (
        <div className={`${panel} p-8 text-center text-sm ${muted}`}>No registries configured.</div>
      ) : (
        <div className="space-y-3">
          {registries.map((registry) => (
            <div key={registry.id} className={`${panel} p-4`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{registry.displayName}</span>
                    <span className={`${chip} ${muted}`}>{kindLabel(registry.kind)}</span>
                  </div>
                  <div className={`truncate text-xs ${muted}`}>{registry.id}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${healthStyles(registry.health.status)}`}>{registry.health.status}</span>
                  <span className={`text-xs ${muted}`}>{registry.health.assetCount} assets</span>
                </div>
              </div>

              {registry.health.roots && registry.health.roots.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {registry.health.roots.map((root) => (
                    <li key={root} className={`truncate font-mono text-xs ${muted}`}>
                      {root}
                    </li>
                  ))}
                </ul>
              )}
              {registry.health.lastScanAt && (
                <div className={`mt-2 text-xs ${muted}`}>
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
    </div>
  );
}
