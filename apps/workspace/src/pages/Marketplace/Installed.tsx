/**
 * Marketplace Premium Gallery (v7.14) — Installed.
 *
 * Premium Table management surface with confirmation on destructive
 * actions. Preserves all existing domain behavior: verify, update,
 * uninstall, enable/disable.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Table } from '@vestara/ui';
import type { InstalledMarketplaceAsset, MarketplaceOperationDto } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  ConfirmButton,
  InsightBanner,
  MarketplaceEmptyState,
  MarketplacePage,
} from './MarketplaceLayout-components.js';

function stateBadgeVariant(state: string): 'success' | 'error' | 'warning' | 'default' | 'info' {
  if (state === 'active') return 'success';
  if (state === 'failed') return 'error';
  if (state === 'rollback-available') return 'warning';
  if (state === 'inactive') return 'default';
  return 'info';
}

function updateBadgeVariant(status: string): 'success' | 'error' | 'warning' | 'default' | 'info' {
  if (status === 'update-available') return 'warning';
  if (status === 'incompatible-update') return 'error';
  if (status === 'current') return 'success';
  return 'default';
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
    <MarketplacePage
      title="Installed"
      description="Manage installed packages — verify, update, enable, or remove."
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="md" disabled={busy !== null} onClick={() => void load()}>
            Refresh
          </Button>
          <Button variant="secondary" size="md" disabled={busy !== null} onClick={() => void run('rescan', marketplaceClient.rescan())}>
            Rescan registries
          </Button>
          {busy && <span className="text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">{busy}…</span>}
        </div>
      }
    >
      {notice && notice.status === 'failed' && (
        <InsightBanner severity="error" description={`Operation failed: ${notice.error?.message}`} />
      )}
      {error && <InsightBanner severity="error" description={error} />}

      {installed.length === 0 ? (
        <MarketplaceEmptyState message="Nothing installed yet. Install from Discover." />
      ) : (
        <div className="mpg-card mpg-hairline-top">
          <div className="relative z-[2]">
            <Table<InstalledMarketplaceAsset>
              columns={[
                {
                  id: 'package',
                  label: 'Package',
                  key: 'packageName',
                  sortable: true,
                  render: (_value, row) => {
                    const [publisherId, packageName] = row.assetId.split('/');
                    const assetPath = `/marketplace/assets/${encodeURIComponent(publisherId ?? '')}/${encodeURIComponent(packageName ?? row.packageName)}`;
                    return (
                      <Link to={assetPath} className="font-medium text-zinc-100 hover:text-sky-300">
                        {row.packageName}
                      </Link>
                    );
                  },
                },
                {
                  id: 'version',
                  label: 'Version',
                  key: 'installedVersion',
                  sortable: true,
                  render: (_value, row) => (
                    <span className="font-mono text-zinc-300">{row.installedVersion}</span>
                  ),
                },
                {
                  id: 'state',
                  label: 'State',
                  key: 'state',
                  sortable: true,
                  render: (_value, row) => <Badge variant={stateBadgeVariant(row.state)} size="md">{row.state}</Badge>,
                },
                {
                  id: 'updates',
                  label: 'Updates',
                  key: 'updateStatus',
                  sortable: true,
                  render: (_value, row) => (
                    <Badge variant={updateBadgeVariant(row.updateStatus)} size="md">
                      {row.updateStatus === 'update-available' && row.latestCompatibleVersion
                        ? `${row.latestCompatibleVersion} available`
                        : row.updateStatus}
                    </Badge>
                  ),
                },
                {
                  id: 'installedAt',
                  label: 'Installed',
                  key: 'installedAt',
                  render: (_value, row) => (
                    <span className="font-mono text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                      {new Date(row.installedAt).toLocaleString()}
                    </span>
                  ),
                },
                {
                  id: 'actions',
                  label: 'Actions',
                  key: 'packageName',
                  render: (_value, row) => (
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void run(`verify ${row.packageName}`, marketplaceClient.verify(row.packageName))}
                      >
                        Verify
                      </Button>
                      {row.updateStatus === 'update-available' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(
                              `update ${row.packageName}`,
                              marketplaceClient.update({ packageName: row.packageName, approved: true }),
                            )
                          }
                        >
                          Update
                        </Button>
                      )}
                      <ConfirmButton
                        confirmLabel={`Uninstall ${row.packageName}? This will remove the package from the workspace.`}
                        variant="danger"
                        disabled={busy !== null}
                        onConfirm={() =>
                          void run(`uninstall ${row.packageName}`, marketplaceClient.uninstall(row.packageName))
                        }
                      >
                        Uninstall
                      </ConfirmButton>
                      <ConfirmButton
                        confirmLabel={`${row.enabled ? 'Disable' : 'Enable'} ${row.packageName}?`}
                        variant="secondary"
                        disabled={busy !== null}
                        onConfirm={() =>
                          void run(
                            `${row.enabled ? 'disable' : 'enable'} ${row.packageName}`,
                            marketplaceClient.setEnabled(row.packageName, !row.enabled),
                          )
                        }
                      >
                        {row.enabled ? 'Disable' : 'Enable'}
                      </ConfirmButton>
                    </div>
                  ),
                },
              ]}
              data={installed}
              keyExtractor={(row) => row.packageName}
              striped
            />
          </div>
        </div>
      )}

      {notice && notice.status === 'completed' && notice.type !== 'rescan' && (
        <Badge variant="success" size="md">
          {notice.type} completed for {notice.asset?.packageName}
        </Badge>
      )}
    </MarketplacePage>
  );
}
