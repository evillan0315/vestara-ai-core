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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSurfaceContext } from '../../contexts/SurfaceContext';
import type {
  AssistantToolOperation,
  OptimisticHumanTurn,
  UseAssistantConversationReturn,
} from '../../hooks/useAssistantConversation';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { AssistantResponseActions } from './AssistantResponseActions';
import { AssistantExecutionTimeline } from './AssistantToolCard';
import { ConversationHistory, type ActiveTurnState } from './ConversationHistory';
import { resolveDisplayTitle } from './conversationTitles';

// ─── Types ────────────────────────────────────────────────────

export interface ConversationPanelProps {
  assistant: UseAssistantConversationReturn;
  /** Ref for the compose textarea — used by FloatingPanel for focus contract */
  focusOnMountRef?: React.RefObject<HTMLElement | null>;
}

// ─── Constants ────────────────────────────────────────────────

/** Scroll distance (px) from the bottom within which the view still follows. */
const NEAR_BOTTOM_PX = 96;

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
      <div className="w-4 h-4 shrink-0 rounded-md bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 flex items-center justify-center">
        <svg className="w-2.5 h-2.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <span className="text-[11px] text-zinc-400 font-medium truncate min-w-0">
        Vestara Assistant
        {model ? <span className="text-zinc-600 font-normal"> · {model}</span> : null}
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
function MessageBubble({ message }: { message: { role: string; content: string; createdAt: string; model?: string } }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  if (isUser) {
    return (
      <div className="flex justify-end" data-testid="human-message">
        <div className="max-w-[85%] min-w-0 overflow-hidden">
          <div className="flex justify-end mb-1 px-1">
            <span className="text-[10px] text-zinc-500 font-medium">You</span>
          </div>
          <div
            className="px-3 py-2 text-[13px] leading-relaxed rounded-lg bg-zinc-800/40 border border-zinc-700/30 text-zinc-200"
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
    <div className="flex justify-start" data-testid="assistant-message">
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
}

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
    <div className="flex justify-end" data-testid="human-message" data-optimistic={turn.delivery}>
      <div className="max-w-[85%] min-w-0 overflow-hidden">
        <div className="flex justify-end mb-1 px-1">
          <span className="text-[10px] text-zinc-500 font-medium">You</span>
        </div>
        <div
          data-testid="human-message-surface"
          className={`px-3 py-2 text-[13px] leading-relaxed rounded-lg text-zinc-200 ${
            failed
              ? 'bg-red-500/10 border border-red-500/30'
              : 'bg-zinc-800/40 border border-zinc-700/30'
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
}: {
  text: string;
  status?: string | null;
  operations?: AssistantToolOperation[];
}) {
  const isThinking = !text;
  const ops = operations ?? [];
  const hasOps = ops.length > 0;
  // Timeline collapse discipline (M2): expanded while executing, collapsed
  // once response generation begins. User-expandable while streaming.
  const [timelineOpen, setTimelineOpen] = useState(false);
  const timelineExpanded = isThinking ? true : timelineOpen;
  const toggleTimeline = useCallback(() => setTimelineOpen((v) => !v), []);
  return (
    <div className="flex justify-start" data-testid="assistant-active-turn">
      <div className="max-w-full min-w-0 flex-1 overflow-hidden">
        <AssistantLabel />
        {/* Bounded status announcement: replaces, never accumulates. */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex items-center gap-1.5 mb-1 px-0.5 min-w-0"
          data-testid="active-turn-status"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 motion-reduce:animate-none animate-pulse" aria-hidden="true" />
          <span className={`text-[11px] truncate ${isThinking ? 'text-amber-500/90' : 'text-zinc-500'}`}>
            {status || 'Thinking…'}
          </span>
        </div>
        {/* M2: tool start replaces the Thinking text block with the execution
            timeline — one clear active state, never Thinking + Reading twice. */}
        {hasOps && (
          <AssistantExecutionTimeline operations={ops} expanded={timelineExpanded} onToggle={toggleTimeline} />
        )}
        {isThinking && !hasOps ? (
          // Thinking state: identity + status row only, no response chrome.
          <div className="px-0.5 py-0.5 text-[13px] text-zinc-500" data-testid="active-turn-thinking">
            <span className="inline-flex items-center gap-1.5">
              <span className="motion-reduce:animate-none animate-pulse">{status || 'Thinking…'}</span>
            </span>
          </div>
        ) : (
          !isThinking && (
            <div
              className="min-w-0 max-w-full overflow-hidden break-words text-[13px] leading-relaxed text-zinc-300"
              aria-live="off"
              data-testid="active-turn-text"
            >
              <MarkdownRenderer content={text} />
              <span className="motion-reduce:animate-none animate-pulse text-amber-500/70" aria-hidden="true">
                {' '}▌
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function ComposeInput({
  onSend,
  loading,
  onStop,
  focusRef,
  conversationKey,
}: {
  onSend: (text: string) => void;
  loading: boolean;
  onStop: () => void;
  focusRef?: React.RefObject<HTMLElement | null>;
  /** GA-UI-006: selected conversation id — composer focuses when its target changes. */
  conversationKey?: string | null;
}) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const seenKeyRef = useRef(conversationKey);

  // Expose textarea ref to parent for focus contract
  useEffect(() => {
    if (focusRef) {
      (focusRef as React.MutableRefObject<HTMLElement | null>).current = textareaRef.current;
    }
  }, [focusRef]);

  // Focus the composer when its target conversation changes (created or
  // switched). Skips the initial mount — the panel focus contract owns that.
  useEffect(() => {
    if (seenKeyRef.current === conversationKey) return;
    seenKeyRef.current = conversationKey;
    textareaRef.current?.focus();
  }, [conversationKey]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    // Empty/whitespace → no send. While a turn executes, the hook's
    // synchronous busy guard drops duplicates; the composer additionally
    // refuses to clear or double-fire.
    if (!text || loading) return;
    onSend(text);
    setInput('');
    // Reset auto-grow height, then restore focus unless the user has moved
    // focus elsewhere (only refocus when the composer still owns it or
    // nothing specific needs it — Send is a pointer/mouse or Enter action
    // originating from the composer itself).
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

  return (
    <div className="border-t border-zinc-800/80 bg-zinc-950 px-3 pt-2.5 pb-3" data-testid="assistant-composer">
      <div className="flex items-end gap-2 min-w-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Assistant is responding…' : 'Ask anything about this workspace…'}
          aria-label="Message the assistant"
          rows={1}
          className="flex-1 resize-none rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-[13px] leading-relaxed text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors min-w-0"
          style={{ minHeight: '36px', maxHeight: '120px' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
          }}
        />
        {loading ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generation"
            title="Stop generation"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim()}
            aria-label="Send message"
            title="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        )}
      </div>
      {loading && (
        <p className="mt-1.5 px-1 text-[10px] text-zinc-600">
          Responding… sending is paused until this turn completes.
        </p>
      )}
    </div>
  );
}

function DegradedBanner({ error }: { error: string }) {
  return (
    <div className="mx-3 mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-400/80">
      <div className="flex items-center gap-1.5">
        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3l9.5 16.5H2.5z" />
        </svg>
        <span>Backend unavailable — messages may not send</span>
      </div>
      <p className="mt-1 text-[10px] text-amber-500/60 truncate">{error}</p>
    </div>
  );
}

function EmptyState({ onCreateConversation }: { onCreateConversation: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="mb-3 h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
        <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-zinc-300 mb-1">Start a conversation</h3>
      <p className="text-[11px] text-zinc-500 mb-3 max-w-[200px]">
        Ask about your workspace, get help with tasks, or explore your project.
      </p>
      <button
        type="button"
        onClick={onCreateConversation}
        className="text-[11px] px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
      >
        New conversation
      </button>
    </div>
  );
}

function SurfaceContextBadge({ surface }: { surface: { routeId: string; path: string; title: string; section: string } }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-800/50 bg-zinc-900/40">
      <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
      <span className="text-[10px] text-zinc-500 truncate">
        {surface.section} / {surface.title}
      </span>
    </div>
  );
}

// ─── GA-UI-006: suggestion shortcuts (presentation only) ────────

const SUGGESTIONS = [
  { label: 'Inspect repository', prompt: 'Inspect the repository and summarize its current state.' },
  { label: 'Check project status', prompt: 'Check the repository status.' },
  { label: 'Explain architecture', prompt: 'Explain the main architecture of this project.' },
] as const;

function SuggestionEmptyState({ onSuggest }: { onSuggest: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center" data-testid="assistant-suggestions">
      <div className="mb-2 text-sm font-medium text-zinc-200">Vestara</div>
      <h3 className="text-[13px] font-medium text-zinc-300 mb-1">How can I help?</h3>
      <p className="text-[11px] text-zinc-500 mb-4 max-w-[220px]">
        Ask about this workspace, inspect the repository, or start an engineering task.
      </p>
      <div className="flex flex-col gap-1.5 w-full max-w-[220px]">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onSuggest(s.prompt)}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 hover:bg-zinc-800 hover:border-amber-500/30 hover:text-zinc-100 transition-colors cursor-pointer text-left truncate"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export function ConversationPanel({ assistant, focusOnMountRef }: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const surface = useSurfaceContext();

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

  const historyItems = conversations.map((c) => ({
    id: c.id,
    displayTitle: resolveTitle(c.id, c.title),
    updatedAt: c.updatedAt,
  }));

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

  // Auto-create conversation on first send if none selected
  const handleSend = useCallback(
    async (text: string) => {
      // The user just sent: resume follow behavior for the new turn.
      followRef.current = true;
      setShowJump(false);
      // AR-009: Snapshot current Surface Context with the message
      await assistant.sendMessage(text, {
        surfaceContext: surface.selected ? {
          kind: surface.selected.kind,
          id: surface.selected.id,
          label: surface.selected.label,
        } : undefined,
      });
    },
    [assistant.sendMessage, surface.selected],
  );

  const handleRetry = useCallback(
    (clientTurnId: string) => {
      followRef.current = true;
      setShowJump(false);
      void retryTurn(clientTurnId);
    },
    [retryTurn],
  );

  const hasMessages = assistant.messages.length > 0;
  const showEmpty = !hasMessages && optimisticTurns.length === 0 && !isStreaming && !assistant.selectedId;
  // Intentional new-conversation surface (GA-UI-006): a selected but
  // untouched conversation gets suggestions, not the create prompt.
  const showSuggestions =
    !!assistant.selectedId && !hasMessages && optimisticTurns.length === 0 && !isStreaming;
  const showList =
    !showEmpty && !showSuggestions && !(assistant.listLoading && !hasMessages && optimisticTurns.length === 0);

  const handleSuggest = useCallback(
    (prompt: string) => {
      // Suggestion shortcuts send through the normal Conversation path.
      followRef.current = true;
      setShowJump(false);
      void handleSend(prompt);
    },
    [handleSend],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Surface context badge */}
      <SurfaceContextBadge surface={surface.surface} />

      {/* GA-UI-006: conversation picker row (M1: premium trigger refinement, same authority/semantics) */}
      <div className="shrink-0 border-b border-zinc-800/50 px-3 py-1.5 min-w-0">
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
          className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-zinc-800/60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500/60"
        >
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-400">{currentTitle}</span>
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

      {/* Degraded banner */}
      {(assistant.listError || assistant.streamError) && (
        <DegradedBanner error={assistant.listError || assistant.streamError || ''} />
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* GA-UI-006: history popover (overlay; never navigates away) */}
        {historyOpen && (
          <ConversationHistory
            items={historyItems}
            selectedId={assistant.selectedId}
            activeState={activeTurnState}
            onSelect={handleSelectHistory}
            onNewConversation={handleNewConversation}
            onClose={closeHistory}
            anchorRef={pickerRef}
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

      {/* GA-UI-006: intentional new-conversation surface with suggestions */}
      {showSuggestions && !assistant.listLoading && (
        <div className="flex-1">
          <SuggestionEmptyState onSuggest={handleSuggest} />
        </div>
      )}

      {/* Message list + optimistic turns + single active-turn surface.
          GA-UX-PREMIUM M1 rhythm: deliberate vertical spacing on the open
          canvas — HUMAN TURN / identity / content / actions — never card-card-card. */}
      {showList && (
        <div className="relative flex-1 min-h-0 min-w-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            tabIndex={-1}
            data-testid="conversation-scroll"
            className="h-full overflow-y-auto overflow-x-hidden px-4 py-4 space-y-5 focus:outline-none min-w-0"
          >
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
              />
            )}
          </div>
          {showJump && (
            <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none">
              <button
                type="button"
                onClick={jumpToLatest}
                aria-label="Scroll to latest response"
                data-testid="scroll-to-latest"
                className="pointer-events-auto flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/95 px-3 py-1 text-[11px] text-zinc-300 shadow-lg hover:border-amber-500/40 hover:text-zinc-100 transition-colors cursor-pointer"
              >
                <span aria-hidden="true">↓</span> New response
              </button>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Compose */}
      <ComposeInput
        onSend={handleSend}
        loading={isStreaming}
        onStop={assistant.abortStream}
        focusRef={focusOnMountRef}
        conversationKey={assistant.selectedId}
      />
    </div>
  );
}

export default ConversationPanel;
