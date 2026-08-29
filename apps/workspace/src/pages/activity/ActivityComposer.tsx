import { useMemo, useRef, useState } from 'react';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { useTelemetryStore } from '../../contexts/TelemetryContext';
import type {
  ActivityMessageInput,
  ActivityOrganizationalEffect,
  ActivityRecord,
  ActivityScope,
  PendingSendState,
} from './activity-types';

interface ActivityComposerProps {
  /** The room's active scope — the message is delivered into it when set. */
  scope: ActivityScope;
  targetAgentId: string | undefined;
  onTargetChange: (agentId: string | undefined) => void;
  onSend: (input: ActivityMessageInput) => void;
  onRetry: (messageId: string) => void;
  sendStates: Readonly<Record<string, PendingSendState>>;
  referencedRecord: ActivityRecord | null;
  onClearReference: () => void;
}

const MAX_MESSAGE_LENGTH = 4000;

const EFFECT_OPTIONS: Array<{ value: ActivityOrganizationalEffect; label: string }> = [
  { value: 'message', label: 'Message' },
  { value: 'recommendation', label: 'Recommendation' },
  { value: 'decision', label: 'Decision' },
  { value: 'authorization', label: 'Authorization' },
  { value: 'hold', label: 'Hold' },
  { value: 'closure', label: 'Closure' },
];

export default function ActivityComposer({
  scope,
  targetAgentId,
  onTargetChange,
  onSend,
  onRetry,
  sendStates,
  referencedRecord,
  onClearReference,
}: ActivityComposerProps) {
  const telemetry = useTelemetryStore();
  const [draft, setDraft] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [effect, setEffect] = useState<ActivityOrganizationalEffect>('message');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const localActor = useMemo(() => {
    const actor = typeof window !== 'undefined' ? window.localStorage.getItem('vestara-actor') : null;
    return actor ? { displayName: actor } : undefined;
  }, []);

  const agents = useMemo(
    () => [...telemetry.agents].sort((left, right) => left.name.localeCompare(right.name)),
    [telemetry.agents],
  );
  const mentionMatches = useMemo(
    () =>
      agents.filter(
        (agent) => mentionQuery.length === 0 || agent.name.toLowerCase().includes(mentionQuery.toLowerCase()),
      ),
    [agents, mentionQuery],
  );

  const sendingCount = Object.values(sendStates).filter((state) => state === 'sending').length;
  const failedIds = Object.entries(sendStates)
    .filter(([, state]) => state === 'failed')
    .map(([id]) => id);

  const handleChange = (value: string): void => {
    setDraft(value);
    const at = value.lastIndexOf('@');
    if (at !== -1 && !value.slice(at + 1).includes(' ')) {
      setMentionQuery(value.slice(at + 1));
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const chooseMention = (agentId: string): void => {
    onTargetChange(agentId);
    setMentionOpen(false);
    textareaRef.current?.focus();
  };

  const submit = (): void => {
    const content = draft.trim();
    if (content.length === 0) return;
    onSend({
      content,
      // Deliver into the active scope so the message is visible to the workflow
      // and carries observable receipt state (AAR-001E delivery contract).
      workflowId: scope.workflowId,
      sessionId: scope.sessionId,
      targets: [targetAgentId === undefined ? { type: 'all-agents' } : { type: 'agent', agentId: targetAgentId }],
      referencedActivityIds: referencedRecord ? [referencedRecord.id] : undefined,
      ...(effect !== 'message' ? { effect } : {}),
      ...(localActor ? { actor: localActor } : {}),
    });
    setDraft('');
    if (referencedRecord) onClearReference();
    textareaRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Escape' && mentionOpen) {
      setMentionOpen(false);
    }
  };

  return (
    <div
      className="shrink-0 overflow-hidden rounded-2xl border border-(--vestara-accent-border)"
      data-ve-target="composer"
      data-ve-name="Activity Composer"
      style={{
        background:
          'linear-gradient(165deg, color-mix(in srgb, var(--vestara-primary) 10%, transparent), transparent 60%), var(--color-zinc-950)',
      }}
    >
      <div className="h-0.5 bg-[linear-gradient(90deg,var(--vestara-primary),var(--vestara-primary-muted))]" />
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-[9px] text-(--vestara-text-dim)">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <GroupOutlinedIcon sx={{ fontSize: 13 }} />
              To {targetAgentId === undefined ? 'All Agents' : targetAgentId}
            </span>
            {scope.workflowId !== undefined && (
              <span className="flex items-center gap-1 text-(--vestara-text-dim)" title="Delivery scope — messages are delivered into this workflow">
                in {scope.workflowId}
              </span>
            )}
            <label className="flex items-center gap-1">
              Effect
              <select
                value={effect}
                onChange={(event) => setEffect(event.target.value as ActivityOrganizationalEffect)}
                aria-label="Message effect"
                className="bg-transparent outline-none text-(--vestara-accent-text) cursor-pointer"
              >
                {EFFECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <span className="shrink-0">{draft.length}/{MAX_MESSAGE_LENGTH}</span>
        </div>

        {referencedRecord && (
          <div className="mt-1 flex items-center gap-1.5 text-[9px] text-(--vestara-text-dim)">
            <LinkOutlinedIcon sx={{ fontSize: 13 }} />
            <span>Referencing:</span>
            <span className="truncate text-(--vestara-text-2)">
              {referencedRecord.kind} — {referencedRecord.id.slice(0, 40)}
            </span>
            <button
              type="button"
              onClick={onClearReference}
              className="ml-auto shrink-0 text-[10px] hover:text-(--vestara-text) cursor-pointer"
              aria-label="Clear reference"
            >
              ✕
            </button>
          </div>
        )}

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={
              targetAgentId === undefined ? 'Message all agents… (@ mentions an agent)' : `Message ${targetAgentId}…`
            }
            aria-label="Message composer"
            className="w-full resize-none bg-transparent px-0.5 py-2 text-[11px] leading-relaxed text-(--vestara-text) outline-none placeholder-(--vestara-text-dim)"
          />

          {mentionOpen && (
            <div
              role="listbox"
              aria-label="Mention agents"
              className="absolute bottom-full left-0 z-10 mb-1 max-h-48 w-56 overflow-y-auto rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-1 shadow-2xl"
            >
              {mentionMatches.length === 0 ? (
                <div className="px-2 py-1 text-[10px] text-(--vestara-text-muted)">No matching agents.</div>
              ) : (
                mentionMatches.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    role="option"
                    onClick={() => chooseMention(agent.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] text-(--vestara-text-2) transition-colors hover:bg-(--vestara-accent-bg) cursor-pointer"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-(--vestara-accent-bg) text-[8px] text-(--vestara-text-2)">
                      {agent.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-medium">{agent.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between">
          <span className="text-[9px] text-(--vestara-text-dim)" aria-hidden="true" />
          <button
            type="button"
            onClick={submit}
            disabled={draft.trim().length === 0}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--vestara-accent-text) text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            aria-label="Send message"
            title="Send message"
          >
            <SendRoundedIcon sx={{ fontSize: 19 }} />
          </button>
        </div>

      {failedIds.length > 0 && (
        <div className="mt-2 space-y-1">
          {failedIds.map((id) => (
            <div
              key={id}
              className="flex items-center gap-2 rounded-lg border border-(--vestara-red)/30 bg-(--vestara-red)/10 px-2 py-1 text-[10px] text-(--vestara-red)"
            >
              <span>Message failed to send.</span>
              <button
                type="button"
                onClick={() => onRetry(id)}
                className="ml-auto rounded border border-(--vestara-red)/40 px-2 py-0.5 text-[9px] text-(--vestara-red) transition-colors hover:bg-(--vestara-red)/10 cursor-pointer"
              >
                Retry
              </button>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
