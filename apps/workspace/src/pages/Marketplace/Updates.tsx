/**
 * VES-DESIGN-004A: Updates — Package Update Surface
 *
 * Migrated to reusable Marketplace composition.
 * Preserves grouped update display (compatible/breaking/incompatible).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MarketplaceUpdateCandidate } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  MarketplaceEmptyState,
  MarketplaceErrorState,
  MarketplacePage,
  MarketplaceSection,
} from './MarketplaceLayout-components.js';

function groupLabel(update: MarketplaceUpdateCandidate): 'compatible' | 'breaking' | 'incompatible' {
  if (!update.compatible) return 'incompatible';
  return update.updateType === 'major' ? 'breaking' : 'compatible';
}

const GROUPS: Array<{ id: 'compatible' | 'breaking' | 'incompatible'; label: string }> = [
  { id: 'compatible', label: 'Compatible' },
  { id: 'breaking', label: 'Breaking' },
  { id: 'incompatible', label: 'Incompatible' },
];

export default function Updates() {
  const [updates, setUpdates] = useState<MarketplaceUpdateCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUpdates(await marketplaceClient.updates());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load updates');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyUpdate = async (packageName: string) => {
    setBusy(true);
    setError(null);
    try {
      const operation = await marketplaceClient.update({ packageName, approved: true });
      if (operation.status === 'failed') setError(operation.error?.message ?? 'Update failed');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MarketplacePage
      title="Updates"
      description="Review and apply available package updates."
    >
      {error && <MarketplaceErrorState message={error} />}

      {updates.length === 0 && !error ? (
        <MarketplaceEmptyState message="All installed packages are up to date." />
      ) : (
        GROUPS.map((group) => {
          const members = updates.filter((update) => groupLabel(update) === group.id);
          if (members.length === 0) return null;
          return (
            <MarketplaceSection key={group.id} title={`${group.label} (${members.length})`}>
              <div className="space-y-2">
                {members.map((update) => (
                  <div
                    key={update.packageName}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/marketplace/assets/vestara/${encodeURIComponent(update.packageName)}`}
                          className="font-medium text-zinc-100 hover:text-sky-300"
                        >
                          {update.packageName}
                        </Link>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                            update.updateType === 'major'
                              ? 'text-amber-300 border-amber-700'
                              : 'text-sky-300 border-sky-800'
                          }`}
                        >
                          {update.updateType}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                        {update.installedVersion} → <span className="text-zinc-200">{update.targetVersion}</span>
                      </div>
                      {update.reason && (
                        <div className="mt-1 text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                          {update.reason}
                        </div>
                      )}
                    </div>
                    {group.id !== 'incompatible' && (
                      <button
                        type="button"
                        onClick={() => void applyUpdate(update.packageName)}
                        className="rounded-md border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-3 py-2 text-sm hover:border-[var(--vestara-accent-border)]"
                        disabled={busy}
                      >
                        Update
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </MarketplaceSection>
          );
        })
      )}
    </MarketplacePage>
  );
}
