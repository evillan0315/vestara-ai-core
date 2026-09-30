import type {
  ComposerSuggestionMode,
  ComposerSuggestionRequest,
  ComposerSuggestionResponse,
} from '@vestara/shared';

const SUPPORTED_MODES = new Set<ComposerSuggestionMode>([
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
]);

export interface ParsedComposerSuggestionCommand {
  readonly mode: ComposerSuggestionMode;
  readonly draft: string;
}

/** Recognizes only a trailing command line; ordinary prose remains untouched. */
export function parseComposerSuggestionCommand(value: string): ParsedComposerSuggestionCommand | null {
  const match = value.match(/(?:^|\n)\s*\/suggest(?:\s+([a-z-]+))?\s*$/i);
  if (!match) return null;
  const requested = (match[1] ?? 'suggest').toLowerCase() as ComposerSuggestionMode;
  const mode = SUPPORTED_MODES.has(requested) ? requested : 'suggest';
  const commandStart = match.index ?? value.length;
  return { mode, draft: value.slice(0, commandStart).trimEnd() };
}

export function applyComposerSuggestion(
  draft: string,
  operation: 'replace' | 'append' | 'refine' | 'direction',
  text: string,
): string {
  const candidate = text.trim();
  if (!candidate) return draft;
  if (operation === 'append') return draft.trim() ? `${draft.trim()}\n${candidate}` : candidate;
  if (operation === 'direction' && draft.trim()) return `${draft.trim()}\n${candidate}`;
  return candidate;
}

export async function requestComposerSuggestions(request: ComposerSuggestionRequest): Promise<ComposerSuggestionResponse> {
  const response = await fetch('/api/composer/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<ComposerSuggestionResponse>;
}
