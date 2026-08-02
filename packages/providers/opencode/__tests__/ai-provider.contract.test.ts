import type { AIProvider } from '@vestara/shared';
import { afterEach, describe, expect, it } from 'vitest';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function providerModule(): Promise<typeof import('../src/index.js')> {
  return import('../src/index.js');
}

describe('AIProvider contract', () => {
  it('exposes the complete provider lifecycle and capability contract', async () => {
    const { OpenCodeProvider } = await providerModule();
    const provider: AIProvider = new OpenCodeProvider({ baseUrl: 'https://example.test/v1' });

    expect(provider.id).toBe('opencode');
    expect(provider.name).toBe('OpenCode');
    expect(provider.version).toMatch(/\d+\.\d+\.\d+/);
    expect(provider.status).toBe('uninitialized');
    expect(provider.capabilities.features).toEqual(expect.arrayContaining(['chat', 'streaming', 'function-calling']));
    expect(provider.capabilities.maxConcurrentRequests).toBeGreaterThan(0);
    expect(provider.models.length).toBeGreaterThan(0);
    expect(typeof provider.initialize).toBe('function');
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.stream).toBe('function');
    expect(typeof provider.healthCheck).toBe('function');
    expect(typeof provider.listModels).toBe('function');
  });

  it('initializes from the model endpoint and reports health', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: [{ id: 'deepseek-v4-flash-free' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const { OpenCodeProvider } = await providerModule();
    const provider = new OpenCodeProvider({ baseUrl: 'https://example.test/v1' });

    await provider.initialize({ apiKey: 'secret' });
    expect(provider.status).toBe('available');
    expect((await provider.listModels()).map((model) => model.id)).toEqual(['deepseek-v4-flash-free']);

    const health = await provider.healthCheck();
    expect(health).toMatchObject({ status: 'healthy', providerId: 'opencode', modelCount: 1 });
    expect(health.latency).toBeGreaterThanOrEqual(0);
    expect(health.lastHeartbeat).toEqual(expect.any(String));
  });

  it('completes a request with usage and normalized tool calls', async () => {
    let request: Record<string, unknown> | undefined;
    globalThis.fetch = async (_input, init) => {
      request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          id: 'completion-1',
          model: 'deepseek-v4-flash-free',
          choices: [
            {
              message: {
                content: 'I inspected the workspace.',
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'shell__execute', arguments: '{"command":"pwd"}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const { OpenCodeProvider } = await providerModule();
    const provider = new OpenCodeProvider({ baseUrl: 'https://example.test/v1' });
    const response = await provider.complete({
      model: 'deepseek-v4-flash-free',
      messages: [{ role: 'user', content: 'Inspect the workspace' }],
      maxTokens: 100_000,
      tools: [
        {
          id: 'shell.execute',
          name: 'shell.execute',
          description: 'Run a governed command',
          version: '1.0.0',
          permissions: 'user-confirm',
          requires: ['shell'],
          timeout: 30_000,
          sandbox: true,
          streaming: false,
          idempotent: false,
          destructive: false,
          inputSchema: { type: 'object', properties: { command: { type: 'string' } } },
          outputSchema: { type: 'object' },
          category: 'custom',
        },
      ],
    });

    expect(request).toMatchObject({ model: 'deepseek-v4-flash-free', stream: false, max_tokens: 8_192 });
    expect(response).toMatchObject({ id: 'completion-1', provider: 'opencode', content: 'I inspected the workspace.' });
    expect(response.toolCalls?.[0]).toMatchObject({ id: 'call-1', name: 'shell.execute' });
    expect(response.usage).toEqual({ promptTokens: 12, completionTokens: 8, totalTokens: 20 });
    expect(response.latency).toBeGreaterThanOrEqual(0);
  });

  it('streams text, metadata, completion, and provider errors as normalized chunks', async () => {
    globalThis.fetch = async () =>
      new Response(
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}\n\ndata: [DONE]\n\n',
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        },
      );
    const { OpenCodeProvider } = await providerModule();
    const provider = new OpenCodeProvider({ baseUrl: 'https://example.test/v1' });
    const chunks = [];
    for await (const chunk of provider.stream({
      model: 'deepseek-v4-flash-free',
      messages: [{ role: 'user', content: 'Hello' }],
    }))
      chunks.push(chunk);

    expect(chunks.some((chunk) => chunk.type === 'text' && chunk.content === 'hello')).toBe(true);
    expect(chunks.some((chunk) => chunk.type === 'meta')).toBe(true);
    expect(chunks.some((chunk) => chunk.type === 'complete')).toBe(true);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'Upstream request failed' } }), { status: 400 });
    const errorChunks = [];
    for await (const chunk of provider.stream({
      model: 'deepseek-v4-flash-free',
      messages: [{ role: 'user', content: 'Hello' }],
    }))
      errorChunks.push(chunk);
    expect(errorChunks.some((chunk) => chunk.type === 'error' && chunk.content?.includes('HTTP 400'))).toBe(true);
  });
});
