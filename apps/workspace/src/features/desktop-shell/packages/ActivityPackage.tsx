/**
 * VES-UI-001 T5: Activity Package
 *
 * Participant rail + live stream promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/packages/ActivityRoom.tsx`).
 * Data: `useM11CActivityRoom` (Activity Room stores: participants + stream)
 * → `activityPackageFixture`. Never hardcoded arrays in JSX.
 *
 * Visual roles bind to the scoped `--ds-*` layer, never hex literals.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T5 Activity Room + data)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useM11CActivityRoom } from '../../../hooks/useM11CActivityRoom';
import { timeAgo } from '../../overview/utils/timeAgo';
import { activityPackageFixture } from './packages.fixtures';
import '../desktop-shell.tokens.css';

export function ActivityPackage() {
  const { participants, stream, state } = useM11CActivityRoom();
  const isLive = state === 'live';

  const rail =
    participants.length > 0
      ? participants.map((participant) => ({
          id: participant.participantId,
          displayName: participant.displayName,
          status: participant.workState,
        }))
      : activityPackageFixture.participants;

  const records =
    stream.length > 0
      ? stream.slice(-3).map((item) => ({
          id: item.id,
          actor: item.actor.displayName,
          message: item.content,
          timestamp: timeAgo(item.timestamp),
        }))
      : activityPackageFixture.records.map((record) => ({
          ...record,
          timestamp: `${record.timestamp} ago`,
        }));

  return (
    <div className="grid h-full min-h-[400px] grid-cols-1 lg:grid-cols-[220px_1fr]">
      <div className="flex flex-col border-r border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-2)]">
        <div className="px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
          ALL PARTICIPANTS · {rail.length} TOTAL
        </div>
        <div className="flex-1 space-y-[var(--vestara-spacing-1)]">
          {rail.map((participant) => (
            <div
              key={participant.id}
              className="flex justify-between rounded-[var(--vestara-radius-md)] px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-bg)]"
            >
              <span>
                {participant.displayName} {participant.status}
              </span>
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--ds-accent)]" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="flex h-9 items-center justify-between border-b border-[var(--ds-border)] px-[var(--vestara-spacing-3)]">
          <div className="flex items-center gap-[var(--vestara-spacing-2)]">
            <span className="text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-accent)]">
              LIVE OPERATIONS
            </span>
            <span className="text-[length:var(--vestara-font-size-sm)] font-medium text-[var(--ds-text)]">
              Activity Room
            </span>
            <span className="rounded border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-1)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
              {stream.length > 0 ? `${stream.length} records` : 'fixture snapshot'}
            </span>
          </div>
          <div className="flex gap-[var(--vestara-spacing-1)]">
            <span className="rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
              {isLive ? 'LIVE' : 'SNAPSHOT'}
            </span>
          </div>
        </div>
        <div className="flex-1 space-y-[var(--vestara-spacing-2)] overflow-auto p-[var(--vestara-spacing-3)]">
          {isLive ? null : (
            <div className="flex items-center gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-md)] border border-[var(--ds-error)] bg-[var(--ds-error-bg)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text)]">
              <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ds-error)]" />
              Activity snapshot incomplete · streaming
            </div>
          )}
          {records.map((record) => (
            <div
              key={record.id}
              className="flex gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-md)] p-[var(--vestara-spacing-2)] hover:bg-[var(--ds-surface-bg)]"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[length:var(--vestara-font-size-xs)]">
                {record.actor.charAt(0)}
              </div>
              <div>
                <div className="text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text)]">
                  {record.actor} · <span className="text-[var(--ds-text-muted)]">{record.message}</span>
                </div>
                <div className="text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
                  {record.timestamp}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
