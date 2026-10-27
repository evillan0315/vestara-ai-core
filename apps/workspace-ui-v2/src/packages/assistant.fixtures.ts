// Floating assistant fixture — identity, greeting, starters, replies.
// Replies are a deterministic rotation (no timers, no randomness).
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.

export interface AssistantMessage {
  id: string;
  from: 'assistant' | 'user';
  text: string;
  /** Provenance footnote, e.g. latency — rendered small under the bubble. */
  note?: string;
}

export const ASSISTANT_IDENTITY = {
  name: 'Vestara Assistant',
  status: 'Online • 10 agents',
} as const;

export const ASSISTANT_GREETING: AssistantMessage[] = [
  {
    id: 'greet-01',
    from: 'assistant',
    text: 'Director — shell nominal. Ask for a window, a package, or fleet status.',
  },
];

export const ASSISTANT_SUGGESTIONS = ['Open Activity Room', 'Shell status', 'What can you do?'] as const;

export type AssistantSuggestion = (typeof ASSISTANT_SUGGESTIONS)[number];

import type { WinType } from '../lib/types';

/** Starters that perform a real shell action before the chat turn. */
export const SUGGESTION_ACTIONS: Partial<Record<AssistantSuggestion, WinType>> = {
  'Open Activity Room': 'activity',
};

export const ASSISTANT_REPLIES = [
  'Shell nominal — clean desktop, live agent mesh, 32px header.',
  'I open packages from the dock, report fleet status, and narrate shell state.',
  'Activity Room holds 50 records; the mesh shows 6 active agents of 7.',
] as const;

// Shown (danger-styled by the panel) when a live request fails before the
// fixture fallback reply — the fallback is always labelled as such.
export const ASSISTANT_ERROR_NOTICE = 'Live request failed — fixture reply instead.';
