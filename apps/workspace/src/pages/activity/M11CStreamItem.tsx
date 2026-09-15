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

import { memo, useCallback, useState } from 'react';
import type { M11CStreamItem as StreamItemType, SubmissionState } from '../../hooks/useM11CActivityRoom';
import type { StructuredInteraction, InteractionResponse, ChoiceId, InteractionId } from '@vestara/types';
import { InteractionCard } from '../../components/interaction/InteractionCard';
import type { InteractionFeedbackState } from '../../components/interaction/InteractionAsyncFeedback';
import { StatusIndicator } from '@vestara/ui';
import '../../styles/marketplace.css';

// ─── Status badge (canonical semantic tokens) ────────────────

function StatusBadge({ label, tone }: { label: string; tone: 'error' | 'success' }) {
  const color = tone === 'error' ? 'var(--vestara-status-error)' : 'var(--vestara-status-success)';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[var(--vestara-radius-full)] border px-1.5 py-px text-[10px] font-medium"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 9%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      <StatusIndicator variant={tone === 'error' ? 'error' : 'live'} size="xs" pulse={false} aria-hidden />
      {label}
    </span>
  );
}

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
  /** Participant ID → display name lookup for enriching actor names. */
  readonly participantNames?: Readonly<Record<string, string>>;
  /** Select a workflow context (workflow badge → browser scope). */
  readonly onSelectWorkflow?: (workflowId: string) => void;
}

// ─── Visual Config ───────────────────────────────────────────

// ─── 008D presentation taxonomy ──────────────────────────────
//
// Maps AUTHORITATIVE stream kinds to presentation classes. NOT a
// domain-event taxonomy: iconography, density, and emphasis only — never
// persisted meaning, ordering, or identity.
//
// Kind provenance (audited 008D):
//   human.message           → conversation (primary)
//   agent.started/completed → activity (secondary). Start vs completion are
//                             INDISTINGUISHABLE at M11C (no source-type field
//                             survives projection), so WORK is uniform.
//   agent.progress          → progress (muted)
//   tool.called             → tool-call; tool.succeeded/failed → tool-result.
//                             Succeeded vs failed are INDISTINGUISHABLE (no
//                             error flag survives projection; recorded debt).
//   task/workflow lifecycle → activity/log; task/agent/workflow.failed →
//                             diagnostic (the authoritative failure class)
//   system.event            → evidence (with data) / telemetry
//   interaction.*           → interaction (owns its card, untouched)
// Rendered "edit started"-style labels are adapter-authored payload.message
// strings, not kinds. No callID exists in the projection chain, so pairing
// is limited to shared subordinate markers by kind.

/** Content length above which a stream item body starts collapsed. */
const COLLAPSE_THRESHOLD = 280;

type VisualClass =
  | 'human'
  | 'agent-note'
  | 'work'
  | 'tool'
  | 'quiet'
  | 'attention'
  | 'verification'
  | 'unknown';

function classifyVisual(item: StreamItemType): VisualClass {
  switch (item.kind) {
    case 'conversation':
      return item.actor.type === 'human' ? 'human' : 'agent-note';
    case 'activity':
      return 'work';
    case 'tool-call':
    case 'tool-result':
      return 'tool';
    case 'progress':
    case 'log':
    case 'telemetry':
      return 'quiet';
    case 'diagnostic':
      return 'attention';
    case 'evidence':
      return 'verification';
    default:
      return 'unknown';
  }
}

interface ClassConfig {
  readonly glyph: string;
  readonly tone: string;
  readonly container: string;
  readonly heading: string;
}

const CLASS_CONFIG: Record<VisualClass, ClassConfig> = {
  human: {
    glyph: '✎',
    tone: 'var(--vestara-status-info)',
    container:
      'border border-[var(--vestara-border-default)] bg-[linear-gradient(180deg,var(--vestara-accent-bg),transparent_45%),var(--vestara-surface-panel-raised)] px-3.5 py-3 shadow-[inset_2px_0_0_var(--vestara-status-info),0_8px_20px_-12px_rgba(0,0,0,0.7)]',
    heading: 'text-sm font-medium leading-relaxed text-[var(--vestara-text)]',
  },
  'agent-note': {
    glyph: '❝',
    tone: 'var(--vestara-accent-text)',
    container:
      'border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-3.5 py-2.5 shadow-[inset_2px_0_0_var(--vestara-accent)]',
    heading: 'text-[13px] leading-relaxed text-[var(--vestara-text-secondary)]',
  },
  work: {
    glyph: '◆',
    tone: 'var(--vestara-accent-text)',
    container: 'border border-[var(--vestara-border-subtle)] px-3 py-2',
    heading: 'text-[13px] font-medium text-[var(--vestara-text)]',
  },
  tool: {
    glyph: '⚙',
    tone: 'var(--vestara-status-tool)',
    container: 'border border-transparent px-3 py-1.5',
    heading: 'font-mono text-xs text-[var(--vestara-text-secondary)]',
  },
  quiet: {
    glyph: '·',
    tone: 'var(--vestara-text-muted)',
    container: 'border border-transparent px-3 py-1',
    heading: 'text-xs text-[var(--vestara-text-muted)]',
  },
  attention: {
    glyph: '⚠',
    tone: 'var(--vestara-status-error)',
    container: 'border px-3 py-2',
    heading: 'text-[13px] font-medium text-[var(--vestara-text)]',
  },
  verification: {
    glyph: '✓',
    tone: 'var(--vestara-status-success)',
    container: 'border px-3 py-2',
    heading: 'text-[13px] font-medium text-[var(--vestara-text)]',
  },
  unknown: {
    glyph: '◆',
    tone: 'var(--vestara-text-muted)',
    container: 'border border-transparent px-3 py-1.5',
    heading: 'text-xs text-[var(--vestara-text-secondary)]',
  },
};

// ─── Actor resolution (presentation honesty, 008C rule) ──────

interface ResolvedStreamActor {
  readonly name: string;
  readonly unknown: boolean;
  /** Raw identifier preserved as subordinate metadata when id-only. */
  readonly idMeta?: string;
}

function resolveStreamActor(
  item: StreamItemType,
  participantNames?: Readonly<Record<string, string>>,
): ResolvedStreamActor {
  const raw = (participantNames?.[item.actor.id] ?? item.actor.displayName)?.trim() ?? '';
  if (item.actor.type === 'human') {
    return raw ? { name: raw, unknown: false } : { name: 'Unknown', unknown: true };
  }
  if (!raw) {
    return {
      name: item.actor.type === 'system' ? 'System' : 'Unknown agent',
      unknown: true,
      idMeta: item.actor.id,
    };
  }
  if (raw === item.actor.id) {
    // Id-only authority: honest identifier presentation, never a name.
    return { name: 'Unknown agent', unknown: true, idMeta: item.actor.id };
  }
  return { name: raw, unknown: false };
}

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

/** Absolute timestamp for tooltips (relative label stays in the row). */
function formatAbsolute(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

// ─── Component ───────────────────────────────────────────────

export const M11CStreamItemComponent = memo(function M11CStreamItemComponent({
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
  participantNames,
  onSelectWorkflow,
}: M11CStreamItemProps) {
  const visual = classifyVisual(item);
  const config = CLASS_CONFIG[visual];
  const actor = resolveStreamActor(item, participantNames);

  const handleClick = useCallback(() => {
    if (item.aggregated && onDrillDown) {
      onDrillDown(item.id, item.aggregated.referencedActivityIds);
    } else if (onOpenDetail) {
      onOpenDetail(item);
    }
  }, [item, onOpenDetail, onDrillDown]);

  const initial = actor.unknown ? '?' : (actor.name.trim()[0] ?? '?').toUpperCase();

  // Collapsible body: logs, activities, and items with long content render
  // clamped with a Show more/less toggle instead of pushing the stream.
  const collapsible = (item.content?.length ?? 0) > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  // Accordion: every log, activity, and item collapses to its header row,
  // leaving the actor + timestamp visible while the body hides.
  const [collapsed, setCollapsed] = useState(false);

  const toggleCollapsed = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed((v) => !v);
  }, []);

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
  // Anatomy: [semantic tile] Actor/source + timestamp / heading + badge /
  // description / safe metadata. Density follows class: meaningful events
  // read as timeline nodes, routine operations as compact rows.
  // StatusBadge owns attention/verification rows; the kind pill covers
  // human/work rows — never both (previous code doubled the kind signal).
  const showPill = visual === 'human' || visual === 'work';
  return (
    <div
      className={`flex min-w-0 items-start gap-2.5 rounded-[var(--vestara-radius)] ${config.container} ${
        item.fresh ? 'animate-in fade-in slide-in-from-bottom-1 duration-200' : ''
      }`}
      style={
        visual === 'attention'
          ? {
              borderColor: 'color-mix(in srgb, var(--vestara-status-error) 35%, transparent)',
              background: 'color-mix(in srgb, var(--vestara-status-error) 7%, transparent)',
            }
          : visual === 'verification'
            ? {
                borderColor: 'color-mix(in srgb, var(--vestara-status-success) 30%, transparent)',
                background: 'color-mix(in srgb, var(--vestara-status-success) 6%, transparent)',
              }
            : undefined
      }
    >
      {/* Semantic tile (class only — never status) */}
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-[var(--vestara-radius)] border text-xs font-semibold"
        style={{
          color: config.tone,
          background: `color-mix(in srgb, ${config.tone} 12%, transparent)`,
          borderColor: `color-mix(in srgb, ${config.tone} 30%, transparent)`,
        }}
      >
        {visual === 'human' || visual === 'agent-note' ? initial : config.glyph}
      </span>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[13px] font-medium text-[var(--vestara-text)]">
              {actor.name}
            </span>
            {item.actor.role && (
              <span className="shrink-0 rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-default)] px-1.5 text-[10px] capitalize text-[var(--vestara-text-muted)]">
                {item.actor.role}
              </span>
            )}
            {actor.idMeta && (
              <span
                className="max-w-40 truncate font-mono text-[10px] text-[var(--vestara-text-muted)]"
                title={actor.idMeta}
              >
                {actor.idMeta}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <span
              className="text-[11px] text-[var(--vestara-text-muted)]"
              title={formatAbsolute(item.timestamp)}
            >
              {formatTimestamp(item.timestamp)}
            </span>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? `Expand ${actor.name} activity` : `Collapse ${actor.name} activity`}
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--vestara-radius)] text-[10px] text-[var(--vestara-text-dim)] transition-colors hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
            >
              <span aria-hidden="true" className={`inline-block transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}>▾</span>
            </button>
          </span>
        </div>

        {/* Accordion body: reply context, content, and actions */}
        {!collapsed && (
        <>
        {/* Reply indicator — clickable to open thread view */}
        {item.referencedActivityIds && item.referencedActivityIds.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenThread?.(item.referencedActivityIds!); }}
            className="mb-1.5 w-full cursor-pointer rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--vestara-accent-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
            aria-label={`View thread with ${lookupAuthor ? item.referencedActivityIds.map((id) => lookupAuthor(id) ?? 'someone').join(', ') : `${item.referencedActivityIds.length} messages`}`}
          >
            <div className="mb-0.5 flex items-center gap-1 text-[10px] text-[var(--vestara-text-muted)]">
              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span className="font-medium">
                {lookupAuthor
                  ? item.referencedActivityIds.map((id) => lookupAuthor(id) ?? 'someone').join(', ')
                  : `Reply to ${item.referencedActivityIds.length} message${item.referencedActivityIds.length > 1 ? 's' : ''}`}
              </span>
            </div>
            {lookupContent && item.referencedActivityIds[0] && (
              <div className="line-clamp-1 pl-4 text-[10px] text-[var(--vestara-text-muted)]">
                {lookupContent(item.referencedActivityIds[0])}
              </div>
            )}
          </button>
        )}

        <div className={`mt-0.5 min-w-0 break-words leading-relaxed [overflow-wrap:anywhere] ${!expanded && collapsible ? 'line-clamp-3' : ''} ${config.heading}`}>
          {item.content || <span className="italic">{item.kind}</span>}
        </div>

        {/* Metadata line */}
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--vestara-text-muted)]">
          {collapsible && (
            <button
              type="button"
              onClick={toggleExpanded}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse message' : 'Expand message'}
              className="shrink-0 cursor-pointer font-semibold text-[var(--vestara-accent-text)] transition-colors hover:text-[var(--vestara-accent-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
            >
              {expanded ? '▴ Show less' : '▾ Show more'}
            </button>
          )}
          {showPill && <span className="mpg-tag-pill">{item.kind}</span>}
          {visual === 'attention' && <StatusBadge label={item.kind} tone="error" />}
          {visual === 'verification' && <StatusBadge label={item.kind} tone="success" />}
          {item.workflowRunId && (
            onSelectWorkflow ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectWorkflow(item.workflowRunId!); }}
                className="cursor-pointer truncate font-mono underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
                title={`Filter to workflow ${item.workflowRunId}`}
                aria-label={`Filter to workflow ${item.workflowRunId}`}
              >
                workflow: {item.workflowRunId.slice(0, 8)}
              </button>
            ) : (
              <span className="truncate font-mono" title={item.workflowRunId}>
                workflow: {item.workflowRunId.slice(0, 8)}
              </span>
            )
          )}
          {onOpenDetail && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenDetail(item); }}
              className="cursor-pointer transition-colors hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
              aria-label={`Open detail for ${actor.name} activity`}
            >
              Detail
            </button>
          )}
          {onReply && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onReply(item); }}
              className="cursor-pointer transition-colors hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
              aria-label={`Reply to ${actor.name}`}
            >
              Reply
            </button>
          )}
          {onEdit && item.actor.type === 'human' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
              className="cursor-pointer transition-colors hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
              aria-label={`Edit message from ${actor.name}`}
            >
              Edit
            </button>
          )}
          {onRetract && item.actor.type === 'human' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRetract(item); }}
              className="cursor-pointer transition-colors hover:text-[var(--vestara-red)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
              aria-label={`Retract message from ${actor.name}`}
            >
              Retract
            </button>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
});
