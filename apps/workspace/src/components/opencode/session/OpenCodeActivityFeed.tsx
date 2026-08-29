import { useEffect, useMemo, useRef, useState } from 'react';
import { OpenCodeActivityItem } from './OpenCodeActivityItem';
import type { OpenCodeActivityEvent } from './openCodeEventNormalizer';

export type OpenCodeActivityFilter = 'all' | 'messages' | 'tools' | 'files' | 'status' | 'errors';

interface OpenCodeActivityFeedProps {
  events: readonly OpenCodeActivityEvent[];
  followLive: boolean;
  unseenEventCount: number;
  onFollowChange: (follow: boolean) => void;
  onJumpToLatest: () => void;
}

const FILTERS: Array<{ id: OpenCodeActivityFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'messages', label: 'Messages' },
  { id: 'tools', label: 'Tools' },
  { id: 'files', label: 'Files' },
  { id: 'status', label: 'Status' },
  { id: 'errors', label: 'Errors' },
];

function matchesFilter(event: OpenCodeActivityEvent, filter: OpenCodeActivityFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'messages':
      return event.kind === 'message';
    case 'tools':
      return event.kind === 'tool';
    case 'files':
      return event.kind === 'file';
    case 'status':
      return event.kind === 'status';
    case 'errors':
      return event.kind === 'error';
    default:
      return true;
  }
}

export function OpenCodeActivityFeed({
  events,
  followLive,
  unseenEventCount,
  onFollowChange,
  onJumpToLatest,
}: OpenCodeActivityFeedProps) {
  const [filter, setFilter] = useState<OpenCodeActivityFilter>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => events.filter((event) => matchesFilter(event, filter)), [events, filter]);

  // Follow live: scroll to bottom when the event list grows while following.
  const eventCountRef = useRef(filtered.length);
  useEffect(() => {
    const grew = filtered.length !== eventCountRef.current;
    eventCountRef.current = filtered.length;
    if (followLive && grew && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, followLive]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    onFollowChange(atBottom);
  };

  return (
    <div className="flex flex-col h-full min-h-[320px]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`text-[9px] px-2 py-1 rounded transition-colors cursor-pointer ${
                filter === f.id
                  ? 'bg-(--vestara-accent-bg) text-(--vestara-text) border border-(--vestara-accent-border)'
                  : 'text-(--vestara-text-2) hover:text-(--vestara-text)'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {unseenEventCount > 0 && (
          <button
            type="button"
            onClick={onJumpToLatest}
            className="text-[9px] px-2 py-1 rounded bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-accent) hover:text-(--vestara-text) cursor-pointer"
          >
            Jump to latest · {unseenEventCount} new
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-1.5 overflow-auto pr-1"
        data-testid="activity-feed"
      >
        {filtered.length === 0 && <p className="p-4 text-[11px] text-(--vestara-text-muted)">No activity yet.</p>}
        {filtered.map((event) => (
          <OpenCodeActivityItem key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
