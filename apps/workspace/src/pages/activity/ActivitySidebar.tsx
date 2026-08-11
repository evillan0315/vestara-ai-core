import { useMemo } from 'react';
import { useTelemetryStore } from '../../contexts/TelemetryContext';
import AgentListItem, { type PresenceGroup, presenceOf } from './AgentListItem';
import { formatRelative } from './activity-formatters';
import type { ActivityRecord } from './activity-types';

interface ActivitySidebarProps {
  records: readonly ActivityRecord[];
  selectedAgentId: string | undefined;
  onSelectAgent: (agentId: string | undefined) => void;
}

const SECTION_LABELS: Array<{ key: PresenceGroup; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'idle', label: 'Idle' },
  { key: 'failed', label: 'Failed' },
];

function lastActivityFor(records: readonly ActivityRecord[], agentId: string): string | undefined {
  let latest: ActivityRecord | undefined;
  for (const record of records) {
    const owner = record.kind === 'agent-message' ? record.agentId : record.actor.id;
    if (owner !== agentId) continue;
    if (latest === undefined || record.sequence > latest.sequence) latest = record;
  }
  return latest ? formatRelative(latest.timestamp) : undefined;
}

export default function ActivitySidebar({ records, selectedAgentId, onSelectAgent }: ActivitySidebarProps) {
  const telemetry = useTelemetryStore();

  const agents = useMemo(
    () =>
      [...telemetry.agents].sort((left, right) => {
        const weight = (agent: typeof left) => {
          switch (presenceOf(agent.status)) {
            case 'active':
              return 0;
            case 'waiting':
              return 1;
            case 'idle':
              return 2;
            case 'failed':
              return 3;
          }
        };
        return weight(left) - weight(right) || left.name.localeCompare(right.name);
      }),
    [telemetry.agents],
  );

  const sections = useMemo(() => {
    const grouped = new Map<PresenceGroup, typeof agents>();
    for (const agent of agents) {
      const group = presenceOf(agent.status);
      grouped.set(group, [...(grouped.get(group) ?? []), agent]);
    }
    return grouped;
  }, [agents]);

  const activeCount = agents.filter((agent) => presenceOf(agent.status) === 'active').length;
  const waitingCount = agents.filter((agent) => presenceOf(agent.status) === 'waiting').length;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="px-3">
        <button
          type="button"
          onClick={() => onSelectAgent(undefined)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left cursor-pointer transition-colors ${
            selectedAgentId === undefined
              ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border)'
              : 'bg-transparent border-transparent hover:bg-(--vestara-accent-bg)'
          }`}
        >
          <span className="text-xs font-medium text-(--vestara-text-2)">All Agents</span>
          <span className="text-[10px] text-(--vestara-text-muted)">
            {activeCount} active{waitingCount > 0 ? ` · ${waitingCount} waiting` : ''}
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
        {agents.length === 0 ? (
          <p className="px-3 text-[10px] text-(--vestara-text-muted)">No participants yet.</p>
        ) : (
          SECTION_LABELS.map(({ key, label }) => {
            const members = sections.get(key) ?? [];
            if (members.length === 0) return null;
            return (
              <div key={key}>
                <div className="px-3 pb-1 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">{label}</div>
                <div className="space-y-0.5">
                  {members.map((agent) => (
                    <AgentListItem
                      key={agent.id}
                      agent={agent}
                      selected={selectedAgentId === agent.id}
                      lastActivity={lastActivityFor(records, agent.id)}
                      onSelect={(agentId) => onSelectAgent(agentId)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
