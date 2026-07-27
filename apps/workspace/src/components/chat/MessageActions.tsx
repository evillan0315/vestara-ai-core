import { useState } from 'react';

interface MessageActionsProps {
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  isCopied: boolean;
  onCopy: (id: string, content: string) => void;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
  onRegenerate?: () => void;
  onReply?: (id: string) => void;
  onBranch?: (id: string) => void;
  onFollowUp?: (id: string) => void;
  isReplyActive?: boolean;
  isFollowUpActive?: boolean;
}

export function MessageActions({
  messageId,
  role,
  content,
  isCopied,
  onCopy,
  onEdit,
  onDelete,
  onRegenerate,
  onReply,
  onBranch,
  onFollowUp,
  isReplyActive,
  isFollowUpActive,
}: MessageActionsProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => onCopy(messageId, content)}
        className="px-1.5 py-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer rounded hover:bg-zinc-800/50"
        title="Copy message"
      >
        {isCopied ? 'Copied!' : 'Copy'}
      </button>

      {role === 'user' && onEdit && (
        <button
          onClick={() => onEdit(messageId, content)}
          className="px-1.5 py-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer rounded hover:bg-zinc-800/50"
          title="Edit message"
        >
          Edit
        </button>
      )}

      {role === 'user' &&
        onDelete &&
        (confirmingDelete ? (
          <button
            onClick={() => {
              onDelete(messageId);
              setConfirmingDelete(false);
            }}
            className="px-1.5 py-1 text-[11px] text-red-400 transition-colors cursor-pointer rounded hover:bg-red-400/10"
          >
            Confirm?
          </button>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="px-1.5 py-1 text-[11px] text-zinc-600 hover:text-red-400 transition-colors cursor-pointer rounded hover:bg-zinc-800/50"
            title="Delete message"
          >
            Delete
          </button>
        ))}

      {role === 'assistant' && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="px-1.5 py-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer rounded hover:bg-zinc-800/50"
          title="Regenerate response"
        >
          Regenerate
        </button>
      )}

      {onReply && (
        <button
          onClick={() => onReply(messageId)}
          className={`px-1.5 py-1 text-[11px] transition-colors cursor-pointer rounded hover:bg-zinc-800/50 ${
            isReplyActive ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
          }`}
          title="Reply to this message"
        >
          Reply
        </button>
      )}

      {onBranch && (
        <button
          onClick={() => onBranch(messageId)}
          className="px-1.5 py-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer rounded hover:bg-zinc-800/50"
          title="Branch from here"
        >
          Branch
        </button>
      )}

      {role === 'assistant' && onFollowUp && (
        <button
          onClick={() => onFollowUp(messageId)}
          className={`px-1.5 py-1 text-[11px] transition-colors cursor-pointer rounded hover:bg-zinc-800/50 ${
            isFollowUpActive ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
          }`}
          title="Suggest follow-ups"
        >
          Suggest
        </button>
      )}
    </div>
  );
}
