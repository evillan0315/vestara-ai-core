/**
 * VES-OVERVIEW-001: Overview Screen Component
 *
 * Compact composition: hero banner, 4 quick actions, 2-column grid.
 * Column 1: ContinueWorking + TodayFocus (action-oriented).
 * Column 2: RecentActivity + SystemResources + AgentStatus (status-oriented).
 *
 * Renders unwrapped (no PageShell): ShellLayout's PageContainer owns
 * max-width and gutters, AppHeader/PageHeader owns the visible title.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 */

import { AgentStatus } from './components/AgentStatus';
import { ContinueWorking } from './components/ContinueWorking';
import { MilestonesSummary } from './components/MilestonesSummary';
import { OverviewHero } from './components/OverviewHero';
import { QuickActions } from './components/QuickActions';
import { RecentActivity } from './components/RecentActivity';
import { SystemResources } from './components/SystemResources';
import { TodayFocus } from './components/TodayFocus';
import { InsightBanner } from '../../pages/Marketplace/MarketplaceLayout-components.js';
import { useOverview } from './hooks/useOverview';
import { useMorningBriefing } from '../../hooks/useMorningBriefing';
import '../../styles/marketplace.css';
import './overview.tokens.css';

function LoadingSkeleton() {
  // Mirrors the loaded layout breakpoints to avoid layout shift.
  return (
    <div className="w-full min-w-0 space-y-4" role="status" aria-live="polite" aria-label="Loading overview">
        <div className="mpg-skeleton h-44" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="mpg-skeleton h-16" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div className="mpg-skeleton h-32" />
            <div className="mpg-skeleton h-32" />
          </div>
          <div className="space-y-4">
            <div className="mpg-skeleton h-32" />
            <div className="mpg-skeleton h-16" />
            <div className="mpg-skeleton h-16" />
          </div>
        </div>
        <p className="sr-only">Loading workspace overview…</p>
    </div>
  );
}

function SnapshotBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mb-3">
      <InsightBanner
        severity="warning"
        description="Live data unavailable — showing cached snapshot."
        action={
          <button
            type="button"
            onClick={onRetry}
            className="mpg-pill"
          >
            Retry
          </button>
        }
      />
    </div>
  );
}

export function OverviewScreen() {
  const { data, isLoading, error, refetch } = useOverview();
  const { briefing: morningBriefing, loading: morningLoading } = useMorningBriefing();

  // min-w-0 on grid columns keeps long content from blowing out the grid on
  // narrow viewports.
  if (isLoading) {
    return (
      <>
        <h1 className="sr-only">Overview</h1>
        <LoadingSkeleton />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <h1 className="sr-only">Overview</h1>
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="mb-4 text-4xl" aria-hidden="true">
              📭
            </div>
            <h2 className="text-lg font-semibold text-[var(--vestara-text-primary)]">No data available</h2>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="sr-only">Overview</h1>
      {error && <SnapshotBanner onRetry={() => void refetch()} />}

      <div className="mb-4 w-full min-w-0 space-y-4 sm:mb-6">
        <OverviewHero
          workspace={data.workspace}
          stats={{
            projects: data.projects.length,
            agentsOnline: data.agents.filter((a) => a.status === 'online' || a.status === 'busy' || a.status === 'working').length,
            activeWork: data.continueWorking.length,
          }}
          briefing={morningBriefing}
          briefingLoading={morningLoading}
        />
        <QuickActions />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Column 1 — resume + act: highest scan priority */}
          <div className="min-w-0 space-y-4">
            <ContinueWorking items={data.continueWorking} />
            <TodayFocus items={data.focus} />
            <MilestonesSummary />
          </div>

          {/* Column 2 — activity + system status */}
          <div className="min-w-0 space-y-4">
            <RecentActivity items={data.recentActivity} />
            <SystemResources resources={data.resources} />
            <AgentStatus agents={data.agents} />
          </div>
        </div>
      </div>
    </>
  );
}
