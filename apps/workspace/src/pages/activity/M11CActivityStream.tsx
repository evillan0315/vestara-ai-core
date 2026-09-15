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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { M11CStreamItem as StreamItemType, SubmissionState } from '../../hooks/useM11CActivityRoom';
import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';
import { useRenderProfiler } from '../../hooks/useActivityProfiler';
import { EmptyState, StatusIndicator } from '@vestara/ui';
import { CONNECTION_STATUS_CONFIG } from './status-config';
import { M11CStreamItemComponent } from './M11CStreamItem';

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
}

// ─── Filter Types ────────────────────────────────────────────

/**
 * Scan-first presets. Deliberately non-overlapping:
 * - Needs attention: diagnostic failures + presented interactions (actionable)
 * - Conversations: human/agent messages
 * - Work: task/workflow lifecycle (activity/progress)
 * - Tools: tool calls/results
 */
type StreamFilter = 'all' | 'attention' | 'conversations' | 'work' | 'tools';

const FILTER_TABS: { id: StreamFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'work', label: 'Work' },
  { id: 'tools', label: 'Tools' },
];

/** Shared attention predicate (banner ↔ stream preset stay in sync). */
export function isAttentionItem(item: StreamItemType): boolean {
  if (item.kind === 'diagnostic' || item.kind === 'error') return true;
  if (item.kind === 'interaction' && item.interaction?.lifecycle === 'presented') return true;
  return false;
}

// ─── Component ───────────────────────────────────────────────

export default function M11CActivityStream({
  items,
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
  participantNames,
  submission,
  onSubmitResponse,
  attentionFocus,
  onSelectWorkflow,
  workflowFilter,
}: M11CActivityStreamProps) {
  useRenderProfiler('M11CActivityStream');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const previousScrollHeight = useRef(0);
  const previousItemCount = useRef(0);
  const [activeFilter, setActiveFilter] = useState<StreamFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
      {/* ── Filter Bar (canonical pill tabs; kind-driven, not text) ── */}
      <div className="ar-stream-filter" role="search" aria-label="Filter activity stream">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" role="tablist" aria-label="Stream categories">
          {FILTER_TABS.map((tab) => {
            const count = filterCounts[tab.id];
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveFilter(tab.id)}
                className={`inline-flex min-h-7 items-center gap-1.5 rounded-[var(--vestara-radius-full)] border px-2.5 text-[var(--vestara-font-size-xs)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset ${active ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)]' : 'border-[var(--vestara-border-default)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text)]'}`}
              >
                {tab.label}
                {count > 0 && (
                  <span className="font-mono tabular-nums opacity-80">{count > 999 ? '999+' : count}</span>
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
          {/* Connection status lives in the hero (single truth). Only
              paused/buffered context surfaces inline, where it changes
              stream behavior. */}
          {(connectionState === 'paused' || unread > 0) && !atBottom && (
            <span className="ar-stream-filter__live" aria-live="polite">
              {unread > 0 ? `${unread} buffered` : 'Paused'}
            </span>
          )}
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
                participantNames={participantNames}
                onSelectWorkflow={onSelectWorkflow}
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

      {/* Status bar — canonical connection config (hero is primary,
          this is subordinate context next to the record count). */}
      <div className="ar-foot">
        <span>
          {filtered.length} records
          {selectedParticipantId !== undefined ? ' · filtered' : ''}
          {workflowFilter ? ` · workflow ${workflowFilter.slice(0, 8)}` : ''}
          {activeFilter !== 'all' ? ` · ${FILTER_TABS.find((t) => t.id === activeFilter)?.label}` : ''}
        </span>
        <span className="ar-foot__state">
          {(() => {
            const config = CONNECTION_STATUS_CONFIG[connectionState] ?? CONNECTION_STATUS_CONFIG.offline;
            return (
              <>
                <StatusIndicator
                  variant={config.variant}
                  size="xs"
                  pulse={connectionState === 'live' || connectionState === 'reconnecting'}
                  ariaLabel={`Connection: ${config.label}`}
                />
                {config.label}
              </>
            );
          })()}
        </span>
      </div>
    </div>
  );
}
