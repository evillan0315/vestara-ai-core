/**
 * AR-DATE-002 — Activity date filter dropdown.
 *
 * Icon trigger in the stream filter bar opening a panel with date presets,
 * native From/To inputs, and clear. Controlled: the stream owns the window,
 * this component owns trigger/panel presentation only.
 *
 * All visual values map to Vestara tokens; Tailwind is the renderer only.
 */

import { useEffect, useId, useRef, useState } from 'react';
import DateRangeOutlinedIcon from '@mui/icons-material/DateRangeOutlined';
import { SIZING } from '@vestara/ui-tokens';

export type DateFilterPreset = 'all' | 'today' | 'yesterday' | 'custom';

export interface DateFilterValue {
  readonly startDate: string;
  readonly endDate: string;
  readonly preset: DateFilterPreset;
}

interface ActivityDateFilterProps {
  readonly startDate: string;
  readonly endDate: string;
  readonly preset: DateFilterPreset;
  /** True while the panel is open (controlled by the trigger). */
  readonly dateActive: boolean;
  readonly dateRangeValid: boolean;
  readonly onChange: (next: DateFilterValue) => void;
  readonly onClear: () => void;
}

/** Viewer-locale calendar day (`yyyy-mm-dd`) for date presets. */
export function toCalendarDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function presetDates(preset: 'all' | 'today' | 'yesterday'): Pick<DateFilterValue, 'startDate' | 'endDate'> {
  if (preset === 'all') return { startDate: '', endDate: '' };
  const target = new Date();
  if (preset === 'yesterday') target.setDate(target.getDate() - 1);
  const day = toCalendarDate(target);
  return { startDate: day, endDate: day };
}

const DATE_PRESETS: { id: 'all' | 'today' | 'yesterday'; label: string }[] = [
  { id: 'all', label: 'All dates' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
];

const INPUT_CLASS =
  'rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] px-2 py-1 text-[var(--vestara-text-primary)] text-[length:var(--vestara-font-size-sm)] [color-scheme:dark]';

export default function ActivityDateFilter({
  startDate,
  endDate,
  preset,
  dateActive,
  dateRangeValid,
  onChange,
  onClear,
}: ActivityDateFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open ]);

  const windowLabel = dateActive && dateRangeValid ? `${startDate || '…'} to ${endDate || '…'}` : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((next) => !next)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={windowLabel ? `Filter by date: ${windowLabel}` : 'Filter by date'}
        title={windowLabel ? `Date filter: ${windowLabel}` : 'Filter by date'}
        className={`ar-stream-filter__tab ${dateActive ? 'ar-stream-filter__tab--active' : ''}`}
      >
        {dateActive && <span className="ar-stream-filter__dot" aria-hidden="true" />}
        <DateRangeOutlinedIcon sx={{ fontSize: SIZING.icon.md }} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Filter activity by date"
          className="absolute right-0 top-full z-[var(--vestara-z-index-popover)] mt-[var(--vestara-spacing-element)] w-72 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel-raised)] p-[var(--vestara-spacing-section)] shadow-[var(--vestara-elevation-lg)]"
        >
          <div className="flex items-center gap-[var(--vestara-spacing-element)]" role="group" aria-label="Date presets">
            {DATE_PRESETS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange({ ...presetDates(option.id), preset: option.id })}
                aria-pressed={preset === option.id}
                className={`ar-stream-filter__tab ${preset === option.id ? 'ar-stream-filter__tab--active' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-[var(--vestara-spacing-element)] flex flex-col gap-[var(--vestara-spacing-element)]">
            <label className="flex items-center justify-between gap-[var(--vestara-spacing-element)] text-[var(--vestara-text-muted)] text-[length:var(--vestara-font-size-xs)]">
              From
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => onChange({ startDate: e.target.value, endDate, preset: 'custom' })}
                className={INPUT_CLASS}
                aria-label="Filter from date"
              />
            </label>
            <label className="flex items-center justify-between gap-[var(--vestara-spacing-element)] text-[var(--vestara-text-muted)] text-[length:var(--vestara-font-size-xs)]">
              To
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => onChange({ startDate, endDate: e.target.value, preset: 'custom' })}
                className={INPUT_CLASS}
                aria-label="Filter to date"
              />
            </label>
          </div>
          {dateActive && !dateRangeValid && (
            <p role="status" className="mt-[var(--vestara-spacing-element)] text-[var(--vestara-status-warning)] text-[length:var(--vestara-font-size-xs)]">
              From date is after To date — date filter paused until fixed.
            </p>
          )}
          <div className="mt-[var(--vestara-spacing-section)] flex items-center justify-between gap-[var(--vestara-spacing-element)]">
            {dateActive ? (
              <button type="button" onClick={onClear} className="ar-stream-filter__tab" aria-label="Clear date filter">
                Clear dates
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => setOpen(false)} className="ar-stream-filter__tab ar-stream-filter__tab--active">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
