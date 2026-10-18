/**
 * GA-UX-PREMIUM M7 — AssistantVerification.
 *
 * Compact verification result presentation consuming the authoritative
 * `assistant.execution.v1` verification projection. Presentation-only:
 * verdict, evidence source, lifecycle — all from the bounded projection;
 * never reads repository state, never runs tests.
 *
 * Visual grammar: checkmark/cross icon, verdict label, evidence badge,
 * collapsed/expanded state. The invariant: execution completion is NOT
 * a verification verdict — a tool that ran successfully may still fail
 * verification.
 */

import { useCallback, useState } from 'react';
import type { VerificationExecutionDetail } from '@vestara/shared';

// ─── Helpers ──────────────────────────────────────────────────

function verdictLabel(verdict?: string): string {
  switch (verdict) {
    case 'passed': return 'Passed';
    case 'failed': return 'Failed';
    case 'unknown': return 'Unknown';
    default: return 'Verified';
  }
}

function verdictColor(verdict?: string): string {
  switch (verdict) {
    case 'passed': return 'text-(--vestara-status-success)';
    case 'failed': return 'text-(--vestara-status-error)';
    case 'unknown': return 'text-(--vestara-text-secondary)';
    default: return 'text-(--vestara-text-secondary)';
  }
}

function verdictBg(verdict?: string): string {
  switch (verdict) {
    case 'passed': return 'bg-(--vestara-status-success-bg)';
    case 'failed': return 'bg-(--vestara-status-error-bg)';
    case 'unknown': return 'bg-(--vestara-surface-interactive)/60';
    default: return 'bg-(--vestara-surface-interactive)/60';
  }
}

// ─── Component ────────────────────────────────────────────────

export interface AssistantVerificationProps {
  detail: VerificationExecutionDetail;
}

/**
 * M7: Verification result presentation. One card per verification.
 * Shows verdict with appropriate visual treatment and evidence source.
 */
export function AssistantVerification({ detail }: AssistantVerificationProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const isFailed = detail.state === 'failed' || detail.verdict === 'failed';
  const isPassed = detail.verdict === 'passed';
  const hasEvidence = detail.evidence === 'runtime-provided';

  return (
    <div
      data-testid="assistant-verification"
      data-state={detail.state}
      data-verdict={detail.verdict ?? 'unknown'}
      className="min-w-0 rounded-xl border border-(--vestara-border-default)/70 bg-gradient-to-b from-(--vestara-surface-shell)/80 to-(--vestara-surface-shell)/40 overflow-hidden"
    >
      {/* Header: lifecycle + verdict + actions */}
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
        {/* Lifecycle indicator — verification state is terminal ('completed' | 'failed'). */}
        {isPassed ? (
          <span data-testid="verification-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-(--vestara-status-success-bg) text-(--vestara-font-size-caption) leading-none text-(--vestara-status-success)" aria-hidden="true">
            ✓
          </span>
        ) : isFailed ? (
          <span data-testid="verification-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-(--vestara-status-error-bg) text-(--vestara-font-size-caption) leading-none text-(--vestara-status-error)" aria-hidden="true">
            ✕
          </span>
        ) : (
          <span data-testid="verification-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-(--vestara-surface-interactive)/60 text-(--vestara-font-size-caption) leading-none text-(--vestara-text-muted)" aria-hidden="true">
            ?
          </span>
        )}

        {/* Verdict toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} verification details`}
          className="flex min-w-0 items-center gap-1.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-(--vestara-accent)/60"
          data-testid="verification-toggle"
        >
          <span aria-hidden="true" className="text-(--vestara-font-size-caption) text-(--vestara-text-disabled) shrink-0">
            {expanded ? '▾' : '▸'}
          </span>
          <span className={`text-(--vestara-font-size-body-small) leading-snug font-medium shrink-0 ${verdictColor(detail.verdict)}`}>
            {verdictLabel(detail.verdict)}
          </span>
          <span className="text-(--vestara-font-size-body-small) leading-snug text-(--vestara-text-muted)">Verification</span>
        </button>

        {/* Evidence badge */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {hasEvidence ? (
            <span
              data-testid="verification-evidence"
              className="rounded bg-(--vestara-status-success-bg) px-1.5 py-0.5 text-(--vestara-font-size-caption) font-medium text-(--vestara-status-success)/80"
            >
              Evidence
            </span>
          ) : (
            <span
              data-testid="verification-evidence"
              className="rounded bg-(--vestara-surface-interactive)/60 px-1.5 py-0.5 text-(--vestara-font-size-caption) font-medium text-(--vestara-text-disabled)"
            >
              No evidence
            </span>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div data-testid="verification-details" className="border-t border-(--vestara-border-default)/70 px-3 py-2">
          <div className="space-y-1 text-(--vestara-font-size-label) text-(--vestara-text-muted)">
            <div className="flex items-center gap-2">
              <span className="text-(--vestara-text-disabled)">State:</span>
              <span className={isFailed ? 'text-(--vestara-status-error)' : 'text-(--vestara-text-primary)'}>{detail.state}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-(--vestara-text-disabled)">Verdict:</span>
              <span className={verdictColor(detail.verdict)}>{detail.verdict ?? 'unknown'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-(--vestara-text-disabled)">Evidence:</span>
              <span className="text-(--vestara-text-primary)">{detail.evidence}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
