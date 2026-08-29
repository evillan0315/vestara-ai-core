import { useMemo, useState } from 'react';
import Pagination from '../../components/Pagination';
import type { LiveEvent } from '../../lib/useEventStream';

const ACTIVITY_PAGE_SIZE = 8;

interface LiveActivityPanelProps {
  events: LiveEvent[];
}

export default function LiveActivityPanel({ events }: LiveActivityPanelProps) {
  const [activityPage, setActivityPage] = useState(1);
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');

  const agentEvents = useMemo(() => events.filter((e) => e.actor.type === 'agent'), [events]);

  const agentNames = useMemo(() => {
    const names = new Set(agentEvents.map((e) => e.actor.name));
    return Array.from(names).sort();
  }, [agentEvents]);

  const filteredEvents = useMemo(() => {
    let result = agentEvents;
    if (agentFilter !== 'all') {
      result = result.filter((e) => e.actor.name === agentFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) => e.message.toLowerCase().includes(q) || e.actor.name.toLowerCase().includes(q),
      );
    }
    return result;
  }, [agentEvents, agentFilter, search]);

  const groupedEvents = useMemo(() => {
    const groups: Record<string, LiveEvent[]> = {};
    for (const e of filteredEvents) {
      if (!groups[e.actor.name]) groups[e.actor.name] = [];
      groups[e.actor.name].push(e);
    }
    return groups;
  }, [filteredEvents]);

  const groupedKeys = useMemo(() => Object.keys(groupedEvents).sort(), [groupedEvents]);

  const pagedEvents = useMemo(() => {
    const flat: Array<{ agent: string; event: LiveEvent }> = [];
    for (const agent of groupedKeys) {
      for (const event of groupedEvents[agent]) {
        flat.push({ agent, event });
      }
    }
    return flat;
  }, [groupedKeys, groupedEvents]);

  const pageStart = (activityPage - 1) * ACTIVITY_PAGE_SIZE;
  const pagedSlice = pagedEvents.slice(pageStart, pageStart + ACTIVITY_PAGE_SIZE);

  // Group the paged slice by agent for display
  const displayGroups: Record<string, LiveEvent[]> = {};
  for (const { agent, event } of pagedSlice) {
    if (!displayGroups[agent]) displayGroups[agent] = [];
    displayGroups[agent].push(event);
  }

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <span className="w-1 h-3 rounded-full bg-blue-500/60" /> Live Activity
        <span className="text-(--vestara-text-dim) font-normal">({filteredEvents.length})</span>
      </h3>

      {/* Search and filter */}
      <div className="flex gap-2 mb-2">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setActivityPage(1); }}
          placeholder="Search activity..."
          className="flex-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-md px-2 py-1 text-[10px] text-(--vestara-text-2) placeholder:text-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active)"
        />
        <select
          value={agentFilter}
          onChange={(e) => { setAgentFilter(e.target.value); setActivityPage(1); }}
          className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-md text-[10px] px-1.5 py-1 outline-none cursor-pointer"
        >
          <option value="all">All agents</option>
          {agentNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div className="max-h-48 overflow-y-auto space-y-2">
        {pagedEvents.length === 0 ? (
          <p className="text-[10px] text-(--vestara-text-dim) py-3 text-center italic">
            {search || agentFilter !== 'all' ? 'No matching activity' : 'No agent activity yet'}
          </p>
        ) : (
          Object.entries(displayGroups).map(([agent, evts]) => (
            <div key={agent}>
              <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-0.5 px-1">
                {agent}
              </div>
              <div className="space-y-0.5">
                {evts.map((e, i) => (
                  <div
                    key={e.id || i}
                    className="flex items-start gap-2 py-1 px-1 rounded hover:bg-(--vestara-accent-bg) transition-colors"
                  >
                    <span className="text-blue-400 shrink-0 mt-0.5 text-[11px]">●</span>
                    <div className="min-w-0">
                      <div className="text-[10px] text-(--vestara-text-2) truncate">{e.message}</div>
                      <div className="text-[8px] text-(--vestara-text-dim) truncate">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {pagedEvents.length > ACTIVITY_PAGE_SIZE && (
        <div className="border-t border-(--vestara-accent-border) pt-2 mt-2">
          <Pagination
            current={activityPage}
            total={pagedEvents.length}
            pageSize={ACTIVITY_PAGE_SIZE}
            onChange={setActivityPage}
          />
        </div>
      )}
    </div>
  );
}
