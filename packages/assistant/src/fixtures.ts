/**
 * Offline-first fixture thread — identity, greeting, starters, replies.
 * Replies are a deterministic rotation (no timers, no randomness).
 * Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.
 *
 * Ported from apps/workspace-ui-v2/src/packages/assistant.fixtures.ts.
 * Shell-action starters (v2 `SUGGESTION_ACTIONS` over v2 `WinType`) stay in
 * the v2 app — this package must not depend on app types.
 */

export interface AssistantFixtureMessage {
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

export const ASSISTANT_GREETING: AssistantFixtureMessage[] = [
  {
    id: 'greet-01',
    from: 'assistant',
    text: 'Director — shell nominal. Ask for a window, a package, or fleet status.',
  },
];

export const ASSISTANT_SUGGESTIONS = ['Open Activity Room', 'Shell status', 'What can you do?'] as const;

export type AssistantSuggestion = (typeof ASSISTANT_SUGGESTIONS)[number];

export const ASSISTANT_REPLIES = [
  'Shell nominal — clean desktop, live agent mesh, 32px header.',
  'I open packages from the dock, report fleet status, and narrate shell state.',
  'Activity Room holds 50 records; the mesh shows 6 active agents of 7.',
] as const;

// Shown (danger-styled by the panel) when a live request fails before the
// fixture fallback reply — the fallback is always labelled as such.
export const ASSISTANT_ERROR_NOTICE = 'Live request failed — fixture reply instead.';
