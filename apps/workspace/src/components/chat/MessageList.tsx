import { useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ChatMessage } from './types';
import { getDateLabel, getFollowUps } from './utils';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ChatEmptyState } from './ChatEmptyState';
import { ScrollToLatest } from './ScrollToLatest';
import { ChatError } from './ChatError';
import { CodeBlock, Table } from './CodeBlock';

interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  streamingText: string;
  greetingLoaded: boolean;
  userName: string | null;
  copiedId: string | null;
  editingId: string | null;
  editText: string;
  replyToId: string | null;
  followUpId: string | null;
  showScrollBtn: boolean;
  filteredMessages: string[] | null;
  isNewUser: boolean;
  onCopy: (id: string, content: string) => void;
  onEdit: (id: string, content: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onEditTextChange: (text: string) => void;
  onDelete: (id: string) => void;
  onReply: (id: string) => void;
  onBranch: (id: string) => void;
  onFollowUpToggle: (id: string) => void;
  onSendFollowUp: (text: string) => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onScrollToBottom: () => void;
  onSuggestionClick: (text: string) => void;
  onRegenerate?: () => void;
}

export function MessageList({
  messages,
  loading,
  streamingText,
  greetingLoaded,
  copiedId,
  editingId,
  editText,
  replyToId,
  followUpId,
  showScrollBtn,
  filteredMessages,
  isNewUser,
  onCopy,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onEditTextChange,
  onDelete,
  onReply,
  onBranch,
  onFollowUpToggle,
  onSendFollowUp,
  onScroll,
  onScrollToBottom,
  onSuggestionClick,
  onRegenerate,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (autoScrollRef.current) {
      scrollToBottom();
    }
  }, [messages, streamingText, scrollToBottom]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      onScroll(e);
      const el = e.currentTarget;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      autoScrollRef.current = isNearBottom;
    },
    [onScroll],
  );

  const sortedMessages = useMemo(() => {
    const root = messages.filter((m) => !m.parentId);
    const replies = messages.filter((m) => m.parentId);
    const grouped: Record<string, ChatMessage[]> = {};
    for (const r of replies) {
      if (!grouped[r.parentId!]) grouped[r.parentId!] = [];
      grouped[r.parentId!].push(r);
    }
    return root.map((m) => ({ msg: m, replies: grouped[m.id] || [] }));
  }, [messages]);

  if (!greetingLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="inline-block w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
          <p className="text-[12px] text-zinc-600">Connecting...</p>
        </div>
      </div>
    );
  }

  if (greetingLoaded && messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <ChatEmptyState onSuggestionClick={onSuggestionClick} />
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={bottomRef} />
      <div onScroll={handleScroll} className="absolute inset-0 overflow-y-auto">
        <div className="w-full px-4 sm:px-6 py-4 space-y-2">
          {sortedMessages.map(({ msg, replies }, idx) => {
            const isHighlighted = filteredMessages?.includes(msg.id);
            const prevMsg = idx > 0 ? sortedMessages[idx - 1].msg : undefined;
            const dateLabel = getDateLabel(msg.timestamp, prevMsg?.timestamp);
            const fups = msg.role === 'assistant' ? getFollowUps(msg.content) : null;

            return (
              <div key={msg.id}>
                {dateLabel && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-zinc-800/60" />
                    <span className="text-[10px] text-zinc-700 uppercase tracking-widest font-semibold">
                      {dateLabel}
                    </span>
                    <div className="flex-1 h-px bg-zinc-800/60" />
                  </div>
                )}

                <div className="py-2">
                  {msg.role === 'user' ? (
                    <UserMessage
                      message={msg}
                      isCopied={copiedId === msg.id}
                      isEditing={editingId === msg.id}
                      editText={editText}
                      isReplyActive={replyToId === msg.id}
                      isHighlighted={!!isHighlighted}
                      onEdit={onEdit}
                      onSaveEdit={onSaveEdit}
                      onCancelEdit={onCancelEdit}
                      onEditTextChange={onEditTextChange}
                      onCopy={onCopy}
                      onDelete={onDelete}
                      onReply={onReply}
                      onBranch={onBranch}
                    />
                  ) : msg.content.startsWith('Error:') ? (
                    <div className="flex justify-start">
                      <ChatError message={msg.content} onRetry={onRegenerate} />
                    </div>
                  ) : (
                    <AssistantMessage
                      message={msg}
                      isCopied={copiedId === msg.id}
                      isFollowUpActive={followUpId === msg.id}
                      followUps={fups || []}
                      isHighlighted={!!isHighlighted}
                      onCopy={onCopy}
                      onRegenerate={onRegenerate}
                      onReply={onReply}
                      onBranch={onBranch}
                      onFollowUp={onFollowUpToggle}
                      onSendFollowUp={onSendFollowUp}
                    />
                  )}
                </div>

                {replies.length > 0 && (
                  <div className="ml-8 pl-4 space-y-2 border-l-2 border-zinc-800/40">
                    <div className="text-[9px] text-zinc-700 uppercase tracking-wider mb-1">Replies</div>
                    {replies.map((reply) => (
                      <div key={reply.id} className="py-1">
                        {reply.role === 'user' ? (
                          <UserMessage
                            message={reply}
                            isCopied={copiedId === reply.id}
                            isEditing={editingId === reply.id}
                            editText={editText}
                            isReplyActive={replyToId === reply.id}
                            onEdit={onEdit}
                            onSaveEdit={onSaveEdit}
                            onCancelEdit={onCancelEdit}
                            onEditTextChange={onEditTextChange}
                            onCopy={onCopy}
                            onDelete={onDelete}
                            onReply={onReply}
                            onBranch={onBranch}
                          />
                        ) : (
                          <AssistantMessage
                            message={reply}
                            isCopied={copiedId === reply.id}
                            isFollowUpActive={followUpId === reply.id}
                            followUps={getFollowUps(reply.content)}
                            onCopy={onCopy}
                            onReply={onReply}
                            onBranch={onBranch}
                            onFollowUp={onFollowUpToggle}
                            onSendFollowUp={onSendFollowUp}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Streaming response */}
          {streamingText && (
            <div className="py-2">
              <div className="flex justify-start group">
                <div className="max-w-full min-w-0">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <div className="w-5 h-5 rounded-md bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 flex items-center justify-center">
                      <svg className="w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                    <span className="text-[11px] text-zinc-500 font-medium">Vestara AI</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse" />
                  </div>
                  <div className="px-4 py-3 text-sm text-zinc-300 leading-relaxed">
                    <div className="markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                        components={{
                          code: CodeBlock as any,
                          table: Table as any,
                        }}
                      >
                        {streamingText}
                      </ReactMarkdown>
                    </div>
                    {!streamingText.endsWith('\n') && <span className="animate-pulse text-zinc-500">▌</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Thinking / waiting state */}
          {loading && !streamingText && (
            <div className="py-2">
              <ThinkingIndicator status={isNewUser ? 'Getting to know you...' : undefined} />
            </div>
          )}
        </div>

        <ScrollToLatest visible={showScrollBtn} onClick={scrollToBottom} />
      </div>
    </div>
  );
}
