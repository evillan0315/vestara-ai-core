import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActiveSessionWidget,
  AgentUtilizationWidget,
  BackgroundServicesWidget,
  BuildToolsWidget,
  RepoHealthWidget,
} from '../components/OperationalWidgets';
import ProjectCreateDialog from '../components/ProjectCreateDialog';
import WorkflowPipeline from '../components/WorkflowPipeline';
import WorkspaceContinuityCard, { type ContinuityContext } from '../components/WorkspaceContinuityCard';
import DashboardHeader from './Dashboard/DashboardHeader';
import { useDashboardData } from './Dashboard/useDashboardData';
import { useDashboardLayout } from './Dashboard/useDashboardLayout';
import { useSectionRenderer } from './Dashboard/useSectionRenderer';

function useContinuity(data: ReturnType<typeof useDashboardData>): {
  context: ContinuityContext | null;
  loading: boolean;
  dismiss: () => void;
} {
  const storageKey = 'vestara-continuity-dismissed';
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === 'true');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!data.loading && !loaded) {
      setLoaded(true);
    }
  }, [data.loading, loaded]);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(storageKey, 'true');
  };

  if (dismissed || !loaded || data.loading) return { context: null, loading: data.loading, dismiss };

  const lastEvent = data.events[0];
  const projectName = data.workspace?.name || 'workspace';
  const decisionCount = data.events.filter((e) => e.type === 'decision.saved').length;
  const milestoneCount = data.milestones?.milestones?.length ?? 0;

  const context: ContinuityContext = {
    workspaceName: projectName,
    lastMilestone: milestoneCount > 0 ? 'In progress' : 'Initialized',
    nextRecommended: data.suggestions?.[0]?.title || 'Continue development',
    decisionCount,
    lastActive: lastEvent?.timestamp ? new Date(lastEvent.timestamp).toLocaleDateString() : 'today',
  };

  return {
    context: data.events.length > 0 ? context : null,
    loading: false,
    dismiss,
  };
}

export default function Dashboard() {
  const [tab, setTab] = useState(0);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const data = useDashboardData();
  const layout = useDashboardLayout();
  const { context: continuityContext, loading: continuityLoading, dismiss: dismissContinuity } = useContinuity(data);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showWorkflowPicker, setShowWorkflowPicker] = useState(false);
  const [workflowGoal, setWorkflowGoal] = useState('');
  const [workflowType, setWorkflowType] = useState('feature');
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [newEventFlash, setNewEventFlash] = useState(false);
  const autoRefInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const prevCount = useRef(data.events.length);
  useEffect(() => {
    if (data.events.length > prevCount.current) {
      setNewEventFlash(true);
      setTimeout(() => setNewEventFlash(false), 1500);
    }
    prevCount.current = data.events.length;
  }, [data.events.length]);

  useEffect(() => {
    if (autoRefresh) {
      autoRefInterval.current = setInterval(data.refresh, 30_000);
    } else if (autoRefInterval.current) {
      clearInterval(autoRefInterval.current);
      autoRefInterval.current = null;
    }
    return () => {
      if (autoRefInterval.current) clearInterval(autoRefInterval.current);
    };
  }, [autoRefresh, data.refresh]);

  const dragWrap = useCallback(
    (id: string) => ({
      dragSection: {
        id,
        isDragOver: layout.dragOverId === id,
        ...layout.dragHandle(id),
        ...layout.droppable(id),
      },
      style: { order: layout.getIdx(id) },
    }),
    [layout],
  );

  const { renderSection } = useSectionRenderer({
    data,
    dragWrap,
    expandedEra: layout.expandedEra,
    onToggleEra: (era: string) => layout.setExpandedEra(layout.expandedEra === era ? null : era),
    collapsedSections: layout.collapsedSections,
    onToggleSection: layout.toggleSection,
    autoRefreshIntervalActive: autoRefInterval.current !== null,
  });

  const startWorkflow = async () => {
    if (!workflowGoal.trim()) return;
    try {
      await fetch('/api/sessions/executions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: workflowGoal, workflow: workflowType }),
      });
      setShowWorkflowPicker(false);
      setWorkflowGoal('');
    } catch {
      // Workflow start failed silently
    }
  };

  if (data.loading)
    return (
      <div className="w-full px-4 animate-pulse">
        <div className="mb-4">
          <div className="h-8 w-64 bg-zinc-800 rounded mb-2" />
          <div className="h-4 w-48 bg-zinc-800/50 rounded" />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 bg-zinc-800/30 rounded-lg" />
          ))}
        </div>
      </div>
    );

  if (data.error) return <div className="w-full px-4 py-8 text-center text-(--vestara-red)">{data.error}</div>;

  return (
    <div className="w-full px-4" data-dragging={layout.dragId ? 'true' : undefined}>
      <DashboardHeader
        workspace={data.workspace}
        agents={data.agents}
        connected={data.connected}
        events={data.events}
        lastRefresh={data.lastRefresh}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
        onRefresh={data.refresh}
        showSectionPicker={showSectionPicker}
        onToggleSectionPicker={() => setShowSectionPicker((v) => !v)}
        sectionOrder={layout.sectionOrder}
        sectionVisibility={layout.sectionVisibility}
        onToggleVisibility={layout.toggleVisibility}
        execStats={data.execStats}
        activityStats={data.activityStats}
        milestones={data.milestones}
        execSessions={data.execSessions}
        onStartWorkflow={() => setShowWorkflowPicker(true)}
      />

      {/* Tab bar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-0.5 bg-zinc-800/50 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setTab(0)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${tab === 0 ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => setTab(1)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${tab === 1 ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            System
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowProjectDialog(true)}
          className="flex items-center gap-1 text-xs px-3 py-1.5 accent-btn rounded cursor-pointer"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-label="Add"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Project
        </button>
      </div>

      {/* Home tab */}
      {tab === 0 && (
        <>
          <WorkspaceContinuityCard
            context={continuityContext}
            loading={continuityLoading}
            onContinue={() => {
              if (continuityContext?.nextRecommended) {
                setWorkflowGoal(continuityContext.nextRecommended);
                setShowWorkflowPicker(true);
              }
            }}
            onDismiss={dismissContinuity}
          />

          {data.activeSession && <WorkflowPipeline session={data.activeSession} compact={false} />}

          {/* Main content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col gap-6">
              {layout.sectionOrder
                .filter((id: string) => layout.isLeft(id) && layout.sectionVisibility[id] !== false)
                .map((id: string) => {
                  const node = renderSection(id);
                  if (!node) return null;
                  return (
                    <div key={id} className="dash-section" style={{ order: layout.getIdx(id) }}>
                      {node}
                    </div>
                  );
                })}
            </div>
            <div className="flex flex-col gap-6">
              {layout.sectionOrder
                .filter((id: string) => !layout.isLeft(id) && layout.sectionVisibility[id] !== false)
                .map((id: string) => {
                  const node = renderSection(id);
                  if (!node) return null;
                  return (
                    <div key={id} className="dash-section" style={{ order: layout.getIdx(id) }}>
                      {node}
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}

      {/* System tab */}
      {tab === 1 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <ActiveSessionWidget sessions={data.execSessions} agents={data.agents} />
          <AgentUtilizationWidget agents={data.agents} execSessions={data.execSessions} />
          <BackgroundServicesWidget execSessions={data.execSessions} />
          <RepoHealthWidget workspace={data.workspace} execStats={data.execStats} />
          <BuildToolsWidget onRunBuildScripts={() => window.open('https://github.com/actions', '_blank')} />
        </div>
      )}

      <ProjectCreateDialog
        open={showProjectDialog}
        onClose={() => setShowProjectDialog(false)}
        onCreated={() => {
          data.refresh();
        }}
      />
    </div>
  );
}
