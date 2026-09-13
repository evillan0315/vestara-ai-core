import { AgentStatusBadge, getAgentColor } from '../../components/ui/agents';
import type { Agent, AgentStats } from './types';

interface AgentCardProps {
  agent: Agent;
  stats: AgentStats;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

/**
 * Premium agent box for the uniform square grid.
 * Uses the shared mpg-card system (glow, hover lift, staggered entrance)
 * with aspect-square for equal height/width on every card.
 */
export function AgentCard({ agent, stats, onEdit, onToggleStatus, onDelete }: AgentCardProps) {
  const isRegistered = agent.status !== 'unregistered';
  const color = getAgentColor(agent);

  return (
    <div
      className="mpg-card mpg-enter aspect-square w-full"
      style={{ animationDelay: `${Math.min(stats.total, 12) * 30}ms` }}
    >
      <div className="relative z-[2] flex h-full flex-col p-3">
        {/* Header */}
        <div className="flex items-start gap-2.5">
          <div className="relative mt-0.5 shrink-0">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: isRegistered
                  ? agent.status === 'active'
                    ? color
                    : '#52525b'
                  : '#27272a',
              }}
            />
            {stats.running > 0 && (
              <div
                className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-40"
                style={{ backgroundColor: color }}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs font-semibold truncate ${isRegistered ? 'text-[var(--vestara-text-primary)]' : 'text-[var(--vestara-text-muted)]'}`}
              >
                {agent.name}
              </span>
              <AgentStatusBadge status={agent.status} />
            </div>
            {agent.description && (
              <div className="text-[9px] truncate mt-0.5 text-[var(--vestara-text-muted)]">
                {agent.description}
              </div>
            )}
          </div>
        </div>

        {/* Role / provider / model / stats */}
        <div className="mt-2 flex flex-col gap-0.5 text-[8px] text-[var(--vestara-text-muted)]">
          <span className="truncate font-medium text-[9px] text-[var(--vestara-accent)]">
            {agent.role}
          </span>
          {agent.provider && <span className="truncate">{agent.provider}</span>}
          {agent.model && <span className="truncate font-mono">{agent.model}</span>}
          {stats.total > 0 && (
            <span className="truncate">
              {stats.completed}/{stats.total} done
            </span>
          )}
          {stats.running > 0 && (
            <span className="truncate text-amber-400 animate-pulse font-semibold">
              {stats.running} active
            </span>
          )}
        </div>

        {/* Bottom: stats bar + actions */}
        <div className="mt-auto pt-2">
          {stats.total > 0 && (
            <div className="flex-1 bg-[var(--vestara-accent-bg)] rounded-full h-1.5 flex overflow-hidden mb-2">
              {stats.completed > 0 && (
                <div
                  className="h-1.5 bg-emerald-500 transition-all"
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
          )}
          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="min-h-[28px] flex-1 text-[8px] px-1.5 py-1 mpg-pill"
            >
              {isRegistered ? 'Edit' : 'Register'}
            </button>
            {isRegistered && (
              <div className="relative group">
                <button className="min-h-[28px] text-[8px] px-1.5 py-1 mpg-pill">
                  ⋯
                </button>
                <div className="absolute right-0 bottom-full mb-1 z-10 hidden group-hover:block">
                  <div className="bg-zinc-900 border border-[var(--vestara-accent-border)] rounded-lg shadow-lg py-1 min-w-[100px]">
                    <button
                      onClick={onToggleStatus}
                      className="w-full text-left text-[10px] px-3 py-1.5 text-[var(--vestara-text-primary)] hover:bg-[var(--vestara-accent-bg)] transition-colors cursor-pointer"
                    >
                      {agent.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={onDelete}
                      className="w-full text-left text-[10px] px-3 py-1.5 text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
