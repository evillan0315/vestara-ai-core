/**
 * COMPOSER-SUGGEST-PROBE-20260929-01 — stateless suggestion path contract.
 *
 * Suggestions must never traverse the agent-turn executor (session registry,
 * persona resolution, tools map, permission/question handling, Activity Room
 * mirror). The runtime provider issues schema-constrained inference on an
 * ephemeral session and aborts it in `finally`, so single-use suggest
 * sessions are retention-bounded by construction.
 */

import { describe, expect, it, vi } from 'vitest';
import { OpenCodeRuntimeProvider } from '../src/runtime-provider';

function stubClient(sessionId: string, hooks?: { onPrompt?: (input: unknown) => void }) {
  return {
    listProviders: async () => [{ id: 'test-provider' }],
    createSession: async () => ({ id: sessionId }),
    sendMessage: async (_id: string, input: unknown) => {
      hooks?.onPrompt?.(input);
      return {
        sessionId,
        text: '{"status":"ready","candidates":[]}',
        structuredOutput: { status: 'ready', candidates: [] },
        finished: true,
      };
    },
    sendMessageAsync: async (_id: string, input: unknown) => {
      hooks?.onPrompt?.(input);
    },
    openEventStream: async function* () {
      yield { type: 'session.idle', payload: { sessionID: sessionId } };
    },
    listMessages: async () => [
      {
        role: 'assistant',
        text: '{"status":"ready","candidates":[]}',
        structuredOutput: { status: 'ready', candidates: [] },
      },
    ],
    abortSession: vi.fn(async () => true),
    getHealth: async () => ({ healthy: true }),
  };
}

describe('OpenCodeRuntimeProvider stateless suggestion contract', () => {
  it('uses schema-in-prompt JSON mode for suggestions with no tools key', async () => {
    let prompt: Record<string, unknown> | undefined;
    const client = stubClient('oc-suggest-ephemeral', {
      onPrompt: (input) => {
        prompt = input as Record<string, unknown>;
      },
    });
    const provider = new OpenCodeRuntimeProvider({
      client: client as never,
      workspaceId: 'workspace-1',
      directory: '/repo',
    });
    const response = await provider.complete({
      model: 'deepseek-v4-flash-free',
      messages: [
        { role: 'system', content: 'Return only the requested JSON structure.' },
        { role: 'user', content: 'Mode: suggest\nDraft: verify this' },
      ],
      suggestionOnly: true,
      jsonSchema: {
        type: 'object',
        required: ['status', 'candidates'],
        properties: { status: { type: 'string' }, candidates: { type: 'array' } },
      },
    } as never);

    expect(prompt).not.toHaveProperty('format');
    expect(prompt?.parts?.[0]).toMatchObject({
      text: expect.stringContaining('Return JSON matching this schema exactly:'),
    });
    expect(prompt).not.toHaveProperty('tools');
    expect(response.structuredOutput).toMatchObject({ status: 'ready' });
  });

  it('aborts the ephemeral suggest session (no leak)', async () => {
    const client = stubClient('oc-suggest-abort');
    const provider = new OpenCodeRuntimeProvider({
      client: client as never,
      workspaceId: 'workspace-1',
      directory: '/repo',
    });
    await provider.complete({
      model: 'deepseek-v4-flash-free',
      messages: [{ role: 'user', content: 'Mode: suggest\nDraft: verify this' }],
      suggestionOnly: true,
      jsonSchema: { type: 'object' },
    } as never);
    expect(client.abortSession).toHaveBeenCalledTimes(1);
  });

  it('honors a resolved provider when the model id is bare', async () => {
    let prompt: Record<string, unknown> | undefined;
    const client = stubClient('oc-suggest-provider', {
      onPrompt: (input) => {
        prompt = input as Record<string, unknown>;
      },
    });
    const provider = new OpenCodeRuntimeProvider({
      client: client as never,
      workspaceId: 'workspace-1',
      directory: '/repo',
    });

    await provider.complete({
      model: 'deepseek-v4-flash',
      provider: 'test-provider',
      messages: [{ role: 'user', content: 'Mode: suggest\nDraft: verify this' }],
      suggestionOnly: true,
      jsonSchema: { type: 'object' },
    } as never);

    expect(prompt).toMatchObject({ model: { providerID: 'test-provider', modelID: 'deepseek-v4-flash' } });
  });

  it('uses the configured agent binding when the request delegates to runtime defaults', async () => {
    let prompt: Record<string, unknown> | undefined;
    const client = stubClient('oc-suggest-configured-binding', {
      onPrompt: (input) => {
        prompt = input as Record<string, unknown>;
      },
    });
    const provider = new OpenCodeRuntimeProvider({
      client: client as never,
      workspaceId: 'workspace-1',
      directory: '/repo',
      preferredProviderId: 'test-provider',
      modelId: 'configured-model',
      agent: 'configured-agent',
    });

    await provider.complete({
      model: 'opencode-runtime',
      messages: [{ role: 'user', content: 'Mode: suggest\nDraft: verify this' }],
      suggestionOnly: true,
      jsonSchema: { type: 'object' },
    } as never);

    expect(prompt).toMatchObject({
      agent: 'configured-agent',
      model: { providerID: 'test-provider', modelID: 'configured-model' },
    });
  });
});
