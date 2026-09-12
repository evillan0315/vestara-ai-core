/**
 * Diagnostic Center — premium gallery page.
 *
 * Marketplace gallery composition: mpg-hero banner, instrument control
 * strip, metric grid, live charts, tabbed detail panels. Gallery
 * materials are the Marketplace's own mpg-* styles/components directly
 * (mpg-chamber intentionally omitted — the page renders unwrapped like
 * Overview; ShellLayout's PageContainer owns gutters).
 */

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AssetGridSkeleton,
  GalleryCard,
  InsightBanner,
  MarketplaceStatPill,
} from '../../pages/Marketplace/MarketplaceLayout-components.js';
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
import './diagnostics.tokens.css';
import '../../styles/diagnostics.css';
import '../../styles/marketplace.css';

const TABS: Array<{ id: DiagTab; label: string; glyph: string }> = [
  { id: 'overview', label: 'Overview', glyph: '◍' },
  { id: 'processes', label: 'Processes', glyph: '≡' },
  { id: 'storage', label: 'Storage', glyph: '▤' },
  { id: 'docker', label: 'Docker', glyph: '⬢' },
  { id: 'git', label: 'Git', glyph: '⎇' },
  { id: 'environment', label: 'Environment', glyph: '⚙' },
  { id: 'agents', label: 'Agents', glyph: '◉' },
  { id: 'logs', label: 'Logs', glyph: '☰' },
  { id: 'health', label: 'Health', glyph: '✓' },
];

function StatusDot({ color, label }: { color: string; label?: string }) {
  return (
    <span
      aria-hidden="true"
      title={label}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

function DiagnosticsHero({ onAnalyze, onExport }: { onAnalyze: () => void; onExport: () => void }) {
  const { summary, paused } = useDiagnostics();
  const critical = summary?.alerts.filter((a) => a.severity === 'critical').length ?? 0;
  const warnings = summary?.alerts.filter((a) => a.severity === 'warning').length ?? 0;
  const readiness = summary ? Math.round(summary.readiness) : null;
  const healthy = critical === 0;

  return (
    <section className="mpg-hero mpg-enter" aria-label="Diagnostics highlights">
      <div className="mpg-hero-copy">
        <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--vestara-marketplace-primary)]">
          <StatusDot color={paused ? 'var(--vestara-status-warning)' : 'var(--vestara-status-success)'} label={paused ? 'Paused' : 'Live'} />
          {paused ? 'Telemetry paused' : 'Live telemetry'}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--vestara-text-primary)] sm:text-4xl">
          Diagnostic Center
        </h1>
        <p className="mt-2 text-[15px] font-medium text-[var(--vestara-text-secondary)]">
          System health, processes, and signals — instrument-grade, at a glance.
        </p>
        <p className="mt-4 max-w-md text-[13px] italic leading-relaxed text-[var(--vestara-text-secondary)]">
          {summary
            ? `${summary.os.hostname} · ${summary.workspace.name} · ${summary.os.platform} ${summary.os.arch}`
            : 'Connecting to live system feeds…'}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" className="mpg-install-btn" onClick={onAnalyze} title="AI diagnostics analysis">
            <AutoAwesomeRoundedIcon fontSize="inherit" /> Analyze with AI
          </button>
          <button type="button" className="mpg-pill" onClick={onExport} title="Export diagnostics report">
            <DownloadRoundedIcon fontSize="inherit" /> Export report
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mpg-tag-pill" style={{ color: 'var(--vestara-text-secondary)' }}>
            <StatusDot color={healthy ? 'var(--vestara-status-success)' : 'var(--vestara-status-error)'} />
            {healthy ? 'Systems nominal' : `${critical} critical`}
          </span>
          {readiness !== null && (
            <MarketplaceStatPill label="ready" value={`${readiness}%`} />
          )}
          {summary && (
            <MarketplaceStatPill label="CPU" value={`${Math.round(summary.cpu.usage)}%`} />
          )}
          {warnings > 0 && (
            <MarketplaceStatPill label="warnings" value={warnings} color="text-[var(--vestara-status-warning)]" />
          )}
        </div>
      </div>
      <aside className="mpg-hero-checklist" aria-label="Signal snapshot">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vestara-marketplace-primary)]">
          Signal snapshot
        </p>
        <ul>
          <li>
            ◍ {summary ? `CPU ${Math.round(summary.cpu.usage)}% · ${summary.cpu.logicalCores} cores` : 'CPU …'}
          </li>
          <li>
            ▤{' '}
            {summary
              ? `Memory ${Math.round((summary.memory.used / Math.max(1, summary.memory.total)) * 100)}% · ${formatBytes(summary.memory.used)}`
              : 'Memory …'}
          </li>
          <li>
            ✓{' '}
            {summary != null
              ? `Health ${summary.health.filter((h) => h.status === 'pass').length}/${summary.health.length} checks pass`
              : 'Health …'}
          </li>
        </ul>
      </aside>
    </section>
  );
}

function ControlStrip() {
  const diag = useDiagnostics();
  return (
    <div className="mpg-side-card mpg-enter flex flex-wrap items-center gap-2" role="toolbar" aria-label="Telemetry controls" style={{ animationDelay: '60ms' }}>
      <button
        type="button"
        className="diag-icon-btn"
        onClick={diag.togglePause}
        title={diag.paused ? 'Resume live updates' : 'Pause live updates'}
        aria-label={diag.paused ? 'Resume live updates' : 'Pause live updates'}
        aria-pressed={diag.paused}
      >
        {diag.paused ? <PlayArrowRoundedIcon fontSize="inherit" /> : <PauseRoundedIcon fontSize="inherit" />}
      </button>
      <label className="flex items-center gap-1.5 text-[11px] text-[var(--vestara-text-muted)]">
        <span className="sr-only">Refresh interval</span>
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
      </label>
      <button
        type="button"
        className="diag-icon-btn"
        onClick={diag.refreshAll}
        title="Refresh now"
        aria-label="Refresh now"
      >
        <RefreshRoundedIcon fontSize="inherit" />
      </button>
      <span className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--vestara-text-muted)]">
        {diag.paused ? (
          <>
            <StatusDot color="var(--vestara-status-warning)" label="Paused" /> Paused
          </>
        ) : (
          <>
            <StatusDot color="var(--vestara-status-success)" label="Streaming" /> Streaming
          </>
        )}
        {diag.summaryError ? <span className="text-[var(--vestara-status-warning)]">· feed degraded</span> : null}
      </span>
      <span className="ml-auto hidden text-[11px] tabular-nums text-[var(--vestara-text-muted)] sm:block">
        {diag.processesTotal > 0 ? `${diag.processesTotal} processes · ${diag.processesThreads} threads` : '…'}
      </span>
    </div>
  );
}

function ChartCard({
  title,
  accent,
  badge,
  delay,
  children,
}: {
  title: string;
  accent: string;
  badge: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="mpg-enter" style={{ animationDelay: `${delay}ms` }}>
      <GalleryCard accent={accent}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="truncate text-[13px] font-semibold text-[var(--vestara-text-primary)]">{title}</h2>
          <span className="mpg-tag-pill shrink-0">{badge}</span>
        </div>
        {children}
      </GalleryCard>
    </section>
  );
}

function LiveCharts() {
  const { summary, cpuHistory, memHistory } = useDiagnostics();

  const cpu = summary?.cpu.usage ?? 0;
  const cpuColor = cpu > 90 ? 'var(--vestara-status-error)' : cpu > 75 ? 'var(--vestara-status-warning)' : 'var(--vestara-status-info)';
  const memPct = summary ? (summary.memory.used / Math.max(1, summary.memory.total)) * 100 : 0;
  const memColor = memPct > 90 ? 'var(--vestara-status-error)' : 'var(--vestara-status-warning)';

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="CPU Usage"
        accent="var(--vestara-status-info)"
        badge={summary ? `${Math.round(cpu)}%` : 'Live'}
        delay={80}
      >
        <HistoryChart points={cpuHistory} color={cpuColor} label="Live · last 60 samples" />
        {summary && (
          <div className="mt-3 grid grid-cols-3 gap-2">
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
      </ChartCard>
      <ChartCard
        title="Memory Usage"
        accent="var(--vestara-status-warning)"
        badge={summary ? `${Math.round(memPct)}%` : 'Live'}
        delay={120}
      >
        <HistoryChart points={memHistory} color={memColor} label="Live · last 60 samples" />
        {summary && (
          <div className="mt-3 grid grid-cols-2 gap-2">
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
      </ChartCard>
    </div>
  );
}

function SectionTabs() {
  const diag = useDiagnostics();
  const alertCount = diag.summary?.alerts.length ?? 0;
  return (
    <div className="mpg-tabs mpg-enter" role="tablist" aria-label="Diagnostics sections" style={{ animationDelay: '140ms' }}>
      {TABS.map((t) => {
        const active = diag.activeTab === t.id;
        const count =
          t.id === 'processes'
            ? diag.processesTotal
            : t.id === 'agents'
              ? diag.agents.length
              : t.id === 'health'
                ? alertCount
                : null;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => diag.setActiveTab(t.id)}
            className={`mpg-tab ${active ? 'mpg-tab-active' : ''}`}
          >
            <span aria-hidden="true">{t.glyph} </span>
            {t.label}
            {count !== null && count > 0 && (
              <span className="mpg-tag-pill ml-1.5 tabular-nums">
                {count > 999 ? '999+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DiagnosticsPageInner() {
  const diag = useDiagnostics();
  const [aiOpen, setAiOpen] = useState(false);
  const { summary, summaryError } = diag;

  useEffect(() => {
    if (summary?.alerts?.length) {
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

  const loading = diag.summaryLoading && !summary;

  return (
    <>
      <h1 className="sr-only">Diagnostics</h1>
      {summaryError && (
        <div className="mb-3">
          <InsightBanner
            severity="warning"
            description="Live telemetry unavailable — showing cached snapshot."
            action={
              <button type="button" className="mpg-pill" onClick={() => void diag.refreshAll()}>
                Retry
              </button>
            }
          />
        </div>
      )}

      <div className="mb-4 w-full min-w-0 space-y-4 sm:mb-6">
        <DiagnosticsHero onAnalyze={() => setAiOpen(true)} onExport={() => void exportReport()} />
        <ControlStrip />

        {loading ? (
          <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading diagnostics">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="mpg-skeleton h-28" />
              ))}
            </div>
            <AssetGridSkeleton count={2} />
            <p className="sr-only">Loading diagnostics…</p>
          </div>
        ) : (
          <>
            <OverviewCards />
            <LiveCharts />
          </>
        )}

        <SectionTabs />

        <div className="mpg-enter" style={{ animationDelay: '40ms' }} key={diag.activeTab}>
          <GalleryCard>
            <div className="diag-panel p-3 sm:p-4">
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
          </GalleryCard>
        </div>
      </div>

      <AiAnalyze open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}

export default function DiagnosticsPage() {
  return (
    <DiagnosticsProvider>
      <DiagnosticsPageInner />
    </DiagnosticsProvider>
  );
}
