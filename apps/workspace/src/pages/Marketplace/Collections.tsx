/**
 * Marketplace — My Collections.
 *
 * User-curated collections of marketplace assets. Membership is stored
 * locally (localStorage) and resolved against installed/registry assets,
 * so no production listing is fabricated. Pure presentation over the
 * existing marketplace client + shared Marketplace primitives.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@vestara/ui';
import type { InstalledMarketplaceAsset } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import { InsightBanner, MarketplaceEmptyState, MarketplacePage } from './MarketplaceLayout-components.js';

const STORAGE_KEY = 'vestara.marketplace.collections.v1';

interface StoredCollections {
  favorites: string[];
}

function readStored(): StoredCollections {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { favorites: [] };
    const parsed = JSON.parse(raw) as Partial<StoredCollections>;
    return { favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((v) => typeof v === 'string') : [] };
  } catch {
    return { favorites: [] };
  }
}

export default function Collections() {
  const [installed, setInstalled] = useState<InstalledMarketplaceAsset[]>([]);
  const [favorites, setFavorites] = useState<string[]>(() => readStored().favorites);
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

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ favorites }));
    } catch {
      // Storage is best-effort (private mode, quota) — collections still work in-memory.
    }
  }, [favorites]);

  const toggle = useCallback((packageName: string) => {
    setFavorites((prev) => (prev.includes(packageName) ? prev.filter((p) => p !== packageName) : [...prev, packageName]));
  }, []);

  const favoriteInstalled = useMemo(
    () => installed.filter((item) => favorites.includes(item.packageName)),
    [installed, favorites],
  );
  const unfavorited = useMemo(
    () => installed.filter((item) => !favorites.includes(item.packageName)),
    [installed, favorites],
  );

  return (
    <MarketplacePage
      title="My Collections"
      description="Curate installed modules, agents, templates, and tools into your own collections."
      toolbar={
        <Button variant="secondary" size="md" onClick={() => void load()}>
          Refresh
        </Button>
      }
    >
      {error && <InsightBanner severity="error" description={error} />}
      {installed.length === 0 && !error ? (
        <MarketplaceEmptyState message="Nothing installed yet. Install from Discover, then curate it here." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="mpg-side-card" aria-label="Favorites collection">
            <h3 className="text-[13px] font-semibold text-[var(--vestara-text-primary)]">
              Favorites ({favoriteInstalled.length})
            </h3>
            {favoriteInstalled.length === 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-[var(--vestara-text-muted)]">
                No favorites yet — star installed packages to build this collection.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {favoriteInstalled.map((item) => (
                  <li
                    key={item.packageName}
                    className="flex items-center justify-between gap-2 rounded-[var(--vestara-radius,6px)] border border-[var(--vestara-border-subtle)] px-3 py-2"
                  >
                    <Link
                      to={`/marketplace/assets/vestara/${encodeURIComponent(item.packageName)}`}
                      className="min-w-0 truncate text-[13px] text-[var(--vestara-text-primary)]"
                    >
                      {item.packageName}
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggle(item.packageName)}
                      aria-label={`Remove ${item.packageName} from favorites`}
                      className="mpg-link shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="mpg-side-card" aria-label="Installed packages">
            <h3 className="text-[13px] font-semibold text-[var(--vestara-text-primary)]">
              Installed ({unfavorited.length})
            </h3>
            {unfavorited.length === 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-[var(--vestara-text-muted)]">
                Everything installed is already in Favorites.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {unfavorited.map((item) => (
                  <li
                    key={item.packageName}
                    className="flex items-center justify-between gap-2 rounded-[var(--vestara-radius,6px)] border border-[var(--vestara-border-subtle)] px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-[13px] text-[var(--vestara-text-secondary)]">
                      {item.packageName}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(item.packageName)}
                      aria-label={`Add ${item.packageName} to favorites`}
                      className="mpg-link shrink-0"
                    >
                      Add ★
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </MarketplacePage>
  );
}
