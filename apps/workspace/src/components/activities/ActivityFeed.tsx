import Pagination from '../Pagination';

interface ActivityEvent {
  id: string;
  timestamp: string;
  category: string;
  type: string;
  message: string;
  actor?: { name: string; type?: string };
}

interface ActivityFeedProps {
  events: ActivityEvent[];
  title?: string;
  filter?: string;
  page: number;
  pageSize: number;
  maxHeight?: string;
  categoryIcons?: Record<string, string>;
  onFilterChange?: (filter: string) => void;
  onSelect?: (event: ActivityEvent) => void;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

const DEFAULT_CATEGORY_ICONS: Record<string, string> = { system: '◆', agent: '●', conversation: '◉' };
const CATEGORY_LABELS = ['all', 'system', 'conversation', 'agent'];

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function ActivityFeed({
  events, title = 'Activity Feed', filter = 'all', page, pageSize, maxHeight,
  categoryIcons = DEFAULT_CATEGORY_ICONS,
  onFilterChange, onSelect, onPageChange, loading = false,
}: ActivityFeedProps) {
  const filtered = filter === 'all' ? events : events.filter((e) => e.category === filter);
  const start = (page - 1) * pageSize;
  const display = filtered.slice(start, start + pageSize);

  return (
    <div className="flex flex-col" style={maxHeight ? { maxHeight } : undefined}>
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h2 className="text-xs font-semibold text-(--vestara-text-2) uppercase tracking-wider">
          {title} <span className="text-(--vestara-text-muted) font-normal text-[10px]">({filtered.length})</span>
        </h2>
        {onFilterChange && (
          <div className="flex gap-1">
            {CATEGORY_LABELS.map((cat) => (
              <button key={cat} onClick={() => onFilterChange(cat)}
                className={`text-[9px] px-2 py-0.5 rounded transition-colors cursor-pointer ${filter === cat ? 'bg-(--vestara-accent-bg) text-(--vestara-text) font-medium border border-(--vestara-accent-border)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'}`}>
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-2 space-y-0.5">
            {loading && filtered.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-5 h-5 border-2 border-(--vestara-accent) border-t-transparent rounded-full" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-2xl mb-2 opacity-30">◉</div>
                <p className="text-xs text-(--vestara-text-2)">No events yet</p>
                <p className="text-[10px] text-(--vestara-text-dim) mt-1">Events appear here as agents and the system process work</p>
              </div>
            )}
            {display.map((e, i) => (
              <div key={e.id || i} onClick={() => onSelect?.(e)}
                className="flex items-start gap-2.5 py-1.5 px-2 rounded-md transition-colors cursor-pointer hover:bg-(--vestara-accent-bg)">
                <span className="text-[9px] text-(--vestara-text-dim) font-mono shrink-0 w-14 pt-0.5">{formatRelativeTime(e.timestamp)}</span>
                <span className={`shrink-0 pt-0.5 text-[10px] ${e.actor?.type === 'agent' ? 'text-blue-400' : e.actor?.type === 'user' ? 'text-(--vestara-accent)' : 'text-(--vestara-text-2)'}`}>
                  {categoryIcons[e.category] || '◆'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-(--vestara-text) truncate">{e.message}</div>
                  <div className="text-[9px] text-(--vestara-text-dim) truncate">{e.actor?.name || 'system'} · {e.type}</div>
                </div>
                <span className="text-[7px] uppercase tracking-wider shrink-0 self-center bg-(--vestara-accent-bg) px-1.5 py-0.5 rounded text-(--vestara-text-muted) font-medium">{e.category}</span>
              </div>
            ))}
          </div>
        </div>
        {filtered.length > pageSize && (
          <div className="border-t border-(--vestara-accent-border) p-2 shrink-0">
            <Pagination current={page} total={filtered.length} pageSize={pageSize} onChange={onPageChange} />
          </div>
        )}
      </div>
    </div>
  );
}
