/**
 * @vestara/ui-components — Calendar fixtures (governance §6).
 *
 * Typed mock data for the calendar / appointments surface. Import this
 * instead of inlining arrays in JSX. All accent colors resolve through
 * `var(--vestara-*)` shell tokens — never raw hex in components.
 */

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

export interface CalendarAppointmentType {
  readonly id: string;
  readonly name: string;
  readonly durationMinutes: number;
  /** Token-bound color, e.g. `var(--vestara-accent-shell)`. */
  readonly color: string;
  readonly billing: string;
  readonly count: number;
  readonly active: boolean;
}

export interface CalendarAppointment {
  readonly id: number;
  readonly day: number;
  readonly time: string;
  readonly end: string;
  readonly patient: string;
  readonly type: string;
  /** Token-bound color for the chip/rail. */
  readonly color: string;
  readonly status: 'Confirmed' | 'Pending';
  readonly location: string;
}

export const CALENDAR_VIEWS: readonly CalendarView[] = ['month', 'week', 'day', 'agenda'];

export const CALENDAR_WEEKDAYS: readonly string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const CALENDAR_MONTH_DAYS: readonly number[] = Array.from({ length: 31 }, (_, i) => i + 1);

export const CALENDAR_APPOINTMENT_TYPES: readonly CalendarAppointmentType[] = [
  {
    id: 'consult',
    name: 'Consultation',
    durationMinutes: 30,
    color: 'var(--vestara-accent-shell)',
    billing: '90834',
    count: 4,
    active: true,
  },
  {
    id: 'therapy',
    name: 'Therapy',
    durationMinutes: 60,
    color: 'var(--vestara-marketplace-agent)',
    billing: '90837',
    count: 3,
    active: true,
  },
  {
    id: 'follow',
    name: 'Follow-up',
    durationMinutes: 15,
    color: 'var(--vestara-status-shell-success)',
    billing: '90832',
    count: 2,
    active: true,
  },
  {
    id: 'group',
    name: 'Group Session',
    durationMinutes: 90,
    color: 'var(--vestara-status-shell-warning)',
    billing: '90853',
    count: 1,
    active: true,
  },
  {
    id: 'crisis',
    name: 'Crisis',
    durationMinutes: 45,
    color: 'var(--vestara-status-shell-danger)',
    billing: '90839',
    count: 1,
    active: false,
  },
  {
    id: 'superv',
    name: 'Supervision',
    durationMinutes: 60,
    color: 'var(--vestara-status-shell-info)',
    billing: '90887',
    count: 1,
    active: true,
  },
];

export const CALENDAR_APPOINTMENTS: readonly CalendarAppointment[] = [
  {
    id: 1,
    day: 27,
    time: '09:00',
    end: '09:30',
    patient: 'Maria Santos',
    type: 'Consultation',
    color: 'var(--vestara-accent-shell)',
    status: 'Confirmed',
    location: 'Telehealth',
  },
  {
    id: 2,
    day: 27,
    time: '10:30',
    end: '11:30',
    patient: 'James Carter',
    type: 'Therapy',
    color: 'var(--vestara-marketplace-agent)',
    status: 'Confirmed',
    location: 'In-person',
  },
  {
    id: 3,
    day: 27,
    time: '14:00',
    end: '14:15',
    patient: 'Aisha Patel',
    type: 'Follow-up',
    color: 'var(--vestara-status-shell-success)',
    status: 'Confirmed',
    location: 'Mobile',
  },
  {
    id: 4,
    day: 27,
    time: '15:30',
    end: '17:00',
    patient: 'SUD Group (8)',
    type: 'Group Session',
    color: 'var(--vestara-status-shell-warning)',
    status: 'Confirmed',
    location: 'Group Room',
  },
  {
    id: 5,
    day: 28,
    time: '09:30',
    end: '10:00',
    patient: 'Robert Kim',
    type: 'Consultation',
    color: 'var(--vestara-accent-shell)',
    status: 'Confirmed',
    location: 'Telehealth',
  },
  {
    id: 6,
    day: 28,
    time: '11:00',
    end: '12:00',
    patient: 'Lisa Chen',
    type: 'Therapy',
    color: 'var(--vestara-marketplace-agent)',
    status: 'Pending',
    location: 'In-person',
  },
];
