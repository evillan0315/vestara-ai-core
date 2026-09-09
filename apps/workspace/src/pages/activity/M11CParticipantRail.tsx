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
 */

import type { ParticipantProjection } from '@vestara/activity-room';
import { useMemo } from 'react';

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
}

// ─── Visual Config ───────────────────────────────────────────

const PRESENCE_LAMP: Record<string, string> = {
  online: 'ar-lamp ar-lamp--live',
  active: 'ar-lamp ar-lamp--live',
  busy: 'ar-lamp ar-lamp--warn',
  away: 'ar-lamp ar-lamp--dim',
  offline: 'ar-lamp ar-lamp--dim',
};

const WORK_STATE_LABEL: Record<string, string> = {
  idle: 'Idle',
  working: 'Working',
  blocked: 'Blocked',
  waiting: 'Waiting',
  completed: 'Completed',
  failed: 'Failed',
};

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
}: M11CParticipantRailProps) {
  // Group by membership, then sort by presence (online first), then by name
  const grouped = useMemo(() => {
    const sorted = [...participants].sort((a, b) => {
      // Presence order: online > busy > away > offline
      const presenceOrder: Record<string, number> = { online: 0, active: 0, busy: 1, away: 2, offline: 3 };
      const aOrder = presenceOrder[a.presence] ?? 4;
      const bOrder = presenceOrder[b.presence] ?? 4;
      if (aOrder !== bOrder) return aOrder - bOrder;
      // Then by name
      return a.displayName.localeCompare(b.displayName);
    });
    return sorted;
  }, [participants]);

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

  const activeCount = participants.filter((p) => p.presence === 'online' || p.presence === 'active').length;
  const workingCount = participants.filter((p) => p.workState === 'working').length;

  return (
    <div className="ar-rail">
      <div className="ar-rail__head">
        <div className="ar-kicker">In attendance</div>
        <button
          type="button"
          onClick={() => onSelectParticipant(undefined)}
          className={`ar-rail__all ${selectedParticipantId === undefined ? 'ar-rail__all--active' : ''}`}
          aria-pressed={selectedParticipantId === undefined}
        >
          <span className="ar-rail__all-label">Participants</span>
          <span className="ar-rail__census">
            <strong>{activeCount}</strong> present{workingCount > 0 ? <> · <strong>{workingCount}</strong> at work</> : ''}
          </span>
        </button>
      </div>

      <div className="ar-rail__list ar-scroll">
        {grouped.map((participant) => (
          <ParticipantRow
            key={participant.participantId}
            participant={participant}
            selected={selectedParticipantId === participant.participantId}
            onSelect={onSelectParticipant}
            onOpenAgentControl={onOpenAgentControl}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Participant Row ─────────────────────────────────────────

function ParticipantRow({
  participant,
  selected,
  onSelect,
  onOpenAgentControl,
}: {
  participant: ParticipantProjection;
  selected: boolean;
  onSelect: (id: string | undefined) => void;
  onOpenAgentControl?: (participantId: string) => void;
}) {
  const lamp = PRESENCE_LAMP[participant.presence] ?? 'ar-lamp ar-lamp--dim';
  const workLabel = WORK_STATE_LABEL[participant.workState] ?? participant.workState;
  const membershipLabel = MEMBERSHIP_LABEL[participant.membership] ?? '';
  const isHuman = participant.type === 'human';
  const canOpenDrawer = !isHuman && onOpenAgentControl;

  // Presentation fallback: modelDisplayName for unnamed AI participants,
  // canonical displayName for humans and named agents.
  const presentationName = !isHuman && participant.modelDisplayName
    ? participant.modelDisplayName
    : participant.displayName;

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
          {/* Type badge — metadata, not conversational identity */}
          <span className={`ar-guest__badge ${isHuman ? 'ar-guest__badge--human' : 'ar-guest__badge--agent'}`}>
            {isHuman ? 'Human' : 'Agent'}
          </span>
          {/* Role badge — metadata */}
          {!isHuman && participant.role && (
            <span className="ar-guest__role">{participant.role}</span>
          )}
        </span>
        <span className="ar-guest__sub">
          {/* Presence lamp */}
          <span className={lamp} aria-hidden="true" />
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
}
