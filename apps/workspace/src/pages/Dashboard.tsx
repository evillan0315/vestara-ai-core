import { useCallback, useEffect, useRef, useState } from 'react';
import WorkflowPipeline from '../components/WorkflowPipeline';
import {
  ActiveSessionWidget,
  AgentUtilizationWidget,
  BackgroundServicesWidget,
  RepoHealthWidget,
  BuildToolsWidget,
} from '../components/OperationalWidgets';
import { useDashboardData } from './Dashboard/useDashboardData';
import { useDashboardLayout } from './Dashboard/useDashboardLayout';
import { useSectionRenderer } from './Dashboard/useSectionRenderer';
import DashboardHeader from './Dashboard/DashboardHeader';

export default function Dashboard() {
  const data = useDashboardData();
  const layout = useDashboardLayout();
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
        body: JSON.stringify({ goal: workflowGoal, workflowType }),
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

  if (data.error) return <div className="w-full px-4 py-8 text-center text-red-400">{data.error}</div>;

  return (
    <div className="w-full px-4" data-dragging={layout.dragId ? 'true' : undefined}>
      {/* Header */}
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

      {/* Workflow Pipeline */}
      {data.activeSession && <WorkflowPipeline session={data.activeSession} compact={false} />}

      {/* Operational Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <ActiveSessionWidget sessions={data.execSessions} agents={data.agents} />
        <AgentUtilizationWidget agents={data.agents} execSessions={data.execSessions} />
        <BackgroundServicesWidget execSessions={data.execSessions} />
        <RepoHealthWidget workspace={data.workspace} execStats={data.execStats} />
        <BuildToolsWidget onRunBuildScripts={() => window.open('https://github.com/actions', '_blank')} />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
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

        {/* Right sidebar */}
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
    </div>
  );
}
