import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ActivityItem from './ActivityItem';
import type { ActivityRecord, ActivityScope, PendingSendState } from './activity-types';

/** Bounded render window so high event volume never floods the DOM. */
const RENDER_WINDOW = 300;

interface ActivityStreamProps {
  records: readonly ActivityRecord[];
  selectedAgentId: string | undefined;
  stateLabel: string;
  loading: boolean;
  scope: ActivityScope;
  unread: number;
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
  const [showOlder, setShowOlder] = useState(false);

  const visible = useMemo(() => {
    return records.filter((record) => {
      if (!matchesScope(record, scope)) return false;
      if (selectedAgentId === undefined) return true;
      return matchesAgent(record, selectedAgentId);
    });
  }, [records, selectedAgentId, scope]);

  const clipped = visible.length > RENDER_WINDOW;
  const rendered = clipped && !showOlder ? visible.slice(visible.length - RENDER_WINDOW) : visible;
  const hiddenCount = visible.length - rendered.length;

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
            {clipped && (
              <div className="flex items-center justify-center py-1">
                <button
                  type="button"
                  onClick={() => setShowOlder(true)}
                  className="rounded-full border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1 text-[9px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
                >
                  Show {hiddenCount} older records
                </button>
              </div>
            )}
            {rendered.map((record) => (
              <ActivityItem
                key={record.id}
                record={record}
                selectedAgentId={selectedAgentId}
                onOpenDetail={onOpenDetail}
                onReference={onReference}
                onCorrect={onCorrect}
                correctedBy={correctionsByTarget.get(record.id)}
                sendState={sendStates?.[record.id]}
                onRetry={onRetry ? () => onRetry(record.id) : undefined}
              />
            ))}
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
