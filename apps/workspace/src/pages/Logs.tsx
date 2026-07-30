import { useCallback, useEffect, useMemo, useState } from 'react';

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
  conversation: '#6366f1', workspace: '#3b82f6', planning: '#f59e0b',
  implementation: '#ef4444', verification: '#10b981', collaboration: '#8b5cf6',
  agent: '#06b6d4', memory: '#ec4899', profile: '#14b8a6', system: '#6b7280',
};

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: accent }}>
      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">{label}</div>
      <div className="text-lg font-bold mt-1" style={{ color: (typeof value === 'number' && value > 0) ? accent : 'var(--vestara-text)' }}>{value}</div>
    </div>
  );
}

export default function Logs() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/activity-log');
      if (r.ok) { const d = await r.json(); setEvents(d.events ?? []); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => [...new Set(events.map((e) => e.category))], [events]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.category] = (counts[e.category] || 0) + 1;
    return counts;
  }, [events]);

  const filtered = events.filter((e) => {
    if (filter !== 'all' && e.category !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return e.message.toLowerCase().includes(q) || e.type.toLowerCase().includes(q) || e.actor.name.toLowerCase().includes(q);
    }
    return true;
  });

  // CSV export
  const exportCsv = () => {
    const csv = ['timestamp,category,type,actor,message', ...filtered.map((e) =>
      `"${new Date(e.timestamp).toISOString()}","${e.category}","${e.type}","${e.actor.name}","${e.message.replace(/"/g, '""')}"`
    )].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `vestara-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <div className="w-full py-16 text-center text-(--vestara-text-muted) animate-pulse">Loading logs...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Activity Log</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">{events.length} events · {categories.length} categories</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--vestara-text-dim) text-[10px]">🔍</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs..." className="w-40 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg pl-7 pr-2 py-1.5 text-[10px] text-(--vestara-text) placeholder-(--vestara-text-dim) outline-none" />
          </div>
          <button onClick={exportCsv} className="text-[9px] px-2 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-md hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) transition-colors cursor-pointer" title="Export CSV">⬇ CSV</button>
          <button onClick={load} className="text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer text-sm">↻</button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
        <StatCard label="Total Events" value={events.length} accent="#8b5cf6" />
        <StatCard label="Categories" value={categories.length} accent="#6366f1" />
        {categories.slice(0, 4).map((cat) => (
          <StatCard key={cat} label={cat} value={categoryCounts[cat] || 0} accent={CATEGORY_COLORS[cat] || '#6b7280'} />
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1 flex-wrap mb-4">
        <button onClick={() => setFilter('all')}
          className={`text-[9px] px-2 py-0.5 rounded cursor-pointer transition-colors ${filter === 'all' ? 'bg-(--vestara-accent-bg) text-(--vestara-text) font-medium border border-(--vestara-accent-border)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'}`}>
          All <span className="text-[8px] text-(--vestara-text-dim)">{events.length}</span>
        </button>
        {categories.map((cat) => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`text-[9px] px-2 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1 ${filter === cat ? 'bg-(--vestara-accent-bg) text-(--vestara-text) font-medium border border-(--vestara-accent-border)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'}`}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: CATEGORY_COLORS[cat] || '#6b7280' }} />
            {cat} <span className="text-[8px] text-(--vestara-text-dim)">{categoryCounts[cat]}</span>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
          <p className="text-sm text-(--vestara-text-muted)">No matching log events</p>
        </div>
      )}

      {/* Event list */}
      <div className="space-y-1">
        {filtered.map((e) => (
          <div key={e.id} className="flex items-start gap-2 p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: CATEGORY_COLORS[e.category] || '#6b7280' }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[9px]">
                <span className="text-(--vestara-text-dim) font-mono">{new Date(e.timestamp).toLocaleTimeString()}</span>
                <span className="text-(--vestara-text-dim)">·</span>
                <span className="uppercase font-medium" style={{ color: CATEGORY_COLORS[e.category] || '#6b7280' }}>{e.category}</span>
                <span className="text-(--vestara-text-2)">{e.type}</span>
                <span className="ml-auto text-(--vestara-text-dim) text-[8px]">{e.actor.name}</span>
              </div>
              <div className="text-[10px] text-(--vestara-text) mt-0.5">{e.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
