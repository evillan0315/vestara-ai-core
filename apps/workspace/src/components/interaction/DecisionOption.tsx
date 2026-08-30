/**
 * DecisionOption (REC-033)
 *
 * Accessible primitive that renders a single choice within a DecisionGroup.
 * Emits `onSelect(choiceId)` when activated. The choiceId is opaque —
 * this component has no knowledge of what the choice means.
 *
 * Renders as a `<button>` with native focus management.
 * Supports keyboard activation (Enter/Space).
 * Selected state is communicated by border style + check icon, not color alone.
 */

import { forwardRef, useCallback } from 'react';
import type { InteractionChoice, ChoiceId } from '@vestara/types';

// ─── Types ───────────────────────────────────────────────────

export interface DecisionOptionProps {
  /** The choice to render. Domain-neutral. */
  readonly choice: InteractionChoice;

  /** Callback when this option is selected. Emits the opaque ChoiceId. */
  readonly onSelect: (choiceId: ChoiceId) => void;

  /** Whether this option is currently selected. */
  readonly selected?: boolean;

  /** Whether this option is disabled. */
  readonly disabled?: boolean;

  /** Visual variant. */
  readonly variant?: 'primary' | 'secondary' | 'destructive';
}

// ─── Styles ──────────────────────────────────────────────────

const VARIANT_STYLES = {
  primary: {
    base: 'border-(--vestara-accent-border) text-(--vestara-text-2)',
    selected:
      'border-(--vestara-accent-border-active) bg-(--vestara-accent-bg) text-(--vestara-accent-text)',
    hover: 'hover:border-(--vestara-accent-border-hover) hover:text-(--vestara-text)',
  },
  secondary: {
    base: 'border-zinc-700 text-(--vestara-text-2)',
    selected: 'border-zinc-500 bg-zinc-800/50 text-(--vestara-text)',
    hover: 'hover:border-zinc-600 hover:text-(--vestara-text)',
  },
  destructive: {
    base: 'border-zinc-700 text-(--vestara-text-2)',
    selected: 'border-red-500/40 bg-red-500/10 text-red-400',
    hover: 'hover:border-red-500/30 hover:text-red-300',
  },
} as const;

// ─── Component ───────────────────────────────────────────────

export const DecisionOption = forwardRef<HTMLButtonElement, DecisionOptionProps>(
  function DecisionOption(
    { choice, onSelect, selected = false, disabled = false, variant = 'primary' },
    ref,
  ) {
    const styles = VARIANT_STYLES[variant];

    const handleClick = useCallback(() => {
      if (!disabled) {
        onSelect(choice.choiceId);
      }
    }, [choice.choiceId, disabled, onSelect]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      },
      [handleClick],
    );

    return (
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`flex items-start gap-2 w-full text-left px-3 py-2 rounded-lg border text-[11px] leading-snug transition-colors
          ${selected ? styles.selected : styles.base}
          ${!selected && !disabled ? styles.hover : ''}
          ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
          focus:outline-none focus:ring-1 focus:ring-(--vestara-accent-border-active)
        `}
      >
        {/* Selection indicator — border style + icon, not color alone */}
        <span
          className={`shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center
            ${selected ? 'border-(--vestara-accent-border-active) bg-(--vestara-accent-bg)' : 'border-zinc-600'}
          `}
          aria-hidden="true"
        >
          {selected && (
            <span className="w-1.5 h-1.5 rounded-full bg-(--vestara-accent-text)" />
          )}
        </span>

        {/* Label */}
        <span className="flex-1 min-w-0">
          <span className="font-medium">{choice.label}</span>
          {choice.description && (
            <span className="block mt-0.5 text-[10px] text-(--vestara-text-muted) leading-relaxed">
              {choice.description}
            </span>
          )}
        </span>
      </button>
    );
  },
);
