/**
 * VES-OVERVIEW-001: System Resources Component
 *
 * CPU, memory, disk, uptime, sessions.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { OverviewResourceSummary } from '../overview.types';

interface SystemResourcesProps {
  resources: OverviewResourceSummary;
}

function ResourceBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--vestara-text-secondary)]">{label}</span>
        <span className="text-[var(--vestara-text-muted)]">{value}%</span>
      </div>
      <div className="h-2 bg-[var(--vestara-surface-canvas)] rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export function SystemResources({ resources }: SystemResourcesProps) {
  const getBarColor = (value: number) => {
    if (value > 90) return 'bg-[var(--vestara-status-error)]';
    if (value > 70) return 'bg-[var(--vestara-status-warning)]';
    return 'bg-[var(--vestara-status-success)]';
  };

  return (
    <div className="rounded-xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-4">
      <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)] mb-4">
        System Resources
      </h2>

      <div className="space-y-4">
        <ResourceBar label="CPU" value={resources.cpu} color={getBarColor(resources.cpu)} />
        <ResourceBar label="Memory" value={resources.memory} color={getBarColor(resources.memory)} />
        {resources.disk !== undefined && (
          <ResourceBar label="Disk" value={resources.disk} color={getBarColor(resources.disk)} />
        )}

        <div className="pt-3 border-t border-[var(--vestara-border-subtle)]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--vestara-text-secondary)]">Uptime</span>
            <span className="text-[var(--vestara-text-primary)] font-medium">{resources.uptime}</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-2">
            <span className="text-[var(--vestara-text-secondary)]">Active Sessions</span>
            <span className="text-[var(--vestara-text-primary)] font-medium">{resources.activeSessions}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
