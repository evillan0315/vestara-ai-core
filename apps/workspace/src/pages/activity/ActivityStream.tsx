import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ActivityItem from './ActivityItem';
import { collapseToolRuns, formatTime, hierarchyCategory, matchesDensity, type ActivityCategory } from './activity-formatters';
import type { ActivityDensity, ActivityProjectionRecord, ActivityRecord, ActivityScope, PendingSendState } from './activity-types';

/** Bounded render window (STREAM-PERF-001): this is *bounded windowing* (the
 * latest N rows are mounted), not true viewport virtualization (only visible
 * rows mounted). With compact projected rows this performs well; true
 * virtualization can follow if profiling shows it is necessary. */
const RENDER_WINDOW = 50;

interface ActivityStreamProps {
  records: readonly ActivityProjectionRecord[];
  selectedAgentId: string | undefined;
  stateLabel: string;
  loading: boolean;
  scope: ActivityScope;
  unread: number;
  density: ActivityDensity;
  freshIds?: ReadonlySet<string>;
  onLoadOlder?: () => void;
  loadingOlder?: boolean;
  /** Older records requested via pagination; widens the render window upward. */
  olderLoaded?: number;
  onClearUnread: () => void;
  onReportViewport: (atBottom: boolean) => void;
  onOpenDetail?: (record: ActivityRecord) => void;
  onReference?: (record: ActivityRecord) => void;
  onCorrect?: (record: ActivityRecord) => void;
  sendStates?: Readonly<Record<string, PendingSendState>>;
  onRetry?: (messageId: string) => void;
}

function matchesScope(record: ActivityRecord, scope: ActivityScope): boolean {
  if (scope.workflowId !== undefined && record.workflowId !== scope.workflowId) return false;
  if (scope.sessionId !== undefined && record.sessionId !== scope.sessionId) return false;
  return true;
}

function matchesAgent(record: ActivityRecord, agentId: string): boolean {
  return record.actor.id === agentId || (record.kind === 'agent-message' && record.agentId === agentId);
}

export default function ActivityStream({
  records,
  selectedAgentId,
  stateLabel,
  loading,
  scope,
  unread,
  density,
  freshIds,
  onLoadOlder,
  loadingOlder,
  olderLoaded = 0,
  onClearUnread,
  onReportViewport,
  onOpenDetail,
  onReference,
  onCorrect,
  sendStates,
  onRetry,
}: ActivityStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const visible = useMemo(() => {
    return records.filter((record) => {
      if (!matchesDensity(record, density)) return false;
      if (!matchesScope(record, scope)) return false;
      if (selectedAgentId === undefined) return true;
      return matchesAgent(record, selectedAgentId);
    });
  }, [records, selectedAgentId, scope, density]);

  // Viewport-bounded window (STREAM-PERF-001): render the latest rows; widen
  // upward by the number of older records the user explicitly requested.
  const rendered = visible.slice(-(RENDER_WINDOW + olderLoaded));
  const hasMore = visible.length > rendered.length;

  // Aggregate consecutive low-level tool events from the same agent into a
  // single operational row ("Developer · 12 operations") so the timeline never
  // renders a long run of tool chatter as individual rows.
  const collapsed = useMemo(() => collapseToolRuns(rendered), [rendered]);

  // Map each record to any correction that references it (append-only; the
  // original is never mutated, it is marked corrected).
  const correctionsByTarget = useMemo(() => {
    const map = new Map<string, ActivityRecord>();
    for (const record of records) {
      if (record.correctionOf !== undefined && !map.has(record.correctionOf)) map.set(record.correctionOf, record);
    }
    return map;
  }, [records]);

  useEffect(() => {
    void visible.length;
    if (atBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visible.length, atBottom]);

  useEffect(() => {
    onReportViewport(atBottom);
  }, [atBottom, onReportViewport]);

  const jumpToLatest = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setAtBottom(true);
    onClearUnread();
  }, [onClearUnread]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    setAtBottom(nearBottom);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-ve-target="stream"
        data-ve-name="Activity Stream"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 flex flex-col"
        role="log"
        aria-live="polite"
        aria-label="Activity stream"
      >
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg)"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="text-3xl text-(--vestara-text-dim)">◈</div>
            <p className="text-sm text-(--vestara-text-2)">
              {selectedAgentId === undefined ? 'No activity yet.' : 'No activity from this agent.'}
            </p>
            <p className="text-xs text-(--vestara-text-muted)">
              {scope.workflowId !== undefined || scope.sessionId !== undefined
                ? 'Nothing matches the active scope. Switch to "All activity" to see everything.'
                : selectedAgentId === undefined
                  ? 'Start a workflow and its progress will appear here in real time.'
                  : 'Select "All Agents" to view the full stream.'}
            </p>
          </div>
        ) : (
          <>
            {hasMore && onLoadOlder && (
              <div className="flex items-center justify-center py-1">
                <button
                  type="button"
                  onClick={() => void onLoadOlder()}
                  disabled={loadingOlder}
                  className="rounded-full border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1 text-[9px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer disabled:opacity-50"
                >
                  {loadingOlder ? 'Loading older…' : 'Load older history'}
                </button>
              </div>
            )}
            {collapsed.map((entry, index) =>
              entry.kind === 'tools' ? (
                <AggregatedToolRow key={`tools-${entry.agentId}-${index}`} agentId={entry.agentId} count={entry.count} lastTool={entry.lastTool} timestamp={entry.timestamp} />
              ) : (
                <ActivityItem
                  key={entry.record.id}
                  record={entry.record}
                  selectedAgentId={selectedAgentId}
                  category={hierarchyCategory(entry.record)}
                  onOpenDetail={onOpenDetail}
                  onReference={onReference}
                  onCorrect={onCorrect}
                  correctedBy={correctionsByTarget.get(entry.record.id)}
                  sendState={sendStates?.[entry.record.id]}
                  onRetry={onRetry ? () => onRetry(entry.record.id) : undefined}
                />
              ),
            )}
          </>
        )}
      </div>

      {!atBottom && visible.length > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 right-4 rounded-full border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1 text-[10px] text-(--vestara-text-2) shadow-lg transition-colors hover:text-(--vestara-text) cursor-pointer"
          aria-label={unread > 0 ? `Jump to latest (${unread} unread)` : 'Jump to latest'}
        >
          {unread > 0 ? `↓ ${unread} new` : '↓ Jump to latest'}
        </button>
      )}

      <div className="flex items-center justify-between px-1 pt-1 text-[9px] text-(--vestara-text-dim)">
        <span>
          {visible.length} records
          {selectedAgentId !== undefined ? ' · filtered to one agent' : ''}
          {scope.workflowId !== undefined ? ` · workflow ${scope.workflowId}` : ''}
          {scope.sessionId !== undefined ? ` · session ${scope.sessionId}` : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--vestara-green)" />
          {stateLabel}
        </span>
      </div>
    </div>
  );
}

/** Compact aggregated row for a run of consecutive tool operations. */
function AggregatedToolRow({
  agentId,
  count,
  lastTool,
  timestamp,
}: {
  agentId: string;
  count: number;
  lastTool: string;
  timestamp: string;
}) {
  const name = agentId.toLowerCase().startsWith('vestara-')
    ? agentId.slice('vestara-'.length).replace(/-/g, ' ')
    : agentId.replace(/-/g, ' ');
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-(--vestara-text-muted)">
      <span className="shrink-0 font-medium text-(--vestara-text-2)">{name}</span>
      <span className="shrink-0 text-(--vestara-text-dim)">⌘</span>
      <span className="truncate">{lastTool || `tool operation`}</span>
      <span className="ml-auto shrink-0 text-[9px] text-(--vestara-text-dim)">{count} operation{count > 1 ? 's' : ''}</span>
      <span className="shrink-0 text-[9px] text-(--vestara-text-dim)">{formatTime(timestamp)}</span>
    </div>
  );
}
