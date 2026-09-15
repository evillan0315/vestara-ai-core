/**
 * M11C Live Now Strip
 *
 * A thin narrative strip (48–64px) showing per-participant live output
 * with pulsing indicators. Sits atop the activity stream in the
 * stream-main column.
 *
 * Scan-first derivation (presence is UNKNOWN upstream — M10 never resolves
 * it, so presence-only filtering collapses in production): a participant is
 * "live" when their workState is working/blocked/attention-required, or
 * when they produced stream content within LIVE_WINDOW_MS. Presence lamps
 * render only for positively-resolved states; work state is authoritative.
 *
 * Design spec: activity-room-visual-design-spec.md §2.5
 *
 * Authority: derives from M10 workState + lastActivityAt + stream recency.
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
}

interface LiveParticipant {
  readonly participantId: string;
  readonly displayName: string;
  readonly role: string | undefined;
  readonly workState: string;
  readonly urgent: boolean;
  readonly latestContent: string;
  readonly latestTimestamp: string;
  readonly workflowRunId?: string;
}

/** Window in which stream activity counts as "live" without workState. */
const LIVE_WINDOW_MS = 90_000;

// ─── Helpers ─────────────────────────────────────────────────

function formatAgo(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (Number.isNaN(diffMs)) return '';
  const s = Math.max(0, Math.floor(diffMs / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/** Derive the latest narrative text for a participant from recent stream items. */
function deriveLatestContent(
  participantId: string,
  stream: readonly M11CStreamItem[],
): { content: string; timestamp: string; workflowRunId?: string } | null {
  // Walk backwards to find the most recent item from this participant
  for (let i = stream.length - 1; i >= 0; i--) {
    const item = stream[i];
    if (!item) continue;
    // Match participantId or raw actor id (agent- prefix variance).
    if (item.actor.id === participantId || `agent-${item.actor.id}` === participantId) {
      if (item.content) {
        // Truncate to 80 chars for the strip
        const content = item.content.length > 80
          ? `${item.content.slice(0, 80)}…`
          : item.content;
        return { content, timestamp: item.timestamp, workflowRunId: item.workflowRunId };
      }
    }
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────

export default function M11CLiveNowStrip({
  participants,
  stream,
}: LiveNowStripProps) {
  // Work state is authoritative; presence is UNKNOWN upstream so it never
  // gates visibility. A participant is live when working/blocked/needs
  // attention, or when they emitted stream content within LIVE_WINDOW_MS.
  const liveParticipants = useMemo(() => {
    const now = Date.now();
    const result: LiveParticipant[] = [];
    for (const p of participants) {
      const ws = p.workState;
      const working = ws === 'working' || ws === 'blocked' || ws === 'attention-required';
      const latest = deriveLatestContent(p.participantId, stream);
      const recentByStream = latest
        ? now - new Date(latest.timestamp).getTime() < LIVE_WINDOW_MS
        : false;
      const recentByProjection = p.lastActivityAt
        ? now - new Date(p.lastActivityAt).getTime() < LIVE_WINDOW_MS
        : false;
      if (!(working || recentByStream || recentByProjection)) continue;
      if (!latest) continue;
      result.push({
        participantId: p.participantId,
        displayName: p.displayName,
        role: p.role,
        workState: ws,
        urgent: ws === 'blocked' || ws === 'attention-required',
        latestContent: latest.content,
        latestTimestamp: latest.timestamp,
        workflowRunId: latest.workflowRunId,
      });
    }

    // Urgent first, then most recent activity
    return result.sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      return new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime();
    });
  }, [participants, stream]);

  // No idle placeholder: when nobody is live the strip collapses entirely
  // and the stream owns the space.
  if (liveParticipants.length === 0) {
    return null;
  }

  return (
    // Decorative live mirror of the stream (which already owns role=log).
    // aria-hidden avoids double screen-reader announcements.
    <div className="ar-live-now" aria-hidden="true">
      <div className="ar-live-now__items">
        {liveParticipants.map((p) => (
          <div
            key={p.participantId}
            className="ar-live-now__item"
            title={`${p.displayName} · ${p.workState} · ${formatAgo(p.latestTimestamp)}${p.workflowRunId ? ` · workflow ${p.workflowRunId}` : ''}`}
          >
            <StatusIndicator
              variant={p.urgent ? 'warn' : 'live'}
              size="xs"
              pulse
              aria-hidden
            />
            <span className="ar-live-now__name">
              {p.displayName}
              {p.role && (
                <span className="ar-live-now__role">{p.role}</span>
              )}
            </span>
            <span className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-subtle)] px-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--vestara-text-muted)]">
              {p.urgent ? p.workState : 'Live'}
            </span>
            {p.workflowRunId && (
              <span className="max-w-20 truncate font-mono text-[10px] text-[var(--vestara-text-dim)]">
                {p.workflowRunId.slice(0, 8)}
              </span>
            )}
            <span className="ar-live-now__narrative">
              {p.latestContent}
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-[var(--vestara-text-dim)]">
              {formatAgo(p.latestTimestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
