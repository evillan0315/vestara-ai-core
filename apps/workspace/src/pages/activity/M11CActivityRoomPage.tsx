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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useM11CActivityRoom, type M11CStreamItem } from '../../hooks/useM11CActivityRoom';
import { useActivityRoomUI } from '../../hooks/useActivityRoomUI';
import { fetchM11AAggregateDrillDown, type M11AActivityRecord } from '../../lib/m11a-api';
import { postActivityMessage, retractActivityMessage, editActivityMessage } from '../../lib/activity';
import { Pill, StatusIndicator } from '@vestara/ui';
import '../../styles/activity-room.css';
import AgentProjectionDrawer from './AgentProjectionDrawer';
import { resolveAgentIdFromParticipantId } from './AgentProjectionDrawer';
import M11CActivityStream from './M11CActivityStream';
import M11CConnectionStatus from './M11CConnectionStatus';
import M11CParticipantRail from './M11CParticipantRail';
import M11CLiveNowStrip from './M11CLiveNowStrip';
import M11CWorkflowBrowser from './M11CWorkflowBrowser';
import M11CDockedInspector from './M11CDockedInspector';
import { WORKFLOW_STATUS_CONFIG } from './status-config';
import ActivityRoomContextPanel from './ActivityRoomContextPanel';

// ─── Component ───────────────────────────────────────────────

export default function M11CActivityRoomPage() {
  const room = useM11CActivityRoom();
  const ui = useActivityRoomUI();
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | undefined>(undefined);

  // ─── Agent Control Drawer ─────────────────────────────────

  const agentControlParticipant = useMemo(
    () => ui.agentControlParticipantId
      ? room.participants.find((p) => p.participantId === ui.agentControlParticipantId)
      : undefined,
    [ui.agentControlParticipantId, room.participants],
  );

  const agentControlAgentId = useMemo(
    () => ui.agentControlParticipantId
      ? resolveAgentIdFromParticipantId(ui.agentControlParticipantId)
      : null,
    [ui.agentControlParticipantId],
  );

  // ─── Derived counts for context panel ──────────────────────

  const activeAgentCount = useMemo(
    () => room.participants.filter(
      (p) => p.type !== 'human' && (p.presence === 'online' || p.presence === 'active'),
    ).length,
    [room.participants],
  );

  // ─── Callbacks ──────────────────────────────────────────

  const handleSelectParticipant = useCallback((id: string | undefined) => {
    setSelectedParticipantId(id);
  }, []);

  const [drillDownRecords, setDrillDownRecords] = useState<readonly M11AActivityRecord[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  const handleDrillDown = useCallback(async (aggregateId: string, _referencedIds: readonly string[]) => {
    setDrillDownLoading(true);
    try {
      const result = await fetchM11AAggregateDrillDown(aggregateId);
      setDrillDownRecords(result.records);
      const aggregateItem = room.stream.find((s) => s.id === aggregateId);
      if (aggregateItem) {
        ui.openDetail(aggregateItem);
      }
    } catch {
      // Drill-down failed — stay silent, user can retry
    } finally {
      setDrillDownLoading(false);
    }
  }, [room.stream, ui.openDetail]);

  const handleRetract = useCallback(async (item: M11CStreamItem) => {
    try {
      await retractActivityMessage(item.id, 'Message retracted');
    } catch {
      // Retraction failed — stay silent
    }
  }, []);

  // Look up author name by activity ID from the stream
  const lookupAuthor = useCallback((activityId: string): string | undefined => {
    const item = room.stream.find((s) => s.id === activityId);
    return item?.actor.displayName;
  }, [room.stream]);

  // Look up content preview by activity ID from the stream
  const lookupContent = useCallback((activityId: string): string | undefined => {
    const item = room.stream.find((s) => s.id === activityId);
    return item?.content;
  }, [room.stream]);

  // ─── Connection state label ─────────────────────────────

  const stateLabel =
    room.state === 'connecting' ? 'Connecting' :
    room.state === 'live' ? 'Live' :
    room.state === 'reconnecting' ? 'Reconnecting' :
    room.state === 'offline' ? 'Offline' :
    room.state === 'paused' ? 'Paused' :
    room.state === 'error' ? 'Offline' :
    'Unknown';

  // ─── Room name ──────────────────────────────────────────

  const roomName = room.room?.name ?? 'Activity Room';

  return (
    <div className="ar-room">
      {/* ─── Header Plinth ──────────────────────────────── */}
      <header className="ar-plinth" role="banner">
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
          <Pill variant="default" size="sm" onClick={room.paused ? room.resume : room.pause}>
            {room.paused ? 'Resume' : 'Pause'}
          </Pill>
          <Pill variant="default" size="sm" onClick={room.clear} title="Clear local view">
            Clear
          </Pill>
        </div>
      </header>

      {/* ─── Error Banner ───────────────────────────────── */}
      {room.error && (
        <div className="ar-banner ar-banner--warn" role="alert">
          <StatusIndicator variant="warn" size="sm" ariaLabel="Warning" />
          <span className="min-w-0 flex-1">{room.error}</span>
          <Pill variant="danger" size="sm" onClick={room.retry}>
            Reconnect
          </Pill>
        </div>
      )}

      {/* ─── Attention Banner ───────────────────────────── */}
      {room.attention.length > 0 && (
        <div className="ar-banner ar-banner--info">
          <StatusIndicator variant="warn" size="sm" ariaLabel="Attention required" />
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

      {/* ─── Stage: Guest Rail + Workflow Browser + Salon ─── */}
      <div className="ar-stage">
        {/* Participant Rail (projection-driven) */}
        <aside className="ar-panel ar-panel--rail ar-scroll">
          <M11CParticipantRail
            participants={room.participants}
            selectedParticipantId={selectedParticipantId}
            onSelectParticipant={handleSelectParticipant}
            onOpenAgentControl={ui.openAgentControl}
          />
        </aside>

        {/* Workflow Browser (center-left) */}
        <aside className="ar-panel ar-panel--workflow ar-scroll">
          <M11CWorkflowBrowser
            stream={room.stream}
            workflowSummary={room.workflowSummary}
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

          {/* Live Now Strip */}
          <M11CLiveNowStrip
            participants={room.participants}
            stream={room.stream}
            isLive={room.state === 'live'}
          />

          {/* Stream */}
          <M11CActivityStream
            items={room.stream}
            stateLabel={stateLabel}
            connectionState={room.state}
            unread={room.unread}
            loadingHistory={room.loadingHistory}
            olderLoaded={room.olderLoaded}
            loading={room.state === 'connecting'}
            onLoadOlder={room.loadOlder}
            onReportViewport={room.reportViewport}
            onClearUnread={room.clearUnread}
            onOpenDetail={ui.openDetail}
            onDrillDown={handleDrillDown}
            onReply={ui.setReplyTo}
            onRetract={handleRetract}
            onEdit={ui.openEdit}
            onOpenThread={ui.openThread}
            lookupAuthor={lookupAuthor}
            lookupContent={lookupContent}
            selectedParticipantId={selectedParticipantId}
            submission={room.submission}
            onSubmitResponse={room.submitResponse}
          />

          {/* Composer with reply-to support */}
          <M11CComposer replyTo={ui.replyToItem} onClearReply={ui.clearReply} />
        </main>

        {/* Docked Inspector (right column) — replaces context panel at >=1440px */}
        <M11CDockedInspector
          item={ui.detailItem}
          drillDownRecords={drillDownRecords}
          drillDownLoading={drillDownLoading}
          onClose={ui.closeDetail}
        />
      </div>

      {/* ─── Edit Modal ───────────────────────────────── */}
      {ui.editingItem && (
        <M11CEditModal
          item={ui.editingItem}
          onSave={async (newContent) => {
            await editActivityMessage(ui.editingItem!.id, newContent);
            ui.closeEdit();
          }}
          onClose={ui.closeEdit}
        />
      )}

      {/* ─── Thread View Modal ──────────────────────────── */}
      {ui.threadActivityIds.length > 0 && (
        <M11CThreadModal
          activityIds={ui.threadActivityIds}
          lookupAuthor={lookupAuthor}
          lookupContent={lookupContent}
          onClose={ui.closeThread}
        />
      )}

      {/* ─── Agent Control Drawer ───────────────────────── */}
      {agentControlParticipant && agentControlAgentId && (
        <AgentProjectionDrawer
          open
          onClose={ui.closeAgentControl}
          agentId={agentControlAgentId}
          participant={agentControlParticipant}
        />
      )}
    </div>
  );
}

// ─── Visual/Non-Mutating Composer ──────────────────────────

/**
 * M11C Composer — sends human messages to the Activity Room.
 * Messages are persisted via POST /api/messages and broadcast via WebSocket.
 * Supports reply-to: when a message is replied to, the actor name is prepended.
 *
 * Premium UX: clean input with integrated send, compact secondary actions.
 */
function M11CComposer({
  replyTo,
  onClearReply,
}: {
  replyTo?: M11CStreamItem | null;
  onClearReply?: () => void;
}) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-fill with @mention when replying
  useEffect(() => {
    if (replyTo) {
      setValue(`@${replyTo.actor.displayName} `);
      inputRef.current?.focus();
    }
  }, [replyTo]);

  const handleSend = useCallback(async () => {
    const text = value.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    try {
      await postActivityMessage({
        content: text,
        targets: [{ type: 'broadcast' }],
        actor: { displayName: 'You', role: 'human' },
        referencedActivityIds: replyTo ? [replyTo.id] : undefined,
      });
      setValue('');
      onClearReply?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }, [value, sending, replyTo, onClearReply]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="ar-composer" role="form" aria-label="Message composer">
      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(null); }}
        onKeyDown={handleKeyDown}
        placeholder={sending ? 'Sending…' : 'Type a message…'}
        className="ar-composer__input"
        disabled={sending}
        aria-label="Message input"
      />

      {/* Send button */}
      <button
        type="button"
        onClick={handleSend}
        disabled={!value.trim() || sending}
        className="ar-composer__send"
        aria-label="Send message"
      >
        {sending ? (
          <span className="ar-composer__send-loading">…</span>
        ) : (
          <span className="ar-composer__send-arrow">→</span>
        )}
      </button>

      {/* Error */}
      {error && (
        <span className="ar-composer__error" role="alert">{error}</span>
      )}
    </div>
  );
}

// ─── Edit Modal ─────────────────────────────────────────

function M11CEditModal({
  item,
  onSave,
  onClose,
}: {
  item: M11CStreamItem;
  onSave: (newContent: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(item.content);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    const text = value.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await onSave(text);
    } finally {
      setSaving(false);
    }
  }, [value, saving, onSave]);

  return (
    <div
      className="ar-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Edit message"
      onClick={onClose}
    >
      <div className="ar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ar-modal__head">
          <h2 className="ar-modal__title">Edit Message</h2>
          <button type="button" onClick={onClose} className="ar-modal__close" aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-4">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50 resize-none"
            rows={4}
            aria-label="Edit message content"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Pill variant="default" size="sm" onClick={onClose}>
              Cancel
            </Pill>
            <Pill
              variant="gold"
              size="sm"
              onClick={handleSave}
              disabled={!value.trim() || saving}
              loading={saving}
            >
              Save
            </Pill>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Thread View Modal ─────────────────────────────────

function M11CThreadModal({
  activityIds,
  lookupAuthor,
  lookupContent,
  onClose,
}: {
  activityIds: readonly string[];
  lookupAuthor?: (id: string) => string | undefined;
  lookupContent?: (id: string) => string | undefined;
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
      aria-label="Thread view"
      onClick={onClose}
    >
      <div className="ar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ar-modal__head">
          <h2 className="ar-modal__title">Thread</h2>
          <button type="button" onClick={onClose} className="ar-modal__close" aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {activityIds.map((id) => {
            const author = lookupAuthor?.(id) ?? 'Unknown';
            const content = lookupContent?.(id);
            return (
              <div key={id} className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] text-zinc-400 mb-1">
                  <span className="font-medium text-zinc-300">{author}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-600">{id.slice(0, 12)}…</span>
                </div>
                <div className="text-[12px] text-zinc-300 leading-relaxed">
                  {content || <span className="italic text-zinc-600">(no content)</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────

function M11CDetailModal({
  item,
  drillDownRecords,
  drillDownLoading,
  onClose,
}: {
  item: M11CStreamItem;
  drillDownRecords?: readonly M11AActivityRecord[];
  drillDownLoading?: boolean;
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

          {/* Drill-down records */}
          {drillDownLoading && (
            <div className="ar-kv">
              <div className="ar-kv__label">Loading referenced activities…</div>
            </div>
          )}
          {!drillDownLoading && drillDownRecords && drillDownRecords.length > 0 && (
            <div className="ar-kv">
              <div className="ar-kv__label">Referenced Activities ({drillDownRecords.length})</div>
              <div className="space-y-2 mt-2">
                {drillDownRecords.map((record) => (
                  <div key={record.id} className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-3 py-2 text-[11px]">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <span className="font-medium text-zinc-300">{record.kind}</span>
                      <span className="text-zinc-600">·</span>
                      <span>{record.actor?.displayName ?? 'Unknown'}</span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-600">{record.timestamp}</span>
                    </div>
                    {record.content && (
                      <div className="mt-1 text-zinc-500 line-clamp-2">{record.content}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
