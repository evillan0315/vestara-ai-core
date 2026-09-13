import { AgentCard } from './AgentCard';
import type { Agent, AgentStats } from './types';

interface AgentCategoryListProps {
  agents: Agent[];
  agentStats: Record<string, AgentStats>;
  onEditAgent: (agent: Agent) => void;
  onToggleStatus: (agent: Agent) => void;
  onDeleteAgent: (id: string) => void;
}

/**
 * Uniform agent box grid — no category grouping, no expand/collapse.
 * One flat 4-column grid (responsive) where every card renders as a
 * perfect square via aspect-square + overflow-hidden + truncation.
 */
export function AgentCategoryList({
  agents,
  agentStats,
  onEditAgent,
  onToggleStatus,
  onDeleteAgent,
}: AgentCategoryListProps) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
        <div className="text-2xl mb-2 opacity-30">☰</div>
        <p className="text-sm text-(--vestara-text-2) b-1">No agents found</p>
        <p className="text-xs text-(--vestara-text-dim)">Adjust your filters or register a new agent</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {agents.map((agent) => {
        const stats = agentStats[agent.id] || {
          total: 0,
          completed: 0,
          failed: 0,
          running: 0,
          avgDuration: 0,
        };
        return (
          <AgentCard
            key={agent.id}
            agent={agent}
            stats={stats}
            onEdit={() => onEditAgent(agent)}
            onToggleStatus={() => onToggleStatus(agent)}
            onDelete={() => onDeleteAgent(agent.id)}
          />
        );
      })}
    </div>
  );
}
