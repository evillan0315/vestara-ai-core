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
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { M11CStreamItem as StreamItemType, SubmissionState } from '../../hooks/useM11CActivityRoom';
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
  /** Currently selected participant (for filtering). */
  readonly selectedParticipantId?: string;
  /** AR-REC-R6: Ephemeral submission state for interaction responses. */
  readonly submission?: SubmissionState;
  /** AR-REC-R6: Submit a response to an interaction. */
  readonly onSubmitResponse?: (interactionId: string, choiceId: string) => Promise<void>;
}

// ─── Component ───────────────────────────────────────────────

export default function M11CActivityStream({
  items,
  stateLabel,
  unread,
  loadingHistory,
  olderLoaded,
  loading,
  onLoadOlder,
  onReportViewport,
  onClearUnread,
  onOpenDetail,
  onDrillDown,
  selectedParticipantId,
  submission,
  onSubmitResponse,
}: M11CActivityStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const previousScrollHeight = useRef(0);
  const previousItemCount = useRef(0);

  // ─── Filtering ──────────────────────────────────────────

  const filtered = useMemo(() => {
    if (selectedParticipantId === undefined) return items;
    return items.filter((item) => item.actor.id === selectedParticipantId);
  }, [items, selectedParticipantId]);

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
          <div className="ar-empty">
            <div className="ar-empty__sigil" aria-hidden="true">❖</div>
            <p className="ar-empty__title">The room awaits.</p>
            <div className="ar-empty__rule" aria-hidden="true" />
            <p className="ar-empty__note">
              No activity yet. Start a workflow and its progress will appear here in real time.
            </p>
          </div>
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
          <span className="ar-lamp ar-lamp--live" aria-hidden="true">●</span>
          {stateLabel}
        </span>
      </div>
    </div>
  );
}
