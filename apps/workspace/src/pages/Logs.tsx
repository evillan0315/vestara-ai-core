import { useCallback, useEffect, useState } from 'react';

interface LogEvent {
  id: string;
  timestamp: string;
  category: string;
  type: string;
  actor: { id: string; name: string; type: string };
  resource: { type: string; id: string; name: string };
  message: string;
  metadata?: Record<string, unknown>;
}

const CATEGORY_COLORS: Record<string, string> = {
  conversation: '#6366f1',
  workspace: '#3b82f6',
  planning: '#f59e0b',
  implementation: '#ef4444',
  verification: '#10b981',
  collaboration: '#8b5cf6',
  agent: '#06b6d4',
  memory: '#ec4899',
  profile: '#14b8a6',
  system: '#6b7280',
};

export default function Logs() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/activity-log');
      if (r.ok) {
        const d = await r.json();
        setEvents(d.events ?? []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = [...new Set(events.map((e) => e.category))];
  const filtered = events.filter((e) => {
    if (filter !== 'all' && e.category !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        e.message.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        e.actor.name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) return <div className="w-full px-4 py-16 text-center text-zinc-600 animate-pulse">Loading logs...</div>;

  return (
    <div className="w-full px-4">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">Activity Log</h1>
          <p className="text-[10px] text-zinc-600 mt-0.5">{events.length} events</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-700 text-[9px]">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="w-40 bg-zinc-800 border border-zinc-700 rounded-lg pl-6 pr-2 py-1.5 text-[10px] text-zinc-300 placeholder-zinc-700 outline-none"
            />
          </div>
          <button onClick={load} className="text-zinc-600 hover:text-zinc-400 cursor-pointer text-sm">
            ↻
          </button>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`text-[9px] px-2 py-0.5 rounded cursor-pointer transition-colors ${filter === 'all' ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-400'}`}
        >
          All <span className="text-[8px] text-zinc-600">{events.length}</span>
        </button>
        {categories.map((cat) => {
          const count = events.filter((e) => e.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`text-[9px] px-2 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1 ${filter === cat ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-400'}`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[cat] || '#6b7280' }}
              />
              {cat} <span className="text-[8px] text-zinc-600">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-zinc-900/30 border border-zinc-800 rounded-lg text-center">
          <p className="text-sm text-zinc-600">No matching log events</p>
        </div>
      )}

      <div className="space-y-1">
        {filtered.map((e) => (
          <div
            key={e.id}
            className="flex items-start gap-2 p-2 bg-zinc-900/30 border border-zinc-800 rounded-lg border-l-[3px]"
            style={{ borderLeftColor: CATEGORY_COLORS[e.category] || '#6b7280' }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[9px]">
                <span className="text-zinc-700 font-mono">{new Date(e.timestamp).toLocaleTimeString()}</span>
                <span className="text-zinc-700">·</span>
                <span className="uppercase font-medium" style={{ color: CATEGORY_COLORS[e.category] || '#6b7280' }}>
                  {e.category}
                </span>
                <span className="text-zinc-600">{e.type}</span>
                <span className="ml-auto text-zinc-700 text-[8px]">{e.actor.name}</span>
              </div>
              <div className="text-[10px] text-zinc-300 mt-0.5">{e.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
