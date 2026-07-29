/**
 * NotificationsPage — full notification center view.
 *
 * Architecture Traceability:
 *   v7.6 — Notification Center & Alerting
 */

import { useNotifications } from '../lib/notifications';

const TYPE_COLORS: Record<string, string> = {
  error: 'text-red-400 border-red-400/30 bg-red-400/5',
  agent: 'text-blue-400 border-blue-400/30 bg-blue-400/5',
  info: 'text-(--vestara-text-muted) border-(--vestara-accent-border) bg-transparent',
};

const TYPE_ICONS: Record<string, string> = {
  error: '✗',
  agent: '●',
  info: '◈',
};

export default function NotificationsPage() {
  const { notifications, unreadCount, markRead, markAllRead, refresh, loading } = useNotifications();

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-(--vestara-text)">Notifications</h1>
          <p className="text-sm text-(--vestara-text-muted) mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
              : 'No unread notifications'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            className="px-3 py-1.5 text-sm rounded-lg border border-(--vestara-accent-border) text-(--vestara-text) hover:bg-(--color-zinc-900) transition-colors cursor-pointer"
          >
            Refresh
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="px-3 py-1.5 text-sm rounded-lg bg-(--vestara-accent) text-white hover:opacity-90 transition-opacity cursor-pointer"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-sm text-(--vestara-text-muted)">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl text-(--vestara-text-muted) mb-3">◈</div>
          <p className="text-sm text-(--vestara-text-muted)">No notifications yet</p>
          <p className="text-xs text-(--vestara-text-muted) mt-1">
            Notifications will appear here when plans are created, agents run, or changes are applied.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const colorClass = TYPE_COLORS[n.type] || TYPE_COLORS.info;
            const icon = TYPE_ICONS[n.type] || TYPE_ICONS.info;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-4 px-4 py-3 rounded-xl border transition-colors ${colorClass} ${
                  !n.read ? 'ring-1 ring-(--vestara-accent)/20' : ''
                }`}
                onClick={() => {
                  if (!n.read) markRead(n.id);
                }}
              >
                {/* Icon */}
                <span className="mt-0.5 shrink-0 text-sm">{icon}</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.read ? 'text-(--vestara-text-muted)' : 'text-(--vestara-text) font-medium'}`}>
                    {n.message}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-(--vestara-text-muted)">{n.actorName}</span>
                    <span className="text-xs text-(--vestara-text-muted)">·</span>
                    <span className="text-xs text-(--vestara-text-muted) capitalize">{n.category}</span>
                    <span className="text-xs text-(--vestara-text-muted)">·</span>
                    <span className="text-xs text-(--vestara-text-muted)">{new Date(n.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                {/* Unread indicator */}
                {!n.read && <span className="shrink-0 w-2 h-2 rounded-full bg-(--vestara-accent) mt-2" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
