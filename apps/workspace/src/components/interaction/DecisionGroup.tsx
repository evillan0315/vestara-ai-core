/**
 * DecisionGroup (REC-032)
 *
 * Reusable container for rendering an ordered collection of DecisionOption
 * primitives. Manages keyboard navigation (arrow keys) between options.
 * Supports both controlled and uncontrolled selection modes.
 *
 * Uses role="radiogroup" for accessible grouping semantics.
 * The group is domain-neutral — it renders whatever choices it receives.
 */

import { useCallback, useRef, useState } from 'react';
import type { InteractionChoice, ChoiceId } from '@vestara/types';
import { DecisionOption } from './DecisionOption';

// ─── Types ───────────────────────────────────────────────────

export interface DecisionGroupProps {
  /** The choices to render. From StructuredInteraction.choices. */
  readonly choices: readonly InteractionChoice[];

  /** Callback when a choice is selected. Emits the opaque ChoiceId. */
  readonly onSelect: (choiceId: ChoiceId) => void;

  /** Currently selected choice (controlled mode). Undefined for uncontrolled. */
  readonly selectedChoiceId?: ChoiceId;

  /** Whether all choices are disabled. */
  readonly disabled?: boolean;

  /** Layout variant. */
  readonly layout?: 'vertical' | 'horizontal';

  /** Accessible label for the group. */
  readonly ariaLabel?: string;
}

// ─── Component ───────────────────────────────────────────────

export function DecisionGroup({
  choices,
  onSelect,
  selectedChoiceId: controlledSelected,
  disabled = false,
  layout = 'vertical',
  ariaLabel = 'Choose an option',
}: DecisionGroupProps) {
  const [internalSelected, setInternalSelected] = useState<ChoiceId | undefined>(undefined);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Use controlled if provided, otherwise internal state
  const selectedChoiceId = controlledSelected ?? internalSelected;

  const handleSelect = useCallback(
    (choiceId: ChoiceId) => {
      if (controlledSelected === undefined) {
        setInternalSelected(choiceId);
      }
      onSelect(choiceId);
    },
    [controlledSelected, onSelect],
  );

  // Arrow key navigation between options
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      const currentIndex = optionRefs.current.findIndex(
        (ref) => ref === document.activeElement,
      );

      let nextIndex: number | null = null;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        nextIndex = currentIndex < choices.length - 1 ? currentIndex + 1 : 0;
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        nextIndex = currentIndex > 0 ? currentIndex - 1 : choices.length - 1;
      }

      if (nextIndex !== null) {
        optionRefs.current[nextIndex]?.focus();
      }
    },
    [choices.length, disabled],
  );

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      className={`flex ${layout === 'horizontal' ? 'flex-row flex-wrap gap-2' : 'flex-col gap-1.5'}`}
    >
      {choices.map((choice, index) => (
        <DecisionOption
          key={choice.choiceId}
          choice={choice}
          onSelect={handleSelect}
          selected={selectedChoiceId === choice.choiceId}
          disabled={disabled}
          ref={(el) => {
            optionRefs.current[index] = el;
          }}
        />
      ))}
    </div>
  );
}
