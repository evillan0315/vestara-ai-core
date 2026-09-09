/**
 * VES-OVERVIEW-001: Overview Hero Component
 *
 * Welcome statement, workspace name, health indicator.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { OverviewWorkspaceSummary } from '../overview.types';

interface OverviewHeroProps {
  workspace: OverviewWorkspaceSummary;
}

const HEALTH_STYLES = {
  healthy: { dot: 'bg-emerald-400', label: 'Healthy' },
  degraded: { dot: 'bg-amber-400', label: 'Degraded' },
  error: { dot: 'bg-red-400', label: 'Error' },
};

export function OverviewHero({ workspace }: OverviewHeroProps) {
  const healthStyle = HEALTH_STYLES[workspace.health];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--vestara-accent-primary)]/10 via-[var(--vestara-surface-panel)] to-[var(--vestara-surface-canvas)] border border-[var(--vestara-border-subtle)] p-8">
      {/* Background decoration */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-[var(--vestara-accent-primary)]/5 rounded-full blur-3xl" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-[var(--vestara-accent-primary)]/3 rounded-full blur-2xl" />

      <div className="relative z-10">
        <h1 className="text-3xl font-bold text-[var(--vestara-text-primary)] tracking-tight">
          Welcome to Vestara
        </h1>
        <p className="mt-2 text-lg text-[var(--vestara-text-secondary)]">
          Build Without Limits
        </p>
        <p className="mt-1 text-sm text-[var(--vestara-text-muted)]">
          Agents. Workflows. Tools. A more capable you.
        </p>

        <div className="mt-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${healthStyle.dot}`} />
            <span className="text-sm text-[var(--vestara-text-secondary)]">
              {workspace.name}
            </span>
          </div>
          <span className="text-[var(--vestara-text-muted)]">·</span>
          <span className="text-sm text-[var(--vestara-text-muted)]">
            {healthStyle.label}
          </span>
          <span className="text-[var(--vestara-text-muted)]">·</span>
          <span className="text-sm text-[var(--vestara-text-muted)]">
            Last activity: {new Date(workspace.lastActivity).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}
