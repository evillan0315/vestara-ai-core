/**
 * Diagnostic overview cards — metric gallery row.
 *
 * Marketplace gallery materials (mpg-card hover lift, mpg-icon-box,
 * mpg-enter stagger) with metric progress bars and sparklines.
 */

import { GalleryCard } from '../../pages/Marketplace/MarketplaceLayout-components.js';
import type { DiagSummary } from '../../lib/diagnostics';
import { formatBytes, formatUptime } from '../../lib/diagnostics';
import { Sparkline } from './charts';
import { useDiagnostics } from './DiagnosticsContext';

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

interface MetricDef {
  id: string;
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
  glyph: string;
  spark?: number[];
  progress?: number;
}

function toneAccent(tone: Tone): string {
  switch (tone) {
    case 'ok':
      return 'var(--vestara-status-success)';
    case 'warn':
      return 'var(--vestara-status-warning)';
    case 'bad':
      return 'var(--vestara-status-error)';
    default:
      return 'var(--vestara-accent-primary)';
  }
}

function toneText(tone: Tone): string {
  switch (tone) {
    case 'ok':
      return 'var(--dg-tile-success-fg, var(--vestara-status-success))';
    case 'warn':
      return 'var(--dg-tile-warning-fg, var(--vestara-status-warning))';
    case 'bad':
      return 'var(--dg-tile-error-fg, var(--vestara-status-error))';
    default:
      return 'var(--vestara-text-primary)';
  }
}

function pct(n: number): string {
  return `${Math.round(Number.isFinite(n) ? n : 0)}%`;
}

function MetricCard({ metric, index }: { metric: MetricDef; index: number }) {
  const accent = toneAccent(metric.tone);
  return (
    <div className="mpg-enter h-full" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
      <GalleryCard accent={accent} className="h-full">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="mpg-icon-box"
              style={{
                color: accent,
                background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
                width: '2rem',
                height: '2rem',
                fontSize: '0.85rem',
                borderRadius: '0.5rem',
              }}
            >
              {metric.glyph}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--vestara-text-muted)]">
                {metric.label}
              </p>
              <p
                className="mt-0.5 truncate text-[15px] font-bold tabular-nums text-[var(--vestara-text-primary)]"
                style={metric.tone !== 'neutral' ? { color: toneText(metric.tone) } : undefined}
                title={metric.value}
              >
                {metric.value}
              </p>
              {metric.sub && (
                <p className="mt-0.5 truncate text-[11px] text-[var(--vestara-text-muted)]" title={metric.sub}>
                  {metric.sub}
                </p>
              )}
            </div>
          </div>
        </div>
        {(metric.spark || metric.progress !== undefined) && (
          <div className="mt-2 space-y-1.5">
            {metric.spark && metric.spark.length >= 2 && (
              <Sparkline points={metric.spark.map((v, i) => ({ t: i, value: v }))} color={accent} height={28} />
            )}
            {metric.progress !== undefined && (
              <div
                className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--vestara-text-muted)_18%,transparent)]"
                role="progressbar"
                aria-valuenow={Math.round(metric.progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${metric.label} usage`}
              >
                <span
                  className="block h-full rounded-[inherit] bg-gradient-to-r from-[var(--vestara-marketplace-primary)] to-[var(--vestara-accent)]"
                  style={{ width: `${Math.min(100, Math.max(0, metric.progress))}%` }}
                />
              </div>
            )}
          </div>
        )}
      </GalleryCard>
    </div>
  );
}

export function OverviewCards() {
  const { summary, cpuHistory, memHistory, agents } = useDiagnostics();
  const s: DiagSummary | null = summary;

  const memPct = s ? (s.memory.used / Math.max(1, s.memory.total)) * 100 : 0;
  const swapPct = s ? (s.memory.swapUsed / Math.max(1, s.memory.swapTotal)) * 100 : 0;
  const rootDisk = s?.disks.find((d) => d.mount === '/') ?? s?.disks[0];
  const cpuTone: Tone = (s?.cpu.usage ?? 0) > 90 ? 'bad' : (s?.cpu.usage ?? 0) > 75 ? 'warn' : 'ok';
  const memTone: Tone = memPct > 90 ? 'bad' : memPct > 80 ? 'warn' : 'ok';
  const diskTone: Tone = (rootDisk?.capacity ?? 0) > 90 ? 'bad' : (rootDisk?.capacity ?? 0) > 80 ? 'warn' : 'ok';

  const activeAgents = agents.filter((a) => a.status !== 'idle' && a.status !== 'completed').length;
  const readiness = s?.readiness ?? 0;
  const readinessTone: Tone = readiness >= 80 ? 'ok' : readiness >= 50 ? 'warn' : 'bad';

  const metrics: MetricDef[] = [
    {
      id: 'cpu',
      label: 'CPU',
      value: s ? pct(s.cpu.usage) : '…',
      sub: s ? `${s.cpu.logicalCores} cores · ${s.cpu.loadAvg[0]} load` : 'collecting telemetry…',
      tone: cpuTone,
      glyph: '◍',
      spark: cpuHistory.map((h) => h.value),
      progress: s ? s.cpu.usage : undefined,
    },
    {
      id: 'memory',
      label: 'Memory',
      value: s ? `${formatBytes(s.memory.used)} / ${formatBytes(s.memory.total)}` : '…',
      sub: s ? `${pct(memPct)} used` : 'collecting telemetry…',
      tone: memTone,
      glyph: '▤',
      spark: memHistory.map((h) => h.value),
      progress: s ? memPct : undefined,
    },
    {
      id: 'swap',
      label: 'Swap',
      value:
        s
          ? s.memory.swapTotal > 0
            ? `${formatBytes(s.memory.swapUsed)} / ${formatBytes(s.memory.swapTotal)}`
            : '0 B'
          : '…',
      sub: s && s.memory.swapTotal > 0 ? `${pct(swapPct)} used` : 'no swap configured',
      tone: swapPct > 80 ? 'warn' : 'ok',
      glyph: '⇄',
      progress: s && s.memory.swapTotal > 0 ? swapPct : undefined,
    },
    {
      id: 'disk',
      label: 'Disk',
      value: rootDisk ? `${formatBytes(rootDisk.used)} / ${formatBytes(rootDisk.size)}` : '…',
      sub: rootDisk ? `${rootDisk.mount} · ${pct(rootDisk.capacity)}` : 'collecting telemetry…',
      tone: diskTone,
      glyph: '▣',
      progress: rootDisk ? rootDisk.capacity : undefined,
    },
    {
      id: 'gpu',
      label: 'GPU',
      value:
        !s
          ? '…'
          : s.gpu.available
            ? s.gpu.gpus[0]
              ? `${pct(s.gpu.gpus[0].utilization)} · ${s.gpu.gpus[0].name.split(' ')[0]}`
              : 'ready'
            : 'N/A',
      sub:
        !s
          ? 'collecting telemetry…'
          : s.gpu.available
            ? s.gpu.gpus[0]
              ? `${formatBytes(s.gpu.gpus[0].memoryUsed)} / ${formatBytes(s.gpu.gpus[0].memoryTotal)}`
              : 'no devices'
            : 'no NVIDIA GPU',
      tone: s?.gpu.available && (s.gpu.gpus[0]?.utilization ?? 0) > 95 ? 'warn' : 'ok',
      glyph: '⬢',
    },
    {
      id: 'network',
      label: 'Network',
      value: s ? String(s.network.interfaces.filter((i) => !i.internal).length) : '…',
      sub: s
        ? s.network.gateway
          ? `gateway ${s.network.gateway}`
          : `${s.network.interfaces.length} interfaces`
        : 'collecting telemetry…',
      tone: 'ok',
      glyph: '◎',
    },
    {
      id: 'uptime',
      label: 'Uptime',
      value: s ? formatUptime(s.os.uptime) : '…',
      sub: s ? `boot ${new Date(s.os.bootTime).toLocaleString()}` : 'collecting telemetry…',
      tone: 'neutral',
      glyph: '◷',
    },
    {
      id: 'processes',
      label: 'Processes',
      value: s ? String(s.processes.total) : '…',
      sub: s ? `${s.processes.threads} threads` : 'collecting telemetry…',
      tone: 'ok',
      glyph: '≡',
    },
    {
      id: 'agents',
      label: 'Agents',
      value: agents.length > 0 ? String(activeAgents) : '…',
      sub: agents.length > 0 ? `${agents.length} registered` : 'collecting telemetry…',
      tone: 'ok',
      glyph: '◉',
    },
    {
      id: 'readiness',
      label: 'Readiness',
      value: s ? `${Math.round(readiness)}%` : '…',
      sub: s ? `${s.health.filter((h) => h.status === 'pass').length}/${s.health.length} checks pass` : undefined,
      tone: s ? readinessTone : 'neutral',
      glyph: '✓',
      progress: s ? readiness : undefined,
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      role="list"
      aria-label="System metrics"
    >
      {metrics.map((m, i) => (
        <div key={m.id} role="listitem" className="min-w-0">
          <MetricCard metric={m} index={i} />
        </div>
      ))}
    </div>
  );
}
