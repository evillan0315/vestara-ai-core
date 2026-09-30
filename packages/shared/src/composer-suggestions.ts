/**
 * AR-COMPOSER-SUGGEST-001 — bounded composer suggestion contract.
 *
 * A suggestion is an unsent proposed articulation. It is not a conversation
 * message, execution request, approval, or permission decision.
 */

import type { TurnSurfaceContext } from './provider.js';

export const COMPOSER_SUGGESTION_MODES = [
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
] as const;

export type ComposerSuggestionMode = (typeof COMPOSER_SUGGESTION_MODES)[number];
export type ComposerSuggestionOperation = 'replace' | 'append' | 'refine' | 'direction';
export type ComposerSuggestionStatus = 'candidates' | 'ready' | 'no_match';

export interface ComposerSuggestionContextReference {
  readonly source: 'draft' | 'surface' | 'workspace' | 'conversation' | 'documentation';
  readonly label: string;
  readonly detail: string;
}

export interface ComposerSuggestionCandidate {
  readonly id: string;
  readonly kind: ComposerSuggestionMode | 'ready';
  readonly operation: ComposerSuggestionOperation;
  readonly title: string;
  readonly text?: string;
  readonly rationale?: string;
  readonly context: readonly ComposerSuggestionContextReference[];
  readonly references?: readonly { path: string; title: string; reason: string }[];
}

export interface ComposerSuggestionRequest {
  readonly draft: string;
  readonly mode: ComposerSuggestionMode;
  readonly surfaceContext?: TurnSurfaceContext;
  readonly conversationId?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly assistantRuntime?: 'opencode' | 'codex';
}

export interface ComposerSuggestionResponse {
  readonly mode: ComposerSuggestionMode;
  readonly status: ComposerSuggestionStatus;
  readonly candidates: readonly ComposerSuggestionCandidate[];
  readonly message?: string;
}
