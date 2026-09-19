/**
 * VES-UI: Collapsible Component (UI-COMP-001 Phase 7B canonical primitive)
 *
 * Controlled single-disclosure leaf: one trigger owns one content region.
 * Extracts the generic behavior behind M11CStreamItem's collapse toggles
 * and the workspace's native <details> usages — never their content.
 *
 * Presentation-only, domain-independent: no ActivityRecord, workflow,
 * execution, agent, routing, or runtime imports.
 *
 * Architecture Traceability:
 *   UI-COMP-001 Phase 2 §D → Phase 7B Slice 2
 */

import type { ReactNode } from 'react';
import { useId } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export interface CollapsibleProps {
  /** Controlled open state. */
  open: boolean;
  /** Called with the next open state when the trigger activates. */
  onOpenChange: (open: boolean) => void;
  /** Trigger content (chevrons/indicators are the consumer's choice). */
  trigger: ReactNode;
  /** Disclosed content; mounted only while open. */
  children: ReactNode;
  /** className applied to the root container. */
  className?: string;
  /** className applied to the trigger button. */
  triggerClassName?: string;
  /** className applied to the content region. */
  contentClassName?: string;
}

// ─── Component ─────────────────────────────────────────────────

export function Collapsible({
  open,
  onOpenChange,
  trigger,
  children,
  className = '',
  triggerClassName = '',
  contentClassName = '',
}: CollapsibleProps) {
  const uid = useId().replace(/:/g, '');
  const triggerId = `collapsible-${uid}-trigger`;
  const contentId = `collapsible-${uid}-content`;

  return (
    <div className={className}>
      <button
        type="button"
        id={triggerId}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => onOpenChange(!open)}
        className={`cursor-pointer ${triggerClassName}`}
      >
        {trigger}
      </button>
      {open && (
        <section id={contentId} aria-labelledby={triggerId} className={contentClassName}>
          {children}
        </section>
      )}
    </div>
  );
}

export default Collapsible;
