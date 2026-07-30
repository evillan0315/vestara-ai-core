import { ChatSearch } from './ChatSearch';
import { ConversationList } from './ConversationList';
import type { ChatMessage, ConversationData } from './types';

interface ChatSidebarProps {
  open: boolean;
  conversations: ConversationData[];
  activeBranch: string;
  branches: Record<string, ChatMessage[]>;
  searchQuery: string;
  showSearch: boolean;
  searchMatchCount: number | null;
  onSearchChange: (value: string) => void;
  onSearchToggle: () => void;
  onSearchClose: () => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onTogglePinConversation?: (id: string) => void;
  onClose: () => void;
}

export function ChatSidebar({
  open,
  conversations,
  activeBranch,
  branches,
  searchQuery,
  showSearch,
  searchMatchCount,
  onSearchChange,
  onSearchToggle,
  onSearchClose,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onTogglePinConversation,
  onClose,
}: ChatSidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 bg-black/40 z-40 sm:hidden" onClick={onClose} />}

      <aside
        className={`fixed sm:relative z-50 sm:z-0 top-0 sm:top-0 left-0 h-full sm:h-auto shrink-0 border-r border-(--vestara-accent-border) bg-zinc-950/95 backdrop-blur-xl sm:bg-zinc-950 flex flex-col transition-all duration-200 ease-in-out ${
          open
            ? 'w-[280px] xl:w-[320px] translate-x-0 overflow-hidden sm:overflow-visible'
            : 'w-0 -translate-x-full overflow-hidden'
        }`}
      >
        <div className="p-3 border-b border-(--vestara-accent-border) shrink-0">
          <button
            onClick={onNewConversation}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 rounded-lg hover:bg-zinc-700/50 hover:border-zinc-600/50 transition-all text-[12px] cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-(--vestara-accent-border)">
          <button
            onClick={onSearchToggle}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/30 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span>Search conversations</span>
            <kbd className="ml-auto px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[9px] font-mono text-zinc-600">
              Ctrl+K
            </kbd>
          </button>
          {showSearch && (
            <ChatSearch
              value={searchQuery}
              onChange={onSearchChange}
              matchCount={searchMatchCount}
              onClose={onSearchClose}
            />
          )}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <ConversationList
            conversations={conversations}
            activeBranch={activeBranch}
            branches={branches}
            onSelect={onSelectConversation}
            onDelete={onDeleteConversation}
            onTogglePin={onTogglePinConversation}
          />
        </div>
      </aside>
    </>
  );
}
