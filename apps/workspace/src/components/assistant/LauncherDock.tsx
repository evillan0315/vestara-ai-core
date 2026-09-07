/**
 * GA-UI-008: LauncherDock
 *
 * Recent-conversations dock anchored to the floating launcher orb. Revealed
 * on hover while the assistant panel is closed; selecting a conversation
 * opens the assistant on it.
 *
 * Presentation only — selection authority stays with the GA-2 hook
 * (GET-only canonical selection; no POST, no new turn).
 */

export interface LauncherDockItem {
  id: string;
  title: string;
  updatedAt: string;
}

export interface LauncherDockProps {
  open: boolean;
  items: LauncherDockItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Hover bridge: entering the dock cancels the pending close timer. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/** Maximum conversations shown in the dock — most recent first. */
const MAX_ITEMS = 6;

function relativeTime(iso: string, now: number = Date.now()): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const minutes = Math.floor((now - ts) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function LauncherDock({
  open,
  items,
  selectedId,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}: LauncherDockProps) {
  if (!open) return null;
  const visible = items.slice(0, MAX_ITEMS);

  return (
    <div
      data-testid="launcher-dock"
      role="navigation"
      aria-label="Recent conversations"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="assistant-dock-enter fixed bottom-[5.25rem] right-6 z-[90] w-72 overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-950/95 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <span className="text-[11px] font-semibold tracking-tight text-zinc-300">Recent</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium text-amber-300/80">
          <svg className="h-2 w-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Vestara
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="px-3 pb-3 pt-1 text-[11px] text-zinc-600" data-testid="launcher-dock-empty">
          No conversations yet.
        </div>
      ) : (
        <ul className="min-w-0 max-h-64 space-y-0.5 overflow-y-auto px-1.5 pb-2">
          {visible.map((item) => {
            const isActive = item.id === selectedId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={`Open conversation: ${item.title}`}
                  className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-500/10 border border-amber-500/25 shadow-[0_0_12px_-4px_rgba(245,158,11,0.3)]'
                      : 'border border-transparent hover:bg-zinc-800/60 hover:border-zinc-700/30'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded bg-amber-500/20 text-amber-300"
                    >
                      <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate text-[12px] ${
                      isActive ? 'font-medium text-zinc-50' : 'text-zinc-300'
                    }`}
                  >
                    {item.title}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">
                    {relativeTime(item.updatedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
