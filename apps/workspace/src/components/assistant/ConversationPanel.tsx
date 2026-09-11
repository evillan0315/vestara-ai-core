/**
 * VESTARA-INTELLIGENCE GA-1 Slice 3: ConversationPanel
 * GA-UI-004: optimistic human turn + active turn UX.
 *
 * Conversation presentation layer inside the floating panel.
 * Composes GA-2 (useAssistantConversation) and GA-3 (SurfaceContext)
 * into a functional assistant conversation UI.
 *
 * Responsibilities:
 * - Message rendering (user + assistant)
 * - Optimistic human-turn projection (submitting/persisted/failed + Retry)
 * - Single Assistant active-turn surface (Thinking… → status → streaming → done)
 * - Transient execution timeline projection (GA-UX-PREMIUM M2, never persisted)
 * - Follow-respecting auto-scroll with a "New response" jump control
 * - Compose input with send/stop, focus discipline, duplicate-submit guard
 * - Degraded mode for backend unavailability
 * - Surface context display (workspace, route)
 *
 * DOES NOT:
 * - Manage panel lifecycle (FloatingPanel responsibility)
 * - Own conversation persistence (ConversationService responsibility)
 * - Aggregate diagnostics or health
 * - Execute tools or make governance decisions
 * - Persist operational statuses into Conversation Runtime (ephemeral only)
 *
 * @see docs/blueprint/GA-UI-004-active-turn-ux.md
 */

import React, { Profiler, useCallback, useEffect, useLayoutEffect, useDeferredValue, memo, useMemo, useRef, useState } from 'react';
import { useSurfaceContext } from '../../contexts/SurfaceContext';
import { useGAExecutionConfig } from '../../hooks/useGAExecutionConfig';
import { useProviderSettings } from '../../hooks/useProviderSettings';
import type { OpenCodeSessionView } from '../../lib/opencode';
import type {
  AssistantToolOperation,
  OptimisticHumanTurn,
  StructuredEditOperation,
  StructuredTerminalOperation,
  StructuredVerificationOperation,
  UseAssistantConversationReturn,
} from '../../hooks/useAssistantConversation';
import type { AssistantExecutionDetail } from '@vestara/shared';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { ProviderModelSelector } from '../ui/ProviderModelSelector';
import { AssistantResponseActions } from './AssistantResponseActions';
import { AssistantFilesSummary } from './AssistantFilesSummary';
import { AssistantExecutionTimeline } from './AssistantToolCard';
import { ConversationHistory, type ActiveTurnState } from './ConversationHistory';
import { ExecutionControlsPopover } from './ExecutionControlsPopover';
import { ExecutionTray } from './ExecutionTray';
import { resolveDisplayTitle } from './conversationTitles';
import { useSessionStatus } from '../../hooks/useSessionStatus';
import { resolveSessionRuntimeStatus } from '../../hooks/useSessionStatus';
import { StatusIndicator } from '@vestara/ui';

// ─── Types ────────────────────────────────────────────────────

export interface ConversationPanelProps {
  assistant: UseAssistantConversationReturn;
  /** Ref for the compose textarea — used by FloatingPanel for focus contract */
  focusOnMountRef?: React.RefObject<HTMLElement | null>;
  /** GA-UI-007: full-window expanded geometry — persistent sidebar rail. */
  expanded?: boolean;
  /** GA-SESSION-003: compatible runtime sessions for resume surface. */
  runtimeSessions?: OpenCodeSessionView[];
  /** GA-SESSION-003: callback when a runtime session resume is invoked. */
  onResumeSession?: (sessionId: string) => void;
}

// ─── Constants ────────────────────────────────────────────────

/** Scroll distance (px) from the bottom within which the view still follows. */
const NEAR_BOTTOM_PX = 96;

/** React Profiler callback for performance monitoring (dev only). */
function onRender(
  id: string,
  phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number,
) {
  if (process.env.NODE_ENV === 'development' && actualDuration > 16) {
    console.warn(`[profiler] ${id} ${phase}: ${actualDuration.toFixed(1)}ms`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function formatTime(isoOrTimestamp: string | number): string {
  const date = typeof isoOrTimestamp === 'string' ? new Date(isoOrTimestamp) : new Date(isoOrTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isDegraded(assistant: UseAssistantConversationReturn): boolean {
  return !!(assistant.listError || assistant.streamError);
}

function isFailedAssistantContent(content: string): boolean {
  return content.trimStart().startsWith('Error:');
}

// ─── Components ───────────────────────────────────────────────

/**
 * GA-UX-PREMIUM M1: Assistant identity heading.
 * Canonical form: "Vestara Assistant · <model>". Where width constrains,
 * CSS wraps to two lines (name / model) — never an OpenCode session title.
 * Model metadata stays secondary (dimmer, smaller).
 */
function AssistantLabel({ model }: { model?: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5 px-0.5 min-w-0" data-testid="assistant-identity">
      <div className="w-5 h-5 shrink-0 rounded-lg bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 flex items-center justify-center shadow-[0_0_12px_-2px_rgba(245,158,11,0.65)] ring-1 ring-white/20">
        <svg className="w-3 h-3 text-zinc-950" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <span className="text-[11px] text-zinc-300 font-semibold tracking-tight truncate min-w-0">
        Vestara Assistant
        {model ? (
          <span className="ml-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/70 px-1.5 py-px text-[10px] text-zinc-400 font-medium font-mono align-middle">
            {model}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * GA-UX-PREMIUM M1: borderless completed Assistant response.
 * The response lives directly on the conversation canvas — no rounded /
 * background / bordered wrapper. Structured containment survives ONLY inside
 * rich content (fenced code blocks, tables) and future M4–M7 surfaces
 * (diff, terminal, task list, permission, verification, artifact).
 */
const MessageBubble = memo(function MessageBubble({ message }: { message: { role: string; content: string; createdAt: string; model?: string } }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  if (isUser) {
    return (
      <div className="flex justify-end assistant-message-enter" data-testid="human-message">
        <div className="max-w-[85%] min-w-0 overflow-hidden">
          <div className="flex justify-end mb-1 px-1">
            <span className="text-[10px] text-zinc-500 font-medium">You</span>
          </div>
          <div
            className="px-3.5 py-2.5 text-[13px] leading-relaxed rounded-2xl rounded-br-md bg-gradient-to-b from-zinc-800/80 to-zinc-800/40 border border-zinc-700/40 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.6)] text-zinc-100"
            data-testid="human-message-surface"
          >
            <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</span>
          </div>
          <div className="flex justify-end mt-0.5 px-1">
            <span className="text-[9px] text-zinc-700">{formatTime(message.createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start assistant-message-enter" data-testid="assistant-message">
      <div className="max-w-full min-w-0 flex-1 overflow-hidden">
        <AssistantLabel model={message.model} />
        <div
          className="min-w-0 max-w-full overflow-hidden break-words text-[13px] leading-relaxed text-zinc-300"
          data-testid="assistant-response-canvas"
        >
          <MarkdownRenderer content={message.content} />
        </div>
        {isAssistant && (
          <AssistantResponseActions content={message.content} failed={isFailedAssistantContent(message.content)} />
        )}
      </div>
    </div>
  );
});

/**
 * Optimistic human-turn projection (GA-UI-004 §2).
 * Successful sends show no status chrome; failures stay visible with Retry.
 * GA-UX-PREMIUM M1: same quieter human surface as persisted turns.
 */
function OptimisticHumanBubble({
  turn,
  onRetry,
}: {
  turn: OptimisticHumanTurn;
  onRetry: (clientTurnId: string) => void;
}) {
  const failed = turn.delivery === 'failed';
  return (
    <div className="flex justify-end assistant-message-enter" data-testid="human-message" data-optimistic={turn.delivery}>
      <div className="max-w-[85%] min-w-0 overflow-hidden">
        <div className="flex justify-end mb-1 px-1">
          <span className="text-[10px] text-zinc-500 font-medium">You</span>
        </div>
        <div
          data-testid="human-message-surface"
          className={`px-3.5 py-2.5 text-[13px] leading-relaxed rounded-2xl rounded-br-md shadow-[0_2px_12px_-4px_rgba(0,0,0,0.6)] text-zinc-100 ${
            failed
              ? 'bg-red-500/10 border border-red-500/30'
              : 'bg-gradient-to-b from-zinc-800/80 to-zinc-800/40 border border-zinc-700/40'
          }`}
        >
          <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{turn.content}</span>
        </div>
        {failed ? (
          <div className="flex justify-end items-center gap-2 mt-1 px-1" role="alert">
            <span className="text-[10px] text-red-400/80">Failed to send</span>
            <button
              type="button"
              onClick={() => onRetry(turn.clientTurnId)}
              aria-label="Retry sending message"
              className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex justify-end mt-0.5 px-1">
            <span className="text-[9px] text-zinc-700">{formatTime(turn.createdAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Single Assistant active-turn surface (GA-UI-004 §§3–5).
 * One presentation evolves: Thinking… → operational status → growing response.
 * Never a second bubble; never Copy/Share until completion (GA-UI-003 owns
 * completed responses via MessageBubble → AssistantResponseActions).
 *
 * GA-UX-PREMIUM M1: Thinking… is a lightweight status row (identity + pulse),
 * never a large empty rounded box. Streaming text grows borderless on the
 * canvas, same as completed responses. Status strings are presented
 * lightweight — M1 never parses them into diff/task/terminal cards (M3 owns
 * structured projections).
 *
 * Accessibility: bounded `role="status"` announcements for status changes;
 * the growing text is explicitly NOT live (no per-token screen-reader noise).
 * Completed messages use normal article semantics once persisted.
 */
function ActiveTurn({
  text,
  status,
  operations,
  structuredEdits,
  structuredTerminals,
  structuredVerifications,
  taskSnapshot,
  onOpenInEditor,
}: {
  text: string;
  status?: string | null;
  operations?: AssistantToolOperation[];
  structuredEdits?: readonly StructuredEditOperation[];
  structuredTerminals?: readonly StructuredTerminalOperation[];
  structuredVerifications?: readonly StructuredVerificationOperation[];
  taskSnapshot?: AssistantExecutionDetail | null;
  onOpenInEditor?: (file: string) => void;
}) {
  const isThinking = !text;
  const ops = operations ?? [];
  const hasOps = ops.length > 0 || (structuredEdits?.length ?? 0) > 0 || (structuredTerminals?.length ?? 0) > 0 || (structuredVerifications?.length ?? 0) > 0 || !!taskSnapshot;

  // GA-UX-CLEANUP: Suppress redundant task narration when structured execution
  // state is available. The task checklist + execution timeline already show
  // what's happening. Streaming text that merely narrates the plan is noise.
  const hasRunningOps = ops.some((op) => op.state === 'running');
  const hasTaskSnapshot = !!taskSnapshot && taskSnapshot.kind === 'task-snapshot' && (taskSnapshot.todos?.length ?? 0) > 0;
  const suppressNarration = hasTaskSnapshot && hasRunningOps;
  // Timeline collapse discipline (M5): expanded while executing (thinking),
  // auto-collapsed once response generation begins. User-expandable while
  // streaming.
  const [timelineOpen, setTimelineOpen] = useState(true);
  const wasThinkingRef = useRef(true);
  useEffect(() => {
    if (wasThinkingRef.current && !isThinking) {
      // Transitioned from thinking to streaming — auto-collapse
      setTimelineOpen(false);
    }
    wasThinkingRef.current = isThinking;
  }, [isThinking]);
  const timelineExpanded = isThinking ? true : timelineOpen;
  const toggleTimeline = useCallback(() => setTimelineOpen((v) => !v), []);

  // M2B: useDeferredValue tells React the Markdown render can be deferred
  // behind higher-priority updates (status badges, scroll, animations).
  // React 19 batches deferred renders automatically — no manual timer needed.
  const deferredText = useDeferredValue(text);

  return (
    <div className="flex justify-start" data-testid="assistant-active-turn">
      <div className="max-w-full min-w-0 flex-1 overflow-hidden">
        <AssistantLabel />
        {/* Bounded status announcement: replaces, never accumulates. */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mb-1.5 min-w-0"
          data-testid="active-turn-status"
        >
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-1 shadow-[0_0_16px_-6px_rgba(245,158,11,0.5)]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 motion-reduce:animate-none animate-pulse" aria-hidden="true" />
            <span className={`truncate text-[11px] font-medium ${isThinking ? 'text-amber-300' : 'text-zinc-400'}`}>
              {status || 'Thinking…'}
            </span>
          </span>
        </div>
        {/* M2: tool start replaces the Thinking text block with the execution
            timeline — one clear active state, never Thinking + Reading twice.
            M4A: structured edit projections supersede the generic edit row. */}
        {hasOps && (
          <AssistantExecutionTimeline
            operations={ops}
            structuredEdits={structuredEdits}
            structuredTerminals={structuredTerminals}
            structuredVerifications={structuredVerifications}
            taskSnapshot={taskSnapshot}
            onOpenInEditor={onOpenInEditor}
            expanded={timelineExpanded}
            onToggle={toggleTimeline}
          />
        )}
        {isThinking && !hasOps ? (
          // Thinking state: identity + status row only, no response chrome.
          <div className="px-0.5 py-1 text-[13px] text-zinc-500" data-testid="active-turn-thinking">
            <span className="assistant-thinking-dots inline-flex items-center gap-1" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="sr-only">{status || 'Thinking…'}</span>
          </div>
        ) : suppressNarration ? (
          // GA-UX-CLEANUP: Task narration suppressed — structured execution
          // state (checklist + timeline) already shows what's happening.
          // Show minimal status instead of redundant prose.
          <div className="px-0.5 py-1 text-[11px] text-zinc-500" data-testid="active-turn-suppressed">
            <span className="animate-pulse text-amber-500/70">▌</span>
            <span className="sr-only">{status || 'Executing tasks…'}</span>
          </div>
        ) : (
          !isThinking && (
            <div
              className="min-w-0 max-w-full overflow-hidden break-words text-[13px] leading-relaxed text-zinc-300"
              aria-live="off"
              data-testid="active-turn-text"
            >
              <MarkdownRenderer content={deferredText} />
              <span className="motion-reduce:animate-none animate-pulse text-amber-500/70" aria-hidden="true">
                {' '}▌
              </span>
            </div>
          )
        )}
        {/* GA-UI-007: compact "Files modified" rollup from authoritative edit
            projections (presentation-only; appears with the response). */}
        <AssistantFilesSummary
          edits={(structuredEdits ?? []).map((entry) => entry.detail)}
        />
      </div>
    </div>
  );
}

/**
 * GA-RUNTIME-001 B: interactive permission/question decisions.
 * Rendered above the composer while a turn awaits a user decision. Each
 * permission carries OpenCode's native response semantics — Allow once /
 * Allow for session / Deny. Questions carry their bounded options.
 */
const PendingInteractions = memo(function PendingInteractions({
  permissions,
  questions,
  conversationId,
  onPermissionDecision,
  onQuestionAnswer,
}: {
  permissions: readonly AssistantExecutionDetail[];
  questions: readonly AssistantExecutionDetail[];
  conversationId: string | null;
  onPermissionDecision: (
    conversationId: string,
    permissionId: string,
    decision: 'allow-once' | 'allow-session' | 'deny',
  ) => Promise<boolean>;
  onQuestionAnswer: (conversationId: string, requestId: string, answers: string[][]) => Promise<boolean>;
}) {
  if (!conversationId) return null;
  const pending = (permissions ?? []).filter((p) => p.kind === 'permission' && p.permissionState === 'requested');
  const openQuestions = (questions ?? []).filter((q) => q.kind === 'question' && q.questionState === 'requested');
  if (pending.length === 0 && openQuestions.length === 0) return null;
  return (
    <div className="shrink-0 border-t border-zinc-800/70 bg-zinc-950/95 px-3 py-2 space-y-2 backdrop-blur">
      {pending.map((permission) => {
        const action = permission.kind === 'permission' ? permission.action : 'unknown';
        const resources = permission.kind === 'permission' ? permission.resources : [];
        return (
          <div
            key={permission.operationId}
            data-testid="pending-permission"
            className="rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-500/[0.08] to-amber-500/[0.03] px-3 py-2.5 shadow-[0_4px_20px_-8px_rgba(245,158,11,0.5)]"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-200 mb-1">
              <svg className="h-3.5 w-3.5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Vestara Assistant wants to run: <span className="text-amber-300 font-semibold">{action}</span>
            </div>
            {resources.length > 0 && (
              <div className="text-[9px] text-zinc-600 mb-1.5 break-words">
                {resources.slice(0, 3).join(', ')}
                {resources.length > 3 ? ` +${resources.length - 3} more` : ''}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="permission-allow-once"
                onClick={() => void onPermissionDecision(conversationId, permission.operationId, 'allow-once')}
                className="rounded-lg border border-zinc-700 bg-zinc-800/70 px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition-all hover:bg-zinc-700 hover:border-zinc-600 active:scale-95 cursor-pointer"
              >
                Allow once
              </button>
              <button
                type="button"
                data-testid="permission-allow-session"
                onClick={() => void onPermissionDecision(conversationId, permission.operationId, 'allow-session')}
                className="rounded-lg bg-gradient-to-b from-amber-400 to-amber-500 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 shadow-[0_4px_14px_-6px_rgba(245,158,11,0.7)] ring-1 ring-white/20 transition-all hover:brightness-110 active:scale-95 cursor-pointer"
              >
                Allow for session
              </button>
              <button
                type="button"
                data-testid="permission-deny"
                onClick={() => void onPermissionDecision(conversationId, permission.operationId, 'deny')}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300 transition-all hover:bg-red-500/20 active:scale-95 cursor-pointer"
              >
                Deny
              </button>
            </div>
          </div>
        );
      })}
      {openQuestions.map((question) => {
        const info = question.kind === 'question' ? question.questions[0] : undefined;
        const optionCount = info?.options?.length ?? 0;
        return (
          <div
            key={question.operationId}
            data-testid="pending-question"
            className="rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2"
          >
            <div className="text-[11px] text-zinc-300 mb-1.5">
              {info?.question ?? 'The Assistant is asking a question.'}
            </div>
            {info && optionCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {info.options!.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    data-testid="question-option"
                    onClick={() =>
                      void onQuestionAnswer(conversationId, question.operationId, [[option.label]])
                    }
                    className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300 hover:bg-sky-500/20 transition-colors cursor-pointer"
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  data-testid="question-dismiss"
                  onClick={() => void onQuestionAnswer(conversationId, question.operationId, [])}
                  className="rounded border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

const ComposeInput = memo(function ComposeInput({
  onSend,
  loading,
  onStop,
  focusRef,
  conversationKey,
  providerModel,
  onProviderModelChange,
  execConfig,
  onExecControlsToggle,
  execControlsRef,
}: {
  onSend: (text: string) => void;
  loading: boolean;
  onStop: () => void;
  focusRef?: React.RefObject<HTMLElement | null>;
  conversationKey?: string | null;
  providerModel?: { providerId: string; modelId: string };
  onProviderModelChange?: (value: { providerId: string; modelId: string }) => void;
  execConfig?: { isCustom: boolean };
  onExecControlsToggle?: () => void;
  execControlsRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const seenKeyRef = useRef(conversationKey);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Expose textarea ref to parent for focus contract
  useEffect(() => {
    if (focusRef) {
      (focusRef as React.MutableRefObject<HTMLElement | null>).current = textareaRef.current;
    }
  }, [focusRef]);

  // Focus the composer when its target conversation changes
  useEffect(() => {
    if (seenKeyRef.current === conversationKey) return;
    seenKeyRef.current = conversationKey;
    textareaRef.current?.focus();
  }, [conversationKey]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [menuOpen]);

  // Close menu on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [menuOpen]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    onSend(text);
    setInput('');
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = 'auto';
        if (document.activeElement === document.body || document.activeElement === el) {
          el.focus();
        }
      }
    });
  }, [input, loading, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const canSend = input.trim().length > 0 && !loading;

  return (
    <div className="w-full border-t border-zinc-800/70 bg-gradient-to-t from-zinc-950 via-zinc-950 to-zinc-950/60 px-3 pt-2.5 pb-3" data-testid="assistant-composer">
      {/* Primary input surface */}
      <div className="relative rounded-2xl border border-zinc-700/60 bg-zinc-900/80 shadow-[inset_0_1px_4px_rgba(0,0,0,0.4)] backdrop-blur transition-all focus-within:border-amber-500/50 focus-within:ring-2 focus-within:ring-amber-500/15 focus-within:bg-zinc-900">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Assistant is responding…' : 'Ask anything about your workspace…'}
          aria-label="Message the assistant"
          rows={1}
          className="w-full resize-none bg-transparent pl-4 pr-12 py-3 text-[13px] leading-relaxed text-zinc-100 placeholder-zinc-600 focus:outline-none min-h-[44px] max-h-[120px]"
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
          }}
        />
        {/* Send / Stop button — inside input, far right */}
        {loading ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generation"
            title="Stop generation"
            className="absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-all active:scale-95 cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            title="Send message"
            className={`absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-xl transition-all active:scale-95 ${
              canSend
                ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-950 shadow-[0_4px_12px_-4px_rgba(245,158,11,0.6)] ring-1 ring-white/20 hover:brightness-110 cursor-pointer'
                : 'bg-zinc-800/60 text-zinc-600 cursor-not-allowed'
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Bottom control row: menu | provider | model | execution settings */}
      <div className="mt-2 flex items-center gap-2">
        {/* Vertical ellipsis menu */}
        <div className="relative" ref={menuRef}>
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="More actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:text-zinc-400 hover:bg-zinc-800/60 cursor-pointer"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute bottom-full mb-1 left-0 z-50 w-48 rounded-xl border border-zinc-700/60 bg-zinc-950/95 shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.6)] backdrop-blur-xl py-1"
            >
              {[
                { label: 'Add file', icon: 'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13', disabled: true },
                { label: 'Use template', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', disabled: true },
                { label: 'Browse workspace', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', disabled: true },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Provider + Model selectors */}
        {providerModel && onProviderModelChange && (
          <ProviderModelSelector
            value={providerModel}
            onChange={onProviderModelChange}
            compact
            disabled={loading}
          />
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Execution limits gear */}
        <button
          ref={execControlsRef}
          type="button"
          aria-label="Execution limits"
          title="Execution limits"
          onClick={onExecControlsToggle}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all cursor-pointer ${
            execConfig?.isCustom
              ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
              : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60'
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
});

/**
 * GA-SSE-003 §12: backend availability means the Vestara API/runtime boundary
 * is unreachable (listError). A turn failure (streamError — e.g. upstream
 * model execution error) must NOT be labeled "Backend unavailable".
 */
function DegradedBanner({ error, apiDown }: { error: string; apiDown: boolean }) {
  return (
    <div className="mx-3 mb-2 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-[11px] text-amber-300/90 shadow-[0_4px_16px_-8px_rgba(245,158,11,0.4)] backdrop-blur">
      <div className="flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3l9.5 16.5H2.5z" />
        </svg>
        <span className="font-medium" data-testid="degraded-banner-title">
          {apiDown ? 'Backend unavailable — messages may not send' : 'Assistant response failed'}
        </span>
      </div>
      <p className="mt-1 truncate text-[10px] text-amber-500/60">{error}</p>
    </div>
  );
}

function EmptyState({ onCreateConversation }: { onCreateConversation: () => void }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden p-6 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-amber-500/15 blur-3xl"
      />
      <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 shadow-[0_8px_28px_-8px_rgba(245,158,11,0.7)] ring-1 ring-white/25">
        <svg className="h-6 w-6 text-zinc-950" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold tracking-tight text-zinc-100 mb-1">Start a conversation</h3>
      <p className="text-[11px] leading-relaxed text-zinc-500 mb-4 max-w-[220px]">
        Ask about your workspace, get help with tasks, or explore your project.
      </p>
      <button
        type="button"
        onClick={onCreateConversation}
        className="rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 px-4 py-2 text-[12px] font-semibold text-zinc-950 shadow-[0_6px_20px_-6px_rgba(245,158,11,0.7)] ring-1 ring-white/25 transition-all hover:brightness-110 hover:shadow-[0_8px_24px_-6px_rgba(245,158,11,0.8)] active:scale-95 cursor-pointer"
      >
        New conversation
      </button>
    </div>
  );
}

function SurfaceContextBadge({ surface }: { surface: { routeId: string | null; path: string; title: string | null; section: string | null } }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-zinc-800/60 bg-gradient-to-r from-emerald-500/[0.07] via-zinc-900/40 to-transparent px-3 py-1.5">
      <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
      <svg className="h-3 w-3 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      <span className="truncate text-[10px] font-medium tracking-wide text-zinc-500">
        {surface.section ?? 'Workspace'} <span className="text-zinc-700">/</span> {surface.title ?? surface.path}
      </span>
      <span className="ml-auto hidden shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-px text-[9px] font-medium text-emerald-300/90">
        In context
      </span>
    </div>
  );
}

// ─── GA-UX-001: suggestion contract (presentation only) ────────

interface AssistantSuggestion {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly source: string;
}

/**
 * Derive context-aware suggestions from the current surface.
 * The UI is a projection — suggestion policy lives here, not in a runtime.
 * Surface-specific suggestions replace generic defaults when context is available.
 */
function getSuggestionsForSurface(surface?: { section?: string; routeId?: string }): AssistantSuggestion[] {
  const routeId = surface?.routeId;

  // Surface-specific suggestions
  if (routeId === 'activity') {
    return [
      { id: 'review-activity', label: 'Review recent activity', prompt: 'Review the recent activity and summarize what happened.', source: 'surface:activity' },
      { id: 'show-executions', label: 'Show active executions', prompt: 'Show me the currently active executions and their status.', source: 'surface:activity' },
      { id: 'explain-latest', label: 'Explain the latest operation', prompt: 'Explain the most recent operation in detail.', source: 'surface:activity' },
    ];
  }

  if (routeId === 'projects' || routeId === 'engineering') {
    return [
      { id: 'inspect-repo', label: 'Inspect repository', prompt: 'Inspect the repository and summarize its current state.', source: 'surface:engineering' },
      { id: 'check-status', label: 'Check project status', prompt: 'Check the project status and report any issues.', source: 'surface:engineering' },
      { id: 'review-changes', label: 'Review recent changes', prompt: 'Review the recent changes and summarize what was modified.', source: 'surface:engineering' },
    ];
  }

  if (routeId === 'agents') {
    return [
      { id: 'agent-status', label: 'Check agent status', prompt: 'Show the current status of all agents and their recent activity.', source: 'surface:agents' },
      { id: 'inspect-repo', label: 'Inspect repository', prompt: 'Inspect the repository and summarize its current state.', source: 'surface:agents' },
      { id: 'explain-architecture', label: 'Explain architecture', prompt: 'Explain the main architecture of this project.', source: 'surface:agents' },
    ];
  }

  // Default suggestions (no specific surface context)
  return [
    { id: 'inspect-repo', label: 'Inspect repository', prompt: 'Inspect the repository and summarize its current state.', source: 'default' },
    { id: 'check-status', label: 'Check project status', prompt: 'Check the repository status.', source: 'default' },
    { id: 'explain-architecture', label: 'Explain architecture', prompt: 'Explain the main architecture of this project.', source: 'default' },
  ];
}

function SuggestionEmptyState({ onSuggest, surface }: { onSuggest: (prompt: string) => void; surface?: { section?: string; routeId?: string } }) {
  const suggestions = getSuggestionsForSurface(surface);
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden p-6 text-center" data-testid="assistant-suggestions">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-amber-500/15 blur-3xl"
      />
      <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 shadow-[0_8px_28px_-8px_rgba(245,158,11,0.7)] ring-1 ring-white/25">
        <svg className="h-6 w-6 text-zinc-950" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div className="mb-1 text-sm font-semibold tracking-tight text-zinc-100">How can I help?</div>
      <p className="text-[11px] leading-relaxed text-zinc-500 mb-4 max-w-[230px]">
        Ask about this workspace, inspect the repository, or start an engineering task.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-[240px]">
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSuggest(s.prompt)}
            className="group flex items-center gap-2 rounded-xl border border-zinc-700/50 bg-zinc-900/70 px-3 py-2 text-left text-[12px] text-zinc-300 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.5)] transition-all hover:border-amber-500/40 hover:bg-zinc-800/80 hover:text-zinc-50 hover:shadow-[0_4px_16px_-4px_rgba(245,158,11,0.25)]"
          >
            <span className="flex-1 truncate font-medium">{s.label}</span>
            <svg
              className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export function ConversationPanel({ assistant, focusOnMountRef, expanded = false, runtimeSessions, onResumeSession }: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  // VES-PERF-001B: scroll anchor captured before prepending older messages so
  // the viewport stays on the same content after the older window is inserted.
  const olderScrollAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const surface = useSurfaceContext();
  // GA-UI-008: shared provider/model selection (persisted via localStorage)
  const { settings: providerSettings, updateSettings: updateProviderSettings } = useProviderSettings();
  // GA-EXEC-001: session-local execution config
  const execConfig = useGAExecutionConfig();
  const [execControlsOpen, setExecControlsOpen] = useState(false);
  const execGearRef = useRef<HTMLButtonElement>(null);

  const optimisticTurns = assistant.optimisticTurns ?? [];
  const retryTurn = assistant.retryTurn ?? (() => Promise.resolve());
  const conversations = assistant.conversations ?? [];

  const isStreaming = assistant.streamState === 'sending' || assistant.streamState === 'streaming';
  // The active-turn surface exists exactly while a turn executes.
  // Terminal states (completed/failed/idle) never show Thinking…/status.
  const showActiveTurn = isStreaming;

  // ── GA-UI-006: presentation-only title cache ──
  // Populated exclusively from conversations the user actually opens or
  // sends in — never a prefetch of every conversation's messages. Titles
  // stay metadata; nothing here confers authority.
  const titleCacheRef = useRef(new Map<string, string>());
  useEffect(() => {
    if (assistant.selectedId && assistant.messages.length > 0) {
      const firstHuman = assistant.messages.find((m) => m.role === 'user');
      if (firstHuman?.content.trim()) {
        titleCacheRef.current.set(assistant.selectedId, firstHuman.content);
      }
    }
  }, [assistant.selectedId, assistant.messages]);

  const resolveTitle = useCallback(
    (id: string, authoritative?: string | null) => {
      const firstHuman =
        id === assistant.selectedId
          ? (assistant.messages.find((m) => m.role === 'user')?.content ?? titleCacheRef.current.get(id))
          : titleCacheRef.current.get(id);
      return resolveDisplayTitle(authoritative, firstHuman);
    },
    [assistant.selectedId, assistant.messages],
  );

  const selectedSummary = conversations.find((c) => c.id === assistant.selectedId) ?? null;
  const currentTitle = assistant.selectedId
    ? resolveTitle(assistant.selectedId, selectedSummary?.title ?? assistant.selectedConversation?.title)
    : 'Select conversation';

  // ── GA-UI-006: history popover state ──
  const [historyOpen, setHistoryOpen] = useState(false);
  const pickerRef = useRef<HTMLButtonElement>(null);

  const openHistory = useCallback(() => {
    // Refresh list metadata so the picker is correct; messages are never
    // loaded for unselected conversations (list stays metadata-only).
    // Opening history never touches the active turn.
    if (!assistant.listLoading) {
      void (assistant.refreshConversations?.() ?? Promise.resolve());
    }
    setHistoryOpen(true);
  }, [assistant.listLoading, assistant.refreshConversations]);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    pickerRef.current?.focus();
  }, []);

  const toggleHistory = useCallback(() => {
    if (historyOpen) closeHistory();
    else openHistory();
  }, [historyOpen, closeHistory, openHistory]);

  const handleSelectHistory = useCallback(
    (id: string) => {
      setHistoryOpen(false);
      if (id === assistant.selectedId) {
        pickerRef.current?.focus();
        return;
      }
      // Canonical selection: loads messages via GET only — no POST, no
      // replay into OpenCode, no new turn. Active-turn protection is owned
      // by the hook (abort projection + reconcile; execution persists
      // server-side). Composer focus follows via conversationKey.
      followRef.current = true;
      setShowJump(false);
      assistant.selectConversation(id);
    },
    [assistant.selectedId, assistant.selectConversation],
  );

  const handleLoadSession = useCallback(
    (sessionId: string) => {
      // Load messages from an OpenCode runtime session
      void assistant.loadSessionMessages(sessionId);
    },
    [assistant.loadSessionMessages],
  );

  const handleNewConversation = useCallback(() => {
    setHistoryOpen(false);
    // Creates AND selects a fresh Conversation Runtime conversation. The
    // previous conversation is untouched; its OpenCode session is never
    // reused (one conversation → one session, server-side).
    void assistant.createConversation();
  }, [assistant.createConversation]);

  const activeTurnState: ActiveTurnState = isStreaming
    ? 'generating'
    : assistant.streamState === 'failed'
      ? 'failed'
      : 'idle';

  // GA-STATE-001: poll session status for runtime status projection.
  const { statusMap: sessionStatusMap } = useSessionStatus({ enabled: conversations.length > 0 });

  const historyItems = useMemo(
    () =>
      conversations.map((c) => ({
        id: c.id,
        displayTitle: resolveTitle(c.id, c.title),
        updatedAt: c.updatedAt,
        runtimeSessionId: c.runtimeSessionId,
      })),
    [conversations, resolveTitle],
  );

  // Follow-respecting auto-scroll (GA-UI-004 §6): follow only when the user
  // is already near the bottom; never force-scroll a user who scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (followRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const hasContent =
      assistant.messages.length > 0 || optimisticTurns.length > 0 || !!assistant.streamingText;
    setShowJump(distance >= NEAR_BOTTOM_PX && hasContent);
  }, [assistant.messages, optimisticTurns, assistant.streamingText, assistant.streamStatus, isStreaming]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance < NEAR_BOTTOM_PX;
    followRef.current = nearBottom;
    const hasContent =
      assistant.messages.length > 0 || optimisticTurns.length > 0 || !!assistant.streamingText;
    setShowJump(!nearBottom && hasContent);
  }, [assistant.messages.length, optimisticTurns.length, assistant.streamingText]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    followRef.current = true;
    setShowJump(false);
    el.focus({ preventScroll: true });
  }, []);

  // VES-PERF-001B: load the next older message window, preserving scroll position.
  const handleLoadOlderMessages = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Capture the pre-prepend geometry; the layout effect restores position.
    olderScrollAnchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
    // Loading older history is an explicit intent to read up — stop following.
    followRef.current = false;
    void assistant.loadOlderMessages();
  }, [assistant.loadOlderMessages]);

  // Restore scroll position after older messages are prepended. Runs before
  // paint so there is no visible jump.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = olderScrollAnchorRef.current;
    if (!el || !anchor) return;
    olderScrollAnchorRef.current = null;
    el.scrollTop = el.scrollHeight - anchor.height + anchor.top;
  }, [assistant.messages]);

  // Auto-create conversation on first send if none selected
  const handleSend = useCallback(
    async (text: string) => {
      // The user just sent: resume follow behavior for the new turn.
      followRef.current = true;
      setShowJump(false);
      // GA-CONTEXT-002: forward the CURRENT full SurfaceContext at send time
      // (workspace + surface + optional selection). Evaluated per turn so
      // navigation updates reach the assistant without a new conversation.
      // GA-RUNTIME-001 G: the composer selection is the REQUESTED execution
      // binding — the server validates/resolves it before execution.
      await assistant.sendMessage(text, {
        surfaceContext: surface,
        provider: providerSettings.provider,
        model: providerSettings.model,
        executionConfig: execConfig.toRequestConfig(),
      });
    },
    [assistant.sendMessage, surface.selected, providerSettings.provider, providerSettings.model, execConfig],
  );

  const handleRetry = useCallback(
    (clientTurnId: string) => {
      followRef.current = true;
      setShowJump(false);
      void retryTurn(clientTurnId);
    },
    [retryTurn],
  );

  // GA-UI-007: "Open in editor" — bounded navigation affordance. No editor
  // route exists today, so the honest action copies the repository-relative
  // path for the user to open in their editor. Never an execution authority.
  const openInEditorFallback = useCallback((file: string) => {
    try {
      void navigator.clipboard.writeText(file);
    } catch {
      // clipboard unavailable — the affordance is best-effort
    }
  }, []);

  // ── VES-PERF-001D: stable prop identities so streaming tokens do not force
  // unrelated children (composer, provider selector, execution tray) to
  // rerender. Correct identity before broad memoization.
  const providerModelValue = useMemo(
    () => ({ providerId: providerSettings.provider, modelId: providerSettings.model }),
    [providerSettings.provider, providerSettings.model],
  );

  const handleProviderModelChange = useCallback(
    (value: { providerId: string; modelId: string }) =>
      updateProviderSettings({ provider: value.providerId, model: value.modelId }),
    [updateProviderSettings],
  );

  const handleExecControlsToggle = useCallback(() => setExecControlsOpen((v) => !v), []);

  // Elapsed-time origin for the active turn. Held in a ref so the value does
  // not change on every streaming render (which would defeat memoization).
  const turnStartedAtRef = useRef<number | null>(null);
  if (isStreaming && turnStartedAtRef.current === null) turnStartedAtRef.current = Date.now();
  if (!isStreaming) turnStartedAtRef.current = null;
  const turnStartedAt = isStreaming ? (turnStartedAtRef.current ?? undefined) : undefined;

  const hasMessages = assistant.messages.length > 0;
  const showEmpty = !hasMessages && optimisticTurns.length === 0 && !isStreaming && !assistant.selectedId;
  const showLoading = assistant.messagesLoading && !hasMessages && optimisticTurns.length === 0;
  const showError = !!assistant.messagesError && !hasMessages && !showLoading;
  // Intentional new-conversation surface (GA-UI-006): a selected but
  // untouched conversation gets suggestions, not the create prompt.
  // Only show suggestions when NOT loading and NOT errored.
  const showSuggestions =
    !!assistant.selectedId && !hasMessages && optimisticTurns.length === 0 && !isStreaming && !showLoading && !showError;
  const showList =
    !showEmpty && !showSuggestions && !showLoading && !showError && !(assistant.listLoading && !hasMessages && optimisticTurns.length === 0);

  const handleSuggest = useCallback(
    (prompt: string) => {
      // Suggestion shortcuts send through the normal Conversation path.
      followRef.current = true;
      setShowJump(false);
      void handleSend(prompt);
    },
    [handleSend],
  );

  const mainColumn = (
    <div className="flex h-full w-full flex-col">
      {/* Surface context badge */}
      <SurfaceContextBadge surface={surface.surface} />

      {/* GA-UI-006: conversation picker row — hidden in expanded mode (the
          sidebar rail replaces it). */}
      {!expanded && (
        <div className="shrink-0 border-b border-zinc-800/60 bg-zinc-900/30 px-3 py-1.5 min-w-0 backdrop-blur">
          <button
            ref={pickerRef}
            type="button"
            onClick={toggleHistory}
            aria-haspopup="dialog"
            aria-expanded={historyOpen}
            aria-label={
              assistant.selectedId
                ? `Current conversation: ${currentTitle}. Open conversation history`
                : 'Open conversation history'
            }
            data-testid="conversation-picker"
            className="flex w-full min-w-0 items-center gap-1.5 rounded-xl border border-transparent px-2 py-1 text-left transition-all hover:border-zinc-700/50 hover:bg-zinc-800/60 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500/60"
          >
            <svg className="h-3.5 w-3.5 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-tight text-zinc-300">{currentTitle}</span>
            {/* GA-STATE-001: runtime status indicator for selected conversation */}
            {selectedSummary?.runtimeSessionId && (() => {
              const runtimeStatus = resolveSessionRuntimeStatus(sessionStatusMap, selectedSummary.runtimeSessionId);
              if (runtimeStatus === 'unknown') return null;
              const variant = activeTurnState === 'generating' ? 'live' : activeTurnState === 'failed' ? 'error'
                : runtimeStatus === 'active' ? 'live' : runtimeStatus === 'idle' ? 'idle' : runtimeStatus === 'failed' ? 'error' : 'off';
              const label = activeTurnState === 'generating' ? 'Working' : activeTurnState === 'failed' ? 'Failed'
                : runtimeStatus === 'active' ? 'Active' : runtimeStatus === 'idle' ? 'Idle' : runtimeStatus === 'failed' ? 'Failed' : '';
              return (
                <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 shrink-0">
                  <StatusIndicator variant={variant} size="xs" ariaLabel={`Status: ${label}`} />
                  <span>{label}</span>
                </span>
              );
            })()}
            <svg
              className={`h-3 w-3 shrink-0 text-zinc-600 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* Degraded banner — API boundary down (listError) vs turn failure (streamError). */}
      {(assistant.listError || assistant.streamError) && (
        <DegradedBanner
          error={assistant.listError || assistant.streamError || ''}
          apiDown={!!assistant.listError}
        />
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* GA-UI-006: history popover (overlay; never navigates away) — floating mode only */}
        {!expanded && historyOpen && (
          <ConversationHistory
            items={historyItems}
            selectedId={assistant.selectedId}
            activeState={activeTurnState}
            onSelect={handleSelectHistory}
            onNewConversation={handleNewConversation}
            onClose={closeHistory}
            anchorRef={pickerRef}
            runtimeSessions={runtimeSessions}
            onResumeSession={onResumeSession}
            sessionStatusMap={sessionStatusMap}
            hasMoreConversations={assistant.listPagination?.hasMore}
            loadingMoreConversations={assistant.loadingMoreConversations}
            onLoadMoreConversations={assistant.loadMoreConversations}
          />
        )}

      {/* Loading indicator */}
      {assistant.listLoading && !hasMessages && optimisticTurns.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading...
          </div>
        </div>
      )}

      {/* Empty state */}
      {showEmpty && !assistant.listLoading && (
        <div className="flex-1">
          <EmptyState onCreateConversation={assistant.createConversation} />
        </div>
      )}

      {/* Loading skeleton for message fetch */}
      {showLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading conversation...
          </div>
          {/* Skeleton lines */}
          <div className="w-full max-w-md space-y-2">
            <div className="h-3 bg-zinc-800 rounded w-3/4 animate-pulse" />
            <div className="h-3 bg-zinc-800 rounded w-1/2 animate-pulse" />
            <div className="h-3 bg-zinc-800 rounded w-2/3 animate-pulse" />
          </div>
        </div>
      )}

      {/* Error state for failed message fetch */}
      {showError && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-[11px] text-red-400">{assistant.messagesError}</div>
          <button
            type="button"
            onClick={() => assistant.selectedId && void assistant.loadMessages(assistant.selectedId)}
            className="text-[10px] text-(--vestara-accent-text) hover:underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* GA-UI-006: intentional new-conversation surface with suggestions */}
      {showSuggestions && !assistant.listLoading && (
        <div className="flex-1">
          <SuggestionEmptyState onSuggest={handleSuggest} surface={surface.surface} />
        </div>
      )}

      {/* Message list + optimistic turns + single active-turn surface.
          GA-UX-PREMIUM M1 rhythm: deliberate vertical spacing on the open
          canvas — HUMAN TURN / identity / content / actions — never card-card-card. */}
      {showList && (
        <div className="relative flex flex-col flex-1 min-h-0 min-w-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.04),transparent_60%)]">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            tabIndex={-1}
            role="log"
            aria-live="polite"
            aria-label="Assistant conversation"
            data-testid="conversation-scroll"
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-5 space-y-6 focus:outline-none min-w-0"
          >
            <Profiler id="MessageList" onRender={onRender}>
              {/* VES-PERF-001B: load older history on demand */}
              {assistant.messagesPagination?.hasMore && (
                <div className="flex justify-center pb-1">
                  <button
                    type="button"
                    onClick={handleLoadOlderMessages}
                    disabled={assistant.loadingOlderMessages}
                    data-testid="load-older-messages"
                    className="rounded-full border border-zinc-700/60 bg-zinc-900/70 px-3 py-1 text-[10px] font-medium text-zinc-400 transition-colors hover:border-amber-500/40 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {assistant.loadingOlderMessages
                      ? 'Loading older messages…'
                      : `Load older messages (${assistant.messagesPagination.total - assistant.messagesPagination.offset - assistant.messagesPagination.limit} older)`}
                  </button>
                </div>
              )}
              {assistant.messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            {optimisticTurns.map((turn) => (
              <OptimisticHumanBubble key={turn.clientTurnId} turn={turn} onRetry={handleRetry} />
            ))}
            {showActiveTurn && (
              <ActiveTurn
                text={assistant.streamingText}
                status={assistant.streamStatus}
                operations={assistant.toolOperations ?? []}
                structuredEdits={assistant.structuredEdits ?? []}
                structuredTerminals={assistant.structuredTerminals ?? []}
                structuredVerifications={assistant.structuredVerifications ?? []}
                taskSnapshot={assistant.taskSnapshot ?? null}
                onOpenInEditor={openInEditorFallback}
              />
            )}
            </Profiler>
          </div>
          {showJump && (
            <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
              <button
                type="button"
                onClick={jumpToLatest}
                aria-label="Scroll to latest response"
                data-testid="scroll-to-latest"
                className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-zinc-900/95 px-3.5 py-1.5 text-[11px] font-medium text-zinc-200 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8),0_0_16px_-8px_rgba(245,158,11,0.5)] backdrop-blur transition-all hover:border-amber-500/50 hover:text-white hover:scale-105 active:scale-95 cursor-pointer"
              >
                <span aria-hidden="true" className="text-amber-400">↓</span> New response
              </button>
            </div>
          )}
        </div>
      )}
      </div>

      {/* GA-RUNTIME-001 B: interactive permission / question decisions */}
      <PendingInteractions
        permissions={assistant.pendingPermissions}
        questions={assistant.pendingQuestions}
        conversationId={assistant.selectedId}
        onPermissionDecision={assistant.respondToPermission}
        onQuestionAnswer={assistant.answerQuestion}
      />

      {/* GA-EXEC-001: composer-attached execution surface */}
      <ExecutionTray
        active={isStreaming}
        operationCount={assistant.toolOperations?.length ?? 0}
        isCustom={execConfig.isCustom}
        turnStartedAt={turnStartedAt}
        taskSnapshot={assistant.taskSnapshot ?? null}
        cancelled={assistant.streamState === 'failed'}
      />

      {/* Compose */}
      <div className="relative">
        <ComposeInput
          onSend={handleSend}
          loading={isStreaming}
          onStop={assistant.abortStream}
          focusRef={focusOnMountRef}
          conversationKey={assistant.selectedId}
          // GA-UI-008: the selector contract is {providerId, modelId}; provider
          // settings persist as {provider, model}. Mapped at the boundary.
          providerModel={providerModelValue}
          onProviderModelChange={handleProviderModelChange}
          execConfig={execConfig}
          onExecControlsToggle={handleExecControlsToggle}
          execControlsRef={execGearRef}
        />
        {/* GA-EXEC-001: execution controls popover */}
        {execControlsOpen && (
          <ExecutionControlsPopover
            config={execConfig.config}
            isCustom={execConfig.isCustom}
            onTurnTimeoutChange={execConfig.setTurnTimeoutMs}
            onMaxToolCallsChange={execConfig.setMaxToolCalls}
            onReset={execConfig.resetToDefaults}
            onClose={() => setExecControlsOpen(false)}
            anchorRef={execGearRef}
          />
        )}
      </div>
    </div>
  );

  // Floating mode: single column (current behavior).
  if (!expanded) return mainColumn;

  // GA-UI-007 expanded mode: persistent sidebar rail + main conversation.
  return (
    <div className="flex h-full min-h-0" data-testid="assistant-expanded">
      <aside
        className="hidden w-[300px] shrink-0 flex-col border-r border-zinc-800/60 bg-zinc-950/60 backdrop-blur-sm md:flex min-h-0"
        data-testid="assistant-sidebar"
      >
        <div className="shrink-0 border-b border-zinc-800/60 px-3 py-2.5 bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 shadow-[0_0_8px_rgba(245,158,11,0.4)]">
              <svg className="h-3 w-3 text-zinc-950" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-200">Vestara Assistant</div>
              <div className="truncate text-[10px] text-zinc-600">{surface.workspace.name}</div>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ConversationHistory
            variant="rail"
            items={historyItems}
            selectedId={assistant.selectedId}
            activeState={activeTurnState}
            onSelect={handleSelectHistory}
            onNewConversation={handleNewConversation}
            onClose={closeHistory}
            anchorRef={pickerRef}
            runtimeSessions={runtimeSessions}
            onResumeSession={onResumeSession}
            onLoadSession={handleLoadSession}
            sessionStatusMap={sessionStatusMap}
            hasMoreConversations={assistant.listPagination?.hasMore}
            loadingMoreConversations={assistant.loadingMoreConversations}
            onLoadMoreConversations={assistant.loadMoreConversations}
          />
        </div>
      </aside>
      {mainColumn}
    </div>
  );
}

export default ConversationPanel;
