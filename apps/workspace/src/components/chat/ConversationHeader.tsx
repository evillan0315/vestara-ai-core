interface ConversationHeaderProps {
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  onNewConversation: () => void;
  onClear: () => void;
  hasMessages: boolean;
}

export function ConversationHeader({
  sidebarOpen, onSidebarToggle, onNewConversation, onClear, hasMessages,
}: ConversationHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-2.5 border-b border-(--vestara-accent-border) shrink-0">
      <div className="flex items-center gap-2">
        <button onClick={onSidebarToggle}
          className="text-(--vestara-text-muted) hover:text-(--vestara-text) transition-colors cursor-pointer p-1.5 rounded-lg hover:bg-(--vestara-accent-bg)"
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h2 className="text-sm font-medium text-(--vestara-text)">Vestara AI</h2>
        {/* Activity dot line */}
        {hasMessages && (
          <div className="flex items-end gap-[2px] ml-2 h-4">
            {[2, 4, 3, 5, 4, 6, 3].map((h, i) => (
              <span key={i} className="w-[2px] rounded-sm bg-(--vestara-accent) transition-all"
                style={{ height: `${h}px`, opacity: 0.3 + i * 0.1 }} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {!sidebarOpen && (
          <button onClick={onNewConversation}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-(--vestara-text-2) border border-(--vestara-accent-border) rounded-lg hover:text-(--vestara-text) hover:border-(--vestara-accent-border-hover) transition-colors cursor-pointer"
            title="New chat">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
        {hasMessages && (
          <button onClick={onClear}
            className="text-[11px] text-(--vestara-text-muted) hover:text-(--vestara-text) transition-colors px-2 py-1.5 rounded-lg hover:bg-(--vestara-accent-bg) cursor-pointer flex items-center gap-1"
            title="Clear conversation">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
