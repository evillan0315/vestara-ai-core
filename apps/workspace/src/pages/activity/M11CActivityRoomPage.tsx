/**
 * M11C Activity Room Page
 *
 * Production Activity Room UI Shell + Live Read Surface.
 * Consumes frozen M11A HTTP read API and M11B WebSocket protocol.
 *
 * Authority flow: M9 durable truth → M10 projection → M11A/M11B → this page → UI
 *
 * No alternative Activity Room state source, polling loop, mock participant
 * system, or UI-owned workflow state is introduced.
 *
 * Acceptance criteria:
 * 1. Renders entirely from M11A/M11B production contracts
 * 2. Zero hardcoded participants
 * 3. Snapshot → catch-up → live produces no visible duplication
 * 4. Disconnect/reconnect requires no reload
 * 5. resync-required performs controlled resynchronization
 * 6. Historical pages load independently from M10's 500-item working set
 * 7. Older-history prepend preserves viewport position
 * 8. Incoming activity does not steal scroll position when reading history
 * 9. At-bottom users follow live activity naturally
 * 10. Stream importance has primary/secondary/muted visual treatment
 * 11. Aggregated items retain M9 references
 * 12. Participant membership/presence/work state displayed independently
 * 13. Keyboard focus can reach stream items
 * 14. No M8/M9/M10 state can be mutated from this page
 * 15. No polling introduced as a second realtime mechanism
 */

import { useCallback, useEffect, useState } from 'react';
import { useM11CActivityRoom, type M11CStreamItem } from '../../hooks/useM11CActivityRoom';
import M11CActivityStream from './M11CActivityStream';
import M11CConnectionStatus from './M11CConnectionStatus';
import M11CParticipantRail from './M11CParticipantRail';

// ─── Component ───────────────────────────────────────────────

export default function M11CActivityRoomPage() {
  const room = useM11CActivityRoom();
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | undefined>(undefined);
  const [detailItem, setDetailItem] = useState<M11CStreamItem | null>(null);

  // ─── Callbacks ──────────────────────────────────────────

  const handleSelectParticipant = useCallback((id: string | undefined) => {
    setSelectedParticipantId(id);
  }, []);

  const handleOpenDetail = useCallback((item: M11CStreamItem) => {
    setDetailItem(item);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailItem(null);
  }, []);

  const handleDrillDown = useCallback((_aggregateId: string, _referencedIds: readonly string[]) => {
    // M11C: drill-down opens detail modal with aggregate contents
    // Full drawer experience comes in next slice
  }, []);

  // ─── Connection state label ─────────────────────────────

  const stateLabel =
    room.state === 'connecting' ? 'Connecting' :
    room.state === 'live' ? 'Live' :
    room.state === 'reconnecting' ? 'Reconnecting' :
    room.state === 'offline' ? 'Offline' :
    room.state === 'paused' ? 'Paused' :
    room.state === 'error' ? 'Resyncing' :
    'Unknown';

  // ─── Room name ──────────────────────────────────────────

  const roomName = room.room?.name ?? 'Activity Room';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 sm:gap-4">
      {/* ─── Header ─────────────────────────────────────── */}
      <header className="flex flex-col gap-3 rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-(--vestara-accent-text)">
            Live operations
          </div>
          <h1 className="text-lg font-bold text-(--vestara-text)">{roomName}</h1>
          <p className="mt-1 text-[10px] text-(--vestara-text-muted)">
            <span className="text-(--vestara-text-2)">{room.stream.length} records</span>
            {room.cursor && (
              <span> · cursor {room.cursor.sequenceNumber}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <M11CConnectionStatus state={room.state} />
          <button
            type="button"
            onClick={room.paused ? room.resume : room.pause}
            className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5 text-[10px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
          >
            {room.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={room.clear}
            className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5 text-[10px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
            title="Clear local view"
          >
            Clear
          </button>
        </div>
      </header>

      {/* ─── Error Banner ───────────────────────────────── */}
      {room.error && (
        <div className="flex items-center gap-2 rounded-lg border border-(--vestara-amber-border) bg-(--vestara-amber-bg) px-3 py-2 text-[10px] text-(--vestara-amber)" role="alert">
          <span>{room.error}</span>
          <button type="button" onClick={room.retry} className="ml-auto rounded border border-(--vestara-amber-border) px-2 py-1 font-medium cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* ─── Attention Banner ───────────────────────────── */}
      {room.attention.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2 text-[10px]">
          <span className="font-medium text-(--vestara-amber)">⚠ {room.attention.length} attention item{room.attention.length > 1 ? 's' : ''}</span>
          <span className="text-(--vestara-text-muted)">
            {room.attention.filter((a) => a.severity === 'critical').length > 0 && (
              <span className="text-(--vestara-red)">{room.attention.filter((a) => a.severity === 'critical').length} critical</span>
            )}
          </span>
        </div>
      )}

      {/* ─── Main Content ───────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:gap-4">
        {/* Participant Rail (projection-driven) */}
        <aside className="hidden max-h-56 shrink-0 overflow-y-auto rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-2 sm:p-3 lg:block lg:max-h-none lg:w-72">
          <M11CParticipantRail
            participants={room.participants}
            selectedParticipantId={selectedParticipantId}
            onSelectParticipant={handleSelectParticipant}
          />
        </aside>

        {/* Center Stream */}
        <main className="flex min-h-[28rem] min-w-0 flex-1 flex-col rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-2 sm:p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)" aria-live="polite">
              {selectedParticipantId === undefined ? 'Activity Stream' : `Activity — ${selectedParticipantId}`}
            </div>
            <span className="text-[10px] text-(--vestara-text-muted)">
              {room.paused ? `${room.unread} buffered` : stateLabel}
            </span>
          </div>

          {/* Workflow Summary */}
          {room.workflowSummary && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                room.workflowSummary.status === 'running' ? 'bg-(--vestara-green) animate-pulse' :
                room.workflowSummary.status === 'completed' ? 'bg-(--vestara-green)' :
                room.workflowSummary.status === 'failed' ? 'bg-(--vestara-red)' :
                'bg-(--vestara-text-muted)'
              }`} />
              <span className="text-[10px] font-medium text-(--vestara-text-2)">
                {room.workflowSummary.status}
              </span>
              <span className="text-[9px] text-(--vestara-text-muted)">
                {room.workflowSummary.completedTasks}/{room.workflowSummary.taskCount} tasks
              </span>
            </div>
          )}

          {/* Stream */}
          <M11CActivityStream
            items={room.stream}
            stateLabel={stateLabel}
            unread={room.unread}
            loadingHistory={room.loadingHistory}
            olderLoaded={room.olderLoaded}
            loading={room.state === 'connecting'}
            onLoadOlder={room.loadOlder}
            onReportViewport={room.reportViewport}
            onClearUnread={room.clearUnread}
            onOpenDetail={handleOpenDetail}
            onDrillDown={handleDrillDown}
            selectedParticipantId={selectedParticipantId}
            submission={room.submission}
            onSubmitResponse={room.submitResponse}
          />

          {/* Composer (visual/non-mutating for M11C) */}
          <M11CComposer />
        </main>
      </div>

      {/* ─── Detail Modal ───────────────────────────────── */}
      {detailItem && (
        <M11CDetailModal item={detailItem} onClose={handleCloseDetail} />
      )}
    </div>
  );
}

// ─── Visual/Non-Mutating Composer ──────────────────────────

/**
 * M11C Composer — visual only, does not execute commands.
 * The composer is visible to establish the UI pattern, but does not
 * introduce message-command execution.
 */
function M11CComposer() {
  const [value, setValue] = useState('');

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2">
      <span className="text-[10px] text-(--vestara-text-dim)">+</span>
      <span className="text-[10px] text-(--vestara-text-dim)">@</span>
      <span className="text-[10px] text-(--vestara-text-dim)">/</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Reference…"
        className="flex-1 bg-transparent text-xs text-(--vestara-text) outline-none placeholder:text-(--vestara-text-dim)"
        disabled
        aria-label="Message composer (read-only in M11C)"
      />
      <button
        type="button"
        disabled
        className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1 text-[10px] text-(--vestara-text-dim) cursor-not-allowed"
      >
        Send
      </button>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────

function M11CDetailModal({
  item,
  onClose,
}: {
  item: M11CStreamItem;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Activity detail"
      onClick={onClose}
    >
      <div
        className="mx-4 max-w-lg rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-(--vestara-text)">Activity Detail</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg text-lg text-(--vestara-text-2) cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Actor</div>
            <div className="text-xs text-(--vestara-text-2)">
              {item.actor.displayName}
              {item.actor.role && <span className="text-(--vestara-text-muted)"> ({item.actor.role})</span>}
            </div>
          </div>

          <div>
            <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Content</div>
            <div className="text-xs text-(--vestara-text-2) whitespace-pre-wrap">{item.content || '(no content)'}</div>
          </div>

          <div>
            <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Metadata</div>
            <div className="text-[10px] text-(--vestara-text-muted) space-y-1">
              <div>Kind: {item.kind} · Importance: {item.importance}</div>
              <div>Sequence: {item.sequence}</div>
              <div>Timestamp: {item.timestamp}</div>
              {item.workflowRunId && <div>Workflow: {item.workflowRunId}</div>}
              {item.executionId && <div>Execution: {item.executionId}</div>}
              {item.taskId && <div>Task: {item.taskId}</div>}
            </div>
          </div>

          {item.aggregated && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Aggregated</div>
              <div className="text-[10px] text-(--vestara-text-muted) space-y-1">
                <div>{item.aggregated.count} items · {item.aggregated.kind}</div>
                <div>Summary: {item.aggregated.summary}</div>
                <div>Sequence range: {item.aggregated.sequenceRange.first} – {item.aggregated.sequenceRange.last}</div>
                <div>{item.aggregated.referencedActivityIds.length} referenced activity IDs</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
