/**
 * VES-OVERVIEW-001: Overview Screen Component
 *
 * v2 dark-premium composition mirroring assets/vestara-overview-02-screen.png:
 * hero banner, 5 quick actions, 3-column premium grid.
 *
 * Renders unwrapped (no PageShell): ShellLayout's PageContainer owns
 * max-width and gutters, AppHeader/PageHeader owns the visible title.
 * Gallery chamber, skeletons, and banners reuse the Marketplace's own
 * mpg-* styles/components directly.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 */

import { AgentStatus } from './components/AgentStatus';
import { ContinueWorking } from './components/ContinueWorking';
import { InspirationCard } from './components/InspirationCard';
import { MarketplaceSpotlight } from './components/MarketplaceSpotlight';
import { OverviewHero } from './components/OverviewHero';
import { ProjectsSummary } from './components/ProjectsSummary';
import { QuickActions } from './components/QuickActions';
import { RecentActivity } from './components/RecentActivity';
import { SystemResources } from './components/SystemResources';
import { TodayFocus } from './components/TodayFocus';
import { AssetGridSkeleton, InsightBanner } from '../../pages/Marketplace/MarketplaceLayout-components.js';
import { useOverview } from './hooks/useOverview';
import '../../styles/marketplace.css';
import './overview.tokens.css';

function LoadingSkeleton() {
  // Mirrors the loaded layout breakpoints to avoid layout shift.
  return (
    <div className="w-full min-w-0 space-y-4" role="status" aria-live="polite" aria-label="Loading overview">
        <div className="mpg-skeleton h-44" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="mpg-skeleton h-16" />
          ))}
        </div>
        <AssetGridSkeleton count={3} />
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
        />
        <QuickActions />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Column 1 */}
          <div className="min-w-0 space-y-4">
            <ContinueWorking items={data.continueWorking} />
            <ProjectsSummary projects={data.projects} />
          </div>

          {/* Column 2 */}
          <div className="min-w-0 space-y-4">
            <RecentActivity items={data.recentActivity} />
            <SystemResources resources={data.resources} />
            <MarketplaceSpotlight items={data.marketplace} />
          </div>

          {/* Column 3 */}
          <div className="min-w-0 space-y-4">
            <AgentStatus agents={data.agents} />
            <InspirationCard />
            <TodayFocus items={data.focus} />
          </div>
        </div>
      </div>
    </>
  );
}
