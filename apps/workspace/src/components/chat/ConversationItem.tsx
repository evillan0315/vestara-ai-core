import type { ConversationData } from './types';

interface ConversationItemProps {
  conversation: ConversationData;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ConversationItem({ conversation, isActive, onSelect, onDelete }: ConversationItemProps) {
  const msgCount = Object.values(conversation.branches).flat().length;

  return (
    <div
      onClick={() => onSelect(conversation.id)}
      className={`group flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
        isActive
          ? 'bg-zinc-800/60 border border-zinc-700/50'
          : 'border border-transparent hover:bg-zinc-800/30 hover:border-zinc-800/50'
      }`}
    >
      <svg
        className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? 'text-amber-400' : 'text-zinc-600'}`}
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
        <div className={`text-[12px] truncate ${isActive ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}>
          {conversation.title}
        </div>
        <div className="text-[10px] text-zinc-700 mt-0.5">
          {msgCount} message{msgCount !== 1 ? 's' : ''}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conversation.id);
        }}
        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all cursor-pointer mt-0.5 shrink-0"
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
