/**
 * VOS-STARTUP-001 P1: Readiness Checklist
 *
 * Six-row health list. Completed rows use accent check circles;
 * pending rows use outlined circles; failed rows use error tone.
 */

import type { StartupChecklistRow } from '../startup.types';

function RowIcon({ status }: { status: StartupChecklistRow['status'] }) {
  if (status === 'complete') {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 items-center justify-center rounded-[var(--vestara-radius-full)] bg-[var(--st-check-done-bg)] text-[length:var(--vestara-font-size-xs)]"
      >
        ✓
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 items-center justify-center rounded-[var(--vestara-radius-full)] bg-[var(--st-check-failed-bg)] text-[var(--st-check-failed-fg)]"
      >
        !
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="size-5 rounded-[var(--vestara-radius-full)] border border-[var(--st-check-pending-border)]"
    />
  );
}

export function ReadinessChecklist({ rows }: { rows: readonly StartupChecklistRow[] }) {
  return (
    <ul className="w-full space-y-[var(--vestara-spacing-element)]" aria-label="Startup readiness">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-[var(--vestara-spacing-element)]">
          <RowIcon status={row.status} />
          <span className="text-[length:var(--vestara-font-size-sm)] text-[var(--st-sub)]">{row.label}</span>
        </li>
      ))}
    </ul>
  );
}
