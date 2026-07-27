import { useRef, useEffect, useCallback, useState } from 'react';
import { AttachmentPreview } from './AttachmentPreview';
import type { Attachment, Model } from './types';
import { ModelSelector } from './ModelSelector';
import { genId } from './utils';

interface ChatComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  loading: boolean;
  onStop: () => void;
  models: Model[];
  selectedModel: string;
  onModelChange: (id: string) => void;
  placeholder?: string;
  replyToId: string | null;
  onCancelReply: () => void;
}

export function ChatComposer({
  input,
  onInputChange,
  onSend,
  onKeyDown,
  loading,
  onStop,
  models,
  selectedModel,
  onModelChange,
  placeholder,
  replyToId,
  onCancelReply,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          setAttachments((prev) => [
            ...prev,
            { id: genId(), name: file.name || 'pasted-image', type: file.type, size: file.size },
          ]);
        }
      }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      setAttachments((prev) => [...prev, { id: genId(), name: file.name, type: file.type, size: file.size }]);
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <div className="border-t border-zinc-800/40 bg-zinc-950/90 backdrop-blur-xl">
      {/* Reply indicator */}
      {replyToId && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-zinc-500 border-b border-zinc-800/30">
          <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
            />
          </svg>
          <span>Replying to message</span>
          <button
            onClick={onCancelReply}
            className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Attachments */}
      <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />

      {/* Input area */}
      <div className="flex items-end gap-2 p-3">
        <div className="flex-1 relative">
          {/* Attach button */}
          <div className="absolute left-2.5 bottom-2.5 z-10">
            <button
              className="text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer p-1"
              title="Attach file"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            placeholder={placeholder || 'Ask Vestara AI anything...'}
            disabled={loading}
            rows={1}
            className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-zinc-200 placeholder-zinc-600 disabled:opacity-50 resize-none min-h-[40px] max-h-[180px] leading-relaxed focus:border-zinc-500/70 focus:bg-zinc-900/70 transition-colors"
          />
        </div>

        {loading ? (
          <button
            onClick={onStop}
            className="px-3.5 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[12px] hover:bg-red-500/20 transition-colors cursor-pointer min-h-[40px] flex items-center gap-1.5 shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            Stop
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!input.trim()}
            className="px-3.5 py-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-[12px] hover:bg-amber-500/20 transition-colors disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer min-h-[40px] shrink-0 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
            Send
          </button>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between px-3 pb-2.5">
        <div className="flex items-center gap-1">
          <button className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800/30 cursor-pointer flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            Attach
          </button>
          <button className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800/30 cursor-pointer flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
              />
            </svg>
            Context
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-700">
            <kbd className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[9px] font-mono">Enter</kbd>{' '}
            send ·{' '}
            <kbd className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[9px] font-mono">
              Shift+Enter
            </kbd>{' '}
            new line
          </span>
        </div>
      </div>
    </div>
  );
}
