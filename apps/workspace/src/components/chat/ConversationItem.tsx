import type { ConversationData } from './types';

interface ConversationItemProps {
  conversation: ConversationData;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin?: (id: string) => void;
}

export function ConversationItem({ conversation, isActive, onSelect, onDelete, onTogglePin }: ConversationItemProps) {
  const msgCount = Object.values(conversation.branches).flat().length;

  return (
    <div
      onClick={() => onSelect(conversation.id)}
      className={`group flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
        isActive
          ? 'bg-(--vestara-accent-bg) border border-(--vestara-accent-border)'
          : 'border border-transparent hover:bg-(--vestara-accent-bg) hover:border-(--vestara-accent-border)'
      }`}
    >
      <svg
        className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? 'text-amber-400' : 'text-(--vestara-text-muted)'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
        />
      </svg>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className={`text-[12px] truncate ${isActive ? 'text-(--vestara-text) font-medium' : 'text-(--vestara-text-2)'}`}>
            {conversation.title}
          </div>
          {conversation.pinned && (
            <span className="text-[9px] text-amber-500 shrink-0" title="Pinned">📌</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex items-end gap-[1px] h-3">
            {[2, 3, 4, 3, 5, 4, 2].map((h, i) => (
              <span key={i} className="w-[2px] rounded-sm bg-(--vestara-accent) transition-all"
                style={{ height: `${Math.max(2, Math.min(h, msgCount > 5 ? 12 : 6))}px`, opacity: Math.max(0.3, Math.min(1, h / 5)) }} />
            ))}
          </div>
          <span className="text-[10px] text-(--vestara-text-dim)">
            {msgCount} message{msgCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin?.(conversation.id);
        }}
        className={`opacity-0 group-hover:opacity-100 transition-all cursor-pointer mt-0.5 shrink-0 ${conversation.pinned ? 'text-amber-500' : 'text-(--vestara-text-muted) hover:text-amber-400'}`}
        title={conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
      >
        <svg className="w-3.5 h-3.5" fill={conversation.pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
          />
        </svg>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conversation.id);
        }}
        className="opacity-0 group-hover:opacity-100 text-(--vestara-text-muted) hover:text-red-400 transition-all cursor-pointer mt-0.5 shrink-0"
        title="Delete conversation"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  );
}
