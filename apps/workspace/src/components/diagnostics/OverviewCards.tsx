/**
 * Diagnostic overview cards (top row).
 */

import type { DiagSummary } from '../../lib/diagnostics';
import { formatBytes, formatUptime } from '../../lib/diagnostics';
import { Sparkline } from './charts';
import { useDiagnostics } from './DiagnosticsContext';

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'ok' | 'warn' | 'bad' | 'neutral';
  spark?: number[];
}

function toneColor(tone: CardProps['tone']): string {
  switch (tone) {
    case 'ok':
      return 'var(--vestara-green, #4ade80)';
    case 'warn':
      return 'var(--vestara-amber, #f59e0b)';
    case 'bad':
      return 'var(--vestara-red, #f87171)';
    default:
      return 'var(--vestara-accent, #f59e0b)';
  }
}

function Card({ label, value, sub, tone = 'neutral', spark }: CardProps) {
  const color = toneColor(tone);
  return (
    <div className="diag-card" style={{ borderTopColor: color }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="diag-card-label">{label}</span>
        {spark && spark.length >= 2 && (
          <Sparkline points={spark.map((v, i) => ({ t: i, value: v }))} color={color} height={20} />
        )}
      </div>
      <div className="diag-card-value" style={{ color }}>
        {value}
      </div>
      {sub && <div className="diag-card-sub">{sub}</div>}
    </div>
  );
}

function pct(n: number): string {
  return `${Math.round(Number.isFinite(n) ? n : 0)}%`;
}

export function OverviewCards() {
  const { summary, cpuHistory, memHistory, agents } = useDiagnostics();
  const s: DiagSummary | null = summary;

  const memPct = s ? (s.memory.used / Math.max(1, s.memory.total)) * 100 : 0;
  const swapPct = s ? (s.memory.swapUsed / Math.max(1, s.memory.swapTotal)) * 100 : 0;
  const rootDisk = s?.disks.find((d) => d.mount === '/') ?? s?.disks[0];
  const cpuTone = (s?.cpu.usage ?? 0) > 90 ? 'bad' : (s?.cpu.usage ?? 0) > 75 ? 'warn' : 'ok';
  const memTone = memPct > 90 ? 'bad' : memPct > 80 ? 'warn' : 'ok';
  const diskTone = (rootDisk?.capacity ?? 0) > 90 ? 'bad' : (rootDisk?.capacity ?? 0) > 80 ? 'warn' : 'ok';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
      <Card
        label="CPU"
        value={s ? pct(s.cpu.usage) : '…'}
        sub={s ? `${s.cpu.logicalCores} cores · ${s.cpu.loadAvg[0]} load` : undefined}
        tone={cpuTone}
        spark={cpuHistory.map((h) => h.value)}
      />
      <Card
        label="Memory"
        value={s ? `${formatBytes(s.memory.used)} / ${formatBytes(s.memory.total)}` : '…'}
        sub={s ? `${pct(memPct)} used` : undefined}
        tone={memTone}
        spark={memHistory.map((h) => h.value)}
      />
      <Card
        label="Swap"
        value={
          s
            ? s.memory.swapTotal > 0
              ? `${formatBytes(s.memory.swapUsed)} / ${formatBytes(s.memory.swapTotal)}`
              : '0 B'
            : '…'
        }
        sub={s && s.memory.swapTotal > 0 ? `${pct(swapPct)} used` : 'no swap'}
        tone={swapPct > 80 ? 'warn' : 'ok'}
      />
      <Card
        label="Disk"
        value={rootDisk ? `${formatBytes(rootDisk.used)} / ${formatBytes(rootDisk.size)}` : '…'}
        sub={rootDisk ? `${rootDisk.mount} · ${pct(rootDisk.capacity)}` : undefined}
        tone={diskTone}
      />
      <Card
        label="GPU"
        value={
          !s
            ? '…'
            : s.gpu.available
              ? s.gpu.gpus[0]
                ? `${pct(s.gpu.gpus[0].utilization)} · ${s.gpu.gpus[0].name.split(' ')[0]}`
                : 'ready'
              : 'N/A'
        }
        sub={
          !s
            ? undefined
            : s.gpu.available
              ? s.gpu.gpus[0]
                ? `${formatBytes(s.gpu.gpus[0].memoryUsed)} / ${formatBytes(s.gpu.gpus[0].memoryTotal)}`
                : 'no devices'
              : 'no NVIDIA GPU'
        }
        tone={s?.gpu.available && s.gpu.gpus[0]?.utilization > 95 ? 'warn' : 'ok'}
      />
      <Card
        label="Network"
        value={s ? String(s.network.interfaces.filter((i) => !i.internal).length) : '…'}
        sub={
          s
            ? s.network.gateway
              ? `gateway ${s.network.gateway}`
              : `${s.network.interfaces.length} interfaces`
            : undefined
        }
        tone="ok"
      />
      <Card
        label="Uptime"
        value={s ? formatUptime(s.os.uptime) : '…'}
        sub={s ? `boot ${new Date(s.os.bootTime).toLocaleString()}` : undefined}
        tone="neutral"
      />
      <Card
        label="Processes"
        value={s ? String(s.processes.total) : '…'}
        sub={s ? `${s.processes.threads} threads` : undefined}
        tone="ok"
      />
      <Card
        label="Agents"
        value={
          agents.length > 0 ? String(agents.filter((a) => a.status !== 'idle' && a.status !== 'completed').length) : '…'
        }
        sub={agents.length > 0 ? `${agents.length} registered` : undefined}
        tone="ok"
      />
      <Card
        label="Readiness"
        value={s ? `${Math.round(s.readiness)}%` : '…'}
        sub={s ? `${s.health.filter((h) => h.status === 'pass').length}/${s.health.length} checks pass` : undefined}
        tone={s?.readiness != null ? (s.readiness >= 80 ? 'ok' : s.readiness >= 50 ? 'warn' : 'bad') : 'neutral'}
      />
    </div>
  );
}
