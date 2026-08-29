/**
 * Diagnostic Center — main page.
 *
 * Toolbar (refresh, interval, pause, export, AI analyze) · overview cards ·
 * live charts · tabbed details panels. Wrapped in DiagnosticsProvider.
 */

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useEffect, useState } from 'react';
import { diagnosticsApi, formatBytes } from '../../lib/diagnostics';
import { AgentMonitor } from './AgentMonitor';
import { AiAnalyze } from './AiAnalyze';
import { HistoryChart, Meter } from './charts';
import type { DiagTab } from './DiagnosticsContext';
import { DiagnosticsProvider, INTERVAL_OPTIONS, useDiagnostics } from './DiagnosticsContext';
import { DockerPanel } from './DockerPanel';
import { EnvPanel } from './EnvPanel';
import { GitPanel } from './GitPanel';
import { HealthPanel } from './HealthPanel';
import { LogViewer } from './LogViewer';
import { OverviewCards } from './OverviewCards';
import { ProcessExplorer } from './ProcessExplorer';
import { StoragePanel } from './StoragePanel';
import { SystemInfo } from './SystemInfo';
import '../../styles/diagnostics.css';

const TABS: Array<{ id: DiagTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'processes', label: 'Processes' },
  { id: 'storage', label: 'Storage' },
  { id: 'docker', label: 'Docker' },
  { id: 'git', label: 'Git' },
  { id: 'environment', label: 'Environment' },
  { id: 'agents', label: 'Agents' },
  { id: 'logs', label: 'Logs' },
  { id: 'health', label: 'Health' },
];

function DiagnosticsPageInner() {
  const diag = useDiagnostics();
  const [aiOpen, setAiOpen] = useState(false);
  const { summary, cpuHistory, memHistory } = diag;

  useEffect(() => {
    if (summary?.alerts?.length) {
      // Surface critical alerts into the document title as a subtle badge.
      document.title = `Diagnostics · ${summary.alerts.filter((a) => a.severity === 'critical').length} critical`;
      return () => {
        document.title = 'Vestara Workspace';
      };
    }
  }, [summary?.alerts]);

  const exportReport = async () => {
    const [processes, events] = await Promise.all([
      diagnosticsApi.processes({ limit: 1500 }),
      diagnosticsApi.events({ limit: 200 }),
    ]);
    const report = {
      generatedAt: new Date().toISOString(),
      summary,
      processes: processes?.processes,
      events: events?.events,
      agents: diag.agents,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vestara-diagnostics-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cpuColor =
    (summary?.cpu.usage ?? 0) > 90
      ? 'var(--vestara-red, #f87171)'
      : (summary?.cpu.usage ?? 0) > 75
        ? 'var(--vestara-amber, #f59e0b)'
        : 'var(--vestara-accent, #f59e0b)';
  const memColor =
    summary && (summary.memory.used / Math.max(1, summary.memory.total)) * 100 > 90
      ? 'var(--vestara-red, #f87171)'
      : 'var(--vestara-blue, #60a5fa)';

  return (
    <div className="diag-page h-[calc(100vh-7rem)]">
      {/* Toolbar */}
      <div className="diag-toolbar">
        <div className="flex items-center gap-2">
          <span className="diag-title">Diagnostic Center</span>
          {summary && (
            <span className="diag-subtitle">
              {summary.os.hostname} · {summary.workspace.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="diag-icon-btn"
            onClick={diag.togglePause}
            title={diag.paused ? 'Resume' : 'Pause'}
            aria-label={diag.paused ? 'Resume live updates' : 'Pause live updates'}
          >
            {diag.paused ? <PlayArrowRoundedIcon fontSize="inherit" /> : <PauseRoundedIcon fontSize="inherit" />}
          </button>
          <select
            value={diag.interval}
            onChange={(e) => diag.setInterval(Number(e.target.value))}
            className="diag-input"
            aria-label="Refresh interval"
            title="Refresh interval"
          >
            {INTERVAL_OPTIONS.map((ms) => (
              <option key={ms} value={ms}>
                {(ms / 1000).toFixed(ms >= 1000 ? 0 : 1)}s
              </option>
            ))}
          </select>
          <button
            type="button"
            className="diag-icon-btn"
            onClick={diag.refreshAll}
            title="Refresh now"
            aria-label="Refresh now"
          >
            <RefreshRoundedIcon fontSize="inherit" />
          </button>
          <button type="button" className="diag-btn" onClick={exportReport} title="Export diagnostics report">
            <DownloadRoundedIcon fontSize="inherit" /> Report
          </button>
          <button
            type="button"
            className="diag-btn diag-btn-primary"
            onClick={() => setAiOpen(true)}
            title="AI diagnostics analysis"
          >
            <AutoAwesomeRoundedIcon fontSize="inherit" /> AI
          </button>
        </div>
      </div>

      <div className="diag-scroll">
        <div className="diag-content">
          {/* Overview cards */}
          <OverviewCards />

          {/* Live charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <div className="diag-card diag-card-body">
              <div className="flex items-center justify-between">
                <div className="diag-section-title">CPU Usage</div>
                <span className="diag-big-value" style={{ color: cpuColor }}>
                  {summary ? `${Math.round(summary.cpu.usage)}%` : '…'}
                </span>
              </div>
              <HistoryChart points={cpuHistory} color={cpuColor} label="Live · last 60 samples" />
              {summary && (
                <div className="mt-1 grid grid-cols-3 gap-2">
                  <Meter
                    label="Load 1m"
                    value={(summary.cpu.loadAvg[0] / summary.cpu.logicalCores) * 100}
                    display={String(summary.cpu.loadAvg[0])}
                  />
                  <Meter
                    label="Load 5m"
                    value={(summary.cpu.loadAvg[1] / summary.cpu.logicalCores) * 100}
                    display={String(summary.cpu.loadAvg[1])}
                  />
                  <Meter
                    label="Load 15m"
                    value={(summary.cpu.loadAvg[2] / summary.cpu.logicalCores) * 100}
                    display={String(summary.cpu.loadAvg[2])}
                  />
                </div>
              )}
            </div>
            <div className="diag-card diag-card-body">
              <div className="flex items-center justify-between">
                <div className="diag-section-title">Memory Usage</div>
                <span className="diag-big-value" style={{ color: memColor }}>
                  {summary ? `${Math.round((summary.memory.used / Math.max(1, summary.memory.total)) * 100)}%` : '…'}
                </span>
              </div>
              <HistoryChart points={memHistory} color={memColor} label="Live · last 60 samples" />
              {summary && (
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Meter
                    label="Swap"
                    value={(summary.memory.swapUsed / Math.max(1, summary.memory.swapTotal)) * 100}
                    display={formatBytes(summary.memory.swapUsed)}
                  />
                  <Meter
                    label="Cached"
                    value={(summary.memory.cached / Math.max(1, summary.memory.total)) * 100}
                    display={formatBytes(summary.memory.cached)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="diag-tabs" role="tablist" aria-label="Diagnostics sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={diag.activeTab === t.id}
                className={`diag-tab ${diag.activeTab === t.id ? 'diag-tab-active' : ''}`}
                onClick={() => diag.setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {diag.activeTab === 'overview' && <SystemInfo />}
          {diag.activeTab === 'processes' && <ProcessExplorer />}
          {diag.activeTab === 'storage' && <StoragePanel />}
          {diag.activeTab === 'docker' && <DockerPanel />}
          {diag.activeTab === 'git' && <GitPanel />}
          {diag.activeTab === 'environment' && <EnvPanel />}
          {diag.activeTab === 'agents' && <AgentMonitor />}
          {diag.activeTab === 'logs' && <LogViewer />}
          {diag.activeTab === 'health' && <HealthPanel />}
        </div>
      </div>

      <AiAnalyze open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}

export default function DiagnosticsPage() {
  return (
    <DiagnosticsProvider>
      <DiagnosticsPageInner />
    </DiagnosticsProvider>
  );
}
