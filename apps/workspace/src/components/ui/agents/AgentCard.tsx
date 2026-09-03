import type { ReactNode } from 'react';
import { getAgentColor } from './agentColors';
import { AgentStatusBadge } from './AgentStatusBadge';
import type { AgentIdentity, AgentStats } from './types';

export interface AgentCardProps {
  agent: AgentIdentity;
  stats?: AgentStats;
  isExpanded?: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Shared agent card with status, stats, and action slots.
 *
 * Used by Agent Control (with harness actions), Activity Room (read-only),
 * and future surfaces (Marketplace, Agent Builder).
 *
 * The `actions` slot allows each consumer to provide context-specific buttons.
 * The `children` slot allows expanded content (tabs, details, etc.).
 */
export function AgentCard({
  agent,
  stats,
  isExpanded,
  onToggle,
  actions,
  children,
}: AgentCardProps) {
  const color = getAgentColor(agent);
  const isRegistered = agent.status !== 'unregistered';

  return (
    <div
      className={`rounded-lg border transition-all ${
        isExpanded
          ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border-active)'
          : isRegistered
            ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border) hover:border-(--vestara-accent-border-active)'
            : 'bg-(--vestara-accent-bg) border-(--vestara-accent-border)/50 opacity-60'
      }`}
      style={{
        borderLeftColor: isRegistered ? color : undefined,
        borderLeftWidth: isRegistered ? '3px' : undefined,
      }}
    >
      {/* Header row */}
      <div
        className="p-2 sm:p-3 flex items-center gap-2 sm:gap-3 cursor-pointer"
        onClick={() => isRegistered && onToggle?.()}
      >
        {/* Status dot */}
        <div className="relative shrink-0">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              backgroundColor: isRegistered
                ? agent.status === 'active'
                  ? color
                  : '#52525b'
                : '#27272a',
            }}
          />
          {stats && stats.running > 0 && (
            <div
              className="absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-40"
              style={{ backgroundColor: color }}
            />
          )}
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={`text-xs sm:text-sm font-semibold truncate ${
                isRegistered ? 'text-(--vestara-text)' : 'text-(--vestara-text-muted)'
              }`}
            >
              {agent.name}
            </span>
            <span className="text-[7px] sm:text-[8px] px-1 py-0.5 rounded bg-zinc-800 text-(--vestara-text-2) uppercase font-medium shrink-0">
              {agent.role}
            </span>
            {agent.status && <AgentStatusBadge status={agent.status} />}
          </div>
          {agent.description && (
            <div
              className={`text-[9px] sm:text-[10px] truncate mt-0.5 ${
                isRegistered ? 'text-(--vestara-text-muted)' : 'text-(--vestara-text-dim)'
              }`}
            >
              {agent.description}
            </div>
          )}
          <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5">
            {agent.provider && (
              <span className="text-[8px] sm:text-[9px] text-(--vestara-text-dim) hidden sm:inline">
                {agent.provider}
              </span>
            )}
            {agent.model && (
              <span className="text-[8px] sm:text-[9px] text-(--vestara-text-dim) font-mono hidden sm:inline">
                {agent.model}
              </span>
            )}
            {stats && stats.total > 0 && (
              <span className="text-[8px] sm:text-[9px] text-(--vestara-text-dim)">
                {stats.completed}/{stats.total}
              </span>
            )}
            {stats && stats.running > 0 && (
              <span className="text-[8px] sm:text-[9px] text-amber-400 animate-pulse font-semibold">
                {stats.running} active
              </span>
            )}
          </div>
        </div>

        {/* Actions slot */}
        {actions && <div className="flex gap-1 shrink-0">{actions}</div>}
      </div>

      {/* Stats bar */}
      {stats && stats.total > 0 && (
        <div className="px-3 pb-2">
          <div className="flex-1 bg-(--vestara-accent-bg) rounded-full h-1.5 flex overflow-hidden">
            {stats.completed > 0 && (
              <div
                className="h-1.5 bg-green-500 transition-all"
                style={{ width: `${(stats.completed / stats.total) * 100}%` }}
              />
            )}
            {stats.failed > 0 && (
              <div
                className="h-1.5 bg-red-500 transition-all"
                style={{ width: `${(stats.failed / stats.total) * 100}%` }}
              />
            )}
            {stats.running > 0 && (
              <div
                className="h-1.5 bg-amber-400 animate-pulse transition-all"
                style={{ width: `${(stats.running / stats.total) * 100}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && children}
    </div>
  );
}
