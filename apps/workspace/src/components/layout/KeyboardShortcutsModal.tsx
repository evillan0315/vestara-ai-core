import type { FC } from 'react';

interface ShortcutEntry {
  keys: string[];
  description: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  { keys: ['⌘K', 'Ctrl+K'], description: 'Command palette' },
  { keys: ['⌘N', 'Ctrl+N'], description: 'New chat conversation' },
  { keys: ['⌘⇧O', 'Ctrl+Shift+O'], description: 'Toggle chat sidebar' },
  { keys: ['⌘Enter', 'Ctrl+Enter'], description: 'Send API request (API Builder)' },
  { keys: ['⌘T', 'Ctrl+T'], description: 'New API tab' },
  { keys: ['⌘W', 'Ctrl+W'], description: 'Close API tab' },
  { keys: ['Escape'], description: 'Close dialog / exit focus mode' },
  { keys: ['?'], description: 'Toggle this help modal' },
  { keys: ['G then D'], description: 'Navigate to Dashboard' },
  { keys: ['G then S'], description: 'Navigate to Sessions' },
  { keys: ['G then A'], description: 'Navigate to Agents' },
  { keys: ['G then C'], description: 'Navigate to Chat' },
  { keys: ['G then T'], description: 'Navigate to Terminal' },
];

const KeyboardShortcutsModal: FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-(--vestara-accent-border) rounded-xl w-full max-w-lg mx-4 shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-(--vestara-accent-border)">
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            ⌨️ Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-400 cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys[0]} className="flex items-center justify-between py-1.5">
              <span className="text-[11px] text-zinc-400">{s.description}</span>
              <div className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="text-[9px] px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded font-mono"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-(--vestara-accent-border) text-center text-[8px] text-(--vestara-text-dim)">
          Press <kbd className="text-[8px] px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded font-mono">?</kbd> at any time to open this panel
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
