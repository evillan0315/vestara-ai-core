/**
 * Marketplace Premium Gallery (v7.14) — AssetDetail.
 *
 * Premium product showcase with accent glow header, detail cards,
 * and install review. Preserves the permissions/verification
 * presentation contract.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, Button } from '@vestara/ui';
import type { InstalledMarketplaceAsset, MarketplaceAssetDetails } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import InstallReview from './InstallReview.js';
import { DetailCard, InsightBanner, TypeBadge, typeAccent } from './MarketplaceLayout-components.js';

function contributionsOf(details: MarketplaceAssetDetails): Array<{ kind: string; label: string; ids: string[] }> {
  const contributions = details.manifest?.contributions ?? {};
  return Object.entries(contributions)
    .filter(([, items]) => items.length > 0)
    .map(([kind, items]) => ({
      kind,
      label:
        // prettier-ignore
        kind === 'mcpServers' ? 'MCP Servers' : kind.charAt(0).toUpperCase() + kind.slice(1),
      ids: items.map((item) => item.id),
    }));
}

export default function AssetDetail() {
  const { publisher = '', name = '' } = useParams<{ publisher: string; name: string }>();
  const [details, setDetails] = useState<MarketplaceAssetDetails | null>(null);
  const [installed, setInstalled] = useState<InstalledMarketplaceAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [assetDetails, installedList] = await Promise.all([
        marketplaceClient.asset(publisher, name),
        marketplaceClient.installed(),
      ]);
      setDetails(assetDetails);
      setInstalled(installedList.find((item) => item.packageName === assetDetails.asset.packageName) ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load asset');
    }
  }, [publisher, name]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEnabled = async () => {
    if (!installed) return;
    setBusy(true);
    setError(null);
    try {
      await marketplaceClient.setEnabled(installed.packageName, !installed.enabled);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to toggle enabled state');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <InsightBanner severity="error" description={error} />;
  if (!details)
    return (
      <div className="mpg-card p-8 text-center text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
        Loading asset…
      </div>
    );

  const asset = details.asset;
  const contributions = contributionsOf(details);
  const ref = `${encodeURIComponent(asset.publisherId)}/${encodeURIComponent(asset.packageName)}`;
  const accent = typeAccent(asset.type);

  return (
    <div className="space-y-4">
      {/* Premium product showcase header */}
      <header
        className="mpg-card mpg-hairline-top flex flex-wrap items-start justify-between gap-3 p-5"
        style={{ boxShadow: `0 0 24px var(--vestara-surface-glow), inset 0 1px 0 var(--vestara-surface-sheen)` }}
      >
        <div className="relative z-[2]">
          <div className="flex items-center gap-2">
            <span className="inline-block h-5 w-1 rounded-full" style={{ background: accent }} aria-hidden="true" />
            <h1 className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-xl font-semibold text-transparent">
              {asset.displayName}
            </h1>
            <TypeBadge type={asset.type} />
          </div>
          <div className="mt-1 font-mono text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
            {asset.publisherId} · {asset.packageName}@{asset.latestVersion} · {details.registryId} registry
          </div>
        </div>
        <div className="relative z-[2] flex items-center gap-2">
          {installed ? (
            <>
              <Badge variant="success" size="md">
                installed {installed.installedVersion}
              </Badge>
              <Button
                variant={installed.enabled ? 'danger' : 'secondary'}
                size="sm"
                disabled={busy}
                onClick={() => void toggleEnabled()}
              >
                {installed.enabled ? 'Disable' : 'Enable'}
              </Button>
            </>
          ) : (
            <Button variant="primary" size="md" onClick={() => setShowReview((previous) => !previous)}>
              Install
            </Button>
          )}
        </div>
      </header>

      {showReview && !installed && <InstallReview key={ref} details={details} onDone={() => void load()} />}

      <DetailCard title="Overview">
        <p className="text-sm text-zinc-200">{asset.summary}</p>
        {asset.description && asset.description !== asset.summary && (
          <p className="mt-2 text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">{asset.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-1">
          {details.capabilities.map((capability) => (
            <Badge key={capability} variant="default" size="md">
              {capability}
            </Badge>
          ))}
        </div>
      </DetailCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard title="Versions">
          <ul className="space-y-1 text-sm">
            {asset.versions.map((item) => (
              <li key={item.version} className="flex items-center justify-between">
                <span>
                  <span className="font-mono">{item.version}</span>
                  {!item.isStable && (
                    <Badge variant="warning" size="sm" className="ml-2">
                      preview
                    </Badge>
                  )}
                </span>
                <span className={`font-mono text-xs ${item.checksumVerified ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.checksumVerified ? '✓ checksum' : '✗ checksum'}
                </span>
              </li>
            ))}
          </ul>
        </DetailCard>

        <DetailCard title="Compatibility">
          {asset.versions[0] && (
            <ul className="space-y-1 font-mono text-sm">
              <li>
                <span className="text-[var(--vestara-text-muted,var(--color-zinc-400))]">Vestara:</span>{' '}
                {asset.versions[0].compatibility.vestara}
              </li>
              {asset.versions[0].compatibility.node && (
                <li>
                  <span className="text-[var(--vestara-text-muted,var(--color-zinc-400))]">Node:</span>{' '}
                  {asset.versions[0].compatibility.node}
                </li>
              )}
              {asset.versions[0].compatibility.operatingSystems?.length ? (
                <li>
                  <span className="text-[var(--vestara-text-muted,var(--color-zinc-400))]">OS:</span>{' '}
                  {asset.versions[0].compatibility.operatingSystems.join(', ')}
                </li>
              ) : null}
              {asset.versions[0].compatibility.architectures?.length ? (
                <li>
                  <span className="text-[var(--vestara-text-muted,var(--color-zinc-400))]">Arch:</span>{' '}
                  {asset.versions[0].compatibility.architectures.join(', ')}
                </li>
              ) : null}
            </ul>
          )}
        </DetailCard>

        <DetailCard title="Dependencies">
          {details.dependencies.length === 0 ? (
            <div className="text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">None.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {details.dependencies.map((dependency) => (
                <li key={`${dependency.packageName}@${dependency.version}`}>
                  <span className="font-mono">{dependency.packageName}</span>{' '}
                  <span className="font-mono text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                    @{dependency.version}
                  </span>
                  {dependency.optional && (
                    <Badge variant="default" size="sm" className="ml-2">
                      optional
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DetailCard>

        <DetailCard title="Permissions">
          {details.permissions.length === 0 ? (
            <div className="text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">None requested.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {details.permissions.map((permission) => (
                <li key={`${permission.capability}:${permission.scope}`}>
                  <Badge variant="warning" size="md">
                    {permission.capability}
                  </Badge>{' '}
                  <span className="font-mono text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                    ({permission.scope})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DetailCard>

        <DetailCard title="Contributions">
          {contributions.length === 0 ? (
            <div className="text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
              No runtime contributions declared.
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {contributions.map((contribution) => (
                <li key={contribution.kind} className="flex items-center justify-between">
                  <span className="font-medium text-zinc-200">{contribution.label}</span>
                  <span className="font-mono text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                    {contribution.ids.join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DetailCard>

        <DetailCard title="Verification">
          <ul className="space-y-1 text-sm">
            <li>
              <span>Checksum: </span>
              {asset.verification.checksumVerified ? (
                <span className="text-emerald-400">verified ✓</span>
              ) : (
                <span className="text-red-400">mismatch ✗</span>
              )}
            </li>
            <li>
              <span>Signature: </span>
              {asset.verification.signed ? (
                <span className="text-emerald-400">declared</span>
              ) : (
                <span className="text-[var(--vestara-text-muted,var(--color-zinc-400))]">none</span>
              )}
            </li>
            <li>
              Runtime verified:{' '}
              <span className="text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                no (discovery never executes packages)
              </span>
            </li>
          </ul>
        </DetailCard>
      </div>
    </div>
  );
}
