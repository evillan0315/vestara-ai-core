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
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ForwardOutlinedIcon from '@mui/icons-material/ForwardOutlined';
import HttpOutlinedIcon from '@mui/icons-material/HttpOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import ListOutlinedIcon from '@mui/icons-material/ListOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import TerminalOutlinedIcon from '@mui/icons-material/TerminalOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { SIZING } from '@vestara/ui-tokens';
import { ActionIcon } from '@vestara/ui';
import M11CForwardDialog from './M11CForwardDialog';
import type { M11CStreamItem as StreamItemType, SubmissionState } from '../../hooks/useM11CActivityRoom';
import type { StructuredInteraction, InteractionResponse, ChoiceId, InteractionId } from '@vestara/types';
import { InteractionCard } from '../../components/interaction/InteractionCard';
import type { InteractionFeedbackState } from '../../components/interaction/InteractionAsyncFeedback';
import { StatusIndicator } from '@vestara/ui';
import '../../styles/marketplace.css';

// ─── Status badge (canonical semantic tokens) ────────────────

function StatusBadge({ label, tone }: { label: string; tone: 'error' | 'success' }) {
  return (
    <span
      className={`ar-stream-status ar-stream-status--${tone}`}
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
  /** Participant ID → model label lookup (modelDisplayName ?? modelId) for tool rows. */
  readonly participantModels?: Readonly<Record<string, string>>;
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
  | 'task'
  | 'workflow'
  | 'tool'
  | 'quiet'
  | 'attention'
  | 'queued'
  | 'verification'
  | 'unknown';

function classifyVisual(item: StreamItemType): VisualClass {
  switch (item.kind) {
    case 'conversation':
      return item.actor.type === 'human' ? 'human' : 'agent-note';
    case 'activity':
      // Structured identity only: a task correlation is a TASK row, a bare
      // workflow correlation is a WORKFLOW row, otherwise generic WORK.
      // Never inferred from content text.
      if (item.taskId) return 'task';
      if (item.workflowRunId) return 'workflow';
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
  readonly containerClass: string;
  readonly headingClass: string;
}

const CLASS_CONFIG: Record<VisualClass, ClassConfig> = {
  human: {
    glyph: '✎',
    containerClass: 'ar-stream-record--human',
    headingClass: '',
  },
  'agent-note': {
    glyph: '❝',
    containerClass: 'ar-stream-record--agent-note',
    headingClass: '',
  },
  work: {
    glyph: '◆',
    containerClass: 'ar-stream-record--work',
    headingClass: '',
  },
  task: {
    glyph: '◆',
    containerClass: 'ar-stream-record--task',
    headingClass: '',
  },
  workflow: {
    glyph: '◆',
    containerClass: 'ar-stream-record--workflow',
    headingClass: '',
  },
  tool: {
    glyph: '⚙',
    containerClass: 'ar-stream-record--tool',
    headingClass: '',
  },
  quiet: {
    glyph: '◦',
    containerClass: 'ar-stream-record--quiet',
    headingClass: '',
  },
  attention: {
    glyph: '⚠',
    containerClass: 'ar-stream-record--attention',
    headingClass: '',
  },
  queued: {
    glyph: '⏳',
    containerClass: 'ar-stream-record--queued',
    headingClass: '',
  },
  verification: {
    glyph: '✓',
    containerClass: 'ar-stream-record--verification',
    headingClass: '',
  },
  unknown: {
    glyph: '◆',
    containerClass: 'ar-stream-record--unknown',
    headingClass: '',
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

// ─── Tool execution resolution (Phase 1) ─────────────
// Shows the agent executing the tool from durable correlation
// (`item.tool`), never parsed from content. Falls back to the row actor
// when no tool correlation is present (pre-Phase-1 records).

interface ResolvedToolExecution {
  readonly agentName: string;
  readonly agentUnknown: boolean;
  readonly agentIdMeta?: string;
  readonly toolName: string;
  readonly status: 'started' | 'completed' | 'failed';
  readonly callID: string;
}

function resolveToolExecution(
  item: StreamItemType,
  fallbackActor: ResolvedStreamActor,
  participantNames?: Readonly<Record<string, string>>,
): ResolvedToolExecution | undefined {
  const tool = item.tool;
  if (!tool || !tool.toolName || !tool.callID) return undefined;
  const effectiveId = (tool.agentId ?? item.actor.id)?.trim() ?? '';
  if (!effectiveId) {
    return {
      agentName: fallbackActor.name,
      agentUnknown: fallbackActor.unknown,
      agentIdMeta: fallbackActor.idMeta,
      toolName: tool.toolName,
      status: tool.status,
      callID: tool.callID,
    };
  }
  // Prefer a friendly participant name, but never fall back to "Unknown agent"
  // for tool rows: the durable agent id itself is honest identifier
  // presentation (e.g. "agent-developer"), not a fabricated name.
  const friendly = participantNames?.[effectiveId]?.trim() ?? '';
  if (friendly && friendly !== effectiveId) {
    return {
      agentName: friendly,
      agentUnknown: false,
      agentIdMeta: fallbackActor.idMeta,
      toolName: tool.toolName,
      status: tool.status,
      callID: tool.callID,
    };
  }
  return {
    agentName: effectiveId,
    agentUnknown: false,
    agentIdMeta: undefined,
    toolName: tool.toolName,
    status: tool.status,
    callID: tool.callID,
  };
}

function formatToolStatus(status: 'started' | 'completed' | 'failed'): string {
  return status === 'started' ? 'Running' : status === 'completed' ? 'Completed' : 'Failed';
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

function formatKind(kind: string): string {
  return kind.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function typeLabelForItem(item: StreamItemType, visual: VisualClass): string {
  if (visual === 'tool') return 'TOOL';
  if (visual === 'task') return 'TASK';
  if (visual === 'workflow') return 'WORKFLOW';
  if (item.kind === 'conversation') return 'MESSAGE';
  if (item.kind === 'evidence') return 'EVIDENCE';
  if (item.kind === 'diagnostic' || item.kind === 'error') return 'ISSUE';
  if (item.kind === 'interaction') return 'APPROVAL';
  if (item.kind === 'activity') return 'WORK';
  return formatKind(item.kind).toUpperCase();
}

function toneForItem(item: StreamItemType, visual: VisualClass): 'info' | 'warning' | 'error' | 'success' | 'muted' {
  if (visual === 'tool') return item.tool?.status === 'failed' ? 'error' : 'warning';
  if (visual === 'task') return 'warning';
  if (visual === 'workflow') return 'info';
  if (visual === 'attention') return 'error';
  if (visual === 'verification') return 'success';
  if (visual === 'quiet' || visual === 'unknown') return 'muted';
  return 'info';
}

/**
 * Non-generic tool content for line 2, or undefined when the content merely
 * restates the lifecycle status. The status pill already carries
 * Running/Completed/Failed exactly once — the body must not repeat it.
 */
function toolExtraSummary(item: StreamItemType, tool: ResolvedToolExecution): string | undefined {
  const generic = new Set([
    `${tool.toolName} started`,
    `${tool.toolName} completed`,
    `${tool.toolName} failed`,
    'tool.called',
    'tool.succeeded',
    'tool.failed',
  ]);
  const content = item.content.trim();
  if (content && !generic.has(content)) return content;
  return undefined;
}

function ToolMaterialIcon({ toolName, failed }: { toolName: string; failed: boolean }) {
  const normalized = toolName.toLowerCase();
  const className = `ar-stream-tool-icon ${failed ? 'ar-stream-tool-icon--error' : 'ar-stream-tool-icon--warning'}`;
  // Canonical icon size token (SIZING.icon.lg = 24px): the glyph anchors both
  // compact lines inside a minimal transparent tile — never a colored square.
  const props = { className, sx: { fontSize: SIZING.icon.lg } };
  if (normalized.includes('read')) return <MenuBookOutlinedIcon {...props} />;
  if (normalized.includes('grep')) return <SearchOutlinedIcon {...props} />;
  if (normalized.includes('bash') || normalized.includes('shell') || normalized.includes('terminal')) {
    return <TerminalOutlinedIcon {...props} />;
  }
  if (normalized.includes('edit')) return <EditOutlinedIcon {...props} />;
  if (normalized.includes('write')) return <EditNoteOutlinedIcon {...props} />;
  if (normalized.includes('glob')) return <FolderOpenOutlinedIcon {...props} />;
  if (normalized.includes('list') || normalized.includes('ls')) return <ListOutlinedIcon {...props} />;
  if (normalized.includes('find') || normalized.includes('search')) return <SearchOutlinedIcon {...props} />;
  if (normalized.includes('web') || normalized.includes('browser')) return <LanguageOutlinedIcon {...props} />;
  if (normalized.includes('fetch') || normalized.includes('http')) return <HttpOutlinedIcon {...props} />;
  if (normalized.includes('git')) return <AccountTreeOutlinedIcon {...props} />;
  if (normalized.includes('test')) return <ScienceOutlinedIcon {...props} />;
  if (normalized.includes('check')) return <FactCheckOutlinedIcon {...props} />;
  if (normalized.includes('article')) return <ArticleOutlinedIcon {...props} />;
  if (normalized.includes('file') || normalized.includes('description')) return <DescriptionOutlinedIcon {...props} />;
  if (normalized.includes('folder')) return <FolderOutlinedIcon {...props} />;
  return <BuildOutlinedIcon {...props} />;
}

function ActivityMaterialIcon({ visual, tone }: { visual: VisualClass; tone: 'info' | 'warning' | 'error' | 'success' | 'muted' }) {
  const className = `ar-stream-tool-icon ar-stream-tool-icon--${tone}`;
  const props = { className, sx: { fontSize: SIZING.icon.lg } };
  switch (visual) {
    case 'human':
    case 'agent-note':
      return <ChatBubbleOutlineOutlinedIcon {...props} />;
    case 'work':
    case 'task':
      return <TaskAltOutlinedIcon {...props} />;
    case 'workflow':
      return <AccountTreeOutlinedIcon {...props} />;
    case 'attention':
      return <BuildOutlinedIcon {...props} />;
    case 'verification':
      return <VerifiedOutlinedIcon {...props} />;
    case 'quiet':
      return <ArticleOutlinedIcon {...props} />;
    default:
      return <BuildOutlinedIcon {...props} />;
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
  participantModels,
  onSelectWorkflow,
}: M11CStreamItemProps) {
  const visual = classifyVisual(item);
  const config = CLASS_CONFIG[visual];
  const typeLabel = typeLabelForItem(item, visual);
  const tone = toneForItem(item, visual);
  const actor = resolveStreamActor(item, participantNames);
  // Phase 1: executing agent for tool rows (durable correlation, never parsed).
  const toolExecution = visual === 'tool' ? resolveToolExecution(item, actor, participantNames) : undefined;
  const displayName = toolExecution?.agentName ?? actor.name;
  const displayIdMeta = toolExecution?.agentIdMeta ?? actor.idMeta;
  // Model label for the executing identity (participants projection only —
  // modelDisplayName preferred, modelId fallback; absent stays absent).
  const modelLookupId = item.tool?.agentId ?? item.actor.id;
  const modelLabel = participantModels?.[modelLookupId]?.trim() || undefined;

  const handleClick = useCallback(() => {
    if (item.aggregated && onDrillDown) {
      onDrillDown(item.id, item.aggregated.referencedActivityIds);
    } else if (onOpenDetail) {
      onOpenDetail(item);
    }
  }, [item, onOpenDetail, onDrillDown]);

  // Collapsible body: logs, activities, and items with long content render
  // clamped with a Show more/less toggle instead of pushing the stream.
  // Single collapse mechanism: long bodies clamp (Show more). The header
  // accordion is reserved for routine rows (tool/quiet) so meaningful
  // events (human/work/attention/verification) always read as timeline
  // nodes without paying a chevron per row.
  const collapsible = (item.content?.length ?? 0) > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  const accordionEligible = visual === 'quiet';
  const [collapsed, setCollapsed] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);

  const toggleCollapsed = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed((v) => !v);
  }, []);

  const openForward = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setForwardOpen(true);
  }, []);

  const closeForward = useCallback(() => {
    setForwardOpen(false);
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
      // Wire choices carry opaque string ids; brand them for the frozen
      // @vestara/types interaction contract.
      choices: (item.interaction.choices ?? []).map((choice) => ({
        ...choice,
        choiceId: choice.choiceId as ChoiceId,
      })),
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
      // `SubmissionState`'s `idle` variant carries no `interactionId`, so it
      // must be excluded before reading it.
      if (
        !submission ||
        submission.status === 'idle' ||
        submission.interactionId !== item.interaction.interactionId
      ) {
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
  // Strict compact TWO-LINE anatomy (reference PNG):
  //   Line 1: actor/source (+ model/role chips) ............ timestamp
  //   Line 2: TYPE + subject + status + correlation ......... actions
  // The icon tile spans both lines. Each semantic fact appears exactly once:
  // the status pill owns Running/Completed/Failed, the TYPE pill owns the
  // kind (no duplicate kind pills), the subject owns the name/content.
  // Thread context and user-expanded long content render below the two lines
  // only when present/expanded — never as default row height.
  // Routine rows hide actions until expanded — keeps the scan quiet.
  const actionsVisible = !accordionEligible || !collapsed;
  const toolExtra = toolExecution ? toolExtraSummary(item, toolExecution) : undefined;
  const bodyText = item.content.trim();
  return (
    <div
      className={`ar-stream-record flex min-w-0 items-start gap-2.5 rounded-[var(--vestara-radius)] ${config.containerClass} ${
        item.fresh ? 'animate-in fade-in slide-in-from-bottom-1 duration-200' : ''
      }`}
      data-record-kind={item.kind}
      data-tool-status={toolExecution?.status}
    >
      {/* Semantic tile (class only — never status) */}
      <span
        aria-hidden="true"
        className={`ar-stream-tile ar-stream-tile--${visual} ar-stream-tile--${tone}`}
      >
        {toolExecution ? (
          <ToolMaterialIcon toolName={toolExecution.toolName} failed={toolExecution.status === 'failed'} />
        ) : visual === 'queued' ? (
          config.glyph
        ) : (
          <ActivityMaterialIcon visual={visual} tone={tone} />
        )}
      </span>

      {/* Body — two compact lines; the tile spans both */}
      <div className="min-w-0 flex-1">
        {/* LINE 1: actor/source (+ model/role chips) …… timestamp */}
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-x-2">
            <span className="min-w-0 truncate text-xs font-semibold text-[var(--vestara-text-primary)]" title={displayName}>
              {displayName}
            </span>
            {/* Secondary actor/provider identity — modelDisplayName preferred, modelId fallback */}
            {modelLabel && (
              <span
                className="shrink-0 truncate rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-subtle)] px-1.5 text-[10px] text-[var(--vestara-text-muted)]"
                title={`Model ${modelLabel}`}
              >
                {modelLabel}
              </span>
            )}
            {item.actor.role && (
              <span className="ar-stream-role shrink-0 rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-default)] px-1.5 text-[10px] capitalize text-[var(--vestara-text-muted)]">
                {item.actor.role}
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
            {accordionEligible && (
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-expanded={!collapsed}
                aria-label={collapsed ? `Expand ${displayName} activity` : `Collapse ${displayName} activity`}
                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--vestara-radius)] text-[10px] text-[var(--vestara-text-dim)] transition-colors hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
              >
                <span aria-hidden="true" className={`inline-block transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}>▾</span>
              </button>
            )}
          </span>
        </div>

        {/* LINE 2: TYPE + subject + status + correlation …… actions */}
        {!collapsed && (
        <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={`ar-stream-type ar-stream-type--${tone} shrink-0`}>{typeLabel}</span>
            {toolExecution ? (
              <>
                <span className="ar-stream-tool-name shrink-0 truncate" title={`Tool ${toolExecution.toolName}`}>
                  {toolExecution.toolName}
                </span>
                {/* Non-generic tool output only — the status pill below owns
                    Running/Completed/Failed exactly once. */}
                {toolExtra && (
                  <span
                    className={`min-w-0 text-xs text-[var(--vestara-text-primary)] ${expanded ? 'break-words' : 'truncate'}`}
                    title={toolExtra}
                  >
                    {toolExtra}
                  </span>
                )}
              </>
            ) : (
              <span
                className={`min-w-0 text-xs text-[var(--vestara-text-primary)] ${expanded || !collapsible ? 'break-words' : 'truncate'}`}
                title={bodyText || item.kind}
              >
                {bodyText || <span className="italic">{item.kind}</span>}
              </span>
            )}
            {toolExecution && (
              <span className={`ar-stream-status ar-stream-status--${toolExecution.status === 'failed' ? 'error' : 'warning'} shrink-0`}>
                <StatusIndicator variant={toolExecution.status === 'failed' ? 'error' : 'warn'} size="xs" pulse={false} aria-hidden />
                {formatToolStatus(toolExecution.status)}
              </span>
            )}
            {visual === 'attention' && (
              <span className="shrink-0"><StatusBadge label={formatKind(item.kind)} tone="error" /></span>
            )}
            {visual === 'verification' && (
              <span className="shrink-0"><StatusBadge label={formatKind(item.kind)} tone="success" /></span>
            )}
            {/* Short correlation identity: raw id when id-only, else callID / workflow */}
            {!toolExecution && displayIdMeta && (
              <span
                className="shrink-0 truncate font-mono text-[10px] text-[var(--vestara-text-muted)]"
                title={displayIdMeta}
              >
                {displayIdMeta.length > 14 ? `${displayIdMeta.slice(0, 14)}…` : displayIdMeta}
              </span>
            )}
            {toolExecution && (
              <span className="shrink-0 truncate font-mono text-[10px] text-[var(--vestara-text-muted)]" title={`Tool call ${toolExecution.callID}`}>
                {toolExecution.callID.slice(0, 14)}
              </span>
            )}
            {item.workflowRunId && (
              onSelectWorkflow ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelectWorkflow(item.workflowRunId!); }}
                  className="shrink-0 cursor-pointer truncate font-mono text-[10px] text-[var(--vestara-text-muted)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
                  title={`Filter to workflow ${item.workflowRunId}`}
                  aria-label={`Filter stream to workflow ${item.workflowRunId}`}
                >
                  wf:{item.workflowRunId.slice(0, 8)}
                </button>
              ) : (
                <span className="shrink-0 truncate font-mono text-[10px] text-[var(--vestara-text-muted)]" title={`Workflow ${item.workflowRunId}`}>
                  wf:{item.workflowRunId.slice(0, 8)}
                </span>
              )
            )}
            {collapsible && (
              <button
                type="button"
                onClick={toggleExpanded}
                aria-expanded={expanded}
                aria-label={expanded ? 'Collapse message' : 'Expand message'}
                className="shrink-0 cursor-pointer text-[10px] font-semibold text-[var(--vestara-accent-text)] transition-colors hover:text-[var(--vestara-accent-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
              >
                {expanded ? '▴ less' : '▾ more'}
              </button>
            )}
          </span>
          {actionsVisible && (onOpenDetail || onReply || (onEdit && item.actor.type === 'human') || (onRetract && item.actor.type === 'human')) && (
            <span className="flex shrink-0 items-center gap-1" aria-label="Record actions">
              {onOpenDetail && (
                <ActionIcon
                  label="Detail"
                  tone="info"
                  size="sm"
                  icon={<InfoOutlinedIcon sx={{ fontSize: 18 }} />}
                  onClick={(e) => { e.stopPropagation(); onOpenDetail(item); }}
                />
              )}
              {onReply && (
                <ActionIcon
                  label="Reply"
                  tone="accent"
                  size="sm"
                  icon={<ReplyOutlinedIcon sx={{ fontSize: 18 }} />}
                  onClick={(e) => { e.stopPropagation(); onReply(item); }}
                />
              )}
              <ActionIcon
                label="Forward to Telegram"
                tone="success"
                size="sm"
                icon={<ForwardOutlinedIcon sx={{ fontSize: 18 }} />}
                onClick={openForward}
              />
              {forwardOpen && (
                <M11CForwardDialog
                  activityId={item.id}
                  actorName={displayName}
                  content={item.content || item.kind}
                  onClose={closeForward}
                />
              )}
              {onEdit && item.actor.type === 'human' && (
                <ActionIcon
                  label="Edit"
                  tone="warning"
                  size="sm"
                  icon={<EditOutlinedIcon sx={{ fontSize: 18 }} />}
                  onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                />
              )}
              {onRetract && item.actor.type === 'human' && (
                <ActionIcon
                  label="Retract"
                  tone="destructive"
                  size="sm"
                  icon={<UndoOutlinedIcon sx={{ fontSize: 18 }} />}
                  onClick={(e) => { e.stopPropagation(); onRetract(item); }}
                />
              )}
            </span>
          )}
        </div>
        )}

        {/* Below-the-fold exceptions: thread context renders only when present */}
        {!collapsed && item.referencedActivityIds && item.referencedActivityIds.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenThread?.(item.referencedActivityIds!); }}
            className="mt-1 w-full cursor-pointer rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] px-2 py-1 text-left transition-colors hover:bg-[var(--vestara-accent-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
            aria-label={`View thread with ${lookupAuthor ? item.referencedActivityIds.map((id) => lookupAuthor(id) ?? 'someone').join(', ') : `${item.referencedActivityIds.length} messages`}`}
          >
            <div className="flex items-center gap-1 text-[10px] text-[var(--vestara-text-muted)]">
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
      </div>
    </div>
  );
});
