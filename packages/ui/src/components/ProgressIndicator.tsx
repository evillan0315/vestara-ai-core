/**
 * VES-UI: ProgressIndicator Component (UI-COMP-001 Phase 7D canonical primitive)
 *
 * Determinate linear progress with explicit value normalization at the
 * presentation boundary. A lightweight semantic div implementation was
 * chosen over native <progress> (vendor pseudo-element styling cannot be
 * canonically themed — the Activity Room lane already carries webkit/moz
 * overrides proving it) and over MUI LinearProgress (no MUI dependency
 * exists in this package; adding one for a determinate bar is unjustified).
 *
 * Presentation-only, domain-independent: no workflow, execution, agent,
 * verification, routing, or runtime imports. Statuses such as
 * building/testing/verifying remain consumer data mapped to tone.
 *
 * Architecture Traceability:
 *   UI-COMP-001 Phase 2 §G → Phase 7D Slice 4
 */

import type { CSSProperties } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type ProgressTone = 'accent' | 'success' | 'warning' | 'error';

export interface ProgressIndicatorProps {
  /** Current progress value; normalized into [0, max]. Non-finite values render as 0. */
  value: number;
  /** Scale maximum; defaults to 100. Non-finite or non-positive values fall back to 100. */
  max?: number;
  /** Semantic fill tone; the consumer maps domain state to presentation tone. Defaults to 'accent'. */
  tone?: ProgressTone;
  /** Accessible name for the progressbar. */
  label?: string;
  /** className applied to the track container. */
  className?: string;
}

// ─── Token maps (static literals for Tailwind; canonical tokens only) ───

const TONE_FILL: Record<ProgressTone, string> = {
  accent: 'bg-[var(--vestara-accent)]',
  success: 'bg-[var(--vestara-status-success)]',
  warning: 'bg-[var(--vestara-status-warning)]',
  error: 'bg-[var(--vestara-status-error)]',
};

// ─── Component ─────────────────────────────────────────────────

export function ProgressIndicator({
  value,
  max = 100,
  tone = 'accent',
  label,
  className = '',
}: ProgressIndicatorProps) {
  const safeMax = typeof max === 'number' && Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const clamped = Math.min(safeMax, Math.max(0, safeValue));
  const percent = (clamped / safeMax) * 100;
  // Stable ARIA value without float noise; visual width uses full precision.
  const ariaValue = Math.round(clamped * 100) / 100;
  const fillStyle: CSSProperties = { width: `${percent}%` };

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={ariaValue}
      aria-label={label}
      className={`flex w-full overflow-hidden rounded-full bg-[var(--vestara-surface-interactive)] h-[var(--vestara-spacing-element)] ${className}`}
    >
      <div className={`h-full rounded-full transition-[width] duration-300 ${TONE_FILL[tone]}`} style={fillStyle} />
    </div>
  );
}

export default ProgressIndicator;
