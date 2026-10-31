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

import { useState } from 'react';
import { useM11CActivityRoom } from '../../../hooks/useM11CActivityRoom';
import { timeAgo } from '../../overview/utils/timeAgo';
import { PackageEmpty, PackageSearchInput, PackageSubHeader } from './PackageChrome';
import { activityPackageFixture } from './packages.fixtures';

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('active') || normalized.includes('working') || normalized.includes('busy') || normalized.includes('live'))
    return 'bg-[var(--ds-success)]';
  if (normalized.includes('warn') || normalized.includes('degrad')) return 'bg-[var(--ds-warning)]';
  if (normalized.includes('error') || normalized.includes('fail')) return 'bg-[var(--ds-error)]';
  return 'bg-[var(--ds-text-muted)]';
}

export function ActivityPackage() {
  const { participants, stream, state } = useM11CActivityRoom();
  const [query, setQuery] = useState('');
  const isLive = state === 'live';

  const rail =
    participants.length > 0
      ? participants.map((participant) => ({
          id: participant.participantId,
          displayName: participant.displayName,
          status: participant.workState,
        }))
      : activityPackageFixture.participants;

  const normalizedQuery = query.trim().toLowerCase();
  const records =
    stream.length > 0
      ? stream.slice(-30).map((item) => ({
          id: item.id,
          actor: item.actor.displayName,
          message: item.content,
          timestamp: timeAgo(item.timestamp),
        }))
      : activityPackageFixture.records.map((record) => ({
          ...record,
          timestamp: `${record.timestamp} ago`,
        }));
  const visibleRecords = normalizedQuery
    ? records.filter(
        (record) =>
          record.actor.toLowerCase().includes(normalizedQuery) ||
          record.message.toLowerCase().includes(normalizedQuery),
      )
    : records;

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <PackageSubHeader
        eyebrow="LIVE OPERATIONS"
        isLive={isLive}
        meta={
          <>
            <span className="text-[length:var(--vestara-font-size-sm)] font-medium text-[var(--ds-text)]">
              Activity Room
            </span>
            <span className="hidden rounded border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-1)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)] sm:inline">
              {stream.length > 0 ? `${stream.length} records` : 'fixture snapshot'}
            </span>
          </>
        }
      />
    <div className="ds-split-2col ds-split-2col-rail-left grid min-h-0 flex-1 grid-cols-1">
      <div className="ds-rail-left flex min-h-0 flex-col bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-2)]">
        <div className="px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
          ALL PARTICIPANTS · {rail.length} TOTAL
        </div>
        <div className="min-h-0 flex-1 space-y-[var(--vestara-spacing-1)] overflow-auto">
          {rail.map((participant) => (
            <div
              key={participant.id}
              className="flex items-center justify-between gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-md)] px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-bg)]"
            >
              <span className="flex min-w-0 items-center gap-[var(--vestara-spacing-1)]">
                <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[var(--ds-text-muted)]">
                  {participant.displayName.charAt(0)}
                </span>
                <span className="truncate">
                  {participant.displayName}{' '}
                  <span className="text-[var(--ds-text-muted)]">{participant.status}</span>
                </span>
              </span>
              <span aria-hidden="true" className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${statusTone(participant.status)}`} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-[var(--vestara-spacing-2)] border-b border-[var(--ds-border)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-1)]">
          <PackageSearchInput
            id="ds-activity-filter"
            value={query}
            onChange={setQuery}
            label="Filter activity records"
            placeholder="Filter records…"
          />
        </div>
        <div className="min-h-0 flex-1 space-y-[var(--vestara-spacing-2)] overflow-auto p-[var(--vestara-spacing-3)]" role="log" aria-label="Activity records">
          {isLive ? null : (
            <div className="flex items-center gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-md)] border border-[var(--ds-warning)] bg-[var(--ds-warning-bg)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text)]">
              <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ds-warning)]" />
              Snapshot preview · live stream unavailable
            </div>
          )}
          {visibleRecords.length === 0 ? (
            <PackageEmpty title="No matching records" hint="Adjust the filter to see activity." />
          ) : (
          visibleRecords.map((record) => (
            <div
              key={record.id}
              className="flex gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-md)] p-[var(--vestara-spacing-2)] hover:bg-[var(--ds-surface-bg)]"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
                {record.actor.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text)]">
                  {record.actor} · <span className="text-[var(--ds-text-muted)]">{record.message}</span>
                </div>
                <div className="text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
                  {record.timestamp}
                </div>
              </div>
            </div>
          ))
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
