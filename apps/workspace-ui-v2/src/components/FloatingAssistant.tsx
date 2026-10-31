import { Plus, Send, Sparkles, Square, X } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { AssistantTurn } from '@vestara/assistant';
import {
  answerQuestion,
  AssistantApiError,
  cancelAssistantTurn,
  createAssistantConversation,
  getConversation,
  isAssistantTurnActive,
  respondToPermission,
  sendAssistantMessage,
  streamAssistantMessage,
  validateAssistantToken,
} from '../lib/assistant-api';
import {
  clearAssistantThread,
  clearAssistantToken,
  readAssistantThread,
  readAssistantToken,
  storeAssistantThread,
} from '../lib/auth';
import type { WinType } from '../lib/types';
import {
  ASSISTANT_ERROR_NOTICE,
  ASSISTANT_GREETING,
  ASSISTANT_IDENTITY,
  ASSISTANT_REPLIES,
  ASSISTANT_SUGGESTIONS,
  type AssistantMessage,
  type AssistantSuggestion,
  SUGGESTION_ACTIONS,
} from '../packages/assistant.fixtures';
import { AssistantMarkdown } from './AssistantMarkdown';
import { VestaraLogoTeal } from './VestaraLogoTeal';

type Mode = 'fixture' | 'checking' | 'live';

const MODE_PILL: Record<Mode, { label: string; className: string }> = {
  live: {
    label: 'live',
    className:
      'bg-[var(--vestara-status-shell-success)]/10 border-[var(--vestara-status-shell-success)]/20 text-[var(--vestara-status-shell-success)]',
  },
  checking: {
    label: 'connecting…',
    className:
      'bg-[var(--vestara-status-shell-warning)]/10 border-[var(--vestara-status-shell-warning)]/20 text-[var(--vestara-status-shell-warning)]',
  },
  fixture: {
    label: 'fixture',
    className:
      'bg-[var(--vestara-surface-shell-canvas)] border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-muted)]',
  },
};

export function FloatingAssistant({ onAction }: { onAction?: (type: WinType) => void }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [catchingUp, setCatchingUp] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>(ASSISTANT_GREETING);
  const [mode, setMode] = useState<Mode>(() => (readAssistantToken() ? 'checking' : 'fixture'));
  // Transient turn projections (tool timeline, ASK queues) owned by the
  // shared package store; this component only re-renders on mutation.
  const [turn] = useState(() => new AssistantTurn());
  const [, bumpTurn] = useReducer((version: number) => version + 1, 0);
  const replyRef = useRef(0);
  const convRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Token validation runs only when a stored token exists — fixture mode
  // never touches the network.
  useEffect(() => {
    if (mode !== 'checking') return;
    let cancelled = false;
    validateAssistantToken(readAssistantToken())
      .then((ok) => {
        if (cancelled) return;
        if (!ok) clearAssistantToken();
        setMode(ok ? 'live' : 'fixture');
      })
      .catch(() => {
        if (!cancelled) setMode('fixture');
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Reload reattach: adopt the stored thread and, if a turn is still
  // in-flight, poll GET /active then pull the latest assistant text.
  // Never opens a second stream on a busy conversation.
  useEffect(() => {
    if (mode !== 'live') return;
    const stored = readAssistantThread();
    if (!stored) return;
    convRef.current = stored;
    let cancelled = false;
    let timer = 0;
    let tries = 0;
    const poll = async () => {
      if (cancelled) return;
      let keepWaiting = false;
      try {
        const token = readAssistantToken();
        if (!token) return;
          if (await isAssistantTurnActive(token, stored)) {
            setCatchingUp(true);
            tries += 1;
            if (tries < 15) {
              timer = window.setTimeout(poll, 2000);
              keepWaiting = true;
            }
            return;
          }
          // Settle: rehydrate the durable tool timeline and append the latest
          // persisted assistant text. Never opens a second stream.
          const rehydrated = await getConversation(token, stored);
          if (!cancelled) {
            turn.rehydrateFromMessages(rehydrated);
            bumpTurn();
            const latest = [...rehydrated]
              .reverse()
              .find((m) => m?.role === 'assistant' && m.content?.trim())?.content?.trim();
            if (latest) {
              const n = replyRef.current++;
              setMessages((m) => [...m, { id: `reattach-${n}`, from: 'assistant', text: latest }]);
            }
          }
      } catch {
        // Stale thread or offline — session affinity heals on next send.
      } finally {
        if (!cancelled && !keepWaiting) setCatchingUp(false);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const fixtureReply = (n: number) => ASSISTANT_REPLIES[n % ASSISTANT_REPLIES.length];

  const adoptConv = (id: string): string => {
    convRef.current = id;
    storeAssistantThread(id);
    return id;
  };

  const ensureConv = async (token: string): Promise<string> => {
    if (!convRef.current) adoptConv(await createAssistantConversation(token));
    return convRef.current;
  };

  const appendFixtureReply = (clean: string) => {
    const n = replyRef.current++;
    setMessages((m) => [
      ...m,
      { id: `user-${n}`, from: 'user', text: clean },
      { id: `asst-${n}`, from: 'assistant', text: fixtureReply(n) },
    ]);
    setDraft('');
  };

  const appendLiveText = (pendingId: string, text: string, note?: string) => {
    setMessages((m) => m.map((x) => (x.id === pendingId ? { ...x, text, ...(note ? { note } : {}) } : x)));
  };

  /** Complete-call fallback when the SSE transport fails outright. */
  const fallbackToMessagesCall = async (token: string, conv: string, clean: string, pendingId: string) => {
    const reply = await sendAssistantMessage(token, conv, clean);
    appendLiveText(
      pendingId,
      reply.text,
      reply.latencyMs !== undefined ? `answered in ${Math.round(reply.latencyMs)}ms` : undefined,
    );
  };

  const streamInto = async (
    token: string,
    conv: string,
    clean: string,
    pendingId: string,
    signal: AbortSignal,
  ): Promise<'streamed' | 'busy'> => {
    const result = await streamAssistantMessage(
      token,
      conv,
      clean,
      {
        signal,
        onDelta: (d) => {
          setMessages((m) => m.map((x) => (x.id === pendingId ? { ...x, text: x.text + d } : x)));
        },
        // Every non-delta frame feeds the shared turn store: tool cards,
        // structured status, and ASK queues render live instead of stalling.
        onEvent: (type, content, frame) => {
          if (type === 'tool') {
            const execution = frame?.execution as { kind?: string; operationId?: string } | undefined;
            const operationId =
              execution &&
              execution.kind !== 'permission' &&
              execution.kind !== 'question' &&
              execution.kind !== 'task-snapshot'
                ? execution.operationId
                : undefined;
            turn.onToolStart(frame?.name ?? 'tool', operationId);
          } else if (type === 'tool_result') {
            turn.onExecution(frame?.execution);
            turn.onToolResult(frame?.name ?? 'tool', content);
          } else if (type === 'status') {
            turn.onExecution(frame?.execution);
          }
          bumpTurn();
        },
      },
    );
    if (result.ended === 'busy') return 'busy';
    if (result.ended === 'aborted') {
      setMessages((m) => m.map((x) => (x.id === pendingId ? { ...x, text: x.text.trim() || '(stopped)' } : x)));
      return 'streamed';
    }
    if (result.ended === 'error') throw new AssistantApiError(500, result.error ?? 'Stream failed');
    if (!result.text) {
      // Drained stream with no deltas — one complete-call attempt.
      await fallbackToMessagesCall(token, conv, clean, pendingId);
    }
    return 'streamed';
  };

  const failToFixtures = (pendingId: string, n: number) => {
    setMessages((m) => [
      ...m.filter((x) => x.id !== pendingId),
      { id: `asst-${n}-err`, from: 'assistant', text: ASSISTANT_ERROR_NOTICE },
      { id: `asst-${n}-fb`, from: 'assistant', text: fixtureReply(n) },
    ]);
  };

  const sendLive = (clean: string) => {
    const n = replyRef.current++;
    const pendingId = `asst-${n}`;
    turn.reset();
    bumpTurn();
    setMessages((m) => [
      ...m,
      { id: `user-${n}`, from: 'user', text: clean },
      { id: pendingId, from: 'assistant', text: '' },
    ]);
    setDraft('');
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    (async () => {
      try {
        const token = readAssistantToken();
        if (!token) throw new AssistantApiError(401, 'Signed out');
        const streamOnce = (conv: string) => streamInto(token, conv, clean, pendingId, controller.signal);
        try {
          const outcome = await streamOnce(await ensureConv(token));
          if (outcome === 'busy') {
            // A turn is already in-flight there — never duplicate it.
            await streamOnce(adoptConv(await createAssistantConversation(token)));
          }
        } catch (e) {
          // Stale thread (server dropped the conversation) — recreate once.
          if (e instanceof AssistantApiError && e.status === 404) {
            await streamOnce(adoptConv(await createAssistantConversation(token)));
          } else {
            throw e;
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof AssistantApiError && e.status === 401) {
          clearAssistantToken();
          convRef.current = null;
          setMode('fixture');
        } else if (e instanceof AssistantApiError && e.status === 0) {
          setMode('fixture');
        }
        failToFixtures(pendingId, n);
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    })();
  };

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    if (mode === 'live') sendLive(clean);
    else appendFixtureReply(clean);
  };

  const stop = () => {
    abortRef.current?.abort();
    // Aborting the transport does NOT stop the server turn (GA-DETACH-001) —
    // explicit cancel is the only stop authority. Best-effort by design.
    const conv = convRef.current;
    const token = readAssistantToken();
    if (conv && token) void cancelAssistantTurn(token, conv);
  };

  const tapSuggestion = (s: AssistantSuggestion) => {
    const action = SUGGESTION_ACTIONS[s];
    if (action) onAction?.(action);
    send(s);
  };

  const newChat = () => {
    convRef.current = null;
    clearAssistantThread();
    turn.reset();
    bumpTurn();
    setMessages(ASSISTANT_GREETING);
  };

  // Permission/question details carry the OpenCode request id as their
  // operationId, so one id addresses both the endpoint and the store queue.
  const decidePermission = (requestId: string, decision: 'allow-once' | 'allow-session' | 'deny') => {
    const token = readAssistantToken();
    const conv = convRef.current;
    if (!token || !conv) return;
    void respondToPermission(token, conv, requestId, decision).then((ok) => {
      if (ok) {
        turn.dismissPending('permission', requestId);
        bumpTurn();
      }
    });
  };

  const answerTurnQuestion = (requestId: string, label: string) => {
    const token = readAssistantToken();
    const conv = convRef.current;
    if (!token || !conv) return;
    void answerQuestion(token, conv, requestId, [[label]]).then((ok) => {
      if (ok) {
        turn.dismissPending('question', requestId);
        bumpTurn();
      }
    });
  };

  const pill = MODE_PILL[mode];

  return (
    <div className="absolute bottom-16 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Vestara assistant"
          className="w-[320px] max-w-[86vw] rounded-[var(--vestara-radius-xl)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] shadow-[var(--vestara-elevation-shell-float)] overflow-hidden flex flex-col"
        >
          <div className="h-9 shrink-0 bg-[var(--vestara-surface-shell-panel)] border-b border-[var(--vestara-border-shell)] flex items-center gap-2 px-3">
            <VestaraLogoTeal size={18} />
            <div className="min-w-0">
              <div className="text-[length:var(--vestara-font-size-label)] font-medium text-[var(--vestara-text-shell-primary)] leading-none">
                {ASSISTANT_IDENTITY.name}
              </div>
              <div className="text-[length:var(--vestara-font-size-micro)] font-mono text-[var(--vestara-text-shell-muted)] mt-0.5">
                {ASSISTANT_IDENTITY.status}
              </div>
            </div>
            <span
              className={`ml-auto text-[length:var(--vestara-font-size-micro-small)] font-mono px-1.5 py-0.5 rounded-full border ${pill.className}`}
            >
              {pill.label}
            </span>
            {busy ? (
              <button
                type="button"
                aria-label="Stop response"
                onClick={stop}
                className="w-6 h-6 rounded-[var(--vestara-radius-md)] flex items-center justify-center text-[var(--vestara-status-shell-danger)] hover:bg-[var(--vestara-status-shell-danger)]/10 transition"
              >
                <Square size={12} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  aria-label="Start new chat"
                  onClick={newChat}
                  className="w-6 h-6 rounded-[var(--vestara-radius-md)] flex items-center justify-center text-[var(--vestara-text-shell-secondary)] hover:bg-[var(--vestara-surface-shell-hover)] hover:text-[var(--vestara-text-shell-primary)] transition"
                >
                  <Plus size={12} />
                </button>
                <button
                  type="button"
                  aria-label="Close assistant"
                  onClick={() => setOpen(false)}
                  className="w-6 h-6 rounded-[var(--vestara-radius-md)] flex items-center justify-center text-[var(--vestara-text-shell-secondary)] hover:bg-[var(--vestara-surface-shell-hover)] hover:text-[var(--vestara-text-shell-primary)] transition"
                >
                  <X size={12} />
                </button>
              </>
            )}
          </div>

          <div aria-live="polite" className="max-h-[320px] overflow-auto p-3 space-y-2">
            {messages.map((m) =>
              m.from === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-accent-shell)]/15 border border-[var(--vestara-accent-shell)]/25 px-2.5 py-1.5 text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-primary)]">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[85%] rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] px-2.5 py-1.5 text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-secondary)]">
                    <AssistantMarkdown text={m.text} />
                    {m.note && (
                      <div className="mt-1 text-[length:var(--vestara-font-size-micro-small)] font-mono text-[var(--vestara-text-shell-faint)]">
                        {m.note}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {turn.operations.length > 0 && (
              <div className="flex justify-start">
                <div
                  data-testid="assistant-tool-ops"
                  className="max-w-[85%] rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] px-2.5 py-1.5 text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-muted)] space-y-0.5"
                >
                  {turn.operations.map((op) => (
                    <div key={op.id} className="flex items-center gap-1.5 truncate">
                      <span aria-hidden="true">
                        {op.state === 'running' ? (
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--vestara-accent-shell)] animate-pulse" />
                        ) : op.state === 'completed' ? (
                          <span className="text-[var(--vestara-status-shell-success)]">✓</span>
                        ) : (
                          <span className="text-[var(--vestara-status-shell-danger)]">✕</span>
                        )}
                      </span>
                      <span className="truncate">
                        {op.name}
                        {op.preview ? <span className="opacity-60"> · {op.preview}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {turn.pendingPermissions.map((p) => {
              const detail = p as unknown as {
                operationId: string;
                action: string;
                resources: readonly string[];
              };
              return (
                <div
                  key={detail.operationId}
                  className="flex justify-start"
                  data-testid="assistant-permission-card"
                >
                  <div className="max-w-[85%] rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-status-shell-warning)]/40 px-2.5 py-1.5">
                    <div className="text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-primary)]">
                      Allow <span className="font-mono">{detail.action}</span>?
                    </div>
                    {detail.resources?.[0] && (
                      <div className="mt-0.5 truncate text-[length:var(--vestara-font-size-micro-small)] font-mono text-[var(--vestara-text-shell-muted)]">
                        {detail.resources[0]}
                      </div>
                    )}
                    <div className="mt-1.5 flex gap-1.5">
                      {(['allow-once', 'allow-session', 'deny'] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => decidePermission(detail.operationId, d)}
                          className="text-[length:var(--vestara-font-size-caption)] px-2 py-0.5 rounded-full bg-[var(--vestara-surface-shell-canvas)] border border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-secondary)] hover:border-[var(--vestara-accent-shell)]/30 hover:text-[var(--vestara-text-shell-primary)] transition"
                        >
                          {d === 'allow-once' ? 'Once' : d === 'allow-session' ? 'Session' : 'Deny'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {turn.pendingQuestions.map((q) => {
              const detail = q as unknown as {
                operationId: string;
                questions: readonly {
                  question: string;
                  options?: readonly { label: string }[];
                }[];
              };
              const first = detail.questions?.[0];
              return (
                <div
                  key={detail.operationId}
                  className="flex justify-start"
                  data-testid="assistant-question-card"
                >
                  <div className="max-w-[85%] rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-status-shell-warning)]/40 px-2.5 py-1.5">
                    <div className="text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-primary)]">
                      {first?.question ?? 'Question'}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(first?.options ?? []).map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => answerTurnQuestion(detail.operationId, opt.label)}
                          className="text-[length:var(--vestara-font-size-caption)] px-2 py-0.5 rounded-full bg-[var(--vestara-surface-shell-canvas)] border border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-secondary)] hover:border-[var(--vestara-accent-shell)]/30 hover:text-[var(--vestara-text-shell-primary)] transition"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {busy && (
              <div className="flex justify-start">
                <div
                  role="status"
                  aria-label="Assistant is thinking"
                  className="rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] px-2.5 py-1.5 text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-muted)] animate-pulse"
                >
                  Thinking…
                </div>
              </div>
            )}
            {catchingUp && !busy && (
              <div className="flex justify-start">
                <div className="rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] px-2.5 py-1.5 text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-muted)] animate-pulse">
                  Catching up on the running turn…
                </div>
              </div>
            )}
          </div>

          {messages.length <= ASSISTANT_GREETING.length && !busy && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {ASSISTANT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => tapSuggestion(s)}
                  className="text-[length:var(--vestara-font-size-caption)] px-2 py-1 rounded-full bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-secondary)] hover:border-[var(--vestara-accent-shell)]/30 hover:text-[var(--vestara-text-shell-primary)] transition"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="p-2.5 border-t border-[var(--vestara-border-shell)] flex items-center gap-2"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Message Vestara assistant"
              placeholder="Ask the shell…"
              disabled={busy}
              className="flex-1 h-9 rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-canvas)] border border-[var(--vestara-border-shell)] px-3 text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-primary)] placeholder:text-[var(--vestara-text-shell-faint)] outline-none focus:border-[var(--vestara-accent-shell)]/40 disabled:opacity-60"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={busy}
              className="w-9 h-9 shrink-0 rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-accent-shell)] text-[var(--vestara-surface-shell-canvas)] flex items-center justify-center hover:brightness-105 transition disabled:opacity-60"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setSeen(true);
        }}
        aria-expanded={open}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        className="relative w-11 h-11 rounded-full bg-[var(--vestara-accent-shell)] text-[var(--vestara-surface-shell-canvas)] shadow-[var(--vestara-elevation-shell-float)] hover:brightness-105 transition flex items-center justify-center"
      >
        {open ? <X size={18} /> : <Sparkles size={18} />}
        {!seen && !open && (
          <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--vestara-status-shell-warning)] border-2 border-[var(--vestara-surface-shell-canvas)]" />
        )}
      </button>
    </div>
  );
}
