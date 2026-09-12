/**
 * Marketplace Premium Gallery (v7.14) — InstallReview.
 *
 * Premium pre-flight review flow: version selector, plan review,
 * permission badges. The dry-run plan from `MarketplaceService` is
 * the contract: version → dependency plan → permissions →
 * contributions → confirm.
 */

import { useState } from 'react';
import { Badge, Button } from '@vestara/ui';
import type { MarketplaceAssetDetails, MarketplaceOperationPlan } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';

/**
 * Install review flow. The dry-run plan from `MarketplaceService` is the
 * contract: version → dependency plan → permissions → contributions → confirm.
 */
export default function InstallReview({ details, onDone }: { details: MarketplaceAssetDetails; onDone: () => void }) {
  const [version, setVersion] = useState(details.asset.latestVersion);
  const [plan, setPlan] = useState<MarketplaceOperationPlan | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'planning' | 'awaiting-permission' | 'running' | 'completed' | 'failed'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  const reference = { packageName: details.asset.packageName };

  const resolve = async () => {
    setStatus('planning');
    setError(null);
    try {
      const operation = await marketplaceClient.install({ reference, version, dryRun: true });
      setPlan(operation.plan ?? null);
      setStatus(operation.status === 'planning' ? 'planning' : 'awaiting-permission');
    } catch (caught) {
      setStatus('failed');
      setError(caught instanceof Error ? caught.message : 'Resolution failed');
    }
  };

  const confirm = async () => {
    setStatus('running');
    setError(null);
    try {
      const operation = await marketplaceClient.install({ reference, version, approved: true });
      if (operation.status === 'completed') {
        setStatus('completed');
        onDone();
      } else {
        setStatus('failed');
        setError(operation.error?.message ?? 'Install failed');
      }
    } catch (caught) {
      setStatus('failed');
      setError(caught instanceof Error ? caught.message : 'Install failed');
    }
  };

  return (
    <div className="mpg-card mpg-hairline-top p-4">
      <div className="relative z-[2]">
        <div className="mb-3 bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-sm font-semibold text-transparent">
          Install — pre-flight review
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-xs">
            <span className="text-[var(--vestara-text-muted,var(--color-zinc-400))]">Version</span>
            <select
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              className="mt-1 block w-40 rounded-md border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] bg-[var(--vestara-color-bg-workspace,var(--color-zinc-950))] px-2 py-1.5 text-sm"
            >
              {details.asset.versions.map((item) => (
                <option key={item.version} value={item.version}>
                  {item.version}
                  {!item.isStable ? ' (preview)' : ''}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" size="md" loading={status === 'running'} onClick={() => void resolve()}>
            {plan ? 'Re-resolve' : 'Review installation'}
          </Button>
        </div>

        {plan && (
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                Packages to install ({plan.installOrder.length})
              </div>
              {plan.installOrder.length === 0 && (
                <div className="text-sm text-emerald-300">Already installed at the selected version.</div>
              )}
              <ol className="list-decimal space-y-0.5 pl-5 font-mono text-sm">
                {plan.installOrder.map((pkg) => (
                  <li key={`${pkg.packageName}@${pkg.version}`}>
                    <span className="text-zinc-200">{pkg.packageName}</span>{' '}
                    <span className="text-[var(--vestara-text-muted,var(--color-zinc-400))]">@{pkg.version}</span>
                  </li>
                ))}
              </ol>
              {plan.satisfiedByInstalled.length > 0 && (
                <div className="mt-1 font-mono text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                  Satisfied by installed:{' '}
                  {plan.satisfiedByInstalled.map((pkg) => `${pkg.packageName}@${pkg.version}`).join(', ')}
                </div>
              )}
            </div>
            {plan.permissions.length > 0 ? (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                  Requested permissions
                </div>
                <div className="flex flex-wrap gap-1">
                  {plan.permissions.map((permission) => (
                    <Badge key={`${permission.capability}:${permission.scope}`} variant="warning" size="md">
                      {permission.capability}{' '}
                      <span className="font-mono opacity-80">({permission.scope})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                No permissions requested.
              </div>
            )}
            {plan.warnings.length > 0 && (
              <div className="text-xs text-orange-300">{plan.warnings.map((warning) => `⚠ ${warning}`).join(' · ')}</div>
            )}
            <div className="flex items-center gap-2">
              <Button variant="primary" size="md" loading={status === 'running'} onClick={() => void confirm()}>
                {status === 'awaiting-permission' ? 'Approve and install' : 'Install'}
              </Button>
              <Button variant="secondary" size="md" disabled={status === 'running'} onClick={() => void onDone()}>
                Cancel
              </Button>
              {status === 'completed' && <Badge variant="success" size="md" dot={false}>Installed ✓</Badge>}
            </div>
          </div>
        )}
        {error && <div className="mt-3 text-sm text-red-300">{error}</div>}
      </div>
    </div>
  );
}
