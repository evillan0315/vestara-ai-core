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
 * - Errors: kind === 'diagnostic' (authoritative failure class, not string matching)
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { M11CStreamItem as StreamItemType, SubmissionState } from '../../hooks/useM11CActivityRoom';
import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';
import { useRenderProfiler } from '../../hooks/useActivityProfiler';
import { EmptyState } from '@vestara/ui';
import { M11CStreamItemComponent } from './M11CStreamItem';
import ActivityRoomTabs, { type ActivityRoomView } from './ActivityRoomTabs';

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
  /** Participant ID → display name lookup for enriching actor names in stream items. */
  readonly participantNames?: Readonly<Record<string, string>>;
  /** AR-REC-R6: Ephemeral submission state for interaction responses. */
  readonly submission?: SubmissionState;
  /** AR-REC-R6: Submit a response to an interaction. */
  readonly onSubmitResponse?: (interactionId: string, choiceId: string) => Promise<void>;
  /**
   * External attention signal (from the attention banner). When true the
   * stream focuses the Needs-attention preset until the user picks another
   * tab. Hero owns connection status; this is scope, not status.
   */
  readonly attentionFocus?: boolean;
  /** Select a workflow context (from stream workflow badges → browser scope). */
  readonly onSelectWorkflow?: (workflowId: string) => void;
  /** Active workflow scope (from the workflow browser). Narrows the stream. */
  readonly workflowFilter?: string | null;
  readonly streamHeading?: string;
  readonly streamHeaderAction?: ReactNode;
  /**
   * Capability condition for the Activity/Operations/Timeline/Evidence/
   * Files/Notes view tabs. Hidden until the corresponding panels carry
   * authoritative content; the stream renders the Activity view directly.
   * Contract (ActivityRoomTabs) retained for that milestone.
   */
  readonly showViewTabs?: boolean;
}

// ─── Filter Types ────────────────────────────────────────────

/**
 * Scan-first presets. Deliberately non-overlapping:
 * - Needs attention: diagnostic failures + presented interactions (actionable)
 * - Conversations: human/agent messages
 * - Work: task/workflow lifecycle (activity/progress)
 * - Tools: tool calls/results
 */
type StreamFilter = 'all' | 'attention' | 'conversations' | 'work' | 'tools' | 'evidence';

const FILTER_TABS: { id: StreamFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'work', label: 'Work' },
  { id: 'tools', label: 'Tools' },
  { id: 'evidence', label: 'Evidence' },
];

/** Shared attention predicate (banner ↔ stream preset stay in sync). */
export function isAttentionItem(item: StreamItemType): boolean {
  if (item.kind === 'diagnostic' || item.kind === 'error') return true;
  if (item.kind === 'interaction' && item.interaction?.lifecycle === 'presented') return true;
  return false;
}

// ─── Component ───────────────────────────────────────────────

function M11CActivityStream({
  items,
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
  participantNames,
  submission,
  onSubmitResponse,
  attentionFocus,
  onSelectWorkflow,
  workflowFilter,
  streamHeading = 'Activity Stream',
  streamHeaderAction,
  showViewTabs = false,
}: M11CActivityStreamProps) {
  useRenderProfiler('M11CActivityStream');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const previousScrollHeight = useRef(0);
  const previousItemCount = useRef(0);
  const snapFrame = useRef(0);
  const [activeFilter, setActiveFilter] = useState<StreamFilter>('all');
  const [activeView, setActiveView] = useState<ActivityRoomView>('activity');
  const [searchQuery, setSearchQuery] = useState('');

  const handleViewChange = useCallback((view: ActivityRoomView) => {
    setActiveView(view);
    if (view === 'activity' || view === 'timeline') setActiveFilter('all');
    if (view === 'operations') setActiveFilter('work');
    if (view === 'evidence') setActiveFilter('evidence');
  }, []);

  // Attention banner is scope, not status: focusing it selects the
  // Needs-attention preset; any manual tab pick reclaims control.
  useEffect(() => {
    if (attentionFocus) setActiveFilter('attention');
  }, [attentionFocus]);

  // ─── Filter Counts ───────────────────────────────────────

  const filterCounts = useMemo(() => {
    let base = selectedParticipantId !== undefined
      ? items.filter((item) => item.actor.id === selectedParticipantId)
      : items;
    if (workflowFilter) {
      base = base.filter((item) => item.workflowRunId === workflowFilter);
    }

    return {
      all: base.length,
      attention: base.filter(isAttentionItem).length,
      conversations: base.filter((i) => i.kind === 'conversation').length,
      work: base.filter((i) => i.kind === 'activity' || i.kind === 'progress').length,
      tools: base.filter((i) => i.kind === 'tool-call' || i.kind === 'tool-result').length,
      evidence: base.filter((i) => i.kind === 'evidence').length,
    };
  }, [items, selectedParticipantId, workflowFilter]);

  // ─── Filtering ──────────────────────────────────────────
  // Uses canonical M11C stream `kind` values, not string matching.
  // Error filter uses the authoritative failure class (kind 'diagnostic').

  const filtered = useMemo(() => {
    let result = items;

    // Participant filter (existing)
    if (selectedParticipantId !== undefined) {
      result = result.filter((item) => item.actor.id === selectedParticipantId);
    }

    // Workflow scope (from browser selection or stream badge)
    if (workflowFilter) {
      result = result.filter((item) => item.workflowRunId === workflowFilter);
    }

    // Category filter (scan-first presets, non-overlapping)
    if (activeFilter !== 'all') {
      result = result.filter((item) => {
        switch (activeFilter) {
          case 'attention':
            return isAttentionItem(item);
          case 'conversations':
            return item.kind === 'conversation';
          case 'work':
            return item.kind === 'activity' || item.kind === 'progress';
          case 'tools':
            return item.kind === 'tool-call' || item.kind === 'tool-result';
          case 'evidence':
            return item.kind === 'evidence';
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
  }, [items, selectedParticipantId, workflowFilter, activeFilter, searchQuery]);

  // ─── Bounded Window ─────────────────────────────────────

  const rendered = useMemo(() => {
    const start = Math.max(0, filtered.length - RENDER_WINDOW - olderLoaded);
    return filtered.slice(start);
  }, [filtered, olderLoaded]);

  const virtualizer = useVirtualizer({
    count: rendered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 76,
    overscan: 8,
    gap: 8,
    getItemKey: (index) => rendered[index]?.id ?? index,
  });

  const hasMore = filtered.length > rendered.length;

  // ─── Scroll Behavior ────────────────────────────────────

  // Snap to the true bottom in two phases: virtualized rows measure
  // asynchronously (ResizeObserver), so total size can grow after this
  // commit. The rAF re-assertion lands jumps/follows on the settled bottom
  // instead of the estimated one.
  const snapToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    cancelAnimationFrame(snapFrame.current);
    snapFrame.current = requestAnimationFrame(() => {
      const target = scrollRef.current;
      if (target) target.scrollTop = target.scrollHeight;
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(snapFrame.current), []);

  // Auto-follow: when at bottom and items change, stay pinned to bottom.
  // Identity (not just length) drives this so in-place streaming growth —
  // same record count, taller content — also follows. Idempotent when the
  // viewport is already settled: assigning the same scrollTop is a no-op.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (atBottom) {
      if (items.length >= previousItemCount.current) snapToBottom();
    } else if (items.length > previousItemCount.current && olderLoaded === 0) {
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
  }, [items, atBottom, olderLoaded, snapToBottom]);

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
    snapToBottom();
    setAtBottom(true);
    onClearUnread();
  }, [onClearUnread, snapToBottom]);

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {showViewTabs && <ActivityRoomTabs activeView={activeView} onViewChange={handleViewChange} />}
      {/* ── Filter Bar (canonical pill tabs; kind-driven, not text) ── */}
      <div className="ar-stream-filter" role="search" aria-label="Filter activity stream">
        <div className="ar-stream-filter__heading">
          <span className="ar-panel__label" aria-live="polite">{streamHeading}</span>
          {streamHeaderAction}
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
          {/* Connection status lives in the hero (single truth). Only
              paused/buffered context surfaces inline, where it changes
              stream behavior. */}
          <label className="ar-stream-filter__select-label">
            <span className="sr-only">Activity category</span>
            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value as StreamFilter)}
              className="ar-stream-filter__select"
              aria-label="Activity category"
            >
              {FILTER_TABS.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label} ({filterCounts[tab.id]})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="ar-scroll flex min-h-0 flex-1 flex-col gap-1 pr-1"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="Activity stream"
        tabIndex={0}
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
            title="Waiting for activity…"
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

            {/* Virtualized stream items: retained history stays available while
                only the viewport plus a small overscan window mounts DOM. */}
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                position: 'relative',
                width: '100%',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const item = rendered[virtualItem.index];
                if (!item) return null;
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <M11CStreamItemComponent
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
                      participantNames={participantNames}
                      onSelectWorkflow={onSelectWorkflow}
                    />
                  </div>
                );
              })}
            </div>
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

    </div>
  );
}

export default memo(M11CActivityStream);
