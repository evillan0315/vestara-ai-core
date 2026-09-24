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
import { fetchM11AActivityById } from '../../lib/m11a-api';
import type { AttentionEntry } from '@vestara/activity-room';
import { handleActivityReply } from '../../lib/assistant-navigation';
import { postActivityMessage, retractActivityMessage, editActivityMessage, DEFAULT_COMPOSER_MAX_CHARS, fetchComposerMaxChars } from '../../lib/activity';
import { ActionIcon, Pill, StatusIndicator } from '@vestara/ui';
import type { ActivityProjectionRecord } from './activity-types';
import '../../styles/activity-room.css';
import OperationalWorkspaceLayout from '../../layouts/OperationalWorkspaceLayout';

import AgentProjectionDrawer from './AgentProjectionDrawer';
import { resolveAgentIdFromParticipantId } from './AgentProjectionDrawer';
import ActivityDetailDrawer from './ActivityDetailDrawer';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EastOutlinedIcon from '@mui/icons-material/EastOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import SouthOutlinedIcon from '@mui/icons-material/SouthOutlined';
import CleaningServicesOutlinedIcon from '@mui/icons-material/CleaningServicesOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import M11CActivityStream, {
  AttentionMaterialIcon,
  attentionStatusLabel,
  attentionSubject,
  attentionTone,
  attentionTypeLabel,
} from './M11CActivityStream';
import { SIZING } from '@vestara/ui-tokens';
import M11CParticipantRail from './M11CParticipantRail';
import M11CLiveNowStrip from './M11CLiveNowStrip';
import M11CWorkflowBrowser, { deriveWorkflowUnits, hasActiveWork } from './M11CWorkflowBrowser';
import { WORKFLOW_STATUS_CONFIG } from './status-config';
import ActivityRoomContextPanel from './ActivityRoomContextPanel';
import ActivityRoomHeader from './ActivityRoomHeader';
import Drawer from '../../components/ui/Drawer';
import TerminalWorkspace, { type TerminalWorkspaceApi } from '../../components/terminal/TerminalWorkspace';
import ActivityFilesPanel from './ActivityFilesPanel';
import ActivitySettingsPanel from './ActivitySettingsPanel';
import ActivityBrowserPanel from './ActivityBrowserPanel';
import { ActivityDrawerDockControls, ActivityDrawerHeaderActions } from './ActivityDrawerHeaderActions';

function formatFreshness(timestamp: number | null, now: number): string {
  if (timestamp === null) return 'Waiting for first update';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  return `Updated ${Math.floor(seconds / 60)}m ago`;
}

function ActivityFreshness({ timestamp }: { timestamp: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span
      className="mpg-tag-pill"
      title={timestamp === null ? 'No Activity Room data has been received yet' : new Date(timestamp).toLocaleTimeString()}
      aria-live="polite"
    >
      {formatFreshness(timestamp, now)}
    </span>
  );
}

function ActivityPanelSkeleton({ label }: { label: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" aria-label={`Loading ${label}`}>
      <span className="ar-kicker">{label}</span>
      {[0, 1, 2, 3].map((item) => <div className="ar-skeleton" key={item} />)}
    </div>
  );
}

function detailActivityId(item: M11CStreamItem): string {
  return item.id.startsWith('si-') ? item.id.slice(3) : item.id;
}

function normalizeM11CItemForDrawer(item: M11CStreamItem): ActivityProjectionRecord {
  const id = detailActivityId(item);
  const actor = {
    type: item.actor.type === 'human' || item.actor.type === 'agent' || item.actor.type === 'system' ? item.actor.type : 'system',
    id: item.actor.id,
    displayName: item.actor.displayName,
    ...(item.actor.role ? { role: item.actor.role } : {}),
  } as ActivityProjectionRecord['actor'];
  const base = {
    id,
    sequence: item.sequence,
    timestamp: item.timestamp,
    actor,
    evidenceRefs: [],
    ...(item.workflowRunId ? { workflowId: item.workflowRunId } : {}),
    ...(item.taskId ? { taskId: item.taskId } : {}),
    ...(item.originConversationId ? { originConversationId: item.originConversationId } : {}),
    ...(item.originSurface ? { originSurface: item.originSurface } : {}),
  };

  if (item.kind === 'tool-call' && item.tool) {
    return {
      ...base,
      kind: 'tool-call',
      agentId: item.tool.agentId ?? item.actor.id,
      toolName: item.tool.toolName,
      callID: item.tool.callID,
    };
  }
  if (item.kind === 'tool-result' && item.tool) {
    return {
      ...base,
      kind: 'tool-result',
      agentId: item.tool.agentId ?? item.actor.id,
      toolName: item.tool.toolName,
      callID: item.tool.callID,
      status: item.tool.status === 'failed' ? 'failed' : 'completed',
    };
  }

  return {
    ...base,
    kind: 'agent-message',
    agentId: item.actor.id,
    messageKind: item.actor.type === 'human' ? 'message' : item.kind === 'tool-call' ? 'tool-call' : 'message',
    content: item.content,
    ...(item.details ? { details: item.details } : {}),
  };
}

function isProjectionRecord(value: unknown): value is ActivityProjectionRecord {
  return Boolean(value && typeof value === 'object' && typeof (value as { kind?: unknown }).kind === 'string');
}

function attentionDetailContent(entry: AttentionEntry): string {
  const details = entry.details ?? {};
  const rows: string[] = [`${attentionTypeLabel(entry)} · ${entry.message}`];
  const push = (label: string, value: unknown): void => {
    if (value === undefined || value === null || value === '') return;
    rows.push(`${label}: ${String(value)}`);
  };

  push('Category', entry.category);
  push('Source', entry.sourceRef ? `${entry.sourceRef.kind}:${entry.sourceRef.id}` : entry.sourceRecordId);
  push('Subsystem', entry.sourceRef?.subsystem);
  push('Owner', entry.owner ?? entry.sourceRef?.owner);
  push('Scope', entry.scope);
  push('Status', entry.status);
  push('Severity', entry.severity);
  push('Reason', entry.reason);
  push('First observed', entry.firstObservedAt);
  push('Last observed', entry.lastObservedAt);
  push('Resolved at', entry.resolvedAt);
  push('Resolution', entry.resolutionReason);
  push('Verification run', details.verificationRunId ?? details.reportId);
  push('Check', details.checkId);
  push('Check type', details.checkType);
  push('Command', details.command);
  push('Path', details.path);
  push('Line', details.line);
  push('Column', details.column);
  push('Rule/code', details.rule ?? details.code);
  push('Evidence', entry.evidenceRefs?.join(', '));

  return rows.join('\n');
}

// ─── Component ───────────────────────────────────────────────

export default function M11CActivityRoomPage() {
  useRenderProfiler('M11CActivityRoomPage');
  const [steerConversationId, setSteerConversationId] = useState<string | null>(null);
  const [steerRequestId, setSteerRequestId] = useState<string | null>(null);
  const room = useM11CActivityRoom();
  const ui = useActivityRoomUI();
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | undefined>(undefined);
  // Imperative bridge to the drawer-hosted terminal workspace (session
  // actions live there; the drawer header only triggers them).
  const terminalApi = useRef<TerminalWorkspaceApi | null>(null);
  // Scan-first scope: attention banner focuses the stream preset; workflow
  // badges/browser rows scope the stream to one workflow. Both clearable.
  const [attentionFocus, setAttentionFocus] = useState(false);
  // Composer reference attachments: structured AttentionEntry objects the
  // user attached from Needs Attention rows. Sent as referencedActivityIds
  // (existing canonical contract) — never pasted text, never auto-sent.
  const [attachedRefs, setAttachedRefs] = useState<readonly AttentionEntry[]>([]);
  const handleAttachAttention = useCallback((entry: AttentionEntry) => {
    setAttachedRefs((prev) =>
      prev.some((existing) => existing.attentionId === entry.attentionId) ? prev : [...prev, entry],
    );
  }, []);
  const handleRemoveReference = useCallback((attentionId: string) => {
    setAttachedRefs((prev) => prev.filter((existing) => existing.attentionId !== attentionId));
  }, []);
  const clearAttachedRefs = useCallback(() => setAttachedRefs([]), []);
  const [workflowFilter, setWorkflowFilter] = useState<string | null>(null);
  // Small-screen sheets: rail is display:none <640px, so launchers open it
  // (and the browser) as bottom sheets instead.
  const [mobilePanel, setMobilePanel] = useState<'participants' | 'workflows' | null>(null);

  // Escape closes the mobile sheet.
  useEffect(() => {
    if (!mobilePanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobilePanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobilePanel]);

  // Drawer shortcuts (Activity Room scope only): backtick toggles Terminal,
  // Ctrl/⌘+B toggles Files, Ctrl/⌘+, toggles Settings. Typing surfaces
  // (inputs, composer, xterm helper textarea) are never hijacked.
  const { toggleTerminalDrawer, toggleFilesDrawer, toggleSettingsDrawer, toggleBrowserDrawer } = ui;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleFilesDrawer();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === ',') {
        e.preventDefault();
        toggleSettingsDrawer();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleBrowserDrawer();
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox');
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '`') {
        e.preventDefault();
        toggleTerminalDrawer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleTerminalDrawer, toggleFilesDrawer, toggleSettingsDrawer, toggleBrowserDrawer]);

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
  // Includes both participantId (agent-agent-developer) and raw actor.id keys.
  const participantNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of room.participants) {
      map[p.participantId] = p.displayName;
      // Also map the raw agent ID (e.g. "agent-developer") for stream items
      // that use actor.id instead of participantId.
      const rawId = p.participantId.replace(/^agent-/, '');
      if (rawId !== p.participantId) map[rawId] = p.displayName;
    }
    // ROUTING-CONVERGENCE-001C S3: no synthetic-actor alias. Lifecycle rows
    // are system-authored ("Conversation Runtime"); no producer mints an
    // agent-authored `vestara` row anymore, so nothing needs aliasing to
    // 'Assistant'. (Pre-fix rows keep their stored displayName verbatim.)
    return map;
  }, [room.participants]);

  // Participant ID → model label lookup for tool rows (Phase 1): shows the
  // executing model (modelDisplayName preferred, modelId fallback) next to
  // the agent name. Same dual-key pattern as participantNames. Absent stays
  // absent — never inferred.
  const participantModels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of room.participants) {
      const label = (p.modelDisplayName ?? p.modelId)?.trim() ?? '';
      if (!label) continue;
      map[p.participantId] = label;
      const rawId = p.participantId.replace(/^agent-/, '');
      if (rawId !== p.participantId && !map[rawId]) map[rawId] = label;
    }
    return map;
  }, [room.participants]);

  // ─── Callbacks ──────────────────────────────────────────

  const handleSelectParticipant = useCallback((id: string | undefined) => {
    setSelectedParticipantId(id);
  }, []);

  const handleSelectWorkflow = useCallback((id: string | null) => {
    setWorkflowFilter(id);
  }, []);

  // "New" counts for rail badges: fresh (live-arrived this session) items
  // grouped by actor. Keys cover both participantId (agent-x) and raw
  // actor id (x) variance between rail and stream.
  const unreadCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of room.stream) {
      if (!s.fresh) continue;
      for (const key of [s.actor.id, `agent-${s.actor.id}`]) {
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return map;
  }, [room.stream]);

  const [detailRecord, setDetailRecord] = useState<ActivityProjectionRecord | null>(null);

  useEffect(() => {
    const item = ui.detailItem;
    if (!item) {
      setDetailRecord(null);
      return;
    }
    let disposed = false;
    setDetailRecord(normalizeM11CItemForDrawer(item));
    fetchM11AActivityById(detailActivityId(item))
      .then((detail) => {
        if (!disposed && isProjectionRecord(detail.projection)) setDetailRecord(detail.projection);
      })
      .catch(() => {
        // The normalized stream item already provides the immediate drawer shell.
      });
    return () => {
      disposed = true;
    };
  }, [ui.detailItem]);

  const handleDrillDown = useCallback((aggregateId: string, _referencedIds: readonly string[]) => {
    const aggregateItem = room.stream.find((s) => s.id === aggregateId);
    if (aggregateItem) ui.openDetail(aggregateItem);
  }, [room.stream, ui.openDetail]);

  const handleOpenAttention = useCallback((entry: AttentionEntry) => {
    const sourceId = String(entry.sourceRecordId);
    const item = room.stream.find((candidate) => candidate.id === sourceId || candidate.id === `si-${sourceId}`);
    if (item) {
      ui.openDetail(item);
      return;
    }
    ui.openDetail({
      id: sourceId,
      sequence: 0,
      timestamp: entry.timestamp,
      kind: 'diagnostic',
      importance: 'secondary',
      actor: {
        type: entry.actor?.type ?? 'system',
        id: entry.actor?.id ?? entry.owner ?? 'activity-room',
        displayName: entry.actor?.displayName ?? entry.owner ?? 'Activity Room',
      },
      content: attentionDetailContent(entry),
      ...(entry.workflowRunId ? { workflowRunId: String(entry.workflowRunId) } : {}),
      ...(entry.taskId ? { taskId: String(entry.taskId) } : {}),
      fresh: false,
    });
  }, [room.stream, ui.openDetail]);

  const handleRetract = useCallback(async (item: M11CStreamItem) => {
    try {
      await retractActivityMessage(item.id, 'Message retracted');
    } catch {
      // Retraction failed — stay silent
    }
  }, []);

  // AR-UI-REPLY-001: source-aware Reply. Assistant-originated items carry an
  // authoritative conversation reference → open the Global Assistant on that
  // EXISTING conversation (composer focused, nothing created). All other
  // items — Activity Room-originated, missing, or unknown provenance — stay
  // on the existing local composer path (fail safe). Origin is never
  // inferred from display text, agent name, icon, or message content.
  // The Reply control is a native <button>, so click and keyboard
  // (Enter/Space) activation both arrive here.
  const handleReply = useCallback((item: M11CStreamItem) => {
    handleActivityReply(item, (local) => ui.setReplyTo(local));
  }, [ui.setReplyTo]);

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
  const activityLoading = room.lastUpdatedAt === null && room.state === 'connecting';
  // Root gap-* matches Files/Settings page containers: canonical section
  // spacing between hero, launchers, and the working area.
  return (
    <div className="ar-page min-w-0 w-full max-w-full g px-[var(--vestara-spacing-page)] pt-[var(--vestara-spacing-page)] pb-[var(--vestara-spacing-page)]">
      {/* ─── Canonical workspace Hero (VES-DESIGN-008B) ─────────
          Replaces the hand-rolled ar-plinth. Hierarchy:
          STATUS (connection) vs METADATA (records/cursor) vs ACTION
          (Pause/Clear). No reference-only controls, no fake metrics. */}
      <ActivityRoomHeader
        roomName={roomName}
        state={room.state}
        paused={room.paused}
        recordCount={room.stream.length}
        cursor={room.cursor?.sequenceNumber}
        unread={room.unread}
        lastUpdatedAt={room.lastUpdatedAt}
        onPause={room.paused ? room.resume : room.pause}
        onClear={room.clear}
      />

      {/* ─── Working area: adaptive composition (VES-DESIGN-008F) ──
          INFORMATION VALUE drives SPACE ALLOCATION. Participants keep a
          stable contextual width; the stream owns the flexible share. The
          workflow column exists only while authoritative active work
          exists — otherwise a compact disclosure preserves browsing
          without spending a permanent column on "0 workflows". */}
      {/* ─── Small-screen launchers (rail hides <640px) ──────────
          Participants and workflows open as bottom sheets; the stream keeps
          the single column. Hidden once the rail docks. */}
      <div className="ar-panel-launchers flex gap-2" role="group" aria-label="Open panels">
        <button
          type="button"
          onClick={() => setMobilePanel('participants')}
          className="min-h-11 flex-1 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-3 text-xs font-semibold text-[var(--vestara-text-secondary)]"
          aria-haspopup="dialog"
        >
          Participants · {room.participants.length}
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel('workflows')}
          className="min-h-11 flex-1 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-3 text-xs font-semibold text-[var(--vestara-text-secondary)]"
          aria-haspopup="dialog"
        >
          Workflows · {workflowUnits.length}
        </button>
      </div>

      {!hasActiveWorkflows && (
        <details className="ar-workflows-disclosure rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-4 py-2.5">
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
              onSelectWorkflow={handleSelectWorkflow}
              selectedWorkflowId={workflowFilter}
            />
          </div>
        </details>
      )}
      <OperationalWorkspaceLayout
        banner={(
          <>
            {/* Operational/Verification Lane hidden until VER-GOV-001 provides
                authoritative runtime state. Component and contract retained. */}
            {room.error && (
              <div className="ar-banner ar-banner--warn my-[var(--vestara-spacing-section)]" role="alert">
                <StatusIndicator variant="warn" size="sm" ariaLabel="Warning" />
                <span className="min-w-0 flex-1">{room.error}</span>
                <Pill variant="danger" size="sm" onClick={room.retry}>
                  Reconnect
                </Pill>
              </div>
            )}
            {(room.state === 'reconnecting' || room.state === 'offline') && room.lastUpdatedAt !== null && (
              <div className="ar-banner ar-banner--info my-[var(--vestara-spacing-section)]" role="status" aria-live="polite">
                <StatusIndicator variant="warn" size="sm" ariaLabel="Activity Room reconnecting" />
                <span className="min-w-0 flex-1">
                  {room.state === 'reconnecting' ? 'Reconnecting — showing the latest received activity.' : 'Connection lost — activity may be stale.'}
                </span>
                <ActivityFreshness timestamp={room.lastUpdatedAt} />
              </div>
            )}
            {room.attention.length > 0 && (() => {
              const critical = room.attention.filter((a) => a.severity === 'critical').length;
              // Strongest-first: critical items lead, otherwise the newest entry.
              // One headline keeps the banner scannable; the full list lives
              // in the Needs-attention stream preset behind Focus.
              const top = room.attention.find((a) => a.severity === 'critical') ?? room.attention[0];
              const remainder = room.attention.length - 1;
              return (
                <button
                  type="button"
                  onClick={() => setAttentionFocus((v) => !v)}
                  aria-pressed={attentionFocus}
                  title={attentionFocus ? 'Clear attention focus' : `Focus needs-attention activity (${room.attention.length} items)`}
                  className={`ar-banner my-[var(--vestara-spacing-section)] w-full cursor-pointer text-left transition-colors hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset ${critical > 0 ? 'ar-banner--warn' : 'ar-banner--info'}`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <StatusIndicator
                      variant={critical > 0 ? 'error' : 'warn'}
                      size="sm"
                      ariaLabel={critical > 0 ? 'Critical attention required' : 'Attention required'}
                    />
                    <span className="shrink-0 font-medium text-[var(--vestara-status-warning)]">
                      {room.attention.length} need{room.attention.length === 1 ? 's' : ''} attention
                    </span>
                    {critical > 0 && <span className="ar-banner__critical shrink-0">{critical} critical</span>}
                    {top && (
                      <span className="ar-banner__note min-w-0 flex-1 truncate" title={top.message}>
                        {top.message}{remainder > 0 ? ` · +${remainder} more` : ''}
                      </span>
                    )}
                    <span className="shrink-0 text-xs underline decoration-dotted underline-offset-2">
                      {attentionFocus ? 'Clear focus' : 'Focus ›'}
                    </span>
                  </span>
                </button>
              );
            })()}
          </>
        )}
        rail={(
          <aside className="ar-panel ar-panel--rail min-w-0 max-w-full">
          {activityLoading ? <ActivityPanelSkeleton label="Participants" /> : (
            <M11CParticipantRail
              participants={room.participants}
              selectedParticipantId={selectedParticipantId}
              onSelectParticipant={handleSelectParticipant}
              onOpenAgentControl={ui.openAgentControl}
              unreadCounts={unreadCounts}
            />
          )}
          </aside>
        )}
        context={(
          <aside className="ar-panel ar-panel--context min-w-0 max-w-full" aria-label="Operational context">
            <ActivityRoomContextPanel
              stream={room.stream}
              participantCount={room.participants.length}
              activeAgentCount={activeAgentCount}
              connectionState={room.state}
              onTerminal={ui.cycleTerminalDrawer}
              onFiles={ui.cycleFilesDrawer}
              onBrowser={ui.cycleBrowserDrawer}
              onSettings={ui.cycleSettingsDrawer}
              onReferenceScreenshot={(file) =>
                ui.addFileAttachment({ id: `shot-${Date.now()}`, name: file.name, path: file.path })
              }
            />
          </aside>
        )}
      >
        {/* Center Stream (the salon) */}
        <main className="ar-panel ar-panel--main min-w-0 max-w-full">
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
              {activityLoading ? <ActivityPanelSkeleton label="Workflows" /> : (
                <M11CWorkflowBrowser
                  stream={room.stream}
                  workflowSummary={room.workflowSummary}
                  onSelectWorkflow={handleSelectWorkflow}
                  selectedWorkflowId={workflowFilter}
                />
              )}
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
            onReply={handleReply}
            onRetract={handleRetract}
            onEdit={ui.openEdit}
            onOpenThread={ui.openThread}
            lookupAuthor={lookupAuthor}
            lookupContent={lookupContent}
            selectedParticipantId={selectedParticipantId}
            submission={room.submission}
            onSubmitResponse={room.submitResponse}
            participantNames={participantNames}
            participantModels={participantModels}
            onInspectEdit={ui.inspectEditInFiles}
            onSteerTurn={(conversationId) => {
              setSteerConversationId(conversationId);
              setSteerRequestId(crypto.randomUUID());
            }}
            onStopTurn={async (conversationId) => {
              const response = await fetch(`/api/activity-room/active-turns/${encodeURIComponent(conversationId)}/stop`, {
                method: 'POST',
              });
              if (!response.ok) throw new Error(`Stop failed (HTTP ${response.status})`);
            }}
            attentionFocus={attentionFocus}
            attentionEntries={room.attention}
            onOpenAttention={handleOpenAttention}
            onAttachAttention={handleAttachAttention}
            workflowFilter={workflowFilter}
            onSelectWorkflow={handleSelectWorkflow}
            streamHeading={workflowFilter ? 'Workflow activity' : selectedParticipantId === undefined ? 'Activity Stream' : `Activity for ${participantNames[selectedParticipantId] ?? 'selected participant'}`}
            streamHeaderAction={
              <span className="ar-panel__hint flex items-center gap-2">
                {/* LIVE state lives in the page header (single truth).
                    Only paused/buffered context surfaces here, where it
                    changes stream behavior. Scope is cleared from the
                    participant rail / workflow browser / attention banner. */}
                {room.paused && `${room.unread} buffered`}
              </span>
            }
          />
          {/* Composer belongs to the center Activity surface: pinned below
              the scrollable stream via flex containment, never a global
              operational footer. */}
          <M11CComposer
            replyTo={ui.replyToItem}
            onClearReply={ui.clearReply}
            references={attachedRefs}
            onRemoveReference={handleRemoveReference}
            onOpenReference={handleOpenAttention}
            onClearReferences={clearAttachedRefs}
            attachedFiles={ui.attachedFiles}
            onRemoveFile={ui.removeFileAttachment}
            onClearFiles={ui.clearFileAttachments}
            participants={room.participants}
            steerConversationId={steerConversationId}
            steerRequestId={steerRequestId}
            onSteerSent={() => {
              setSteerConversationId(null);
              setSteerRequestId(null);
            }}
          />
        </main>

        {/* Detail drawer — the stream stays a concise projection while the
            right-side drawer hydrates authoritative activity detail. */}
        <ActivityDetailDrawer record={detailRecord} onClose={ui.closeDetail} records={detailRecord ? [detailRecord] : []} />
      </OperationalWorkspaceLayout>

      {/* ─── Mobile sheets (small screens only) ─────────────── */}
      {mobilePanel && (
        <div
          className="fixed inset-0 z-50 sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={mobilePanel === 'participants' ? 'Participants' : 'Workflows'}
          onClick={() => setMobilePanel(null)}
        >
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-2xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--vestara-text-muted)]">
                {mobilePanel === 'participants' ? 'Participants' : 'Workflows'}
              </span>
              <button
                type="button"
                onClick={() => setMobilePanel(null)}
                aria-label="Close panel"
                className="grid size-11 place-items-center rounded-lg border border-[var(--vestara-border-subtle)] text-lg text-[var(--vestara-text-secondary)]"
              >
                ×
              </button>
            </div>
            {mobilePanel === 'participants' ? (
              <M11CParticipantRail
                participants={room.participants}
                selectedParticipantId={selectedParticipantId}
                onSelectParticipant={(id) => {
                  handleSelectParticipant(id);
                  setMobilePanel(null);
                }}
                onOpenAgentControl={ui.openAgentControl}
                unreadCounts={unreadCounts}
              />
            ) : (
              <M11CWorkflowBrowser
                stream={room.stream}
                workflowSummary={room.workflowSummary}
                onSelectWorkflow={(id) => {
                  handleSelectWorkflow(id);
                  if (id) setMobilePanel(null);
                }}
                selectedWorkflowId={workflowFilter}
              />
            )}
          </div>
        </div>
      )}

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
      {/* Terminal Drawer — docks bottom, flips to top on toolbar toggle.
          Stays mounted while open so the session survives the flip. The
          workspace toolbar is hidden here; its actions live in this header. */}
      {ui.terminalDrawerOpen && (
        <Drawer
          open
          onClose={ui.toggleTerminalDrawer}
          title="Terminal"
          position={ui.terminalDrawerPosition}
          defaultSize="large"
          portal
          panelClassName="ar-terminal-drawer"
          bodyClassName="ar-terminal-drawer__body"
          hideBackdrop
          header={
            <ActivityDrawerHeaderActions
              label="Terminal actions"
              dockControls={
                <ActivityDrawerDockControls
                  current={ui.terminalDrawerPosition}
                  positions={['left', 'bottom', 'right', 'top']}
                  label="Terminal drawer position"
                  onDock={(position) => {
                    if (position === 'left' || position === 'bottom' || position === 'right' || position === 'top') {
                      ui.dockTerminalDrawer(position);
                    }
                  }}
                />
              }
            >
              <ActionIcon
                label="New terminal session"
                icon={<AddOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} />}
                tone="muted"
                size="sm"
                onClick={() => terminalApi.current?.newSession()}
              />
              <ActionIcon
                label="Clear terminal"
                icon={<CleaningServicesOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} />}
                tone="muted"
                size="sm"
                onClick={() => terminalApi.current?.clearActive()}
              />
              <ActionIcon
                label="Kill terminal session"
                icon={<DeleteOutlineOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} />}
                tone="destructive"
                size="sm"
                onClick={() => terminalApi.current?.killActive()}
              />
            </ActivityDrawerHeaderActions>
          }
        >
          {/* Full terminal workspace (same component as the Terminal page):
              server sessions, tabs, and backend-piped I/O. */}
          <div className="h-full min-h-0 w-full">
            <TerminalWorkspace ref={terminalApi} hideToolbar />
          </div>
        </Drawer>
      )}
      {/* Files Drawer — docks left, flips to right on toolbar toggle.
          Same production workspace as the Files page (no parallel browser). */}
      {ui.filesDrawerOpen && (
        <Drawer
          open
          onClose={ui.toggleFilesDrawer}
          title="Files"
          position={ui.filesDrawerPosition}
          defaultSize="medium"
          portal
          hideBackdrop
          header={
            <ActivityDrawerHeaderActions
              label="Files actions"
              dockControls={
                <ActivityDrawerDockControls
                  current={ui.filesDrawerPosition}
                  positions={['left', 'right']}
                  label="Files drawer position"
                  onDock={(position) => {
                    if (position === 'left' || position === 'right') ui.dockFilesDrawer(position);
                  }}
                />
              }
            />
          }
        >
          <div className="h-full min-h-0 w-full">
            <ActivityFilesPanel
              onAttachToComposer={ui.addFileAttachment}
              openPath={ui.filesDrawerPath}
              editDetail={ui.filesDrawerEdit}
            />
          </div>
        </Drawer>
      )}
      {/* Settings Drawer — docks right, flips to left on toolbar toggle.
          Full-size takeover; same General surface as the Settings page. */}
      {ui.settingsDrawerOpen && (
        <Drawer
          open
          onClose={ui.toggleSettingsDrawer}
          title="Settings"
          position={ui.settingsDrawerPosition}
          defaultSize="full"
          portal
        >
          <div className="h-full min-h-0 w-full">
            <ActivitySettingsPanel />
          </div>
        </Drawer>
      )}
      {/* Browser Drawer — embeds the existing agent-browser dashboard only.
          Opening this drawer does not create or navigate browser sessions. */}
      {ui.browserDrawerOpen && (
        <Drawer
          open
          onClose={ui.toggleBrowserDrawer}
          title="Browser"
          position={ui.browserDrawerPosition}
          defaultSize="large"
          storageKey="activity-browser"
          portal
          hideBackdrop
          bodyClassName="overflow-hidden"
          header={
            <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Browser dock actions">
              <button
                type="button"
                onClick={() => ui.dockBrowserDrawer('left')}
                title="Dock browser to left"
                aria-label="Dock browser to left"
                aria-pressed={ui.browserDrawerPosition === 'left'}
                className={`grid size-7 cursor-pointer place-items-center rounded-[var(--vestara-radius)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset ${
                  ui.browserDrawerPosition === 'left'
                    ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)]'
                    : 'text-[var(--vestara-text-secondary)] hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-text)]'
                }`}
              >
                <EastOutlinedIcon sx={{ fontSize: SIZING.icon.sm, transform: 'rotate(180deg)' }} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => ui.dockBrowserDrawer('right')}
                title="Dock browser to right"
                aria-label="Dock browser to right"
                aria-pressed={ui.browserDrawerPosition === 'right'}
                className={`grid size-7 cursor-pointer place-items-center rounded-[var(--vestara-radius)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset ${
                  ui.browserDrawerPosition === 'right'
                    ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)]'
                    : 'text-[var(--vestara-text-secondary)] hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-text)]'
                }`}
              >
                <EastOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => ui.dockBrowserDrawer('bottom')}
                title="Dock browser to bottom"
                aria-label="Dock browser to bottom"
                aria-pressed={ui.browserDrawerPosition === 'bottom'}
                className={`grid size-7 cursor-pointer place-items-center rounded-[var(--vestara-radius)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset ${
                  ui.browserDrawerPosition === 'bottom'
                    ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)]'
                    : 'text-[var(--vestara-text-secondary)] hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-text)]'
                }`}
              >
                <SouthOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />
              </button>
              <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-[var(--vestara-border-subtle)]" />
              <PublicOutlinedIcon
                sx={{ fontSize: SIZING.icon.sm }}
                className="text-[var(--vestara-text-muted)]"
                aria-hidden="true"
              />
            </div>
          }
        >
          <ActivityBrowserPanel />
        </Drawer>
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
  references = [],
  onRemoveReference,
  onOpenReference,
  onClearReferences,
  attachedFiles = [],
  onRemoveFile,
  onClearFiles,
  participants = [],
  steerConversationId,
  steerRequestId,
  onSteerSent,
}: {
  replyTo?: M11CStreamItem | null;
  onClearReply?: () => void;
  /**
   * Structured attention references attached from Needs Attention rows.
   * Rendered as chips; sent as referencedActivityIds (existing canonical
   * contract). Multiple supported — the transport field is an array.
   */
  references?: readonly AttentionEntry[];
  onRemoveReference?: (attentionId: string) => void;
  /** Reopen the source activity behind a reference chip in the detail drawer. */
  onOpenReference?: (entry: AttentionEntry) => void;
  onClearReferences?: () => void;
  /**
   * Workspace files staged as attachments (e.g. screenshots saved to Files).
   * Rendered as chips; sent as `![name](path)` markdown appended to the
   * instruction — visible, editable-by-removal, never silently injected.
   */
  attachedFiles?: readonly { readonly id: string; readonly name: string; readonly path: string }[];
  onRemoveFile?: (id: string) => void;
  onClearFiles?: () => void;
  participants?: readonly ParticipantOption[];
  steerConversationId?: string | null;
  steerRequestId?: string | null;
  onSteerSent?: () => void;
}) {
  // Human message cap is configurable via Settings → General
  // (`general.composerMaxChars`, default 100 000; server enforces the
  // effective value, the counter keeps the Director from composing past it).
  const [composerMax, setComposerMax] = useState(DEFAULT_COMPOSER_MAX_CHARS);
  useEffect(() => {
    void fetchComposerMaxChars().then(setComposerMax);
  }, []);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steerNotice, setSteerNotice] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [structuredTarget, setStructuredTarget] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Pre-fill with @mention when replying
  useEffect(() => {
    if (replyTo) {
      setValue(`@${replyTo.actor.displayName} `);
      inputRef.current?.focus();
    }
  }, [replyTo]);

  // Autogrow: the instruction field expands with content up to the CSS
  // max-height, then scrolls internally. No fixed empty height, no JS
  // max-rows constant — the cap lives in presentation (max-h-40).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, references.length, replyTo]);

  const handleSend = useCallback(async () => {
    const text = value.trim();
    if (!text || sending) return;
    if (text.length > composerMax) {
      setError(`Message is ${text.length - composerMax} characters over the ${composerMax} limit`);
      return;
    }

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
      // Structured references travel through the existing canonical
      // referencedActivityIds transport (validated server-side against the
      // durable store, persisted on the message record). Reply context and
      // attached attention references merge — deduped, order-preserving.
      // Identity only (sourceRecordId); the agent resolves authoritative
      // context lazily via existing activity endpoints. Never pasted text.
      const referenceIds = references.map((ref) => String(ref.sourceRecordId));
      const mergedReferences =
        replyTo !== null && replyTo !== undefined
          ? [...new Set([replyTo.id, ...referenceIds])]
          : [...new Set(referenceIds)];
      // Staged file attachments travel as visible markdown image references
      // to workspace paths the agent can read. The chips above are their
      // exact preview — nothing hidden, removable before Send.
      const attachmentLines = attachedFiles.map((file) => `![${file.name}](${file.path})`);
      const contentWithAttachments =
        attachmentLines.length > 0 ? `${text}\n\n${attachmentLines.join('\n')}` : text;
      const result = await postActivityMessage({
        content: contentWithAttachments,
        targets: [...targets],
        actor: { displayName: 'You', role: 'human' },
        // Surface attestation: this composer speaks FROM the Workspace UI.
        // The principal stays the human actor above; the target stays in
        // targets. Principal ≠ Surface ≠ Target.
        surface: 'workspace-ui',
        referencedActivityIds: mergedReferences.length > 0 ? mergedReferences : undefined,
        ...(steerConversationId && steerRequestId ? { steerConversationId, steerRequestId } : {}),
      });
      setValue('');
      if (steerConversationId) {
        setSteerNotice(
          result.delivery?.status === 'queued'
            ? 'Correction queued for the active conversation’s next turn.'
            : result.delivery?.status === 'duplicate'
              ? 'Correction already queued.'
              : 'Correction delivery is unavailable.',
        );
      }
      setStructuredTarget(null);
      setMentionOpen(false);
      onClearReply?.();
      onClearReferences?.();
      onClearFiles?.();
      onSteerSent?.();
    } catch (err) {
      // Send failed — text, references, AND file attachments stay so the
      // user can retry intact.
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }, [value, sending, replyTo, references, attachedFiles, onClearReply, onClearReferences, onClearFiles, structuredTarget, steerConversationId, steerRequestId, onSteerSent]);

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

  // Enter sends; Shift+Enter inserts a newline (multiline instruction field).
  // Escape closes the @mention picker. Previously (single-line input) every
  // Enter sent — the textarea now supports deliberate multi-line drafting.
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
  // path will use. Reply context narrows the audience line but never the
  // transport target (referencedActivityIds, not a DM). Addressable targets
  // trigger that agent's turn.
  const previewTarget = structuredTarget
    ? { agentId: structuredTarget }
    : AGENT_MENTION_TARGETS.find((entry) => entry.pattern.test(value));
  const previewBase = previewTarget ? (MENTION_TARGET_LABELS[previewTarget.agentId] ?? previewTarget.agentId) : 'All agents';
  const previewLabel = replyTo && !previewTarget ? `Reply · ${previewBase}` : previewBase;
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
      className="ar-composer-pin rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-accent)] bg-[var(--vestara-surface-canvas)] p-[var(--vestara-spacing-section)] shadow-[var(--vestara-elevation-md)]"
      role="form"
      aria-label="Message composer"
    >
      {/* Reply context — existing referencedActivityIds mechanism only */}
      {replyTo && (
        <div className="mb-[var(--vestara-spacing-element)] flex min-w-0 items-center gap-2 rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-surface-canvas)] px-2 py-1 text-xs text-[var(--vestara-text-muted)] shadow-[inset_2px_0_0_var(--vestara-accent)]">
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

      {/* Attached attention references — structured AttentionEntry chips.
          Labels derive from authoritative entry fields (never pasted text);
          the sourceRecordId travels at Send via referencedActivityIds. */}
      {references.length > 0 && (
        <div className="mb-[var(--vestara-spacing-element)] flex min-w-0 flex-wrap items-center gap-[var(--vestara-spacing-element)]" aria-label="Attached references">
          {references.map((ref) => {
            const tone = attentionTone(ref);
            return (
              <span
                key={ref.attentionId}
                className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-surface-canvas)] py-0.5 pl-1 pr-0.5 text-[11px]"
                title={`${attentionTypeLabel(ref)} · ${ref.message} (ref ${String(ref.sourceRecordId)})`}
              >
                <button
                  type="button"
                  onClick={() => onOpenReference?.(ref)}
                  aria-label={`Open ${attentionTypeLabel(ref)} ${attentionSubject(ref)} detail`}
                  className="flex min-w-0 items-center gap-1.5 rounded-[var(--vestara-radius-full)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
                >
                  <AttentionMaterialIcon entry={ref} tone={tone} iconSize={SIZING.icon.sm} />
                  <span className={`shrink-0 font-bold ar-attention-row__type--${tone}`}>
                    {attentionTypeLabel(ref)}
                  </span>
                  <span className="min-w-0 truncate font-semibold text-[var(--vestara-text-primary)]">
                    {attentionSubject(ref)}
                  </span>
                  <span className={`shrink-0 ar-attention-row__status--${tone}`}>
                    {attentionStatusLabel(ref.reason)}
                  </span>
                </button>
                {onRemoveReference && (
                  <button
                    type="button"
                    onClick={() => onRemoveReference(ref.attentionId)}
                    aria-label={`Remove ${attentionTypeLabel(ref)} ${attentionSubject(ref)} reference`}
                    className="grid size-5 shrink-0 place-items-center rounded-[var(--vestara-radius-full)] text-[var(--vestara-text-muted)] transition-colors hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Staged file attachments (e.g. screenshots). Same chip language as
          attention references; the × removes before Send. */}
      {attachedFiles.length > 0 && (
        <div className="mb-[var(--vestara-spacing-element)] flex min-w-0 flex-wrap items-center gap-[var(--vestara-spacing-element)]" aria-label="Attached files">
          {attachedFiles.map((file) => (
            <span
              key={file.id}
              className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-surface-canvas)] py-0.5 pl-1.5 pr-0.5 text-[11px]"
              title={`Attached file ${file.path}`}
            >
              <ImageOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />
              <span className="min-w-0 truncate font-semibold text-[var(--vestara-text-primary)]">
                {file.name}
              </span>
              {onRemoveFile && (
                <button
                  type="button"
                  onClick={() => onRemoveFile(file.id)}
                  aria-label={`Remove ${file.name} attachment`}
                  className="grid size-5 shrink-0 place-items-center rounded-[var(--vestara-radius-full)] text-[var(--vestara-text-muted)] transition-colors hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

       {/* Instruction: dominant multiline field, visually quiet until focused */}
       <div className="ar-composer__row relative min-w-0">
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sending ? 'Sending…' : 'Message the room… (@ for agents)'}
            className="max-h-40 min-h-10 w-full resize-none overflow-y-auto bg-transparent px-1 py-1 text-sm leading-relaxed text-[var(--vestara-text)] placeholder:text-[var(--vestara-text-dim)] focus:outline-none disabled:opacity-60"
            disabled={sending}
            aria-label="Message instruction"
            aria-expanded={mentionOpen}
            aria-autocomplete="list"
          />
          {mentionOpen && (
            <div
              role="listbox"
              aria-label="Mention agents"
              className="absolute bottom-full left-0 z-10 mb-1 max-h-64 w-72 overflow-y-auto rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-surface-canvas)] p-1 shadow-2xl"
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
                      className="grid size-6 shrink-0 place-items-center rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-surface-canvas)] text-[10px] font-semibold text-[var(--vestara-accent-text)]"
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

       {/* Toolbar: recipient/target …… tertiary count + primary send */}
       {steerNotice && (
         <p className="mb-[var(--vestara-spacing-element)] text-xs text-[var(--vestara-text-secondary)]" role="status">
           {steerNotice}
         </p>
       )}
        <div className="mt-[var(--vestara-spacing-element)] flex min-w-0 flex-wrap items-center justify-between gap-[var(--vestara-spacing-element)] border-t border-[var(--vestara-accent-border)] pt-[var(--vestara-spacing-element)]">
         {/* Target: live @mention preview, presented truthfully */}
         <span
           className="ar-composer__target inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-surface-canvas)] px-2.5 py-1 text-[11px] font-semibold text-[var(--vestara-accent-text)]"
           title={previewTitle}
         >
           <span aria-hidden="true" className="inline-block size-1.5 shrink-0 rounded-full bg-[var(--vestara-accent)] shadow-[0_0_6px_var(--vestara-accent)]" />
           <span className="truncate">{previewLabel}</span>
         </span>
         <span className="ar-composer__secondary flex shrink-0 items-center gap-[var(--vestara-spacing-element)]">
            {/* Character count (configurable cap) — tertiary metadata */}
            <span
              aria-hidden="true"
              className={`shrink-0 font-mono text-[10px] tabular-nums ${value.length > composerMax ? 'text-[var(--vestara-status-error)]' : value.length > composerMax - 200 ? 'text-[var(--vestara-status-warning)]' : 'text-[var(--vestara-text-dim)]'}`}
            >
              {value.length}/{composerMax}
            </span>
            <span className="sr-only" aria-live="polite">
              {value.length > composerMax ? `Over limit by ${value.length - composerMax} characters` : ''}
            </span>

           {/* Send — primary composer action (existing submit path) */}
           <button
             type="button"
             onClick={handleSend}
              disabled={!value.trim() || value.length > composerMax || sending}
             aria-label={sending ? 'Sending message' : 'Send message'}
             title={sending ? 'Sending message' : 'Send message (Enter)'}
              className="grid size-10 shrink-0 place-items-center rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-dark)] bg-[var(--vestara-accent)] text-[var(--vestara-surface-canvas)] shadow-[0_4px_14px_-6px_var(--vestara-accent-bg)] transition-all duration-150 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vestara-surface-panel)]"
           >
             <span aria-hidden="true" className="inline-flex">
               {sending ? '…' : <SendOutlinedIcon sx={{ fontSize: SIZING.icon.md }} />}
             </span>
           </button>
         </span>
       </div>

      {/* Error */}
      {error && (
        <p className="mt-[var(--vestara-spacing-element)] rounded-[var(--vestara-radius)] border border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] px-2 py-1 text-xs text-[var(--vestara-status-error)]" role="alert">
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
            className="w-full rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-canvas)] px-3 py-2 text-sm text-[var(--vestara-text)] focus:outline-none focus:border-[var(--vestara-accent-border-hover)] resize-none placeholder:text-[var(--vestara-text-muted)]"
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
              <div key={id} className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-3 py-2">
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
