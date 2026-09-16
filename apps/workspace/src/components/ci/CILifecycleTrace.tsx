/**
 * CI-UI-003 — CI verification wait lifecycle (content trail).
 *
 * Renders the accepted relationship:
 *   Workflow Task → awaiting-verification → GitHub CI → CI Observation
 *   → Vestara Verification → resumed
 *
 * Descriptive only: it renders authoritative state where the backend supplies
 * it and marks the rest unavailable (HOLD). It never advances a stage alone.
 */

import { StatusIndicator, type StatusVariant } from '@vestara/ui';
import type { CILifecycleStage, CILifecycleStageState } from './ci-view-model.js';

const STATE_STYLE: Record<CILifecycleStageState, { lamp: StatusVariant; text: string; label: string }> = {
  complete: { lamp: 'live', text: 'text-[var(--vestara-status-success)]', label: 'Complete' },
  active: { lamp: 'warn', text: 'text-[var(--vestara-status-info)]', label: 'Active' },
  pending: { lamp: 'idle', text: 'text-[var(--vestara-text-muted)]', label: 'Pending' },
  unknown: { lamp: 'idle', text: 'text-[var(--vestara-text-muted)]', label: 'UNKNOWN' },
  unavailable: { lamp: 'off', text: 'text-[var(--vestara-text-muted)]', label: 'HOLD' },
};

function Stage({ stage, last }: { stage: CILifecycleStage; last: boolean }) {
  const style = STATE_STYLE[stage.state];
  return (
    <li className="flex min-w-0 flex-1 flex-col gap-1" aria-label={`${stage.label}: ${style.label}`}>
      <span className="flex items-center gap-2">
        <StatusIndicator variant={style.lamp} size="xs" pulse={stage.state === 'active'} />
        <span className={`text-[var(--vestara-font-size-xs)] font-semibold ${style.text}`}>{stage.label}</span>
        {!last && <span aria-hidden="true" className="hidden h-px flex-1 bg-[var(--vestara-border-subtle)] sm:block" />}
      </span>
      {stage.detail && (
        <span
          className="truncate text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]"
          title={stage.detail}
        >
          {stage.detail}
        </span>
      )}
    </li>
  );
}

/** Bare stage trail, reusable inside a host-owned section. */
export function CILifecycleStages({ stages }: { stages: readonly CILifecycleStage[] }) {
  return (
    <ol className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-2 sm:px-5">
      {stages.map((stage, index) => (
        <Stage key={stage.id} stage={stage} last={index === stages.length - 1} />
      ))}
    </ol>
  );
}
