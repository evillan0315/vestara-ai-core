/**
 * Execution Center — main page.
 *
 * Toolbar (project scope, filters, pause, export, AI) · overview cards ·
 * pipeline timeline · tabbed operational views. Wrapped in ExecutionProvider.
 */

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useState } from 'react';
import { AgentsPanel } from './agents';
import { ExecutionAnalyze } from './analyze';
import { ApprovalsPanel, ArtifactsPanel } from './artifacts';
import type { ExecutionTab } from './ExecutionContext';
import { ExecutionProvider, INTERVAL_OPTIONS, useExecution } from './ExecutionContext';
import { ExecutionsPanel } from './executions';
import { EventsPanel, FilesystemPanel } from './filesystem';
import { MetricsPanel, OverviewCards } from './overview';
import { PipelineTimeline } from './pipeline';
import { PlansPanel, TasksPanel } from './plans';
import { ProjectsPanel } from './projects';
import { TraceabilityPanel } from './traceability';
import '../../styles/execution.css';

const TABS: Array<{ id: ExecutionTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects' },
  { id: 'plans', label: 'Plans' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'agents', label: 'Agents' },
  { id: 'executions', label: 'Executions' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'filesystem', label: 'Filesystem' },
  { id: 'events', label: 'Events' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'traceability', label: 'Traceability' },
];

function ExecutionPageInner() {
  const exec = useExecution();
  const [aiOpen, setAiOpen] = useState(false);

  const exportReport = () => {
    const dashboard = exec.dashboard;
    if (!dashboard) return;
    const report = {
      generatedAt: new Date().toISOString(),
      metrics: dashboard.metrics,
      queueSummary: dashboard.queueSummary,
      plans: dashboard.plans,
      sessions: dashboard.sessions,
      agents: dashboard.agents,
      executions: dashboard.executions,
      approvals: dashboard.approvals,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vestara-execution-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="exec-page h-[calc(100vh-7rem)]">
      <div className="exec-toolbar">
        <div className="flex items-center gap-2">
          <span className="exec-title">Execution Center</span>
          {exec.dashboard && (
            <span className="exec-subtitle">
              {exec.dashboard.sessions.length} sessions · {exec.dashboard.queue.length} queue items
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="exec-icon-btn"
            onClick={exec.togglePause}
            title={exec.paused ? 'Resume' : 'Pause'}
            aria-label={exec.paused ? 'Resume live updates' : 'Pause live updates'}
          >
            {exec.paused ? <PlayArrowRoundedIcon fontSize="inherit" /> : <PauseRoundedIcon fontSize="inherit" />}
          </button>
          <select
            value={exec.interval}
            onChange={(e) => exec.setInterval(Number(e.target.value))}
            className="exec-input"
            aria-label="Refresh interval"
            title="Refresh interval"
          >
            {INTERVAL_OPTIONS.map((ms) => (
              <option key={ms} value={ms}>
                {(ms / 1000).toFixed(0)}s
              </option>
            ))}
          </select>
          <button
            type="button"
            className="exec-icon-btn"
            onClick={exec.refresh}
            title="Refresh now"
            aria-label="Refresh now"
          >
            <RefreshRoundedIcon fontSize="inherit" />
          </button>
          <button type="button" className="exec-btn" onClick={exportReport} title="Export execution report">
            <DownloadRoundedIcon fontSize="inherit" /> Report
          </button>
          <button
            type="button"
            className="exec-btn exec-btn-primary"
            onClick={() => setAiOpen(true)}
            title="AI execution analysis"
          >
            <AutoAwesomeRoundedIcon fontSize="inherit" /> AI
          </button>
        </div>
      </div>

      <div className="exec-scroll">
        <div className="exec-content">
          <OverviewCards />

          <PipelineTimeline />

          <div className="exec-tabs" role="tablist" aria-label="Execution sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={exec.activeTab === t.id}
                className={`exec-tab ${exec.activeTab === t.id ? 'exec-tab-active' : ''}`}
                onClick={() => exec.setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {exec.activeTab === 'overview' && <MetricsPanel />}
          {exec.activeTab === 'projects' && <ProjectsPanel />}
          {exec.activeTab === 'plans' && <PlansPanel />}
          {exec.activeTab === 'tasks' && <TasksPanel />}
          {exec.activeTab === 'agents' && <AgentsPanel />}
          {exec.activeTab === 'executions' && <ExecutionsPanel />}
          {exec.activeTab === 'artifacts' && <ArtifactsPanel />}
          {exec.activeTab === 'approvals' && <ApprovalsPanel />}
          {exec.activeTab === 'filesystem' && <FilesystemPanel />}
          {exec.activeTab === 'events' && <EventsPanel />}
          {exec.activeTab === 'metrics' && <MetricsPanel />}
          {exec.activeTab === 'traceability' && <TraceabilityPanel />}
        </div>
      </div>

      <ExecutionAnalyze open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}

export default function ExecutionPage() {
  return (
    <ExecutionProvider>
      <ExecutionPageInner />
    </ExecutionProvider>
  );
}
