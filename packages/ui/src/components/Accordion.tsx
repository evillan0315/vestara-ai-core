/**
 * VES-UI: Accordion Component (UI-COMP-001 Phase 7C canonical primitive)
 *
 * Single-exclusive disclosure coordination over the canonical Collapsible
 * leaf. Accordion owns item identity and exclusive-open behavior only;
 * Collapsible owns trigger presentation and the trigger/content ARIA
 * relationship. No second disclosure implementation exists here.
 *
 * Only single-exclusive mode is provided: every demonstrated consumer
 * (workflow units, execution rows, team rows, tool-call rows) coordinates
 * with `string | null` state. Multi-expand is deferred until a consumer
 * justifies it.
 *
 * Presentation-only, domain-independent: no WorkflowUnit, ActivityRecord,
 * execution, agent, routing, or runtime imports. Statuses such as
 * failed/running/completed remain consumer data.
 *
 * Architecture Traceability:
 *   UI-COMP-001 Phase 2 §D → Phase 7C Slice 3
 */

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { Collapsible } from './Collapsible.js';

// ─── Types ─────────────────────────────────────────────────────

export interface AccordionProps {
  /** Currently open item value, or null when all items are closed. */
  value: string | null;
  /** Called with the next value: the newly opened item, or null when the open item was toggled shut. */
  onValueChange: (value: string | null) => void;
  children: ReactNode;
  /** className applied to the root container. */
  className?: string;
}

export interface AccordionItemProps {
  /** Stable item identity; compared against Accordion value. */
  value: string;
  /** Header content (chevrons/indicators are the consumer's choice). */
  trigger: ReactNode;
  /** Item content; mounted only while the item is open. */
  children: ReactNode;
  /** className applied to the item container. */
  className?: string;
  /** className applied to the item trigger button. */
  triggerClassName?: string;
  /** className applied to the item content region. */
  contentClassName?: string;
}

interface AccordionContextValue {
  value: string | null;
  onItemToggle: (itemValue: string) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordionContext(): AccordionContextValue {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error('AccordionItem must be used within Accordion');
  return ctx;
}

// ─── Accordion ─────────────────────────────────────────────────

export function Accordion({ value, onValueChange, children, className = '' }: AccordionProps) {
  const onItemToggle = useCallback(
    (itemValue: string) => {
      onValueChange(value === itemValue ? null : itemValue);
    },
    [value, onValueChange],
  );

  const contextValue = useMemo(() => ({ value, onItemToggle }), [value, onItemToggle]);

  return (
    <AccordionContext.Provider value={contextValue}>
      <div className={className}>{children}</div>
    </AccordionContext.Provider>
  );
}

// ─── AccordionItem ─────────────────────────────────────────────

export function AccordionItem({
  value,
  trigger,
  children,
  className = '',
  triggerClassName = '',
  contentClassName = '',
}: AccordionItemProps) {
  const ctx = useAccordionContext();

  return (
    <Collapsible
      open={ctx.value === value}
      onOpenChange={() => ctx.onItemToggle(value)}
      trigger={trigger}
      className={className}
      triggerClassName={triggerClassName}
      contentClassName={contentClassName}
    >
      {children}
    </Collapsible>
  );
}

export default Accordion;
