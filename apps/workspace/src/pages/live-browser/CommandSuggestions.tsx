/**
 * CommandSuggestions — "Try these commands" chips that send a preset voice
 * command. Matches the Live Browser right-rail design.
 */

import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';

export interface CommandSuggestionsProps {
  disabled: boolean;
  onCommand(text: string): void;
}

const SUGGESTED_COMMANDS = ['go to github.com', 'search for docs', 'take a screenshot', 'scroll down'];

export function CommandSuggestions({ disabled, onCommand }: CommandSuggestionsProps) {
  return (
    <div className="rounded-xl border border-(--vestara-accent-border) bg-zinc-900 p-3">
      <div className="mb-2 flex items-center gap-2">
        <LightbulbRoundedIcon fontSize="small" className="text-(--vestara-accent-text)" />
        <h2 className="text-sm font-semibold text-(--vestara-text)">Try these commands</h2>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_COMMANDS.map((command) => (
          <button
            key={command}
            type="button"
            onClick={() => onCommand(command)}
            disabled={disabled}
            className="rounded-full border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-2 py-1 text-[11px] text-(--vestara-accent-text) transition-colors hover:bg-(--vestara-accent-border) disabled:cursor-not-allowed disabled:opacity-40"
          >
            {command}
          </button>
        ))}
      </div>
    </div>
  );
}
