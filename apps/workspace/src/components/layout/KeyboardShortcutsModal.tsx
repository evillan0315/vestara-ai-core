import type { FC } from 'react';
import { VestaraModal } from '../ui/VestaraModal';

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
    <VestaraModal onClose={onClose} className="max-w-lg max-h-[80vh] flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-(--vestara-accent-border) shrink-0">
        <h2 className="text-sm font-semibold text-(--vestara-text) flex items-center gap-2">
          ⌨️ Keyboard Shortcuts
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-(--vestara-text-dim) hover:text-(--vestara-text-2) cursor-pointer text-sm"
        >
          ✕
        </button>
      </div>
      <div className="p-4 overflow-y-auto space-y-2 flex-1 min-h-0">
        {SHORTCUTS.map((s) => (
          <div key={s.keys[0]} className="flex items-center justify-between py-1.5">
            <span className="text-[11px] text-(--vestara-text-2)">{s.description}</span>
            <div className="flex gap-1">
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="text-[9px] px-1.5 py-0.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded font-mono"
                >
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-(--vestara-accent-border) text-center text-[8px] text-(--vestara-text-dim) shrink-0">
        Press <kbd className="text-[8px] px-1 py-0.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded font-mono">?</kbd> at any time to open this panel
      </div>
    </VestaraModal>
  );
};

export default KeyboardShortcutsModal;
