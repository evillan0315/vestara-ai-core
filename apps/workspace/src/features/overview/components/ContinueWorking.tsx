/**
 * VES-OVERVIEW-001: Continue Working Component
 *
 * Marketplace rows (mpg-category-row) with mpg-icon-box tiles, branch
 * pills, and time-ago.
 */

import { Link } from 'react-router-dom';
import { MarketplaceEmptyState } from '../../../pages/Marketplace/MarketplaceLayout-components.js';
import type { OverviewRecentWorkItem } from '../overview.types';
import { SectionCard } from './SectionCard';

interface ContinueWorkingProps {
  items: readonly OverviewRecentWorkItem[];
}

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? '' : 's'} ago`;
}

const TILE_ACCENT = 'var(--vestara-status-info)';

export function ContinueWorking({ items }: ContinueWorkingProps) {
  if (items.length === 0) {
    return (
      <SectionCard title="Continue Working" actionLabel="View All" accent={TILE_ACCENT} index={0}>
        <MarketplaceEmptyState message="No recent work. Start a conversation or execute a workflow to begin." />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Continue Working" actionLabel="View All" accent={TILE_ACCENT} index={0}>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={item.id} className="mpg-enter" style={{ animationDelay: `${i * 30}ms` }}>
            <Link
              to={item.type === 'project' || item.type === 'repository' ? '/projects' : '/executions'}
              className="mpg-category-row"
            >
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="mpg-icon-box"
                  style={{
                    color: TILE_ACCENT,
                    background: `color-mix(in srgb, ${TILE_ACCENT} 14%, transparent)`,
                    borderColor: `color-mix(in srgb, ${TILE_ACCENT} 35%, transparent)`,
                    width: '2rem',
                    height: '2rem',
                    fontSize: '0.85rem',
                    borderRadius: '0.5rem',
                  }}
                >
                  {'</>'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[var(--vestara-text-primary)]">
                    {item.title}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">{item.path ?? item.type}</span>
                </span>
              </span>
              <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                <span className="mpg-tag-pill">
                  <span aria-hidden="true">⑂</span> {item.branch ?? 'main'}
                </span>
                <span className="text-[10px] text-[var(--vestara-text-muted)]">{timeAgo(item.updatedAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
