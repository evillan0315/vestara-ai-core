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

import { useMarketplacePackage } from './useMarketplacePackage';
import '../desktop-shell.tokens.css';

export function MarketplacePackage() {
  const { items, isLoading, isLive } = useMarketplacePackage();

  return (
    <div className="space-y-[var(--vestara-spacing-3)] p-[var(--vestara-spacing-4)]">
      <div className="flex items-center justify-between">
        <span className="text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
          MARKETPLACE · CAPABILITIES
        </span>
        <span className="rounded-full border border-[var(--ds-accent)] bg-[var(--ds-accent-bg)] px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-accent)]">
          {isLive ? 'LIVE INDEX' : 'SNAPSHOT'}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-[var(--vestara-spacing-2)] md:grid-cols-3" aria-busy={isLoading}>
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-3)] transition hover:border-[var(--ds-border-strong)]"
          >
            <div className="text-[length:var(--vestara-font-size-sm)] font-medium text-[var(--ds-text)]">
              {item.name}
            </div>
            <div className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
              {item.category} · {item.description}
            </div>
            <div
              aria-hidden="true"
              className="mt-[var(--vestara-spacing-2)] h-1 overflow-hidden rounded-full bg-[var(--ds-surface-bg)]"
            >
              <div className={`h-full ${item.installed ? 'w-full' : 'w-3/4'} bg-[var(--ds-accent)] opacity-60`} />
            </div>
            <div className="mt-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
              {item.installed ? 'Installed' : 'Available'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
