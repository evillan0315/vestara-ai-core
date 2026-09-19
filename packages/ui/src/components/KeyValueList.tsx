/**
 * VES-UI: KeyValueList Component (UI-COMP-001 Phase 7G canonical primitive)
 *
 * Generic metadata/details presentation over semantic definition-list
 * structure. Each row pairs a muted label (dt) with a value (dd) that
 * wraps by default — operational values (paths, hashes, identifiers) must
 * never silently lose text. Opt-in truncation keeps the full string
 * accessible via title; non-string values keep consumer-provided titles.
 *
 * Long-value containment uses overflow-wrap:anywhere with min-width:0 so
 * unbroken strings cannot destroy container geometry (established
 * precedent in the Activity Room stream records).
 *
 * Presentation-only, domain-independent: keys such as workflowId,
 * producer, or repository are consumer data, never interpreted here.
 *
 * Architecture Traceability:
 *   UI-COMP-001 Phase 2 §L → Phase 7G Slice 7b
 */

import type { ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export interface KeyValueItem {
  /** Stable row identity. */
  id: string;
  /** Row label. */
  label: ReactNode;
  /** Row value; wrapped by default, never calculated here. */
  value: ReactNode;
  /**
   * Truncate with ellipsis instead of wrapping. The full string stays
   * accessible via title when the value is a string; ReactNode values
   * carry their own title from the consumer.
   */
  truncate?: boolean;
}

export interface KeyValueListProps {
  /** Rows in consumer order. An empty array renders an empty list. */
  items: readonly KeyValueItem[];
  /** className applied to the root list. */
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────

export function KeyValueList({ items, className = '' }: KeyValueListProps) {
  return (
    <dl className={className}>
      {items.map((item) => {
        const truncated = item.truncate === true;
        const stringValue = typeof item.value === 'string' ? item.value : undefined;
        return (
          <div key={item.id} className="flex min-w-0 justify-between gap-3">
            <dt className="shrink-0 text-[var(--vestara-text-muted)]">{item.label}</dt>
            <dd
              className={`min-w-0 text-[var(--vestara-text-secondary)] [overflow-wrap:anywhere] ${
                truncated ? 'truncate' : ''
              }`}
              title={truncated ? stringValue : undefined}
            >
              {item.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export default KeyValueList;
