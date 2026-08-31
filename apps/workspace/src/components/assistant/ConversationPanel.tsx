/**
 * VESTARA-INTELLIGENCE GA-1 Slice 3: ConversationPanel
 *
 * Conversation presentation layer inside the floating panel.
 * Composes GA-2 (useAssistantConversation) and GA-3 (SurfaceContext)
 * into a functional assistant conversation UI.
 *
 * Responsibilities:
 * - Message rendering (user + assistant)
 * - Compose input with send
 * - Streaming text display
 * - Degraded mode for backend unavailability
 * - Surface context display (workspace, route)
 * - Auto-scroll to latest message
 *
 * DOES NOT:
 * - Manage panel lifecycle (FloatingPanel responsibility)
 * - Own conversation persistence (ConversationService responsibility)
 * - Aggregate diagnostics or health
 * - Execute tools or make governance decisions
 *
 * @see VESTARA-INTELLIGENCE-GA1-PREFLIGHT.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { useSurfaceContext } from '../../contexts/SurfaceContext';
import type { UseAssistantConversationReturn } from '../../hooks/useAssistantConversation';

// ─── Types ────────────────────────────────────────────────────

export interface ConversationPanelProps {
  assistant: UseAssistantConversationReturn;
  /** Ref for the compose textarea — used by FloatingPanel for focus contract */
  focusOnMountRef?: React.RefObject<HTMLElement | null>;
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

// ─── Components ───────────────────────────────────────────────

function MessageBubble({ message }: { message: { role: string; content: string; createdAt: string; model?: string } }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] min-w-0 ${isUser ? 'order-2' : 'order-1'}`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <div className="w-4 h-4 rounded-md bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-[10px] text-zinc-500 font-medium">Assistant</span>
            {message.model && <span className="text-[8px] text-zinc-700 font-mono">{message.model}</span>}
            <span className="text-[9px] text-zinc-700">{formatTime(message.createdAt)}</span>
          </div>
        )}

        <div
          className={`px-3 py-2 text-[13px] leading-relaxed rounded-xl ${
            isUser
              ? 'bg-amber-500/10 border border-amber-500/20 text-zinc-200'
              : 'bg-zinc-800/40 text-zinc-300'
          }`}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>

        {isUser && (
          <div className="flex justify-end mt-0.5 px-1">
            <span className="text-[9px] text-zinc-700">{formatTime(message.createdAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingBubble({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div className="flex items-center gap-1.5 mb-1 px-1">
          <div className="w-4 h-4 rounded-md bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 flex items-center justify-center animate-pulse">
            <svg className="w-2.5 h-2.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-[10px] text-zinc-500 font-medium">Assistant</span>
          <span className="text-[8px] text-amber-500 animate-pulse">typing...</span>
        </div>
        <div className="px-3 py-2 text-[13px] leading-relaxed rounded-xl bg-zinc-800/40 text-zinc-300">
          <MarkdownRenderer content={text} />
        </div>
      </div>
    </div>
  );
}

function ComposeInput({
  onSend,
  loading,
  onStop,
  focusRef,
}: {
  onSend: (text: string) => void;
  loading: boolean;
  onStop: () => void;
  focusRef?: React.RefObject<HTMLElement | null>;
}) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expose textarea ref to parent for focus contract
  useEffect(() => {
    if (focusRef) {
      (focusRef as React.MutableRefObject<HTMLElement | null>).current = textareaRef.current;
    }
  }, [focusRef]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    onSend(text);
    setInput('');
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
    <div className="border-t border-zinc-800 bg-zinc-950/80 p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          rows={1}
          className="flex-1 resize-none rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-2 text-[13px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors"
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
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

// ─── Main Component ───────────────────────────────────────────

export function ConversationPanel({ assistant, focusOnMountRef }: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const surface = useSurfaceContext();

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [assistant.messages, assistant.streamingText]);

  // Auto-create conversation on first send if none selected
  const handleSend = useCallback(
    async (text: string) => {
      await assistant.sendMessage(text);
    },
    [assistant.sendMessage],
  );

  const degraded = isDegraded(assistant);
  const hasMessages = assistant.messages.length > 0;
  const isStreaming = assistant.streamState === 'sending' || assistant.streamState === 'streaming';
  const showEmpty = !hasMessages && !isStreaming && !assistant.selectedId;

  return (
    <div className="flex flex-col h-full">
      {/* Surface context badge */}
      <SurfaceContextBadge surface={surface.surface} />

      {/* Degraded banner */}
      {(assistant.listError || assistant.streamError) && (
        <DegradedBanner error={assistant.listError || assistant.streamError || ''} />
      )}

      {/* Loading indicator */}
      {assistant.listLoading && !hasMessages && (
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

      {/* Message list */}
      {hasMessages && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {assistant.messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isStreaming && assistant.streamingText && <StreamingBubble text={assistant.streamingText} />}
        </div>
      )}

      {/* Streaming with no messages yet */}
      {!hasMessages && isStreaming && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          <StreamingBubble text={assistant.streamingText} />
        </div>
      )}

      {/* Compose */}
      <ComposeInput
        onSend={handleSend}
        loading={isStreaming}
        onStop={assistant.abortStream}
        focusRef={focusOnMountRef}
      />
    </div>
  );
}

export default ConversationPanel;
