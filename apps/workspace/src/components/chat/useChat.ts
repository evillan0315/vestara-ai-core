import { useCallback, useEffect, useRef, useState } from 'react';
import { useProviderSettings } from '../../hooks/useProviderSettings';
import type { ChatMessage, ConversationData, ToolCall } from './types';
import { branchId, genId } from './utils';

const CONV_KEY = 'vestara-chat-convs';

function loadConversations(): ConversationData[] {
  try {
    const r = localStorage.getItem(CONV_KEY);
    return r ? JSON.parse(r) : [];
  } catch {
    return [];
  }
}

function saveConversations(convs: ConversationData[]) {
  try {
    localStorage.setItem(CONV_KEY, JSON.stringify(convs));
  } catch {}
}

export function useChat() {
  const [branches, setBranches] = useState<Record<string, ChatMessage[]>>({});
  const [activeBranch, setActiveBranch] = useState<string>(branchId());
  const [input, setInput] = useState('');
  const { settings } = useProviderSettings();
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(true);
  const [greetingLoaded, setGreetingLoaded] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [convLoaded, setConvLoaded] = useState(false);
  const conversationIdRef = useRef<string | null>(null);

  const messages = branches[activeBranch] || [];

  const setMessages = useCallback(
    (fn: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setBranches((prev) => ({
        ...prev,
        [activeBranch]: typeof fn === 'function' ? fn(prev[activeBranch] || []) : fn,
      }));
    },
    [activeBranch],
  );

  // Load conversations / greeting
  useEffect(() => {
    (async () => {
      const saved = loadConversations();
      if (saved.length > 0) {
        setConversations(saved);
        const latest = saved.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
        setBranches(latest.branches);
        setActiveBranch(latest.activeBranch);
        setConvLoaded(true);
        setGreetingLoaded(true);
        return;
      }
      setConvLoaded(true);
      try {
        const res = await fetch('/api/chat/greeting');
        if (res.ok) {
          const d = await res.json();
          setUserName(d.name);
          setIsNewUser(d.isNew);
          if (d.greeting) {
            const msg: ChatMessage = { id: genId(), role: 'assistant', content: d.greeting, timestamp: Date.now() };
            setBranches((prev) => ({ ...prev, [activeBranch]: [msg] }));
          }
        }
      } catch {}
      setGreetingLoaded(true);
    })();
  }, []);

  // Auto-save conversations
  const saveCurrentConv = useCallback(
    (allConvs: ConversationData[], br: Record<string, ChatMessage[]>, brId: string) => {
      const msgs = br[brId] || [];
      if (msgs.length === 0 && allConvs.every((c) => c.id !== brId)) return allConvs;
      const existing = allConvs.find((c) => c.id === brId);
      const firstUserMsg = msgs.find((m) => m.role === 'user');
      const title = existing?.title || firstUserMsg?.content.slice(0, 60) || 'New Chat';
      const now = Date.now();
      const updated = existing
        ? allConvs.map((c) =>
            c.id === existing.id ? { ...c, branches: br, activeBranch: brId, timestamp: now, title } : c,
          )
        : [...allConvs, { id: brId, title, branches: br, activeBranch: brId, timestamp: now }];
      saveConversations(updated);
      return updated;
    },
    [],
  );

  useEffect(() => {
    if (!convLoaded) return;
    setConversations((prev) => saveCurrentConv(prev, branches, activeBranch));
  }, [branches, activeBranch, convLoaded, saveCurrentConv]);

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride || input).trim();
      if (!text || loading) return;

      setInput('');
      setStreamingText('');
      setReplyToId(null);

      const userMsg: ChatMessage = {
        id: genId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
        parentId: replyToId || undefined,
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      const controller = new AbortController();
      setAbortController(controller);

      if (isNewUser && !userName) {
        try {
          const profileRes = await fetch('/api/chat/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text }),
          });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            if (profileData.name) {
              setUserName(profileData.name);
              setIsNewUser(false);
            }
          }
        } catch {}
      }

      const assistantId = genId();
      let accumulated = '';
      let added = false;
      const pendingToolCalls: ToolCall[] = [];

      try {
        if (!conversationIdRef.current) {
          const created = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            signal: controller.signal,
          }).then((r) => r.json().catch(() => ({})) as Promise<{ conversation?: { id?: string } }>);
          conversationIdRef.current = created?.conversation?.id ?? null;
        }
        const conversationId = conversationIdRef.current;
        if (!conversationId) throw new Error('Unable to create a conversation');

        const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, model: settings.model }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              const eventType = data?.event?.type;
              const content = data?.event?.content ?? '';

              if (eventType === 'delta') {
                accumulated += content.replace(/<\/?think>\s*/g, '');
                setStreamingText(accumulated);
              } else if (eventType === 'tool_result') {
                const toolName = data.event.name || '';
                const existing = pendingToolCalls.find((t) => t.tool === toolName && t.status === 'running');
                if (existing) {
                  existing.status = 'completed';
                  existing.output = content || '';
                }
                setStreamingText(accumulated);
              } else if (eventType === 'done') {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: assistantId,
                    role: 'assistant',
                    content: accumulated,
                    timestamp: Date.now(),
                    parentId: replyToId || undefined,
                    toolCalls: pendingToolCalls.length > 0 ? [...pendingToolCalls] : undefined,
                  },
                ]);
                setStreamingText('');
                added = true;
              } else if (eventType === 'status') {
                setStreamingText(accumulated);
              } else if (eventType === 'error') throw new Error(content || 'Stream failed');
            } catch {}
          }
        }

        if (!added) {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: 'assistant',
              content: accumulated || '',
              timestamp: Date.now(),
              toolCalls: pendingToolCalls.length > 0 ? [...pendingToolCalls] : undefined,
            },
          ]);
          setStreamingText('');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: 'assistant', content: 'Error: Failed to get response.', timestamp: Date.now() },
          ]);
          setStreamingText('');
        }
      } finally {
        setLoading(false);
        setAbortController(null);
      }
    },
    [input, loading, settings, isNewUser, userName, replyToId, setMessages],
  );

  const stopGeneration = useCallback(() => {
    abortController?.abort();
    setLoading(false);
    setAbortController(null);
    if (streamingText) {
      setMessages((prev) => [
        ...prev,
        { id: genId(), role: 'assistant', content: streamingText, timestamp: Date.now() },
      ]);
      setStreamingText('');
    }
  }, [abortController, streamingText, setMessages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const deleteMessage = useCallback(
    (id: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    },
    [setMessages],
  );

  const startEdit = useCallback((id: string, content: string) => {
    setEditingId(id);
    setEditText(content);
  }, []);

  const saveEdit = useCallback(
    (id: string) => {
      if (editText.trim()) {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: editText } : m)));
      }
      setEditingId(null);
      setEditText('');
    },
    [editText, setMessages],
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 300);
  }, []);

  const clearChat = useCallback(() => {
    setBranches((prev) => ({ ...prev, [activeBranch]: [] }));
    setStreamingText('');
    setReplyToId(null);
  }, [activeBranch]);

  const newConversation = useCallback(() => {
    const id = branchId();
    setBranches({});
    setActiveBranch(id);
    setStreamingText('');
    setReplyToId(null);
  }, []);

  const deleteConversation = useCallback((convId: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== convId);
      saveConversations(next);
      if (next.length === 0) {
        const id = branchId();
        setBranches({});
        setActiveBranch(id);
      } else {
        const target = next.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
        setBranches(target.branches);
        setActiveBranch(target.activeBranch);
      }
      return next;
    });
  }, []);

  const switchConversation = useCallback((convId: string) => {
    const conv = loadConversations().find((c) => c.id === convId);
    if (!conv) return;
    setBranches(conv.branches);
    setActiveBranch(conv.activeBranch);
    setStreamingText('');
    setReplyToId(null);
  }, []);

  const togglePin = useCallback((convId: string) => {
    setConversations((prev) => {
      const next = prev.map((c) => (c.id === convId ? { ...c, pinned: !c.pinned } : c));
      saveConversations(next);
      return next;
    });
  }, []);

  const handleCopy = useCallback((id: string, content: string) => {
    copyToClipboard(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const resetOnboarding = useCallback(async () => {
    setBranches({});
    setActiveBranch(branchId());
    setStreamingText('');
    setUserName(null);
    setIsNewUser(true);
    try {
      await fetch('/api/chat/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'reset' }),
      });
    } catch {}
    const res = await fetch('/api/chat/greeting');
    if (res.ok) {
      const d = await res.json();
      setUserName(d.name);
      setIsNewUser(d.isNew);
      if (d.greeting)
        setBranches((prev) => ({
          ...prev,
          [activeBranch]: [{ id: genId(), role: 'assistant', content: d.greeting, timestamp: Date.now() }],
        }));
    }
  }, [activeBranch]);

  const openSearch = useCallback(() => setShowSearch((v) => !v), []);

  const filteredMessages = !searchQuery.trim()
    ? null
    : messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase())).map((m) => m.id);

  return {
    // State
    branches,
    activeBranch,
    messages,
    input,
    setInput,
    loading,
    streamingText,
    copiedId,
    userName,
    isNewUser,
    greetingLoaded,
    replyToId,
    showSearch,
    searchQuery,
    setSearchQuery,
    editingId,
    editText,
    showScrollBtn,
    followUpId,
    setFollowUpId,
    conversations,
    convLoaded,
    filteredMessages,
    // Actions
    sendMessage,
    stopGeneration,
    handleKeyDown,
    deleteMessage,
    startEdit,
    saveEdit,
    cancelEdit,
    handleMessagesScroll,
    clearChat,
    newConversation,
    deleteConversation,
    togglePin,
    switchConversation,
    handleCopy,
    resetOnboarding,
    openSearch,
    setReplyToId,
    setShowSearch,
    setEditText,
    settings,
  };
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}
