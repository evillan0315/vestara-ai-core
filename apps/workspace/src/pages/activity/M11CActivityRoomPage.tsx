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
import { useRenderProfiler } from '../../hooks/useActivityProfiler';
import { fetchM11AAggregateDrillDown, type M11AActivityRecord } from '../../lib/m11a-api';
import { postActivityMessage, retractActivityMessage, editActivityMessage } from '../../lib/activity';
import { Pill, StatusIndicator } from '@vestara/ui';
import { RouteHero } from '../../components/layout/PageHero/RouteHero';
import { useMorningBriefing } from '../../hooks/useMorningBriefing';
import { useGAExecutionConfig } from '../../hooks/useGAExecutionConfig';
import '../../styles/activity-room.css';

function getTimeBasedGreeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return { greeting: 'Good Morning', period: 'morning', emoji: '☀️' };
  if (h < 18) return { greeting: 'Good Afternoon', period: 'afternoon', emoji: '🌤️' };
  return { greeting: 'Good Evening', period: 'evening', emoji: '🌙' };
}
import AgentProjectionDrawer from './AgentProjectionDrawer';
import { resolveAgentIdFromParticipantId } from './AgentProjectionDrawer';
import M11CActivityStream from './M11CActivityStream';
import M11CConnectionStatus from './M11CConnectionStatus';
import M11CParticipantRail from './M11CParticipantRail';
import M11CLiveNowStrip from './M11CLiveNowStrip';
import M11CWorkflowBrowser, { deriveWorkflowUnits, hasActiveWork } from './M11CWorkflowBrowser';
import M11CDockedInspector from './M11CDockedInspector';
import { WORKFLOW_STATUS_CONFIG } from './status-config';
import ActivityRoomContextPanel from './ActivityRoomContextPanel';

// ─── Component ───────────────────────────────────────────────

export default function M11CActivityRoomPage() {
  useRenderProfiler('M11CActivityRoomPage');
  const room = useM11CActivityRoom();
  const ui = useActivityRoomUI();
  const { briefing: morningBriefing } = useMorningBriefing();
  const [morningOpen, setMorningOpen] = useState(false);
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

  // Derive "at work" from authoritative workState, not from presence (which is UNKNOWN).
  const activeAgentCount = useMemo(
    () => room.participants.filter(
      (p) => p.type !== 'human' && (p.workState === 'working' || p.workState === 'blocked' || p.workState === 'attention-required'),
    ).length,
    [room.participants],
  );

  // Participant ID → display name lookup for enriching stream item actor names.
  // Includes both participantId (agent-agent-developer) and raw actor.id (vestara) keys.
  const participantNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of room.participants) {
      map[p.participantId] = p.displayName;
      // Also map the raw agent ID (e.g. "agent-developer") for stream items
      // that use actor.id instead of participantId.
      const rawId = p.participantId.replace(/^agent-/, '');
      if (rawId !== p.participantId) map[rawId] = p.displayName;
    }
    // Known hardcoded agent IDs from M9 adapters that don't match AgentStorage
    if (!map['vestara']) map['vestara'] = 'Assistant';
    return map;
  }, [room.participants]);

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

  // ─── Adaptive work composition (VES-DESIGN-008F) ──────────
  // One composition, state-aware sizing. The active-work signal shares
  // the browser's own derivation home (no parallel logic): a unit counts
  // exactly as the browser defines it, or the latest summary is running.
  const workflowUnits = useMemo(() => deriveWorkflowUnits(room.stream), [room.stream]);
  const hasActiveWorkflows = hasActiveWork(workflowUnits, room.workflowSummary);
  const detailOpen = ui.detailItem != null;
  // Stream owns the flexible share; rails keep bounded widths. Active
  // workflows render as a strip above the stream (never a middle column),
  // so the grid is at most rail + stream + inspector. The inspector track
  // is `auto` and collapses when the (null-gated, CSS-hidden <1440px)
  // inspector renders nothing. Exactly one lg template applies — never
  // two competing column definitions.
  const workingAreaGrid = [
    'grid min-w-0 grid-cols-1 gap-4 mt-3',
    detailOpen
      ? 'lg:grid-cols-[18rem_minmax(0,1fr)_auto]'
      : 'lg:grid-cols-[18rem_minmax(0,1fr)]',
  ].join(' ');

  return (
    <>
      {/* ─── Canonical workspace Hero (VES-DESIGN-008B) ─────────
          Replaces the hand-rolled ar-plinth. Hierarchy:
          STATUS (connection) vs METADATA (records/cursor) vs ACTION
          (Pause/Clear). No reference-only controls, no fake metrics. */}
      <RouteHero
        routeId="activity"
        title={roomName}
        actions={[
          { label: room.paused ? 'Resume' : 'Pause', onClick: room.paused ? room.resume : room.pause },
          { label: 'Clear', onClick: room.clear, title: 'Clear local view' },
        ]}
        meta={
          <>
            <M11CConnectionStatus state={room.state} />
            <span className="mpg-tag-pill">
              {room.stream.length} record{room.stream.length === 1 ? '' : 's'}
            </span>
            {room.cursor && (
              <span className="mpg-tag-pill">cursor {room.cursor.sequenceNumber}</span>
            )}
          </>
        }
      />

      {/* ─── Error Banner ───────────────────────────────── */}
      {room.error && (
        <div className="ar-banner ar-banner--warn mt-3" role="alert">
          <StatusIndicator variant="warn" size="sm" ariaLabel="Warning" />
          <span className="min-w-0 flex-1">{room.error}</span>
          <Pill variant="danger" size="sm" onClick={room.retry}>
            Reconnect
          </Pill>
        </div>
      )}

      {/* ─── Briefing Banner — dynamic greeting based on local time, exact executedAt ─── */}
      {morningBriefing && (() => { const { greeting, period, emoji } = getTimeBasedGreeting(); return (
        <button
          type="button"
          onClick={() => setMorningOpen(true)}
          className="mt-3 flex w-full items-center gap-3 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-amber)]/30 bg-[var(--vestara-amber)]/10 px-4 py-3 text-left hover:bg-[var(--vestara-amber)]/15 transition-colors cursor-pointer"
        >
          <span className="text-[var(--vestara-amber)]">{emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-[var(--vestara-text)]">{greeting} Director — your {period} briefing</span>
            <span className="block text-[11px] text-[var(--vestara-text-muted)] truncate">{morningBriefing.summary} · Executed: {new Date(morningBriefing.executedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })} — click for detail</span>
          </span>
          <span className="shrink-0 text-xs text-[var(--vestara-amber)]">View ›</span>
        </button>
      ); })()}
      {morningOpen && morningBriefing && (() => { const { greeting, period, emoji } = getTimeBasedGreeting(); return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" onClick={() => setMorningOpen(false)}>
          <div className="w-full max-w-2xl max-h-[80vh] overflow-auto rounded-xl border bg-[var(--vestara-surface-panel)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{emoji} {greeting} Director — {period} briefing detail</h3>
                <p className="text-xs text-[var(--vestara-amber)]">{greeting} Director, here is your {period} briefing for today — {new Date(morningBriefing.executedAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })}</p>
                <p className="text-[10px] text-[var(--vestara-text-dim)]">Created: {new Date(morningBriefing.createdAt).toLocaleString()} · ID: {morningBriefing.id}</p>
              </div>
              <button type="button" onClick={() => setMorningOpen(false)} className="size-8 grid place-items-center rounded-lg border">×</button>
            </div>
            <div className="mt-3 space-y-3 text-xs">
              <div><div className="font-semibold uppercase">Repo Health</div><pre className="mt-1 whitespace-pre-wrap rounded border p-2 bg-[var(--vestara-surface-panel-raised)]">{morningBriefing.details.repoHealth || '(empty)'}</pre></div>
              <div><div className="font-semibold uppercase">Workspace Status</div><pre className="mt-1 whitespace-pre-wrap rounded border p-2 bg-[var(--vestara-surface-panel-raised)]">{morningBriefing.details.workspaceStatus || '(empty)'}</pre></div>
              <div><div className="font-semibold uppercase">Activity</div><pre className="mt-1 whitespace-pre-wrap rounded border p-2 bg-[var(--vestara-surface-panel-raised)]">{morningBriefing.details.activity || '(empty)'}</pre></div>
              {morningBriefing.details.fullContent && <div><div className="font-semibold uppercase">Full</div><pre className="mt-1 whitespace-pre-wrap rounded border p-2 bg-[var(--vestara-surface-panel-raised)]">{morningBriefing.details.fullContent}</pre></div>}
            </div>
          </div>
        </div>
      ); })()}

      {/* ─── Attention Banner ───────────────────────────── */}
      {room.attention.length > 0 && (
        <div className="ar-banner ar-banner--info mt-3">
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

      {/* ─── Working area: adaptive composition (VES-DESIGN-008F) ──
          INFORMATION VALUE drives SPACE ALLOCATION. Participants keep a
          stable contextual width; the stream owns the flexible share. The
          workflow column exists only while authoritative active work
          exists — otherwise a compact disclosure preserves browsing
          without spending a permanent column on "0 workflows". */}
      {!hasActiveWorkflows && (
        <details className="mt-3 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-4 py-2.5">
          <summary className="cursor-pointer text-sm font-medium text-[var(--vestara-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset">
            Workflows · {workflowUnits.length}
            <span className="ml-2 text-xs font-normal text-[var(--vestara-text-muted)]">
              {workflowUnits.length === 0 ? 'No active workflows' : 'No running workflows — expand to browse'}
            </span>
          </summary>
          <div className="mt-2">
            <M11CWorkflowBrowser
              stream={room.stream}
              workflowSummary={room.workflowSummary}
            />
          </div>
        </details>
      )}
      <div className={workingAreaGrid}>
        {/* Participant Rail (projection-driven; page owns scrolling) */}
        <aside className="ar-panel ar-panel--rail">
          <M11CParticipantRail
            participants={room.participants}
            selectedParticipantId={selectedParticipantId}
            onSelectParticipant={handleSelectParticipant}
            onOpenAgentControl={ui.openAgentControl}
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

          {/* Active-work strip: workflows live above the stream, never as
              a middle column. Collapsed disclosure below covers idle. */}
          {hasActiveWorkflows && (
            <div className="ar-workflow-strip">
              <M11CWorkflowBrowser
                stream={room.stream}
                workflowSummary={room.workflowSummary}
              />
            </div>
          )}

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
            participantNames={participantNames}
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
    </>
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
  // Display-only badge: canonical GAExecutionConfig budget (Fix 1 attribution)
  // Fix 3: badge is truthful — untouched 0 means adapter default 80, not "unlimited"
  const { config: execConfig, isCustom } = useGAExecutionConfig();
  const isUntouchedDefault = execConfig.maxToolCalls === 0 && !isCustom;
  const maxToolCallsLabel = isUntouchedDefault
    ? '80 calls'
    : execConfig.maxToolCalls === 0
      ? 'unlimited'
      : `${execConfig.maxToolCalls} calls`;
  const maxToolCallsHint = isUntouchedDefault
    ? 'maxToolCalls: 80 (adapter default, untouched) — raise in Settings or ExecutionControls; 0 = unlimited when touched'
    : execConfig.maxToolCalls === 0
      ? 'maxToolCalls: unlimited (touched) — adapter budget disabled'
      : `maxToolCalls: ${execConfig.maxToolCalls} (adapter enforces per-turn limit; default 80 when untouched)`;

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
      // Fix 2: @vestara/@assistant maps to agent-assistant target so triggerAssistantTurn fires (AR-006)
      // Without this, M11C always sent all-agents → no Assistant turn, appearing as "nothing happens"
      const isAssistantMention = /@(?:vestara|assistant|agent-assistant)\b/i.test(text);
      const targets = isAssistantMention
        ? ([{ type: 'agent', agentId: 'agent-assistant' }] as const)
        : ([{ type: 'all-agents' }] as const);
      await postActivityMessage({
        content: text,
        targets: [...targets],
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
    // VES-DESIGN-008E: first-class human participation surface. Bounded
    // composition — target chip (truthful fixed contract: all-agents, no
    // picker), input, send — plus reply-context strip and error row. Logic,
    // keyboard (Enter sends), validation, and states are unchanged. No
    // delivery/permission claims: HTTP 201 establishes none (recorded gap).
    <div
      className="rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel-raised)] p-2 focus-within:border-[var(--vestara-accent-border-hover)]"
      role="form"
      aria-label="Message composer"
    >
      {/* Reply context — existing referencedActivityIds mechanism only */}
      {replyTo && (
        <div className="mb-2 flex min-w-0 items-center gap-2 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-2 py-1 text-xs text-[var(--vestara-text-muted)]">
          <span aria-hidden="true">↩</span>
          <span className="min-w-0 flex-1 truncate">
            Replying to <strong className="font-medium text-[var(--vestara-text-secondary)]">{replyTo.actor.displayName}</strong>
          </span>
          {onClearReply && (
            <button
              type="button"
              onClick={onClearReply}
              aria-label="Clear reply context"
              className="shrink-0 rounded px-1 hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="flex min-w-0 items-center gap-2">
        {/* Target: fixed all-agents contract, presented truthfully */}
        <span
          className="shrink-0 rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-default)] px-2 py-0.5 text-[11px] font-medium text-[var(--vestara-text-muted)]"
          title="Messages from this composer are addressed to all agents in this room"
        >
          All agents
        </span>
        {/* maxToolCalls badge — display-only, no write path (approved plan) */}
        <span
          className="shrink-0 rounded-[var(--vestara-radius-full)] border px-2 py-0.5 text-[10px] font-medium"
          style={{
            borderColor: 'var(--vestara-border-subtle)',
            color: 'var(--vestara-text-muted)',
            background: 'var(--vestara-surface-panel)',
          }}
          title={maxToolCallsHint}
          aria-label={`Tool budget ${maxToolCallsLabel}`}
        >
          {maxToolCallsLabel}
        </span>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder={sending ? 'Sending…' : 'Message the room…'}
          className="min-h-9 min-w-0 flex-1 bg-transparent text-sm text-[var(--vestara-text)] placeholder:text-[var(--vestara-text-muted)] focus:outline-none disabled:opacity-60"
          disabled={sending}
          aria-label="Message input"
        />

        {/* Send */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!value.trim() || sending}
          aria-label={sending ? 'Sending message' : 'Send message'}
          className="grid size-9 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-dark)] bg-[var(--vestara-accent)] text-lg leading-none text-[var(--color-zinc-950)] transition-colors hover:bg-[var(--vestara-accent-light)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vestara-surface-panel-raised)]"
        >
          <span aria-hidden="true">{sending ? '…' : '→'}</span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-2 rounded-[var(--vestara-radius)] border px-2 py-1 text-xs text-[var(--vestara-red)]" role="alert"
          style={{
            borderColor: 'color-mix(in srgb, var(--vestara-red) 35%, transparent)',
            background: 'color-mix(in srgb, var(--vestara-red) 8%, transparent)',
          }}
        >
          {error}
        </p>
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
            className="w-full rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel-raised)] px-3 py-2 text-sm text-[var(--vestara-text)] focus:outline-none focus:border-[var(--vestara-accent-border-hover)] resize-none placeholder:text-[var(--vestara-text-muted)]"
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
              <div key={id} className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] text-[var(--vestara-text-muted)] mb-1">
                  <span className="font-medium text-[var(--vestara-text-secondary)]">{author}</span>
                  <span className="text-[var(--vestara-text-dim)]">·</span>
                  <span className="font-mono text-[var(--vestara-text-dim)]">{id.slice(0, 12)}…</span>
                </div>
                <div className="text-[12px] text-[var(--vestara-text-secondary)] leading-relaxed">
                  {content || <span className="italic text-[var(--vestara-text-muted)]">(no content)</span>}
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
                  <div key={record.id} className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] px-3 py-2 text-[11px]">
                    <div className="flex items-center gap-2 text-[var(--vestara-text-muted)]">
                      <span className="font-medium text-[var(--vestara-text-secondary)]">{record.kind}</span>
                      <span className="text-[var(--vestara-text-dim)]">·</span>
                      <span>{record.actor?.displayName ?? 'Unknown'}</span>
                      <span className="text-[var(--vestara-text-dim)]">·</span>
                      <span className="text-[var(--vestara-text-dim)]">{record.timestamp}</span>
                    </div>
                    {record.content && (
                      <div className="mt-1 text-[var(--vestara-text-muted)] line-clamp-2">{record.content}</div>
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
