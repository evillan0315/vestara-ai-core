/**
 * VES-UI: MetricCard Component (UI-COMP-001 Phase 7G canonical primitive)
 *
 * Generic compact presentation of one metric: label, value, optional hint.
 * Tone is a decorative accent-bar treatment only — the value itself always
 * renders in primary text, so meaning never depends on color. No icon prop:
 * no non-domain consumer demonstrates one (Activity Room metric icons stay
 * domain-owned until that migration lands).
 *
 * Label/value association relies on DOM order (label before value) rather
 * than ARIA widgets: a metric is static text. Definition-list semantics
 * were evaluated and rejected for standalone cards — dt/dd require a dl
 * ancestor, and card grids are not definition lists.
 *
 * Presentation-only, domain-independent: no workflow, agent, queue,
 * verification, runtime, or Activity Room imports. Consumers map domain
 * counts into generic props; the card never calculates its value.
 *
 * Architecture Traceability:
 *   UI-COMP-001 Phase 2 §K → Phase 7G Slice 7a
 */

import type { ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type MetricTone = 'accent' | 'success' | 'warning' | 'error' | 'muted';

export interface MetricCardProps {
  /** Metric label (micro-caps above the value). */
  label: ReactNode;
  /** Metric value; rendered verbatim, never calculated here. */
  value: ReactNode;
  /** Optional supporting line below the value. */
  hint?: ReactNode;
  /** Accent-bar tone. Defaults to 'accent'. */
  tone?: MetricTone;
  /** className applied to the root container. */
  className?: string;
}

// ─── Tone map (static literals for Tailwind; canonical tokens only) ───

const TONE_ACCENT: Record<MetricTone, string> = {
  accent: 'border-l-[var(--vestara-accent)]',
  success: 'border-l-[var(--vestara-status-success)]',
  warning: 'border-l-[var(--vestara-status-warning)]',
  error: 'border-l-[var(--vestara-status-error)]',
  muted: 'border-l-[var(--vestara-border-subtle)]',
};

// ─── Component ─────────────────────────────────────────────────

export function MetricCard({ label, value, hint, tone = 'accent', className = '' }: MetricCardProps) {
  return (
    <div
      className={`rounded-lg border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] border-l-[3px] p-3 ${TONE_ACCENT[tone]} ${className}`}
    >
      <div className="text-[9px] uppercase tracking-widest text-[var(--vestara-text-muted)]">{label}</div>
      <div className="mt-1 text-lg font-bold text-[var(--vestara-text-primary)]">{value}</div>
      {hint !== undefined && <div className="mt-0.5 text-[9px] text-[var(--vestara-text-muted)]">{hint}</div>}
    </div>
  );
}

export default MetricCard;
