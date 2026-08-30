/**
 * InteractionAsyncFeedback (REC-035)
 *
 * Renders asynchronous feedback states for interaction responses:
 *   - idle: no action taken
 *   - submitting: response being sent
 *   - accepted: response recorded successfully
 *   - failure: response failed, with retry option
 *   - retrying: retrying after failure
 *   - unavailable: service temporarily unavailable
 *   - stale: interaction is no longer current
 *
 * Uses aria-live="polite" for status changes that need screen reader announcement.
 * Composes existing Alert/toast patterns.
 */

import type { InteractionResponse } from '@vestara/types';

// ─── Types ───────────────────────────────────────────────────

export type InteractionFeedbackState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'accepted'; readonly response: InteractionResponse }
  | { readonly status: 'failure'; readonly error: string; readonly retryable: boolean }
  | { readonly status: 'retrying'; readonly attempt: number }
  | { readonly status: 'unavailable' }
  | { readonly status: 'stale' };

export interface InteractionAsyncFeedbackProps {
  readonly state: InteractionFeedbackState;
  readonly onRetry?: () => void;
}

// ─── State Config ────────────────────────────────────────────

const FEEDBACK_CONFIG: Record<
  string,
  { bg: string; text: string; icon: string; label: (state: InteractionFeedbackState) => string }
> = {
  idle: {
    bg: '',
    text: '',
    icon: '',
    label: () => '',
  },
  submitting: {
    bg: 'bg-amber-400/10',
    text: 'text-amber-300',
    icon: '⟳',
    label: () => 'Submitting…',
  },
  accepted: {
    bg: 'bg-green-400/10',
    text: 'text-green-300',
    icon: '✓',
    label: () => 'Response recorded',
  },
  failure: {
    bg: 'bg-red-400/10',
    text: 'text-red-300',
    icon: '✕',
    label: (s) => (s.status === 'failure' ? s.error : 'Failed'),
  },
  retrying: {
    bg: 'bg-amber-400/10',
    text: 'text-amber-300',
    icon: '⟳',
    label: (s) => (s.status === 'retrying' ? `Retrying (${s.attempt})…` : 'Retrying…'),
  },
  unavailable: {
    bg: 'bg-zinc-600/30',
    text: 'text-zinc-400',
    icon: '⚠',
    label: () => 'Service unavailable',
  },
  stale: {
    bg: 'bg-zinc-600/30',
    text: 'text-zinc-400',
    icon: '⏱',
    label: () => 'Interaction is no longer current',
  },
};

// ─── Component ───────────────────────────────────────────────

export function InteractionAsyncFeedback({ state, onRetry }: InteractionAsyncFeedbackProps) {
  // Idle state renders nothing
  if (state.status === 'idle') {
    return null;
  }

  const config = FEEDBACK_CONFIG[state.status];
  const label = config.label(state);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}
    >
      {/* Animated spinner for submitting/retrying */}
      {(state.status === 'submitting' || state.status === 'retrying') && (
        <span className="animate-spin" aria-hidden="true">
          ⟳
        </span>
      )}

      {/* Static icon for other states */}
      {state.status !== 'submitting' && state.status !== 'retrying' && (
        <span aria-hidden="true">{config.icon}</span>
      )}

      <span>{label}</span>

      {/* Retry button for retryable failures */}
      {state.status === 'failure' && state.retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 text-[10px] underline text-(--vestara-accent-text) hover:text-(--vestara-accent) cursor-pointer focus:outline-none focus:ring-1 focus:ring-(--vestara-accent-border-active) rounded"
        >
          Retry
        </button>
      )}
    </div>
  );
}
