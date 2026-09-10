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
    case 'passed': return 'text-emerald-400';
    case 'failed': return 'text-red-400';
    case 'unknown': return 'text-zinc-400';
    default: return 'text-zinc-400';
  }
}

function verdictBg(verdict?: string): string {
  switch (verdict) {
    case 'passed': return 'bg-emerald-500/15';
    case 'failed': return 'bg-red-500/15';
    case 'unknown': return 'bg-zinc-800/60';
    default: return 'bg-zinc-800/60';
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
      className="min-w-0 rounded-xl border border-zinc-800/70 bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 overflow-hidden"
    >
      {/* Header: lifecycle + verdict + actions */}
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
        {/* Lifecycle indicator */}
        {detail.state === 'running' ? (
          <span data-testid="verification-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-amber-500/15">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 motion-reduce:animate-none animate-pulse" aria-hidden="true" />
          </span>
        ) : isPassed ? (
          <span data-testid="verification-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-[10px] leading-none text-emerald-400" aria-hidden="true">
            ✓
          </span>
        ) : isFailed ? (
          <span data-testid="verification-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-[10px] leading-none text-red-400" aria-hidden="true">
            ✕
          </span>
        ) : (
          <span data-testid="verification-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-zinc-800/60 text-[10px] leading-none text-zinc-500" aria-hidden="true">
            ?
          </span>
        )}

        {/* Verdict toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} verification details`}
          className="flex min-w-0 items-center gap-1.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500/60"
          data-testid="verification-toggle"
        >
          <span aria-hidden="true" className="text-[10px] text-zinc-600 shrink-0">
            {expanded ? '▾' : '▸'}
          </span>
          <span className={`text-[12px] leading-snug font-medium shrink-0 ${verdictColor(detail.verdict)}`}>
            {verdictLabel(detail.verdict)}
          </span>
          <span className="text-[12px] leading-snug text-zinc-500">Verification</span>
        </button>

        {/* Evidence badge */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {hasEvidence ? (
            <span
              data-testid="verification-evidence"
              className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400/80"
            >
              Evidence
            </span>
          ) : (
            <span
              data-testid="verification-evidence"
              className="rounded bg-zinc-800/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600"
            >
              No evidence
            </span>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div data-testid="verification-details" className="border-t border-zinc-800/70 px-3 py-2">
          <div className="space-y-1 text-[11px] text-zinc-500">
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">State:</span>
              <span className={isFailed ? 'text-red-400' : 'text-zinc-300'}>{detail.state}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">Verdict:</span>
              <span className={verdictColor(detail.verdict)}>{detail.verdict ?? 'unknown'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">Evidence:</span>
              <span className="text-zinc-300">{detail.evidence}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
