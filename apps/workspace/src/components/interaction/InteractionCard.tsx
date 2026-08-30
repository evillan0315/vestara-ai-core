/**
 * InteractionCard (REC-031)
 *
 * Generic container for rendering a StructuredInteraction with:
 *   - Content (prompt/message) rendered as markdown
 *   - DecisionGroup with choices
 *   - DecisionState showing lifecycle
 *   - InteractionAsyncFeedback for submission feedback
 *
 * This is a PURE PRESENTATION component. It understands:
 *   - StructuredInteraction (domain-neutral contract)
 *   - InteractionResponse (domain-neutral response)
 *   - ChoiceId as opaque identity
 *   - Presentation state (disabled, resolved, fresh)
 *
 * It does NOT understand:
 *   - What any choice means
 *   - Any domain-specific operations
 *   - Governance, authorization, or execution
 *
 * Labels such as "Approve", "Install", "Delete" are TEXT only.
 * They do not confer operational semantics on this component.
 */

import type {
  StructuredInteraction,
  InteractionResponse,
  ChoiceId,
  InteractionLifecycle,
} from '@vestara/types';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { DecisionGroup } from './DecisionGroup';
import { DecisionState } from './DecisionState';
import { InteractionAsyncFeedback } from './InteractionAsyncFeedback';
import type { InteractionFeedbackState } from './InteractionAsyncFeedback';

// ─── Types ───────────────────────────────────────────────────

export interface InteractionCardProps {
  /** The structured interaction to render. Domain-neutral. */
  readonly interaction: StructuredInteraction;

  /** Optional response if already responded. null = pending. */
  readonly response?: InteractionResponse;

  /** Callback when user selects a choice. Emits the opaque ChoiceId. */
  readonly onSelect: (choiceId: ChoiceId) => void;

  /** Current async feedback state. */
  readonly feedback?: InteractionFeedbackState;

  /** Whether the card is in a historical/resolved state. */
  readonly resolved?: boolean;

  /** Whether choices are disabled (e.g., already responded, loading). */
  readonly disabled?: boolean;

  /** Visual importance override (defaults to 'primary'). */
  readonly importance?: 'primary' | 'secondary' | 'muted';

  /** Whether this is a fresh item (for animation). */
  readonly fresh?: boolean;

  /** Accessible label override. */
  readonly ariaLabel?: string;
}

// ─── Importance Styles ───────────────────────────────────────

const IMPORTANCE_STYLES: Record<
  string,
  { border: string; bg: string; text: string; muted: string }
> = {
  primary: {
    border: 'border-(--vestara-accent-border)',
    bg: 'bg-(--vestara-accent-bg)',
    text: 'text-(--vestara-text)',
    muted: 'text-(--vestara-text-muted)',
  },
  secondary: {
    border: 'border-transparent',
    bg: 'bg-transparent',
    text: 'text-(--vestara-text-2)',
    muted: 'text-(--vestara-text-muted)',
  },
  muted: {
    border: 'border-transparent',
    bg: 'bg-transparent',
    text: 'text-(--vestara-text-muted)',
    muted: 'text-(--vestara-text-dim)',
  },
};

// ─── Helpers ─────────────────────────────────────────────────

function deriveLifecycle(interaction: StructuredInteraction, response?: InteractionResponse): InteractionLifecycle {
  if (response) return 'responded';
  // 'expired' requires downstream policy — not derivable here
  return 'presented';
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return timestamp;
  }
}

// ─── Component ───────────────────────────────────────────────

export function InteractionCard({
  interaction,
  response,
  onSelect,
  feedback,
  resolved = false,
  disabled = false,
  importance = 'primary',
  fresh = false,
  ariaLabel,
}: InteractionCardProps) {
  const styles = IMPORTANCE_STYLES[importance] ?? IMPORTANCE_STYLES.primary;
  const lifecycle = deriveLifecycle(interaction, response);
  const isInteractive = !resolved && !disabled && lifecycle === 'presented';

  return (
    <article
      role="article"
      aria-label={ariaLabel ?? `Interaction: ${interaction.content.slice(0, 80)}`}
      className={`px-3 py-2.5 rounded-lg border transition-colors
        ${styles.border} ${styles.bg}
        ${fresh ? 'animate-in fade-in slide-in-from-bottom-1 duration-200' : ''}
      `}
    >
      {/* Header: presenter + timestamp */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-medium text-(--vestara-accent-text)">
          {interaction.presentingParticipantName}
        </span>
        <span className="text-[9px] text-(--vestara-text-dim)">
          {formatTimestamp(interaction.createdAt)}
        </span>
      </div>

      {/* Content: markdown-rendered prompt */}
      <div className={`text-xs leading-snug mb-2 ${styles.text}`}>
        <MarkdownRenderer content={interaction.content} />
      </div>

      {/* Decision group: choices (only if interactive) */}
      {isInteractive && (
        <div className="mb-2">
          <DecisionGroup
            choices={interaction.choices}
            onSelect={onSelect}
            disabled={disabled}
            ariaLabel={`Options for: ${interaction.content.slice(0, 40)}`}
          />
        </div>
      )}

      {/* Resolved state: show selected choice */}
      {resolved && response && (
        <div className="mb-1.5">
          <DecisionState
            state={lifecycle}
            response={response}
            choices={interaction.choices}
          />
        </div>
      )}

      {/* Async feedback */}
      {feedback && (
        <div className="mt-1.5">
          <InteractionAsyncFeedback state={feedback} />
        </div>
      )}
    </article>
  );
}
