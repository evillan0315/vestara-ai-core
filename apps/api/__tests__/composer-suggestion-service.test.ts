import type { CompletionRequest, CompletionResponse, StreamChunk } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import { ComposerSuggestionService } from '../src/composer-suggestion-service';

function executor(output: unknown, capture?: (request: CompletionRequest) => void) {
  return {
    complete: async (request: CompletionRequest): Promise<CompletionResponse> => {
      capture?.(request);
      return {
        id: 'suggestion-test',
        provider: 'test',
        content: '',
        structuredOutput: output,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latency: 1,
      };
    },
    stream: async function* (): AsyncIterable<StreamChunk> {},
  };
}

describe('ComposerSuggestionService', () => {
  it('short-circuits an empty draft without invoking the provider', async () => {
    let called = false;
    const service = new ComposerSuggestionService(
      executor({ status: 'ready', candidates: [] }, () => {
        called = true;
      }),
      '/home/user/projects/vestara-ai-core',
    );

    const result = await service.suggest({ draft: '  ', mode: 'suggest' });

    expect(result).toMatchObject({ status: 'no_match', candidates: [] });
    expect(called).toBe(false);
  });

  it('short-circuits an unavailable suggestion transport without invoking it', async () => {
    let called = false;
    const service = new ComposerSuggestionService(
      {
        suggestionTransportAvailable: false,
        complete: async () => {
          called = true;
          throw new Error('must not execute');
        },
        stream: async function* (): AsyncIterable<StreamChunk> {},
      },
      '/home/user/projects/vestara-ai-core',
    );

    const result = await service.suggest({ draft: 'verify this', mode: 'suggest' });

    expect(result).toMatchObject({ status: 'no_match', candidates: [] });
    expect(result.message).toContain('transport is offline');
    expect(called).toBe(false);
  });

  it('emits correlated provider and structured-output telemetry', async () => {
    const logs: Array<{ message: string; context?: Record<string, unknown> }> = [];
    let request: CompletionRequest | undefined;
    const service = new ComposerSuggestionService(
      executor({ status: 'ready', candidates: [] }, (next) => {
        request = next;
      }),
      '/home/user/projects/vestara-ai-core',
      undefined,
      {
        info: (message, context) => logs.push({ message, context }),
        error: (message, context) => logs.push({ message, context }),
      },
    );

    await service.suggest({ draft: 'verify this', mode: 'suggest' });

    expect(request?.model).toBe('opencode-runtime');
    expect(request?.suggestionOnly).toBe(true);
    expect(request?.suggestionRequestId).toBe('no-request');
    expect(logs.map((entry) => entry.message)).toEqual([
      'composer.suggestion.started',
      'composer.suggestion.completed',
    ]);
    expect(logs[1]?.context).toMatchObject({
      requestId: 'no-request',
      structuredOutputSource: 'provider',
      resultStatus: 'ready',
      activityRoomMirroring: 'suppressed',
    });
  });

  it('uses bounded draft, surface, and recent conversation context and validates candidates', async () => {
    let request: CompletionRequest | undefined;
    const service = new ComposerSuggestionService(
      executor(
        {
          status: 'candidates',
          candidates: [
            { kind: 'clarify', operation: 'refine', title: 'Clarify the target', text: 'Clarify the current panel.' },
            { kind: 'implement', operation: 'execute', title: 'Ignored invalid candidate' },
          ],
        },
        (next) => {
          request = next;
        },
      ),
      '/home/user/projects/vestara-ai-core',
      async () => ({ messages: [{ role: 'user', content: 'contextual documentation' }] }),
    );
    const result = await service.suggest({
      draft: 'I want documentation here',
      mode: 'suggest',
      conversationId: 'conversation-1',
      surfaceContext: {
        workspace: { id: 'ws-1', name: 'vestara-ai-core' },
        surface: {
          routeId: '/settings/runtime',
          path: '/settings/runtime',
          title: 'Settings · Runtime · Codex',
          section: 'Settings',
        },
      },
    });

    expect(result.status).toBe('candidates');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.context.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Current draft', 'Current route', 'Current surface', 'Workspace', 'Conversation']),
    );
    expect(request?.jsonSchema).toBeDefined();
    expect(request?.messages[1]?.content).toContain('Settings · Runtime · Codex');
  });

  it('returns no-match for docs when repository-backed search has no result', async () => {
    const service = new ComposerSuggestionService(
      executor({ status: 'ready', candidates: [] }),
      '/home/user/projects/vestara-ai-core',
    );
    const result = await service.suggest({ mode: 'docs', draft: 'qzxvnotfoundterm' });
    expect(result.status).toBe('no_match');
    expect(result.candidates).toEqual([]);
  });

  it('does not invoke a provider for docs results and returns real references', async () => {
    let called = false;
    const service = new ComposerSuggestionService(
      executor({ status: 'ready', candidates: [] }, () => {
        called = true;
      }),
      '/home/user/projects/vestara-ai-core',
    );
    const result = await service.suggest({ mode: 'docs', draft: 'assistant runtime context' });
    expect(called).toBe(false);
    expect(result.candidates.every((candidate) => candidate.references?.every((reference) => reference.path))).toBe(
      true,
    );
  });
});
