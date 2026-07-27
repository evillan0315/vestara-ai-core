import type { Model } from './types';
import { ModelSelector } from './ModelSelector';

interface ConversationHeaderProps {
  models: Model[];
  selectedModel: string;
  onModelChange: (id: string) => void;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  onNewConversation: () => void;
  onClear: () => void;
  hasMessages: boolean;
}

export function ConversationHeader({
  models,
  selectedModel,
  onModelChange,
  sidebarOpen,
  onSidebarToggle,
  onNewConversation,
  onClear,
  hasMessages,
}: ConversationHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/40 shrink-0">
      <div className="flex items-center gap-2">
        <button
          onClick={onSidebarToggle}
          className="text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer p-1.5 rounded-lg hover:bg-zinc-800/50"
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h2 className="text-sm font-medium text-zinc-300">Vestara AI</h2>
      </div>

      <div className="flex items-center gap-2">
        <ModelSelector models={models} selectedModel={selectedModel} onModelChange={onModelChange} />
        {!sidebarOpen && (
          <button
            onClick={onNewConversation}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-zinc-500 border border-zinc-700/50 rounded-lg hover:text-zinc-300 hover:border-zinc-600 transition-colors cursor-pointer"
            title="New chat"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
        {hasMessages && (
          <button
            onClick={onClear}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-zinc-800/50 cursor-pointer flex items-center gap-1"
            title="Clear conversation"
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
        )}
      </div>
    </header>
  );
}
