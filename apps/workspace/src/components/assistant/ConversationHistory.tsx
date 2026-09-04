/**
 * GA-UI-006 — ConversationHistory
 *
 * Lightweight history popover inside the Floating Assistant. Presentation
 * only: renders Conversation Runtime list metadata (never messages),
 * temporal groups, local title search, and bounded state indicators.
 *
 * Authority rules:
 * - Selection loads canonical messages via the parent's hook; historical
 *   messages are NEVER replayed into OpenCode merely by opening/selecting.
 * - State indicators (● generating / ! failed) reflect the parent's live
 *   turn state for the SELECTED conversation only. No faked
 *   multi-conversation projections; no raw OpenCode state is exposed.
 * - Opening this surface never aborts an active turn (no hook calls on
 *   open; the parent optionally refreshes list metadata).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { filterByTitle, groupConversations } from './conversationTitles';

export interface HistoryItemData {
  id: string;
  displayTitle: string;
  updatedAt: string;
}

export type ActiveTurnState = 'idle' | 'generating' | 'failed';

export interface ConversationHistoryProps {
  items: HistoryItemData[];
  selectedId: string | null;
  /** Live turn state for the SELECTED conversation only. */
  activeState: ActiveTurnState;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
  onClose: () => void;
  /** Picker button ref — excluded from outside-click close. */
  anchorRef: React.RefObject<HTMLElement | null>;
}

function formatTime(isoOrTimestamp: string): string {
  const date = new Date(isoOrTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ConversationHistory({
  items,
  selectedId,
  activeState,
  onSelect,
  onNewConversation,
  onClose,
  anchorRef,
}: ConversationHistoryProps) {
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search on open.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  // Outside click closes (picker button excluded).
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onClose, anchorRef]);

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.id, item.displayTitle);
    return map;
  }, [items]);

  const filtered = useMemo(
    () => filterByTitle(items, (id) => titleById.get(id) ?? '', query),
    [items, titleById, query],
  );

  const groups = useMemo(() => groupConversations(filtered), [filtered]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Conversation history"
      data-testid="conversation-history"
      className="absolute inset-x-3 top-2 z-20 flex max-h-[75%] flex-col overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-950 shadow-2xl"
    >
      <div className="flex shrink-0 items-center justify-between px-3 pt-2.5 pb-1">
        <span className="text-[11px] font-medium text-zinc-400">Conversations</span>
        <button
          type="button"
          onClick={onNewConversation}
          aria-label="New conversation"
          title="New conversation"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-amber-400/90 hover:bg-zinc-800 hover:text-amber-300 transition-colors cursor-pointer"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </div>

      <div className="shrink-0 px-3 pb-2">
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations..."
          aria-label="Search conversations"
          className="w-full rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-1.5 text-[12px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" data-testid="conversation-history-list">
        {items.length === 0 && (
          <div className="px-2 py-6 text-center">
            <p className="text-[12px] text-zinc-400">No conversations yet</p>
            <p className="mt-1 text-[11px] text-zinc-600">Start a new conversation below.</p>
          </div>
        )}

        {items.length > 0 && filtered.length === 0 && (
          <div className="px-2 py-6 text-center" data-testid="history-no-results">
            <p className="text-[12px] text-zinc-400">No conversations found</p>
          </div>
        )}

        {groups.map(({ group, items: groupItems }) => (
          <div key={group}>
            <div className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
              {group}
            </div>
            <ul className="space-y-0.5">
              {groupItems.map((item) => {
                const isActive = item.id === selectedId;
                const showGenerating = isActive && activeState === 'generating';
                const showFailed = isActive && activeState === 'failed';
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      aria-current={isActive ? 'true' : undefined}
                      aria-label={`Open conversation: ${item.displayTitle}`}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer ${
                        isActive ? 'bg-amber-500/10 border border-amber-500/20' : 'border border-transparent hover:bg-zinc-800/60'
                      }`}
                    >
                      {isActive && (
                        <span className="shrink-0 text-[12px] text-amber-400" aria-hidden="true">
                          ✓
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[12px] ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>
                          {item.displayTitle}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-600">
                          <span>{formatTime(item.updatedAt)}</span>
                          {showGenerating && (
                            <span className="flex items-center gap-1 text-amber-500/90">
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-amber-500 motion-reduce:animate-none animate-pulse"
                                aria-hidden="true"
                              />
                              generating
                            </span>
                          )}
                          {showFailed && <span className="text-red-400/90">! failed</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ConversationHistory;
