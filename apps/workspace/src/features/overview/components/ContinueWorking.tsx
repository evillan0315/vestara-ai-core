/**
 * VES-OVERVIEW-001: Continue Working Component
 *
 * Recent work items with status and progress.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { OverviewRecentWorkItem } from '../overview.types';

interface ContinueWorkingProps {
  items: readonly OverviewRecentWorkItem[];
}

const STATUS_STYLES = {
  running: { dot: 'bg-emerald-400 animate-pulse', label: 'Running', bg: 'bg-emerald-500/10' },
  completed: { dot: 'bg-blue-400', label: 'Completed', bg: 'bg-blue-500/10' },
  paused: { dot: 'bg-amber-400', label: 'Paused', bg: 'bg-amber-500/10' },
  failed: { dot: 'bg-red-400', label: 'Failed', bg: 'bg-red-500/10' },
};

const TYPE_ICONS = {
  execution: '⚡',
  workflow: '🔄',
  conversation: '💬',
  file: '📄',
};

export function ContinueWorking({ items }: ContinueWorkingProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-4">
        <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)] mb-3">
          Continue Working
        </h2>
        <p className="text-sm text-[var(--vestara-text-muted)] text-center py-4">
          No recent work items. Start a conversation or execute a workflow to begin.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-4">
      <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)] mb-3">
        Continue Working
      </h2>

      <div className="space-y-2">
        {items.map((item) => {
          const statusStyle = STATUS_STYLES[item.status];
          const icon = TYPE_ICONS[item.type];

          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-lg ${statusStyle.bg} hover:opacity-80 transition-opacity cursor-pointer`}
            >
              <span className="text-lg">{icon}</span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--vestara-text-primary)] truncate">
                    {item.title}
                  </span>
                  <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--vestara-text-muted)]">
                  <span>{statusStyle.label}</span>
                  <span>·</span>
                  <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>

              {item.progress !== undefined && (
                <div className="w-16">
                  <div className="h-1.5 bg-[var(--vestara-surface-canvas)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--vestara-accent-primary)] rounded-full transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--vestara-text-muted)] text-right">
                    {item.progress}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
