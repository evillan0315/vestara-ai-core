import { describe, expect, it, vi } from 'vitest';
import { OpenCodeRuntimeProvider } from '../src/runtime-provider.js';

function fakeEventStream(events: Array<{ type: string; payload?: Record<string, unknown> }>) {
  return (async function* stream() {
    for (const event of events) yield event;
  })();
}

function mockClient() {
  const calls: Array<{ method: string; body?: unknown }> = [];
  const client = {
    listProviders: vi.fn(async () => [
      { id: 'opencode-go', name: 'OpenCode Go', modelCount: 3 },
      { id: 'opencode', name: 'OpenCode', modelCount: 5 },
    ]),
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

describe('OpenCodeRuntimeProvider', () => {
  it('discovers providers from the runtime instead of hardcoding them', async () => {
    const { client } = mockClient();
    const provider = new OpenCodeRuntimeProvider({ client: client as never });

    await provider.initialize({});
    const models = await provider.listModels();

    expect(client.listProviders).toHaveBeenCalled();
    expect(models.map((m) => m.id)).toEqual(['opencode-go', 'opencode']);
  });

  it('creates a session without forcing a hardcoded model and returns the streamed reply', async () => {
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

    const createCall = calls.find((c) => c.method === 'createSession');
    expect(createCall).toBeDefined();
    const body = createCall?.body as { model?: { providerID?: string } };
    // Provider is discovered (opencode-go), model id is NOT forced.
    expect(body?.model).toEqual({ providerID: 'opencode-go' });
    expect(client.abortSession).toHaveBeenCalledWith('session-1', expect.anything());
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
    const createCall = calls.find((c) => c.method === 'createSession');
    expect(createCall).toBeDefined();
    expect((createCall.body as { model?: unknown }).model).toBeUndefined();
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
