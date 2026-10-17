import { useEffect, useRef } from 'react';
import type { AutoCompleteCommand, AutoCompleteState } from './composerAutoComplete';

export interface ComposerAutoCompleteProps {
  readonly draft: string;
  readonly state: AutoCompleteState;
  readonly selectedIndex: number;
  readonly onSelect: (command: AutoCompleteCommand) => void;
  readonly onDismiss: () => void;
  readonly onNavigate: (index: number) => void;
}

export function ComposerAutoComplete({
  draft,
  state,
  selectedIndex,
  onSelect,
  onDismiss,
  onNavigate,
}: ComposerAutoCompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const triggerLine = draft.slice(state.triggerIndex).trimStart();

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Command suggestions"
      className="absolute bottom-full left-0 z-30 mb-1 max-h-56 w-72 overflow-y-auto rounded-xl border border-(--vestara-border-subtle) bg-(--vestara-surface-panel) p-1 shadow-2xl"
      data-testid="composer-autocomplete"
    >
      <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-(--vestara-text-muted)">
        Commands
      </div>
      {state.commands.map((command, index) => (
        <button
          key={command.trigger}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          data-selected={index === selectedIndex}
          onMouseEnter={() => onNavigate(index)}
          onClick={() => onSelect(command)}
          className={`flex w-full flex-col rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer ${
            index === selectedIndex ? 'bg-(--vestara-accent-bg)' : ''
          }`}
          data-testid="composer-autocomplete-option"
        >
          <span className="text-[11px] font-medium text-(--vestara-text-primary)">
            <span className="text-(--vestara-accent-text)">{command.trigger}</span>
            {triggerLine.length > command.trigger.length && (
              <span className="text-(--vestara-text-dim)">{triggerLine.slice(command.trigger.length)}</span>
            )}
          </span>
          <span className="text-[10px] text-(--vestara-text-secondary)">{command.description}</span>
        </button>
      ))}
      <div className="mt-1 border-t border-(--vestara-border-subtle) px-2 pt-1 pb-0.5">
        <button
          type="button"
          onClick={onDismiss}
          className="text-[9px] text-(--vestara-text-muted) transition-colors hover:text-(--vestara-text-primary) cursor-pointer"
        >
          Esc to dismiss
        </button>
      </div>
    </div>
  );
}
