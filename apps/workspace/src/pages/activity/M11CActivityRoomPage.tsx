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
  // exists only at >=1440px where it docks; below that it is a fixed
  // overlay drawer with no grid track. Exactly one lg template applies —
  // never two competing column definitions.
  const workingAreaGrid = [
    // Fit-to-screen: full-width grid that never forces horizontal overflow.
    // Rail + stream at lg; the inspector track exists only at >=1440px where
    // .ar-inspector actually docks (below that it renders as an overlay
    // drawer, so no grid track is reserved for it). At lg the single row
    // stretches to fill the viewport-fit column (see .ar-workarea).
    'grid w-full max-w-full min-w-0 grid-cols-1 gap-3 sm:gap-4 mt-3 ar-workarea',
    detailOpen
      ? 'ar-workarea--detail lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] min-[1440px]:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,20rem)]'
      : 'lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,16rem)]',
    'lg:grid-rows-[minmax(0,1fr)]',
  ].join(' ');

  return (
    <div className="ar-page min-w-0 w-full max-w-full">
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
          className="mt-3 flex w-full max-w-full min-w-0 items-center gap-3 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-amber)]/30 bg-[var(--vestara-amber)]/10 px-4 py-3 text-left hover:bg-[var(--vestara-amber)]/15 transition-colors cursor-pointer"
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
            <div className="mt-3 min-w-0 space-y-3 text-xs">
              <div className="min-w-0"><div className="font-semibold uppercase">Repo Health</div><pre className="mt-1 max-w-full whitespace-pre-wrap break-words rounded border p-2 bg-[var(--vestara-surface-panel-raised)]">{morningBriefing.details.repoHealth || '(empty)'}</pre></div>
              <div className="min-w-0"><div className="font-semibold uppercase">Workspace Status</div><pre className="mt-1 max-w-full whitespace-pre-wrap break-words rounded border p-2 bg-[var(--vestara-surface-panel-raised)]">{morningBriefing.details.workspaceStatus || '(empty)'}</pre></div>
              <div className="min-w-0"><div className="font-semibold uppercase">Activity</div><pre className="mt-1 max-w-full whitespace-pre-wrap break-words rounded border p-2 bg-[var(--vestara-surface-panel-raised)]">{morningBriefing.details.activity || '(empty)'}</pre></div>
              {morningBriefing.details.fullContent && <div className="min-w-0"><div className="font-semibold uppercase">Full</div><pre className="mt-1 max-w-full whitespace-pre-wrap break-words rounded border p-2 bg-[var(--vestara-surface-panel-raised)]">{morningBriefing.details.fullContent}</pre></div>}
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
        <details className="ar-workflows-disclosure mt-3 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-4 py-2.5">
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
        <aside className="ar-panel ar-panel--rail min-w-0 max-w-full">
          <M11CParticipantRail
            participants={room.participants}
            selectedParticipantId={selectedParticipantId}
            onSelectParticipant={handleSelectParticipant}
            onOpenAgentControl={ui.openAgentControl}
          />
        </aside>

        {/* Center Stream (the salon) */}
        <main className="ar-panel ar-panel--main min-w-0 max-w-full">
          <div className="ar-panel__head">
            <div className="ar-panel__label" aria-live="polite">
              {selectedParticipantId === undefined ? 'Activity Stream' : `Activity — ${selectedParticipantId}`}
            </div>
            <span className="ar-panel__hint">{room.paused ? `${room.unread} buffered` : stateLabel}</span>
          </div>

          {/* Composer first: always at the top of the panel, always in
              view — never pushed below the fold or covered by floating
              chrome at the viewport bottom. */}
          <M11CComposer replyTo={ui.replyToItem} onClearReply={ui.clearReply} participants={room.participants} />

          {/* Live Now Strip (collapses to nothing when nobody is live) */}
          <M11CLiveNowStrip
            participants={room.participants}
            stream={room.stream}
          />

          {/* Active-work strip: inline fallback where the right workflows
              panel is unavailable — below xl, or while the inspector owns
              the right side. Hidden by CSS wherever the aside shows. */}
          {hasActiveWorkflows && (
            <div className="ar-workflow-strip ar-workflow-strip--inline">
              <M11CWorkflowBrowser
                stream={room.stream}
                workflowSummary={room.workflowSummary}
              />
            </div>
          )}

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
        </main>

        {/* Workflows right panel (xl+): the browser lives here instead of
            above the stream. Hidden while the inspector docks so the
            stream keeps room; the inline strip covers that case. */}
        {!detailOpen && (
          <aside className="ar-panel ar-panel--workflows min-w-0 max-w-full" aria-label="Workflows">
            <M11CWorkflowBrowser
              stream={room.stream}
              workflowSummary={room.workflowSummary}
            />
          </aside>
        )}

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

/**
 * Recognized @mention aliases → explicit agent targets. The targeted agent
 * takes a conversation-runtime turn on send (server allowlist mirrors this
 * set); unrecognized mentions stay a plain all-agents broadcast (no turn,
 * never an Assistant fallback). Browser/coder are intentionally NOT
 * addressable here: browser owns its surface, coder works via developer.
 */
const AGENT_MENTION_TARGETS = [
  { pattern: /@(?:vestara|assistant|agent-assistant)\b/i, agentId: 'agent-assistant' },
  { pattern: /@(?:context|agent-context)\b/i, agentId: 'agent-context' },
  { pattern: /@(?:developer|agent-developer)\b/i, agentId: 'agent-developer' },
  { pattern: /@(?:reviewer|agent-reviewer)\b/i, agentId: 'agent-reviewer' },
  { pattern: /@(?:planner|agent-planner)\b/i, agentId: 'agent-planner' },
  { pattern: /@(?:verifier|agent-verifier)\b/i, agentId: 'agent-verifier' },
] as const;

/** Chip labels for targeted agents. */
const MENTION_TARGET_LABELS: Record<string, string> = {
  'agent-assistant': 'Assistant',
  'agent-context': 'Context',
  'agent-developer': 'Developer',
  'agent-reviewer': 'Reviewer',
  'agent-planner': 'Planner',
  'agent-verifier': 'Verifier',
};

// ─── Visual/Non-Mutating Composer ──────────────────────────

/**
 * M11C Composer — sends human messages to the Activity Room.
 * Messages are persisted via POST /api/messages and broadcast via WebSocket.
 * Supports reply-to: when a message is replied to, the actor name is prepended.
 *
 * Premium UX: clean input with integrated send, compact secondary actions.
 */
/** Minimal participant fields the composer picker needs (subset of ParticipantProjection). */
interface ParticipantOption {
  readonly participantId: string;
  readonly displayName: string;
  readonly role?: string;
  readonly modelId?: string;
  readonly providerId?: string;
  readonly modelDisplayName?: string;
  readonly workState?: string;
}

/** participantId (agent-agent-*) → canonical room agentId for addressable targets. */
function participantToAgentId(participantId: string): string | null {
  const raw = participantId.replace(/^agent-/, '');
  const match = AGENT_MENTION_TARGETS.find((entry) => {
    const id = entry.agentId;
    return raw === id;
  });
  return match ? match.agentId : null;
}

/** @alias text inserted by the picker for a canonical agentId. */
const AGENT_ALIASES: Record<string, string> = {
  'agent-assistant': 'assistant',
  'agent-context': 'context',
  'agent-developer': 'developer',
  'agent-reviewer': 'reviewer',
  'agent-planner': 'planner',
  'agent-verifier': 'verifier',
};

function M11CComposer({
  replyTo,
  onClearReply,
  participants = [],
}: {
  replyTo?: M11CStreamItem | null;
  onClearReply?: () => void;
  participants?: readonly ParticipantOption[];
}) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [structuredTarget, setStructuredTarget] = useState<string | null>(null);
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
      // Structured target (picker) wins; otherwise a recognized @alias in
      // text targets that agent. Anything else broadcasts (no turn, no
      // fallback). First alias wins.
      const mentionTarget = structuredTarget
        ? { agentId: structuredTarget }
        : AGENT_MENTION_TARGETS.find((entry) => entry.pattern.test(text));
      const targets = mentionTarget
        ? ([{ type: 'agent', agentId: mentionTarget.agentId }] as const)
        : ([{ type: 'all-agents' }] as const);
      await postActivityMessage({
        content: text,
        targets: [...targets],
        actor: { displayName: 'You', role: 'human' },
        // Surface attestation: this composer speaks FROM the Workspace UI.
        // The principal stays the human actor above; the target stays in
        // targets. Principal ≠ Surface ≠ Target.
        surface: 'workspace-ui',
        referencedActivityIds: replyTo ? [replyTo.id] : undefined,
      });
      setValue('');
      setStructuredTarget(null);
      setMentionOpen(false);
      onClearReply?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }, [value, sending, replyTo, onClearReply, structuredTarget]);

  const handleChange = useCallback((next: string) => {
    setValue(next);
    setError(null);
    if (structuredTarget) setStructuredTarget(null);
    const at = next.lastIndexOf('@');
    if (at !== -1 && !next.slice(at + 1).includes(' ')) {
      setMentionQuery(next.slice(at + 1));
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  }, [structuredTarget]);

  const chooseMention = useCallback((agentId: string) => {
    const alias = AGENT_ALIASES[agentId] ?? agentId;
    setStructuredTarget(agentId);
    setMentionOpen(false);
    setValue((prev) => {
      const at = prev.lastIndexOf('@');
      if (at === -1) return `@${alias} ${prev}`;
      return `${prev.slice(0, at)}@${alias} `;
    });
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
        return;
      }
      if (e.key === 'Escape' && mentionOpen) {
        e.preventDefault();
        setMentionOpen(false);
      }
    },
    [handleSend, mentionOpen],
  );

  // Live target preview: structured picker wins, else the @alias the send
  // path will use. Addressable targets trigger that agent's turn.
  const previewTarget = structuredTarget
    ? { agentId: structuredTarget }
    : AGENT_MENTION_TARGETS.find((entry) => entry.pattern.test(value));
  const previewLabel = previewTarget ? (MENTION_TARGET_LABELS[previewTarget.agentId] ?? previewTarget.agentId) : 'All agents';
  const previewTitle = previewTarget
    ? `This message will target ${previewLabel} and trigger its turn`
    : 'Messages from this composer are addressed to all agents in this room (no turn)';

  // Picker entries: addressable agents from live participants when
  // available, else the static contract set (never advertise browser/coder).
  const pickerEntries = useMemo(() => {
    const byAgent = new Map<string, ParticipantOption>();
    for (const p of participants) {
      const agentId = participantToAgentId(p.participantId);
      if (agentId && !byAgent.has(agentId)) byAgent.set(agentId, p);
    }
    const q = mentionQuery.toLowerCase();
    const matches = (agentId: string, label: string) =>
      q.length === 0 || agentId.toLowerCase().includes(q) || label.toLowerCase().includes(q);
    const entries: Array<{ agentId: string; label: string; role?: string; meta?: string; state?: string }> = [];
    for (const target of AGENT_MENTION_TARGETS) {
      const label = MENTION_TARGET_LABELS[target.agentId] ?? target.agentId;
      if (!matches(target.agentId, label)) continue;
      const p = byAgent.get(target.agentId);
      const meta = p ? [p.modelDisplayName ?? p.modelId, p.providerId].filter(Boolean).join(' · ') : undefined;
      entries.push({
        agentId: target.agentId,
        label,
        role: p?.role,
        meta,
        state: p?.workState,
      });
    }
    return entries;
  }, [participants, mentionQuery]);

  return (
    // VES-DESIGN-008E: first-class human participation surface. Bounded
    // composition — live target chip (all-agents, or the @mention alias),
    // input, send — plus reply-context strip and error row. Logic,
    // keyboard (Enter sends), validation, and states are unchanged. No
    // delivery/permission claims: HTTP 201 establishes none (recorded gap).
    <div
      className="ar-composer-pin rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-accent-border)] bg-[linear-gradient(180deg,var(--vestara-accent-bg),transparent_55%),var(--vestara-surface-panel-raised)] p-2.5 shadow-[0_10px_36px_-12px_rgba(0,0,0,0.65),inset_0_1px_0_var(--vestara-surface-sheen)] transition-shadow duration-200 focus-within:border-[var(--vestara-accent-border-hover)] focus-within:shadow-[0_0_0_1px_var(--vestara-accent-border-hover),0_0_32px_var(--vestara-accent-bg)]"
      role="form"
      aria-label="Message composer"
    >
      {/* Reply context — existing referencedActivityIds mechanism only */}
      {replyTo && (
        <div className="mb-2 flex min-w-0 items-center gap-2 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-2 py-1 text-xs text-[var(--vestara-text-muted)] shadow-[inset_2px_0_0_var(--vestara-accent)]">
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

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* Target: live @mention preview, presented truthfully */}
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--vestara-accent-text)]"
          title={previewTitle}
        >
          <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-[var(--vestara-accent)] shadow-[0_0_6px_var(--vestara-accent)]" />
          {previewLabel}
        </span>
        {/* Input + @mention picker */}
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sending ? 'Sending…' : 'Message the room… (@ for agents)'}
            className="min-h-10 min-w-0 w-full bg-transparent px-1 text-sm text-[var(--vestara-text)] placeholder:text-[var(--vestara-text-dim)] focus:outline-none disabled:opacity-60"
            disabled={sending}
            aria-label="Message input"
            aria-expanded={mentionOpen}
            aria-autocomplete="list"
          />
          {mentionOpen && (
            <div
              role="listbox"
              aria-label="Mention agents"
              className="absolute bottom-full left-0 z-10 mb-1 max-h-64 w-72 overflow-y-auto rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-surface-panel-raised)] p-1 shadow-2xl"
            >
              {pickerEntries.length === 0 ? (
                <div className="px-2 py-1 text-[11px] text-[var(--vestara-text-muted)]">No matching agents.</div>
              ) : (
                pickerEntries.map((entry) => (
                  <button
                    key={entry.agentId}
                    type="button"
                    role="option"
                    aria-selected={structuredTarget === entry.agentId}
                    onClick={() => chooseMention(entry.agentId)}
                    className="flex w-full items-center gap-2 rounded-[var(--vestara-radius)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--vestara-accent-bg)]"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-6 shrink-0 place-items-center rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] text-[10px] font-semibold text-[var(--vestara-accent-text)]"
                    >
                      {entry.label.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium text-[var(--vestara-text)]">{entry.label}</span>
                        {entry.role && (
                          <span className="shrink-0 text-[10px] capitalize text-[var(--vestara-text-muted)]">{entry.role}</span>
                        )}
                      </span>
                      {entry.meta && (
                        <span className="block truncate font-mono text-[10px] text-[var(--vestara-text-muted)]">{entry.meta}</span>
                      )}
                    </span>
                    {entry.state && (
                      <span className="shrink-0 text-[10px] capitalize text-[var(--vestara-text-muted)]">{entry.state}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Keyboard hint */}
        <kbd
          aria-hidden="true"
          className="hidden shrink-0 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--vestara-text-dim)] sm:inline-block"
        >
          ↵
        </kbd>

        {/* Send */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!value.trim() || sending}
          aria-label={sending ? 'Sending message' : 'Send message'}
          className="grid size-10 shrink-0 place-items-center rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-dark)] bg-[linear-gradient(135deg,var(--vestara-accent-light),var(--vestara-accent)_55%,var(--vestara-accent-dark))] text-lg leading-none text-[var(--color-zinc-950)] shadow-[0_4px_16px_-4px_var(--vestara-accent-bg),0_0_12px_var(--vestara-accent-bg)] transition-all duration-150 hover:brightness-110 hover:shadow-[0_6px_20px_-4px_var(--vestara-accent-bg),0_0_18px_var(--vestara-accent-bg)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vestara-surface-panel-raised)]"
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
