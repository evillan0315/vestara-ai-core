/**
 * VES-OVERVIEW-001: Recent Activity Component
 *
 * Marketplace rows (mpg-category-row) with status icon tiles, title,
 * detail, and relative time.
 */

import { MarketplaceEmptyState } from '../../../pages/Marketplace/MarketplaceLayout-components.js';
import type { OverviewActivityItem } from '../overview.types';
import { SectionCard } from './SectionCard';

interface RecentActivityProps {
  items: readonly OverviewActivityItem[];
}

const KIND_ACCENT: Record<string, string> = {
  workflow: 'var(--vestara-status-success)',
  execution: 'var(--vestara-status-success)',
  'file-change': 'var(--vestara-text-muted)',
  'agent-action': 'var(--vestara-status-info)',
  message: 'var(--vestara-status-info)',
  issue: 'var(--vestara-status-error)',
  module: 'var(--vestara-accent-primary)',
};

const KIND_GLYPH: Record<string, string> = {
  workflow: '✓',
  execution: '✓',
  'file-change': '▤',
  'agent-action': '◉',
  message: '◉',
  issue: '!',
  module: '⬢',
};

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function RecentActivity({ items }: RecentActivityProps) {
  if (items.length === 0) {
    return (
      <SectionCard title="Recent Activity" actionLabel="View All" actionHref="/activity" accent="var(--vestara-status-success)" index={1}>
        <MarketplaceEmptyState message="No activity yet." />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Recent Activity" actionLabel="View All" actionHref="/activity" accent="var(--vestara-status-success)" index={1}>
      <ul className="space-y-1">
        {items.map((item, i) => {
          const accent = KIND_ACCENT[item.kind] ?? KIND_ACCENT['agent-action'];
          const glyph = KIND_GLYPH[item.kind] ?? KIND_GLYPH['agent-action'];
          return (
            <li key={item.id} className="mpg-enter" style={{ animationDelay: `${i * 30}ms` }}>
              <div className="mpg-category-row">
                <span className="flex min-w-0 flex-1 items-center gap-3">
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
                    {glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                      {item.title ?? item.action}
                    </span>
                    <span className="block truncate text-[11.5px] text-[var(--vestara-text-muted)]">
                      {item.detail ?? item.target ?? item.action}
                    </span>
                  </span>
                </span>
                <span className="mpg-tag-pill shrink-0">{timeAgo(item.timestamp)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
