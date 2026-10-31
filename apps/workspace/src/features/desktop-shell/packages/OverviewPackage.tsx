/**
 * VES-UI-001 T5: Overview Package
 *
 * Hero + stat cards promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/packages/Overview.tsx`).
 * Data: `useOverview` (live `/api/workspace` projection) → fixture fallback.
 * Never hardcoded arrays in JSX — stat cards render the hook output, which
 * falls back to `overviewPackageFixture.stats`.
 *
 * Visual roles bind to the scoped `--ds-*` layer, never hex literals.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T5 Overview + data)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useOverview } from '../../overview/hooks/useOverview';
import { overviewFixture } from '../../overview/overview.fixtures';
import { PackageGhostButton, PackageSkeleton } from './PackageChrome';
import { overviewPackageFixture } from './packages.fixtures';

export function OverviewPackage() {
  const { data, isLoading, error, refetch } = useOverview();
  const workspace = data?.workspace ?? overviewFixture.workspace;
  const agents = data?.agents ?? overviewFixture.agents;
  const onlineCount = agents.filter((agent) => agent.status === 'online' || agent.status === 'busy').length;
  const stats = [
    { id: 'workspace', label: 'WORKSPACE', value: workspace.name },
    { id: 'health', label: 'HEALTH', value: workspace.health === 'healthy' ? 'Healthy' : workspace.health },
    {
      id: 'focus',
      label: 'FOCUS',
      value: overviewPackageFixture.stats.find((stat) => stat.id === 'focus')?.value ?? '25%',
    },
    { id: 'agents', label: 'AGENTS', value: `${onlineCount}/${agents.length}` },
  ];

  return (
    <div className="space-y-[var(--vestara-spacing-3)] p-[var(--vestara-spacing-4)]">
      <div className="rounded-[var(--vestara-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-4)]">
        <div className="flex items-center gap-[var(--vestara-spacing-2)]">
          <span className="text-[length:var(--vestara-font-size-xs)] tracking-[0.2em] text-[var(--ds-text-muted)]">
            WORKSPACE OVERVIEW
          </span>
          <span className="rounded border border-[var(--ds-success)] bg-[var(--ds-success-bg)] px-[var(--vestara-spacing-1)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-success)]">
            {overviewPackageFixture.healthLabel}
          </span>
          {error ? (
            <span className="rounded border border-[var(--ds-warning)] bg-[var(--ds-warning-bg)] px-[var(--vestara-spacing-1)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-warning)]">
              Snapshot
            </span>
          ) : null}
          <span className="ml-auto">
            <PackageGhostButton label="Reload workspace overview" onClick={() => void refetch()}>
              Reload
            </PackageGhostButton>
          </span>
        </div>
        <div className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-2xl)] leading-none font-medium tracking-tight text-[var(--ds-text)] [font-family:var(--ds-font-serif)]">
          {overviewPackageFixture.heading}
        </div>
        <div className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
          {workspace.name} · {agents.length} agents · {workspace.description}
        </div>
      </div>
      {isLoading && onlineCount === 0 ? (
        <PackageSkeleton count={4} label="Loading workspace overview" />
      ) : (
      <div className="ds-cards ds-cards-3col-wide grid gap-[var(--vestara-spacing-2)]" aria-busy={isLoading}>
        {stats.map((stat) => (
          <div
            key={stat.id}
            className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-2)]"
          >
            <div className="text-[length:var(--vestara-font-size-xs)] tracking-[0.15em] text-[var(--ds-text-muted)]">
              {stat.label}
            </div>
            <div className="text-[length:var(--vestara-font-size-sm)] font-medium text-[var(--ds-text)]">
              {stat.value}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
