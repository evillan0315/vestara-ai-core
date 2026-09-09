/**
 * VES-OVERVIEW-001: Overview Screen Component
 *
 * Main overview screen that composes all sections.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useOverview } from '../hooks/useOverview';
import { OverviewHero } from './OverviewHero';
import { QuickActions } from './QuickActions';
import { ContinueWorking } from './ContinueWorking';
import { AgentStatus } from './AgentStatus';
import { SystemResources } from './SystemResources';
import { TodayFocus } from './TodayFocus';

export function OverviewScreen() {
  const { data, isLoading, error } = useOverview();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--vestara-accent-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-[var(--vestara-text-muted)]">Loading overview…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-[var(--vestara-text-primary)]">
            Failed to load overview
          </h2>
          <p className="mt-2 text-sm text-[var(--vestara-text-muted)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-4xl mb-4">📭</div>
          <h2 className="text-lg font-semibold text-[var(--vestara-text-primary)]">
            No data available
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Screen reader heading */}
      <h1 className="sr-only">Overview</h1>

      <div className="space-y-6">
        {/* Workspace Hero */}
        <OverviewHero workspace={data.workspace} />

        {/* Quick Actions */}
        <QuickActions />

        {/* Two-column layout for main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Continue Working + Recent Activity */}
          <div className="lg:col-span-2 space-y-6">
            <ContinueWorking items={data.continueWorking} />
            <AgentStatus agents={data.agents} />
          </div>

          {/* Right column: System Resources + Focus */}
          <div className="space-y-6">
            <SystemResources resources={data.resources} />
            <TodayFocus items={data.focus} />
          </div>
        </div>
      </div>
    </div>
  );
}
