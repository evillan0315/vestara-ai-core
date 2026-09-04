/**
 * VESTARA-INTELLIGENCE GA-2: useAssistantConversation
 * GA-UI-004: optimistic human turn + active turn lifecycle.
 *
 * Thin client adapter over the existing Conversation API.
 * ConversationService/API remains authoritative for durable conversation state.
 * This hook manages transient client state: selection, streaming, loading/error,
 * plus the optimistic human-turn projection (GA-UI-004).
 *
 * Optimistic contract:
 * - On local validation, the human message is projected synchronously into
 *   `optimisticTurns` with delivery 'submitting', alongside streamStatus
 *   'Thinking…'. Never waits for the first SSE event.
 * - `clientTurnId` correlates the optimistic projection with its canonical
 *   persisted message. It is generated client-side (crypto.randomUUID with a
 *   counter fallback) and sent as `clientMessageId` in the stream POST body.
 *   The current server ignores unknown body fields, so this is
 *   forward-compatible and changes no Conversation authority: reconciliation
 *   today is replacement-on-reload (single-writer, turn-serialized), keyed by
 *   `clientTurnId` — never by text+timestamp matching.
 * - On server acknowledgement (`done` + message reload) the optimistic entry
 *   is removed in the same flow that installs canonical messages, so the
 *   human message is never duplicated.
 * - Submission failures (no HTTP response: human NOT persisted) keep the
 *   optimistic entry with delivery 'failed' + Retry. Retry reuses the same
 *   `clientTurnId` and replaces the entry in place — never appends a second
 *   logical turn, so exactly one persisted message results.
 * - Provider failures (HTTP response received, then error chunk: human WAS
 *   persisted) reload canonical messages and drop the optimistic entry.
 *
 * Supports Workspace → zero..N conversations.
 * Does NOT encode "one conversation per Workspace" as invariant.
 *
 * @see VESTARA-INTELLIGENCE-GA2-PREFLIGHT.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation, ConversationSummary, Message } from '@vestara/types';
import type { AssistantExecutionDetail } from '@vestara/shared';

/**
 * GA-UX-PREMIUM M3: cheap inline validation of the server-normalized
 * `assistant.execution.v1` detail. The browser never imports a runtime
 * normalizer (linked-CJS /@fs constraint) — the API already constructed the
 * allowlisted detail, so the hook only verifies the correlation-critical
 * fields (contract, version, operationId, state) before reading them.
 */
function parseExecutionDetail(value: unknown): AssistantExecutionDetail | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.contract !== 'assistant.execution.v1' || record.version !== 1) return undefined;
  if (typeof record.operationId !== 'string' || record.operationId.length === 0) return undefined;
  if (record.state !== 'running' && record.state !== 'completed' && record.state !== 'failed') return undefined;
  return record as AssistantExecutionDetail;
}

// ─── API Client ───────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────

export type StreamState = 'idle' | 'sending' | 'streaming' | 'completed' | 'failed';

/** Presentation lifecycle of an optimistic human turn (GA-UI-004). */
export type OptimisticDelivery = 'submitting' | 'persisted' | 'failed';

/**
 * GA-UX-PREMIUM M2: transient tool-operation projection.
 *
 * Derived ONLY from the existing browser-facing SSE contract
 * (`tool` / `tool_result` chunk types with `name` + bounded `content`).
 * Lifecycle is proven by chunk type, never by parsing status prose:
 * - `tool` → a `running` operation (upserted; consecutive same-name starts
 *   merge because today's contract carries no operation identity — M3 gap).
 * - `tool_result` → the matching `running` operation completes; `completed`
 *   with a bounded preview, or `failed` when content is exactly `failed`
 *   (the adapter's error encoding when a tool errors without output — M3
 *   should replace this with an explicit ok/error flag).
 * - `error` chunk / turn terminal → leftover `running` operations resolve
 *   (`failed` on error; `completed` without preview on `done`, since the
 *   terminal proves execution ended — never claimed from an unrelated event).
 *
 * Never persisted, never written to Conversation Runtime. The timeline
 * unmounts with the active turn. `waiting_permission` is reserved for M3:
 * today's contract collapses permission asks into status strings.
 */
export type ToolOperationState = 'running' | 'completed' | 'failed';

export interface AssistantToolOperation {
  /** Client-side projection id (NOT a runtime/tool identity — M3 gap). */
  id: string;
  /** Tool name exactly as delivered by the `tool`/`tool_result` event. */
  name: string;
  state: ToolOperationState;
  /** Bounded result preview (≤200 chars), completed operations only. */
  preview?: string;
}

export interface OptimisticHumanTurn {
  /**
   * Client-generated correlation id for this logical human turn.
   * Sent as `clientMessageId` (server currently ignores it) and used locally
   * to reconcile the optimistic projection with the canonical message.
   */
  clientTurnId: string;
  /** Owning conversation; null while the conversation is being created. */
  conversationId: string | null;
  content: string;
  createdAt: string;
  delivery: OptimisticDelivery;
}

export interface UseAssistantConversationReturn {
  // Conversation list (metadata only — never messages; GA-UI-006)
  conversations: ConversationSummary[];
  listLoading: boolean;
  listError: string | null;
  /** Re-fetch conversation list metadata (e.g. when opening history). */
  refreshConversations: () => Promise<void>;

  // Selected conversation
  selectedId: string | null;
  selectedConversation: Conversation | null;
  selectConversation: (id: string | null) => void;

  // Creation
  createConversation: () => Promise<string | null>;

  // Messages
  messages: Message[];
  loadMessages: (conversationId: string) => Promise<void>;

  // Optimistic human turns (GA-UI-004): projected synchronously on send,
  // reconciled (removed) once canonical messages reload. Never persisted.
  optimisticTurns: OptimisticHumanTurn[];
  /** Retry a failed optimistic turn in place (same clientTurnId, no duplicate). */
  retryTurn: (clientTurnId: string) => Promise<void>;

  // Send + stream
  sendMessage: (content: string, options?: { surfaceContext?: { kind: string; id: string; label?: string } }) => Promise<void>;
  streamState: StreamState;
  streamingText: string;
  /** Bounded operational status (e.g. "Thinking…", "Reading package.json…"). */
  streamStatus: string | null;
  streamError: string | null;
  /**
   * Transient tool-operation projection for the active turn (GA-UX-PREMIUM M2).
   * Presentation only — cleared on send/select/abort, never persisted.
   */
  toolOperations: AssistantToolOperation[];
  /**
   * Structured edit projections (GA-UX-PREMIUM M4A). Parallel to
   * `toolOperations`; consumed by AssistantCodeEdit. When a structured edit's
   * `operationId` matches a generic operation's identity, the rich surface
   * supersedes the generic row (one operation, one presentation). Cleared with
   * toolOperations on send/select/abort.
   */
  structuredEdits: StructuredEditOperation[];
  /**
   * Latest runtime todo snapshot (GA-UX-PREMIUM M5A). `todo.updated` events
   * are complete replacement snapshots — the checklist presents the most
   * recent one. Transient (per active turn); never persisted.
   */
  taskSnapshot: AssistantExecutionDetail | null;
  abortStream: () => void;
}

export interface StructuredEditOperation {
  /** Stable upstream operation identity (OpenCode callID / namespaced edit id). */
  operationId: string;
  /** The authoritative `assistant.execution.v1` edit detail (patch/hunks/unavailable). */
  detail: AssistantExecutionDetail;
  /**
   * Client op id of the generic M2 operation this edit supersedes, when the
   * operationIds correlate (same identity). Absent → standalone structured edit.
   */
  supersedesOpId?: string;
}

let clientTurnCounter = 0;
let toolOpCounter = 0;

/** Defensive bound: the adapter already slices to ≤200 chars; never trust the wire. */
const TOOL_PREVIEW_MAX = 200;

function makeToolOpId(name: string): string {
  toolOpCounter += 1;
  return `op-${name || 'tool'}-${toolOpCounter}`;
}

function boundPreview(content: unknown): string | undefined {
  if (typeof content !== 'string' || content.length === 0) return undefined;
  return content.slice(0, TOOL_PREVIEW_MAX);
}

/**
 * Apply a `tool_result` chunk to the transient operation list.
 * Completion proven by the chunk; `failed` content heuristic retained for
 * backward compatibility only (the adapter's error encoding when a tool
 * errors without output — M3 should replace this with an explicit flag).
 */
function applyToolResult(
  prev: AssistantToolOperation[],
  toolName: string,
  eventContent: string,
): AssistantToolOperation[] {
  const name = toolName || 'tool';
  const failed = eventContent === 'failed';
  const preview = failed ? undefined : boundPreview(eventContent);
  const idx = toolName ? prev.map((op) => op.name).lastIndexOf(toolName) : -1;
  const match = idx >= 0 ? prev[idx] : undefined;
  if (match && match.state === 'running') {
    return prev.map((op, i) =>
      i === idx ? { ...op, state: (failed ? 'failed' : 'completed') as ToolOperationState, preview } : op,
    );
  }
  const last = prev[prev.length - 1];
  if (
    last &&
    last.name === name &&
    last.state === (failed ? 'failed' : 'completed') &&
    last.preview === preview
  ) {
    return prev;
  }
  return [
    ...prev,
    {
      id: makeToolOpId(name),
      name,
      state: (failed ? 'failed' : 'completed') as ToolOperationState,
      preview,
    },
  ];
}

/**
 * GA-UX-PREMIUM M3: apply a `tool_result` chunk carrying authoritative
 * `assistant.execution.v1` detail. Lifecycle comes from the explicit
 * `state` — NEVER from output text (§4: a successful tool that literally
 * returns "failed" stays completed). Correlation prefers `operationId` over
 * same-name merging; the M2 legacy path remains for detail-less chunks.
 */
function applyStructuredToolResult(
  prev: AssistantToolOperation[],
  toolName: string,
  eventContent: string,
  execution: AssistantExecutionDetail,
  operationIdToOpId: Map<string, string>,
): AssistantToolOperation[] {
  const name = toolName || 'tool';
  // Permission projections never create cards (no authority mutation here).
  if (execution.kind === 'permission') return prev;
  const operationId = execution.operationId;
  const explicit = execution.state === 'failed' ? 'failed' : 'completed';
  const rawPreview =
    execution.kind === 'terminal'
      ? execution.outputPreview
      : execution.kind === 'tool' || execution.kind === 'generic'
        ? execution.preview
        : undefined;
  const preview = explicit === 'failed' ? undefined : boundPreview(rawPreview ?? eventContent);

  const knownOpId = operationIdToOpId.get(operationId);
  if (knownOpId) {
    return prev.map((op) =>
      op.id === knownOpId ? { ...op, name, state: explicit as ToolOperationState, preview } : op,
    );
  }
  // Completion with authoritative identity but no observed start: resolve the
  // trailing same-name running op (e.g. start emitted before subscription).
  const last = prev[prev.length - 1];
  if (last && last.state === 'running' && last.name === name) {
    operationIdToOpId.set(operationId, last.id);
    return prev.map((op) => (op.id === last.id ? { ...op, name, state: explicit as ToolOperationState, preview } : op));
  }
  const created = { id: makeToolOpId(name), name, state: explicit as ToolOperationState, preview };
  operationIdToOpId.set(operationId, created.id);
  return [...prev, created];
}

function makeClientTurnId(): string {
  clientTurnCounter += 1;
  try {
    const uuid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : null;
    if (uuid) return `turn-${uuid}`;
  } catch {
    // fall through to counter fallback
  }
  return `turn-${Date.now()}-${clientTurnCounter}`;
}

// ─── Hook ─────────────────────────────────────────────────────

export function useAssistantConversation(): UseAssistantConversationReturn {
  // ── Conversation list ──
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // ── Selection (transient client state) ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  // ── Messages for selected conversation ──
  const [messages, setMessages] = useState<Message[]>([]);

  // ── Optimistic human turns (GA-UI-004, transient projection only) ──
  const [optimisticTurns, setOptimisticTurns] = useState<OptimisticHumanTurn[]>([]);
  const optimisticRef = useRef<OptimisticHumanTurn[]>([]);
  useEffect(() => {
    optimisticRef.current = optimisticTurns;
  }, [optimisticTurns]);

  // ── Streaming (transient client state) ──
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [streamingText, setStreamingText] = useState('');
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  // ── Tool operations (GA-UX-PREMIUM M2, transient projection only) ──
  const [toolOperations, setToolOperations] = useState<AssistantToolOperation[]>([]);
  // GA-UX-PREMIUM M3: authoritative `operationId` → client op id correlation
  // (transient, per active turn; cleared with toolOperations).
  const operationIdMapRef = useRef<Map<string, string>>(new Map());
  // ── Structured edit projections (GA-UX-PREMIUM M4A, transient) ──
  const [structuredEdits, setStructuredEdits] = useState<StructuredEditOperation[]>([]);
  /** Upsert a structured edit by operationId (later evidence replaces earlier). */
  const upsertStructuredEdit = useCallback((detail: AssistantExecutionDetail) => {
    if (detail.kind !== 'edit') return;
    const operationId = detail.operationId;
    const supersedesOpId = operationIdMapRef.current.get(operationId);
    setStructuredEdits((prev) => {
      const existing = prev.find((entry) => entry.operationId === operationId);
      const next: StructuredEditOperation = { operationId, detail, supersedesOpId };
      return existing ? prev.map((entry) => (entry.operationId === operationId ? next : entry)) : [...prev, next];
    });
  }, []);
  // ── Runtime todo checklist projection (GA-UX-PREMIUM M5A, transient) ──
  // `todo.updated` events are COMPLETE replacement snapshots of the OpenCode
  // runtime todo list. A single evolving checklist (latest snapshot wins) is
  // the truthful presentation — never append semantics, never fabricated IDs.
  const [taskSnapshot, setTaskSnapshot] = useState<AssistantExecutionDetail | null>(null);
  const upsertTaskSnapshot = useCallback((detail: AssistantExecutionDetail) => {
    if (detail.kind !== 'task-snapshot') return;
    setTaskSnapshot(detail);
  }, []);
  const clearToolOperations = () => {
    operationIdMapRef.current.clear();
    setToolOperations([]);
    setStructuredEdits([]);
    setTaskSnapshot(null);
  };
  const abortRef = useRef<AbortController | null>(null);
  const streamIdRef = useRef(0); // stale-stream guard
  const busyRef = useRef(false); // synchronous duplicate-submit guard
  const responseStartedRef = useRef(false); // true once the stream HTTP response is received
  const selectedIdRef = useRef<string | null>(null);
  const lastConvIdRef = useRef<string | null>(null);
  const preserveOptimisticRef = useRef(false); // set while ensure-conversation runs inside a send

  // ── List conversations on mount ──
  const refreshList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await apiFetch<{ conversations: ConversationSummary[] }>('/api/conversations');
      setConversations(data.conversations ?? []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to list conversations');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  // ── Select conversation ──
  const selectConversation = useCallback(
    (id: string | null) => {
      // Abort any in-flight stream when changing selection
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      streamIdRef.current += 1; // invalidate any in-flight stream loop
      busyRef.current = false;
      setStreamState('idle');
      setStreamingText('');
      setStreamStatus(null);
      setStreamError(null);
      clearToolOperations();
      if (!preserveOptimisticRef.current) {
        setOptimisticTurns([]);
      }
      setSelectedId(id);
      selectedIdRef.current = id;
      setSelectedConversation(null);
      setMessages([]);
      if (id) {
        // Load conversation details + messages
        apiFetch<{ conversation: Conversation }>(`/api/conversations/${encodeURIComponent(id)}`)
          .then((data) => {
            setSelectedConversation(data.conversation);
            setMessages(data.conversation.messages ?? []);
          })
          .catch(() => {
            // Conversation may have been deleted server-side
            setSelectedConversation(null);
            setMessages([]);
          });
      }
    },
    [],
  );

  // ── Create conversation ──
  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const data = await apiFetch<{ conversation: Conversation }>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const newId = data.conversation?.id ?? null;
      if (newId) {
        // Refresh list and select the new conversation
        await refreshList();
        selectConversation(newId);
      }
      return newId;
    } catch {
      return null;
    }
  }, [refreshList, selectConversation]);

  // ── Load messages for a conversation ──
  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const data = await apiFetch<{ conversation: Conversation }>(
        `/api/conversations/${encodeURIComponent(conversationId)}`,
      );
      setMessages(data.conversation.messages ?? []);
    } catch {
      setMessages([]);
    }
  }, []);

  // ── Run one assistant turn (GA-UI-004 reconciliation core) ──
  // The optimistic entry identified by clientTurnId is reconciled here:
  // success / provider-failure (human persisted) → reload canonical messages
  // then drop the optimistic entry; submission failure (human NOT persisted)
  // → keep the entry with delivery 'failed' for Retry.
  const runTurn = useCallback(
    async (convId: string, text: string, clientTurnId: string) => {
      const finalConvId = convId;
      const currentStreamId = ++streamIdRef.current;
      responseStartedRef.current = false;
      lastConvIdRef.current = finalConvId;

      const controller = new AbortController();
      abortRef.current = controller;

      const dropOptimistic = () => {
        setOptimisticTurns((prev) => prev.filter((t) => t.clientTurnId !== clientTurnId));
      };
      const failOptimistic = () => {
        setOptimisticTurns((prev) =>
          prev.map((t) => (t.clientTurnId === clientTurnId ? { ...t, delivery: 'failed' as const } : t)),
        );
      };

      try {
        const res = await fetch(`/api/conversations/${encodeURIComponent(finalConvId)}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // clientMessageId is forward-compatible correlation: the current
          // server ignores unknown body fields (no Conversation change).
          body: JSON.stringify({ message: text, clientMessageId: clientTurnId }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        // The streaming request was accepted → the human message is persisted
        // server-side (DefaultConversationService persists before streaming).
        responseStartedRef.current = true;

        // Stale stream guard: selection changed or abort while awaiting response
        if (currentStreamId !== streamIdRef.current) return;

        setStreamState('streaming');

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';

        const finalizeSuccess = async () => {
          if (currentStreamId !== streamIdRef.current) return;
          setStreamState('completed');
          setStreamingText('');
          setStreamStatus(null);
          // Turn terminal proves execution ended: resolve any operation still
          // marked running (a missed tool_result must not stick forever).
          // Completed WITHOUT preview — completion is proven, output is not.
          setToolOperations((prev) =>
            prev.map((op) => (op.state === 'running' ? { ...op, state: 'completed' as const } : op)),
          );
          // Reload canonical messages, then reconcile: the persisted human
          // message is now present, so the optimistic entry must go.
          await loadMessages(finalConvId);
          if (currentStreamId === streamIdRef.current) {
            dropOptimistic();
            // Refresh list to update messageCount/title
            refreshList();
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Stale stream guard: if selection changed, stop processing
          if (currentStreamId !== streamIdRef.current) return;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              const eventType = data?.event?.type;
              const eventContent = data?.event?.content ?? '';

              if (eventType === 'delta') {
                accumulated += eventContent;
                setStreamingText(accumulated);
              } else if (eventType === 'status') {
                // Bounded operational status replaces Thinking…/previous status
                setStreamStatus(eventContent || null);
                // GA-UX-PREMIUM M4A: structured edit projections ride the
                // status channel (file.edited / turn-end diff enrichment).
                // M5A: runtime todo snapshots (todo.updated → task-snapshot)
                // replace the active checklist on every snapshot event.
                const execution = parseExecutionDetail(data?.event?.execution);
                if (execution) {
                  upsertStructuredEdit(execution);
                  upsertTaskSnapshot(execution);
                }
              } else if (eventType === 'tool') {
                const toolName = typeof data?.event?.name === 'string' ? data.event.name : '';
                setStreamStatus(
                  toolName === 'bash' ? 'Running command…' : toolName ? `Reading ${toolName}…` : 'Working…',
                );
                // GA-UX-PREMIUM M3: prefer authoritative operation identity;
                // legacy same-name merge remains for detail-less servers.
                const execution = parseExecutionDetail(data?.event?.execution);
                setToolOperations((prev) => {
                  if (execution?.operationId && (execution.kind === 'tool' || execution.kind === 'terminal' || execution.kind === 'generic')) {
                    const knownId = operationIdMapRef.current.get(execution.operationId);
                    if (knownId) {
                      return prev.map((op) =>
                        op.id === knownId && op.state !== 'running' ? { ...op, state: 'running' as const } : op,
                      );
                    }
                    const created = { id: makeToolOpId(toolName || 'tool'), name: toolName || 'tool', state: 'running' as const };
                    operationIdMapRef.current.set(execution.operationId, created.id);
                    return [...prev, created];
                  }
                  const last = prev[prev.length - 1];
                  if (last && last.state === 'running' && last.name === (toolName || 'tool')) return prev;
                  return [...prev, { id: makeToolOpId(toolName || 'tool'), name: toolName || 'tool', state: 'running' as const }];
                });
              } else if (eventType === 'tool_result') {
                setStreamStatus('Preparing response…');
                const toolName = typeof data?.event?.name === 'string' ? data.event.name : '';
                const execution = parseExecutionDetail(data?.event?.execution);
                if (execution) upsertStructuredEdit(execution);
                setToolOperations((prev) =>
                  execution?.operationId
                    ? applyStructuredToolResult(prev, toolName, eventContent, execution, operationIdMapRef.current)
                    : applyToolResult(prev, toolName, eventContent),
                );
              } else if (eventType === 'done') {
                // Stream completed successfully
                await finalizeSuccess();
                return;
              } else if (eventType === 'error') {
                throw new Error(eventContent || 'Stream failed');
              }
            } catch (parseErr) {
              // JSON parse errors on individual lines are non-fatal
              if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
                throw parseErr;
              }
            }
          }
        }

        // If we exit the loop without a 'done' event
        await finalizeSuccess();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User aborted or selection changed — the initiator (abortStream /
          // selectConversation) already owns state cleanup. Just stop.
          return;
        }
        if (currentStreamId === streamIdRef.current) {
          if (!responseStartedRef.current) {
            // Submission failure: the human message was NOT persisted.
            // Keep it visible as failed with Retry (never silently remove).
            failOptimistic();
            setStreamState('failed');
            setStreamStatus(null);
            setStreamError(`Failed to send: ${err instanceof Error ? err.message : 'Unknown error'}`);
          } else {
            // Provider failure: the human message WAS persisted. Reconcile
            // to canonical messages and drop the optimistic entry.
            try {
              await loadMessages(finalConvId);
            } catch {
              // keep existing messages on reload failure
            }
            if (currentStreamId === streamIdRef.current) {
              dropOptimistic();
              setStreamState('failed');
              setStreamStatus(null);
              setStreamError(
                `Assistant response failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
              );
              // Turn-level failure resolves leftover running operations.
              setToolOperations((prev) =>
                prev.map((op) => (op.state === 'running' ? { ...op, state: 'failed' as const } : op)),
              );
            }
          }
        }
      } finally {
        if (currentStreamId === streamIdRef.current) {
          abortRef.current = null;
        }
        busyRef.current = false;
      }
    },
    [loadMessages, refreshList, upsertStructuredEdit, upsertTaskSnapshot],
  );

  // ── Send message + stream response ──
  // Projects the optimistic human turn + Thinking… synchronously on local
  // validation, before any network await.
  const sendMessage = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || busyRef.current || streamState === 'sending' || streamState === 'streaming') return;

      // Synchronous projection: no visually empty period after Send.
      busyRef.current = true;
      const clientTurnId = makeClientTurnId();
      const now = new Date().toISOString();
      const scopedConvId = selectedIdRef.current;
      setOptimisticTurns((prev) => [
        ...prev,
        { clientTurnId, conversationId: scopedConvId, content: text, createdAt: now, delivery: 'submitting' },
      ]);
      setStreamState('sending');
      setStreamingText('');
      setStreamStatus('Thinking…');
      setStreamError(null);
      clearToolOperations();

      // Ensure a conversation exists (preserving the projected turn across
      // the internal selectConversation call).
      let convId = selectedIdRef.current;
      if (!convId) {
        preserveOptimisticRef.current = true;
        try {
          convId = await createConversation();
        } finally {
          preserveOptimisticRef.current = false;
        }
        if (!convId) {
          setOptimisticTurns((prev) =>
            prev.map((t) => (t.clientTurnId === clientTurnId ? { ...t, delivery: 'failed' as const } : t)),
          );
          setStreamState('failed');
          setStreamStatus(null);
          setStreamError('Failed to send: could not create conversation');
          busyRef.current = false;
          return;
        }
        convId = selectedIdRef.current ?? convId;
        const resolvedConvId = convId;
        setOptimisticTurns((prev) =>
          prev.map((t) =>
            t.clientTurnId === clientTurnId ? { ...t, conversationId: resolvedConvId } : t,
          ),
        );
      }

      await runTurn(convId, text, clientTurnId);
    },
    [streamState, createConversation, runTurn],
  );

  // ── Retry a failed optimistic turn in place (same logical turn) ──
  const retryTurn = useCallback(
    async (clientTurnId: string) => {
      const entry = optimisticRef.current.find((t) => t.clientTurnId === clientTurnId);
      if (!entry || entry.delivery !== 'failed') return;
      if (busyRef.current || streamState === 'sending' || streamState === 'streaming') return;

      busyRef.current = true;
      setOptimisticTurns((prev) =>
        prev.map((t) => (t.clientTurnId === clientTurnId ? { ...t, delivery: 'submitting' as const } : t)),
      );
      setStreamState('sending');
      setStreamingText('');
      setStreamStatus('Thinking…');
      setStreamError(null);
      clearToolOperations();

      let convId = entry.conversationId ?? selectedIdRef.current;
      if (!convId) {
        preserveOptimisticRef.current = true;
        try {
          convId = await createConversation();
        } finally {
          preserveOptimisticRef.current = false;
        }
        if (!convId) {
          setOptimisticTurns((prev) =>
            prev.map((t) => (t.clientTurnId === clientTurnId ? { ...t, delivery: 'failed' as const } : t)),
          );
          setStreamState('failed');
          setStreamStatus(null);
          setStreamError('Failed to send: could not create conversation');
          busyRef.current = false;
          return;
        }
        convId = selectedIdRef.current ?? convId;
      }

      await runTurn(convId, entry.content, clientTurnId);
    },
    [streamState, createConversation, runTurn],
  );

  // ── Abort stream ──
  // Bounded cancellation over the existing execution path: aborting the fetch
  // signal stops the client read loop server-side. No new architecture.
  // Minimizing the panel never calls this — state lives in the hook, so the
  // active turn continues while hidden.
  const abortStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamIdRef.current += 1; // invalidate the in-flight stream loop
    busyRef.current = false;
    setStreamState('idle');
    setStreamingText('');
    setStreamStatus(null);
    setStreamError(null);
    clearToolOperations();
    // Reconcile: the human message was already persisted server-side, so
    // reload canonical messages and drop the in-flight optimistic entry.
    // Failed entries (never persisted) are preserved for Retry.
    const convId = lastConvIdRef.current ?? selectedIdRef.current;
    if (convId) {
      loadMessages(convId)
        .catch(() => {})
        .then(() => {
          setOptimisticTurns((prev) =>
            prev.filter((t) => t.delivery === 'failed' || t.conversationId !== convId),
          );
        });
    } else {
      setOptimisticTurns((prev) => prev.filter((t) => t.delivery === 'failed'));
    }
  }, [loadMessages]);

  return {
    conversations,
    listLoading,
    listError,
    refreshConversations: refreshList,
    selectedId,
    selectedConversation,
    selectConversation,
    createConversation,
    messages,
    loadMessages,
    optimisticTurns,
    retryTurn,
    sendMessage,
    streamState,
    streamingText,
    streamStatus,
    streamError,
    toolOperations,
    structuredEdits,
    taskSnapshot,
    abortStream,
  };
}
