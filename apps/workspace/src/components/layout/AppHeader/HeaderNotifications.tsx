import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../../../lib/notifications';

export default function HeaderNotifications() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unread = notifications.filter((n) => !n.read).slice(0, 10);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex items-center justify-center w-10 h-10 rounded-xl accent-btn transition-colors"
        aria-label="Notifications"
      >
        <NotificationsRoundedIcon fontSize="small" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-500 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-(--vestara-accent-border) bg-(--color-zinc-950) shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-(--vestara-accent-border)">
            <span className="text-sm font-semibold text-(--vestara-text)">
              Notifications {unreadCount > 0 && <span className="text-(--vestara-text-muted) font-normal">({unreadCount} unread)</span>}
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-(--vestara-accent) hover:underline cursor-pointer"
                >
                  Mark all read
                </button>
              )}
              <Link to="/notifications" className="text-xs text-(--vestara-accent) hover:underline" onClick={() => setOpen(false)}>
                View all
              </Link>
            </div>
          </div>

          {unread.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-(--vestara-text-muted)">
              No new notifications
            </div>
          ) : (
            <div className="divide-y divide-(--vestara-accent-border)">
              {unread.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className="w-full text-left px-4 py-3 hover:bg-(--color-zinc-900) transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 shrink-0 text-xs ${
                        n.type === 'error'
                          ? 'text-red-400'
                          : n.type === 'agent'
                            ? 'text-blue-400'
                            : 'text-(--vestara-text-muted)'
                      }`}
                    >
                      {n.type === 'error' ? '✗' : n.type === 'agent' ? '●' : '◈'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-(--vestara-text) truncate">{n.message}</p>
                      <p className="text-xs text-(--vestara-text-muted) mt-0.5">{n.actorName} · {n.category}</p>
                    </div>
                    <span className="shrink-0 w-2 h-2 rounded-full bg-(--vestara-accent) mt-1.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
