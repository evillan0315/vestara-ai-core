import type { AgentState } from '../../contexts/TelemetryContext';

export type PresenceGroup = 'active' | 'waiting' | 'idle' | 'failed';

const STATUS_DOT: Record<PresenceGroup, string> = {
  active: 'bg-(--vestara-green)',
  waiting: 'bg-(--vestara-amber)',
  idle: 'bg-(--vestara-text-dim)',
  failed: 'bg-(--vestara-red)',
};

export function presenceOf(status: AgentState['status']): PresenceGroup {
  if (status === 'thinking' || status === 'working' || status === 'reviewing' || status === 'verifying')
    return 'active';
  if (status === 'waiting') return 'waiting';
  if (status === 'failed') return 'failed';
  return 'idle';
}

interface AgentListItemProps {
  agent: AgentState;
  selected: boolean;
  lastActivity: string | undefined;
  onSelect: (agentId: string) => void;
}

export default function AgentListItem({ agent, selected, lastActivity, onSelect }: AgentListItemProps) {
  const presence = presenceOf(agent.status);
  return (
    <button
      type="button"
      onClick={() => onSelect(agent.id)}
      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
        selected
          ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border)'
          : 'bg-transparent border-transparent hover:bg-(--vestara-accent-bg) hover:border-(--vestara-accent-border)'
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-center gap-2.5">
        <span className={`relative inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[presence]}`}>
          {presence === 'active' && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--vestara-green) opacity-40" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`truncate text-xs font-medium ${selected ? 'text-(--vestara-text)' : 'text-(--vestara-text-2)'}`}
            >
              {agent.name}
            </span>
            {lastActivity && <span className="shrink-0 text-[9px] text-(--vestara-text-dim)">{lastActivity}</span>}
          </div>
          <div className="truncate text-[10px] text-(--vestara-text-muted) mt-0.5">
            {agent.status === 'idle' ? 'Idle' : agent.currentTask || agent.detail || agent.status.replace('-', ' ')}
          </div>
        </div>
      </div>
    </button>
  );
}
