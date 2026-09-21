/**
 * M11C Projection-Driven Participant Panel (VES-DESIGN-008C presentation)
 *
 * Renders participants from M10 ParticipantProjection (via M11A API).
 * Zero hardcoded teams, roles, or model names. Activity Room is a generic
 * consumer of participant/team information — it does not define teams.
 *
 * Identity honesty (008C audit — presentation only, never new authority):
 * - displayName is authoritative PER CONTRACT, but for unnamed agents it
 *   carries the stable agent/model id (e.g. "mimo-v2.5-free"), which must
 *   not masquerade as a chosen actor name.
 * - Rule: displayName that merely echoes modelId is demoted to secondary
 *   metadata; the primary becomes modelDisplayName (the contract-sanctioned
 *   presentation fallback) or "Unknown agent".
 * - FIRST BROKEN BOUNDARY (recorded, not repaired here): upstream adapters
 *   emit model ids as actor.displayName (M9 adapter/agent contracts); M10
 *   passes them through. A future semantic milestone must establish chosen
 *   agent identity upstream. M11C must not invent it.
 *
 * Presence honesty: M10 never resolves presence today (uniform 'offline'
 * default — "resolved independently" path is unwired). Presence lamps render
 * ONLY for positively-resolved states (online/active/busy/away); otherwise
 * presence is omitted, never inferred from workState. Work state renders
 * from WORK_STATE_CONFIG; the M10 resting value 'available' (absent from
 * the config) carries no information and renders no claim.
 *
 * Humans and agents share the same component contract.
 */

import type { ParticipantProjection } from '@vestara/activity-room';
import { EmptyState, StatusIndicator } from '@vestara/ui';
import { memo, useMemo, useState } from 'react';
import { WORK_STATE_CONFIG, PRESENCE_VARIANT_CONFIG } from './status-config';

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

/** Presence states that constitute a positively-resolved claim. Compared as
    strings: today's PresenceState union cannot express them, which is
    exactly why presence must stay omitted until the contract grows. */
function resolvedPresence(p: ParticipantProjection): string | null {
  const presence: string = p.presence;
  return presence === 'online' || presence === 'active' || presence === 'busy' || presence === 'away' ? presence : null;
}

// ─── Membership ──────────────────────────────────────────────

const MEMBERSHIP_LABEL: Record<string, string> = {
  member: '',
  observer: 'Observer',
  guest: 'Guest',
};

function humanizeIdentifier(value: string): string {
  return value
    .replace(/^agent[-_]/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// ─── Shared presentation classes (canonical tokens only) ─────

const TILE_BASE =
  'grid size-7 shrink-0 place-items-center rounded-[var(--vestara-radius-full)] border font-serif text-sm font-semibold shadow-[var(--vestara-elevation-sm)] [&_svg]:size-[16px]';

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

// ─── Component ───────────────────────────────────────────────

function M11CParticipantRail({
  participants,
  selectedParticipantId,
  onSelectParticipant,
  onOpenAgentControl,
  unreadCounts,
}: M11CParticipantRailProps) {
  // ─── Search and type filter state ─────────────────────────
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'human' | 'agent'>('all');

  // ─── Filtered participants ────────────────────────────────
  // Model/provider stay searchable (secondary recall) but are never
  // primary visual identity.
  const filtered = useMemo(() => {
    const hasFilter = search.trim() !== '' || typeFilter !== 'all';
    if (!hasFilter) return null; // null = use normal grouped presentation

    const searchLower = search.toLowerCase().trim();
    return participants.filter((p) => {
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (searchLower) {
        const id = resolveIdentity(p);
        const haystack = [id.name, p.role ?? '', p.modelDisplayName ?? '', p.modelId ?? '', p.providerId ?? '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchLower);
      }
      return true;
    });
  }, [participants, search, typeFilter]);

  // ─── Normal grouped presentation ──────────────────────────
  const grouped = useMemo(() => {
    if (filtered !== null) return filtered; // filtered mode
    // Scan-first: work state severity dominates (presence is UNKNOWN
    // upstream), then recency, then name. Blocked/needs-attention pin top.
    const workRank = (ws: string): number => {
      if (ws === 'blocked' || ws === 'attention-required') return 0;
      if (ws === 'working') return 1;
      if (ws === 'waiting') return 2;
      if (ws === 'failed') return 3;
      return 4;
    };
    return [...participants].sort((a, b) => {
      const rank = workRank(a.workState) - workRank(b.workState);
      if (rank !== 0) return rank;
      const at = new Date(a.lastActivityAt).getTime() || 0;
      const bt = new Date(b.lastActivityAt).getTime() || 0;
      if (at !== bt) return bt - at;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [participants, filtered]);

  if (participants.length === 0) {
    return (
      <div className="ar-rail" role="region" aria-label="Participants">
        <p className="ar-kicker">Participants</p>
        <EmptyState title="No participants yet" description="Participants appear here when they join the room." />
      </div>
    );
  }

  // Counts from authoritative workState, not from presence (UNKNOWN).
  // "total" counts projections; "at work" counts working; blocked and
  // attention-required split out so they scan instead of hiding in a sum.
  const activeCount = participants.filter((p) => p.workState === 'working').length;
  const blockedCount = participants.filter(
    (p) => p.workState === 'blocked' || p.workState === 'attention-required',
  ).length;
  const totalCount = participants.length;
  const isFiltered = filtered !== null;

  return (
    <div className="ar-rail" role="region" aria-label="Participants">
      <div className="ar-rail__sticky-head">
        <div className="ar-rail__head">
        <p className="ar-kicker">Participants</p>
        <button
          type="button"
          onClick={() => {
            onSelectParticipant(undefined);
            setSearch('');
            setTypeFilter('all');
          }}
          className={`ar-rail__all ${selectedParticipantId === undefined && !isFiltered ? 'ar-rail__all--active' : ''}`}
          aria-pressed={selectedParticipantId === undefined && !isFiltered}
        >
          <span className="ar-rail__all-label">Everyone</span>
          <span className="ar-rail__census">
            <strong>{totalCount}</strong> total{activeCount > 0 ? <> · <strong>{activeCount}</strong> at work</> : ''}{blockedCount > 0 ? <> · <strong className="text-[var(--vestara-status-error)]">{blockedCount} blocked</strong></> : ''}
          </span>
        </button>
        {/* Panel-level staleness honesty (AR-LIVE-001): roster and work
            state arrive with the snapshot and refresh on reconnect.
            No per-row repetition. No presence is shown: no presence
            authority exists. */}
        <p className="ar-rail__freshness">Snapshot roster · refreshes on reconnect · no presence tracking</p>
        </div>

        {/* ── Search + Type Filter ──────────────────────────── */}
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
              onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
              aria-label="Filter participants by type"
            >
              <option value="all">All participants</option>
              <option value="human">Humans</option>
              <option value="agent">Agents</option>
            </select>
          </label>
        </div>
      </div>

      {/* ── Participant list ─────────────────────────────────
          Page owns scrolling (008A finding): no nested rail scrollbar. */}
      <div className="ar-rail__list" role="list">
        {grouped.length === 0 ? (
          <EmptyState title="No matching participants" description="Adjust the search or type filter." />
        ) : (
          grouped.map((participant) => (
            <ParticipantRow
              key={participant.participantId}
              participant={participant}
              selected={selectedParticipantId === participant.participantId}
              onSelect={onSelectParticipant}
              onOpenAgentControl={onOpenAgentControl}
              unreadCount={unreadCounts?.get(participant.participantId) ?? 0}
            />
          ))
        )}
      </div>

      {/* ── Filter status ─────────────────────────────────── */}
      {isFiltered && (
        <div className="ar-rail__filter-status">
          <span>{grouped.length} of {participants.length}</span>
          <button
            type="button"
            onClick={() => { setSearch(''); setTypeFilter('all'); }}
            className="ar-rail__filter-clear"
          >
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
}: {
  participant: ParticipantProjection;
  selected: boolean;
  onSelect: (id: string | undefined) => void;
  onOpenAgentControl?: (participantId: string) => void;
  unreadCount?: number;
}) {
  const isHuman = participant.type === 'human';
  const canOpenDrawer = !isHuman && onOpenAgentControl;
  const identity = resolveIdentity(participant);
  const initial = identity.unknown ? '?' : (identity.name.trim()[0] ?? '?').toUpperCase();

  // Work state from the contract config only. The M10 resting value
  // 'available' is intentionally absent from the config: it carries no
  // information and renders no claim (never a presence word).
  const work = WORK_STATE_CONFIG[participant.workState];
  const presence = resolvedPresence(participant);
  const membershipLabel = MEMBERSHIP_LABEL[participant.membership] ?? '';
  // Task title is content/context from the current assignment — never an
  // activity-state authority. It renders as plain truncated text without
  // the work-state lamp, even when a work lamp is also shown.

  // Tile tone decorates actor TYPE only — never status, presence, or health.
  // Blocked/needs-attention must scan from the tertiary line: semibold in
  // the error/warning token instead of the default muted 11px.
  const urgentWork = participant.workState === 'blocked' || participant.workState === 'attention-required';

  return (
    <div
      role="listitem"
      className={`ar-guest group flex w-full min-w-0 items-center gap-2 rounded-[var(--vestara-radius-lg)] border px-2.5 py-2.5 text-left transition-all duration-200 ${selected ? 'ar-guest--selected border-[var(--vestara-accent-border)] bg-[linear-gradient(90deg,var(--vestara-accent-bg),transparent_75%),var(--vestara-surface-panel-raised)] shadow-[inset_3px_0_0_var(--vestara-accent),0_6px_20px_-8px_var(--vestara-accent-bg)]' : 'border-transparent hover:border-[var(--vestara-border-subtle)] hover:bg-[var(--vestara-surface-panel-raised)] hover:shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)]'}`}
    >
      <button
        type="button"
        onClick={() => onSelect(selected ? undefined : participant.participantId)}
        aria-pressed={selected}
        aria-label={`${identity.name}, ${participantTypeLabel(participant.type)}${work ? `, ${work.label}` : ''}${selected ? ', selected' : ''}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--vestara-radius)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
      >
        {/* Actor-type tile (type only — never status) */}
        <span
          aria-hidden="true"
          className={`${TILE_BASE} ar-participant-type--${identity.unknown ? 'unknown' : participant.type}`}
          title={participantTypeLabel(participant.type)}
        >
          {initial}
        </span>

        <span className="min-w-0 flex-1">
          {/* Primary identity + unread */}
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--vestara-text)]">
              {identity.name}
            </span>
            {unreadCount > 0 && (
              <span
                className="rounded-[var(--vestara-radius-full)] bg-[linear-gradient(135deg,var(--vestara-accent-light),var(--vestara-accent)_60%,var(--vestara-accent-dark))] px-1.5 py-px text-[10px] font-bold tabular-nums text-[var(--color-zinc-950)] shadow-[0_2px_10px_var(--vestara-accent-bg)]"
                aria-label={`${unreadCount} unread`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </span>
          {/* Secondary: model · provider (metadata, never identity) */}
          {identity.meta && (
            <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--vestara-text-muted)]">
              {identity.meta}
            </span>
          )}
          {/* Tertiary: work state (authoritative) + assignment + membership */}
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--vestara-text-muted)]">
            {presence && (
              <span className="inline-flex items-center gap-1 capitalize">
                <StatusIndicator variant={PRESENCE_VARIANT_CONFIG[presence] ?? 'idle'} size="xs" pulse={false} aria-hidden />
                {humanizeIdentifier(presence)}
              </span>
            )}
            {work && (
              <span
                className={`inline-flex items-center gap-1 ${urgentWork ? 'font-semibold text-[var(--vestara-status-error)]' : ''}`}
              >
                <StatusIndicator variant={work.variant} size="xs" pulse={participant.workState === 'working'} aria-hidden />
                {work.label}
              </span>
            )}
            {participant.currentAssignment?.taskTitle && (
              <span className="max-w-32 truncate" title={participant.currentAssignment.taskTitle}>
                {participant.currentAssignment.taskTitle}
              </span>
            )}
            {membershipLabel && <span>{membershipLabel}</span>}
          </span>
        </span>
      </button>
      {canOpenDrawer && (
        <button
          type="button"
          onClick={() => onOpenAgentControl!(participant.participantId)}
          aria-label={`Open agent control for ${identity.name}`}
          title={`Open agent control for ${identity.name}`}
          className="grid size-8 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-transparent text-[var(--vestara-text-dim)] transition-colors hover:border-[var(--vestara-border-subtle)] hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
        >
          <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
});

export default memo(M11CParticipantRail);
