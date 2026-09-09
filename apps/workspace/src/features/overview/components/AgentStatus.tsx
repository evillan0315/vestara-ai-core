/**
 * VES-OVERVIEW-001: Agent Status Component
 *
 * Agent cards with role, status, current task.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { OverviewAgentSummary } from '../overview.types';

interface AgentStatusProps {
  agents: readonly OverviewAgentSummary[];
}

const STATUS_STYLES = {
  working: { dot: 'bg-emerald-400 animate-pulse', label: 'Working', bg: 'bg-emerald-500/10' },
  idle: { dot: 'bg-zinc-500', label: 'Idle', bg: 'bg-zinc-500/10' },
  offline: { dot: 'bg-zinc-700', label: 'Offline', bg: 'bg-zinc-700/10' },
};

const ROLE_ICONS: Record<string, string> = {
  context: '🔍',
  developer: '💻',
  planning: '📋',
  reviewer: '👁️',
  verifier: '✅',
  assistant: '⚡',
  custom: '🔧',
};

export function AgentStatus({ agents }: AgentStatusProps) {
  if (agents.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-4">
        <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)] mb-3">
          Agent Status
        </h2>
        <p className="text-sm text-[var(--vestara-text-muted)] text-center py-4">
          No agents registered.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-4">
      <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)] mb-3">
        Agent Status ({agents.length})
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {agents.map((agent) => {
          const statusStyle = STATUS_STYLES[agent.status];
          const icon = ROLE_ICONS[agent.role] ?? '🤖';

          return (
            <div
              key={agent.id}
              className={`flex items-center gap-3 p-3 rounded-lg ${statusStyle.bg}`}
            >
              <span className="text-lg">{icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--vestara-text-primary)] truncate">
                    {agent.name}
                  </span>
                  <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
                </div>
                <div className="text-[10px] text-[var(--vestara-text-muted)]">
                  {agent.role} · {statusStyle.label}
                </div>
                {agent.currentTask && (
                  <div className="text-[10px] text-[var(--vestara-text-muted)] truncate mt-0.5">
                    {agent.currentTask}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
