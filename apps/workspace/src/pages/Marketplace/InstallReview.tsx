import { useState } from 'react';
import type { MarketplaceAssetDetails, MarketplaceOperationPlan } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import { button, buttonPrimary, chip, muted, panel } from './styles.js';

const CONTRIBUTION_LABELS: Record<string, string> = {
  agents: 'Agents',
  skills: 'Skills',
  commands: 'Commands',
  workflows: 'Workflows',
  mcpServers: 'MCP Servers',
  providers: 'Providers',
  themes: 'Themes',
  verificationProfiles: 'Verification Profiles',
  documentationRules: 'Documentation Rules',
  graphSources: 'Graph Sources',
  settings: 'Settings',
  workspaceViews: 'Workspace Views',
  tuiViews: 'TUI Views',
};

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
    <div className={`${panel} p-4`}>
      <div className="mb-3 text-sm font-semibold">Install</div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs">
          <span className={muted}>Version</span>
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
        <button type="button" onClick={() => void resolve()} className={buttonPrimary} disabled={status === 'running'}>
          {plan ? 'Re-resolve' : 'Review installation'}
        </button>
      </div>

      {plan && (
        <div className="mt-4 space-y-3">
          <div>
            <div className={`mb-1 text-xs font-semibold uppercase ${muted}`}>
              Packages to install ({plan.installOrder.length})
            </div>
            {plan.installOrder.length === 0 && (
              <div className="text-sm text-emerald-300">Already installed at the selected version.</div>
            )}
            <ol className="list-decimal space-y-0.5 pl-5 text-sm">
              {plan.installOrder.map((pkg) => (
                <li key={`${pkg.packageName}@${pkg.version}`}>
                  <span className="text-zinc-200">{pkg.packageName}</span> <span className={muted}>@{pkg.version}</span>
                </li>
              ))}
            </ol>
            {plan.satisfiedByInstalled.length > 0 && (
              <div className={`mt-1 text-xs ${muted}`}>
                Satisfied by installed:{' '}
                {plan.satisfiedByInstalled.map((pkg) => `${pkg.packageName}@${pkg.version}`).join(', ')}
              </div>
            )}
          </div>
          {plan.permissions.length > 0 ? (
            <div>
              <div className={`mb-1 text-xs font-semibold uppercase ${muted}`}>Requested permissions</div>
              <div className="flex flex-wrap gap-1">
                {plan.permissions.map((permission) => (
                  <span key={`${permission.capability}:${permission.scope}`} className={`${chip} text-amber-300`}>
                    {permission.capability} <span className={muted}>({permission.scope})</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className={`text-xs ${muted}`}>No permissions requested.</div>
          )}
          {plan.warnings.length > 0 && (
            <div className="text-xs text-orange-300">{plan.warnings.map((warning) => `⚠ ${warning}`).join(' · ')}</div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void confirm()}
              className={buttonPrimary}
              disabled={status === 'running'}
            >
              {status === 'awaiting-permission' ? 'Approve and install' : 'Install'}
            </button>
            <button type="button" onClick={() => void onDone()} className={button} disabled={status === 'running'}>
              Cancel
            </button>
            {status === 'completed' && <span className="text-sm text-emerald-300">Installed ✓</span>}
          </div>
        </div>
      )}
      {error && <div className="mt-3 text-sm text-red-300">{error}</div>}
    </div>
  );
}
