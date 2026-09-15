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
    { label: 'CPU', value: `${resources.cpu}%`, color: 'var(--vestara-status-info)' },
    { label: 'Mem', value: `${resources.memory}%`, color: 'var(--vestara-status-warning)' },
    { label: 'Disk', value: `${resources.disk ?? 0}%`, color: 'var(--vestara-status-success)' },
  ];

  return (
    <SectionCard title="System" actionLabel="Details" actionHref="/diagnostics" accent="var(--vestara-status-success)" index={3}>
      <Link
        to="/diagnostics"
        className="mpg-category-row flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
      >
        {items.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: item.color }}
            />
            <span className="text-[var(--vestara-text-muted)]">{item.label}</span>
            <span className="font-medium tabular-nums">{item.value}</span>
          </span>
        ))}
        {resources.networkDetail && (
          <span className="text-[var(--vestara-text-muted)]">
            ↑↓ {resources.networkDetail.split('·')[0]?.trim() ?? ''}
          </span>
        )}
        {resources.uptime && (
          <span className="text-[var(--vestara-text-muted)]">
            {resources.uptime} up
          </span>
        )}
        <span className="text-[var(--vestara-text-muted)]">›</span>
      </Link>
    </SectionCard>
  );
}
