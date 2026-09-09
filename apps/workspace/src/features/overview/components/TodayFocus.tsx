/**
 * VES-OVERVIEW-001: Today's Focus Component
 *
 * Priority items with action links.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { OverviewFocusItem } from '../overview.types';

interface TodayFocusProps {
  items: readonly OverviewFocusItem[];
}

const PRIORITY_STYLES = {
  high: { dot: 'bg-red-400', label: 'High', bg: 'bg-red-500/10' },
  medium: { dot: 'bg-amber-400', label: 'Medium', bg: 'bg-amber-500/10' },
  low: { dot: 'bg-blue-400', label: 'Low', bg: 'bg-blue-500/10' },
};

export function TodayFocus({ items }: TodayFocusProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-4">
        <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)] mb-3">
          Today's Focus
        </h2>
        <p className="text-sm text-[var(--vestara-text-muted)] text-center py-4">
          No priority items today. You're all caught up!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-4">
      <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)] mb-3">
        Today's Focus
      </h2>

      <div className="space-y-2">
        {items.map((item) => {
          const priorityStyle = PRIORITY_STYLES[item.priority];

          return (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-lg ${priorityStyle.bg}`}
            >
              <span className={`mt-1 w-2 h-2 rounded-full ${priorityStyle.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--vestara-text-primary)]">
                    {item.title}
                  </span>
                  <span className="text-[10px] text-[var(--vestara-text-muted)]">
                    {priorityStyle.label}
                  </span>
                </div>
                <p className="text-xs text-[var(--vestara-text-muted)] mt-0.5">
                  {item.reason}
                </p>
                {item.action && (
                  <a
                    href={item.action.href}
                    className="inline-block mt-2 text-xs font-medium text-[var(--vestara-accent-primary)] hover:underline"
                  >
                    {item.action.label} →
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
