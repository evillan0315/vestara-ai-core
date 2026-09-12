/**
 * M11C Projection-Driven Participant Panel
 *
 * Renders participants from M10 ParticipantProjection (via M11A API).
 * Zero hardcoded teams, roles, or model names. Activity Room is a generic
 * consumer of participant/team information — it does not define teams.
 *
 * Presentation fallback: `modelDisplayName ?? displayName` for unnamed
 * AI participants. Canonical identity is never mutated.
 *
 * Humans and agents share the same component contract.
 *
 * Premium UX: adds search and type filter while preserving team grouping.
 * When search/filter is active, global search across participants with
 * prioritized matching over team hierarchy. Normal grouped presentation
 * restores when search/filter clears.
 */

import type { ParticipantProjection } from '@vestara/activity-room';
import { Badge, StatusIndicator } from '@vestara/ui';
import { memo, useMemo, useState } from 'react';
import { PRESENCE_VARIANT_CONFIG, WORK_STATE_CONFIG } from './status-config';

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

// ─── Visual Config ───────────────────────────────────────────

const MEMBERSHIP_LABEL: Record<string, string> = {
  member: '',
  observer: 'Observer',
  guest: 'Guest',
};

// ─── Component ───────────────────────────────────────────────

export default function M11CParticipantRail({
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
  // When search/filter is active, global search across participants
  // with prioritized matching over team hierarchy.
  const filtered = useMemo(() => {
    const hasFilter = search.trim() !== '' || typeFilter !== 'all';
    if (!hasFilter) return null; // null = use normal grouped presentation

    const searchLower = search.toLowerCase().trim();
    return participants.filter((p) => {
      // Type filter
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      // Search filter
      if (searchLower) {
        const name = (p.modelDisplayName ?? p.displayName).toLowerCase();
        const role = (p.role ?? '').toLowerCase();
        return name.includes(searchLower) || role.includes(searchLower);
      }
      return true;
    });
  }, [participants, search, typeFilter]);

  // ─── Normal grouped presentation ──────────────────────────
  const grouped = useMemo(() => {
    if (filtered !== null) return filtered; // filtered mode
    // Default: sort by presence (online first), then by name
    return [...participants].sort((a, b) => {
      const presenceOrder: Record<string, number> = { online: 0, active: 0, busy: 1, away: 2, offline: 3 };
      const aOrder = presenceOrder[a.presence] ?? 4;
      const bOrder = presenceOrder[b.presence] ?? 4;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [participants, filtered]);

  if (participants.length === 0) {
    return (
      <div className="ar-rail">
        <div className="ar-rail__head">
          <div className="ar-kicker">In attendance</div>
          <div className="ar-rail__all-label">Participants</div>
        </div>
        <div className="ar-rail__empty">No participants yet.</div>
      </div>
    );
  }

  // Derive counts from authoritative workState, not from presence (which is UNKNOWN).
  const activeCount = participants.filter((p) => p.workState === 'working' || p.workState === 'blocked' || p.workState === 'attention-required').length;
  const totalCount = participants.length;
  const isFiltered = filtered !== null;

  return (
    <div className="ar-rail" role="region" aria-label="Participants">
      <div className="ar-rail__head">
        <div className="ar-kicker">In attendance</div>
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
          <span className="ar-rail__all-label">Participants</span>
          <span className="ar-rail__census">
            <strong>{totalCount}</strong> total{activeCount > 0 ? <> · <strong>{activeCount}</strong> at work</> : ''}
          </span>
        </button>
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
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | 'human' | 'agent')}
          className="ar-rail__type-filter"
          aria-label="Filter by type"
        >
          <option value="all">All Types</option>
          <option value="agent">Agent</option>
          <option value="human">Human</option>
        </select>
      </div>

      {/* ── Participant list ──────────────────────────────── */}
      <div className="ar-rail__list ar-scroll" role="list">
        {grouped.length === 0 ? (
          <div className="ar-rail__empty">No matching participants.</div>
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
  unreadCount,
}: {
  participant: ParticipantProjection;
  selected: boolean;
  onSelect: (id: string | undefined) => void;
  onOpenAgentControl?: (participantId: string) => void;
  unreadCount?: number;
}) {
  const presenceVariant = PRESENCE_VARIANT_CONFIG[participant.presence] ?? 'off';
  const workLabel = WORK_STATE_CONFIG[participant.workState]?.label ?? participant.workState;
  const membershipLabel = MEMBERSHIP_LABEL[participant.membership] ?? '';
  const isHuman = participant.type === 'human';
  const canOpenDrawer = !isHuman && onOpenAgentControl;

  // Primary identity: always use canonical displayName (agent name for agents, user name for humans).
  // modelDisplayName is secondary metadata shown below the name.
  const presentationName = participant.displayName;

  const initial = (presentationName.trim()[0] ?? '?').toUpperCase();

  const handleNameClick = (e: React.MouseEvent) => {
    if (!canOpenDrawer) return;
    e.stopPropagation();
    onOpenAgentControl!(participant.participantId);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (!canOpenDrawer) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onOpenAgentControl!(participant.participantId);
    }
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(selected ? undefined : participant.participantId)}
      className={`ar-guest ${selected ? 'ar-guest--selected' : ''}`}
      aria-pressed={selected}
    >
      {/* Insignia */}
      <span className={`ar-medallion ${isHuman ? 'ar-medallion--human' : 'ar-medallion--agent'}`} aria-hidden="true">
        {initial}
      </span>

      <span className="ar-guest__body">
        <span className="ar-guest__top">
          {/* Display name — clickable for agents to open Agent Control drawer */}
          <span
            className={`ar-guest__name ${canOpenDrawer ? 'ar-guest__name--agent-action' : ''}`}
            role={canOpenDrawer ? 'button' : undefined}
            tabIndex={canOpenDrawer ? 0 : undefined}
            aria-label={canOpenDrawer ? `Open agent control for ${participant.displayName}` : undefined}
            onClick={canOpenDrawer ? handleNameClick : undefined}
            onKeyDown={canOpenDrawer ? handleNameKeyDown : undefined}
          >
            {presentationName}
          </span>
          {/* Model as secondary metadata — subtle, not dominant */}
          {!isHuman && participant.modelDisplayName && (
            <span className="ar-guest__model">{participant.modelDisplayName}</span>
          )}
          {/* Type badge — metadata, not conversational identity */}
          <Badge variant={isHuman ? 'info' : 'default'} size="sm">
            {isHuman ? 'Human' : 'Agent'}
          </Badge>
          {/* Role badge — metadata */}
          {!isHuman && participant.role && (
            <Badge variant="default" size="sm" className="!text-[9px]">{participant.role}</Badge>
          )}
          {/* Unread badge */}
          {unreadCount > 0 && (
            <span className="ar-guest__unread">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </span>
        <span className="ar-guest__sub">
          {/* Presence indicator */}
          <StatusIndicator
            variant={presenceVariant}
            size="xs"
            pulse={participant.presence === 'online' || participant.presence === 'active'}
            ariaLabel={`Presence: ${participant.presence}`}
          />
          <span>{workLabel}</span>
          {membershipLabel && <span className="ar-guest__membership">{membershipLabel}</span>}
        </span>

        {/* Current assignment */}
        {participant.currentAssignment && (
          <span className="ar-guest__task">
            {participant.currentAssignment.taskTitle ?? participant.currentAssignment.taskId}
          </span>
        )}
      </span>
    </button>
  );
});
