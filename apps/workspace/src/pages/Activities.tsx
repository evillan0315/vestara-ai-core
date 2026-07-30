import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotifications } from '../lib/notifications';

interface LogEvent {
  id: string; timestamp: string; category: string; type: string;
  actor: { id: string; name: string; type: string };
  resource: { type: string; id: string; name: string };
  message: string; metadata?: Record<string, unknown>;
}

const CATEGORY_COLORS: Record<string, string> = {
  conversation: '#6366f1', workspace: '#3b82f6', planning: '#f59e0b',
  implementation: '#ef4444', verification: '#10b981', collaboration: '#8b5cf6',
  agent: '#06b6d4', memory: '#ec4899', profile: '#14b8a6', system: '#6b7280',
};

const NOTIFICATION_STYLES: Record<string, string> = {
  error: 'text-red-400 border-red-400/30 bg-red-400/5',
  agent: 'text-blue-400 border-blue-400/30 bg-blue-400/5',
  info: 'text-(--vestara-text-2) border-(--vestara-accent-border) bg-(--vestara-accent-bg)',
};

const NOTIFICATION_ICONS: Record<string, string> = { error: '✗', agent: '●', info: '◈' };

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: accent }}>
      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">{label}</div>
      <div className="text-lg font-bold text-(--vestara-text) mt-1">{value}</div>
    </div>
  );
}

type Tab = 'notifications' | 'activity';

export default function Activities() {
  const [tab, setTab] = useState<Tab>('notifications');
  const [logEvents, setLogEvents] = useState<LogEvent[]>([]);
  const [logLoading, setLogLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const { notifications, unreadCount, markRead, markAllRead, refresh: refreshNotifs, loading: notifLoading } = useNotifications();

  const loadLogs = useCallback(async () => {
    try {
      const r = await fetch('/api/activity-log');
      if (r.ok) { const d = await r.json(); setLogEvents(d.events ?? []); }
    } catch {}
    setLogLoading(false);
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const categories = useMemo(() => [...new Set(logEvents.map((e) => e.category))], [logEvents]);
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of logEvents) counts[e.category] = (counts[e.category] || 0) + 1;
    return counts;
  }, [logEvents]);

  const notifStats = useMemo(() => {
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const n of notifications) {
      byType[n.type] = (byType[n.type] || 0) + 1;
      byCategory[n.category] = (byCategory[n.category] || 0) + 1;
    }
    return { byType, byCategory, total: notifications.length };
  }, [notifications]);

  const filteredLogs = logEvents.filter((e) => {
    if (filter !== 'all' && e.category !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return e.message.toLowerCase().includes(q) || e.type.toLowerCase().includes(q) || e.actor.name.toLowerCase().includes(q);
    }
    return true;
  });

  const exportCsv = () => {
    const csv = ['timestamp,category,type,actor,message', ...filteredLogs.map((e) =>
      `"${new Date(e.timestamp).toISOString()}","${e.category}","${e.type}","${e.actor.name}","${e.message.replace(/"/g, '""')}"`
    )].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `vestara-activity-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Activities</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            {notifications.length} notifications · {logEvents.length} log events
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'activity' && (
            <>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--vestara-text-dim) text-[10px]">🔍</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-36 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg pl-7 pr-2 py-1.5 text-[10px] text-(--vestara-text) placeholder-(--vestara-text-dim) outline-none" />
              </div>
              <button onClick={exportCsv} className="text-[9px] px-2 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-md hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) transition-colors cursor-pointer" title="Export CSV">⬇ CSV</button>
            </>
          )}
          {tab === 'notifications' && unreadCount > 0 && (
            <button onClick={markAllRead}
              className="text-xs px-3 py-1.5 bg-(--vestara-accent) text-white rounded-lg hover:opacity-90 transition-opacity cursor-pointer font-medium">Mark all read</button>
          )}
          <button onClick={() => { tab === 'notifications' ? refreshNotifs() : loadLogs(); }}
            className="text-xs px-2 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) transition-colors cursor-pointer" title="Refresh">↻</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 mb-5 bg-(--vestara-accent-bg) rounded-lg p-0.5 w-fit">
        <button onClick={() => setTab('notifications')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${tab === 'notifications' ? 'bg-(--vestara-accent-bg) text-(--vestara-text) border border-(--vestara-accent-border)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'}`}>
          Notifications {unreadCount > 0 && <span className="ml-1 text-[10px] text-(--vestara-accent)">({unreadCount})</span>}
        </button>
        <button onClick={() => setTab('activity')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${tab === 'activity' ? 'bg-(--vestara-accent-bg) text-(--vestara-text) border border-(--vestara-accent-border)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'}`}>
          Log Activity
        </button>
      </div>

      {/* Tab: Notifications */}
      {tab === 'notifications' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
            <StatCard label="Total" value={notifStats.total} accent="#8b5cf6" />
            <StatCard label="Unread" value={unreadCount} accent={unreadCount > 0 ? '#f59e0b' : '#52525b'} />
            <StatCard label="Errors" value={notifStats.byType['error'] || 0} accent={notifStats.byType['error'] ? '#ef4444' : '#52525b'} />
            <StatCard label="Agent" value={notifStats.byType['agent'] || 0} accent="#3b82f6" />
            <StatCard label="Info" value={notifStats.byType['info'] || 0} accent="#10b981" />
            <StatCard label="Categories" value={Object.keys(notifStats.byCategory).length} accent="#6366f1" />
          </div>

          {notifLoading ? (
            <div className="text-center py-12 text-sm text-(--vestara-text-muted)">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
              <div className="text-4xl text-(--vestara-text-2) mb-3">◈</div>
              <p className="text-sm text-(--vestara-text-2)">No notifications yet</p>
              <p className="text-xs text-(--vestara-text-muted) mt-1">Notifications appear here when plans are created, agents run, or changes are applied.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <div key={n.id} className={`flex items-start gap-4 px-4 py-3 rounded-xl border transition-colors cursor-pointer ${NOTIFICATION_STYLES[n.type] || NOTIFICATION_STYLES.info} ${!n.read ? 'ring-1 ring-(--vestara-accent)/20' : ''}`}
                  onClick={() => { if (!n.read) markRead(n.id); }}>
                  <span className="mt-0.5 shrink-0 text-sm">{NOTIFICATION_ICONS[n.type] || NOTIFICATION_ICONS.info}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${n.read ? 'text-(--vestara-text-muted)' : 'text-(--vestara-text) font-medium'}`}>{n.message}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-(--vestara-text-muted)">
                      <span>{n.actorName}</span><span>·</span><span className="capitalize">{n.category}</span><span>·</span>
                      <span>{new Date(n.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                  {!n.read && <span className="shrink-0 w-2 h-2 rounded-full bg-(--vestara-accent) mt-2" />}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab: Activity Log */}
      {tab === 'activity' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
            <StatCard label="Total Events" value={logEvents.length} accent="#8b5cf6" />
            <StatCard label="Categories" value={categories.length} accent="#6366f1" />
            {categories.slice(0, 4).map((cat) => (
              <StatCard key={cat} label={cat} value={categoryCounts[cat] || 0} accent={CATEGORY_COLORS[cat] || '#6b7280'} />
            ))}
          </div>

          {logLoading ? (
            <div className="text-center py-12 text-sm text-(--vestara-text-muted) animate-pulse">Loading logs...</div>
          ) : (
            <>
              <div className="flex gap-1 flex-wrap mb-4">
                <button onClick={() => setFilter('all')}
                  className={`text-[9px] px-2 py-0.5 rounded cursor-pointer transition-colors ${filter === 'all' ? 'bg-(--vestara-accent-bg) text-(--vestara-text) font-medium border border-(--vestara-accent-border)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'}`}>
                  All <span className="text-[8px] text-(--vestara-text-dim)">{logEvents.length}</span>
                </button>
                {categories.map((cat) => (
                  <button key={cat} onClick={() => setFilter(cat)}
                    className={`text-[9px] px-2 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1 ${filter === cat ? 'bg-(--vestara-accent-bg) text-(--vestara-text) font-medium border border-(--vestara-accent-border)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'}`}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: CATEGORY_COLORS[cat] || '#6b7280' }} />
                    {cat} <span className="text-[8px] text-(--vestara-text-dim)">{categoryCounts[cat]}</span>
                  </button>
                ))}
              </div>

              {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
                  <p className="text-sm text-(--vestara-text-muted)">No matching log events</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredLogs.map((e) => (
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
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
