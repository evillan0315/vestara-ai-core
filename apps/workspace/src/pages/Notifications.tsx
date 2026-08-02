import { useMemo, useState } from 'react';
import { useNotifications } from '../lib/notifications';

const TYPE_STYLES: Record<string, string> = {
  error: 'text-red-400 border-red-400/30 bg-red-400/5',
  agent: 'text-blue-400 border-blue-400/30 bg-blue-400/5',
  info: 'text-(--vestara-text-2) border-(--vestara-accent-border) bg-(--vestara-accent-bg)',
  warning: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
  success: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5',
};

const TYPE_ICONS: Record<string, string> = {
  error: '✗',
  agent: '●',
  info: '◈',
  warning: '▲',
  success: '✓',
};

type Filter = 'all' | 'unread' | 'error' | 'warning' | 'agent' | 'info';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'error', label: 'Errors' },
  { id: 'warning', label: 'Warnings' },
  { id: 'agent', label: 'Agents' },
  { id: 'info', label: 'Info' },
];

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function matchesFilter(filter: Filter, type: string, read: boolean): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'unread':
      return !read;
    case 'error':
    case 'warning':
    case 'agent':
    case 'info':
      return type === filter;
  }
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: accent }}>
      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">{label}</div>
      <div className="text-lg font-bold text-(--vestara-text) mt-1">{value}</div>
    </div>
  );
}

export default function NotificationsPage() {
  const { notifications, unreadCount, markRead, markAllRead, refresh, loading } = useNotifications();
  const [filter, setFilter] = useState<Filter>('all');

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const n of notifications) {
      byType[n.type] = (byType[n.type] || 0) + 1;
      byCategory[n.category] = (byCategory[n.category] || 0) + 1;
    }
    return { byType, byCategory, total: notifications.length };
  }, [notifications]);

  const visible = useMemo(
    () => notifications.filter((n) => matchesFilter(filter, n.type, n.read)),
    [notifications, filter],
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Notifications</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            {stats.total} total · {unreadCount} unread
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh}
            className="text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) transition-colors cursor-pointer">
            ↻ Refresh
          </button>
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="text-xs px-3 py-1.5 bg-(--vestara-accent) text-white rounded-lg hover:opacity-90 transition-opacity cursor-pointer font-medium">
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
        <StatCard label="Total" value={stats.total} accent="#8b5cf6" />
        <StatCard label="Unread" value={unreadCount} accent={unreadCount > 0 ? '#f59e0b' : '#52525b'} />
        <StatCard label="Errors" value={stats.byType['error'] || 0} accent={stats.byType['error'] ? '#ef4444' : '#52525b'} />
        <StatCard label="Warnings" value={stats.byType['warning'] || 0} accent={stats.byType['warning'] ? '#f59e0b' : '#52525b'} />
        <StatCard label="Agent" value={stats.byType['agent'] || 0} accent="#3b82f6" />
        <StatCard label="Categories" value={Object.keys(stats.byCategory).length} accent="#6366f1" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
                active
                  ? 'bg-(--vestara-accent) border-(--vestara-accent) text-white font-medium'
                  : 'bg-(--vestara-accent-bg) border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text)'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-sm text-(--vestara-text-muted)">Loading notifications...</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-4xl text-(--vestara-text-2) mb-3">◈</div>
          <p className="text-sm text-(--vestara-text-2)">
            {notifications.length === 0 ? 'No notifications yet' : `No ${filter} notifications`}
          </p>
          <p className="text-xs text-(--vestara-text-muted) mt-1">
            Notifications will appear here when plans are created, agents run, or changes are applied.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((n) => {
            const style = TYPE_STYLES[n.type] || TYPE_STYLES.info;
            const icon = TYPE_ICONS[n.type] || TYPE_ICONS.info;
            return (
              <div key={n.id}
                className={`flex items-start gap-4 px-4 py-3 rounded-xl border transition-colors cursor-pointer ${style} ${!n.read ? 'ring-1 ring-(--vestara-accent)/20' : ''}`}
                onClick={() => { if (!n.read) markRead(n.id); }}
                title={new Date(n.timestamp).toLocaleString()}>
                <span className="mt-0.5 shrink-0 text-sm">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.read ? 'text-(--vestara-text-muted)' : 'text-(--vestara-text) font-medium'}`}>{n.message}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-(--vestara-text-muted)">
                    <span className="capitalize">{n.category}</span>
                    <span>·</span>
                    <span>{relativeTime(n.timestamp)}</span>
                    <span className="hidden sm:inline">·</span>
                    <span className="hidden sm:inline">{n.actorName}</span>
                  </div>
                </div>
                {!n.read && <span className="shrink-0 w-2 h-2 rounded-full bg-(--vestara-accent) mt-2 animate-pulse" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
