import { useEffect, useRef } from 'react';
import { MessageActions } from './MessageActions';
import type { ChatMessage } from './types';
import { formatTime } from './utils';

interface UserMessageProps {
  message: ChatMessage;
  isCopied: boolean;
  isEditing: boolean;
  editText: string;
  isReplyActive: boolean;
  onEdit: (id: string, content: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onEditTextChange: (text: string) => void;
  onCopy: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onReply: (id: string) => void;
  onBranch: (id: string) => void;
  isHighlighted?: boolean;
}

export function UserMessage({
  message,
  isCopied,
  isEditing,
  editText,
  isReplyActive,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onEditTextChange,
  onCopy,
  onDelete,
  onReply,
  onBranch,
  isHighlighted,
}: UserMessageProps) {
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.style.height = 'auto';
      editRef.current.style.height = `${Math.min(editRef.current.scrollHeight, 200)}px`;
    }
  }, [isEditing]);

  return (
    <div className={`flex justify-end group ${isHighlighted ? 'ring-1 ring-amber-500/20 rounded-2xl' : ''}`}>
      <div className="max-w-full min-w-0">
        {isEditing ? (
          <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-2xl p-3">
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              onInput={(e) => {
                const ta = e.currentTarget;
                ta.style.height = 'auto';
                ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
              }}
              rows={3}
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-500 resize-none mb-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSaveEdit(message.id);
                }
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onCancelEdit}
                className="text-[11px] px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-500 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => onSaveEdit(message.id)}
                className="text-[11px] px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1 px-1">
              <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span className="text-[11px] text-zinc-500 font-medium">You</span>
              <span className="text-[10px] text-zinc-700">{formatTime(message.timestamp)}</span>
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-zinc-800/40 border border-zinc-700/50 text-sm text-zinc-200 leading-relaxed">
              <span className="whitespace-pre-wrap">{message.content}</span>
            </div>
          </>
        )}

        <div className="flex items-center justify-between mt-0.5 px-1 h-6">
          <div />
          <MessageActions
            messageId={message.id}
            role="user"
            content={message.content}
            isCopied={isCopied}
            onCopy={onCopy}
            onEdit={onEdit}
            onDelete={onDelete}
            onReply={onReply}
            onBranch={onBranch}
            isReplyActive={isReplyActive}
          />
        </div>
      </div>
    </div>
  );
}
