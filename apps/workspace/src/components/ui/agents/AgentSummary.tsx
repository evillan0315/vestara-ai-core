import type { FC } from 'react';
import { getAgentColor } from './agentColors';
import { AgentStatusBadge } from './AgentStatusBadge';
import type { AgentIdentity } from './types';

export interface AgentSummaryProps {
  agent: AgentIdentity;
  selected?: boolean;
  onSelect?: (agentId: string) => void;
}

/**
 * Minimal agent identity display.
 *
 * Used in lists, sidebars, and cards where full AgentCard detail is not needed.
 * Activity Room sidebar, Agent Control filtered list, future Marketplace.
 */
export const AgentSummary: FC<AgentSummaryProps> = ({ agent, selected, onSelect }) => {
  const color = getAgentColor(agent);
  const isActive = agent.status === 'active';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(agent.id)}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
        selected
          ? 'bg-(--vestara-accent-bg) border border-(--vestara-accent-border-active)'
          : 'hover:bg-(--vestara-accent-bg) border border-transparent'
      }`}
    >
      {/* Status dot */}
      <div className="relative shrink-0">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: isActive ? color : '#52525b' }}
        />
      </div>

      {/* Identity */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-(--vestara-text) truncate">
            {agent.name}
          </span>
          <span className="text-[7px] px-1 py-0.5 rounded bg-zinc-800 text-(--vestara-text-2) uppercase font-medium shrink-0">
            {agent.role}
          </span>
        </div>
        {agent.description && (
          <div className="text-[9px] text-(--vestara-text-dim) truncate mt-0.5">
            {agent.description}
          </div>
        )}
      </div>

      {/* Status badge */}
      {agent.status && <AgentStatusBadge status={agent.status} />}
    </button>
  );
};
