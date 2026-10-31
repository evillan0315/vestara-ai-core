/**
 * @vestara/ui-components — Calendar / appointments surface.
 *
 * Decomposition of the monolithic `CalendarPkg` scheduling view into
 * reusable, workspace-wide pieces:
 * - `CalendarMini` — left mini month picker
 * - `AppointmentTypeList` — filterable type rows with active toggles
 * - `WorkingHoursCard` — hours / buffer / timezone summary
 * - `CalendarToolbar` — month label, count, Today, view switcher, sync dot
 * - `CalendarMonthGrid` — month grid with per-day chips + overflow
 * - `AppointmentRow` / `AppointmentListView` — week/day/agenda rows
 * - `AppointmentComposer` — quick-create input bar
 * - `AppointmentDetailsCard` — right details + patient history
 * - `AppointmentSettingsPanel` — general / hours / reminders / compliance
 * - `CalendarShell` — composed 3-pane layout (mini | grid | inspector)
 *
 * Every visual value resolves through `var(--vestara-*)` shell tokens.
 * Data arrives via props with `calendar.fixtures.ts` defaults (governance §6).
 * Icons are vendored from `./icons.js` — no `lucide-react` dependency.
 */

import { useState } from 'react';
import {
  CALENDAR_APPOINTMENT_TYPES,
  CALENDAR_APPOINTMENTS,
  CALENDAR_MONTH_DAYS,
  CALENDAR_VIEWS,
  CALENDAR_WEEKDAYS,
  type CalendarAppointment,
  type CalendarAppointmentType,
  type CalendarView,
} from './calendar.fixtures.js';
import { Calendar as CalendarIcon, Check, Clock, MapPin, Plus, Settings, Users, Video } from './icons.js';
import { cn } from './utils.js';

// ─── Shared bits ─────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <div className="mb-2 text-[10px] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">{children}</div>;
}

// ─── CalendarMini ────────────────────────────────────────────────

export interface CalendarMiniProps {
  selectedDate: number;
  onSelect?: (day: number) => void;
  days?: readonly number[];
  today?: number;
  totalCount?: number;
}

export function CalendarMini({
  selectedDate,
  onSelect,
  days = CALENDAR_MONTH_DAYS,
  today = 27,
  totalCount = 12,
}: CalendarMiniProps) {
  return (
    <div className="border-b border-[var(--vestara-border-shell)] p-3">
      <div className="flex items-center gap-2">
        <CalendarIcon size={14} className="text-[var(--vestara-accent-shell)]" />
        <span className="text-[11px] tracking-[0.12em] text-[var(--vestara-accent-shell)]">
          CALENDAR • APPOINTMENTS
        </span>
        <span className="ml-auto rounded-full border border-[var(--vestara-accent-shell)]/20 bg-[var(--vestara-accent-shell)]/10 px-1.5 py-0.5 text-[9px] text-[var(--vestara-accent-shell)]">
          {totalCount}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-0.5 text-center text-[9px] text-[var(--vestara-text-shell-muted)]">
        {CALENDAR_WEEKDAYS.map((d) => (
          <div key={d}>{d[0]}</div>
        ))}
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onSelect?.(d)}
            className={cn(
              'h-6 rounded-[6px] border text-[10px]',
              selectedDate === d
                ? 'border-[var(--vestara-accent-shell)] bg-[var(--vestara-accent-shell)] font-bold text-[var(--vestara-color-shell-ink)]'
                : d === today
                  ? 'border-[var(--vestara-accent-shell)]/20 bg-[var(--vestara-accent-shell)]/10 text-[var(--vestara-accent-shell)]'
                  : 'border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] text-[var(--vestara-text-shell-secondary)] hover:border-[var(--vestara-accent-shell)]/20',
            )}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── AppointmentTypeList ─────────────────────────────────────────

export interface AppointmentTypeListProps {
  types?: readonly CalendarAppointmentType[];
  onToggle?: (id: string) => void;
}

export function AppointmentTypeList({ types = CALENDAR_APPOINTMENT_TYPES, onToggle }: AppointmentTypeListProps) {
  return (
    <div>
      <SectionLabel>APPOINTMENT TYPES</SectionLabel>
      <div className="space-y-1">
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onToggle?.(t.id)}
            className="flex w-full items-center gap-2 rounded-[8px] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] px-2 py-1.5 text-left"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
            <span className="flex-1 text-[10px] text-[var(--vestara-text-shell-primary)]">
              {t.name} • {t.durationMinutes}m
            </span>
            <span className="text-[8px] text-[var(--vestara-text-shell-muted)]">{t.count}</span>
            <span
              className={cn(
                'flex h-3 w-3 items-center justify-center rounded-full border',
                t.active
                  ? 'border-[var(--vestara-accent-shell)] bg-[var(--vestara-accent-shell)]'
                  : 'border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)]',
              )}
            >
              {t.active && <Check size={8} className="text-[var(--vestara-color-shell-ink)]" />}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── WorkingHoursCard ────────────────────────────────────────────

export interface WorkingHoursCardProps {
  hours?: string;
  detail?: string;
}

export function WorkingHoursCard({
  hours = '9AM-6PM • Buffer 10m • Max 8/day',
  detail = 'Asia/Manila +08:00 • Lunch 12-1PM',
}: WorkingHoursCardProps) {
  return (
    <div className="rounded-[8px] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] p-2.5">
      <div className="text-[10px] text-[var(--vestara-text-shell-muted)]">Working Hours</div>
      <div className="text-[11px] text-[var(--vestara-text-shell-primary)]">{hours}</div>
      <div className="mt-1 text-[9px] text-[var(--vestara-text-shell-muted)]">{detail}</div>
    </div>
  );
}

// ─── CalendarToolbar ─────────────────────────────────────────────

export interface CalendarToolbarProps {
  view: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  onToday?: () => void;
  monthLabel?: string;
  selectedDate: number;
  count: number;
  synced?: boolean;
}

export function CalendarToolbar({
  view,
  onViewChange,
  onToday,
  monthLabel = 'OCTOBER 2026',
  selectedDate,
  count,
  synced = true,
}: CalendarToolbarProps) {
  return (
    <div className="flex h-[44px] items-center justify-between border-b border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)]/50 px-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] tracking-[0.12em] text-[var(--vestara-accent-shell)]">{monthLabel}</span>
        <span className="text-[11px] font-medium text-[var(--vestara-text-shell-primary)]">
          • {count} appointments • {selectedDate}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToday}
          className="rounded-full border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] px-2 py-1 text-[10px] text-[var(--vestara-text-shell-primary)]"
        >
          Today
        </button>
        <div className="flex rounded-full border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] p-0.5">
          {CALENDAR_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange?.(v)}
              className={cn(
                'rounded-full px-2 py-0.5 text-[9px] capitalize',
                view === v
                  ? 'bg-[var(--vestara-accent-shell)] font-bold text-[var(--vestara-color-shell-ink)]'
                  : 'text-[var(--vestara-text-shell-secondary)]',
              )}
            >
              {v}
            </button>
          ))}
        </div>
        {synced && (
          <span
            title="EHR synced"
            className="ml-2 h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--vestara-status-shell-success)]"
          />
        )}
      </div>
    </div>
  );
}

// ─── CalendarMonthGrid ───────────────────────────────────────────

export interface CalendarMonthGridProps {
  appointments?: readonly CalendarAppointment[];
  selectedDate: number;
  onSelect?: (day: number) => void;
  days?: readonly number[];
  today?: number;
}

function chipStyle(color: string): { background: string; borderColor: string; color: string } {
  return {
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
    color,
  };
}

export function CalendarMonthGrid({
  appointments = CALENDAR_APPOINTMENTS,
  selectedDate,
  onSelect,
  days = CALENDAR_MONTH_DAYS,
  today = 27,
}: CalendarMonthGridProps) {
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[12px] border border-[var(--vestara-border-shell)] bg-[var(--vestara-border-shell)]">
      {CALENDAR_WEEKDAYS.map((d) => (
        <div
          key={d}
          className="bg-[var(--vestara-surface-shell-raised)] p-2 text-center text-[10px] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]"
        >
          {d}
        </div>
      ))}
      {days.map((day) => {
        const dayAppts = appointments.filter((a) => a.day === day);
        const isSelected = day === selectedDate;
        const isToday = day === today;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect?.(day)}
            className={cn(
              'min-h-[92px] cursor-pointer border border-transparent bg-[var(--vestara-surface-shell-panel)] p-1.5 text-left hover:bg-[var(--vestara-surface-shell-raised)]',
              isSelected && '!border-[var(--vestara-accent-shell)]/30 !bg-[var(--vestara-surface-shell-hover)]',
              isToday && 'ring-1 ring-inset ring-[var(--vestara-accent-shell)]/20',
            )}
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                  isToday
                    ? 'bg-[var(--vestara-accent-shell)] font-bold text-[var(--vestara-color-shell-ink)]'
                    : isSelected
                      ? 'bg-[var(--vestara-accent-shell)]/20 text-[var(--vestara-accent-shell)]'
                      : 'text-[var(--vestara-text-shell-secondary)]',
                )}
              >
                {day}
              </span>
              {dayAppts.length > 0 && (
                <span className="text-[8px] text-[var(--vestara-text-shell-muted)]">{dayAppts.length}</span>
              )}
            </div>
            <div className="mt-1 space-y-0.5">
              {dayAppts.slice(0, 3).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-1 truncate rounded-[4px] border px-1 py-0.5 text-[9px]"
                  style={chipStyle(a.color)}
                >
                  <span className="h-1 w-1 rounded-full" style={{ background: a.color }} />
                  <span className="font-mono">{a.time}</span> {a.patient.split(' ')[0]}
                </div>
              ))}
              {dayAppts.length > 3 && (
                <div className="text-[8px] text-[var(--vestara-text-shell-muted)]">+{dayAppts.length - 3} more</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── AppointmentRow / AppointmentListView ────────────────────────

export interface AppointmentRowProps {
  appointment: CalendarAppointment;
}

function StatusPill({ status }: { status: CalendarAppointment['status'] }) {
  return (
    <span
      className={cn(
        'rounded-full border px-1.5 py-0.5 text-[8px]',
        status === 'Confirmed'
          ? 'border-[var(--vestara-status-shell-success)]/20 bg-[var(--vestara-status-shell-success)]/10 text-[var(--vestara-status-shell-success)]'
          : 'border-[var(--vestara-status-shell-warning)]/20 bg-[var(--vestara-status-shell-warning)]/10 text-[var(--vestara-status-shell-warning)]',
      )}
    >
      {status}
    </span>
  );
}

export function AppointmentRow({ appointment: a }: AppointmentRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)] p-2.5 hover:border-[var(--vestara-accent-shell)]/20">
      <div className="h-10 w-1 rounded-full" style={{ background: a.color }} />
      <div>
        <div className="text-[11px] font-medium text-[var(--vestara-text-shell-primary)]">
          {a.time}-{a.end} • {a.patient}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[var(--vestara-text-shell-muted)]">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {a.type}
          </span>
          <span className="flex items-center gap-1">
            <MapPin size={10} />
            {a.location}
          </span>
          <StatusPill status={a.status} />
        </div>
      </div>
      <div className="ml-auto flex gap-1">
        <button
          type="button"
          aria-label="Patient list"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] text-[var(--vestara-text-shell-secondary)]"
        >
          <Users size={10} />
        </button>
        <button
          type="button"
          aria-label="Start video"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--vestara-accent-shell)]/20 bg-[var(--vestara-accent-shell)]/10"
        >
          <Video size={10} className="text-[var(--vestara-accent-shell)]" />
        </button>
      </div>
    </div>
  );
}

export interface AppointmentListViewProps {
  view: Exclude<CalendarView, 'month'>;
  selectedDate: number;
  appointments?: readonly CalendarAppointment[];
}

export function AppointmentListView({
  view,
  selectedDate,
  appointments = CALENDAR_APPOINTMENTS,
}: AppointmentListViewProps) {
  const dayAppts = appointments.filter((a) => a.day === selectedDate);
  return (
    <div className="rounded-[10px] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] p-3">
      <div className="mb-2 text-[10px] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">
        {view.toUpperCase()} VIEW • {selectedDate} OCT • {view === 'day' ? 'Timeline 7AM-8PM' : 'Week Mon-Sun'}
      </div>
      <div className="space-y-2">
        {dayAppts.map((a) => (
          <AppointmentRow key={a.id} appointment={a} />
        ))}
        {dayAppts.length === 0 && (
          <div className="py-6 text-center text-[11px] text-[var(--vestara-text-shell-muted)]">
            No appointments this day
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AppointmentComposer ─────────────────────────────────────────

export interface AppointmentComposerProps {
  placeholder?: string;
  onCreate?: (draft: string) => void;
}

export function AppointmentComposer({
  placeholder = 'New appointment: Patient • Type • Time',
  onCreate,
}: AppointmentComposerProps) {
  const [draft, setDraft] = useState('');
  return (
    <div className="flex h-[44px] items-center gap-2 border-t border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] px-3">
      <Plus size={12} className="text-[var(--vestara-accent-shell)]" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[11px] text-[var(--vestara-text-shell-primary)] outline-none placeholder:text-[var(--vestara-text-shell-muted)]"
      />
      <button
        type="button"
        onClick={() => {
          onCreate?.(draft);
          setDraft('');
        }}
        className="rounded-full bg-[var(--vestara-accent-shell)] px-3 py-1 text-[11px] font-bold text-[var(--vestara-color-shell-ink)]"
      >
        Create
      </button>
    </div>
  );
}

// ─── AppointmentDetailsCard ──────────────────────────────────────

export interface AppointmentDetailsCardProps {
  appointment?: CalendarAppointment;
  selectedDate: number;
  onReschedule?: () => void;
  onStartScribe?: () => void;
}

export function AppointmentDetailsCard({
  appointment,
  selectedDate,
  onReschedule,
  onStartScribe,
}: AppointmentDetailsCardProps) {
  if (!appointment) {
    return (
      <div className="py-8 text-center text-[11px] text-[var(--vestara-text-shell-muted)]">
        Select a day with appointments
      </div>
    );
  }
  const initial = appointment.patient.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="space-y-3">
      <div className="rounded-[12px] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)] text-[11px] font-bold text-[var(--vestara-text-shell-primary)]">
            {initial}
          </div>
          <div>
            <div className="text-[12px] font-medium text-[var(--vestara-text-shell-primary)]">
              {appointment.patient}
            </div>
            <div className="text-[10px] text-[var(--vestara-text-shell-muted)]">Community MH • EN • ES</div>
          </div>
          <span className="ml-auto rounded-full border border-[var(--vestara-status-shell-success)]/20 bg-[var(--vestara-status-shell-success)]/10 px-1.5 py-0.5 text-[9px] text-[var(--vestara-status-shell-success)]">
            {appointment.status}
          </span>
        </div>
        <div className="mt-3 space-y-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">Time</span>
            <span className="text-[var(--vestara-text-shell-primary)]">
              Oct {selectedDate} {appointment.time}-{appointment.end}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">Type</span>
            <span className="text-[var(--vestara-accent-shell)]">{appointment.type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">Location</span>
            <span className="text-[var(--vestara-text-shell-primary)]">{appointment.location}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">Compliance</span>
            <span className="text-[var(--vestara-status-shell-success)]">PASS low</span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onReschedule}
            className="h-7 rounded-[8px] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)] text-[10px] text-[var(--vestara-text-shell-primary)]"
          >
            Reschedule
          </button>
          <button
            type="button"
            onClick={onStartScribe}
            className="h-7 rounded-[8px] bg-[var(--vestara-accent-shell)] text-[10px] font-bold text-[var(--vestara-color-shell-ink)]"
          >
            Start Scribe
          </button>
        </div>
      </div>
      <div className="rounded-[10px] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)] p-2.5">
        <div className="mb-1 text-[10px] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">PATIENT HISTORY</div>
        <div className="space-y-1 text-[10px] text-[var(--vestara-text-shell-secondary)]">
          <div>Last: Oct 20 Therapy 60m Completed</div>
          <div>Next: Oct 28 Follow-up 15m</div>
          <div>Goal #2 coping partial</div>
        </div>
      </div>
    </div>
  );
}

// ─── AppointmentSettingsPanel ────────────────────────────────────

export function AppointmentSettingsPanel() {
  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] p-2.5">
        <div className="mb-2 text-[10px] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">GENERAL</div>
        <div className="space-y-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">Default duration</span>
            <span className="text-[var(--vestara-text-shell-primary)]">30m slider 15-120</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">Buffer time</span>
            <span className="text-[var(--vestara-text-shell-primary)]">10m slider 0-30</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">Max per day</span>
            <span className="text-[var(--vestara-text-shell-primary)]">8</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">Auto-confirm</span>
            <span className="text-[var(--vestara-status-shell-success)]">ON</span>
          </div>
        </div>
      </div>
      <div className="rounded-[10px] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] p-2.5">
        <div className="mb-2 text-[10px] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">WORKING HOURS</div>
        <div className="space-y-1 text-[10px]">
          {CALENDAR_WEEKDAYS.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span className="w-8 text-[var(--vestara-text-shell-muted)]">{d}</span>
              <span className="flex h-5 flex-1 items-center rounded-[6px] border border-[var(--vestara-accent-shell)]/20 bg-[var(--vestara-accent-shell)]/15 px-2 text-[9px] text-[var(--vestara-accent-shell)]">
                9AM-6PM
              </span>
              <span className="flex h-3 w-3 items-center justify-center rounded-full border border-[var(--vestara-accent-shell)] bg-[var(--vestara-accent-shell)]">
                <Check size={8} className="text-[var(--vestara-color-shell-ink)]" />
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[9px] text-[var(--vestara-text-shell-muted)]">
          Lunch 12-1PM blocked • Asia/Manila +08:00
        </div>
      </div>
      <div className="rounded-[10px] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] p-2.5">
        <div className="mb-2 text-[10px] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">REMINDERS</div>
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">Email 24h before</span>
            <span className="text-[var(--vestara-status-shell-success)]">ON</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">SMS 2h before</span>
            <span className="text-[var(--vestara-status-shell-success)]">ON</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">Push 15m before</span>
            <span className="text-[var(--vestara-status-shell-success)]">ON</span>
          </div>
        </div>
      </div>
      <div className="rounded-[10px] border border-[var(--vestara-accent-shell)]/15 bg-[var(--vestara-accent-shell)]/5 p-2.5">
        <div className="mb-2 text-[10px] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">
          COMPLIANCE & EHR
        </div>
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">HIPAA • SOC2 • Zero Retention</span>
            <span className="text-[var(--vestara-status-shell-success)]">ON</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">EHR sync</span>
            <span className="text-[var(--vestara-status-shell-success)]">ON</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--vestara-text-shell-muted)]">Auto-gen clinical note</span>
            <span className="text-[var(--vestara-accent-shell)]">ON</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="h-8 w-full rounded-full bg-[var(--vestara-accent-shell)] text-[11px] font-bold text-[var(--vestara-color-shell-ink)]"
      >
        Save Appointment Settings
      </button>
    </div>
  );
}

// ─── CalendarShell ───────────────────────────────────────────────

export interface CalendarShellProps {
  view?: CalendarView;
  selectedDate?: number;
  showSettings?: boolean;
  types?: readonly CalendarAppointmentType[];
  appointments?: readonly CalendarAppointment[];
  monthLabel?: string;
  onCreate?: (draft: string) => void;
  className?: string;
}

export function CalendarShell({
  view: controlledView,
  selectedDate: controlledDate,
  showSettings: controlledSettings,
  types = CALENDAR_APPOINTMENT_TYPES,
  appointments = CALENDAR_APPOINTMENTS,
  monthLabel,
  onCreate,
  className = '',
}: CalendarShellProps) {
  const [uncontrolledView, setUncontrolledView] = useState<CalendarView>('month');
  const [uncontrolledDate, setUncontrolledDate] = useState(27);
  const [uncontrolledSettings, setUncontrolledSettings] = useState(false);
  const [localTypes, setLocalTypes] = useState<readonly CalendarAppointmentType[] | null>(null);

  const view = controlledView ?? uncontrolledView;
  const selectedDate = controlledDate ?? uncontrolledDate;
  const showSettings = controlledSettings ?? uncontrolledSettings;
  const activeTypes = localTypes ?? types;

  const setView = setUncontrolledView;
  const setSelectedDate = setUncontrolledDate;
  const setShowSettings = setUncontrolledSettings;

  const dayAppts = appointments.filter((a) => a.day === selectedDate);
  const firstAppt = dayAppts[0];

  return (
    <div
      className={cn(
        'grid h-full grid-cols-1 bg-[var(--vestara-surface-shell-canvas)] text-[var(--vestara-text-shell-primary)] lg:grid-cols-[240px_1fr_320px]',
        className,
      )}
    >
      <div className="flex flex-col border-r border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)]">
        <CalendarMini selectedDate={selectedDate} onSelect={setSelectedDate} />
        <div className="flex-1 space-y-3 overflow-auto p-3">
          <AppointmentTypeList
            types={activeTypes}
            onToggle={(id) => setLocalTypes(activeTypes.map((t) => (t.id === id ? { ...t, active: !t.active } : t)))}
          />
          <WorkingHoursCard />
        </div>
        <div className="border-t border-[var(--vestara-border-shell)] p-3">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="flex h-7 w-full items-center justify-center gap-1 rounded-[8px] border border-[var(--vestara-accent-shell)]/20 bg-[var(--vestara-accent-shell)]/10 text-[10px] text-[var(--vestara-accent-shell)]"
          >
            <Settings size={10} />
            Appointment Settings
          </button>
        </div>
      </div>

      <div className="flex flex-col bg-[var(--vestara-surface-shell-panel)]">
        <CalendarToolbar
          view={view}
          onViewChange={setView}
          onToday={() => setSelectedDate(27)}
          monthLabel={monthLabel}
          selectedDate={selectedDate}
          count={dayAppts.length}
        />
        <div className="flex-1 overflow-auto p-2">
          {view === 'month' ? (
            <CalendarMonthGrid appointments={appointments} selectedDate={selectedDate} onSelect={setSelectedDate} />
          ) : (
            <div className="space-y-2">
              <AppointmentListView view={view} selectedDate={selectedDate} appointments={appointments} />
            </div>
          )}
        </div>
        <AppointmentComposer onCreate={onCreate} />
      </div>

      <div className="overflow-auto border-l border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)] p-3">
        <div className="mb-3 flex items-center gap-2">
          <Settings size={14} className="text-[var(--vestara-accent-shell)]" />
          <span className="text-[11px] tracking-[0.12em] text-[var(--vestara-accent-shell)]">
            {showSettings ? 'APPOINTMENT SETTINGS' : 'APPOINTMENT DETAILS'}
          </span>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="ml-auto rounded-full border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] px-2 py-1 text-[10px] text-[var(--vestara-text-shell-secondary)]"
          >
            {showSettings ? 'Details' : 'Settings'}
          </button>
        </div>
        {showSettings ? (
          <AppointmentSettingsPanel />
        ) : (
          <AppointmentDetailsCard appointment={firstAppt} selectedDate={selectedDate} />
        )}
      </div>
    </div>
  );
}
