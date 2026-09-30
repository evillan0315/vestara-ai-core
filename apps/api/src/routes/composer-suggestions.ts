import type * as http from 'node:http';
import type { ComposerSuggestionMode } from '@vestara/shared';
import { COMPOSER_SUGGESTION_MODES } from '@vestara/shared';
import type { WorkspaceContext } from '../workspace-context';
import { normalizeSurfaceContext } from './conversations';
import { json, readBody } from './types';

function parseMode(value: unknown): ComposerSuggestionMode {
  return typeof value === 'string' && (COMPOSER_SUGGESTION_MODES as readonly string[]).includes(value)
    ? (value as ComposerSuggestionMode)
    : 'suggest';
}

/** POST /api/composer/suggestions — unsent, bounded composer guidance. */
export async function handleComposerSuggestionsRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method !== 'POST' || p !== '/api/composer/suggestions') return false;
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const draft = typeof body.draft === 'string' ? body.draft.trim().slice(0, 4_000) : '';
    const requestedProvider = typeof body.provider === 'string' && body.provider ? body.provider : undefined;
    const requestedModel = typeof body.model === 'string' && body.model ? body.model : undefined;
    const binding =
      requestedProvider || requestedModel
        ? await ctx.assistantBindingResolver.resolve({ providerId: requestedProvider, modelId: requestedModel })
        : undefined;
    const result = await ctx.composerSuggestionService.suggest({
      draft,
      mode: parseMode(body.mode),
      surfaceContext: normalizeSurfaceContext(body.surfaceContext),
      conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined,
      provider: binding?.providerID,
      model: binding?.modelID,
      assistantRuntime: body.assistantRuntime === 'codex' ? 'codex' : 'opencode',
    });
    json(res, 200, result);
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Failed to generate composer suggestions' });
  }
  return true;
}
