import { OpenCodeIntegrationError } from '@vestara/opencode-runtime';
import { describe, expect, it, vi } from 'vitest';
import { OpenCodeRuntimeProvider } from '../src/runtime-provider.js';

function fakeEventStream(events: Array<{ type: string; payload?: Record<string, unknown> }>) {
  return (async function* stream() {
    for (const event of events) yield event;
  })();
}

function mockClient(providers?: Array<{ id: string; name?: string; modelCount?: number }>) {
  const calls: Array<{ method: string; body?: unknown }> = [];
  const client = {
    listProviders: vi.fn(
      async () =>
        providers ?? [
          { id: 'opencode-go', name: 'OpenCode Go', modelCount: 3 },
          { id: 'opencode', name: 'OpenCode', modelCount: 5 },
        ],
    ),
    getHealth: vi.fn(async () => ({ healthy: true, version: '0.1.0' })),
    createSession: vi.fn(async (input: { title?: string; model?: unknown }) => {
      calls.push({ method: 'createSession', body: input });
      return { id: 'session-1' };
    }),
    sendMessageAsync: vi.fn(async () => {
      calls.push({ method: 'sendMessageAsync' });
    }),
    abortSession: vi.fn(async () => true),
    listMessages: vi.fn(async () => []),
    openEventStream: vi.fn(() =>
      fakeEventStream([
        { type: 'message.part.updated', payload: { sessionID: 'session-1', delta: 'Plan: ' } },
        { type: 'message.part.updated', payload: { sessionID: 'session-1', delta: 'add the endpoint' } },
        { type: 'session.idle', payload: { sessionID: 'session-1' } },
      ]),
    ),
  };
  return { client, calls };
}

function createCallModel(calls: Array<{ method: string; body?: unknown }>): unknown {
  const createCall = calls.find((c) => c.method === 'createSession');
  expect(createCall).toBeDefined();
  return (createCall?.body as { model?: unknown } | undefined)?.model;
}

describe('OpenCodeRuntimeProvider', () => {
  it('discovers providers from the runtime instead of hardcoding them', async () => {
    const { client } = mockClient();
    const provider = new OpenCodeRuntimeProvider({ client: client as never });

    await provider.initialize({});
    const models = await provider.listModels();

    expect(client.listProviders).toHaveBeenCalled();
    expect(models.map((m) => m.id)).toEqual(['opencode-go', 'opencode']);
  });

  it('defaults to the runtime resolution when no explicit provider assignment is given', async () => {
    const { client, calls } = mockClient();
    const provider = new OpenCodeRuntimeProvider({ client: client as never });

    const response = await provider.complete({
      model: 'whatever',
      messages: [
        { role: 'system', content: 'You are a planner.' },
        { role: 'user', content: 'Design the change.' },
      ],
    });

    expect(response.content).toBe('Plan: add the endpoint');
    expect(response.provider).toBe('opencode-runtime');
    // Discovery order must not determine execution identity: the session is
    // created without forcing a provider, so the runtime's configured default
    // governs.
    expect(createCallModel(calls)).toBeUndefined();
    expect(response.resolution).toEqual({
      providerId: undefined,
      reason: 'default',
      defaultResolution: true,
    });
    expect(client.abortSession).toHaveBeenCalledWith('session-1', expect.anything());
  });

  it('is unaffected by provider discovery order', async () => {
    const a = mockClient([{ id: 'opencode' }, { id: 'opencode-go' }]);
    const b = mockClient([{ id: 'opencode-go' }, { id: 'opencode' }]);
    const pa = new OpenCodeRuntimeProvider({ client: a.client as never });
    const pb = new OpenCodeRuntimeProvider({ client: b.client as never });

    const [ra, rb] = await Promise.all([
      pa.complete({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
      pb.complete({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
    ]);

    expect(ra.resolution).toEqual(rb.resolution);
    expect(createCallModel(a.calls)).toBeUndefined();
    expect(createCallModel(b.calls)).toBeUndefined();
    expect(createCallModel(a.calls)).toBe(createCallModel(b.calls));
  });

  it('does not force an unavailable first provider — it falls back to default resolution', async () => {
    // Simulates the observed defect: the first discovered provider (zhipuai)
    // is unusable. Execution must not resolve to it.
    const { client, calls } = mockClient([{ id: 'zhipuai' }, { id: 'deepseek' }]);
    const provider = new OpenCodeRuntimeProvider({ client: client as never });

    await provider.complete({ model: 'x', messages: [{ role: 'user', content: 'hi' }] });

    expect(createCallModel(calls)).toBeUndefined();
    const createCall = calls.find((c) => c.method === 'createSession');
    const model = (createCall?.body as { model?: { providerID?: string } } | undefined)?.model;
    expect(model?.providerID).not.toBe('zhipuai');
  });

  it('uses the preferred provider when explicitly configured and discovered', async () => {
    const { client, calls } = mockClient();
    const provider = new OpenCodeRuntimeProvider({ client: client as never, preferredProviderId: 'opencode' });

    const response = await provider.complete({ model: 'x', messages: [{ role: 'user', content: 'hi' }] });

    expect(createCallModel(calls)).toEqual({ providerID: 'opencode' });
    expect(response.resolution).toEqual({
      providerId: 'opencode',
      reason: 'preferred',
      defaultResolution: false,
    });
  });

  it('falls back to default when the preferred provider is not discovered', async () => {
    const { client, calls } = mockClient();
    const provider = new OpenCodeRuntimeProvider({
      client: client as never,
      preferredProviderId: 'nonexistent-provider',
    });

    const response = await provider.complete({ model: 'x', messages: [{ role: 'user', content: 'hi' }] });

    expect(createCallModel(calls)).toBeUndefined();
    expect(response.resolution).toEqual({
      providerId: undefined,
      reason: 'preferred-unavailable',
      defaultResolution: true,
    });
  });

  it('resolves an explicit slash-qualified model provider when discovered', async () => {
    const { client, calls } = mockClient();
    const provider = new OpenCodeRuntimeProvider({ client: client as never });

    const response = await provider.complete({
      model: 'opencode/deepseek-v4-flash-free',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(createCallModel(calls)).toEqual({ providerID: 'opencode' });
    expect(response.resolution).toEqual({
      providerId: 'opencode',
      reason: 'explicit-model',
      defaultResolution: false,
    });
  });

  it('falls back to default when the explicit model provider is not discovered', async () => {
    const { client, calls } = mockClient();
    const provider = new OpenCodeRuntimeProvider({ client: client as never });

    const response = await provider.complete({
      model: 'opencode-runtime/some-model',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(createCallModel(calls)).toBeUndefined();
    expect(response.resolution).toEqual({
      providerId: undefined,
      reason: 'explicit-unresolvable',
      defaultResolution: true,
    });
  });

  it('omits the model entirely when no provider is discovered', async () => {
    const { client, calls } = mockClient();
    client.listProviders.mockResolvedValueOnce([]);
    const provider = new OpenCodeRuntimeProvider({ client: client as never });

    const response = await provider.complete({
      model: 'whatever',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(response.content).toBe('Plan: add the endpoint');
    expect(createCallModel(calls)).toBeUndefined();
    expect(response.resolution?.reason).toBe('default');
  });

  it('propagates typed upstream errors so the harness classifies the outcome', async () => {
    const { client } = mockClient();
    client.createSession.mockRejectedValueOnce(
      new OpenCodeIntegrationError('OPENCODE_UPSTREAM_ERROR', 'OpenCode returned an unexpected error.', 502, true),
    );
    const provider = new OpenCodeRuntimeProvider({ client: client as never });

    await expect(provider.complete({ model: 'x', messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
      code: 'OPENCODE_UPSTREAM_ERROR',
      retryable: true,
    });
  });

  it('passes the configured runtime agent to the created session', async () => {
    const { client, calls } = mockClient();
    const provider = new OpenCodeRuntimeProvider({ client: client as never, agent: 'planner' });

    await provider.complete({ model: 'x', messages: [{ role: 'user', content: 'plan' }] });

    const createCall = calls.find((c) => c.method === 'createSession');
    expect(createCall).toBeDefined();
    expect((createCall.body as { agent?: string }).agent).toBe('planner');
  });

  it('reports an unhealthy status when the runtime is unreachable', async () => {
    const { client } = mockClient();
    client.getHealth.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const provider = new OpenCodeRuntimeProvider({ client: client as never });

    const health = await provider.healthCheck();
    expect(health.status).toBe('unhealthy');
    expect(provider.status).toBe('unavailable');
  });

  it('constructs without crashing and degrades when the integration env is missing', async () => {
    const previous = process.env.OPENCODE_SERVER_PASSWORD;
    delete process.env.OPENCODE_SERVER_PASSWORD;
    try {
      // Must not throw at construction (the API builds this provider at startup).
      const provider = new OpenCodeRuntimeProvider();
      expect(provider.name).toBe('OpenCode Runtime');
      const health = await provider.healthCheck();
      expect(health.status).toBe('unhealthy');
      // complete rejects with the config error; the harness maps that to a
      // controlled provider-failed outcome — never a crash.
      await expect(provider.complete({ model: 'x', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
        /OPENCODE_SERVER_PASSWORD/,
      );
    } finally {
      if (previous === undefined) delete process.env.OPENCODE_SERVER_PASSWORD;
      else process.env.OPENCODE_SERVER_PASSWORD = previous;
    }
  });
});
