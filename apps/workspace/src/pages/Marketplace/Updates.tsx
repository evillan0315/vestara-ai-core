import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MarketplaceUpdateCandidate } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import { button, chip, muted, panel } from './styles.js';

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

  if (updates.length === 0 && !error) {
    return <div className={`${panel} p-8 text-center text-sm ${muted}`}>All installed packages are up to date.</div>;
  }

  return (
    <div className="space-y-6">
      {error && <div className="text-sm text-red-300">{error}</div>}
      {GROUPS.map((group) => {
        const members = updates.filter((update) => groupLabel(update) === group.id);
        if (members.length === 0) return null;
        return (
          <section key={group.id}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
              {group.label} ({members.length})
            </h2>
            <div className="space-y-2">
              {members.map((update) => (
                <div
                  key={update.packageName}
                  className={`${panel} flex flex-wrap items-center justify-between gap-3 p-4`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/marketplace/assets/vestara/${encodeURIComponent(update.packageName)}`}
                        className="font-medium hover:text-sky-300"
                      >
                        {update.packageName}
                      </Link>
                      <span className={`${chip} ${update.updateType === 'major' ? 'text-amber-300' : 'text-sky-300'}`}>
                        {update.updateType}
                      </span>
                    </div>
                    <div className={`mt-1 text-sm ${muted}`}>
                      {update.installedVersion} → <span className="text-zinc-200">{update.targetVersion}</span>
                    </div>
                    {update.reason && <div className={`mt-1 text-xs ${muted}`}>{update.reason}</div>}
                  </div>
                  {group.id !== 'incompatible' && (
                    <button
                      type="button"
                      onClick={() => void applyUpdate(update.packageName)}
                      className={button}
                      disabled={busy}
                    >
                      Update
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
