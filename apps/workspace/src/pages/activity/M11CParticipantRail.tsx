/**
 * M11C Projection-Driven Participant Panel (VES-DESIGN-008C presentation)
 *
 * Renders participants from M10 ParticipantProjection (via M11A API).
 * Zero hardcoded teams, roles, or model names. Activity Room is a generic
 * consumer of participant/team information — it does not define teams.
 *
 * Status authority (aligned 2026-10-27):
 * - MembershipState: 'joined' | 'left' | 'assigned' (packages/types)
 * - PresenceState: 'online' | 'offline' | 'idle' | 'disconnected'
 * - WorkState: 'available' | 'working' | 'waiting' | 'blocked' |
 *   'attention-required' (+ legacy building/testing/verifying aliases)
 * - pendingInteractionId surfaces as "Awaiting approval", never inferred
 *   from workState.
 *
 * Identity honesty (008C audit — presentation only, never new authority):
 * - displayName is authoritative PER CONTRACT, but for unnamed agents it
 *   carries the stable agent/model id, which must not masquerade as a
 *   chosen actor name. Echoed modelIds demote to secondary metadata.
 *
 * Humans and agents share the same component contract.
 */

import type { ParticipantProjection } from '@vestara/activity-room';
import { EmptyState, StatusIndicator } from '@vestara/ui';
import { memo, useEffect, useMemo, useState } from 'react';
import {
  MEMBERSHIP_LABEL,
  PARTICIPANT_GROUP_ORDER,
  PRESENCE_LABEL,
  WORK_STATE_CONFIG,
  WORK_STATE_TONE,
  isWorkStateStale,
  participantGroupOf,
  type ParticipantGroupKey,
} from './status-config';
import { formatRelative } from './activity-formatters';

// ─── Types ───────────────────────────────────────────────────

interface M11CParticipantRailProps {
  /** Projection-driven participants — never hardcoded. */
  readonly participants: readonly ParticipantProjection[];
  /** Currently selected participant (for stream filtering). */
  readonly selectedParticipantId: string | undefined;
  /** Callback when a participant is selected. */
  readonly onSelectParticipant: (participantId: string | undefined) => void;
  /** Callback when an agent name is clicked/activated — opens Agent Control drawer. */
  readonly onOpenAgentControl?: (participantId: string) => void;
  /** Unread counts per participant (keyed by participantId). */
  readonly unreadCounts?: ReadonlyMap<string, number>;
}

// ─── Identity resolution (presentation fallback only) ────────

interface ResolvedIdentity {
  /** Primary human-facing name — never a bare model id. */
  readonly name: string;
  /** True when no authoritative identity exists upstream. */
  readonly unknown: boolean;
  /** Secondary metadata line (model · provider), when available. */
  readonly meta?: string;
}

function resolveIdentity(p: ParticipantProjection): ResolvedIdentity {
  if (p.type === 'human') {
    return { name: p.displayName, unknown: false };
  }
  const idLike = !p.displayName || p.displayName === p.modelId;
  if (!idLike) {
    const meta = [p.modelId, p.providerId].filter((value): value is string => Boolean(value)).map(humanizeIdentifier).join(' · ');
    return { name: p.displayName, unknown: false, meta: meta || undefined };
  }
  const meta = [p.modelId, p.providerId].filter((value): value is string => Boolean(value)).map(humanizeIdentifier).join(' · ');
  return { name: p.modelDisplayName ?? 'Unknown agent', unknown: !p.modelDisplayName, meta: meta || undefined };
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/^agent[-_]/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// ─── Shared presentation classes (canonical tokens only) ─────

const TILE_BASE =
  'ar-participant-avatar grid size-7 shrink-0 place-items-center border font-serif text-sm font-semibold shadow-[var(--vestara-elevation-sm)] [&_svg]:size-[16px]';

// Presence dot on the avatar tile — dynamic canonical color per
// PresenceState (stays in sync with PRESENCE_LABEL / WORK_STATE_TONE).
const PRESENCE_DOT_CLASS: Record<string, string> = {
  online: 'bg-[var(--vestara-status-success)] shadow-[0_0_6px_var(--vestara-status-success)]',
  idle: 'bg-[var(--vestara-status-idle)]',
  offline: 'bg-[var(--vestara-status-disabled)]',
  disconnected: 'bg-[var(--vestara-status-disabled)]',
  // Forward-compat aliases (not authoritative):
  active: 'bg-[var(--vestara-status-success)] shadow-[0_0_6px_var(--vestara-status-success)]',
  busy: 'bg-[var(--vestara-status-warning)]',
  away: 'bg-[var(--vestara-status-idle)]',
};

function participantTypeLabel(type: string): string {
  switch (type) {
    case 'human': return 'Human';
    case 'agent': return 'Agent';
    case 'service':
    case 'system': return 'Service/System';
    case 'external': return 'External';
    default: return 'Participant';
  }
}

const GROUP_LABEL: Record<ParticipantGroupKey, string> = {
  attention: 'Needs attention',
  working: 'Working',
  waiting: 'Waiting',
  idle: 'Idle',
  left: 'Left / offline',
};

type TypeFilter = 'all' | 'human' | 'agent' | 'system';
type StatusFilter = 'all' | ParticipantGroupKey;

function matchesType(p: ParticipantProjection, filter: TypeFilter): boolean {
  if (filter === 'all') return true;
  // String() keeps the comparison total: the wire can carry forward-compat
  // actor types ('service', 'external') outside the ActivityActorType union.
  const type = String(p.type);
  if (filter === 'human') return type === 'human';
  if (filter === 'agent') return type === 'agent';
  return type === 'service' || type === 'system' || type === 'external';
}

/**
 * Display grouping: a stale working claim (active workState, no activity
 * beyond STALE_WORK_MS) surfaces under attention instead of working.
 * Presentation only — the authoritative workState is untouched.
 */
function displayGroupOf(p: ParticipantProjection, now: number): ParticipantGroupKey {
  const base = participantGroupOf(String(p.workState), String(p.membership), String(p.presence));
  if (base === 'working' && isWorkStateStale(String(p.workState), p.lastActivityAt, now)) return 'attention';
  return base;
}

// ─── Component ───────────────────────────────────────────────

function M11CParticipantRail({
  participants,
  selectedParticipantId,
  onSelectParticipant,
  onOpenAgentControl,
  unreadCounts,
}: M11CParticipantRailProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [approvalOnly, setApprovalOnly] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<ParticipantGroupKey>>(new Set());
  // Ticks staleness + relative times (60s cadence is plenty for a roster).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const isFiltered = search.trim() !== '' || typeFilter !== 'all' || statusFilter !== 'all' || approvalOnly;

  const toggleGroup = (group: ParticipantGroupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    return participants.filter((p) => {
      if (!matchesType(p, typeFilter)) return false;
      if (statusFilter !== 'all' && displayGroupOf(p, now) !== statusFilter) {
        return false;
      }
      if (approvalOnly && !p.pendingInteractionId) return false;
      if (searchLower) {
        const id = resolveIdentity(p);
        const haystack = [id.name, p.role ?? '', p.modelDisplayName ?? '', p.modelId ?? '', p.providerId ?? '', p.currentAssignment?.taskTitle ?? '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchLower);
      }
      return true;
    });
  }, [participants, search, typeFilter, statusFilter, approvalOnly, now]);

  const grouped = useMemo(() => {
    const buckets = new Map<ParticipantGroupKey, ParticipantProjection[]>();
    for (const key of PARTICIPANT_GROUP_ORDER) buckets.set(key, []);
    for (const p of filtered) {
      const key = displayGroupOf(p, now);
      buckets.get(key)?.push(p);
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => {
        const at = new Date(a.lastActivityAt).getTime() || 0;
        const bt = new Date(b.lastActivityAt).getTime() || 0;
        if (at !== bt) return bt - at;
        return a.displayName.localeCompare(b.displayName);
      });
    }
    return buckets;
  }, [filtered, now]);

  if (participants.length === 0) {
    return (
      <div className="ar-rail" role="region" aria-label="Participants">
        <p className="ar-kicker">Participants</p>
        <EmptyState title="No participants yet" description="Participants appear here when they join the room." />
      </div>
    );
  }

  const totalCount = participants.length;
  const workingCount = participants.filter((p) => displayGroupOf(p, now) === 'working').length;
  const waitingCount = participants.filter((p) => displayGroupOf(p, now) === 'waiting').length;
  const attentionCount = participants.filter((p) => displayGroupOf(p, now) === 'attention').length;
  const approvalCount = participants.filter((p) => Boolean(p.pendingInteractionId)).length;

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setStatusFilter('all');
    setApprovalOnly(false);
  };

  return (
    <div className="ar-rail" role="region" aria-label="Participants">
      <div className="ar-rail__sticky-head">
        <div className="ar-rail__head">
          <button
            type="button"
            onClick={() => {
              onSelectParticipant(undefined);
              clearFilters();
            }}
            className={`ar-rail__all ${selectedParticipantId === undefined && !isFiltered ? 'ar-rail__all--active' : ''}`}
            aria-pressed={selectedParticipantId === undefined && !isFiltered}
          >
            <span className="ar-rail__all-label">All participants</span>
            <span className="ar-rail__census">
              <strong>{totalCount}</strong> total
              {workingCount > 0 ? <> · <strong>{workingCount}</strong> working</> : null}
              {waitingCount > 0 ? <> · <strong>{waitingCount}</strong> waiting</> : null}
              {attentionCount > 0 ? <> · <strong className="text-[var(--vestara-status-error)]">{attentionCount} need attention</strong></> : null}
              {approvalCount > 0 ? <> · <strong className="text-[var(--vestara-status-warning)]">{approvalCount} awaiting approval</strong></> : null}
            </span>
          </button>
        </div>

        <div className="ar-rail__filters">
          <div className="ar-rail__search">
            <input
              type="text"
              placeholder="Search participants…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ar-rail__search-input"
              aria-label="Search participants"
            />
          </div>
          <label className="ar-rail__type-select">
            <span className="sr-only">Filter participants by type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
              aria-label="Filter participants by type"
            >
              <option value="all">All types</option>
              <option value="human">Humans</option>
              <option value="agent">Agents</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="ar-rail__type-select">
            <span className="sr-only">Filter participants by status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              aria-label="Filter participants by status"
            >
              <option value="all">All statuses</option>
              <option value="attention">Needs attention</option>
              <option value="working">Working</option>
              <option value="waiting">Waiting</option>
              <option value="idle">Idle</option>
              <option value="left">Left / offline</option>
            </select>
          </label>
        </div>
        {approvalCount > 0 && (
          <button
            type="button"
            onClick={() => setApprovalOnly((v) => !v)}
            aria-pressed={approvalOnly}
            title={approvalOnly ? 'Show all participants' : 'Show only participants awaiting approval'}
            className={`ar-rail__approval ${approvalOnly ? 'ar-rail__approval--active' : ''}`}
          >
            <span className="ar-badge ar-badge--warning">
              Awaiting approval · {approvalCount}
            </span>
            <span className="ar-rail__approval-hint">{approvalOnly ? 'tap to clear' : 'tap to isolate'}</span>
          </button>
        )}
      </div>

      <div className="ar-rail__list" role="list">
        {filtered.length === 0 ? (
          <EmptyState title="No matching participants" description="Adjust the search or filters." />
        ) : (
          PARTICIPANT_GROUP_ORDER.map((group) => {
            const members = grouped.get(group) ?? [];
            if (members.length === 0) return null;
            const collapsed = collapsedGroups.has(group);
            return (
              <div key={group}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={!collapsed}
                  aria-label={`${GROUP_LABEL[group]}: ${members.length}${collapsed ? ', collapsed' : ', expanded'}`}
                  title={collapsed ? `Expand ${GROUP_LABEL[group]}` : `Collapse ${GROUP_LABEL[group]}`}
                  className="ar-rail__group"
                >
                  <span aria-hidden="true" className={`ar-rail__group-chevron ${collapsed ? 'ar-rail__group-chevron--collapsed' : ''}`}>›</span>
                  {GROUP_LABEL[group]} · {members.length}
                </button>
                {!collapsed && (
                  <div className="flex flex-col gap-1">
                    {members.map((participant) => (
                    <ParticipantRow
                      key={participant.participantId}
                      participant={participant}
                      selected={selectedParticipantId === participant.participantId}
                      onSelect={onSelectParticipant}
                      onOpenAgentControl={onOpenAgentControl}
                      unreadCount={unreadCounts?.get(participant.participantId) ?? 0}
                      now={now}
                    />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {isFiltered && (
        <div className="ar-rail__filter-status">
          <span>{filtered.length} of {participants.length}</span>
          <button type="button" onClick={clearFilters} className="ar-rail__filter-clear">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Participant Row ─────────────────────────────────────────

const ParticipantRow = memo(function ParticipantRow({
  participant,
  selected,
  onSelect,
  onOpenAgentControl,
  unreadCount = 0,
  now,
}: {
  participant: ParticipantProjection;
  selected: boolean;
  onSelect: (id: string | undefined) => void;
  onOpenAgentControl?: (participantId: string) => void;
  unreadCount?: number;
  now: number;
}) {
  const isHuman = participant.type === 'human';
  const canOpenDrawer = !isHuman && onOpenAgentControl;
  const identity = resolveIdentity(participant);
  const initial = identity.unknown ? '?' : (identity.name.trim()[0] ?? '?').toUpperCase();

  const work = WORK_STATE_CONFIG[String(participant.workState)];
  const presenceLabel = PRESENCE_LABEL[String(participant.presence)] ?? String(participant.presence);
  const presenceDotClass = PRESENCE_DOT_CLASS[String(participant.presence)] ?? 'bg-[var(--vestara-status-disabled)]';
  // Model takes the primary metadata slot (replaces role); role stays searchable.
  // Provider is intentionally not displayed — model + task carry the row.
  const modelLabel = participant.modelDisplayName ?? (participant.modelId ? humanizeIdentifier(participant.modelId) : undefined);
  const membershipLabel = MEMBERSHIP_LABEL[String(participant.membership)] ?? '';
  const awaitingApproval = Boolean(participant.pendingInteractionId);
  const hasLeft = String(participant.membership) === 'left';
  const relativeTime = formatRelative(participant.lastActivityAt);
  // Dim rows that can no longer act: left, offline, or disconnected.
  const dimmed =
    hasLeft || String(participant.presence) === 'offline' || String(participant.presence) === 'disconnected';

  // Badge tone mirrors the work lamp so pills and lamps never disagree.
  // Tile keeps actor TYPE color; status color lives on badges only.
  // A stale working claim renders as a warning "Working · stale" pill —
  // presentation only, the authoritative workState is untouched.
  const staleWork = isWorkStateStale(String(participant.workState), participant.lastActivityAt, now);
  const workTone = staleWork ? 'warning' : (WORK_STATE_TONE[String(participant.workState)] ?? 'neutral');

  return (
    <div
      role="listitem"
      className={`ar-guest group flex w-full min-w-0 items-center gap-2 rounded-[var(--vestara-radius-lg)] border px-2.5 py-2.5 text-left transition-all duration-200 ${dimmed ? 'opacity-60' : ''} ${selected ? 'ar-guest--selected border-[var(--vestara-accent-border)] bg-[linear-gradient(90deg,var(--vestara-accent-bg),transparent_75%),var(--vestara-surface-panel-raised)] shadow-[inset_3px_0_0_var(--vestara-accent),0_6px_20px_-8px_var(--vestara-accent-bg)]' : 'border-transparent hover:border-[var(--vestara-border-subtle)] hover:bg-[var(--vestara-surface-panel-raised)] hover:shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)]'}`}
    >
      <button
        type="button"
        onClick={() => onSelect(selected ? undefined : participant.participantId)}
        aria-pressed={selected}
        aria-label={`${identity.name}, ${participantTypeLabel(participant.type)}, ${presenceLabel}${work ? `, ${work.label}` : ''}${staleWork ? ', stale' : ''}${awaitingApproval ? ', awaiting approval' : ''}${selected ? ', selected' : ''}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--vestara-radius)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
      >
        <span
          className="relative shrink-0"
          aria-hidden="true"
          title={`${participantTypeLabel(participant.type)} · ${presenceLabel}`}
        >
          <span className={`${TILE_BASE} ar-participant-type--${identity.unknown ? 'unknown' : participant.type}`}>
            {initial}
          </span>
          <span className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[var(--vestara-surface-canvas)] ${presenceDotClass}`} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="flex min-w-0 flex-1 items-center gap-x-1.5 overflow-hidden whitespace-nowrap">
              <span className="min-w-0 shrink truncate text-sm font-semibold tracking-[-0.01em] text-[var(--vestara-text)]">
                {identity.name}
              </span>
              {modelLabel && (
                <span
                  className="min-w-0 flex-1 truncate text-[11px] font-normal text-[var(--vestara-text-muted)]"
                  title={participant.modelId ? `Model: ${participant.modelId}${participant.providerId ? ` · ${participant.providerId}` : ''}` : undefined}
                >
                  · {modelLabel}
                </span>
              )}
            </span>
            {awaitingApproval && (
              <span className="ar-badge ar-badge--warning" title="Waiting on a human decision">
                <StatusIndicator variant="warn" size="xs" pulse aria-hidden />
                Awaiting approval
              </span>
            )}
            {unreadCount > 0 && (
              <span
                className="rounded-[var(--vestara-radius-full)] bg-[linear-gradient(135deg,var(--vestara-accent-light),var(--vestara-accent)_60%,var(--vestara-accent-dark))] px-1.5 py-px text-[10px] font-bold tabular-nums text-[var(--color-zinc-950)] shadow-[0_2px_10px_var(--vestara-accent-bg)]"
                aria-label={`${unreadCount} unread`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            {membershipLabel && (
              <span className={`ar-badge ${hasLeft ? 'ar-badge--neutral' : 'ar-badge--info'}`}>
                {membershipLabel}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-x-2 overflow-hidden whitespace-nowrap text-[11px] text-[var(--vestara-text-muted)]">
            {work && (
              <span
                title={staleWork ? `No activity since ${formatRelative(participant.lastActivityAt)} — the run may have ended without reporting completion` : work.label}
                className={`ar-badge ar-badge--${workTone}`}
              >
                <StatusIndicator
                  variant={staleWork ? 'warn' : work.variant}
                  size="xs"
                  pulse={String(participant.workState) === 'working' && !staleWork}
                  aria-hidden
                />
                {staleWork ? `${work.label} · stale` : work.label}
              </span>
            )}
            {participant.currentAssignment?.taskTitle && (
              <span className="min-w-0 flex-1 truncate text-[var(--vestara-text-dim)]" title={participant.currentAssignment.taskTitle}>
                {participant.currentAssignment.taskTitle}
              </span>
            )}
            {relativeTime && (
              <span className="ml-auto shrink-0 tabular-nums text-[var(--vestara-text-dim)]" title={participant.lastActivityAt}>
                {relativeTime}
              </span>
            )}
          </span>
        </span>
      </button>
      {canOpenDrawer && (
        <button
          type="button"
          onClick={() => onOpenAgentControl!(participant.participantId)}
          aria-label={`Open agent control for ${identity.name}`}
          title={`Open agent control for ${identity.name}`}
          className="grid size-9 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-transparent text-lg text-[var(--vestara-text-dim)] transition-colors hover:border-[var(--vestara-border-subtle)] hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
        >
          <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
});

export default memo(M11CParticipantRail);
