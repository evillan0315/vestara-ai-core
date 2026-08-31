/**
 * VESTARA-INTELLIGENCE GA-2: useAssistantConversation
 *
 * Thin client adapter over the existing Conversation API.
 * ConversationService/API remains authoritative for durable conversation state.
 * This hook manages transient client state: selection, streaming, loading/error.
 *
 * Supports Workspace → zero..N conversations.
 * Does NOT encode "one conversation per Workspace" as invariant.
 *
 * @see VESTARA-INTELLIGENCE-GA2-PREFLIGHT.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation, ConversationSummary, Message } from '@vestara/types';

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

export interface UseAssistantConversationReturn {
  // Conversation list
  conversations: ConversationSummary[];
  listLoading: boolean;
  listError: string | null;

  // Selected conversation
  selectedId: string | null;
  selectedConversation: Conversation | null;
  selectConversation: (id: string | null) => void;

  // Creation
  createConversation: () => Promise<string | null>;

  // Messages
  messages: Message[];
  loadMessages: (conversationId: string) => Promise<void>;

  // Send + stream
  sendMessage: (content: string) => Promise<void>;
  streamState: StreamState;
  streamingText: string;
  streamError: string | null;
  abortStream: () => void;
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

  // ── Streaming (transient client state) ──
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [streamingText, setStreamingText] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamIdRef = useRef(0); // stale-stream guard

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
      setStreamState('idle');
      setStreamingText('');
      setStreamError(null);
      setSelectedId(id);
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

  // ── Send message + stream response ──
  const sendMessage = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || streamState === 'sending' || streamState === 'streaming') return;

      // Ensure a conversation exists
      let convId = selectedId;
      if (!convId) {
        convId = await createConversation();
        if (!convId) return;
      }

      const finalConvId = convId;
      const currentStreamId = ++streamIdRef.current;

      // Start streaming
      setStreamState('sending');
      setStreamingText('');
      setStreamError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/conversations/${encodeURIComponent(finalConvId)}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        setStreamState('streaming');

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';

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
              } else if (eventType === 'done') {
                // Stream completed successfully
                if (currentStreamId === streamIdRef.current) {
                  setStreamState('completed');
                  setStreamingText('');
                  // Reload conversation to get the persisted messages
                  await loadMessages(finalConvId);
                  // Refresh list to update messageCount/title
                  refreshList();
                }
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
        if (currentStreamId === streamIdRef.current) {
          setStreamState('completed');
          setStreamingText('');
          await loadMessages(finalConvId);
          refreshList();
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User aborted — stream state already cleared by abortStream
          return;
        }
        if (currentStreamId === streamIdRef.current) {
          // Distinguish: conversation operation failed vs provider inference failed
          // If we got an HTTP response, the human message was persisted
          // If we got a network error, the message may not have been persisted
          const isProviderFailure = streamState === 'streaming';
          setStreamState('failed');
          setStreamError(
            isProviderFailure
              ? `Assistant response failed: ${err instanceof Error ? err.message : 'Unknown error'}`
              : `Failed to send: ${err instanceof Error ? err.message : 'Unknown error'}`,
          );
        }
      } finally {
        if (currentStreamId === streamIdRef.current) {
          abortRef.current = null;
        }
      }
    },
    [selectedId, streamState, createConversation, loadMessages, refreshList],
  );

  // ── Abort stream ──
  const abortStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamState('idle');
    setStreamingText('');
    setStreamError(null);
  }, []);

  return {
    conversations,
    listLoading,
    listError,
    selectedId,
    selectedConversation,
    selectConversation,
    createConversation,
    messages,
    loadMessages,
    sendMessage,
    streamState,
    streamingText,
    streamError,
    abortStream,
  };
}
