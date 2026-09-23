/**
 * DecisionState (REC-034)
 *
 * Renders the lifecycle state of a structured interaction:
 *   - presented: awaiting response
 *   - responded: human has selected (shows which choice was selected)
 *   - expired: stale, downstream authorities must re-evaluate
 *
 * Uses the ArtifactStatusChip pattern (status-to-color mapping)
 * with non-color-dependent indicators (icons + text).
 */

import type { InteractionLifecycle, InteractionResponse, InteractionChoice, ChoiceId } from '@vestara/types';

// ─── Types ───────────────────────────────────────────────────

export interface DecisionStateProps {
  /** The lifecycle state to present. */
  readonly state: InteractionLifecycle;

  /** Optional response details for 'responded' state. */
  readonly response?: InteractionResponse;

  /** The original choices (for showing which was selected). */
  readonly choices?: readonly InteractionChoice[];
}

// ─── State Config ────────────────────────────────────────────

const STATE_CONFIG: Record<
  InteractionLifecycle,
  { bg: string; text: string; dot: string; label: string; icon: string }
> = {
  presented: {
    bg: 'bg-[var(--vestara-status-warning-bg)]',
    text: 'text-[var(--vestara-status-warning)]',
    dot: 'bg-[var(--vestara-status-warning)]',
    label: 'Awaiting response',
    icon: '⏳',
  },
  responded: {
    bg: 'bg-[var(--vestara-status-success-bg)]',
    text: 'text-[var(--vestara-status-success)]',
    dot: 'bg-[var(--vestara-status-success)]',
    label: 'Responded',
    icon: '✓',
  },
  expired: {
    bg: 'bg-[var(--vestara-surface-panel-raised)]',
    text: 'text-[var(--vestara-text-muted)]',
    dot: 'bg-[var(--vestara-status-disabled)]',
    label: 'Expired',
    icon: '⏱',
  },
};

// ─── Helpers ─────────────────────────────────────────────────

function findSelectedChoice(
  selectedChoiceId: ChoiceId,
  choices: readonly InteractionChoice[],
): InteractionChoice | undefined {
  return choices.find((c) => c.choiceId === selectedChoiceId);
}

// ─── Component ───────────────────────────────────────────────

export function DecisionState({ state, response, choices }: DecisionStateProps) {
  const config = STATE_CONFIG[state];

  const selectedChoice =
    state === 'responded' && response && choices
      ? findSelectedChoice(response.selectedChoiceId, choices)
      : undefined;

  return (
    <div className="flex items-center gap-2">
      {/* Status chip */}
      <span
        className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
        {config.label}
      </span>

      {/* Selected choice display for responded state */}
      {selectedChoice && (
        <span className="text-[10px] text-(--vestara-text-muted)">
          Selected: <span className="font-medium text-(--vestara-text-2)">{selectedChoice.label}</span>
        </span>
      )}

      {/* Response timestamp */}
      {response && (
        <span className="text-[9px] text-(--vestara-text-dim)">
          {formatResponseTime(response.respondedAt)}
        </span>
      )}
    </div>
  );
}

// ─── Timestamp Helper ────────────────────────────────────────

function formatResponseTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
