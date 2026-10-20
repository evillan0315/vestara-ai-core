/**
 * VES-OVERVIEW-001: Overview Screen Component
 *
 * Compact composition: hero banner, 4 quick actions, 2-column grid.
 * Default: left TodayFocus + ContinueWorking + RecentActivity (act order),
 * right MilestonesSummary + SystemStatus (status order). Columns are
 * user-rearrangeable (drag + keyboard) and persisted via useOverviewLayout.
 *
 * Uses the shared WorkspacePanelLayout and Settings-inspired hero/tab rhythm.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 */

import { lazy, Suspense, type ReactNode, useCallback, useMemo, useState } from 'react';
import { DraggableDashboard } from '../../components/dashboard/DraggableDashboard.js';
import { WorkspaceTabs } from '../../components/ui/WorkspaceTabs.js';
import { navIcon } from '../../layouts/workspace-navigation.js';
import { ContinueWorking } from './components/ContinueWorking';
import { CollabPrepCard } from './components/CollabPrepCard';
import { OverviewHero } from './components/OverviewHero';
import { QuickActions } from './components/QuickActions';
import { RecentActivity } from './components/RecentActivity';
import { SystemStatus } from './components/SystemStatus';
import { TodayFocus } from './components/TodayFocus';
import { WorkspaceHealth } from './components/WorkspaceHealth';
import { InsightBanner } from '@vestara/marketplace-ui';
import { useOverview } from './hooks/useOverview';
import { useOverviewLayout, type OverviewPanelId } from './hooks/useOverviewLayout';
import { overviewFixture } from './overview.fixtures';
import { useMorningBriefing } from '../../hooks/useMorningBriefing';
import WorkspacePanelLayout from '../../layouts/WorkspacePanelLayout';
import '../../styles/marketplace.css';
import './overview.tokens.css';

const MilestonesSummary = lazy(async () => {
  const module = await import('./components/MilestonesSummary');
  return { default: module.MilestonesSummary };
});

const WorkspaceSnapshot = lazy(async () => {
  const module = await import('./components/WorkspaceSnapshot');
  return { default: module.WorkspaceSnapshot };
});

function LoadingSkeleton() {
  // Mirrors the loaded layout breakpoints to avoid layout shift.
  return (
    <div className="w-full min-w-0 space-y-4" role="status" aria-live="polite" aria-label="Loading overview">
      <div className="mpg-skeleton h-44" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
          <div className="mpg-skeleton h-32" />
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
          <button type="button" onClick={onRetry} className="mpg-pill">
            Retry
          </button>
        }
      />
    </div>
  );
}

function PanelFallback() {
  return <div className="mpg-skeleton h-32" role="status" aria-label="Loading overview panel" />;
}

export function OverviewScreen() {
  const { data, isLoading, error, refetch } = useOverview();
  const { briefing: morningBriefing, loading: morningLoading } = useMorningBriefing();
  const { layout, move, moveAcross, reset } = useOverviewLayout();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'configuration'>('dashboard');
  const viewData = data ?? overviewFixture;
  const focusPct = useMemo(() => {
    const focusDone = viewData.focus.filter((f) => f.completed).length;
    return viewData.focus.length ? Math.round((focusDone / viewData.focus.length) * 100) : 0;
  }, [viewData.focus]);
  const panels = useMemo<Record<OverviewPanelId, ReactNode>>(
    () => ({
      collabPrep: <CollabPrepCard />,
      continueWorking: <ContinueWorking items={viewData.continueWorking} />,
      todayFocus: <TodayFocus items={viewData.focus} />,
      recentActivity: <RecentActivity items={viewData.recentActivity} />,
      milestones: (
        <Suspense fallback={<PanelFallback />}>
          <MilestonesSummary />
        </Suspense>
      ),
      systemStatus: <SystemStatus agents={viewData.agents} resources={viewData.resources} />,
      workspaceHealth: <WorkspaceHealth health={viewData.health} />,
    }),
    [viewData],
  );
  const renderPanel = useCallback((id: OverviewPanelId) => panels[id], [panels]);
  const handleMove = useCallback(
    (column: string, index: number, direction: -1 | 1) => move(column as 'left' | 'right', index, direction),
    [move],
  );
  const handleMoveAcross = useCallback(
    (from: string, fromIndex: number, to: string, toIndex: number) =>
      moveAcross(from as 'left' | 'right', fromIndex, to as 'left' | 'right', toIndex),
    [moveAcross],
  );

  // min-w-0 on grid columns keeps long content from blowing out the grid on
  // narrow viewports.
  if (isLoading) {
    return (
      <WorkspacePanelLayout>
        <h1 className="sr-only">Overview</h1>
        <LoadingSkeleton />
      </WorkspacePanelLayout>
    );
  }

  if (!data) {
    return (
      <WorkspacePanelLayout>
        <h1 className="sr-only">Overview</h1>
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="mb-4 text-4xl" aria-hidden="true">
              📭
            </div>
            <h2 className="text-lg font-semibold text-[var(--vestara-text-primary)]">No data available</h2>
          </div>
        </div>
      </WorkspacePanelLayout>
    );
  }

  return (
    <WorkspacePanelLayout>
      <div className="w-full min-w-0 space-y-4">
        <h1 className="sr-only">Overview</h1>
        {error && <SnapshotBanner onRetry={() => void refetch()} />}

        <OverviewHero
          workspace={data.workspace}
          stats={{ focusPct }}
          briefing={morningBriefing}
          briefingLoading={morningLoading}
        />
        <WorkspaceTabs
          tabs={[
            {
              id: 'dashboard',
              label: 'Dashboard',
              shortLabel: 'Dashboard',
              icon: navIcon('dashboard'),
              borderBottom: false,
            },
            {
              id: 'configuration',
              label: 'Configuration',
              shortLabel: 'Config',
              icon: navIcon('settings'),
              borderBottom: false,
            },
          ]}
          activeTab={activeTab}
          onTabChange={(tabId) => setActiveTab(tabId as 'dashboard' | 'configuration')}
          ariaLabel="Overview sections"
        />
        {activeTab === 'dashboard' ? (
          <div className="space-y-[var(--vestara-spacing-section)]">
            <QuickActions />
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={reset}
                title="Reset panel layout to default"
                className="text-[11px] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
              >
                Reset layout
              </button>
            </div>
            <DraggableDashboard
              columns={[
                { id: 'left', items: layout.left },
                { id: 'right', items: layout.right },
              ]}
              renderItem={renderPanel}
              onMove={handleMove}
              onMoveAcross={handleMoveAcross}
              getItemLabel={(id) => id.replace(/([A-Z])/g, ' $1')}
            />
          </div>
        ) : (
            <Suspense fallback={<PanelFallback />}>
              <WorkspaceSnapshot />
            </Suspense>
        )}
      </div>
    </WorkspacePanelLayout>
  );
}
