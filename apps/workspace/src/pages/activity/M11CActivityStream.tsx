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
 * - Executions: kind === 'activity' || kind === 'progress'
 * - Errors: kind === 'diagnostic' (authoritative failure class, not string matching)
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AddLinkOutlinedIcon from '@mui/icons-material/AddLinkOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import NightlightOutlinedIcon from '@mui/icons-material/NightlightOutlined';
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
import ActivityDateFilter, { type DateFilterValue } from './ActivityDateFilter';
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
  /** Whether older durable activity may still be available. */
  readonly hasMoreHistory?: boolean;
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
  /** Clear the participant scope (rail selection) — used by the filtered-empty reset. */
  readonly onClearParticipantFilter?: () => void;
  /** Clear the workflow scope (browser/badge selection) — used by the filtered-empty reset. */
  readonly onClearWorkflowFilter?: () => void;
  /** Inspect a resolved edit observation in the Activity Room Files drawer. */
  readonly onInspectEdit?: (detail: import('@vestara/shared').FileMutationExecutionDetail) => void;
  readonly onSteerTurn?: (conversationId: string) => void;
  readonly onStopTurn?: (conversationId: string) => Promise<void>;
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
 */
export type StreamFilter = 'all' | 'attention' | 'operational';
export type TypeFilter = 'all' | 'conversations' | 'work' | 'evidence';

/** Timeline density (DENSITY-MODES): summary hides routine ops, operational hides raw chatter, raw shows all. */
export type StreamDensity = 'summary' | 'operational' | 'raw';

export function matchesDensityKind(kind: string, density: StreamDensity): boolean {
  if (density === 'raw') return true;
  if (density === 'operational') return kind !== 'log' && kind !== 'telemetry';
  // summary: milestones + conversations + failures + evidence + decisions
  return kind === 'conversation' || kind === 'activity' || kind === 'diagnostic' || kind === 'evidence' || kind === 'interaction' || kind === 'error';
}

/**
 * Presentation label for a density mode. Hidden records are described only
 * as hidden by the active view — never as missing, unloaded, failed, or
 * unavailable (density filtering is presentation only; recovery holds all).
 */
export function densityViewLabel(density: StreamDensity): string {
  return density === 'raw' ? 'Raw' : density === 'summary' ? 'Summary' : 'Operational';
}

/**
 * AR-STREAM-TOOL-001 — standalone tool lifecycle rows are structurally
 * excluded from the Activity Stream list, regardless of density.
 *
 * tool.called / tool.succeeded / tool.failed remain authoritative M9
 * execution evidence with exact callID lineage: they are recovered in the
 * snapshot, correlated onto their owning activity by AR-COORD-002
 * (deriveCorrelatedSessions → "Activity · N operations"), and resolvable
 * through detail/drill-down/diagnostics by activity identity. They are
 * simply never standalone list entries — not hidden by a view, excluded
 * from the list projection itself.
 */
export function isToolLifecycleKind(kind: string): boolean {
  return kind === 'tool-call' || kind === 'tool-result';
}

/**
 * List-eligible records: everything recovered except standalone tool
 * lifecycle rows. Scope, density, preset, category, and search narrow
 * further downstream from this set.
 */
export function applyStreamEligibility(items: readonly StreamItemType[]): StreamItemType[] {
  return items.filter((item) => !isToolLifecycleKind(item.kind));
}

/** Scope options shared by the stream pipeline (participant + workflow narrow the eligible set). */
export interface StreamScopeOptions {
  readonly selectedParticipantId?: string;
  readonly workflowFilter?: string | null;
}

/** Full presentation filter options (scope + density + preset + category + search + date). */
export interface StreamFilterOptions extends StreamScopeOptions {
  readonly density: StreamDensity;
  readonly activeFilter: StreamFilter;
  readonly typeFilter: TypeFilter;
  readonly searchQuery: string;
  /** Inclusive calendar-day lower bound (`yyyy-mm-dd`, viewer locale). Absent/empty = unbounded. */
  readonly startDate?: string | null;
  /** Inclusive calendar-day upper bound (`yyyy-mm-dd`, viewer locale). Absent/empty = unbounded. */
  readonly endDate?: string | null;
}

/** Strict `yyyy-mm-dd` parse into viewer-locale calendar parts. Returns null when absent or malformed. */
export function parseCalendarDay(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  return { year, month, day };
}

/** Viewer-locale midnight (ms) for a calendar day. */
function dayStartMs(part: { year: number; month: number; day: number }): number {
  return new Date(part.year, part.month - 1, part.day).getTime();
}

/** True when the From/To pair is usable. Invalid (`From > To`) applies no date predicate — the UI warns instead of swapping. */
export function isValidDateRange(startDate: string | null | undefined, endDate: string | null | undefined): boolean {
  const start = parseCalendarDay(startDate);
  const end = parseCalendarDay(endDate);
  if (!start || !end) return true;
  return dayStartMs(start) <= dayStartMs(end);
}

/** Date-window predicate over an ISO timestamp. Window bounds are inclusive calendar days in the viewer locale. */
export function matchesDateWindow(
  timestamp: string,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): boolean {
  const start = parseCalendarDay(startDate);
  const end = parseCalendarDay(endDate);
  if (!start && !end) return true;
  if (start && end && dayStartMs(start) > dayStartMs(end)) return true;
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return false;
  if (start && time < dayStartMs(start)) return false;
  if (end) {
    const endExclusive = dayStartMs(end) + 86_400_000;
    if (time >= endExclusive) return false;
  }
  return true;
}

/**
 * Apply participant + workflow scope only. Density, preset, category, and
 * search narrow further downstream — this is the eligible set the density
 * count is measured against.
 */
export function applyStreamScope(
  items: readonly StreamItemType[],
  scope: StreamScopeOptions,
): StreamItemType[] {
  let result = items;
  if (scope.selectedParticipantId !== undefined) {
    const selected = scope.selectedParticipantId;
    result = result.filter((item) => item.actor.id === selected || `agent-${item.actor.id}` === selected);
  }
  if (scope.workflowFilter) {
    const workflow = scope.workflowFilter;
    result = result.filter((item) => item.workflowRunId === workflow);
  }
  return [...result];
}

/**
 * Count scope-eligible records hidden by the active density mode.
 * Presentation only — the records remain recovered client-side.
 */
export function countDensityHidden(
  items: readonly StreamItemType[],
  scope: StreamScopeOptions,
  density: StreamDensity,
): number {
  if (density === 'raw') return 0;
  return applyStreamScope(items, scope).filter((item) => !matchesDensityKind(item.kind, density)).length;
}

/**
 * Presentation pipeline shared by the stream component and its tests.
 * Uses canonical M11C stream `kind` values, not string matching.
 * Order (all AND-composed): eligibility → scope → density → preset →
 * category → search → date. Standalone tool lifecycle rows never enter the list
 * under any density (AR-STREAM-TOOL-001); correlated tool operations stay
 * visible on their owning activity via its session.
 */
export function filterStreamItems(items: readonly StreamItemType[], options: StreamFilterOptions): StreamItemType[] {
  let result = applyStreamEligibility(items).filter((item) => matchesDensityKind(item.kind, options.density));

  // Participant filter (existing)
  if (options.selectedParticipantId !== undefined) {
    const selected = options.selectedParticipantId;
    result = result.filter((item) => item.actor.id === selected || `agent-${item.actor.id}` === selected);
  }

  // Workflow scope (from browser selection or stream badge)
  if (options.workflowFilter) {
    const workflow = options.workflowFilter;
    result = result.filter((item) => item.workflowRunId === workflow);
  }

  if (options.activeFilter === 'operational') {
    result = result.filter((item) => matchesDensityKind(item.kind, 'operational'));
  }

  if (options.activeFilter === 'attention') {
    result = result.filter(isAttentionItem);
  }

  // Type filter. Needs Attention is rendered as its own canonical section,
  // not as a derived ActivityRecord filter.
  if (options.typeFilter !== 'all') {
    result = result.filter((item) => {
      switch (options.typeFilter) {
        case 'conversations':
          return item.kind === 'conversation';
        case 'work':
          return item.kind === 'activity' || item.kind === 'progress';
        case 'evidence':
          return item.kind === 'evidence';
        default:
          return true;
      }
    });
  }

  // Text search filter (content + actor name)
  const query = options.searchQuery.trim().toLowerCase();
  if (query) {
    result = result.filter((item) => {
      const contentMatch = item.content.toLowerCase().includes(query);
      const actorMatch = item.actor.displayName.toLowerCase().includes(query);
      return contentMatch || actorMatch;
    });
  }

  // Date-window filter (inclusive calendar days, viewer locale). Invalid
  // ranges apply no predicate — the filter bar warns instead of swapping.
  if (parseCalendarDay(options.startDate) || parseCalendarDay(options.endDate)) {
    if (isValidDateRange(options.startDate, options.endDate)) {
      result = result.filter((item) => matchesDateWindow(item.timestamp, options.startDate, options.endDate));
    }
  }

  return result;
}

/**
 * The stream counts, kept separate by construction:
 * - recovered: items the client holds (snapshot + live + history, tool
 *   lifecycle evidence included — recovery is lossless).
 * - excludedToolRows: recovered tool lifecycle rows structurally excluded
 *   from the list (AR-STREAM-TOOL-001). Never a loss signal.
 * - scopeEligible / densityHidden / filtered / rendered: the presentation
 *   pipeline over list-eligible records only.
 * Never derive "activity count" from the rendered array alone, and never
 * count excluded tool rows as density-hidden.
 */
export interface StreamCounts {
  readonly recovered: number;
  readonly excludedToolRows: number;
  readonly scopeEligible: number;
  readonly densityHidden: number;
  readonly filtered: number;
  readonly rendered: number;
}

export function computeStreamCounts(
  items: readonly StreamItemType[],
  options: StreamFilterOptions & { readonly renderWindow?: number; readonly olderLoaded?: number },
): StreamCounts {
  const eligible = applyStreamEligibility(items);
  const scopeEligible = applyStreamScope(eligible, options).length;
  const densityHidden = countDensityHidden(eligible, options, options.density);
  const filtered = filterStreamItems(items, options).length;
  const renderWindow = options.renderWindow ?? RENDER_WINDOW;
  const olderLoaded = options.olderLoaded ?? 0;
  const rendered = Math.min(filtered, renderWindow + olderLoaded);
  return {
    recovered: items.length,
    excludedToolRows: items.length - eligible.length,
    scopeEligible,
    densityHidden,
    filtered,
    rendered,
  };
}

/** The canonical latest end for the ascending oldest → newest list. */
export function latestScrollPosition(scrollHeight: number): number {
  return scrollHeight;
}

/** Preserve the current visual item when older rows are prepended. */
export function preservedScrollPosition(previousTop: number, previousHeight: number, nextHeight: number): number {
  return previousTop + Math.max(0, nextHeight - previousHeight);
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
  hasMoreHistory = true,
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
  onClearParticipantFilter,
  onClearWorkflowFilter,
  onInspectEdit,
  onSteerTurn,
  onStopTurn,
  workflowFilter,
  streamHeading = 'Activity Stream',
  streamHeaderAction,
  showViewTabs = false,
  density: controlledDensity,
  onDensityChange,
}: M11CActivityStreamProps) {
  useRenderProfiler('M11CActivityStream');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const previousScrollHeight = useRef(0);
  const previousItemCount = useRef(0);
  const previousOlderLoaded = useRef(0);
  const snapFrame = useRef(0);
  const [activeFilter, setActiveFilter] = useState<StreamFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [activeView, setActiveView] = useState<ActivityRoomView>('activity');
  const [searchQuery, setSearchQuery] = useState('');
  // AR-DATE-001: inclusive calendar-day window (`yyyy-mm-dd`, viewer locale). Empty = unbounded.
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | 'custom'>('all');
  const [internalDensity, setInternalDensity] = useState<StreamDensity>('operational');
  const density = controlledDensity ?? internalDensity;
  const setDensity = useCallback(
    (next: StreamDensity) => {
      onDensityChange?.(next);
      if (controlledDensity === undefined) setInternalDensity(next);
    },
    [controlledDensity, onDensityChange],
  );
  const showAllDensity = useCallback(() => setDensity('raw'), [setDensity]);

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
    // Visible-item counts never include standalone tool lifecycle rows.
    const eligible = applyStreamEligibility(items);
    let base = selectedParticipantId !== undefined
      ? eligible.filter((item) => item.actor.id === selectedParticipantId)
      : eligible;
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
  // Canonical pipeline (filterStreamItems): eligibility → scope → density →
  // preset → category → search. Recovered (items, tool evidence included),
  // tool-excluded, density-hidden, filtered, and rendered stay separate.

  const eligibleItems = useMemo(() => applyStreamEligibility(items), [items]);

  const excludedToolRows = items.length - eligibleItems.length;

  const scopeBase = useMemo(
    () => applyStreamScope(eligibleItems, { selectedParticipantId, workflowFilter }),
    [eligibleItems, selectedParticipantId, workflowFilter],
  );

  const densityHidden = useMemo(
    () => (density === 'raw' ? 0 : scopeBase.filter((item) => !matchesDensityKind(item.kind, density)).length),
    [scopeBase, density],
  );

  const filtered = useMemo(
    () =>
      filterStreamItems(items, {
        density,
        selectedParticipantId,
        workflowFilter,
        activeFilter,
        typeFilter,
        searchQuery,
        startDate,
        endDate,
      }),
    [items, density, selectedParticipantId, workflowFilter, activeFilter, typeFilter, searchQuery, startDate, endDate],
  );

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
  // Recent Activity. The idle empty state appears only when there is genuinely
  // nothing to show: no stream rows AND (in attention mode) no open attention
  // entries. It must never mask unresolved attention. Filtered-empty (items
  // exist but search/preset/scope hides them) renders a distinct reset state.
  const attentionMode = activeFilter === 'attention';
  const streamEmpty = rendered.length === 0 && (!attentionMode || attentionEntries.length === 0);
  const trimmedQuery = searchQuery.trim();
  // AR-DATE-001: a set From/To bound is an internal filter even when other presets are clear.
  const dateActive = parseCalendarDay(startDate) !== null || parseCalendarDay(endDate) !== null;
  const dateRangeValid = isValidDateRange(startDate, endDate);
  const hasInternalFilter =
    activeFilter !== 'all' || typeFilter !== 'all' || trimmedQuery.length > 0 || dateActive;
  const hasExternalScope = selectedParticipantId !== undefined || workflowFilter != null;
  // Density is presentation-only: records it hides stay recovered. A density
  // that hides the whole window is a filtered-empty state, never quiet.
  const hasDensityFilter = density !== 'raw' && densityHidden > 0;
  // Structural tool exclusion is not a loss signal either: a window holding
  // only tool operations renders its own state, never quiet, never missing.
  const hasStructuralExclusion = excludedToolRows > 0;
  const baseHasContent = items.length > 0 || attentionEntries.length > 0;
  const isFilteredEmpty =
    streamEmpty &&
    baseHasContent &&
    (hasInternalFilter || hasExternalScope || hasDensityFilter || hasStructuralExclusion);
  const filteredEmptyTitle = trimmedQuery
    ? `No matches for "${trimmedQuery.length > 40 ? `${trimmedQuery.slice(0, 40)}…` : trimmedQuery}"`
    : selectedParticipantId !== undefined && participantNames?.[selectedParticipantId]
      ? `No activity for ${participantNames[selectedParticipantId]} in this window`
      : workflowFilter
        ? `No activity for this workflow in this window`
        : dateActive && dateRangeValid
          ? `No activity from ${startDate || '…'} to ${endDate || '…'}`
          : typeFilter !== 'all'
          ? 'Hidden by the category filter'
          : hasDensityFilter
            ? `Hidden by the ${densityViewLabel(density)} view`
              : hasStructuralExclusion
              ? 'No list activity in this window'
              : 'Hidden by the current filters';
  const clearAllFilters = useCallback(() => {
    setActiveFilter('all');
    setTypeFilter('all');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setDatePreset('all');
    onClearWorkflowFilter?.();
    onClearParticipantFilter?.();
  }, [onClearParticipantFilter, onClearWorkflowFilter]);

  // AR-DATE-002: the dropdown owns presets/inputs; the stream owns the window.
  const handleDateChange = useCallback((next: DateFilterValue) => {
    setStartDate(next.startDate);
    setEndDate(next.endDate);
    setDatePreset(next.preset);
  }, []);

  const clearDates = useCallback(() => {
    setStartDate('');
    setEndDate('');
    setDatePreset('all');
  }, []);

  // ─── Scroll Behavior ────────────────────────────────────

  // Snap to the true bottom in two phases: virtualized rows measure
  // asynchronously (ResizeObserver), so total size can grow after this
  // commit. The rAF re-assertion lands jumps/follows on the settled bottom
  // instead of the estimated one.
  const snapToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = latestScrollPosition(el.scrollHeight);
    cancelAnimationFrame(snapFrame.current);
    snapFrame.current = requestAnimationFrame(() => {
      const target = scrollRef.current;
      if (target) target.scrollTop = latestScrollPosition(target.scrollHeight);
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

    const historyLoaded = olderLoaded > previousOlderLoaded.current;
    const priorHeight = previousScrollHeight.current;
    const priorTop = el.scrollTop;

    if (historyLoaded) {
      el.scrollTop = preservedScrollPosition(priorTop, priorHeight, el.scrollHeight);
      cancelAnimationFrame(snapFrame.current);
      snapFrame.current = requestAnimationFrame(() => {
        const target = scrollRef.current;
        if (target) target.scrollTop = preservedScrollPosition(priorTop, priorHeight, target.scrollHeight);
      });
    } else if (atBottom) {
      if (items.length >= previousItemCount.current) snapToBottom();
    } else if (items.length > previousItemCount.current) {
      // New live rows append at the latest end. A user reading older rows
      // keeps the current viewport; only an at-bottom user auto-follows.
    }

    previousItemCount.current = items.length;
    previousScrollHeight.current = el.scrollHeight;
    previousOlderLoaded.current = olderLoaded;
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
            <span className="sr-only">Timeline density</span>
            <select
              value={density}
              onChange={(event) => setDensity(event.target.value as StreamDensity)}
              className="ar-stream-filter__select"
              aria-label="Timeline density"
              title="Timeline density: Raw shows every recovered record"
            >
              <option value="summary">Summary</option>
              <option value="operational">Operational</option>
              <option value="raw">Raw</option>
            </select>
          </label>
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
          {/* AR-DATE-002: date-window filter lives in the icon dropdown.
              All visual values map to Vestara tokens; Tailwind is the renderer only. */}
          <ActivityDateFilter
            startDate={startDate}
            endDate={endDate}
            preset={datePreset}
            dateActive={dateActive}
            dateRangeValid={dateRangeValid}
            onChange={handleDateChange}
            onClear={clearDates}
          />
          {streamHeaderAction}
        </div>
      </div>

      {/* AR-DATE-001: invalid ranges pause the date predicate instead of swapping bounds. */}
      {dateActive && !dateRangeValid && (
        <div
          className="ar-banner ar-banner--warn"
          role="status"
          aria-live="polite"
          aria-label="Invalid date range"
        >
          <span className="min-w-0 flex-1">From date is after To date — date filter paused until fixed.</span>
        </div>
      )}

      {/* AR-DATE-001: date windows apply over recovered items; older history may still be loading. */}
      {dateActive && dateRangeValid && (hasMoreHistory || loadingHistory) && (
        <div
          className="ar-banner ar-banner--info"
          role="status"
          aria-live="polite"
          aria-label="Older history may still be loading for this date window"
        >
          <span className="min-w-0 flex-1">Older history may still be loading — use Load older history to extend coverage.</span>
        </div>
      )}

      {/* Density visibility (AR-STREAM-RELOAD-001): the density view is
          presentation-only, so records it hides are announced with their
          recovered count — never as missing, unloaded, failed, or
          unavailable. Bounded single row with a reveal action. */}
      {hasDensityFilter && (
        <div
          className="ar-banner ar-banner--info"
          role="status"
          aria-live="polite"
          aria-label={`${densityHidden} ${densityHidden === 1 ? 'activity' : 'activities'} hidden by ${densityViewLabel(density)} view`}
        >
          <span className="min-w-0 flex-1">
            {densityHidden} {densityHidden === 1 ? 'activity' : 'activities'} hidden by {densityViewLabel(density)}{' '}
            view
          </span>
          <button type="button" onClick={showAllDensity} className="ar-stream-filter__tab">
            Show all
          </button>
        </div>
      )}

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
          <div role="status" aria-live="polite" aria-label="Connecting to Activity Room" className="flex flex-col gap-2 py-1">
            <span className="ar-kicker">Connecting — loading recent activity…</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} aria-hidden="true" className="ar-skeleton" />
            ))}
          </div>
        ) : streamEmpty ? (
          isFilteredEmpty ? (
            <EmptyState
              icon={<FilterAltOffOutlinedIcon sx={{ fontSize: SIZING.icon.lg }} />}
              title={filteredEmptyTitle}
              description="Nothing in this window is eligible for the activity list. Tool operations remain recoverable inside their owning activity as execution evidence."
              action={
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="min-h-11 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-3 text-xs font-semibold text-[var(--vestara-text-secondary)]"
                  >
                    Clear search &amp; filters
                  </button>
                  {hasDensityFilter && (
                    <button
                      type="button"
                      onClick={showAllDensity}
                      className="min-h-11 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-3 text-xs font-semibold text-[var(--vestara-text-secondary)]"
                    >
                      Show all
                    </button>
                  )}
                </span>
              }
              className="ar-empty"
            />
          ) : (
            <EmptyState
              icon={<NightlightOutlinedIcon sx={{ fontSize: SIZING.icon.lg }} />}
              title="Room is quiet — nothing running"
              description="Healthy idle state. New workflow progress, messages, and evidence will stream here. Use the composer below to start work."
              className="ar-empty"
            />
          )
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
                        <div
                          key={entry.attentionId}
                          className="ar-attention-row"
                          role="listitem"
                        >
                          <button
                            type="button"
                            className="ar-attention-row__detail"
                            onClick={() => onOpenAttention?.(entry)}
                            disabled={!onOpenAttention}
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
                          </button>
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
                          {/* Attach as reference — a separate action from detail
                              navigation. It attaches the structured entry and
                              never sends or mutates attention. */}
                          <button
                            type="button"
                            aria-label={`Attach ${attentionTypeLabel(entry)} ${attentionSubject(entry)} as reference`}
                            title="Attach as reference"
                            className="ar-attention-row__attach"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAttachAttention?.(entry);
                            }}
                          >
                            <AddLinkOutlinedIcon className="ar-attention-row__attach-icon" aria-hidden="true" />
                          </button>
                          <span className="ar-attention-row__arrow" aria-hidden="true">›</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            {attentionMode && <div className="ar-attention-section__recent">Recent Activity</div>}

              {/* Load older history button */}
              {(hasMore || hasMoreHistory) && onLoadOlder && (
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
                      onSteerTurn={onSteerTurn}
                      onStopTurn={onStopTurn}
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
