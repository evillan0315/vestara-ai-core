import type { ChatMessage } from './types';
import { formatTime, getFollowUps } from './utils';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MessageActions } from './MessageActions';
import { ToolCallDisplay } from './ToolCallDisplay';

interface AssistantMessageProps {
  message: ChatMessage;
  isCopied: boolean;
  isFollowUpActive: boolean;
  followUps: string[];
  onCopy: (id: string, content: string) => void;
  onRegenerate?: () => void;
  onReply: (id: string) => void;
  onBranch: (id: string) => void;
  onFollowUp: (id: string) => void;
  onSendFollowUp: (text: string) => void;
  isHighlighted?: boolean;
}

export function AssistantMessage({
  message,
  isCopied,
  isFollowUpActive,
  followUps,
  onCopy,
  onRegenerate,
  onReply,
  onBranch,
  onFollowUp,
  onSendFollowUp,
  isHighlighted,
}: AssistantMessageProps) {
  return (
    <div className={`flex justify-start group ${isHighlighted ? 'ring-1 ring-amber-500/20 rounded-2xl' : ''}`}>
      <div className="max-w-full min-w-0">
        <div className="flex items-center gap-2 mb-1 px-1">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-[11px] text-zinc-500 font-medium">Vestara AI</span>
          <span className="text-[10px] text-zinc-700">{formatTime(message.timestamp)}</span>
        </div>

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="px-2">
            <ToolCallDisplay toolCalls={message.toolCalls} />
          </div>
        )}

        {message.content && (
          <div className="px-4 py-3 text-sm text-zinc-300 leading-relaxed">
            <MarkdownRenderer content={message.content} />
          </div>
        )}

        <div className="flex items-center justify-between mt-0.5 px-1 h-6">
          <div />
          <MessageActions
            messageId={message.id}
            role="assistant"
            content={message.content}
            isCopied={isCopied}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onReply={onReply}
            onBranch={onBranch}
            onFollowUp={onFollowUp}
            isFollowUpActive={isFollowUpActive}
          />
        </div>

        {followUps.length > 0 && isFollowUpActive && (
          <div className="mt-2 flex flex-wrap gap-1.5 px-1">
            {followUps.map((f) => (
              <button
                key={f}
                onClick={() => onSendFollowUp(f)}
                className="text-[11px] px-2.5 py-1 bg-zinc-800/40 border border-zinc-700/60 text-zinc-500 rounded-lg hover:bg-zinc-700 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
