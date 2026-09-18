/**
 * VES-OVERVIEW-001: Recent Activity Component
 *
 * Marketplace rows (mpg-category-row) with status icon tiles, title,
 * detail, and relative time.
 */

import { useState } from 'react';
import { MarketplaceEmptyState } from '../../../pages/Marketplace/MarketplaceLayout-components.js';
import type { OverviewActivityItem } from '../overview.types';
import { timeAgo as formatRelativeTime } from '../utils/timeAgo';
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
  return formatRelativeTime(iso);
}

export function RecentActivity({ items }: RecentActivityProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 3);
  if (items.length === 0) {
    return (
      <SectionCard title="Recent Activity" actionLabel="View All" actionHref="/activity" accent="var(--vestara-status-success)" index={1}>
        <MarketplaceEmptyState message="No activity yet." />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Recent Activity" actionLabel="View All" actionHref="/activity" accent="var(--vestara-status-success)" index={2}>
      <ul className="space-y-1">
        {visible.map((item, i) => {
          const accent = KIND_ACCENT[item.kind] ?? KIND_ACCENT['agent-action'];
          const glyph = KIND_GLYPH[item.kind] ?? KIND_GLYPH['agent-action'];
          return (
            <li key={item.id} className="mpg-enter" style={{ animationDelay: `${i * 30}ms` }}>
              <div className="mpg-category-row" title={`${item.title ?? item.action} · ${item.detail ?? item.target ?? ''}`}>
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
                <span className="mpg-tag-pill shrink-0 tabular-nums">
                  <time dateTime={item.timestamp}>{timeAgo(item.timestamp)}</time>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 w-full text-center text-[11px] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
        >
          {expanded ? 'Show less' : `+${items.length - 3} more in Activity Room — expand`}
        </button>
      )}
    </SectionCard>
  );
}
