/**
 * AR-UI-D: Enhanced Activity Composer
 *
 * Extends the existing ActivityComposer with:
 * - AR-UI-D14: Enhanced @mention targeting with agent status, role, and presence
 * - AR-UI-D15: Model selection in composer
 * - AR-UI-D16: Risk indicators for high-risk operations
 *
 * Architecture Traceability:
 *   AR-UI-D: Composer Targeting + Realtime (phases 14-16)
 *   @see AR-UI-A: Authoritative Team Roster (phases 0-2)
 *   @see AR-UI-B: Presence Layer (phases 3-6)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  ActivityMessageInput,
  ActivityOrganizationalEffect,
  ActivityRecord,
  ActivityScope,
  PendingSendState,
} from './activity-types';
import type { TeamRosterEntry } from './team-roster-types';
import type { PresenceEntry } from './presence-types';

// ─── Types ─────────────────────────────────────────────────────

export interface EnhancedComposerProps {
  /** The room's active scope */
  scope: ActivityScope;

  /** Current target agent ID */
  targetAgentId: string | undefined;

  /** Callback when target changes */
  onTargetChange: (agentId: string | undefined) => void;

  /** Callback when message is sent */
  onSend: (input: ActivityMessageInput) => void;

  /** Callback to retry failed message */
  onRetry: (messageId: string) => void;

  /** Current send states */
  sendStates: Readonly<Record<string, PendingSendState>>;

  /** Referenced record */
  referencedRecord: ActivityRecord | null;

  /** Callback to clear reference */
  onClearReference: () => void;

  /** Team roster entries for enhanced @mention */
  rosterEntries?: readonly TeamRosterEntry[];

  /** Presence entries for real-time status */
  presenceEntries?: readonly PresenceEntry[];

  /** Available models for selection */
  availableModels?: readonly ModelOption[];

  /** Currently selected model */
  selectedModel?: string;

  /** Callback when model changes */
  onModelChange?: (model: string) => void;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description?: string;
}

// ─── Risk Indicators ───────────────────────────────────────────

const RISK_PATTERNS: Array<{ pattern: RegExp; level: 'low' | 'medium' | 'high'; reason: string }> = [
  { pattern: /\b(rm|delete|remove|destroy|drop)\b/i, level: 'high', reason: 'Destructive operation detected' },
  { pattern: /\b(sudo|chmod|chown|kill)\b/i, level: 'high', reason: 'Privileged operation detected' },
  { pattern: /\b(git push --force|force push)\b/i, level: 'high', reason: 'Force push detected' },
  { pattern: /\b(deploy|production|prod)\b/i, level: 'medium', reason: 'Production operation detected' },
  { pattern: /\b(migrate|migration)\b/i, level: 'medium', reason: 'Database migration detected' },
  { pattern: /\b(install|npm install|pnpm install)\b/i, level: 'low', reason: 'Package installation' },
];

function assessRisk(content: string): { level: 'none' | 'low' | 'medium' | 'high'; reasons: string[] } {
  const reasons: string[] = [];
  let maxLevel: 'none' | 'low' | 'medium' | 'high' = 'none';

  for (const { pattern, level, reason } of RISK_PATTERNS) {
    if (pattern.test(content)) {
      reasons.push(reason);
      if (level === 'high') maxLevel = 'high';
      else if (level === 'medium' && maxLevel !== 'high') maxLevel = 'medium';
      else if (level === 'low' && maxLevel === 'none') maxLevel = 'low';
    }
  }

  return { level: maxLevel, reasons };
}

const RISK_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  none: { bg: '', border: '', text: '', icon: '' },
  low: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', icon: 'ℹ️' },
  medium: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: '⚠️' },
  high: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: '🚨' },
};

// ─── Enhanced Mention Dropdown ─────────────────────────────────

function EnhancedMentionDropdown({
  entries,
  presenceEntries,
  query,
  onSelect,
}: {
  entries: readonly TeamRosterEntry[];
  presenceEntries: readonly PresenceEntry[];
  query: string;
  onSelect: (agentId: string) => void;
}) {
  const matches = useMemo(() => {
    const q = query.toLowerCase();
    return entries.filter(
      (e) => q.length === 0 || e.agent.name.toLowerCase().includes(q) || e.agent.role.toLowerCase().includes(q),
    );
  }, [entries, query]);

  if (matches.length === 0) {
    return (
      <div className="px-2 py-1 text-[10px] text-(--vestara-text-muted)">No matching agents.</div>
    );
  }

  return (
    <div className="space-y-0.5">
      {matches.map((entry) => {
        const presence = presenceEntries.find((p) => p.agentId === entry.agent.id);
        const isOnline = presence?.state === 'online' || presence?.state === 'busy';

        return (
          <button
            key={entry.agent.id}
            type="button"
            role="option"
            onClick={() => onSelect(entry.agent.id)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] transition-colors hover:bg-(--vestara-accent-bg) cursor-pointer"
          >
            {/* Status dot */}
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-zinc-600'}`} />

            {/* Agent info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-(--vestara-text-1)">{entry.agent.name}</span>
                <span className="text-[9px] text-(--vestara-text-muted)">{entry.agent.role}</span>
              </div>
              {presence?.currentTask && (
                <div className="text-[9px] text-(--vestara-text-muted) truncate">
                  {presence.currentTask.description}
                </div>
              )}
            </div>

            {/* Work count badge */}
            {entry.activeWorkCount > 0 && (
              <span className="px-1.5 py-0.5 text-[8px] font-medium bg-(--vestara-accent-bg) text-(--vestara-accent-text) rounded-full">
                {entry.activeWorkCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Model Selector ────────────────────────────────────────────

function ModelSelector({
  models,
  selected,
  onChange,
}: {
  models: readonly ModelOption[];
  selected: string;
  onChange: (model: string) => void;
}) {
  if (models.length === 0) return null;

  return (
    <label className="flex items-center gap-1">
      <span className="text-[9px] text-(--vestara-text-dim)">Model</span>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select model"
        className="bg-transparent outline-none text-[10px] text-(--vestara-accent-text) cursor-pointer"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Risk Indicator ────────────────────────────────────────────

function RiskIndicator({ risk }: { risk: ReturnType<typeof assessRisk> }) {
  if (risk.level === 'none') return null;

  const style = RISK_STYLES[risk.level];

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${style.bg} ${style.border} text-[10px] ${style.text}`}>
      <span>{style.icon}</span>
      <span className="font-medium">{risk.level.toUpperCase()} RISK</span>
      <span className="text-(--vestara-text-muted)">· {risk.reasons.join(', ')}</span>
    </div>
  );
}

// ─── Main Enhanced Composer Component ──────────────────────────

export function EnhancedActivityComposer({
  scope,
  targetAgentId,
  onTargetChange,
  onSend,
  onRetry,
  sendStates,
  referencedRecord,
  onClearReference,
  rosterEntries = [],
  presenceEntries = [],
  availableModels = [],
  selectedModel = '',
  onModelChange,
}: EnhancedComposerProps) {
  const [draft, setDraft] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [effect, setEffect] = useState<ActivityOrganizationalEffect>('message');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const localActor = useMemo(() => {
    const actor = typeof window !== 'undefined' ? window.localStorage.getItem('vestara-actor') : null;
    return actor ? { displayName: actor } : undefined;
  }, []);

  const sendingCount = Object.values(sendStates).filter((state) => state === 'sending').length;
  const failedIds = Object.entries(sendStates)
    .filter(([, state]) => state === 'failed')
    .map(([id]) => id);

  // AR-UI-D16: Risk assessment
  const risk = useMemo(() => assessRisk(draft), [draft]);

  const handleChange = useCallback((value: string): void => {
    setDraft(value);
    const at = value.lastIndexOf('@');
    if (at !== -1 && !value.slice(at + 1).includes(' ')) {
      setMentionQuery(value.slice(at + 1));
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  }, []);

  const chooseMention = useCallback((agentId: string): void => {
    onTargetChange(agentId);
    setMentionOpen(false);
    textareaRef.current?.focus();
  }, [onTargetChange]);

  const submit = useCallback((): void => {
    const content = draft.trim();
    if (content.length === 0) return;
    onSend({
      content,
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
  }, [draft, scope, targetAgentId, referencedRecord, effect, localActor, onSend, onClearReference]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Escape' && mentionOpen) {
      setMentionOpen(false);
    }
  }, [submit, mentionOpen]);

  return (
    <div
      className="shrink-0 overflow-hidden rounded-2xl border border-(--vestara-accent-border)"
      style={{
        background:
          'linear-gradient(165deg, color-mix(in srgb, var(--vestara-primary) 10%, transparent), transparent 60%), var(--color-zinc-950)',
      }}
    >
      <div className="h-0.5 bg-[linear-gradient(90deg,var(--vestara-primary),var(--vestara-primary-muted))]" />
      <div className="px-3 py-2">
        {/* Header with target, effect, model */}
        <div className="flex items-center justify-between gap-2 text-[9px] text-(--vestara-text-dim)">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-(--vestara-accent-text)" />
              To {targetAgentId === undefined ? 'All Agents' : targetAgentId}
            </span>
            {scope.workflowId !== undefined && (
              <span className="text-(--vestara-text-dim)" title="Delivery scope">
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
                {[
                  { value: 'message', label: 'Message' },
                  { value: 'recommendation', label: 'Recommendation' },
                  { value: 'decision', label: 'Decision' },
                  { value: 'authorization', label: 'Authorization' },
                  { value: 'hold', label: 'Hold' },
                  { value: 'closure', label: 'Closure' },
                ].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {/* AR-UI-D15: Model selection */}
            {availableModels.length > 0 && onModelChange && (
              <ModelSelector
                models={availableModels}
                selected={selectedModel}
                onChange={onModelChange}
              />
            )}
          </div>
          <span className="shrink-0">{draft.length}/4000</span>
        </div>

        {/* Reference indicator */}
        {referencedRecord && (
          <div className="mt-1 flex items-center gap-1.5 text-[9px] text-(--vestara-text-dim)">
            <span>🔗</span>
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

        {/* AR-UI-D16: Risk indicator */}
        <RiskIndicator risk={risk} />

        {/* Textarea with @mention dropdown */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={4000}
            placeholder={
              targetAgentId === undefined ? 'Message all agents… (@ mentions an agent)' : `Message ${targetAgentId}…`
            }
            aria-label="Message composer"
            className="w-full resize-none bg-transparent px-0.5 py-2 text-[11px] leading-relaxed text-(--vestara-text) outline-none placeholder-(--vestara-text-dim)"
          />

          {/* AR-UI-D14: Enhanced mention dropdown */}
          {mentionOpen && (
            <div
              role="listbox"
              aria-label="Mention agents"
              className="absolute bottom-full left-0 z-10 mb-1 max-h-64 w-72 overflow-y-auto rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-1 shadow-2xl"
            >
              <EnhancedMentionDropdown
                entries={rosterEntries}
                presenceEntries={presenceEntries}
                query={mentionQuery}
                onSelect={chooseMention}
              />
            </div>
          )}
        </div>

        {/* Send button */}
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
            <span className="text-lg">↑</span>
          </button>
        </div>

        {/* Failed messages */}
        {failedIds.length > 0 && (
          <div className="mt-2 space-y-1">
            {failedIds.map((id) => (
              <div
                key={id}
                className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-400"
              >
                <span>Message failed to send.</span>
                <button
                  type="button"
                  onClick={() => onRetry(id)}
                  className="ml-auto rounded border border-red-500/40 px-2 py-0.5 text-[9px] text-red-400 transition-colors hover:bg-red-500/10 cursor-pointer"
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
