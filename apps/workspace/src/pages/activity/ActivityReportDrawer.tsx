/**
 * AR-REPORT — Activity date-range report inside the reusable Drawer shell.
 *
 * A report icon in the Activity Room header opens this drawer. It loads the
 * activities in the selected date range from `GET /api/activity-room`
 * (`from`/`to`, bounded server-side) and presents a timeline with summary
 * counts plus per-activity details.
 *
 * Read-only projection: content is record-stamped data as served. Absent
 * fields stay absent (UNKNOWN is preserved, never inferred). An invalid
 * range pauses loading with a notice instead of coercing the window.
 */

import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { fetchActivityHistory } from '../../lib/activity';
import ActivityRoomSkeleton from './ActivityRoomSkeleton';
import ActivityDateFilter, { toCalendarDate, type DateFilterPreset } from './ActivityDateFilter';
import {
  actorInitials,
  formatRelative,
  formatTime,
  kindIcon,
  kindLabel,
  severityBadge,
  severityOfRecord,
} from './activity-formatters';
import type { ActivityProjectionRecord } from './activity-types';

/** Server-side cap mirrored from the API MAX_LIMIT. */
const REPORT_LIMIT = 1000;
const PREVIEW_CHARS = 160;

export interface ActivityReportDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Lexicographic comparison is exact for yyyy-mm-dd calendar days. */
function isRangeValid(startDate: string, endDate: string): boolean {
  if (!startDate || !endDate) return true;
  return startDate <= endDate;
}

/** Explicit UTC day bounds so a `to` date includes its whole day. */
function dayBounds(startDate: string, endDate: string): { from: string; to: string } {
  return { from: `${startDate}T00:00:00.000Z`, to: `${endDate}T23:59:59.999Z` };
}

function recordText(record: ActivityProjectionRecord): string {
  const candidate =
    (record as { content?: unknown }).content ??
    (record as { reason?: unknown }).reason ??
    (record as { status?: unknown }).status ??
    (record as { outcome?: unknown }).outcome;
  return typeof candidate === 'string' ? candidate : '';
}

function preview(text: string): string {
  if (text.length <= PREVIEW_CHARS) return text;
  return `${text.slice(0, PREVIEW_CHARS)}…`;
}

export default function ActivityReportDrawer({ open, onClose }: ActivityReportDrawerProps) {
  const [preset, setPreset] = useState<DateFilterPreset>('today');
  const [startDate, setStartDate] = useState(() => toCalendarDate(new Date()));
  const [endDate, setEndDate] = useState(() => toCalendarDate(new Date()));
  const [records, setRecords] = useState<readonly ActivityProjectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dateActive = preset !== 'all';
  const rangeValid = isRangeValid(startDate, endDate);

  useEffect(() => {
    if (!open || !rangeValid) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params =
      startDate && endDate ? { ...dayBounds(startDate, endDate), limit: REPORT_LIMIT } : { limit: REPORT_LIMIT };
    void fetchActivityHistory(params).then((result) => {
      if (cancelled) return;
      setRecords(result.records as ActivityProjectionRecord[]);
      setError(result.error ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, startDate, endDate, preset, rangeValid, reloadKey]);

  const summary = useMemo(() => {
    const byKind = new Map<string, number>();
    for (const record of records) byKind.set(record.kind, (byKind.get(record.kind) ?? 0) + 1);
    return {
      total: records.length,
      byKind: [...byKind.entries()].sort((left, right) => right[1] - left[1]),
    };
  }, [records]);

  const rangeLabel =
    !dateActive || (!startDate && !endDate) ? 'All dates' : startDate === endDate ? startDate : `${startDate} to ${endDate}`;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Activity report"
      position="right"
      defaultSize="large"
      storageKey="activity-room-report"
      header={
        <ActivityDateFilter
          startDate={startDate}
          endDate={endDate}
          preset={preset}
          dateActive={dateActive}
          dateRangeValid={rangeValid}
          onChange={(next) => {
            setPreset(next.preset);
            setStartDate(next.startDate);
            setEndDate(next.endDate);
          }}
          onClear={() => {
            setPreset('all');
            setStartDate('');
            setEndDate('');
          }}
        />
      }
    >
      <div className="flex flex-col gap-[var(--vestara-spacing-section)] p-[var(--vestara-spacing-section)]">
        {!rangeValid && (
          <p
            role="status"
            className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-element)] text-[var(--vestara-status-warning)] text-[length:var(--vestara-font-size-sm)]"
          >
            From date is after To date — report paused until fixed.
          </p>
        )}
        {loading ? (
          <ActivityRoomSkeleton label="Activity report" />
        ) : error ? (
          <div
            role="alert"
            className="flex flex-col gap-[var(--vestara-spacing-element)] rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-section)]"
          >
            <p className="text-[var(--vestara-text-primary)] text-[length:var(--vestara-font-size-sm)]">{error}</p>
            <button type="button" className="ar-stream-filter__tab" onClick={() => setReloadKey((key) => key + 1)}>
              Retry
            </button>
          </div>
        ) : records.length === 0 ? (
          <p
            role="status"
            className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-section)] text-[var(--vestara-text-muted)] text-[length:var(--vestara-font-size-sm)]"
          >
            No activities in {rangeLabel}.
          </p>
        ) : (
          <>
            <section
              aria-label="Report summary"
              className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-section)]"
            >
              <p className="text-[var(--vestara-text-primary)] text-[length:var(--vestara-font-size-sm)]">
                <strong>
                  {summary.total} {summary.total === 1 ? 'activity' : 'activities'}
                </strong>{' '}
                <span className="text-[var(--vestara-text-muted)]">in {rangeLabel}</span>
              </p>
              <ul className="mt-[var(--vestara-spacing-element)] flex flex-wrap gap-[var(--vestara-spacing-element)]">
                {summary.byKind.map(([kind, count]) => (
                  <li
                    key={kind}
                    className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] px-2 py-1 text-[var(--vestara-text-secondary)] text-[length:var(--vestara-font-size-xs)]"
                  >
                    {kindLabel(kind as ActivityProjectionRecord['kind'])} · {count}
                  </li>
                ))}
              </ul>
              {summary.total >= REPORT_LIMIT && (
                <p role="note" className="mt-[var(--vestara-spacing-element)] text-[var(--vestara-status-warning)] text-[length:var(--vestara-font-size-xs)]">
                  Report limit reached — narrow the date range for a complete view.
                </p>
              )}
            </section>
            <ol aria-label={`Activities in ${rangeLabel}`} className="flex flex-col gap-[var(--vestara-spacing-element)]">
              {records.map((record) => {
                const expanded = expandedId === record.id;
                const text = recordText(record);
                return (
                  <li
                    key={record.id}
                    className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)]"
                  >
                    <button
                      type="button"
                      className="flex w-full items-start gap-[var(--vestara-spacing-element)] p-[var(--vestara-spacing-element)] text-left"
                      aria-expanded={expanded}
                      aria-label={`${kindLabel(record.kind)} by ${record.actor.displayName || record.actor.id}, ${formatRelative(record.timestamp)}`}
                      onClick={() => setExpandedId(expanded ? null : record.id)}
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] text-[var(--vestara-text-secondary)] text-[length:var(--vestara-font-size-xs)]"
                      >
                        {actorInitials(record)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-[var(--vestara-spacing-element)]">
                          <span aria-hidden="true" className="text-[var(--vestara-text-muted)]">
                            {kindIcon(record.kind)}
                          </span>
                          <strong className="truncate text-[var(--vestara-text-primary)] text-[length:var(--vestara-font-size-sm)]">
                            {kindLabel(record.kind)}
                          </strong>
                          <span className="ml-auto shrink-0 text-[var(--vestara-text-muted)] text-[length:var(--vestara-font-size-xs)]" title={record.timestamp}>
                            {formatRelative(record.timestamp)}
                          </span>
                        </span>
                        {text && (
                          <span className="mt-1 block truncate text-[var(--vestara-text-secondary)] text-[length:var(--vestara-font-size-sm)]">
                            {preview(text)}
                          </span>
                        )}
                      </span>
                    </button>
                    {expanded && (
                      <dl className="flex flex-col gap-1 border-t border-[var(--vestara-border-default)] p-[var(--vestara-spacing-element)] text-[length:var(--vestara-font-size-xs)]">
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-[var(--vestara-text-muted)]">Actor</dt>
                          <dd className="text-[var(--vestara-text-primary)]">
                            {record.actor.displayName || record.actor.id} ({record.actor.type})
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-[var(--vestara-text-muted)]">Time</dt>
                          <dd className="text-[var(--vestara-text-primary)]" title={record.timestamp}>
                            {record.timestamp} ({formatTime(record.timestamp)})
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-[var(--vestara-text-muted)]">Severity</dt>
                          <dd className="text-[var(--vestara-text-primary)]">{severityBadge(severityOfRecord(record))}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-[var(--vestara-text-muted)]">Sequence</dt>
                          <dd className="text-[var(--vestara-text-primary)]">{record.sequence}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-[var(--vestara-text-muted)]">ID</dt>
                          <dd className="break-all text-[var(--vestara-text-primary)]">{record.id}</dd>
                        </div>
                        {text && (
                          <div className="flex flex-col gap-1">
                            <dt className="shrink-0 text-[var(--vestara-text-muted)]">Details</dt>
                            <dd className="whitespace-pre-wrap break-words text-[var(--vestara-text-primary)]">{text}</dd>
                          </div>
                        )}
                        {record.hasDetails && (
                          <p className="text-[var(--vestara-text-muted)]">Full content available in the Activity detail view.</p>
                        )}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </Drawer>
  );
}
