/**
 * M11C Projection-Driven Participant Rail
 *
 * Renders participants from M10 ParticipantProjection (via M11A API).
 * Zero hardcoded participants. Membership, presence, and work state
 * are displayed independently.
 *
 * Humans and agents share the same component contract.
 */

import type { ParticipantProjection } from '@vestara/types';
import { useMemo } from 'react';

// ─── Types ───────────────────────────────────────────────────

interface M11CParticipantRailProps {
  /** Projection-driven participants — never hardcoded. */
  readonly participants: readonly ParticipantProjection[];
  /** Currently selected participant (for stream filtering). */
  readonly selectedParticipantId: string | undefined;
  /** Callback when a participant is selected. */
  readonly onSelectParticipant: (participantId: string | undefined) => void;
}

// ─── Visual Config ───────────────────────────────────────────

const PRESENCE_DOT: Record<string, string> = {
  online: 'bg-(--vestara-green)',
  active: 'bg-(--vestara-green)',
  busy: 'bg-(--vestara-amber)',
  away: 'bg-(--vestara-text-muted)',
  offline: 'bg-(--vestara-text-dim)',
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
      <div className="flex h-full flex-col gap-3">
        <div className="px-1 sm:px-3">
          <div className="w-full px-3 py-2 text-left text-xs font-medium text-(--vestara-text-2)">
            Participants
          </div>
        </div>
        <div className="min-h-0 flex-1 px-3">
          <p className="text-[10px] text-(--vestara-text-muted)">No participants yet.</p>
        </div>
      </div>
    );
  }

  const activeCount = participants.filter((p) => p.presence === 'online' || p.presence === 'active').length;
  const workingCount = participants.filter((p) => p.workState === 'working').length;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="px-1 sm:px-3">
        <button
          type="button"
          onClick={() => onSelectParticipant(undefined)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left cursor-pointer transition-colors ${
            selectedParticipantId === undefined
              ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border)'
              : 'bg-transparent border-transparent hover:bg-(--vestara-accent-bg)'
          }`}
        >
          <span className="text-xs font-medium text-(--vestara-text-2)">Participants</span>
          <span className="text-[10px] text-(--vestara-text-muted)">
            {activeCount} online{workingCount > 0 ? ` · ${workingCount} working` : ''}
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
        {grouped.map((participant) => (
          <ParticipantRow
            key={participant.participantId}
            participant={participant}
            selected={selectedParticipantId === participant.participantId}
            onSelect={onSelectParticipant}
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
}: {
  participant: ParticipantProjection;
  selected: boolean;
  onSelect: (id: string | undefined) => void;
}) {
  const dotColor = PRESENCE_DOT[participant.presence] ?? 'bg-(--vestara-text-dim)';
  const workLabel = WORK_STATE_LABEL[participant.workState] ?? participant.workState;
  const membershipLabel = MEMBERSHIP_LABEL[participant.membership] ?? '';
  const isHuman = participant.type === 'human';

  return (
    <button
      type="button"
      onClick={() => onSelect(selected ? undefined : participant.participantId)}
      className={`w-full px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
        selected
          ? 'border-(--vestara-accent) bg-(--vestara-accent-bg)'
          : 'border-transparent hover:bg-(--vestara-accent-bg)'
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {/* Presence dot */}
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
          {/* Name */}
          <span className="text-xs font-medium text-(--vestara-text-2) truncate">
            {participant.displayName}
          </span>
          {/* Type badge (human/agent) */}
          <span
            className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-medium uppercase ${
              isHuman
                ? 'bg-(--vestara-blue)/10 text-(--vestara-blue)'
                : 'bg-(--vestara-violet)/10 text-(--vestara-violet)'
            }`}
          >
            {isHuman ? 'Human' : 'Agent'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {membershipLabel && (
            <span className="text-[9px] text-(--vestara-text-dim)">{membershipLabel}</span>
          )}
          <span className="text-[10px] text-(--vestara-text-muted)">{workLabel}</span>
        </div>
      </div>

      {/* Current assignment */}
      {participant.currentAssignment && (
        <div className="mt-1 text-[9px] text-(--vestara-text-dim) truncate">
          {participant.currentAssignment.taskTitle ?? participant.currentAssignment.taskId}
        </div>
      )}
    </button>
  );
}
