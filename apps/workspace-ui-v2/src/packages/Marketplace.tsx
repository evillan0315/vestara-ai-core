import { useEffect, useState } from 'react';
import { fetchMarketplaceAssets, type LiveMarketplaceAsset } from '../lib/marketplace';
import {
  MARKETPLACE_BADGE,
  MARKETPLACE_FIXTURE,
  MARKETPLACE_OFFLINE_NOTE,
  MARKETPLACE_SEARCH_PLACEHOLDER,
} from './marketplace.fixtures';

type LoadState = 'loading' | 'live' | 'fixture';

export function MarketplacePkg() {
  const [assets, setAssets] = useState<readonly LiveMarketplaceAsset[]>(MARKETPLACE_FIXTURE);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<LoadState>('loading');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMarketplaceAssets('')
      .then((live) => {
        if (cancelled) return;
        if (live.length > 0) {
          setAssets(live);
          setState('live');
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
    if (!live) {
      // Offline: filter the fixture catalog locally.
      const needle = q.trim().toLowerCase();
      setAssets(
        needle
          ? MARKETPLACE_FIXTURE.filter(
              (a) =>
                a.displayName.toLowerCase().includes(needle) ||
                a.summary.toLowerCase().includes(needle) ||
                a.type.toLowerCase().includes(needle),
            )
          : MARKETPLACE_FIXTURE,
      );
      return;
    }
    setSearching(true);
    fetchMarketplaceAssets(q)
      .then((found) => setAssets(found))
      .catch(() => {})
      .finally(() => setSearching(false));
  };

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
