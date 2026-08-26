import { useMemo, useState } from 'react';
import Pagination from '../../components/Pagination';
import type { LiveEvent } from '../../lib/useEventStream';

const ACTIVITY_PAGE_SIZE = 8;

interface LiveActivityPanelProps {
  events: LiveEvent[];
}

export default function LiveActivityPanel({ events }: LiveActivityPanelProps) {
  const [activityPage, setActivityPage] = useState(1);

  const agentEvents = useMemo(() => events.filter((e) => e.actor.type === 'agent'), [events]);

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <span className="w-1 h-3 rounded-full bg-blue-500/60" /> Live Activity
        <span className="text-(--vestara-text-dim) font-normal">({agentEvents.length})</span>
      </h3>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {agentEvents.slice(0, 80).length === 0 ? (
          <p className="text-[10px] text-(--vestara-text-dim) py-3 text-center italic">No agent activity yet</p>
        ) : (
          agentEvents.slice((activityPage - 1) * ACTIVITY_PAGE_SIZE, activityPage * ACTIVITY_PAGE_SIZE).map((e, i) => (
            <div
              key={e.id || i}
              className="flex items-start gap-2 py-1 px-1 rounded hover:bg-(--vestara-accent-bg) transition-colors"
            >
              <span className="text-blue-400 shrink-0 mt-0.5 text-[11px]">●</span>
              <div className="min-w-0">
                <div className="text-[10px] text-(--vestara-text-2) truncate">{e.message}</div>
                <div className="text-[8px] text-(--vestara-text-dim) truncate">
                  {e.actor.name} · {new Date(e.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      {agentEvents.length > ACTIVITY_PAGE_SIZE && (
        <div className="border-t border-(--vestara-accent-border) pt-2 mt-2">
          <Pagination
            current={activityPage}
            total={agentEvents.length}
            pageSize={ACTIVITY_PAGE_SIZE}
            onChange={setActivityPage}
          />
        </div>
      )}
    </div>
  );
}
