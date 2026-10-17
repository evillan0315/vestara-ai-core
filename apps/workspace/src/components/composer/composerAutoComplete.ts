import type { ComposerSuggestionMode } from '@vestara/shared';

const COMMAND_MODES: readonly ComposerSuggestionMode[] = [
  'suggest',
  'recommend',
  'docs',
  'clarify',
  'expand',
  'investigate',
  'audit',
  'prototype',
  'implement',
  'verify',
];

export interface AutoCompleteCommand {
  readonly trigger: string;
  readonly mode: ComposerSuggestionMode;
  readonly description: string;
}

export interface AutoCompleteState {
  readonly active: boolean;
  readonly triggerIndex: number;
  readonly query: string;
  readonly commands: readonly AutoCompleteCommand[];
}

export const ALL_COMMANDS: readonly AutoCompleteCommand[] = COMMAND_MODES.map((mode) => ({
  trigger: `/${mode}`,
  mode,
  description: getCommandDescription(mode),
}));

function getCommandDescription(mode: ComposerSuggestionMode): string {
  switch (mode) {
    case 'suggest':
      return 'Get suggestions for your message';
    case 'recommend':
      return 'Get recommendations';
    case 'docs':
      return 'Documentation guidance';
    case 'clarify':
      return 'Clarify your intent';
    case 'expand':
      return 'Expand your draft';
    case 'investigate':
      return 'Investigate further';
    case 'audit':
      return 'Audit existing work';
    case 'prototype':
      return 'Prototype an approach';
    case 'implement':
      return 'Implementation guidance';
    case 'verify':
      return 'Verification steps';
  }
}

/**
 * Detects whether the current draft contains an auto-complete trigger
 * and returns the matching commands. Trigger is a trailing `/` or `/<partial>`
 * at the end of the draft (on its own line or at the start).
 */
export function detectAutoComplete(draft: string): AutoCompleteState | null {
  const match = draft.match(/(?:^|\n)\s*\/([a-z-]*)\s*$/i);
  if (!match) return null;

  const query = (match[1] ?? '').toLowerCase();
  // Point triggerIndex at the '/' character itself, not the preceding newline
  const matchStart = match.index ?? 0;
  const slashOffset = match[0].indexOf('/');
  const triggerIndex = matchStart + slashOffset;

  if (query.length === 0) {
    return {
      active: true,
      triggerIndex,
      query: '',
      commands: ALL_COMMANDS,
    };
  }

  const filtered = ALL_COMMANDS.filter((cmd) => cmd.trigger.slice(1).startsWith(query));
  if (filtered.length === 0) return null;

  return {
    active: true,
    triggerIndex,
    query,
    commands: filtered,
  };
}

/**
 * Returns the text with the auto-complete trigger replaced by the selected command.
 */
export function applyAutoComplete(draft: string, state: AutoCompleteState, command: AutoCompleteCommand): string {
  const beforeTrigger = draft.slice(0, state.triggerIndex);
  return `${beforeTrigger}/${command.mode}`;
}

/**
 * Returns the text with the auto-complete trigger removed (dismissed).
 */
export function dismissAutoComplete(draft: string, state: AutoCompleteState): string {
  const beforeTrigger = draft.slice(0, state.triggerIndex);
  return beforeTrigger.trimEnd();
}
