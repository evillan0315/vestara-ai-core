import { useMemo, type ReactNode } from 'react';
import { AreaChartCard, BarChartCard } from '../charts';
import Section from './Section';
import { eventIcon, CATEGORY_COLORS, type LiveEvent } from './constants';

interface ActivityStreamProps {
  events: LiveEvent[];
  activityFilter: string;
  activitySearch: string;
  activityTimeRange: string;
  selectedEvent: LiveEvent | null;
  filterCounts: Record<string, number>;
  collapsed: boolean;
  onToggle: () => void;
  onFilterChange: (filter: string) => void;
  onSearchChange: (search: string) => void;
  onTimeRangeChange: (range: string) => void;
  onSelectEvent: (e: LiveEvent | null) => void;
  onLoadMore: () => void;
  onNewSession: () => void;
  renderWorkflowPicker: () => ReactNode;
}

export default function ActivityStream({
  events,
  activityFilter,
  activitySearch,
  activityTimeRange,
  selectedEvent,
  filterCounts,
  collapsed,
  onToggle,
  onFilterChange,
  onSearchChange,
  onTimeRangeChange,
  onSelectEvent,
  onLoadMore,
  renderWorkflowPicker,
}: ActivityStreamProps) {
  const sparkline = useMemo(() => {
    const now = Date.now();
    const hours = 24;
    const buckets = Array.from({ length: hours }, (_, i) => {
      const t = now - (hours - 1 - i) * 3600000;
      return { hour: `${i}h`, events: 0 };
    });
    for (const e of events) {
      const ts = new Date(e.timestamp).getTime();
      const idx = Math.floor((ts - (now - hours * 3600000)) / 3600000);
      if (idx >= 0 && idx < hours) buckets[idx].events++;
    }
    return buckets;
  }, [events]);

  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.category] = (counts[e.category] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count, color: CATEGORY_COLORS[category] || '#6b7280' }));
  }, [events]);

  const displayEvents = useMemo(() => {
    let f = events;
    if (activityFilter !== 'all') f = f.filter((e) => e.category === activityFilter || e.type === activityFilter);
    if (activitySearch) {
      const q = activitySearch.toLowerCase();
      f = f.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          e.actor.name.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q),
      );
    }
    return f.slice(0, 25);
  }, [events, activityFilter, activitySearch]);

  const filterOptions = useMemo(
    () => [
      { id: 'all', label: 'All' },
      ...Object.entries(filterCounts)
        .filter(([, c]) => c > 0)
        .map(([id, count]) => ({
          id,
          label: CATEGORY_COLORS[id] ? id.charAt(0).toUpperCase() + id.slice(1) : id,
          count,
        })),
    ],
    [filterCounts],
  );

  return (
    <Section
      title="Activity Stream"
      icon="⚡"
      collapsible
      collapsed={collapsed}
      onToggle={onToggle}
      action={
        <div className="flex items-center gap-1.5">
          <select
            value={activityTimeRange}
            onChange={(e) => onTimeRangeChange(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-[9px] px-1 py-0.5 outline-none cursor-pointer"
          >
            <option value="24h">24h</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="all">All</option>
          </select>
          {renderWorkflowPicker()}
        </div>
      }
    >
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterOptions.map((t: any) => (
            <button
              key={t.id}
              onClick={() => onFilterChange(activityFilter === t.id ? 'all' : t.id)}
              className={`text-[9px] px-2 py-0.5 rounded transition-colors cursor-pointer ${activityFilter === t.id ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-400'}`}
            >
              {t.label}
              <span className={`text-[8px] ml-1 ${activityFilter === t.id ? 'text-zinc-400' : 'text-zinc-700'}`}>
                {t.count || 0}
              </span>
            </button>
          ))}
        </div>

        <AreaChartCard data={sparkline} />

        <BarChartCard
          data={categoryBreakdown.slice(0, 6).map((c) => ({ name: c.category, value: c.count, color: c.color }))}
        />

        <div className="flex flex-wrap gap-1 mb-2">
          {categoryBreakdown.slice(0, 6).map((c) => (
            <button
              key={c.category}
              onClick={() => onFilterChange(activityFilter === c.category ? 'all' : c.category)}
              className="flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded transition-colors cursor-pointer"
              style={{ backgroundColor: `${c.color}15`, color: c.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} /> {c.category} ({c.count}
              )
            </button>
          ))}
        </div>

        <div className="relative">
          <input
            value={activitySearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded text-[9px] px-2 py-1 text-zinc-300 placeholder-zinc-700 outline-none"
          />
        </div>

        <div
          className="space-y-0.5 max-h-48 overflow-y-auto"
          onCopy={(e) =>
            selectedEvent && e.clipboardData?.setData('text/plain', JSON.stringify(selectedEvent, null, 2))
          }
        >
          {displayEvents.length === 0 && (
            <div className="text-[9px] text-zinc-700 py-4 text-center">No matching events</div>
          )}
          {displayEvents.map((e) => (
            <div
              key={e.id}
              onClick={() => onSelectEvent(selectedEvent?.id === e.id ? null : e)}
              className={`flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors text-[9px] ${selectedEvent?.id === e.id ? 'bg-zinc-800 ring-1 ring-zinc-700' : 'hover:bg-zinc-800/50'}`}
            >
              <span className="shrink-0 text-[11px]" title={e.type}>
                {eventIcon(e.type)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-[8px] text-zinc-700">
                  <span style={{ color: CATEGORY_COLORS[e.category] || '#6b7280' }} className="uppercase font-medium">
                    {e.category}
                  </span>
                  <span>·</span>
                  <span className="text-zinc-700">
                    {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="truncate text-zinc-300 text-[10px]">{e.message}</div>
              </div>
              <span className="text-[8px] text-zinc-700 truncate max-w-[60px]">{e.actor.name}</span>
            </div>
          ))}
        </div>

        {events.length > 25 && displayEvents.length >= 25 && (
          <button
            onClick={onLoadMore}
            className="w-full text-[9px] text-zinc-600 hover:text-zinc-400 py-1 border border-dashed border-zinc-800 rounded transition-colors cursor-pointer"
          >
            Load more
          </button>
        )}

        {selectedEvent && (
          <div className="p-2 bg-zinc-800/30 border border-zinc-700 rounded-lg space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-zinc-600" style={{ color: CATEGORY_COLORS[selectedEvent.category] }}>
                {selectedEvent.type}
              </span>
              <button
                onClick={() => onSelectEvent(null)}
                className="text-[8px] text-zinc-700 hover:text-zinc-400 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="text-zinc-300 text-[11px] leading-relaxed">{selectedEvent.message}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              {selectedEvent.actor && (
                <div>
                  <span className="text-zinc-600">Actor</span>
                  <div className="text-zinc-300">
                    {selectedEvent.actor.name} <span className="text-zinc-600">({selectedEvent.actor.type})</span>
                  </div>
                </div>
              )}
              {selectedEvent.resource && (
                <div>
                  <span className="text-zinc-600">Resource</span>
                  <div className="text-zinc-300">
                    {selectedEvent.resource.name} <span className="text-zinc-600">({selectedEvent.resource.type})</span>
                  </div>
                </div>
              )}
            </div>
            <div className="text-[9px] text-zinc-700">{new Date(selectedEvent.timestamp).toLocaleString()}</div>
          </div>
        )}
      </div>
    </Section>
  );
}
