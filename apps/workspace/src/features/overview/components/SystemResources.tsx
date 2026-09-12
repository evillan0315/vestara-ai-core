/**
 * VES-OVERVIEW-001: System Resources Component
 *
 * 4 radial gauges (CPU / Memory / Disk / Network) with detail lines,
 * Live badge, and throughput footer.
 */

import type { OverviewResourceSummary } from '../overview.types';
import { SectionCard } from './SectionCard';

interface SystemResourcesProps {
  resources: OverviewResourceSummary;
}

const GAUGE_COLORS = {
  cpu: 'var(--vestara-status-info)',
  memory: 'var(--vestara-status-warning)',
  disk: 'var(--vestara-status-success)',
  network: 'var(--vestara-status-success)',
} as const;

const GAUGE_TRACK = 'color-mix(in srgb, var(--vestara-text-muted) 20%, transparent)';

function Gauge({ label, value, detail, color }: { label: string; value: number; detail?: string; color: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-[var(--vestara-accent-bg)]">
      <div className="relative h-[64px] w-[64px]" role="img" aria-label={`${label} ${clamped} percent`} style={{ color }}>
        <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
          <title>{`${label} ${clamped} percent`}</title>
          <circle cx="28" cy="28" r={r} fill="none" stroke={GAUGE_TRACK} strokeWidth="6" />
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.4s ease', filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[8px] uppercase tracking-wide text-[var(--vestara-text-muted)]">{label}</span>
          <span className="text-[12px] font-bold text-[var(--vestara-text-primary)]">{clamped}%</span>
        </div>
      </div>
      {detail && <span className="text-[10px] text-[var(--vestara-text-muted)]">{detail}</span>}
    </div>
  );
}

export function SystemResources({ resources }: SystemResourcesProps) {
  return (
    <SectionCard title="System Resources" badge="Live" live actionLabel="View All" actionHref="/diagnostics" accent="var(--vestara-status-success)" index={3}>
      {/* 2×2 on phones (4×64px gauges overflow a ~280px card), 4-across above. */}
      <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
        <Gauge label="CPU" value={resources.cpu} detail={resources.cpuDetail} color={GAUGE_COLORS.cpu} />
        <Gauge label="Memory" value={resources.memory} detail={resources.memoryDetail} color={GAUGE_COLORS.memory} />
        <Gauge label="Disk" value={resources.disk ?? 0} detail={resources.diskDetail} color={GAUGE_COLORS.disk} />
        <Gauge label="Network" value={resources.network ?? 0} detail={undefined} color={GAUGE_COLORS.network} />
      </div>
      {resources.networkDetail && (
        <p className="mpg-tag-pill mt-3 w-full justify-center px-3 py-1.5">
          ↑ {resources.networkDetail.split('·')[0]?.trim()} ↓ {resources.networkDetail.split('·')[1]?.trim() ?? ''}
          <span className="ml-2 text-[var(--vestara-text-secondary)]">· {resources.uptime} up · {resources.activeSessions} sessions</span>
        </p>
      )}
    </SectionCard>
  );
}
