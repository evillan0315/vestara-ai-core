import { useEffect, useRef, useState } from 'react';
import {
  fetchMarketplaceAssets,
  installMarketplaceAsset,
  type LiveMarketplaceAsset,
  setMarketplaceAssetEnabled,
  uninstallMarketplaceAsset,
} from '../lib/marketplace';
import { setPackageEnabled, setPackageInstalled, VOICE_PACKAGE_ID } from '../lib/package-state';
import {
  MARKETPLACE_BADGE,
  MARKETPLACE_FIXTURE,
  MARKETPLACE_OFFLINE_NOTE,
  MARKETPLACE_SEARCH_PLACEHOLDER,
} from './marketplace.fixtures';

type LoadState = 'loading' | 'live' | 'fixture';

export function MarketplacePkg() {
  const [catalog, setCatalog] = useState<readonly LiveMarketplaceAsset[]>(MARKETPLACE_FIXTURE);
  const [assets, setAssets] = useState<readonly LiveMarketplaceAsset[]>(MARKETPLACE_FIXTURE);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<LoadState>('loading');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<Readonly<Record<string, boolean>>>({});
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const liveRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchMarketplaceAssets('')
      .then((live) => {
        if (cancelled) return;
        if (live.length > 0) {
          liveRef.current = true;
          setAssets(live);
          setState('live');
          // The server is source of truth when live: mirror it into the
          // shell lifecycle store so dock/icons match the installed set.
          const voice = live.find((a) => a.id === VOICE_PACKAGE_ID);
          if (voice) {
            if (voice.installed) {
              setPackageInstalled(VOICE_PACKAGE_ID, true);
              setPackageEnabled(VOICE_PACKAGE_ID, voice.enabled);
            } else {
              setPackageInstalled(VOICE_PACKAGE_ID, false);
            }
          }
        } else {
          setState('fixture');
        }
      })
      .catch(() => {
        if (!cancelled) setState('fixture');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const search = (q: string) => {
    setQuery(q);
    if (!liveRef.current) {
      // Offline: filter the fixture catalog locally (mutations included).
      const needle = q.trim().toLowerCase();
      setAssets(
        needle
          ? catalog.filter(
              (a) =>
                a.displayName.toLowerCase().includes(needle) ||
                a.summary.toLowerCase().includes(needle) ||
                a.type.toLowerCase().includes(needle),
            )
          : catalog,
      );
      return;
    }
    setSearching(true);
    fetchMarketplaceAssets(q)
      .then((found) => setAssets(found))
      .catch(() => {})
      .finally(() => setSearching(false));
  };

  const applyLocal = (id: string, patch: Partial<LiveMarketplaceAsset>) => {
    const next = (list: readonly LiveMarketplaceAsset[]) => list.map((a) => (a.id === id ? { ...a, ...patch } : a));
    setCatalog((prev) => next(prev));
    setAssets((prev) => next(prev));
  };

  const runMutation = async (id: string, action: () => Promise<void>) => {
    setBusy((prev) => ({ ...prev, [id]: true }));
    setErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await action();
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        [id]: error instanceof Error ? error.message : 'Marketplace action failed',
      }));
    } finally {
      setBusy((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // Optimistic lifecycle: the card + shell update immediately, and a
  // failed API call rolls both back with an inline error note. (An
  // uninstall/disable that later fails cannot resurrect already-closed
  // shell windows — the error note tells the user to reopen them.)
  const handleInstall = (asset: LiveMarketplaceAsset) =>
    runMutation(asset.id, async () => {
      applyLocal(asset.id, { installed: true, enabled: true });
      setPackageInstalled(asset.id, true);
      try {
        if (liveRef.current) await installMarketplaceAsset(asset.id);
      } catch (error) {
        applyLocal(asset.id, { installed: false, enabled: false });
        setPackageInstalled(asset.id, false);
        throw error;
      }
    });

  const handleUninstall = (asset: LiveMarketplaceAsset) =>
    runMutation(asset.id, async () => {
      const prev = { installed: asset.installed, enabled: asset.enabled };
      applyLocal(asset.id, { installed: false, enabled: false });
      setPackageInstalled(asset.id, false);
      try {
        if (liveRef.current) await uninstallMarketplaceAsset(asset.id);
      } catch (error) {
        applyLocal(asset.id, prev);
        setPackageInstalled(asset.id, true);
        setPackageEnabled(asset.id, prev.enabled);
        throw error;
      }
    });

  const handleToggleEnabled = (asset: LiveMarketplaceAsset) =>
    runMutation(asset.id, async () => {
      const enabled = !asset.enabled;
      applyLocal(asset.id, { enabled });
      setPackageEnabled(asset.id, enabled);
      try {
        if (liveRef.current) await setMarketplaceAssetEnabled(asset.id, enabled);
      } catch (error) {
        applyLocal(asset.id, { enabled: asset.enabled });
        setPackageEnabled(asset.id, asset.enabled);
        throw error;
      }
    });

  const live = state === 'live';

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">
          MARKETPLACE • CAPABILITIES
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={`text-[length:var(--vestara-font-size-micro-small)] font-mono px-1.5 py-0.5 rounded-full border ${
              live
                ? 'border-[var(--vestara-status-shell-success)]/20 bg-[var(--vestara-status-shell-success)]/10 text-[var(--vestara-status-shell-success)]'
                : 'border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-canvas)] text-[var(--vestara-text-shell-muted)]'
            }`}
          >
            {live ? 'LIVE' : state === 'loading' ? '…' : 'SNAPSHOT'}
          </span>
          <span className="text-[length:var(--vestara-font-size-caption)] px-2 py-0.5 rounded-full bg-[var(--vestara-accent-shell)]/10 border border-[var(--vestara-accent-shell)]/20 text-[var(--vestara-accent-shell)]">
            {MARKETPLACE_BADGE}
          </span>
        </span>
      </div>
      <div>
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          aria-label="Search marketplace"
          placeholder={MARKETPLACE_SEARCH_PLACEHOLDER}
          className="w-full h-9 rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-canvas)] border border-[var(--vestara-border-shell)] px-3 text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-primary)] placeholder:text-[var(--vestara-text-shell-faint)] outline-none focus:border-[var(--vestara-accent-shell)]/40 disabled:opacity-60"
        />
      </div>
      {!live && state === 'fixture' && (
        <div className="text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-faint)]">
          {MARKETPLACE_OFFLINE_NOTE}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2" aria-busy={searching}>
        {assets.map((n) => (
          <div
            key={n.id}
            className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3 hover:border-[var(--vestara-accent-shell)]/20 transition"
          >
            <div className="flex items-center gap-2">
              <div className="text-[length:var(--vestara-font-size-label)] font-medium text-[var(--vestara-text-shell-primary)]">
                {n.displayName}
              </div>
              {n.installed && (
                <span className="ml-auto text-[length:var(--vestara-font-size-micro-small)] font-mono px-1.5 py-px rounded-full bg-[var(--vestara-status-shell-success)]/10 border border-[var(--vestara-status-shell-success)]/20 text-[var(--vestara-status-shell-success)]">
                  INSTALLED
                </span>
              )}
              {n.installed && !n.enabled && (
                <span className="text-[length:var(--vestara-font-size-micro-small)] font-mono px-1.5 py-px rounded-full bg-[var(--vestara-status-shell-warning)]/10 border border-[var(--vestara-status-shell-warning)]/20 text-[var(--vestara-status-shell-warning)]">
                  DISABLED
                </span>
              )}
            </div>
            {n.summary && (
              <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] mt-1">
                {n.summary}
              </div>
            )}
            <div className="mt-1 text-[length:var(--vestara-font-size-micro)] font-mono text-[var(--vestara-text-shell-faint)]">
              {n.type}
              {n.version ? ` • v${n.version}` : ''}
              {n.publisher ? ` • ${n.publisher}` : ''}
            </div>
            <div className="mt-2 flex gap-1.5">
              {!n.installed ? (
                <button
                  type="button"
                  disabled={busy[n.id] === true}
                  onClick={() => handleInstall(n)}
                  className="px-3 py-1 rounded-full bg-[var(--vestara-accent-shell)] text-[var(--vestara-color-shell-ink)] text-[length:var(--vestara-font-size-caption)] font-bold disabled:opacity-60"
                >
                  Install
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy[n.id] === true}
                    onClick={() => handleToggleEnabled(n)}
                    aria-label={`${n.enabled ? 'Disable' : 'Enable'} ${n.displayName}`}
                    className={`px-3 py-1 rounded-full border text-[length:var(--vestara-font-size-caption)] font-bold disabled:opacity-60 ${n.enabled ? 'bg-[var(--vestara-surface-shell-canvas)] border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-secondary)]' : 'bg-[var(--vestara-status-shell-success)]/10 border-[var(--vestara-status-shell-success)]/30 text-[var(--vestara-status-shell-success)]'}`}
                  >
                    {busy[n.id] === true ? 'Working…' : n.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    disabled={busy[n.id] === true}
                    onClick={() => handleUninstall(n)}
                    aria-label={`Uninstall ${n.displayName}`}
                    className="px-3 py-1 rounded-full bg-[var(--vestara-surface-shell-canvas)] border border-[var(--vestara-status-shell-danger)]/30 text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-status-shell-danger)] disabled:opacity-60"
                  >
                    Uninstall
                  </button>
                </>
              )}
            </div>
            {errors[n.id] && (
              <div className="mt-1.5 text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-status-shell-danger)]">
                {errors[n.id]}
              </div>
            )}
          </div>
        ))}
        {assets.length === 0 && live && (
          <div className="text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-muted)]">
            No capabilities match “{query}”.
          </div>
        )}
      </div>
    </div>
  );
}
