/**
 * VES-OVERVIEW-001: Overview Screen Component
 *
 * Compact composition: hero banner, 4 quick actions, 2-column grid.
 * Default: left TodayFocus + ContinueWorking + RecentActivity (act order),
 * right MilestonesSummary + SystemStatus (status order). Columns are
 * user-rearrangeable (drag + keyboard) and persisted via useOverviewLayout.
 *
 * Renders unwrapped (no PageShell): ShellLayout's PageContainer owns
 * max-width and gutters, AppHeader/PageHeader owns the visible title.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 */

import type { ReactNode } from 'react';
import { ContinueWorking } from './components/ContinueWorking';
import { MilestonesSummary } from './components/MilestonesSummary';
import { OverviewHero } from './components/OverviewHero';
import { QuickActions } from './components/QuickActions';
import { RecentActivity } from './components/RecentActivity';
import { SortablePanel } from './components/SortablePanel';
import { SystemStatus } from './components/SystemStatus';
import { TodayFocus } from './components/TodayFocus';
import { WorkspaceHealth } from './components/WorkspaceHealth';
import { CodexRuntimeActivityCard } from '../../components/codex/CodexRuntimeActivityCard';
import { InsightBanner } from '../../pages/Marketplace/MarketplaceLayout-components.js';
import { useOverview } from './hooks/useOverview';
import { useOverviewLayout, type OverviewPanelId } from './hooks/useOverviewLayout';
import { useMorningBriefing } from '../../hooks/useMorningBriefing';
import '../../styles/marketplace.css';
import './overview.tokens.css';

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
  const { layout, move, moveAcross, reset } = useOverviewLayout();

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

  const focusDone = data.focus.filter((f) => f.completed).length;
  const focusPct = data.focus.length ? Math.round((focusDone / data.focus.length) * 100) : 0;

  const panels: Record<OverviewPanelId, ReactNode> = {
    todayFocus: <TodayFocus items={data.focus} />,
    continueWorking: <ContinueWorking items={data.continueWorking} />,
    recentActivity: <RecentActivity items={data.recentActivity} />,
    milestones: <MilestonesSummary />,
    systemStatus: <SystemStatus agents={data.agents} resources={data.resources} />,
    workspaceHealth: <WorkspaceHealth health={data.health} />,
  };

  function handleDropOnColumn(toColumn: 'left' | 'right', toIndex: number, draggedId: string) {
    const fromColumn: 'left' | 'right' | null = layout.left.includes(draggedId as OverviewPanelId)
      ? 'left'
      : layout.right.includes(draggedId as OverviewPanelId)
        ? 'right'
        : null;
    if (!fromColumn) return;
    const fromIndex = layout[fromColumn].indexOf(draggedId as OverviewPanelId);
    if (fromColumn === toColumn) {
      if (fromIndex === toIndex) return;
      move(toColumn, fromIndex, toIndex > fromIndex ? 1 : -1);
      return;
    }
    moveAcross(fromColumn, fromIndex, toColumn, toIndex);
  }

  function renderColumn(column: 'left' | 'right') {
    const ids = layout[column];
    return (
      <div
        className="min-w-0 space-y-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dragged = e.dataTransfer.getData('text/vestara-panel');
          if (dragged && !(layout[column] as readonly string[]).includes(dragged)) {
            const from: 'left' | 'right' = column === 'left' ? 'right' : 'left';
            const fromIndex = (layout[from] as readonly string[]).indexOf(dragged);
            if (fromIndex >= 0) moveAcross(from, fromIndex, column, ids.length);
          }
        }}
      >
        {ids.map((id, index) => (
          <SortablePanel
            key={id}
            panelId={id}
            column={column}
            index={index}
            isFirst={index === 0}
            isLast={index === ids.length - 1}
            onMove={move}
            onDropOnColumn={handleDropOnColumn}
          >
            {panels[id]}
          </SortablePanel>
        ))}
      </div>
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
            focusPct,
          }}
          briefing={morningBriefing}
          briefingLoading={morningLoading}
        />
        <QuickActions />
        <CodexRuntimeActivityCard />

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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {renderColumn('left')}
          {renderColumn('right')}
        </div>
      </div>
    </>
  );
}
