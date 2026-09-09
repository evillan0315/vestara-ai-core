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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useM11CActivityRoom, type M11CStreamItem } from '../../hooks/useM11CActivityRoom';
import '../../styles/activity-room.css';
import AgentProjectionDrawer from './AgentProjectionDrawer';
import { resolveAgentIdFromParticipantId } from './AgentProjectionDrawer';
import M11CActivityStream from './M11CActivityStream';
import M11CConnectionStatus from './M11CConnectionStatus';
import M11CParticipantRail from './M11CParticipantRail';

// ─── Component ───────────────────────────────────────────────

export default function M11CActivityRoomPage() {
  const room = useM11CActivityRoom();
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | undefined>(undefined);
  const [detailItem, setDetailItem] = useState<M11CStreamItem | null>(null);
  const [agentControlParticipantId, setAgentControlParticipantId] = useState<string | undefined>(undefined);

  // ─── Agent Control Drawer ─────────────────────────────────

  const agentControlParticipant = useMemo(
    () => agentControlParticipantId
      ? room.participants.find((p) => p.participantId === agentControlParticipantId)
      : undefined,
    [agentControlParticipantId, room.participants],
  );

  const agentControlAgentId = useMemo(
    () => agentControlParticipantId
      ? resolveAgentIdFromParticipantId(agentControlParticipantId)
      : null,
    [agentControlParticipantId],
  );

  const handleOpenAgentControl = useCallback((participantId: string) => {
    setAgentControlParticipantId(participantId);
  }, []);

  const handleCloseAgentControl = useCallback(() => {
    setAgentControlParticipantId(undefined);
  }, []);

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
    <div className="ar-room">
      {/* ─── Header Plinth ──────────────────────────────── */}
      <header className="ar-plinth">
        <div className="ar-plinth__id">
          <span className="ar-monogram" aria-hidden="true">
            V
          </span>
          <div className="min-w-0">
            <div className="ar-kicker">Live operations</div>
            <h1 className="ar-display">{roomName}</h1>
            <p className="ar-plinth__meta">
              <strong>{room.stream.length} records</strong>
              {room.cursor && <span> · cursor {room.cursor.sequenceNumber}</span>}
            </p>
          </div>
        </div>
        <div className="ar-plinth__controls">
          <M11CConnectionStatus state={room.state} />
          <button type="button" onClick={room.paused ? room.resume : room.pause} className="ar-capsule">
            {room.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={room.clear}
            className="ar-capsule"
            title="Clear local view"
          >
            Clear
          </button>
        </div>
      </header>

      {/* ─── Error Banner ───────────────────────────────── */}
      {room.error && (
        <div className="ar-banner ar-banner--warn" role="alert">
          <span className="ar-lamp ar-lamp--warn" aria-hidden="true">⚠</span>
          <span className="min-w-0 flex-1">{room.error}</span>
          <button type="button" onClick={room.retry} className="ar-capsule">
            Retry
          </button>
        </div>
      )}

      {/* ─── Attention Banner ───────────────────────────── */}
      {room.attention.length > 0 && (
        <div className="ar-banner ar-banner--info">
          <span className="ar-lamp ar-lamp--warn" aria-hidden="true">◆</span>
          <span className="font-medium text-(--vestara-amber)">
            {room.attention.length} attention item{room.attention.length > 1 ? 's' : ''}
          </span>
          <span className="ar-banner__note">
            {room.attention.filter((a) => a.severity === 'critical').length > 0 && (
              <span className="ar-banner__critical">
                {room.attention.filter((a) => a.severity === 'critical').length} critical
              </span>
            )}
          </span>
        </div>
      )}

      {/* ─── Stage: Guest Rail + Salon ──────────────────── */}
      <div className="ar-stage">
        {/* Participant Rail (projection-driven) */}
        <aside className="ar-panel ar-panel--rail ar-scroll">
          <M11CParticipantRail
            participants={room.participants}
            selectedParticipantId={selectedParticipantId}
            onSelectParticipant={handleSelectParticipant}
            onOpenAgentControl={handleOpenAgentControl}
          />
        </aside>

        {/* Center Stream (the salon) */}
        <main className="ar-panel ar-panel--main">
          <div className="ar-panel__head">
            <div className="ar-panel__label" aria-live="polite">
              {selectedParticipantId === undefined ? 'Activity Stream' : `Activity — ${selectedParticipantId}`}
            </div>
            <span className="ar-panel__hint">{room.paused ? `${room.unread} buffered` : stateLabel}</span>
          </div>

          {/* Workflow Summary */}
          {room.workflowSummary && (
            <div className="ar-strip">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  room.workflowSummary.status === 'running' ? 'bg-(--vestara-green) animate-pulse' :
                  room.workflowSummary.status === 'completed' ? 'bg-(--vestara-green)' :
                  room.workflowSummary.status === 'failed' ? 'bg-(--vestara-red)' :
                  'bg-(--vestara-text-muted)'
                }`}
              />
              <span className="ar-strip__status">{room.workflowSummary.status}</span>
              <span className="ar-strip__count">
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

      {/* ─── Agent Control Drawer ───────────────────────── */}
      {agentControlParticipant && agentControlAgentId && (
        <AgentProjectionDrawer
          open
          onClose={handleCloseAgentControl}
          agentId={agentControlAgentId}
          participant={agentControlParticipant}
        />
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
    <div className="ar-composer">
      <span className="ar-key" aria-hidden="true">+</span>
      <span className="ar-key" aria-hidden="true">@</span>
      <span className="ar-key" aria-hidden="true">/</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Reference…"
        className="ar-composer__input"
        disabled
        aria-label="Message composer (read-only in M11C)"
      />
      <button type="button" disabled className="ar-capsule ar-capsule--disabled">
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
      className="ar-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Activity detail"
      onClick={onClose}
    >
      <div className="ar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ar-modal__head">
          <h2 className="ar-modal__title">Activity Detail</h2>
          <button type="button" onClick={onClose} className="ar-modal__close" aria-label="Close">
            ×
          </button>
        </div>

        <div className="ar-kv">
          <div>
            <div className="ar-kv__label">Actor</div>
            <div className="ar-kv__value">
              {item.actor.displayName}
              {item.actor.role && <span className="text-(--vestara-text-muted)"> ({item.actor.role})</span>}
            </div>
          </div>

          <div>
            <div className="ar-kv__label">Content</div>
            <div className="ar-kv__value">{item.content || '(no content)'}</div>
          </div>

          <div>
            <div className="ar-kv__label">Metadata</div>
            <div className="ar-kv__meta">
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
              <div className="ar-kv__label">Aggregated</div>
              <div className="ar-kv__meta">
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
