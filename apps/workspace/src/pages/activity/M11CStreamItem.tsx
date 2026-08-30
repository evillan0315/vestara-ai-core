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
import type { M11CStreamItem as StreamItemType } from '../../hooks/useM11CActivityRoom';
import type { StructuredInteraction, InteractionResponse, ChoiceId, InteractionId } from '@vestara/types';
import { InteractionCard } from '../../components/interaction/InteractionCard';

// ─── Types ───────────────────────────────────────────────────

interface M11CStreamItemProps {
  readonly item: StreamItemType;
  readonly onOpenDetail?: (item: StreamItemType) => void;
  readonly onDrillDown?: (aggregateId: string, referencedIds: readonly string[]) => void;
}

// ─── Visual Config ───────────────────────────────────────────

const IMPORTANCE_STYLES: Record<string, { readonly border: string; readonly bg: string; readonly text: string; readonly badge: string }> = {
  primary: {
    border: 'border-(--vestara-accent-border)',
    bg: 'bg-(--vestara-accent-bg)',
    text: 'text-(--vestara-text)',
    badge: 'bg-(--vestara-accent-text)/10 text-(--vestara-accent-text)',
  },
  secondary: {
    border: 'border-transparent',
    bg: 'bg-transparent',
    text: 'text-(--vestara-text-2)',
    badge: 'bg-(--vestara-text-dim)/10 text-(--vestara-text-muted)',
  },
  muted: {
    border: 'border-transparent',
    bg: 'bg-transparent',
    text: 'text-(--vestara-text-muted)',
    badge: 'bg-(--vestara-text-dim)/5 text-(--vestara-text-dim)',
  },
};

const KIND_ICON: Record<string, string> = {
  conversation: '💬',
  activity: '◈',
  progress: '⏳',
  log: '📋',
  diagnostic: '⚠',
  evidence: '✓',
  telemetry: '📊',
  interaction: '⚖',
};

const ACTOR_TYPE_STYLE: Record<string, string> = {
  human: 'bg-(--vestara-blue)/10 text-(--vestara-blue)',
  agent: 'bg-(--vestara-violet)/10 text-(--vestara-violet)',
  system: 'bg-(--vestara-text-dim)/10 text-(--vestara-text-muted)',
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
}: M11CStreamItemProps) {
  const styles = IMPORTANCE_STYLES[item.importance] ?? IMPORTANCE_STYLES.secondary;
  const icon = KIND_ICON[item.kind] ?? '◈';
  const actorStyle = ACTOR_TYPE_STYLE[item.actor.type] ?? ACTOR_TYPE_STYLE.system;

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

  // ─── Aggregated Item ────────────────────────────────────
  if (item.aggregated) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${styles.border} ${styles.bg} hover:opacity-80`}
        title={`Click to view ${item.aggregated.count} underlying records`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-(--vestara-text-dim)">──</span>
          <span className="text-[10px] font-medium text-(--vestara-text-muted)">
            {item.aggregated.summary}
          </span>
          <span className="text-[9px] text-(--vestara-text-dim)">
            · {item.aggregated.count} {item.aggregated.kind === 'log' ? 'entries' : 'activities'}
          </span>
          <span className="ml-auto text-[9px] text-(--vestara-text-dim)">
            {formatTimestamp(item.timestamp)}
          </span>
        </div>
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

    return (
      <InteractionCard
        interaction={interaction}
        response={response}
        onSelect={() => {
          // R4: opaque callback — no execution semantics assigned
          // Response submission belongs to R5
        }}
        resolved={item.interaction.lifecycle === 'responded'}
        importance={item.importance}
        fresh={item.fresh}
        ariaLabel={`${item.interaction.lifecycle === 'presented' ? 'Interaction' : 'Response'}: ${item.content.slice(0, 80)}`}
      />
    );
  }

  // ─── Standard Item ──────────────────────────────────────
  return (
    <div
      className={`px-3 py-2 rounded-lg border transition-colors ${styles.border} ${styles.bg} ${
        item.fresh ? 'animate-in fade-in slide-in-from-bottom-1 duration-200' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Actor info */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`rounded px-1 py-0.5 text-[8px] font-medium ${actorStyle}`}>
            {roleLabel}
          </span>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className={`text-xs leading-snug ${styles.text}`}>
            {item.content || (
              <span className="italic text-(--vestara-text-dim)">{icon} {item.kind}</span>
            )}
          </div>

          {/* Metadata line */}
          <div className="mt-1 flex items-center gap-2 text-[9px] text-(--vestara-text-dim)">
            <span>{icon}</span>
            <span>{formatTimestamp(item.timestamp)}</span>
            {item.workflowRunId && (
              <span className="truncate">workflow: {item.workflowRunId.slice(0, 8)}</span>
            )}
          </div>
        </div>

        {/* Importance badge (for primary items) */}
        {item.importance === 'primary' && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-medium ${styles.badge}`}>
            {item.kind}
          </span>
        )}
      </div>
    </div>
  );
}
