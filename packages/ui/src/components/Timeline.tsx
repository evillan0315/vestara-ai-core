/**
 * VES-UI: Timeline Component (UI-COMP-001 Phase 7F canonical primitive)
 *
 * Chronological event rendering: vertical marker rail over
 * consumer-provided items. Ordering, timestamp formatting, and timestamp
 * interpretation remain entirely outside the primitive — consumers pass
 * preformatted content and the array order they mean.
 *
 * Data-driven API (matching the Tabs/Stepper precedent): Timeline takes
 * items; TimelineItem is the shared item renderer, exported for custom
 * layouts and used internally so only one marker implementation exists.
 *
 * Presentation-only, domain-independent: no session, harness, workflow,
 * execution, agent, routing, or runtime imports. Statuses, kinds, and
 * observation levels remain consumer data mapped to tone.
 *
 * Architecture Traceability:
 *   UI-COMP-001 Phase 2 §F → Phase 7F Slice 6
 */

import type { ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type TimelineTone = 'accent' | 'success' | 'warning' | 'error' | 'muted';

export interface TimelineItemDefinition {
  /** Stable item identity. */
  id: string;
  /** Primary line; the consumer composes label, glyphs, and preformatted time. */
  title: ReactNode;
  /** Optional secondary line (byline, kind, detail). */
  meta?: ReactNode;
  /** Marker tone; the consumer maps domain state to presentation tone. Defaults to 'muted'. */
  tone?: TimelineTone;
}

export interface TimelineProps {
  /** Events in consumer order; rendered top to bottom. An empty array renders an empty list. */
  items: readonly TimelineItemDefinition[];
  /** className applied to the root list. */
  className?: string;
}

export interface TimelineItemProps {
  /** Marker tone. Defaults to 'muted'. */
  tone?: TimelineTone;
  /** Primary line. */
  title: ReactNode;
  /** Optional secondary line. */
  meta?: ReactNode;
  /** True for the final item: omits the trailing connector. */
  last?: boolean;
}

// ─── Marker tones (static literals for Tailwind; canonical tokens only) ───

const TONE_DOT: Record<TimelineTone, string> = {
  accent: 'bg-[var(--vestara-accent)]',
  success: 'bg-[var(--vestara-status-success)]',
  warning: 'bg-[var(--vestara-status-warning)]',
  error: 'bg-[var(--vestara-status-error)]',
  muted: 'bg-[var(--vestara-status-idle)]',
};

// ─── TimelineItem ──────────────────────────────────────────────

export function TimelineItem({ tone = 'muted', title, meta, last = false }: TimelineItemProps) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="flex w-4 shrink-0 flex-col items-center">
        <span className={`mt-1.5 h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
        {!last && <span className="w-px min-h-[20px] flex-1 bg-[var(--vestara-border-subtle)]" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="min-w-0">{title}</div>
        {meta !== undefined && <div className="min-w-0">{meta}</div>}
      </div>
    </li>
  );
}

// ─── Timeline ──────────────────────────────────────────────────

export function Timeline({ items, className = '' }: TimelineProps) {
  return (
    <ol className={className}>
      {items.map((item, index) => (
        <TimelineItem
          key={item.id}
          tone={item.tone}
          title={item.title}
          meta={item.meta}
          last={index === items.length - 1}
        />
      ))}
    </ol>
  );
}

export default Timeline;
