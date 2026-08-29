import { useCallback, useState } from 'react';
import { scrubToolMarkup } from '../normalize.js';
import type { ConversationEntry, ToolCard } from '../types.js';

export interface UseChatResult {
  messages: ConversationEntry[];
  tools: ToolCard[];
  pushUser: (content: string) => void;
  pushSystem: (content: string) => void;
  startAssistant: (id?: string) => string;
  appendDelta: (id: string, content: string) => void;
  completeAssistant: (id: string) => void;
  upsertTool: (card: ToolCard) => void;
  clear: () => void;
}

/**
 * Conversation state for the TUI chat view. Streamed chunks are accumulated per
 * assistant message; tool cards are upserted by id. Kept separate from view/
 * navigation state so the chat module is self-contained and testable.
 */
export function useChat(maxEntries = 300): UseChatResult {
  const [messages, setMessages] = useState<ConversationEntry[]>([]);
  const [tools, setTools] = useState<ToolCard[]>([]);

  const pushUser = useCallback(
    (content: string) => {
      setMessages((current) =>
        [...current, { id: `user-${Date.now()}`, role: 'user' as const, content }].slice(-maxEntries),
      );
    },
    [maxEntries],
  );

  const pushSystem = useCallback(
    (content: string) => {
      setMessages((current) =>
        [...current, { id: `sys-${Date.now()}`, role: 'system' as const, content }].slice(-maxEntries),
      );
    },
    [maxEntries],
  );

  const startAssistant = useCallback(
    (id?: string): string => {
      const assistantId = id ?? `assistant-${Date.now()}`;
      setMessages((current) =>
        [...current, { id: assistantId, role: 'assistant' as const, content: '', streaming: true }].slice(-maxEntries),
      );
      return assistantId;
    },
    [maxEntries],
  );

  const appendDelta = useCallback((id: string, content: string) => {
    setMessages((current) =>
      current.map((item) => (item.id === id ? { ...item, content: item.content + scrubToolMarkup(content) } : item)),
    );
  }, []);

  const completeAssistant = useCallback((id: string) => {
    setMessages((current) => current.map((item) => (item.id === id ? { ...item, streaming: false } : item)));
  }, []);

  const upsertTool = useCallback((card: ToolCard) => {
    setTools((current) => [...current.filter((item) => item.id !== card.id), card].slice(-30));
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setTools([]);
  }, []);

  return { messages, tools, pushUser, pushSystem, startAssistant, appendDelta, completeAssistant, upsertTool, clear };
}
