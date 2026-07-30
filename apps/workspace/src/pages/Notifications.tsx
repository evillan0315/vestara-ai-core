import { useMemo } from 'react';
import { useNotifications } from '../lib/notifications';

const TYPE_STYLES: Record<string, string> = {
  error: 'text-red-400 border-red-400/30 bg-red-400/5',
  agent: 'text-blue-400 border-blue-400/30 bg-blue-400/5',
  info: 'text-(--vestara-text-2) border-(--vestara-accent-border) bg-(--vestara-accent-bg)',
};

const TYPE_ICONS: Record<string, string> = {
  error: '✗',
  agent: '●',
  info: '◈',
};

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

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const n of notifications) {
      byType[n.type] = (byType[n.type] || 0) + 1;
      byCategory[n.category] = (byCategory[n.category] || 0) + 1;
    }
    return { byType, byCategory, total: notifications.length };
  }, [notifications]);

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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total" value={stats.total} accent="#8b5cf6" />
        <StatCard label="Unread" value={unreadCount} accent={unreadCount > 0 ? '#f59e0b' : '#52525b'} />
        <StatCard label="Errors" value={stats.byType['error'] || 0} accent={stats.byType['error'] ? '#ef4444' : '#52525b'} />
        <StatCard label="Agent" value={stats.byType['agent'] || 0} accent="#3b82f6" />
        <StatCard label="Info" value={stats.byType['info'] || 0} accent="#10b981" />
        <StatCard label="Categories" value={Object.keys(stats.byCategory).length} accent="#6366f1" />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-sm text-(--vestara-text-muted)">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-4xl text-(--vestara-text-2) mb-3">◈</div>
          <p className="text-sm text-(--vestara-text-2)">No notifications yet</p>
          <p className="text-xs text-(--vestara-text-muted) mt-1">
            Notifications will appear here when plans are created, agents run, or changes are applied.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const style = TYPE_STYLES[n.type] || TYPE_STYLES.info;
            const icon = TYPE_ICONS[n.type] || TYPE_ICONS.info;
            return (
              <div key={n.id}
                className={`flex items-start gap-4 px-4 py-3 rounded-xl border transition-colors cursor-pointer ${style} ${!n.read ? 'ring-1 ring-(--vestara-accent)/20' : ''}`}
                onClick={() => { if (!n.read) markRead(n.id); }}>
                <span className="mt-0.5 shrink-0 text-sm">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.read ? 'text-(--vestara-text-muted)' : 'text-(--vestara-text) font-medium'}`}>{n.message}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-(--vestara-text-muted)">
                    <span>{n.actorName}</span><span>·</span><span className="capitalize">{n.category}</span><span>·</span>
                    <span>{new Date(n.timestamp).toLocaleString()}</span>
                  </div>
                </div>
                {!n.read && <span className="shrink-0 w-2 h-2 rounded-full bg-(--vestara-accent) mt-2" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
