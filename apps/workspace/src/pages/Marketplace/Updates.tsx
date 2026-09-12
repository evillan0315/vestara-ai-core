/**
 * Marketplace Premium Gallery (v7.14) — Updates.
 *
 * Premium update groups with accent-colored borders per severity.
 * Preserves grouped update display (compatible/breaking/incompatible).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button } from '@vestara/ui';
import type { MarketplaceUpdateCandidate } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  InsightBanner,
  MarketplaceEmptyState,
  MarketplacePage,
  UpdateGroup,
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
      {error && <InsightBanner severity="error" description={error} />}

      {updates.length === 0 && !error ? (
        <MarketplaceEmptyState message="All installed packages are up to date." />
      ) : (
        GROUPS.map((group) => {
          const members = updates.filter((update) => groupLabel(update) === group.id);
          if (members.length === 0) return null;
          return (
            <UpdateGroup key={group.id} id={group.id} label={group.label} count={members.length}>
              <div className="space-y-2">
                {members.map((update) => (
                  <div
                    key={update.packageName}
                    className="mpg-card flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="relative z-[2] min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/marketplace/assets/vestara/${encodeURIComponent(update.packageName)}`}
                          className="font-medium text-zinc-100 hover:text-sky-300"
                        >
                          {update.packageName}
                        </Link>
                        <Badge variant={update.updateType === 'major' ? 'warning' : 'info'} size="md">
                          {update.updateType}
                        </Badge>
                      </div>
                      <div className="mt-1 font-mono text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                        {update.installedVersion} → <span className="text-zinc-200">{update.targetVersion}</span>
                      </div>
                      {update.reason && (
                        <div className="mt-1 text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                          {update.reason}
                        </div>
                      )}
                    </div>
                    {group.id !== 'incompatible' && (
                      <div className="relative z-[2]">
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => void applyUpdate(update.packageName)}
                          disabled={busy}
                        >
                          Update
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </UpdateGroup>
          );
        })
      )}
    </MarketplacePage>
  );
}
