import { useMemo } from 'react';
import { useTelemetryStore } from '../../contexts/TelemetryContext';
import AgentListItem, { type PresenceGroup, presenceOf } from './AgentListItem';
import { formatRelative } from './activity-formatters';
import type { ActivityRecord } from './activity-types';

export interface WorkflowParticipant {
  workflowId: string;
  role: string;
  agentId: string;
  threadId: string;
  executionState: string;
  lastActivityAt?: string;
  lastActivity?: string;
}

interface ActivitySidebarProps {
  records: readonly ActivityRecord[];
  selectedAgentId: string | undefined;
  onSelectAgent: (agentId: string | undefined) => void;
  /** Real participants of the selected workflow; falls back to the agent catalog. */
  participants?: readonly WorkflowParticipant[];
  /** Unread (pending-observation) human-message count per agent id. */
  unreadByAgent?: Readonly<Record<string, number>>;
}

const SECTION_LABELS: Array<{ key: PresenceGroup; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'idle', label: 'Idle' },
  { key: 'failed', label: 'Failed' },
];

const STATE_COLOR: Record<string, string> = {
  active: 'text-(--vestara-green)',
  reasoning: 'text-(--vestara-amber)',
  preparing: 'text-(--vestara-amber)',
  waiting: 'text-(--vestara-text-muted)',
  queued: 'text-(--vestara-text-muted)',
  completed: 'text-(--vestara-green)',
  failed: 'text-(--vestara-red)',
  cancelled: 'text-(--vestara-red)',
  stalled: 'text-(--vestara-red)',
};

function lastActivityFor(records: readonly ActivityRecord[], agentId: string): string | undefined {
  let latest: ActivityRecord | undefined;
  for (const record of records) {
    const owner = record.kind === 'agent-message' ? record.agentId : record.actor.id;
    if (owner !== agentId) continue;
    if (latest === undefined || record.sequence > latest.sequence) latest = record;
  }
  return latest ? formatRelative(latest.timestamp) : undefined;
}

export default function ActivitySidebar({
  records,
  selectedAgentId,
  onSelectAgent,
  participants,
  unreadByAgent,
}: ActivitySidebarProps) {
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

  const activeCount = participants
    ? participants.filter((participant) => ['active', 'running', 'reasoning'].includes(participant.executionState))
        .length
    : agents.filter((agent) => presenceOf(agent.status) === 'active').length;
  const waitingCount = participants
    ? participants.filter((participant) => ['waiting', 'queued', 'pending'].includes(participant.executionState)).length
    : agents.filter((agent) => presenceOf(agent.status) === 'waiting').length;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="px-1 sm:px-3">
        <button
          type="button"
          onClick={() => onSelectAgent(undefined)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left cursor-pointer transition-colors ${
            selectedAgentId === undefined
              ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border)'
              : 'bg-transparent border-transparent hover:bg-(--vestara-accent-bg)'
          }`}
        >
          <span className="text-xs font-medium text-(--vestara-text-2)">
            {participants && participants.length > 0 ? 'Workflow Participants' : 'All Agents'}
          </span>
          <span className="text-[10px] text-(--vestara-text-muted)">
            {activeCount} active{waitingCount > 0 ? ` · ${waitingCount} waiting` : ''}
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
        {participants && participants.length > 0 ? (
          participants.map((participant) => (
            <button
              key={participant.threadId}
              type="button"
              onClick={() => onSelectAgent(selectedAgentId === participant.agentId ? undefined : participant.agentId)}
              className={`w-full px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                selectedAgentId === participant.agentId
                  ? 'border-(--vestara-accent) bg-(--vestara-accent-bg)'
                  : 'border-(--vestara-accent-border) bg-(--vestara-accent-bg) hover:border-(--vestara-accent-border-hover)'
              }`}
              aria-pressed={selectedAgentId === participant.agentId}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-(--vestara-text-2)">
                  {participant.role[0].toUpperCase() + participant.role.slice(1)}
                </span>
                <span className="flex items-center gap-1.5">
                  {(unreadByAgent?.[participant.agentId] ?? 0) > 0 && (
                    <span
                      className="flex h-4 min-w-4 items-center justify-center rounded-full bg-(--vestara-amber) px-1 text-[9px] font-semibold text-black"
                      title={`${unreadByAgent?.[participant.agentId]} unread human message(s)`}
                    >
                      {unreadByAgent?.[participant.agentId]}
                    </span>
                  )}
                  <span
                    className={`text-[10px] ${STATE_COLOR[participant.executionState] ?? 'text-(--vestara-text-muted)'}`}
                  >
                    {participant.executionState}
                  </span>
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-(--vestara-text-muted)">{participant.agentId}</div>
              {participant.lastActivityAt && (
                <div className="mt-1 text-[9px] text-(--vestara-text-dim)">
                  Last activity: {formatRelative(participant.lastActivityAt)}
                  {participant.lastActivity ? ` — ${participant.lastActivity.slice(0, 40)}` : ''}
                </div>
              )}
            </button>
          ))
        ) : agents.length === 0 ? (
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
