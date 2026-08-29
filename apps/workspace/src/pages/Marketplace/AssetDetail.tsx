import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { InstalledMarketplaceAsset, MarketplaceAssetDetails } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import InstallReview from './InstallReview.js';
import { button, buttonDanger, chip, muted, panel, panelBody, panelHeader } from './styles.js';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={panel}>
      <div className={panelHeader}>{title}</div>
      <div className={panelBody}>{children}</div>
    </section>
  );
}

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

  if (error) return <div className="p-8 text-center text-sm text-red-300">{error}</div>;
  if (!details) return <div className={`${panel} p-8 text-center text-sm ${muted}`}>Loading asset…</div>;

  const asset = details.asset;
  const contributions = contributionsOf(details);
  const ref = `${encodeURIComponent(asset.publisherId)}/${encodeURIComponent(asset.packageName)}`;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{asset.displayName}</h1>
            <span className={`${chip} ${muted}`}>{asset.type}</span>
          </div>
          <div className={`text-sm ${muted}`}>
            {asset.publisherId} · {asset.packageName}@{asset.latestVersion} · {details.registryId} registry
          </div>
        </div>
        <div className="flex items-center gap-2">
          {installed ? (
            <>
              <span className={`${chip} text-emerald-300`}>installed {installed.installedVersion}</span>
              <button
                type="button"
                onClick={() => void toggleEnabled()}
                className={installed.enabled ? buttonDanger : button}
                disabled={busy}
              >
                {installed.enabled ? 'Disable' : 'Enable'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowReview((previous) => !previous)}
              className="rounded-md bg-[var(--vestara-accent,var(--color-sky-600))] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Install
            </button>
          )}
        </div>
      </header>

      {showReview && !installed && <InstallReview key={ref} details={details} onDone={() => void load()} />}

      <Section title="Overview">
        <p className="text-sm">{asset.summary}</p>
        {asset.description && asset.description !== asset.summary && (
          <p className={`mt-2 text-sm ${muted}`}>{asset.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-1">
          {details.capabilities.map((capability) => (
            <span key={capability} className={`${chip} ${muted}`}>
              {capability}
            </span>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Versions">
          <ul className="space-y-1 text-sm">
            {asset.versions.map((item) => (
              <li key={item.version} className="flex items-center justify-between">
                <span>
                  {item.version}
                  {!item.isStable && <span className={`${chip} ml-2 ${muted}`}>preview</span>}
                </span>
                <span className={`text-xs ${item.checksumVerified ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.checksumVerified ? '✓ checksum' : '✗ checksum'}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Compatibility">
          {asset.versions[0] && (
            <ul className="space-y-1 text-sm">
              <li>
                <span className={muted}>Vestara:</span> {asset.versions[0].compatibility.vestara}
              </li>
              {asset.versions[0].compatibility.node && (
                <li>
                  <span className={muted}>Node:</span> {asset.versions[0].compatibility.node}
                </li>
              )}
              {asset.versions[0].compatibility.operatingSystems?.length ? (
                <li>
                  <span className={muted}>OS:</span> {asset.versions[0].compatibility.operatingSystems.join(', ')}
                </li>
              ) : null}
              {asset.versions[0].compatibility.architectures?.length ? (
                <li>
                  <span className={muted}>Arch:</span> {asset.versions[0].compatibility.architectures.join(', ')}
                </li>
              ) : null}
            </ul>
          )}
        </Section>

        <Section title="Dependencies">
          {details.dependencies.length === 0 ? (
            <div className={`text-sm ${muted}`}>None.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {details.dependencies.map((dependency) => (
                <li key={`${dependency.packageName}@${dependency.version}`}>
                  {dependency.packageName} <span className={muted}>@{dependency.version}</span>
                  {dependency.optional && <span className={`${chip} ml-2 ${muted}`}>optional</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Permissions">
          {details.permissions.length === 0 ? (
            <div className={`text-sm ${muted}`}>None requested.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {details.permissions.map((permission) => (
                <li key={`${permission.capability}:${permission.scope}`}>
                  <span className="text-amber-300">{permission.capability}</span>{' '}
                  <span className={muted}>({permission.scope})</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Contributions">
          {contributions.length === 0 ? (
            <div className={`text-sm ${muted}`}>No runtime contributions declared.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {contributions.map((contribution) => (
                <li key={contribution.kind} className="flex items-center justify-between">
                  <span className="font-medium">{contribution.label}</span>
                  <span className={`text-xs ${muted}`}>{contribution.ids.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Verification">
          <ul className="space-y-1 text-sm">
            <li>
              Checksum:{' '}
              {asset.verification.checksumVerified ? (
                <span className="text-emerald-400">verified ✓</span>
              ) : (
                <span className="text-red-400">mismatch ✗</span>
              )}
            </li>
            <li>
              Signature:{' '}
              {asset.verification.signed ? (
                <span className="text-emerald-400">declared</span>
              ) : (
                <span className={muted}>none</span>
              )}
            </li>
            <li>
              Runtime verified: <span className={muted}>no (discovery never executes packages)</span>
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
