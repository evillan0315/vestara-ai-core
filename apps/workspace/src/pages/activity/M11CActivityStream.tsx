/**
 * M11C Activity Stream Component
 *
 * Renders the center stream with:
 * - Visual hierarchy (primary/secondary/muted)
 * - Scroll behavior: auto-follow at bottom, no jump when reading history
 * - History prepend preserves viewport position
 * - Jump-to-latest button with unread count
 * - Bounded render window (no full DOM hydration)
 * - Aggregated items with drill-down affordance
 * - Filter bar for category-based filtering
 *
 * Filter vocabulary uses canonical M11C stream `kind` values:
 * - All: no filter
 * - Conversations: kind === 'conversation'
 * - Agents: actor.type !== 'human'
 * - Humans: actor.type === 'human'
 * - Tools: kind === 'tool-call' || kind === 'tool-result'
 * - Executions: kind === 'activity' || kind === 'progress'
 * - Errors: kind === 'error' (canonical severity metadata, not string matching)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { M11CStreamItem as StreamItemType, SubmissionState } from '../../hooks/useM11CActivityRoom';
import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';
import { useRenderProfiler } from '../../hooks/useActivityProfiler';
import { EmptyState, StatusIndicator } from '@vestara/ui';
import M11CStreamItemComponent from './M11CStreamItem';

// ─── Constants ───────────────────────────────────────────────

/** Maximum items to render in the DOM (bounded window). */
const RENDER_WINDOW = 100;

/** Scroll distance from bottom to considered "at bottom". */
const AT_BOTTOM_THRESHOLD = 64;

// ─── Types ───────────────────────────────────────────────────

interface M11CActivityStreamProps {
  /** Stream items (snapshot + live, sorted by sequence). */
  readonly items: readonly StreamItemType[];
  /** Connection state label. */
  readonly stateLabel: string;
  /** Connection state for live indicator. */
  readonly connectionState: M11CConnectionState;
  /** Unread count (when scrolled up). */
  readonly unread: number;
  /** Whether history is currently loading. */
  readonly loadingHistory: boolean;
  /** Number of older records loaded beyond initial snapshot. */
  readonly olderLoaded: number;
  /** Whether the stream is in loading/connecting state. */
  readonly loading: boolean;
  /** Callback to load older history (scroll up). */
  readonly onLoadOlder?: () => void;
  /** Callback to report viewport position (for auto-follow). */
  readonly onReportViewport: (atBottom: boolean) => void;
  /** Callback to clear unread count. */
  readonly onClearUnread: () => void;
  /** Callback when a stream item is clicked for detail. */
  readonly onOpenDetail?: (item: StreamItemType) => void;
  /** Callback for aggregate drill-down. */
  readonly onDrillDown?: (aggregateId: string, referencedIds: readonly string[]) => void;
  /** Reply to a stream item — opens composer with @mention. */
  readonly onReply?: (item: StreamItemType) => void;
  /** Retract a stream item (append-only correction). */
  readonly onRetract?: (item: StreamItemType) => void;
  /** Edit a stream item (append-only correction with new content). */
  readonly onEdit?: (item: StreamItemType) => void;
  /** Open thread view for a set of activity IDs. */
  readonly onOpenThread?: (activityIds: readonly string[]) => void;
  /** Look up author name by activity ID for reply indicator. */
  readonly lookupAuthor?: (activityId: string) => string | undefined;
  /** Look up content preview by activity ID for reply indicator. */
  readonly lookupContent?: (activityId: string) => string | undefined;
  /** Currently selected participant (for filtering). */
  readonly selectedParticipantId?: string;
  /** AR-REC-R6: Ephemeral submission state for interaction responses. */
  readonly submission?: SubmissionState;
  /** AR-REC-R6: Submit a response to an interaction. */
  readonly onSubmitResponse?: (interactionId: string, choiceId: string) => Promise<void>;
}

// ─── Filter Types ────────────────────────────────────────────

type StreamFilter = 'all' | 'conversations' | 'agents' | 'humans' | 'tools' | 'executions' | 'errors';

const FILTER_TABS: { id: StreamFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'agents', label: 'Agents' },
  { id: 'humans', label: 'Humans' },
  { id: 'tools', label: 'Tools' },
  { id: 'executions', label: 'Executions' },
  { id: 'errors', label: 'Errors' },
];

// ─── Component ───────────────────────────────────────────────

export default function M11CActivityStream({
  items,
  stateLabel,
  connectionState,
  unread,
  loadingHistory,
  olderLoaded,
  loading,
  onLoadOlder,
  onReportViewport,
  onClearUnread,
  onOpenDetail,
  onDrillDown,
  onReply,
  onRetract,
  onEdit,
  onOpenThread,
  lookupAuthor,
  lookupContent,
  selectedParticipantId,
  submission,
  onSubmitResponse,
}: M11CActivityStreamProps) {
  useRenderProfiler('M11CActivityStream');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const previousScrollHeight = useRef(0);
  const previousItemCount = useRef(0);
  const [activeFilter, setActiveFilter] = useState<StreamFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Filter Counts ───────────────────────────────────────

  const filterCounts = useMemo(() => {
    const base = selectedParticipantId !== undefined
      ? items.filter((item) => item.actor.id === selectedParticipantId)
      : items;

    return {
      all: base.length,
      conversations: base.filter((i) => i.kind === 'conversation').length,
      agents: base.filter((i) => i.actor.type !== 'human').length,
      humans: base.filter((i) => i.actor.type === 'human').length,
      tools: base.filter((i) => i.kind === 'tool-call' || i.kind === 'tool-result').length,
      executions: base.filter((i) => i.kind === 'activity' || i.kind === 'progress').length,
      errors: base.filter((i) => i.kind === 'error').length,
    };
  }, [items, selectedParticipantId]);

  // ─── Filtering ──────────────────────────────────────────
  // Uses canonical M11C stream `kind` values, not string matching.
  // Error filter uses canonical `kind === 'error'` metadata.

  const filtered = useMemo(() => {
    let result = items;

    // Participant filter (existing)
    if (selectedParticipantId !== undefined) {
      result = result.filter((item) => item.actor.id === selectedParticipantId);
    }

    // Category filter (new)
    if (activeFilter !== 'all') {
      result = result.filter((item) => {
        switch (activeFilter) {
          case 'conversations':
            return item.kind === 'conversation';
          case 'agents':
            return item.actor.type !== 'human';
          case 'humans':
            return item.actor.type === 'human';
          case 'tools':
            return item.kind === 'tool-call' || item.kind === 'tool-result';
          case 'executions':
            return item.kind === 'activity' || item.kind === 'progress';
          case 'errors':
            // Canonical severity metadata: kind === 'error'
            // Do NOT search item.content for error-like words.
            return item.kind === 'error';
          default:
            return true;
        }
      });
    }

    // Text search filter (content + actor name)
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((item) => {
        const contentMatch = item.content.toLowerCase().includes(query);
        const actorMatch = item.actor.displayName.toLowerCase().includes(query);
        return contentMatch || actorMatch;
      });
    }

    return result;
  }, [items, selectedParticipantId, activeFilter, searchQuery]);

  // ─── Bounded Window ─────────────────────────────────────

  const rendered = useMemo(() => {
    const start = Math.max(0, filtered.length - RENDER_WINDOW - olderLoaded);
    return filtered.slice(start);
  }, [filtered, olderLoaded]);

  const hasMore = filtered.length > rendered.length;

  // ─── Scroll Behavior ────────────────────────────────────

  // Auto-follow: when at bottom and new items arrive, scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (atBottom && items.length > previousItemCount.current) {
      // New items arrived while at bottom — follow automatically
      el.scrollTop = el.scrollHeight;
    } else if (!atBottom && items.length > previousItemCount.current && olderLoaded === 0) {
      // New items arrived while reading history — preserve scroll position
      // by maintaining the scroll offset relative to the bottom
      const newScrollHeight = el.scrollHeight;
      const scrollDelta = newScrollHeight - previousScrollHeight.current;
      if (scrollDelta > 0) {
        el.scrollTop += scrollDelta;
      }
    }

    previousItemCount.current = items.length;
    previousScrollHeight.current = el.scrollHeight;
  }, [items.length, atBottom, olderLoaded]);

  // Report viewport position to parent
  useEffect(() => {
    onReportViewport(atBottom);
  }, [atBottom, onReportViewport]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD;
    setAtBottom(nearBottom);
  }, []);

  const jumpToLatest = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setAtBottom(true);
    onClearUnread();
  }, [onClearUnread]);

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* ── Filter Bar ──────────────────────────────────── */}
      <div className="ar-stream-filter" role="search" aria-label="Filter activity stream">
        <div className="ar-stream-filter__tabs" role="tablist">
          {FILTER_TABS.map((tab) => {
            const count = filterCounts[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === tab.id}
                className={`ar-stream-filter__tab ${activeFilter === tab.id ? 'ar-stream-filter__tab--active' : ''}`}
                onClick={() => setActiveFilter(tab.id)}
              >
                {tab.label}
                {count > 0 && (
                  <span className="ar-stream-filter__count">{count > 999 ? '999+' : count}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="ar-stream-filter__right">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search activity…"
            className="ar-stream-filter__search"
            aria-label="Search activity stream"
          />
          <StatusIndicator
            variant={connectionState === 'live' ? 'live' : connectionState === 'paused' ? 'idle' : 'warn'}
            size="xs"
            pulse={connectionState === 'live'}
            ariaLabel={`Connection: ${stateLabel}`}
          />
          <span className="ar-stream-filter__live">{stateLabel}</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="ar-scroll flex min-h-0 flex-1 flex-col gap-1 pr-1"
        role="log"
        aria-live="polite"
        aria-label="Activity stream"
      >
        {loading ? (
          <div className="flex flex-col gap-2 py-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="ar-skeleton" />
            ))}
          </div>
        ) : rendered.length === 0 ? (
          <EmptyState
            icon={<span className="text-2xl">❖</span>}
            title="The room awaits."
            description="No activity yet. Start a workflow and its progress will appear here in real time."
            className="ar-empty"
          />
        ) : (
          <>
            {/* Load older history button */}
            {hasMore && onLoadOlder && (
              <div className="ar-load">
                <span className="ar-load__rule" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => void onLoadOlder()}
                  disabled={loadingHistory}
                  className="ar-load__btn"
                >
                  {loadingHistory ? 'Loading older…' : 'Load older history'}
                </button>
                <span className="ar-load__rule" aria-hidden="true" />
              </div>
            )}

            {/* Stream items */}
            {rendered.map((item) => (
              <M11CStreamItemComponent
                key={item.id}
                item={item}
                onOpenDetail={onOpenDetail}
                onDrillDown={onDrillDown}
                onReply={onReply}
                onRetract={onRetract}
                onEdit={onEdit}
                onOpenThread={onOpenThread}
                lookupAuthor={lookupAuthor}
                lookupContent={lookupContent}
                submission={submission}
                onSubmitResponse={onSubmitResponse}
              />
            ))}
          </>
        )}
      </div>

      {/* Jump to latest button */}
      {!atBottom && rendered.length > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="ar-jump"
          aria-label={unread > 0 ? `Jump to latest (${unread} unread)` : 'Jump to latest'}
        >
          {unread > 0 ? `↓ ${unread} new` : '↓ Jump to latest'}
        </button>
      )}

      {/* Status bar */}
      <div className="ar-foot">
        <span>
          {filtered.length} records
          {selectedParticipantId !== undefined ? ' · filtered' : ''}
        </span>
        <span className="ar-foot__state">
          <StatusIndicator variant="live" size="xs" pulse={stateLabel === 'Live'} ariaLabel={`Connection: ${stateLabel}`} />
          {stateLabel}
        </span>
      </div>
    </div>
  );
}
