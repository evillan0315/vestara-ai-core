/**
 * VES-UI-001 T5: Marketplace Package
 *
 * Capability cards promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/packages/Marketplace.tsx`).
 * Data: marketplace index via `useMarketplacePackage` → `marketplacePackageFixture`.
 * Never hardcoded arrays in JSX.
 *
 * Visual roles bind to the scoped `--ds-*` layer, never hex literals.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T5 Marketplace + data)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useMemo, useState } from 'react';
import { PackageEmpty, PackageGhostButton, PackageSearchInput, PackageSkeleton, PackageSubHeader } from './PackageChrome';
import { useMarketplacePackage } from './useMarketplacePackage';

export function MarketplacePackage() {
  const { items, isLoading, isLive } = useMarketplacePackage();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [installedIds, setInstalledIds] = useState<ReadonlySet<string>>(new Set());

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const item of items) seen.add(item.category);
    return ['All', ...[...seen].sort()];
  }, [items]);
  const activeCategory = categories.includes(category) ? category : 'All';

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = items.filter((item) => {
    if (activeCategory !== 'All' && item.category !== activeCategory) return false;
    if (!normalizedQuery) return true;
    return (
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery) ||
      item.category.toLowerCase().includes(normalizedQuery)
    );
  });

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <PackageSubHeader
        eyebrow="MARKETPLACE · CAPABILITIES"
        isLive={isLive}
        liveLabel="LIVE INDEX"
        meta={
          <span className="hidden text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)] sm:inline">
            {visibleItems.length} of {items.length}
          </span>
        }
      />
      <div className="flex shrink-0 flex-wrap items-center gap-[var(--vestara-spacing-2)] border-b border-[var(--ds-border)] px-[var(--vestara-spacing-4)] py-[var(--vestara-spacing-2)]">
        <div className="flex min-w-[160px] flex-1 items-center gap-[var(--vestara-spacing-2)]">
          <PackageSearchInput
            id="ds-marketplace-filter"
            value={query}
            onChange={setQuery}
            label="Search marketplace capabilities"
            placeholder="Search capabilities…"
          />
        </div>
        <div className="flex flex-wrap gap-[var(--vestara-spacing-1)]" role="group" aria-label="Filter by category">
          {categories.map((entry) => {
            const selected = entry === activeCategory;
            return (
              <button
                key={entry}
                type="button"
                onClick={() => setCategory(entry)}
                aria-pressed={selected}
                className={`rounded-full border px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] ${
                  selected
                    ? 'border-[var(--ds-accent)] bg-[var(--ds-accent-bg)] text-[var(--ds-accent)]'
                    : 'border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]'
                }`}
              >
                {entry}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-[var(--vestara-spacing-4)]">
      {isLoading && visibleItems.length === 0 ? (
        <PackageSkeleton count={3} label="Loading marketplace capabilities" />
      ) : visibleItems.length === 0 ? (
        <PackageEmpty title="No matching capabilities" hint="Adjust the search or category filter." />
      ) : (
      <div className="ds-cards ds-cards-3col-wide grid gap-[var(--vestara-spacing-2)]" aria-busy={isLoading}>
        {visibleItems.map((item) => {
          const installed = item.installed || installedIds.has(item.id);
          return (
          <div
            key={item.id}
            className="flex flex-col rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-3)] transition hover:border-[var(--ds-border-strong)]"
          >
            <div className="flex items-center justify-between gap-[var(--vestara-spacing-2)]">
              <div className="truncate text-[length:var(--vestara-font-size-sm)] font-medium text-[var(--ds-text)]">
                {item.name}
              </div>
              <span className="shrink-0 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-1)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
                {item.category}
              </span>
            </div>
            <div className="mt-[var(--vestara-spacing-1)] min-h-[28px] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
              {item.description}
            </div>
            <div className="mt-auto flex items-center justify-between gap-[var(--vestara-spacing-2)] pt-[var(--vestara-spacing-2)]">
              <span className={`text-[length:var(--vestara-font-size-xs)] ${installed ? 'text-[var(--ds-success)]' : 'text-[var(--ds-text-secondary)]'}`}>
                {installed ? 'Installed' : 'Available'}
              </span>
              {installed ? null : (
                <PackageGhostButton
                  label={`Install ${item.name}`}
                  onClick={() => {
                    setInstalledIds((prev) => new Set(prev).add(item.id));
                  }}
                >
                  Install
                </PackageGhostButton>
              )}
            </div>
          </div>
          );
        })}
      </div>
      )}
      </div>
    </div>
  );
}
