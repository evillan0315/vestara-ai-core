/**
 * M11C Live Now Strip
 *
 * A thin narrative strip (48–64px) showing per-participant live output
 * with pulsing green indicators. Sits atop the activity stream in the
 * stream-main column.
 *
 * Design spec: activity-room-visual-design-spec.md §2.5
 *   - Target height: 56px, bounds 48–64px
 *   - Renders per-participant live output (role, "Live" badge, trailing narrative)
 *   - Pulsing green marker for active participants
 *   - At <768px collapses to a single truncated line
 *
 * Authority: derives from M11CParticipantProjection presence + stream items.
 * No state mutation — pure projection.
 */

import { useMemo } from 'react';
import type { ParticipantProjection } from '@vestara/activity-room';
import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';
import { StatusIndicator } from '@vestara/ui';

// ─── Types ───────────────────────────────────────────────────

interface LiveNowStripProps {
  /** All participants from the room projection. */
  readonly participants: readonly ParticipantProjection[];
  /** Recent stream items (last N) to derive live narrative. */
  readonly stream: readonly M11CStreamItem[];
  /** Whether the room is connected and live. */
  readonly isLive: boolean;
}

interface LiveParticipant {
  readonly participantId: string;
  readonly displayName: string;
  readonly role: string | undefined;
  readonly presence: string;
  readonly workState: string;
  readonly latestContent: string;
  readonly latestTimestamp: string;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Derive the latest narrative text for a participant from recent stream items. */
function deriveLatestContent(
  participantId: string,
  stream: readonly M11CStreamItem[],
): { content: string; timestamp: string } | null {
  // Walk backwards to find the most recent item from this participant
  for (let i = stream.length - 1; i >= 0; i--) {
    const item = stream[i];
    if (item.actor.id === participantId && item.content) {
      // Truncate to 80 chars for the strip
      const content = item.content.length > 80
        ? `${item.content.slice(0, 80)}…`
        : item.content;
      return { content, timestamp: item.timestamp };
    }
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────

export default function M11CLiveNowStrip({
  participants,
  stream,
  isLive,
}: LiveNowStripProps) {
  // Only show participants who are online or active
  const liveParticipants = useMemo(() => {
    const live = participants.filter(
      (p) => p.presence === 'online' || p.presence === 'active',
    );

    const result: LiveParticipant[] = [];
    for (const p of live) {
      const latest = deriveLatestContent(p.participantId, stream);
      if (latest) {
        result.push({
          participantId: p.participantId,
          displayName: p.displayName,
          role: p.role,
          presence: p.presence,
          workState: p.workState,
          latestContent: latest.content,
          latestTimestamp: latest.timestamp,
        });
      }
    }

    // Sort by most recent activity
    return result.sort((a, b) =>
      new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime(),
    );
  }, [participants, stream]);

  if (liveParticipants.length === 0) {
    return (
      <div className="ar-live-now" role="status" aria-live="polite">
        <span className="ar-live-now__idle">
          {isLive ? 'No active participants' : 'Waiting for connection…'}
        </span>
      </div>
    );
  }

  return (
    <div className="ar-live-now" role="status" aria-live="polite" aria-label="Live activity">
      <div className="ar-live-now__items">
        {liveParticipants.map((p) => (
          <div key={p.participantId} className="ar-live-now__item">
            <StatusIndicator
              variant={p.presence === 'active' ? 'live' : 'live'}
              size="xs"
              pulse
              ariaLabel={`${p.displayName}: live`}
            />
            <span className="ar-live-now__name">
              {p.displayName}
              {p.role && (
                <span className="ar-live-now__role">{p.role}</span>
              )}
            </span>
            <span className="ar-live-now__narrative">
              {p.latestContent}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
