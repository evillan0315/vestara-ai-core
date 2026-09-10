/**
 * M11C Stream Item Component
 *
 * Renders individual stream items with visual hierarchy treatment:
 *   PRIMARY: conversation, important workflow events, attention-required
 *   SECONDARY: normal activities, task transitions, progress
 *   MUTED: logs, tool execution, telemetry, aggregated machine activity
 *
 * Muted does not mean hidden — it means visually quiet.
 * Aggregated items use M10's referencedActivityIds/sequenceRange.
 */

import { useCallback } from 'react';
import type { M11CStreamItem as StreamItemType, SubmissionState } from '../../hooks/useM11CActivityRoom';
import type { StructuredInteraction, InteractionResponse, ChoiceId, InteractionId } from '@vestara/types';
import { InteractionCard } from '../../components/interaction/InteractionCard';
import type { InteractionFeedbackState } from '../../components/interaction/InteractionAsyncFeedback';

// ─── Types ───────────────────────────────────────────────────

interface M11CStreamItemProps {
  readonly item: StreamItemType;
  readonly onOpenDetail?: (item: StreamItemType) => void;
  readonly onDrillDown?: (aggregateId: string, referencedIds: readonly string[]) => void;
  /** Reply to this message — opens composer with @mention. */
  readonly onReply?: (item: StreamItemType) => void;
  /** Retract this message (append-only correction). */
  readonly onRetract?: (item: StreamItemType) => void;
  /** Edit this message (append-only correction with new content). */
  readonly onEdit?: (item: StreamItemType) => void;
  /** Open thread view for this message's referenced activities. */
  readonly onOpenThread?: (activityIds: readonly string[]) => void;
  /** Look up author name by activity ID for reply indicator. */
  readonly lookupAuthor?: (activityId: string) => string | undefined;
  /** Look up content preview by activity ID for reply indicator. */
  readonly lookupContent?: (activityId: string) => string | undefined;
  /** AR-REC-R6: Ephemeral submission state for interaction responses. */
  readonly submission?: SubmissionState;
  /** AR-REC-R6: Submit a response to an interaction. */
  readonly onSubmitResponse?: (interactionId: string, choiceId: string) => Promise<void>;
}

// ─── Visual Config ───────────────────────────────────────────

const IMPORTANCE_STYLES: Record<string, { readonly text: string; readonly badge: string }> = {
  primary: {
    text: 'text-(--vestara-text)',
    badge: 'text-(--vestara-accent-text)',
  },
  secondary: {
    text: 'text-(--color-zinc-300)',
    badge: 'text-(--vestara-text-muted)',
  },
  muted: {
    text: 'text-(--vestara-text-muted)',
    badge: 'text-(--vestara-text-dim)',
  },
};

const KIND_GLYPH: Record<string, string> = {
  conversation: '❝',
  activity: '◆',
  progress: '◷',
  log: '≡',
  diagnostic: '⚠',
  evidence: '✓',
  telemetry: '∴',
  interaction: '⚖',
};

const ACTOR_TYPE_MEDALLION: Record<string, string> = {
  human: 'ar-medallion--human',
  agent: 'ar-medallion--agent',
  system: 'ar-medallion--system',
};

// ─── Helpers ─────────────────────────────────────────────────

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

export default function M11CStreamItemComponent({
  item,
  onOpenDetail,
  onDrillDown,
  onReply,
  onRetract,
  onEdit,
  onOpenThread,
  lookupAuthor,
  lookupContent,
  submission,
  onSubmitResponse,
}: M11CStreamItemProps) {
  const styles = IMPORTANCE_STYLES[item.importance] ?? IMPORTANCE_STYLES.secondary;
  const glyph = KIND_GLYPH[item.kind] ?? '◆';
  const medallion = ACTOR_TYPE_MEDALLION[item.actor.type] ?? ACTOR_TYPE_MEDALLION.system;

  const handleClick = useCallback(() => {
    if (item.aggregated && onDrillDown) {
      onDrillDown(item.id, item.aggregated.referencedActivityIds);
    } else if (onOpenDetail) {
      onOpenDetail(item);
    }
  }, [item, onOpenDetail, onDrillDown]);

  const roleLabel = item.actor.role
    ? item.actor.role.charAt(0).toUpperCase() + item.actor.role.slice(1)
    : item.actor.displayName;

  const initial = (item.actor.displayName.trim()[0] ?? '?').toUpperCase();

  // ─── Aggregated Item ────────────────────────────────────
  if (item.aggregated) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="ar-aggregate rounded-lg transition-colors hover:opacity-90"
        title={`Click to view ${item.aggregated.count} underlying records`}
      >
        <span aria-hidden="true" className="text-[10px] text-(--vestara-text-dim)">≡</span>
        <span className="ar-aggregate__summary">
          {item.aggregated.summary}
        </span>
        <span className="ar-aggregate__count">
          · {item.aggregated.count} {item.aggregated.kind === 'log' ? 'entries' : 'activities'}
        </span>
        <span className="ar-aggregate__time">
          {formatTimestamp(item.timestamp)}
        </span>
      </button>
    );
  }

  // ─── Interaction Item (R4: render through R3 InteractionCard) ──
  if (item.kind === 'interaction' && item.interaction) {
    // Reconstruct StructuredInteraction from projected data
    const interaction: StructuredInteraction = {
      interactionId: item.interaction.interactionId as InteractionId,
      presentingParticipantId: item.actor.id,
      presentingParticipantName: item.actor.displayName,
      createdAt: item.timestamp,
      content: item.content,
      choices: item.interaction.choices ?? [],
    };

    // Reconstruct InteractionResponse if responded
    const response: InteractionResponse | undefined =
      item.interaction.lifecycle === 'responded' && item.interaction.selectedChoiceId
        ? {
            responseId: `resp-${item.id}` as import('@vestara/types').Brand<string, 'ResponseId'>,
            interactionId: item.interaction.interactionId as InteractionId,
            selectedChoiceId: item.interaction.selectedChoiceId as ChoiceId,
            respondingParticipantId: item.interaction.respondingParticipantId ?? item.actor.id,
            respondingParticipantName: item.interaction.respondingParticipantName ?? item.actor.displayName,
            respondedAt: item.timestamp,
          }
        : undefined;

    // AR-REC-R6: Derive feedback state from ephemeral submission state
    const feedback: InteractionFeedbackState | undefined = (() => {
      if (!submission || submission.interactionId !== item.interaction.interactionId) {
        return undefined;
      }
      switch (submission.status) {
        case 'submitting':
          return { status: 'submitting' as const };
        case 'accepted':
          return { status: 'accepted' as const, response: submission.response };
        case 'failure':
          return { status: 'failure' as const, error: submission.error, retryable: submission.retryable };
        case 'stale':
          return { status: 'stale' as const };
        default:
          return undefined;
      }
    })();

    // AR-REC-R6: Disable choices during submission (UX only — server is authority)
    const isSubmitting = submission?.status === 'submitting' && submission.interactionId === item.interaction.interactionId;
    const isResolved = item.interaction.lifecycle === 'responded';

    // AR-REC-R6: Wire onSelect to submitResponse (opaque ChoiceId → R5 ingress)
    const handleSelect = useCallback(
      (choiceId: ChoiceId) => {
        if (onSubmitResponse && !isResolved && !isSubmitting) {
          void onSubmitResponse(item.interaction!.interactionId, choiceId);
        }
      },
      [onSubmitResponse, item.interaction, isResolved, isSubmitting],
    );

    return (
      <InteractionCard
        interaction={interaction}
        response={response}
        onSelect={handleSelect}
        feedback={feedback}
        resolved={isResolved}
        disabled={isSubmitting || isResolved}
        importance={item.importance}
        fresh={item.fresh}
        ariaLabel={`${item.interaction.lifecycle === 'presented' ? 'Interaction' : 'Response'}: ${item.content.slice(0, 80)}`}
      />
    );
  }

  // ─── Standard Item ──────────────────────────────────────
  return (
    <div
      className={`ar-item ar-item--${item.importance} rounded-lg ${
        item.fresh ? 'ar-item--fresh animate-in fade-in slide-in-from-bottom-1 duration-200' : ''
      }`}
    >
      {/* Insignia */}
      <span className={`ar-medallion ar-medallion--sm ${medallion}`} aria-hidden="true">
        {initial}
      </span>

      {/* Body */}
      <div className="ar-item__body">
        <div className="ar-item__head">
          <span className="ar-item__actor">{roleLabel}</span>
          <span className="ar-item__time">{formatTimestamp(item.timestamp)}</span>
        </div>

        {/* Reply indicator — clickable to open thread view */}
        {item.referencedActivityIds && item.referencedActivityIds.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenThread?.(item.referencedActivityIds!); }}
            className="mb-1.5 rounded-md border border-zinc-800/50 bg-zinc-900/30 px-2 py-1.5 text-left w-full hover:bg-zinc-800/30 transition-colors cursor-pointer"
            aria-label={`View thread with ${lookupAuthor ? item.referencedActivityIds.map((id) => lookupAuthor(id) ?? 'someone').join(', ') : `${item.referencedActivityIds.length} messages`}`}
          >
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 mb-0.5">
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span className="font-medium">
                {lookupAuthor
                  ? item.referencedActivityIds.map((id) => lookupAuthor(id) ?? 'someone').join(', ')
                  : `Reply to ${item.referencedActivityIds.length} message${item.referencedActivityIds.length > 1 ? 's' : ''}`}
              </span>
            </div>
            {lookupContent && item.referencedActivityIds[0] && (
              <div className="text-[10px] text-zinc-600 line-clamp-1 pl-4">
                {lookupContent(item.referencedActivityIds[0])}
              </div>
            )}
          </button>
        )}

        <div className={`ar-item__content text-xs leading-relaxed ${styles.text}`}>
          {item.content || (
            <span className="italic text-(--vestara-text-dim)">{glyph} {item.kind}</span>
          )}
        </div>

        {/* Metadata line */}
        <div className="ar-item__meta">
          <span aria-hidden="true">{glyph}</span>
          {item.workflowRunId && (
            <span className="truncate">workflow: {item.workflowRunId.slice(0, 8)}</span>
          )}
          {onReply && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onReply(item); }}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
              aria-label={`Reply to ${item.actor.displayName}`}
            >
              Reply
            </button>
          )}
          {onEdit && item.actor.type === 'human' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
              className="text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors cursor-pointer"
              aria-label={`Edit message from ${item.actor.displayName}`}
            >
              Edit
            </button>
          )}
          {onRetract && item.actor.type === 'human' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRetract(item); }}
              className="text-[10px] text-zinc-700 hover:text-red-400 transition-colors cursor-pointer"
              aria-label={`Retract message from ${item.actor.displayName}`}
            >
              Retract
            </button>
          )}
        </div>
      </div>

      {/* Importance badge (for primary items) */}
      {item.importance === 'primary' && (
        <span className={`ar-item__kind ${styles.badge}`}>
          {item.kind}
        </span>
      )}
    </div>
  );
}
