import {
  actorInitials,
  effectAccent,
  effectLabel,
  formatRelative,
  kindIcon,
  kindLabel,
  severityAccent,
  severityOfRecord,
} from './activity-formatters';
import type { ActivityRecord, PendingSendState } from './activity-types';
import { overrideStyle, useVisualConfig } from './visual-config';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import PublishedWithChangesOutlinedIcon from '@mui/icons-material/PublishedWithChangesOutlined';
import Tooltip from '@mui/material/Tooltip';

interface ActivityItemProps {
  record: ActivityRecord;
  selectedAgentId?: string;
  onOpenDetail?: (record: ActivityRecord) => void;
  onReference?: (record: ActivityRecord) => void;
  onCorrect?: (record: ActivityRecord) => void;
  correctedBy?: ActivityRecord;
  sendState?: PendingSendState;
  onRetry?: () => void;
}

/**
 * Conversation-first activity line. No container boxes: spacing, avatar,
 * typography, and a hover surface define the message. Organizational effects
 * (what happened) are small colored accents; UI actions (what you can do) are
 * quiet and revealed on hover.
 */
export default function ActivityItem({
  record,
  selectedAgentId,
  onOpenDetail,
  onReference,
  onCorrect,
  correctedBy,
  sendState,
  onRetry,
}: ActivityItemProps) {
  const severity = severityOfRecord(record);
  const { overrides } = useVisualConfig();
  const configOverride = overrides[record.id];
  const isChatMessage = record.kind === 'agent-message' && (record.effect === undefined || record.effect === 'message');
  const isHumanChat = isChatMessage && record.actor.type === 'human';
  const isSystemActivity = !isChatMessage;
  const title = titleOf(record);
  const summary = summaryOf(record);
  const context = contextOf(record);

  return (
    <div
      className={`group relative px-2 py-2 transition-colors ${
        isHumanChat
          ? 'self-end w-[70%] rounded-2xl bg-(--vestara-accent-bg) hover:bg-(--vestara-accent-bg)/80'
          : isChatMessage
            ? 'self-start w-[70%] rounded-2xl bg-(--vestara-accent-bg) hover:bg-(--vestara-accent-bg)/80'
            : 'self-center w-[82%] text-center hover:bg-(--vestara-accent-bg)/40'
      }`}
      data-ve-target={isChatMessage ? 'message' : 'event'}
      data-ve-name={isChatMessage ? 'Activity Message' : 'Organizational Event'}
      data-ve-instance={record.id}
      style={{ ...(isSystemActivity ? {} : { borderLeft: `2px solid ${severityAccent(severity)}` }), ...overrideStyle(configOverride) }}
    >
      <div className={`flex items-start gap-2 ${isSystemActivity ? 'justify-center' : ''}`}>
        {isChatMessage && (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--vestara-accent-bg) text-[8px] font-semibold text-(--vestara-text-2)">
            {actorInitials(record)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className={`flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[9px] text-(--vestara-text-dim) ${isSystemActivity ? 'justify-center' : ''}`}>
            {isChatMessage && <span className="font-medium text-(--vestara-text-2)">{record.actor.displayName || record.actor.id}</span>}
            {isSystemActivity && <span className="font-medium text-(--vestara-text-muted)">{record.actor.displayName || record.actor.id}</span>}
            <span>{formatRelative(record.timestamp)}</span>
            {record.effect !== undefined && (
              <span className="font-medium" style={{ color: effectAccent(record.effect) }}>
                {effectLabel(record.effect)}
              </span>
            )}
            <span className="shrink-0 text-[8px]">
              {kindIcon(record.kind)} {kindLabel(record.kind)}
            </span>
          </div>

          <div className={`mt-0.5 text-[11px] leading-snug ${isSystemActivity ? 'text-(--vestara-text-muted)' : 'text-(--vestara-text)'}`}>{title}</div>
          {summary && <div className="text-[10px] leading-relaxed text-(--vestara-text-muted)">{summary}</div>}
          {context && <div className="mt-0.5 text-[9px] text-(--vestara-text-dim)">{context}</div>}
          {selectedAgentId === undefined && isChatMessage && (
            <div className="text-[9px] text-(--vestara-text-dim)">→ {record.agentId}</div>
          )}
          {correctedBy && (
            <div className="mt-0.5 text-[9px] text-(--vestara-amber)">
              Corrected by {correctedBy.actor.displayName || correctedBy.actor.id}
            </div>
          )}
          {record.correctionOf !== undefined && (
            <div className="text-[9px] text-(--vestara-text-dim)">Corrects a prior record</div>
          )}
          {sendState === 'sending' && <div className="text-[9px] text-(--vestara-text-dim)">Sending…</div>}
          {sendState === 'failed' && (
            <div className="mt-0.5 flex items-center gap-2 text-[9px] text-(--vestara-red)">
              <span>Failed to send.</span>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded border border-(--vestara-red)/40 px-1.5 py-0.5 text-[8px] text-(--vestara-red) transition-colors hover:bg-(--vestara-red)/10 cursor-pointer"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          <div className={`mt-1 flex items-center gap-2 transition-opacity group-hover:opacity-100 ${isSystemActivity ? 'justify-center' : 'opacity-0 focus-within:opacity-100'}`}>
            {onOpenDetail && (
              <Tooltip title="Inspect activity">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDetail(record);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-(--vestara-text-dim) transition-colors hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) focus-visible:bg-(--vestara-accent-bg) focus-visible:text-(--vestara-text) cursor-pointer"
                  aria-label={`Inspect ${kindLabel(record.kind)} activity`}
                >
                  <VisibilityOutlinedIcon sx={{ fontSize: 19 }} />
                </button>
              </Tooltip>
            )}
            {onReference && (
              <Tooltip title="Reference activity">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onReference(record);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-(--vestara-text-dim) transition-colors hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) focus-visible:bg-(--vestara-accent-bg) focus-visible:text-(--vestara-text) cursor-pointer"
                  aria-label={`Reference ${kindLabel(record.kind)} activity`}
                >
                  <LinkOutlinedIcon sx={{ fontSize: 19 }} />
                </button>
              </Tooltip>
            )}
            {onCorrect && (
              <Tooltip title="Correct attribution (append-only)">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCorrect(record);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-(--vestara-text-dim) transition-colors hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) focus-visible:bg-(--vestara-accent-bg) focus-visible:text-(--vestara-text) cursor-pointer"
                  aria-label={`Correct ${kindLabel(record.kind)} activity`}
                >
                  <PublishedWithChangesOutlinedIcon sx={{ fontSize: 19 }} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function titleOf(record: ActivityRecord): string {
  switch (record.kind) {
    case 'workflow':
      return record.reason || `Workflow → ${record.currentState}`;
    case 'task':
      return `Task ${record.status}`;
    case 'agent-message':
      return record.content;
    case 'test':
      return `${record.passed} passed, ${record.failed} failed`;
    case 'verification':
      return `Verification ${record.outcome}`;
  }
}

function summaryOf(record: ActivityRecord): string | undefined {
  switch (record.kind) {
    case 'workflow':
      return `${record.previousState} → ${record.currentState}${record.observed ? ' (observer recommendation)' : ''}`;
    case 'task':
      return record.summary;
    case 'agent-message':
      return undefined;
    case 'test':
      return record.command;
    case 'verification':
      return record.reason;
  }
}

function contextOf(record: ActivityRecord): string {
  const parts: string[] = [];
  if (record.workflowId) parts.push(`Workflow ${record.workflowId}`);
  if (record.taskId) parts.push(`Task ${record.taskId}`);
  return parts.join(' · ');
}
