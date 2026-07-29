import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatComposer } from './ChatComposer';
import { ChatSidebar } from './ChatSidebar';
import { ConversationHeader } from './ConversationHeader';
import { MessageList } from './MessageList';
import { useChat } from './useChat';

export default function ChatLayout() {
  const chat = useChat();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSuggestionClick = useCallback(
    (text: string) => {
      chat.sendMessage(text);
    },
    [chat],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        chat.openSearch();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        chat.newConversation();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'o') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [chat]);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-zinc-950 border border-zinc-800/50 rounded-xl">
      <ChatSidebar
        open={sidebarOpen}
        conversations={chat.conversations}
        activeBranch={chat.activeBranch}
        branches={chat.branches}
        searchQuery={chat.searchQuery}
        showSearch={chat.showSearch}
        searchMatchCount={chat.filteredMessages?.length ?? null}
        onSearchChange={chat.setSearchQuery}
        onSearchToggle={chat.openSearch}
        onSearchClose={() => {
          chat.setSearchQuery('');
          chat.setShowSearch(false);
        }}
        onNewConversation={chat.newConversation}
        onSelectConversation={chat.switchConversation}
        onDeleteConversation={chat.deleteConversation}
        onClose={() => setSidebarOpen((v) => !v)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <div className="shrink-0">
          <ConversationHeader
            sidebarOpen={sidebarOpen}
            onSidebarToggle={() => setSidebarOpen((v) => !v)}
            onNewConversation={chat.newConversation}
            onClear={chat.clearChat}
            hasMessages={chat.messages.length > 0}
          />
        </div>

        <MessageList
          messages={chat.messages}
          loading={chat.loading}
          streamingText={chat.streamingText}
          greetingLoaded={chat.greetingLoaded}
          userName={chat.userName}
          copiedId={chat.copiedId}
          editingId={chat.editingId}
          editText={chat.editText}
          replyToId={chat.replyToId}
          followUpId={chat.followUpId}
          showScrollBtn={chat.showScrollBtn}
          filteredMessages={chat.filteredMessages}
          isNewUser={chat.isNewUser}
          onCopy={chat.handleCopy}
          onEdit={chat.startEdit}
          onSaveEdit={chat.saveEdit}
          onCancelEdit={chat.cancelEdit}
          onEditTextChange={chat.setEditText}
          onDelete={chat.deleteMessage}
          onReply={chat.setReplyToId}
          onBranch={(_id: string) => {}}
          onFollowUpToggle={chat.setFollowUpId}
          onSendFollowUp={(text) => {
            chat.setInput(text);
            setTimeout(() => chat.sendMessage(text), 0);
          }}
          onScroll={chat.handleMessagesScroll}
          onScrollToBottom={scrollToBottom}
          onSuggestionClick={handleSuggestionClick}
        />

        <ChatComposer
          input={chat.input}
          onInputChange={chat.setInput}
          onSend={() => chat.sendMessage()}
          onKeyDown={chat.handleKeyDown}
          loading={chat.loading}
          onStop={chat.stopGeneration}
          placeholder={
            chat.loading
              ? 'Waiting...'
              : chat.isNewUser && !chat.userName
                ? 'Tell me your name...'
                : chat.replyToId
                  ? 'Write a reply...'
                  : 'Ask Vestara AI anything...'
          }
          replyToId={chat.replyToId}
          onCancelReply={() => chat.setReplyToId(null)}
          onAudioTranscription={(text) => {
            chat.setInput(text);
            setTimeout(() => chat.sendMessage(text), 100);
          }}
        />
      </div>
    </div>
  );
}
