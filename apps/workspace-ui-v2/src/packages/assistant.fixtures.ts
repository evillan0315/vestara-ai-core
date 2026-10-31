// Floating assistant fixture — v2 shell starters over the shared package thread.
// Identity, greeting, suggestions, and replies live in `@vestara/assistant`
// (single source of truth); only the shell-action mapping (v2 `WinType`) stays
// app-local — the package must never depend on app types.

import type { WinType } from '../lib/types';
import type { AssistantSuggestion } from '@vestara/assistant';

export type { AssistantFixtureMessage as AssistantMessage } from '@vestara/assistant';
export {
  ASSISTANT_ERROR_NOTICE,
  ASSISTANT_GREETING,
  ASSISTANT_IDENTITY,
  ASSISTANT_REPLIES,
  ASSISTANT_SUGGESTIONS,
} from '@vestara/assistant';
export type { AssistantSuggestion };

/** Starters that perform a real shell action before the chat turn. */
export const SUGGESTION_ACTIONS: Partial<Record<AssistantSuggestion, WinType>> = {
  'Open Activity Room': 'activity',
};
