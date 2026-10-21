import { MARKETPLACE_BADGE, MARKETPLACE_CARDS } from './marketplace.fixtures';

export function MarketplacePkg() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">
          MARKETPLACE • CAPABILITIES
        </span>
        <span className="text-[length:var(--vestara-font-size-caption)] px-2 py-0.5 rounded-full bg-[var(--vestara-accent-shell)]/10 border border-[var(--vestara-accent-shell)]/20 text-[var(--vestara-accent-shell)]">
          {MARKETPLACE_BADGE}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {MARKETPLACE_CARDS.map((n) => (
          <div
            key={n.name}
            className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3 hover:border-[var(--vestara-accent-shell)]/20 transition"
          >
            <div className="text-[length:var(--vestara-font-size-label)] font-medium text-[var(--vestara-text-shell-primary)]">
              {n.name}
            </div>
            <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] mt-1">
              Re-themed • border #1a3a3d • surface #0d191b
            </div>
            <div className="mt-2 h-1 rounded-full bg-[var(--vestara-surface-shell-canvas)] overflow-hidden">
              <div className="h-full w-[78%] bg-[var(--vestara-accent-shell)]/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
