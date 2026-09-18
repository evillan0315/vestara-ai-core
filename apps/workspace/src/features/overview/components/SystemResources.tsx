/**
 * VES-OVERVIEW-001: System Resources Component
 *
 * Compact single-line status bar: "CPU 18% · Mem 62% · Disk 35% · ↑↓ 12MB/s"
 * with a link to the full diagnostics page.
 */

import { Link } from 'react-router-dom';
import type { OverviewResourceSummary } from '../overview.types';
import { SectionCard } from './SectionCard';

interface SystemResourcesProps {
  resources: OverviewResourceSummary;
}

export function SystemResources({ resources }: SystemResourcesProps) {
  const items = [
    { label: 'CPU', value: `${resources.cpu}%`, pct: resources.cpu, color: 'var(--vestara-status-info)', detail: resources.cpuDetail },
    { label: 'Mem', value: `${resources.memory}%`, pct: resources.memory, color: 'var(--vestara-status-warning)', detail: resources.memoryDetail },
    { label: 'Disk', value: `${resources.disk ?? 0}%`, pct: resources.disk ?? 0, color: 'var(--vestara-status-success)', detail: resources.diskDetail },
  ];

  return (
    <SectionCard title="System" actionLabel="Details" actionHref="/diagnostics" accent="var(--vestara-status-success)" index={3}>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} title={item.detail ?? `${item.label} ${item.value}`}>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: item.color }}
                />
                <span className="text-[var(--vestara-text-muted)]">{item.label}</span>
              </span>
              <span className="font-medium tabular-nums text-[var(--vestara-text-secondary)]">{item.value}</span>
            </div>
            <div
              className="mt-1 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--vestara-text-muted)_18%,transparent)]"
              role="progressbar"
              aria-valuenow={Math.round(item.pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${item.label} usage ${item.value}`}
            >
              <span className="block h-full rounded-[inherit]" style={{ width: `${Math.min(100, Math.max(0, item.pct))}%`, background: item.color }} />
            </div>
          </div>
        ))}
        <Link
          to="/diagnostics"
          className="mpg-category-row flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
        >
        {resources.networkDetail && (
          <span className="text-[var(--vestara-text-muted)]">
            ↑↓ {resources.networkDetail}
          </span>
        )}
        {resources.uptime && (
          <span className="text-[var(--vestara-text-muted)]">
            {resources.uptime} up
          </span>
        )}
        <span className="text-[var(--vestara-text-muted)]">›</span>
        </Link>
      </div>
    </SectionCard>
  );
}
