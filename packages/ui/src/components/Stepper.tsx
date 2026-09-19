/**
 * VES-UI: Stepper Component (UI-COMP-001 Phase 7E canonical primitive)
 *
 * Discrete ordered process-state rendering: vertical marker + connector
 * sequence over consumer-provided steps. Sibling of ProgressIndicator
 * (quantitative completion), never built over it — a step list is not a
 * fraction, and coupling them would conflate stage state with percentages.
 *
 * Data-driven API (matching the Tabs precedent): consumers map domain
 * state to the four presentation states. Optional per-step selection
 * exists because current consumers (qualification WorkflowStage) provide
 * stage-click navigation; steps without onSelect render non-interactive.
 *
 * Only vertical orientation is provided: every observed consumer renders
 * a vertical stage list (the compact horizontal execution pulse is a
 * different visualization, not a horizontal stepper).
 *
 * Presentation-only, domain-independent: no workflow, execution, agent,
 * verification, routing, or runtime imports. Domain states such as
 * requested/queued/building/testing/verifying never appear here.
 *
 * Architecture Traceability:
 *   UI-COMP-001 Phase 2 §E → Phase 7E Slice 5
 */

import type { ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type StepState = 'complete' | 'current' | 'upcoming' | 'error';

export interface StepDefinition {
  /** Stable step identity; reported to onSelect. */
  id: string;
  /** Step label. */
  label: ReactNode;
  /** Optional supporting text. */
  description?: ReactNode;
  /** Presentation state; the consumer maps domain state to it. */
  state: StepState;
}

export interface StepperProps {
  /** Ordered steps; rendered in array order. An empty array renders an empty list. */
  steps: readonly StepDefinition[];
  /** Optional step activation; when omitted, steps render non-interactive. */
  onSelect?: (id: string) => void;
  /** className applied to the root list. */
  className?: string;
}

// ─── Marker presentation (generic process glyphs; canonical tokens only) ───

const MARKER_TONE: Record<StepState, string> = {
  complete: 'border-[var(--vestara-status-success)] text-[var(--vestara-status-success)]',
  current: 'border-[var(--vestara-accent)] text-[var(--vestara-accent)]',
  upcoming: 'border-[var(--vestara-border-default)] text-[var(--vestara-text-disabled)]',
  error: 'border-[var(--vestara-status-error)] text-[var(--vestara-status-error)]',
};

const MARKER_GLYPH: Record<StepState, ReactNode> = {
  complete: '✓',
  current: '●',
  upcoming: null,
  error: '!',
};

// ─── Component ─────────────────────────────────────────────────

export function Stepper({ steps, onSelect, className = '' }: StepperProps) {
  return (
    <ol className={className}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const headerClass = 'flex min-w-0 flex-1 items-start gap-2 text-left';
        const header = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-[var(--vestara-text-primary)]">
                {step.label}
              </span>
              {step.description !== undefined && (
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--vestara-text-muted)]">
                  {step.description}
                </span>
              )}
            </span>
          </>
        );

        return (
          <li key={step.id} aria-current={step.state === 'current' ? 'step' : undefined} className="flex gap-2">
            <span aria-hidden="true" className="flex flex-col items-center">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] leading-none ${MARKER_TONE[step.state]} ${
                  step.state === 'current' ? 'animate-pulse' : ''
                }`}
              >
                {MARKER_GLYPH[step.state]}
              </span>
              {!isLast && <span className="w-px flex-1 bg-[var(--vestara-border-subtle)]" />}
            </span>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(step.id)} className={`cursor-pointer ${headerClass}`}>
                {header}
              </button>
            ) : (
              <div className={headerClass}>{header}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default Stepper;
