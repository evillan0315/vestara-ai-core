import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InstalledMarketplaceAsset, MarketplaceOperationDto } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import { button, buttonDanger, chip, muted, panel } from './styles.js';

function stateColor(state: string): string {
  if (state === 'active') return 'text-emerald-300';
  if (state === 'failed') return 'text-red-300';
  if (state === 'rollback-available') return 'text-orange-300';
  if (state === 'inactive') return 'text-zinc-400';
  return 'text-sky-300';
}

function updateColor(status: string): string {
  if (status === 'update-available') return 'text-amber-300';
  if (status === 'incompatible-update') return 'text-red-300';
  if (status === 'current') return 'text-emerald-300';
  return 'text-zinc-400';
}

export default function Installed() {
  const [installed, setInstalled] = useState<InstalledMarketplaceAsset[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<MarketplaceOperationDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setInstalled(await marketplaceClient.installed());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load installed packages');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, promise: Promise<MarketplaceOperationDto>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const operation = await promise;
      setNotice(operation);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button type="button" onClick={() => void load()} className={button} disabled={busy !== null}>
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void run('rescan', marketplaceClient.rescan())}
            className={button}
            disabled={busy !== null}
          >
            Rescan registries
          </button>
        </div>
        {busy && <span className={`text-sm ${muted}`}>{busy}…</span>}
      </div>
      {notice && notice.status === 'failed' && (
        <div className="text-sm text-red-300">Operation failed: {notice.error?.message}</div>
      )}
      {error && <div className="text-sm text-red-300">{error}</div>}
      {installed.length === 0 ? (
        <div className={`${panel} p-8 text-center text-sm ${muted}`}>Nothing installed yet. Install from Discover.</div>
      ) : (
        <div className={`${panel} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead
              className={`border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] text-xs uppercase ${muted}`}
            >
              <tr>
                <th className="px-4 py-2 font-medium">Package</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">State</th>
                <th className="px-4 py-2 font-medium">Updates</th>
                <th className="px-4 py-2 font-medium">Installed</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {installed.map((item) => {
                const [publisherId, packageName] = item.assetId.split('/');
                const assetPath = `/marketplace/assets/${encodeURIComponent(publisherId ?? '')}/${encodeURIComponent(packageName ?? item.packageName)}`;
                return (
                  <tr
                    key={item.packageName}
                    className="border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] last:border-b-0"
                  >
                    <td className="px-4 py-2">
                      <Link to={assetPath} className="font-medium hover:text-sky-300">
                        {item.packageName}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{item.installedVersion}</td>
                    <td className={`px-4 py-2 ${stateColor(item.state)}`}>{item.state}</td>
                    <td className={`px-4 py-2 ${updateColor(item.updateStatus)}`}>
                      {item.updateStatus === 'update-available' && item.latestCompatibleVersion
                        ? `${item.latestCompatibleVersion} available`
                        : item.updateStatus}
                    </td>
                    <td className={`px-4 py-2 text-xs ${muted}`}>{new Date(item.installedAt).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className={button}
                          disabled={busy !== null}
                          onClick={() =>
                            void run(`verify ${item.packageName}`, marketplaceClient.verify(item.packageName))
                          }
                        >
                          Verify
                        </button>
                        {item.updateStatus === 'update-available' && (
                          <button
                            type="button"
                            className={button}
                            disabled={busy !== null}
                            onClick={() =>
                              void run(
                                `update ${item.packageName}`,
                                marketplaceClient.update({ packageName: item.packageName, approved: true }),
                              )
                            }
                          >
                            Update
                          </button>
                        )}
                        <button
                          type="button"
                          className={buttonDanger}
                          disabled={busy !== null}
                          onClick={() =>
                            void run(`uninstall ${item.packageName}`, marketplaceClient.uninstall(item.packageName))
                          }
                        >
                          Uninstall
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {notice && notice.status === 'completed' && notice.type !== 'rescan' && (
        <div className={`${chip} text-emerald-300`}>
          {notice.type} completed for {notice.asset?.packageName}
        </div>
      )}
    </div>
  );
}
