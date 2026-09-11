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

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { OpenCodeSessionView, OpenCodeSessionViewStatus } from '../../lib/opencode';
import { filterByTitle, groupConversations } from './conversationTitles';
import { StatusIndicator } from '@vestara/ui';
import type { SessionStatusMap } from '../../hooks/useSessionStatus';
import { resolveSessionRuntimeStatus } from '../../hooks/useSessionStatus';

export interface HistoryItemData {
  id: string;
  displayTitle: string;
  updatedAt: string;
  /** GA-STATE-001: OpenCode session ID for runtime status projection. */
  runtimeSessionId?: string;
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
  /**
   * GA-UI-007: presentation variant.
   * - 'popover' (default): overlay dialog with outside-click/Escape close.
   * - 'rail': persistent static sidebar (no overlay behavior).
   */
  variant?: 'popover' | 'rail';
  /**
   * GA-SESSION-003: compatible runtime sessions for resume surface.
   * Preserves root and child sessions for parentID lineage.
   */
  runtimeSessions?: OpenCodeSessionView[];
  /** GA-SESSION-003: callback when a runtime session resume is invoked. */
  onResumeSession?: (sessionId: string) => void;
  /** Callback when a session is clicked to load its messages. */
  onLoadSession?: (sessionId: string) => void;
  /** GA-STATE-001: session status map for runtime status projection. */
  sessionStatusMap?: SessionStatusMap;
  /** VES-PERF-001C: more summary pages are available. */
  hasMoreConversations?: boolean;
  /** VES-PERF-001C: a further summary page is in flight. */
  loadingMoreConversations?: boolean;
  /** VES-PERF-001C: request the next summary page. */
  onLoadMoreConversations?: () => void;
}

function formatTime(isoOrTimestamp: string): string {
  const date = new Date(isoOrTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** GA-STATE-001: Map runtime status to StatusIndicator variant. */
function runtimeStatusToVariant(
  status: OpenCodeSessionViewStatus,
  activeState: ActiveTurnState,
): 'live' | 'warn' | 'error' | 'idle' | 'off' {
  // If this is the selected conversation with an active turn, prefer the turn state.
  if (activeState === 'generating') return 'live';
  if (activeState === 'failed') return 'error';
  // Otherwise, derive from runtime session status.
  switch (status) {
    case 'active': return 'live';
    case 'idle': return 'idle';
    case 'failed': return 'error';
    case 'unknown':
    default: return 'off';
  }
}

export const ConversationHistory = memo(function ConversationHistory({
  items,
  selectedId,
  activeState,
  onSelect,
  onNewConversation,
  onClose,
  anchorRef,
  variant = 'popover',
  runtimeSessions,
  onResumeSession,
  onLoadSession,
  sessionStatusMap,
  hasMoreConversations,
  loadingMoreConversations,
  onLoadMoreConversations,
}: ConversationHistoryProps) {
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isRail = variant === 'rail';

  // Focus search on open (popover only — the rail never steals focus).
  useEffect(() => {
    if (isRail) return;
    searchRef.current?.focus();
  }, [isRail]);

  // Escape closes (popover only).
  useEffect(() => {
    if (isRail) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose, isRail]);

  // Outside click closes (popover only — picker button excluded).
  useEffect(() => {
    if (isRail) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onClose, anchorRef, isRail]);

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
      role={isRail ? 'navigation' : 'dialog'}
      aria-label="Conversation history"
      data-testid="conversation-history"
      className={
        isRail
          ? 'flex h-full min-h-0 flex-col overflow-hidden'
          : 'absolute inset-x-3 top-2 z-20 flex max-h-[75%] flex-col overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-950/95 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-xl assistant-history-enter'
      }
    >
      <div className="flex shrink-0 items-center justify-between px-3 pt-2.5 pb-1">
        <span className="text-[11px] font-semibold tracking-tight text-zinc-300">Conversations</span>
        <button
          type="button"
          onClick={onNewConversation}
          aria-label="New conversation"
          title="New conversation"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-amber-300/90 transition-all hover:bg-amber-500/10 hover:text-amber-200 active:scale-95 cursor-pointer"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
          className="w-full rounded-xl bg-zinc-800/60 border border-zinc-700/50 px-3 py-2 text-[12px] text-zinc-200 placeholder-zinc-600 shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)] focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/15 transition-all"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" data-testid="conversation-history-list">
        {items.length === 0 && runtimeSessions && runtimeSessions.length > 0 && (
          <div>
            <div className="px-2 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Runtime Sessions
            </div>
            <ul className="space-y-0.5">
              {runtimeSessions.map((session) => {
                const canResume = session.status !== 'busy';
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => onLoadSession?.(session.id)}
                      disabled={!canResume}
                      aria-label={`${canResume ? 'Open' : 'Session busy'}: ${session.title}`}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-all ${
                        canResume
                          ? 'cursor-pointer hover:bg-zinc-800/60 hover:border-zinc-700/30 border border-transparent'
                          : 'cursor-not-allowed opacity-50 border border-transparent'
                      }`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-zinc-800/60 text-[10px] text-zinc-500" aria-hidden="true">
                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-zinc-300">
                          {session.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-600">
                          <span>{session.createdAt ? formatTime(session.createdAt) : ''}</span>
                          {session.status === 'busy' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-300/90 font-medium">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
                              busy
                            </span>
                          )}
                          {session.status === 'error' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-red-300/90 font-medium">
                              ! error
                            </span>
                          )}
                        </span>
                      </span>
                      {canResume && (
                        <span className="shrink-0 text-[10px] font-medium text-amber-400/70">
                          Open
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {items.length === 0 && (!runtimeSessions || runtimeSessions.length === 0) && (
          <div className="px-2 py-8 text-center">
            <div className="mb-2 flex justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/60">
                <svg className="h-4 w-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
            </div>
            <p className="text-[12px] font-medium text-zinc-400">No conversations yet</p>
            <p className="mt-1 text-[11px] text-zinc-600">Start a new conversation below.</p>
          </div>
        )}

        {items.length > 0 && filtered.length === 0 && (
          <div className="px-2 py-8 text-center" data-testid="history-no-results">
            <div className="mb-2 flex justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/60">
                <svg className="h-4 w-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <p className="text-[12px] font-medium text-zinc-400">No conversations found</p>
          </div>
        )}

        {groups.map(({ group, items: groupItems }) => (
          <div key={group}>
            <div className="px-2 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              {group}
            </div>
            <ul className="space-y-0.5">
              {groupItems.map((item) => {
                const isActive = item.id === selectedId;
                const showGenerating = isActive && activeState === 'generating';
                const showFailed = isActive && activeState === 'failed';
                // GA-STATE-001: derive runtime status for this conversation.
                const runtimeStatus = resolveSessionRuntimeStatus(sessionStatusMap ?? {}, item.runtimeSessionId);
                const hasRuntimeStatus = item.runtimeSessionId && runtimeStatus !== 'unknown';
                const statusVariant = runtimeStatusToVariant(runtimeStatus, isActive ? activeState : 'idle');
                const statusLabel = hasRuntimeStatus
                  ? (runtimeStatus === 'active' ? 'Active' : runtimeStatus === 'idle' ? 'Idle' : runtimeStatus === 'failed' ? 'Failed' : '')
                  : '';
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      aria-current={isActive ? 'true' : undefined}
                      aria-label={`Open conversation: ${item.displayTitle}`}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-all cursor-pointer ${
                        isActive
                          ? 'bg-amber-500/10 border border-amber-500/25 shadow-[0_0_12px_-4px_rgba(245,158,11,0.3)]'
                          : 'border border-transparent hover:bg-zinc-800/60 hover:border-zinc-700/30'
                      }`}
                    >
                      {isActive && (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-[10px] text-amber-300" aria-hidden="true">
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[12px] ${isActive ? 'text-zinc-50 font-medium' : 'text-zinc-300'}`}>
                          {item.displayTitle}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-600">
                          <span>{formatTime(item.updatedAt)}</span>
                          {showGenerating && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-300/90 font-medium">
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-amber-400 motion-reduce:animate-none animate-pulse"
                                aria-hidden="true"
                              />
                              generating
                            </span>
                          )}
                          {showFailed && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-red-300/90 font-medium">
                              ! failed
                            </span>
                          )}
                          {/* GA-STATE-001: runtime status indicator */}
                          {!showGenerating && !showFailed && hasRuntimeStatus && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
                              <StatusIndicator variant={statusVariant} size="xs" ariaLabel={`Status: ${statusLabel}`} />
                              <span>{statusLabel}</span>
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* VES-PERF-001C: bounded history — load the next summary page.
            Hidden while searching (search filters the loaded page client-side). */}
        {!query.trim() && hasMoreConversations && (
          <div className="px-2 pt-2">
            <button
              type="button"
              onClick={onLoadMoreConversations}
              disabled={loadingMoreConversations}
              data-testid="load-more-conversations"
              className="w-full rounded-lg border border-zinc-700/50 bg-zinc-900/60 px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-amber-500/40 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loadingMoreConversations ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}

        {/* GA-SESSION-003: runtime sessions for resume surface. Root sessions
            are primary resume targets; child sessions show lineage beneath
            their parent. Resume eligibility (busy/error state) is a UI
            decision — server-side RepositoryBinding validation is authoritative. */}
        {runtimeSessions && runtimeSessions.length > 0 && (() => {
          const rootSessions = runtimeSessions.filter((s) => !s.parentID);
          const childrenByParent = new Map<string, OpenCodeSessionView[]>();
          for (const s of runtimeSessions) {
            if (s.parentID) {
              const list = childrenByParent.get(s.parentID) ?? [];
              list.push(s);
              childrenByParent.set(s.parentID, list);
            }
          }
          if (rootSessions.length === 0) return null;
          return (
            <div>
              <div className="px-2 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                Runtime Sessions
              </div>
              <ul className="space-y-0.5">
                {rootSessions.map((session) => {
                  const children = childrenByParent.get(session.id) ?? [];
                  const canResume = session.status !== 'busy';
                  return (
                    <li key={session.id}>
                      <button
                        type="button"
                        onClick={() => canResume && onResumeSession?.(session.id)}
                        disabled={!canResume}
                        aria-label={`${canResume ? 'Resume' : 'Session busy'}: ${session.title}`}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-all ${
                          canResume
                            ? 'cursor-pointer hover:bg-zinc-800/60 hover:border-zinc-700/30 border border-transparent'
                            : 'cursor-not-allowed opacity-50 border border-transparent'
                        }`}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-zinc-800/60 text-[10px] text-zinc-500" aria-hidden="true">
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] text-zinc-300">
                            {session.title}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-600">
                            <span>{session.updatedAt ? formatTime(session.updatedAt) : ''}</span>
                            {session.status === 'busy' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-300/90 font-medium">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 motion-reduce:animate-none animate-pulse" aria-hidden="true" />
                                busy
                              </span>
                            )}
                            {session.status === 'error' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-red-300/90 font-medium">
                                ! error
                              </span>
                            )}
                          </span>
                        </span>
                        {canResume && (
                          <span className="shrink-0 text-[9px] font-medium text-amber-400/70">
                            Resume
                          </span>
                        )}
                      </button>
                      {/* Child sessions: lineage beneath parent */}
                      {children.length > 0 && (
                        <ul className="ml-4 space-y-0.5">
                          {children.map((child) => (
                            <li key={child.id} className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-zinc-600">
                              <span className="text-zinc-700" aria-hidden="true">└</span>
                              <span className="truncate">{child.title}</span>
                              {child.status === 'busy' && (
                                <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })()}
      </div>
    </div>
  );
});

export default ConversationHistory;
