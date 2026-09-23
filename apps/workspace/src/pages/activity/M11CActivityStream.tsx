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
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AddLinkOutlinedIcon from '@mui/icons-material/AddLinkOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import TerminalOutlinedIcon from '@mui/icons-material/TerminalOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { SIZING } from '@vestara/ui-tokens';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { M11CStreamItem as StreamItemType, SubmissionState } from '../../hooks/useM11CActivityRoom';
import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';
import type { AttentionEntry } from '@vestara/activity-room';
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
  /** Participant ID → model label lookup for tool rows (modelDisplayName ?? modelId). */
  readonly participantModels?: Readonly<Record<string, string>>;
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
  /** Canonical unresolved attention projection for the stream attention section. */
  readonly attentionEntries?: readonly AttentionEntry[];
  /** Open the source activity behind an attention entry in the shared detail drawer. */
  readonly onOpenAttention?: (entry: AttentionEntry) => void;
  /**
   * Attach an attention entry to the composer as a structured reference.
   * Must not navigate, send, or mutate attention — attachment only.
   */
  readonly onAttachAttention?: (entry: AttentionEntry) => void;
  /** Select a workflow context (from stream workflow badges → browser scope). */
  readonly onSelectWorkflow?: (workflowId: string) => void;
  /** Inspect a resolved edit observation in the Activity Room Files drawer. */
  readonly onInspectEdit?: (detail: import('@vestara/shared').EditExecutionDetail) => void;
  /** Active workflow scope (from the workflow browser). Narrows the stream. */
  readonly workflowFilter?: string | null;
  readonly streamHeading?: string;
  readonly streamHeaderAction?: ReactNode;
  /** Controlled density; defaults to internal operational state when omitted. */
  readonly density?: StreamDensity;
  readonly onDensityChange?: (density: StreamDensity) => void;
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
 * - Needs attention: canonical unresolved AttentionEntry projection
 * - Conversations: human/agent messages
 * - Work: task/workflow lifecycle (activity/progress)
 * - Tools: tool calls/results
 */
type StreamFilter = 'all' | 'attention' | 'operational';
type TypeFilter = 'all' | 'conversations' | 'work' | 'tools' | 'evidence';

/** Timeline density (DENSITY-MODES): summary hides routine ops, operational hides raw chatter, raw shows all. */
export type StreamDensity = 'summary' | 'operational' | 'raw';

function matchesDensityKind(kind: string, density: StreamDensity): boolean {
  if (density === 'raw') return true;
  if (density === 'operational') return kind !== 'log' && kind !== 'telemetry';
  // summary: milestones + conversations + failures + evidence + decisions
  return kind === 'conversation' || kind === 'activity' || kind === 'diagnostic' || kind === 'evidence' || kind === 'interaction' || kind === 'error';
}

const FILTER_TABS: { id: StreamFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs Attention' },
  { id: 'operational', label: 'Operational' },
];

const TYPE_OPTIONS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All Types' },
  { id: 'conversations', label: 'Messages' },
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

export function attentionTypeLabel(entry: AttentionEntry): string {
  switch (entry.category) {
    case 'execution-failure':
      return 'TOOL';
    case 'test-failure':
      return 'TEST';
    case 'verification-failure':
      return 'VERIFICATION';
    case 'approval':
      return 'APPROVAL';
    case 'workflow':
      return 'WORKFLOW';
    case 'repository':
      return 'REPOSITORY';
    case 'system':
      return 'SYSTEM';
    case 'integration':
      return 'INTEGRATION';
    case 'configuration':
      return 'CONFIG';
    case 'security':
      return 'SECURITY';
    case 'blocker':
      return 'TASK';
    default:
      return String(entry.category).replace(/[-_.]+/g, ' ').toUpperCase();
  }
}

export function attentionTone(entry: AttentionEntry): 'warning' | 'error' {
  return entry.severity === 'critical' || entry.severity === 'high' || entry.category === 'execution-failure'
    ? 'error'
    : 'warning';
}

export function attentionSubject(entry: AttentionEntry): string {
  const tool = typeof entry.details?.toolName === 'string' ? entry.details.toolName : undefined;
  const command = typeof entry.details?.command === 'string' ? entry.details.command : undefined;
  const checkType = typeof entry.details?.checkType === 'string' ? entry.details.checkType : undefined;
  const sourceName = typeof entry.details?.sourceName === 'string' ? entry.details.sourceName : undefined;
  return tool ?? command ?? checkType ?? sourceName ?? entry.scope ?? entry.taskId ?? entry.workflowRunId ?? entry.owner ?? entry.reason;
}

/**
 * Type-specific Material icon for an attention row. Follows the same visual
 * language as stream rows: TOOL uses the terminal glyph (matching the
 * reference), TEST/VERIFICATION/TASK/APPROVAL/WORKFLOW use their semantic
 * glyphs. Neutral tile — identity comes from icon + foreground color only.
 */
export function AttentionMaterialIcon({
  entry,
  tone,
  iconSize = SIZING.icon.lg,
}: {
  entry: AttentionEntry;
  tone: 'warning' | 'error';
  iconSize?: string | number;
}) {
  const className = `ar-stream-tool-icon ${tone === 'error' ? 'ar-stream-tool-icon--error' : 'ar-stream-tool-icon--warning'}`;
  // Canonical icon size token (default SIZING.icon.lg = 24px): the glyph anchors
  // the compact row inside a minimal transparent tile — never a colored square.
  const props = { className, sx: { fontSize: iconSize } };
  switch (attentionTypeLabel(entry)) {
    case 'TOOL':
      return <TerminalOutlinedIcon {...props} />;
    case 'TEST':
      return <ScienceOutlinedIcon {...props} />;
    case 'VERIFICATION':
      return <VerifiedOutlinedIcon {...props} />;
    case 'TASK':
      return <TaskAltOutlinedIcon {...props} />;
    case 'APPROVAL':
      return <FactCheckOutlinedIcon {...props} />;
    case 'WORKFLOW':
      return <AccountTreeOutlinedIcon {...props} />;
    default:
      return <BuildOutlinedIcon {...props} />;
  }
}

/**
 * Human status label for an attention reason. Every reason is an
 * authoritative AttentionReason value — never parsed prose. Unknown future
 * reasons fall back to a title-cased form of the reason itself.
 */
export function attentionStatusLabel(reason: string): string {
  switch (reason) {
    case 'tool-failed':
    case 'test-failed':
    case 'verification-failed':
    case 'task-failed':
    case 'workflow-failed':
      return 'Failed';
    case 'task-blocked':
    case 'verification-blocked':
      return 'Blocked';
    case 'task-awaiting-approval':
    case 'approval-required':
    case 'interaction-presented':
      return 'Pending';
    case 'hold':
      return 'On Hold';
    case 'finding':
      return 'Finding';
    case 'recommendation':
      return 'Review';
    default:
      return reason.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  participantModels,
  submission,
  onSubmitResponse,
  attentionFocus,
  attentionEntries = [],
  onOpenAttention,
  onAttachAttention,
  onSelectWorkflow,
  onInspectEdit,
  workflowFilter,
  streamHeading = 'Activity Stream',
  streamHeaderAction,
  showViewTabs = false,
  density: controlledDensity,
}: M11CActivityStreamProps) {
  useRenderProfiler('M11CActivityStream');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const previousScrollHeight = useRef(0);
  const previousItemCount = useRef(0);
  const snapFrame = useRef(0);
  const [activeFilter, setActiveFilter] = useState<StreamFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [activeView, setActiveView] = useState<ActivityRoomView>('activity');
  const [searchQuery, setSearchQuery] = useState('');
  const [internalDensity] = useState<StreamDensity>('operational');
  const density = controlledDensity ?? internalDensity;

  // ─── Preamble measurement (scroll-origin correction) ──────
  // Declared before the virtualizer: the virtualizer reads preambleH for
  // scrollMargin, so the state must exist first (TDZ-safe order).
  // The virtualizer maps raw scrollTop to item offsets, so it must know how
  // much in-flow content (attention section, Recent Activity heading,
  // load-older control) precedes the first virtual row. That height is passed
  // as scrollMargin: item starts then include the preamble, totalSize excludes
  // it, and the sizer reserves preambleH + totalSize. The attention section
  // keeps its natural document height — never absolute, overlay, or capped.
  // A callback ref (not an effect) owns measurement so remounts across the
  // loading/empty/sizer branches always rebind, whatever the render path.
  const preambleObserver = useRef<ResizeObserver | null>(null);
  const [preambleH, setPreambleH] = useState(0);
  const setPreambleNode = useCallback((el: HTMLDivElement | null) => {
    preambleObserver.current?.disconnect();
    preambleObserver.current = null;
    if (!el) return;
    const update = () => {
      const next = el.offsetHeight;
      setPreambleH((prev) => (prev === next ? prev : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    preambleObserver.current = observer;
  }, []);
  useEffect(() => () => preambleObserver.current?.disconnect(), []);

  const handleViewChange = useCallback((view: ActivityRoomView) => {
    setActiveView(view);
    if (view === 'activity' || view === 'timeline') setActiveFilter('all');
    if (view === 'operations') setActiveFilter('operational');
    if (view === 'evidence') setTypeFilter('evidence');
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
      attention: attentionEntries.length,
      operational: base.filter((i) => matchesDensityKind(i.kind, 'operational')).length,
    };
  }, [items, selectedParticipantId, workflowFilter, attentionEntries.length]);

  // ─── Filtering ──────────────────────────────────────────
  // Uses canonical M11C stream `kind` values, not string matching.
  // Error filter uses the authoritative failure class (kind 'diagnostic').

  const filtered = useMemo(() => {
    let result = items.filter((item) => matchesDensityKind(item.kind, density));

    // Participant filter (existing)
    if (selectedParticipantId !== undefined) {
      result = result.filter((item) => item.actor.id === selectedParticipantId || `agent-${item.actor.id}` === selectedParticipantId);
    }

    // Workflow scope (from browser selection or stream badge)
    if (workflowFilter) {
      result = result.filter((item) => item.workflowRunId === workflowFilter);
    }

    if (activeFilter === 'operational') {
      result = result.filter((item) => matchesDensityKind(item.kind, 'operational'));
    }

    // Type filter. Needs Attention is rendered as its own canonical section,
    // not as a derived ActivityRecord filter.
    if (typeFilter !== 'all') {
      result = result.filter((item) => {
        switch (typeFilter) {
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
  }, [items, selectedParticipantId, workflowFilter, activeFilter, typeFilter, searchQuery, density]);

  // ─── Bounded Window ─────────────────────────────────────

  const rendered = useMemo(() => {
    const start = Math.max(0, filtered.length - RENDER_WINDOW - olderLoaded);
    return filtered.slice(start);
  }, [filtered, olderLoaded]);

  // Row anatomy (M11CStreamItem) is two compact lines: pad 16 + line 1 ~18 +
  // line 2 driven by 28px inline actions + borders ≈ 68. Measured rows still
  // correct this via ResizeObserver; the estimate only seeds first paint.
  const virtualizer = useVirtualizer({
    count: rendered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 68,
    overscan: 8,
    // Continuous list: no inter-row gap — record separation is border-bottom.
    gap: 0,
    scrollMargin: preambleH,
    getItemKey: (index) => rendered[index]?.id ?? index,
  });

  const hasMore = filtered.length > rendered.length;
  // Attention mode renders the canonical AttentionEntry[] section followed by
  // Recent Activity. The "Waiting for activity…" empty state appears only when
  // there is genuinely nothing to show: no stream rows AND (in attention mode)
  // no open attention entries. It must never mask unresolved attention.
  const attentionMode = activeFilter === 'attention';
  const streamEmpty = rendered.length === 0 && (!attentionMode || attentionEntries.length === 0);

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
        <div className="ar-stream-filter__tabs" role="tablist" aria-label="Activity stream presets">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              aria-pressed={activeFilter === tab.id}
              className={`ar-stream-filter__tab ${activeFilter === tab.id ? 'ar-stream-filter__tab--active' : ''}`}
            >
              <span className="ar-stream-filter__dot" aria-hidden="true" />
              {tab.label} ({filterCounts[tab.id]})
            </button>
          ))}
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
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
              className="ar-stream-filter__select"
              aria-label="Activity category"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {streamHeaderAction}
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
        ) : streamEmpty ? (
          <EmptyState
            icon={<span className="text-2xl">❖</span>}
            title="Waiting for activity…"
            description="No activity yet. Start a workflow and its progress will appear here in real time."
            className="ar-empty"
          />
        ) : (
          <>
            {/* Dedicated virtualized region: the sizer reserves preambleH +
                totalSize, so virtual row transforms (which include the
                scrollMargin origin) land on real document positions and can
                never overlap the attention DOM. The preamble keeps natural
                flow height for 0/1/5/N attention entries. */}
            <div
              style={{
                height: `${virtualizer.getTotalSize() + preambleH}px`,
                position: 'relative',
                width: '100%',
              }}
            >
              <div ref={setPreambleNode}>
            {attentionMode && (
              <section className="ar-attention-section" aria-label={`Needs Attention (${attentionEntries.length})`}>
                <div className="ar-attention-section__header">
                  <span className="ar-attention-section__chevron" aria-hidden="true">⌄</span>
                  <div>
                    <h3>Needs Attention ({attentionEntries.length})</h3>
                    <p>Items requiring your attention</p>
                  </div>
                </div>
                {attentionEntries.length === 0 ? (
                  <p className="ar-attention-section__empty">All clear — no open attention.</p>
                ) : (
                  <div className="ar-attention-list">
                    {attentionEntries.map((entry) => {
                      const tone = attentionTone(entry);
                      return (
                        <button
                          key={entry.attentionId}
                          type="button"
                          className="ar-attention-row"
                          onClick={() => onOpenAttention?.(entry)}
                          title={`${attentionTypeLabel(entry)} · ${entry.message}`}
                        >
                          <span className={`ar-attention-row__icon ar-attention-row__icon--${tone}`} aria-hidden="true">
                            <AttentionMaterialIcon entry={entry} tone={tone} />
                          </span>
                          <span className="ar-attention-row__main">
                            <span className={`ar-attention-row__type ar-attention-row__type--${tone}`}>
                              {attentionTypeLabel(entry)}
                            </span>
                            <span className="ar-attention-row__subject" title={attentionSubject(entry)}>
                              {attentionSubject(entry)}
                            </span>
                            <span className="ar-attention-row__reason" title={entry.message}>{entry.message}</span>
                          </span>
                          <span className="ar-attention-row__statuswrap">
                            <span
                              className={`ar-attention-row__status ar-attention-row__status--${tone}`}
                              title={entry.reason}
                            >
                              {attentionStatusLabel(entry.reason)}
                            </span>
                            {entry.severity && (
                              <span className="ar-attention-row__severity" title={`Severity ${entry.severity}`}>
                                {entry.severity}
                              </span>
                            )}
                          </span>
                          <span className="ar-attention-row__meta">
                            <span title={entry.timestamp}>{formatTimestamp(entry.timestamp)}</span>
                            {entry.owner && <span title={`Owner ${entry.owner}`}>{entry.owner}</span>}
                            <span className="font-mono" title={`Source record ${entry.sourceRecordId}`}>
                              {entry.sourceRecordId.slice(0, 12)}
                            </span>
                          </span>
                          {/* Attach as reference — separate action from detail
                              navigation. A span (not a nested button: the row
                              itself is a button) with button semantics. Attaches
                              the structured AttentionEntry, never sends. */}
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`Attach ${attentionTypeLabel(entry)} ${attentionSubject(entry)} as reference`}
                            title="Attach as reference"
                            className="ar-attention-row__attach"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAttachAttention?.(entry);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                onAttachAttention?.(entry);
                              }
                            }}
                          >
                            <AddLinkOutlinedIcon className="ar-attention-row__attach-icon" aria-hidden="true" />
                          </span>
                          <span className="ar-attention-row__arrow" aria-hidden="true">›</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            {attentionMode && <div className="ar-attention-section__recent">Recent Activity</div>}

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
              </div>

              {/* Virtualized Recent Activity rows: retained history stays
                  available while only the viewport plus a small overscan
                  window mounts DOM. The virtualizer owns ONLY these rows —
                  never the preamble above. */}
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
                      participantModels={participantModels}
                      onSelectWorkflow={onSelectWorkflow}
                      onInspectEdit={onInspectEdit}
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
